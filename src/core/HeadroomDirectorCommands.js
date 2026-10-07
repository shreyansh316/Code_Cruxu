import * as vscode from 'vscode';
import { basename } from 'path';
import { randomUUID } from 'node:crypto';
import { AgentRole } from '../constants';
import { isAgentAvailable } from '../domain';
import { AgentRepository, AuditLogRepository, DepartmentRepository, DirectorQuestionRepository, ObjectiveRepository, OfficeRepository,
    OrganizationRepository, ProjectRepository, TaskDependencyRepository, TaskRepository } from '../storage';
import { SqliteEventBus, createSqliteUnitOfWork } from '../infrastructure';
import { createDirectorObjectiveAnalysis } from '../application/directorAnalysis';
import { createDirectorPlanProposal } from '../application/directorPlanProposal';
import { createObjectiveQuestionWorkflow } from '../application/objectiveQuestions';
import { createTaskCreationUseCase } from '../application/taskCreation';
import { createCodeExplanationUseCase } from '../application/codeExplanation';
import { createEngineeringReviewUseCase } from '../application/engineeringReview';
import { directorProviderMissing, directorRequestBlock } from './directorRequestFlow';
import { chooseCodeExplanationAction } from './CodeExplanationCommands';
import { getMessage } from './messages';
import { redactSecrets } from '../shared/redactSecrets';

/** Director request flows, extracted from HeadroomContext (phase 463): objective
 * analysis, plan proposal, approved-plan task creation, and editor selection
 * explanation/review. Each function receives its dependencies explicitly and owns
 * one cohesive flow; the context keeps registration, request-controller ownership
 * (beginRequest/endRequest), provider wiring (createProvider), and refreshes. */

async function pickObjectiveForOrganization({ database } = {}) {
    const organizations = new OrganizationRepository(database).list()
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    if (!organizations.length) {
        vscode.window.showInformationMessage(getMessage('objective.organization.missing'));
        return undefined;
    }
    let organization = organizations[0];
    if (organizations.length > 1) {
        const selectedOrganization = await vscode.window.showQuickPick(organizations.map((entry) => ({
            label: entry.name, description: entry.id, organization: entry,
        })), { title: getMessage('objective.organization.pick'), ignoreFocusOut: true });
        organization = selectedOrganization?.organization;
    }
    if (!organization) return undefined;
    const objectiveRepository = new ObjectiveRepository(database);
    const objectives = [...objectiveRepository.listByOrganization(organization.id), ...objectiveRepository.listUnassigned()]
        .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)).slice(0, 1000);
    if (!objectives.length) {
        vscode.window.showInformationMessage(getMessage('director.analysis.noObjectives'));
        return undefined;
    }
    const selected = await vscode.window.showQuickPick(objectives.map((objective) => ({
        label: objective.title.slice(0, 200),
        description: objective.organizationId ? objective.status : `Unassigned · ${objective.status}`,
        objectiveId: objective.id, requiresOrganizationAssignment: !objective.organizationId,
    })), { title: getMessage('director.analysis.pickObjective'), ignoreFocusOut: true });
    if (!selected) return undefined;
    return { selected, organization };
}

