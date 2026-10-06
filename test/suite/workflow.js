const assert = require('assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

async function runWorkflow(api) {
    const temporaryRoot = process.env.HEADROOM_WORKFLOW_TEMP_ROOT || os.tmpdir();
    await fs.mkdir(temporaryRoot, { recursive: true });
    const temporaryDirectory = await fs.mkdtemp(path.join(temporaryRoot, 'headroom-workflow-'));
    const workspaceRoot = path.join(temporaryDirectory, 'workspace');
    let connection;
    let database;
    try {
        await fs.mkdir(path.join(workspaceRoot, 'src'), { recursive: true });
        connection = new api.SqliteConnection();
        const git = (args) => execFileSync('git', args, { cwd: workspaceRoot, stdio: 'pipe', windowsHide: true });
        git(['init', '--quiet']);
        git(['config', 'user.email', 'headroom-test@example.invalid']);
        git(['config', 'user.name', 'HEADROOM Extension Host Test']);
        await fs.writeFile(path.join(workspaceRoot, 'README.md'), 'Disposable workflow fixture.\n');
        git(['add', 'README.md']);
        git(['commit', '--quiet', '-m', 'fixture baseline']);

        database = connection.open(path.join(temporaryDirectory, 'headroom.sqlite'));
        api.applyMigrations(database);
        const organization = new api.OrganizationRepository(database);
        organization.create({ id: 'e2e-org', name: 'HEADROOM' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('e2e-office', 'e2e-org', 'Engineering', 'engineering');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('e2e-dept', 'e2e-office', 'Platform', 'platform');
        const agents = new api.AgentRepository(database);
        agents.create({ id: 'e2e-ceo', organizationId: 'e2e-org', name: 'CEO', role: api.AgentRole.CEO });
        agents.create({ id: 'e2e-director', name: 'Director', role: api.AgentRole.DIRECTOR });
        agents.create({ id: 'e2e-head', name: 'Office Head', role: api.AgentRole.HEAD_MANAGER, managedOfficeId: 'e2e-office' });
        agents.create({ id: 'e2e-manager', name: 'Department Manager', role: api.AgentRole.DEPT_MANAGER, managedDepartmentId: 'e2e-dept' });
        agents.create({ id: 'e2e-employee', name: 'Employee', role: api.AgentRole.EMPLOYEE, departmentId: 'e2e-dept' });

        const hierarchyProvider = { getSnapshot: () => ({
            organization: { id: 'e2e-org', name: 'HEADROOM' },
            offices: [{ id: 'e2e-office', organizationId: 'e2e-org', name: 'Engineering', slug: 'engineering', status: 'ACTIVE' }],
            departments: [{ id: 'e2e-dept', officeId: 'e2e-office', name: 'Platform', slug: 'platform', status: 'ACTIVE' }],
            agents: agents.list(),
        }) };
        const objectiveRepository = new api.ObjectiveRepository(database);
        const projectRepository = new api.ProjectRepository(database);
        const taskRepository = new api.TaskRepository(database);
        const dependencyRepository = new api.TaskDependencyRepository(database);
        const queueRepository = new api.ExecutionQueueRepository(database);
        const auditRepository = new api.AuditLogRepository(database);
        const eventPublisher = new api.SqliteEventBus(database);
        const unitOfWork = api.createSqliteUnitOfWork(database);
        const usageRepository = new api.AIUsageRepository(database);
        let id = 0;
        const idFactory = () => `e2e-generated-${++id}`;
        const clock = { now: () => new Date().toISOString() };

        const intake = api.createObjectiveIntakeUseCase({ objectiveRepository, organizationRepository: organization,
            agentRepository: agents, idFactory });
        const objectiveOutcome = await intake.run({ title: 'Deliver a verified file',
            ceoId: 'e2e-ceo',
            organizationId: 'e2e-org',
            description: 'Create a workspace file and prove its contents with an authorized verification command.' });
        assert.equal(objectiveOutcome.ok, true, errorText(objectiveOutcome));
        const objective = objectiveOutcome.value;
        const questionRepository = new api.DirectorQuestionRepository(database);
        api.assertObjectiveTransition(objective.status, api.ObjectiveStatus.ANALYZING);
        objectiveRepository.update(objective.id, { status: api.ObjectiveStatus.ANALYZING });
        const analysis = api.createDirectorObjectiveAnalysis({ objectiveRepository, questionRepository, idFactory,
            provider: { generate: async () => ({ finishReason: 'STOP', output: { questions: [] } }) } });
        const analysisOutcome = await analysis.run({ objectiveId: objective.id });
        assert.equal(analysisOutcome.ok, true, errorText(analysisOutcome));
        assert.deepEqual(analysisOutcome.value.questions, []);
        api.assertObjectiveTransition(api.ObjectiveStatus.ANALYZING, api.ObjectiveStatus.PLANNING);
        objectiveRepository.update(objective.id, { status: api.ObjectiveStatus.PLANNING });

        const directorProposal = api.createDirectorPlanProposal({ objectiveRepository, questionRepository,
            idFactory, provider: { generate: async () => ({ finishReason: 'STOP', output: {
                projects: [{ name: 'Verified delivery' }], milestones: [{ projectIndex: 0, title: 'Implementation' }],
                tasks: [{ projectIndex: 0, milestoneIndex: 0, title: 'Write deliverable',
                    acceptanceCriteria: ['src/deliverable.txt contains the agreed text'] }], dependencies: [],
            } }) } });
        const proposalOutcome = await directorProposal.run({ objectiveId: objective.id });
        assert.equal(proposalOutcome.ok, true, errorText(proposalOutcome));
        const persistedDecision = api.createPersistedPlanDecision({ agentRepository: agents, auditRepository,
            unitOfWork, clock, idFactory });
        const decisionOutcome = await persistedDecision.run({ plan: proposalOutcome.value,
            approverId: 'e2e-ceo', decision: 'APPROVED' });
        assert.equal(decisionOutcome.ok, true, errorText(decisionOutcome));
        const approvedPlan = decisionOutcome.value;

        const router = api.createHierarchyMessageRouter({ hierarchyProvider });
        const routeAndPersist = async (senderId, recipientId) => {
            const routed = await router.run({ senderId, recipientId, message: `Approved objective ${objective.id}` });
            assert.equal(routed.ok, true, errorText(routed));
            auditRepository.append({ id: idFactory(), action: 'HIERARCHY_MESSAGE_ROUTED', entity: 'objective',
                entityId: objective.id, actorId: senderId, details: { recipientId, senderRole: routed.value.senderRole,
                    recipientRole: routed.value.recipientRole } });
        };
        await routeAndPersist('e2e-ceo', 'e2e-director');
        await routeAndPersist('e2e-director', 'e2e-head');

        const officeRouting = api.createOfficeHeadRouting({ agentRepository: agents, hierarchyProvider });
        const directorDelegation = api.createDirectorOfficeOrchestration({ agentRepository: agents,
            hierarchyProvider, officeHeadRouting: officeRouting });
        const routeOutcome = await directorDelegation.run({ directorId: 'e2e-director', officePlans: [{
            plan: approvedPlan, officeId: 'e2e-office', headManagerId: 'e2e-head',
            routes: approvedPlan.tasks.map((task) => ({ taskId: task.id, departmentId: 'e2e-dept' })),
        }] });
        assert.equal(routeOutcome.ok, true, errorText(routeOutcome));
        const routedDepartment = routeOutcome.value.offices[0].package.departments[0];
        await routeAndPersist('e2e-head', routedDepartment.departmentManagerId);

        const decomposition = api.createDepartmentTaskDecomposition({ agentRepository: agents, hierarchyProvider,
            idFactory, provider: { generate: async () => ({ finishReason: 'STOP', output: { dependencies: [], subtasks: [
                { parentTaskIndex: 0, employeeIndex: 0, title: 'Write and verify file',
                    description: 'Use task-scoped tools to create the requested file.',
                    acceptanceCriteria: ['The verification command confirms exact file contents'] },
            ] } }) } });
        const decompositionOutcome = await decomposition.run({ departmentManagerId: routedDepartment.departmentManagerId,
            departmentPacket: { ...routedDepartment, tasks: routedDepartment.tasks.map((task) => ({
                ...task, acceptanceCriteria: task.acceptanceCriteria.map(({ description }) => description),
            })) } });
        assert.equal(decompositionOutcome.ok, true, errorText(decompositionOutcome));
        const employeeId = decompositionOutcome.value.subtasks[0].assigneeId;
        await routeAndPersist(routedDepartment.departmentManagerId, employeeId);

        const nodeBinary = resolveNodeExecutable();
        const taskPlan = approvedPlan.tasks[0];
        const permissions = { readFiles: ['src/deliverable.txt'], writeFiles: ['src/deliverable.txt'],
            commands: [{ command: nodeBinary, args: ['verify.js'] }] };
        const workspaceFiles = await api.createWorkspaceFileAdapter({ workspaceRoot });
        const taskTools = await api.createTaskScopedTools({ workspaceRoot, filesystem: workspaceFiles,
            processRunner: api.createCommandRunner({ allowedCommands: [nodeBinary], timeoutMs: 5000 }), permissions });
        await fs.writeFile(path.join(workspaceRoot, 'verify.js'),
            "const fs = require('fs'); if (fs.readFileSync('src/deliverable.txt', 'utf8') !== 'HEADROOM verified\\n') process.exit(1); console.log('contents verified');\n");
        const rawVerificationByTask = new Map();
        const verificationPipeline = api.createVerificationPipeline({
            commandRunner: { execute: (request) => taskTools.process.execute(request) },
            checks: [{ id: 'deliverable-content', command: nodeBinary, args: ['verify.js'], cwd: workspaceRoot }],
        });
        const employeeVerification = api.createEmployeeResultVerificationUseCase({ taskRepository,
            verificationPipeline: { run: async (input) => {
                const result = await verificationPipeline.run(input);
                rawVerificationByTask.set(taskPlan.id, result.results);
                return result;
            } } });
        const before = await api.createWorkspaceSnapshot({ workspaceRoot, snapshotId: 'e2e-before', paths: ['src/deliverable.txt'] });

        const scheduler = api.createTaskScheduler({
            queueWorkflow: api.createExecutionQueueUseCase({ taskRepository, dependencyRepository, queueRepository,
                hierarchyProvider, auditRepository, eventPublisher, unitOfWork, clock, idFactory }),
            queueRepository, executionControl: new api.ExecutionControl(), parallelLimit: 1,
            onStart: (task) => unitOfWork.run(() => {
                const occurredAt = clock.now();
                taskRepository.update(task.id, { status: api.TaskStatus.STARTED, startedAt: occurredAt });
                auditRepository.append({ id: idFactory(), action: 'TASK_STATE_CHANGED', entity: 'task', entityId: task.id,
                    actorId: task.assigneeId, taskId: task.id, details: { from: api.TaskStatus.ASSIGNED, to: api.TaskStatus.STARTED } });
                eventPublisher.append({ eventId: idFactory(), type: api.EventType.TASK_STARTED, aggregateId: task.id,
                    occurredAt, payload: { taskId: task.id, from: api.TaskStatus.ASSIGNED, status: api.TaskStatus.STARTED } });
                taskRepository.update(task.id, { status: api.TaskStatus.IN_PROGRESS });
                auditRepository.append({ id: idFactory(), action: 'TASK_STATE_CHANGED', entity: 'task', entityId: task.id,
                    actorId: task.assigneeId, taskId: task.id, details: { from: api.TaskStatus.STARTED, to: api.TaskStatus.IN_PROGRESS } });
                eventPublisher.append({ eventId: idFactory(), type: api.EventType.TASK_PROGRESS, aggregateId: task.id,
                    occurredAt, payload: { taskId: task.id, from: api.TaskStatus.STARTED, status: api.TaskStatus.IN_PROGRESS } });
            }),
            executor: { execute: async ({ task, signal }) => {
                const runtimeOutcome = await runtime.run({ taskId: task.id, agentId: task.assigneeId, signal });
                assert.equal(runtimeOutcome.ok, true, errorText(runtimeOutcome));
                const response = runtimeOutcome.value;
                assert.equal(response.outcome, 'SUCCEEDED', `Authorized employee runtime failed: ${response.errorCode ?? response.outcome}`);
                return response.result;
            } },
        });
        const runtime = api.createAuthorizedAgentRuntime({ agentRepository: agents, taskRepository, hierarchyProvider,
            clock, idFactory, adapter: { execute: async (request, { signal }) => {
                await taskTools.filesystem.writeFile('src/deliverable.txt', 'HEADROOM verified\n');
                const contents = await taskTools.filesystem.readFile('src/deliverable.txt');
                assert.equal(contents, 'HEADROOM verified\n');
                const verified = await employeeVerification.run({ taskId: request.task.id, agentId: request.agent.id,
                    signal, result: { summary: 'Created the deliverable.', acceptanceCriteria: [
                        { criterionId: taskPlan.acceptanceCriteria[0].id, met: true,
                            evidence: 'The scoped verification command confirmed exact file contents.' },
                    ] } });
                assert.equal(verified.ok, true, errorText(verified));
                assert.equal(verified.value.status, 'VERIFIED');
                assert.equal(verified.value.checks[0].status, 'PASSED');
                return verified.value.result;
            } } });

        const resultSubmission = api.createTaskResultSubmissionUseCase({ taskRepository, auditRepository,
            eventPublisher, unitOfWork, clock, idFactory });
        const review = api.createTaskReviewUseCase({ taskRepository, agentRepository: agents, hierarchyProvider,
            auditRepository, eventPublisher, unitOfWork, clock, idFactory });
        const executionFailureRecovery = api.createTaskExecutionFailureRecovery({ taskRepository, queueRepository,
            auditRepository, eventPublisher, unitOfWork, clock, idFactory });
        const taskCreation = api.createTaskCreationUseCase({ objectiveRepository, projectRepository, taskRepository,
            dependencyRepository, hierarchyProvider, auditRepository, eventPublisher, unitOfWork, clock, idFactory });
        const orchestrator = api.createExecutionOrchestrator({ taskCreationUseCase: taskCreation, scheduler,
            resultSubmissionUseCase: resultSubmission, reviewUseCase: review, executionFailureRecovery, objectiveRepository, taskRepository,
            auditRepository, eventPublisher, unitOfWork, clock, idFactory });
        const execution = await orchestrator.run({ plan: approvedPlan,
            assignments: [{ taskId: taskPlan.id, creatorId: routedDepartment.departmentManagerId, assigneeId: employeeId }],
            reviewDecisions: [{ taskId: taskPlan.id, reviewerId: routedDepartment.departmentManagerId, decision: 'APPROVED' }] });
        assert.equal(execution.ok, true, errorText(execution));
        assert.equal(execution.value.status, api.ObjectiveStatus.COMPLETED,
            `Execution did not complete: ${JSON.stringify({ report: execution.value,
                task: taskRepository.getById(taskPlan.id), queue: queueRepository.getByTaskId(taskPlan.id) })}`);
        assert.equal(taskRepository.getById(taskPlan.id).status, api.TaskStatus.COMPLETED);
        assert.equal(objectiveRepository.getById(objective.id).status, api.ObjectiveStatus.COMPLETED);

        const after = await api.createWorkspaceSnapshot({ workspaceRoot, snapshotId: 'e2e-after', paths: ['src/deliverable.txt'] });
        const gitStateAdapter = await api.createGitStateAdapter({ workspaceRoot });
        const evidenceUseCase = api.createReviewEvidenceBundle({ taskRepository,
            snapshotProvider: { getByTask: async () => ({ before, after }), compare: api.compareWorkspaceSnapshots },
            gitStateAdapter, verificationProvider: { getByTask: async (taskId) => rawVerificationByTask.get(taskId) } });
        const evidence = await evidenceUseCase.run({ taskId: taskPlan.id });
        assert.equal(evidence.ok, true, errorText(evidence));
        assert.ok(evidence.value.changes.added.some(({ path: file }) => file === 'src/deliverable.txt'));
        assert.equal(evidence.value.checks[0].status, 'PASSED');
        assert.ok(evidence.value.git.status.some(({ path: file }) => file === 'src/deliverable.txt'));
        assert.equal(evidence.value.acceptance.criteria[0].met, true);

        const reportUseCase = api.createCEOExecutionReport({ agentRepository: agents, objectiveRepository,
            projectRepository, taskRepository, auditRepository, usageRepository });
        const report = await reportUseCase.run({ ceoId: 'e2e-ceo', objectiveId: objective.id });
        assert.equal(report.ok, true, errorText(report));
        assert.equal(report.value.objective.status, api.ObjectiveStatus.COMPLETED);
        assert.equal(report.value.taskStatusCounts[api.TaskStatus.COMPLETED], 1);
        assert.ok(report.value.audit[0].entries > 0);

        const routedMessages = auditRepository.listByEntity('objective', objective.id)
            .filter(({ action }) => action === 'HIERARCHY_MESSAGE_ROUTED');
        assert.equal(routedMessages.length, 4, 'Each adjacent hierarchy handoff must be authorized and persisted.');
        assert.ok(auditRepository.hasEntityAction('execution-plan', approvedPlan.id, 'PLAN_DECISION_RECORDED'));
        assert.ok(auditRepository.listByEntity('objective', objective.id).some(({ action }) => action === 'EXECUTION_REPORTED'));
    }
    finally {
        if (connection?.isOpen) connection.close();
        await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
}

function errorText(outcome) {
    return outcome?.error ? `${outcome.error.code}: ${outcome.error.message}` : 'Expected workflow step to succeed.';
}

function resolveNodeExecutable() {
    if (process.env.HEADROOM_NODE_PATH && require('fs').existsSync(process.env.HEADROOM_NODE_PATH)) {
        return process.env.HEADROOM_NODE_PATH;
    }
    if (!process.versions?.electron) {
        return process.execPath;
    }
    const envPath = process.env.PATH || '';
    const pathExts = process.platform === 'win32'
        ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
        : [''];
    for (const dir of envPath.split(path.delimiter)) {
        for (const ext of pathExts) {
            const candidate = path.join(dir, `node${ext}`);
            if (require('fs').existsSync(candidate)) {
                return candidate;
            }
        }
    }
    return process.execPath;
}

module.exports = { runWorkflow };
