import { assertExecutionPlan, createEntityId } from '../domain';
import { ApplicationError, createUseCase } from './useCase';
import { getPromptContract } from './promptRegistry';

const MAX_PROJECTS = 6;
const MAX_MILESTONES = 20;
const MAX_TASKS = 80;
const MAX_TEXT = 500;
const PROMPT = getPromptContract('director.plan-proposal.v1');

/** Ask the Director for an unapproved plan proposal and validate every graph edge locally. */
export function createDirectorPlanProposal({ objectiveRepository, questionRepository, provider, idFactory } = {}) {
    if (typeof objectiveRepository?.getById !== 'function' || typeof questionRepository?.listByObjective !== 'function'
        || typeof provider?.generate !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Director plan proposal requires objective/question repositories, provider, and ID factory.');
    }
    return createUseCase({ name: 'director-plan-proposal', dependencies: { objectiveRepository, questionRepository, provider, idFactory },
        execute: async ({ input, dependencies }) => {
            if (typeof input?.objectiveId !== 'string' || !input.objectiveId.trim()) {
                throw new ApplicationError('invalid-objective-id', 'An objective identifier is required.');
            }
            const objectiveId = createEntityId(input.objectiveId);
            const objective = dependencies.objectiveRepository.getById(objectiveId);
            if (!objective) throw new ApplicationError('objective-not-found', 'The requested objective does not exist.');
            const questions = dependencies.questionRepository.listByObjective(objectiveId);
            if (questions.some((item) => item.status === 'PENDING')) {
                throw new ApplicationError('objective-clarification-pending', 'Resolve or skip pending Director questions before requesting a plan.');
            }
            const answeredQuestions = questions.filter(({ status }) => status === 'ANSWERED')
                .map(({ question, answer }) => ({ question, answer }));
            const result = await dependencies.provider.generate({ requestId: createEntityId(dependencies.idFactory()),
                model: input.model, systemPrompt: PROMPT.systemPrompt,
                input: { objective: { title: objective.title, description: objective.description }, answeredQuestions },
                outputSchema: PROMPT.outputSchema }, { signal: input.signal, budget: input.budget });
            if (result.finishReason !== 'STOP') {
                const code = result.finishReason === 'ERROR' ? result.errorCode : `director-plan-${result.finishReason.toLowerCase()}`;
                throw new ApplicationError(code, 'Director plan proposal did not produce a complete plan.', { retryable: result.finishReason === 'ERROR' });
            }
            return buildPlan(objectiveId, result.output, dependencies.idFactory);
        } });
}

function buildPlan(objectiveId, output, idFactory) {
    if (!output || typeof output !== 'object' || Array.isArray(output)
        || Object.keys(output).sort().join(',') !== 'dependencies,milestones,projects,tasks'
        || !Array.isArray(output.projects) || !output.projects.length || output.projects.length > MAX_PROJECTS
        || !Array.isArray(output.milestones) || !output.milestones.length || output.milestones.length > MAX_MILESTONES
        || !Array.isArray(output.tasks) || !output.tasks.length || output.tasks.length > MAX_TASKS
        || !Array.isArray(output.dependencies) || output.dependencies.length > 200) invalid();
    const projects = output.projects.map((item) => {
        if (!exactKeys(item, ['name'])) invalid();
        return { id: createEntityId(idFactory()), name: boundedText(item.name) };
    });
    const milestones = output.milestones.map((item) => {
        if (!exactKeys(item, ['projectIndex', 'title'])) invalid();
        return { id: createEntityId(idFactory()), projectId: projects[item.projectIndex]?.id, title: boundedText(item.title) };
    });
    const tasks = output.tasks.map((item, index) => {
        const taskKeys = ['projectIndex', 'milestoneIndex', 'title', 'acceptanceCriteria'];
        if (!exactKeys(item, taskKeys) && !exactKeys(item, [...taskKeys, 'requiredCapabilities'])) invalid();
        const title = boundedText(item?.title);
        if (!Array.isArray(item?.acceptanceCriteria) || item.acceptanceCriteria.length < 1 || item.acceptanceCriteria.length > 12) invalid();
        const requiredCapabilities = item.requiredCapabilities === undefined ? [] : item.requiredCapabilities;
        if (!Array.isArray(requiredCapabilities) || requiredCapabilities.length > 32
            || requiredCapabilities.some((capability) => typeof capability !== 'string' || !capability.trim() || capability.trim().length > 100)
            || new Set(requiredCapabilities.map((capability) => capability.trim().toLocaleLowerCase('en-US'))).size !== requiredCapabilities.length) invalid();
        const acceptanceCriteria = item.acceptanceCriteria.map((description) => ({
            id: createEntityId(idFactory()), description: boundedText(description), required: true, met: false,
        }));
        return { id: createEntityId(idFactory()), taskCode: `DIR-${String(index + 1).padStart(3, '0')}`, title,
            projectId: projects[item.projectIndex]?.id, milestoneId: milestones[item.milestoneIndex]?.id,
            acceptanceCriteria, requiredCapabilities: requiredCapabilities.map((capability) => capability.trim()) };
    });
    const dependencies = output.dependencies.map((item) => {
        if (!exactKeys(item, ['dependentTaskIndex', 'dependencyTaskIndex'])) invalid();
        if (!validIndex(item?.dependentTaskIndex, tasks.length) || !validIndex(item?.dependencyTaskIndex, tasks.length)) invalid();
        if (item.dependencyTaskIndex >= item.dependentTaskIndex) invalid();
        return { dependentTaskId: tasks[item.dependentTaskIndex].id, dependencyTaskId: tasks[item.dependencyTaskIndex].id };
    });
    const plan = { id: createEntityId(idFactory()), objectiveId, projects, milestones, tasks, dependencies };
    try { assertExecutionPlan(plan); }
    catch { invalid(); }
    return Object.freeze({ ...plan, projects: Object.freeze(projects), milestones: Object.freeze(milestones),
        tasks: Object.freeze(tasks.map((task) => Object.freeze({ ...task,
            acceptanceCriteria: Object.freeze(task.acceptanceCriteria.map(Object.freeze)),
            requiredCapabilities: Object.freeze(task.requiredCapabilities) }))),
        dependencies: Object.freeze(dependencies.map(Object.freeze)) });
}

function boundedText(value) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > MAX_TEXT) invalid();
    return value.trim();
}

function exactKeys(value, expected) {
    return value && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).sort().join(',') === expected.slice().sort().join(',');
}

function validIndex(value, length) { return Number.isSafeInteger(value) && value >= 0 && value < length; }

function invalid() {
    throw new ApplicationError('invalid-director-plan', 'Director returned a malformed or invalid plan proposal.');
}