export async function analyzeObjective({ configuration, executionControl, createProvider, beginRequest,
    endRequest, refresh, ...rest } = {}) {
    const blocked = directorRequestBlock(executionControl.status);
    if (blocked) {
        vscode.window.showInformationMessage(getMessage(blocked));
        return;
    }
    if (directorProviderMissing(configuration)) {
        vscode.window.showInformationMessage(getMessage('director.analysis.providerRequired'));
        return;
    }
    const database = rest.database;
    const objectiveRepository = new ObjectiveRepository(database);
    const picked = await pickObjectiveForOrganization({ database });
    if (!picked) return;
    const { selected: selectedObjective, organization } = picked;
    const confirmation = await vscode.window.showWarningMessage(
        getMessage('director.analysis.confirmSend'), { modal: true }, getMessage('director.analysis.confirm'));
    if (confirmation !== getMessage('director.analysis.confirm')) return;
    if (selectedObjective.requiresOrganizationAssignment) {
        objectiveRepository.update(selectedObjective.objectiveId, { organizationId: organization.id });
    }

    const analysis = createDirectorObjectiveAnalysis({
        objectiveRepository,
        questionRepository: new DirectorQuestionRepository(database),
        provider: createProvider('director-objective-analysis'),
        idFactory: () => randomUUID(),
    });
    const controller = beginRequest();
    if (!controller) return;
    let result;
    try {
        result = await analysis.run({ objectiveId: selectedObjective.objectiveId,
            model: configuration.reasoningModel, signal: controller.signal });
    } finally {
        endRequest(controller);
    }
    if (controller.signal.aborted) {
        vscode.window.showInformationMessage(getMessage('director.request.cancelled'));
        return;
    }
    if (!result.ok) {
        vscode.window.showErrorMessage(getMessage('director.analysis.failed', { error: result.error.message }));
        return;
    }
    if (!result.value.questions.length) {
        vscode.window.showInformationMessage(getMessage('director.analysis.noQuestions'));
        return;
    }
    const selected = await vscode.window.showQuickPick(result.value.questions.map((proposal) => ({
        label: proposal.question,
        description: `${proposal.category} · ${proposal.rationale}`,
        proposal,
    })), { title: getMessage('director.analysis.pickProposals'), canPickMany: true, ignoreFocusOut: true });
    if (!selected?.length) return;

    const questionRepository = new DirectorQuestionRepository(database);
    const eventBus = new SqliteEventBus(database);
    const auditRepository = new AuditLogRepository(database);
    const workflow = createObjectiveQuestionWorkflow({ questionRepository, objectiveRepository,
        idFactory: () => randomUUID(),
        eventPublisher: { append: (event) => {
            eventBus.append(event);
            return auditRepository.append({ id: event.eventId, action: event.type,
                entity: 'objective', entityId: event.aggregateId, details: { occurredAt: event.occurredAt, ...event.payload } });
        } }, unitOfWork: createSqliteUnitOfWork(database), clock: { now: () => new Date() } });
    let saved = 0;
    for (const item of selected) {
        const created = await workflow.create.run({ objectiveId: selectedObjective.objectiveId,
            question: item.proposal.question, category: item.proposal.category });
        if (created.ok) saved += 1;
    }
    refresh();
    vscode.window.showInformationMessage(saved === selected.length
        ? getMessage('director.analysis.saved', { count: saved })
        : getMessage('director.analysis.savePartial', { saved, failed: selected.length - saved }));
}

export async function explainSelection({ configuration, createProvider, beginRequest, endRequest } = {}) {
    const editor = vscode.window.activeTextEditor;
    const selection = editor?.selection;
    const selectedCode = selection ? editor.document.getText(selection) : '';
    if (!selectedCode.trim()) {
        vscode.window.showInformationMessage('Select code first, then run HEADROOM: Explain Selected Code.');
        return;
    }
    if (directorProviderMissing(configuration)) {
        vscode.window.showInformationMessage(getMessage('director.analysis.providerRequired'));
        return;
    }
    const action = await chooseCodeExplanationAction();
    if (!action) return;
    const fileName = redactSecrets(basename(editor.document.fileName ?? 'selected code'), 160);
    const sentCharacters = Math.min(selectedCode.length, 8000);
    const confirmation = await vscode.window.showWarningMessage(
        `Send up to ${sentCharacters} selected characters from ${fileName} to the configured AI provider for “${action}”? Common credential patterns are redacted first.`,
        { modal: true }, 'Send selection');
    if (confirmation !== 'Send selection') return;

    const controller = beginRequest();
    if (!controller) return;
    const useCase = createCodeExplanationUseCase({
        provider: createProvider('code-explanation'),
        idFactory: () => randomUUID(),
    });
    let result;
    try {
        result = await useCase.run({ action, selected: fileName,
            context: { selectedCode: selectedCode.slice(0, 8000) },
            evidence: [{ id: 'active-selection', type: 'source', label: `${fileName} selected code` }],
            model: configuration.reasoningModel, signal: controller.signal });
    }
    finally {
        endRequest(controller);
    }
    if (controller.signal.aborted) {
        vscode.window.showInformationMessage(getMessage('director.request.cancelled'));
        return;
    }
    if (!result.ok) {
        vscode.window.showErrorMessage(`Code explanation failed: ${result.error.message}`);
        return;
    }
    const document = await vscode.workspace.openTextDocument({ language: 'json',
        content: JSON.stringify(result.value.explanation, null, 2) });
    await vscode.window.showTextDocument(document, { preview: false });
}

export async function reviewSelection({ configuration, createProvider, beginRequest, endRequest }, area = 'FULL') {
    const editor = vscode.window.activeTextEditor;
    const selection = editor?.selection;
    const selectedCode = selection ? editor.document.getText(selection) : '';
    if (!selectedCode.trim()) {
        vscode.window.showInformationMessage('Select code first, then run HEADROOM: Review Selected Code.');
        return;
    }
    if (directorProviderMissing(configuration)) {
        vscode.window.showInformationMessage(getMessage('director.analysis.providerRequired'));
        return;
    }
    const fileName = redactSecrets(basename(editor.document.fileName ?? 'selected code'), 160);
    const sentCharacters = Math.min(selectedCode.length, 8000);
    const startLine = (Number.isInteger(selection.start?.line) ? selection.start.line : 0) + 1;
    const endLine = (Number.isInteger(selection.end?.line) ? selection.end.line : startLine - 1) + 1;
    const confirmation = await vscode.window.showWarningMessage(
        `Send up to ${sentCharacters} selected characters from ${fileName} to the configured AI provider for an evidence-backed engineering review? Common credential patterns are redacted first.`,
        { modal: true }, 'Send selection');
    if (confirmation !== 'Send selection') return;

    const controller = beginRequest();
    if (!controller) return;
    const useCase = createEngineeringReviewUseCase({
        provider: createProvider('engineering-review'),
        idFactory: () => randomUUID(),
    });
    let result;
    try {
        result = await useCase.run({ area, selected: fileName, context: { selectedCode: selectedCode.slice(0, 8000) },
            evidence: [{ id: 'active-selection', type: 'source', label: `${fileName}:${startLine}-${endLine}`,
                excerpt: selectedCode.slice(0, 8000) }],
            model: configuration.reasoningModel, signal: controller.signal });
    }
    finally {
        endRequest(controller);
    }
    if (controller.signal.aborted) {
        vscode.window.showInformationMessage(getMessage('director.request.cancelled'));
        return;
    }
    if (!result.ok) {
        vscode.window.showErrorMessage(`Engineering review failed: ${result.error.message}`);
        return;
    }
    const document = await vscode.workspace.openTextDocument({ language: 'json', content: JSON.stringify(result.value.review, null, 2) });
    await vscode.window.showTextDocument(document, { preview: false });
}

export async function proposePlan({ configuration, executionControl, createProvider, beginRequest,
    endRequest, refresh, reviewPlan, ...rest } = {}) {
    const blocked = directorRequestBlock(executionControl.status);
    if (blocked) {
        vscode.window.showInformationMessage(getMessage(blocked));
        return;
    }
    if (directorProviderMissing(configuration)) {
        vscode.window.showInformationMessage(getMessage('director.analysis.providerRequired'));
        return;
    }
    const database = rest.database;
    const objectiveRepository = new ObjectiveRepository(database);
    const picked = await pickObjectiveForOrganization({ database });
    if (!picked) return;
    const { selected: selectedObjective, organization } = picked;
    const questionRepository = new DirectorQuestionRepository(database);
    if (questionRepository.listByObjective(selectedObjective.objectiveId).some(({ status }) => status === 'PENDING')) {
        vscode.window.showInformationMessage(getMessage('director.plan.questionsPending'));
        return;
    }
    const confirmation = await vscode.window.showWarningMessage(
        getMessage('director.plan.confirmSend'), { modal: true }, getMessage('director.plan.confirm'));
    if (confirmation !== getMessage('director.plan.confirm')) return;
    if (selectedObjective.requiresOrganizationAssignment) {
        objectiveRepository.update(selectedObjective.objectiveId, { organizationId: organization.id });
    }
    const proposal = createDirectorPlanProposal({ objectiveRepository, questionRepository,
        provider: createProvider('director-plan-proposal'), idFactory: () => randomUUID() });
    const controller = beginRequest();
    if (!controller) return;
    let result;
    try {
        result = await proposal.run({ objectiveId: selectedObjective.objectiveId,
            model: configuration.reasoningModel, signal: controller.signal });
    } finally {
        endRequest(controller);
    }
    if (controller.signal.aborted) {
        vscode.window.showInformationMessage(getMessage('director.request.cancelled'));
        return;
    }
    if (!result.ok) {
        vscode.window.showErrorMessage(getMessage('director.plan.failed', { error: result.error.message }));
        return;
    }
    // A proposal is shown as JSON and explicitly approved or rejected by the CEO.
    const decidedPlan = await reviewPlan(result.value);
    if (decidedPlan?.approval?.decision === 'APPROVED') {
        await createApprovedPlanTasks(decidedPlan, { database, configuration, refresh });
    }
}

async function createApprovedPlanTasks(plan, { database, configuration, refresh } = {}) {
    const objectiveRepository = new ObjectiveRepository(database);
    const objective = objectiveRepository.getById(plan.objectiveId);
    if (!objective) {
        vscode.window.showErrorMessage(getMessage('plan.tasks.objectiveMissing'));
        return;
    }
    const organizationRepository = new OrganizationRepository(database);
    const organizations = organizationRepository.list().sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    let organization = objective.organizationId ? organizationRepository.getById(objective.organizationId) : undefined;
    if (!organization && !objective.organizationId && organizations.length === 1) organization = organizations[0];
    if (!organization && !objective.organizationId && organizations.length > 1) {
        const selected = await vscode.window.showQuickPick(organizations.map((entry) => ({ label: entry.name, organization: entry })),
            { title: getMessage('plan.tasks.pickOrganization'), ignoreFocusOut: true });
        organization = selected?.organization;
    }
    if (!organization) {
        vscode.window.showErrorMessage(getMessage('plan.tasks.organizationMissing'));
        return;
    }

    const officeRepository = new OfficeRepository(database);
    const departmentRepository = new DepartmentRepository(database);
    const officeIds = new Set(officeRepository.listByOrganization(organization.id)
        .filter((office) => office.status === 'ACTIVE').map((office) => office.id));
    const offices = officeRepository.listByOrganization(organization.id).filter((office) => officeIds.has(office.id));
    const departments = offices.flatMap((office) => departmentRepository.listByOffice(office.id)
        .filter((department) => department.status === 'ACTIVE'));
    const departmentIds = new Set(departments.map((department) => department.id));
    const allAgents = new AgentRepository(database).listByOrganization(organization.id);
    const hierarchyAgents = allAgents.filter((agent) =>
        ((agent.role === AgentRole.CEO || agent.role === AgentRole.DIRECTOR) && agent.organizationId === organization.id)
        || (agent.role === AgentRole.HEAD_MANAGER && officeIds.has(agent.managedOfficeId))
        || (agent.role === AgentRole.DEPT_MANAGER && departmentIds.has(agent.managedDepartmentId))
        || (agent.role === AgentRole.EMPLOYEE && departmentIds.has(agent.departmentId)));
    const directors = hierarchyAgents.filter((agent) => agent.role === AgentRole.DIRECTOR && isAgentAvailable(agent));
    if (directors.length !== 1) {
        vscode.window.showErrorMessage(getMessage('plan.tasks.directorUnavailable'));
        return;
    }
    const managerByOffice = new Map(hierarchyAgents.filter((agent) =>
        agent.role === AgentRole.HEAD_MANAGER && isAgentAvailable(agent)).map((agent) => [agent.managedOfficeId, agent]));
    const routes = offices.flatMap((office) => {
        const head = managerByOffice.get(office.id);
        return head ? plan.tasks.map((task) => ({
            label: `${task.taskCode} · ${task.title.slice(0, 120)}`,
            description: `${office.name} · ${head.name}`,
            taskId: task.id, creatorId: directors[0].id, assigneeId: head.id,
        })) : [];
    }).slice(0, 8_000);
    if (!routes.length) {
        vscode.window.showErrorMessage(getMessage('plan.tasks.noOfficeHeads'));
        return;
    }
    const selectedRoutes = await vscode.window.showQuickPick(routes,
        { title: getMessage('plan.tasks.assign'), canPickMany: true, ignoreFocusOut: true });
    if (!selectedRoutes) return;
    const routesByTask = new Map();
    for (const route of selectedRoutes) {
        if (routesByTask.has(route.taskId)) {
            vscode.window.showErrorMessage(getMessage('plan.tasks.assignmentInvalid'));
            return;
        }
        routesByTask.set(route.taskId, route);
    }
    if (routesByTask.size !== plan.tasks.length || plan.tasks.some((task) => !routesByTask.has(task.id))) {
        vscode.window.showErrorMessage(getMessage('plan.tasks.assignmentRequired', { count: plan.tasks.length }));
        return;
    }
    const confirmation = await vscode.window.showWarningMessage(getMessage('plan.tasks.confirm', { count: plan.tasks.length }),
        { modal: true }, getMessage('plan.tasks.create'));
    if (confirmation !== getMessage('plan.tasks.create')) return;

    // Legacy objectives may not have an organization owner. Persist the explicit
    // routing choice so future Director actions stay within the same tenant.
    const currentObjective = objectiveRepository.getById(objective.id);
    if (!currentObjective || (currentObjective.organizationId && currentObjective.organizationId !== organization.id)) {
        vscode.window.showErrorMessage(getMessage('plan.tasks.organizationMissing'));
        return;
    }
    if (!currentObjective.organizationId) {
        const scopedObjective = objectiveRepository.update(objective.id, { organizationId: organization.id });
        if (!scopedObjective || scopedObjective.organizationId !== organization.id) {
            vscode.window.showErrorMessage(getMessage('plan.tasks.organizationMissing'));
            return;
        }
    }

    const hierarchy = { organization, offices, departments, agents: hierarchyAgents };
    const eventBus = new SqliteEventBus(database);
    const useCase = createTaskCreationUseCase({ objectiveRepository,
        projectRepository: new ProjectRepository(database), taskRepository: new TaskRepository(database),
        dependencyRepository: new TaskDependencyRepository(database), hierarchyProvider: { getSnapshot: () => hierarchy },
        auditRepository: new AuditLogRepository(database), eventPublisher: eventBus,
        unitOfWork: createSqliteUnitOfWork(database), clock: { now: () => new Date() }, idFactory: () => randomUUID() });
    const created = await useCase.run({ plan, maxRetries: configuration.maxRetries,
        assignments: plan.tasks.map((task) => {
            const route = routesByTask.get(task.id);
            return { taskId: task.id, creatorId: route.creatorId, assigneeId: route.assigneeId };
        }) });
    if (!created.ok) {
        vscode.window.showErrorMessage(getMessage('plan.tasks.failed', { error: created.error.message }));
        return;
    }
    refresh();
    vscode.window.showInformationMessage(getMessage('plan.tasks.created', { count: created.value.tasks.length }));
}
