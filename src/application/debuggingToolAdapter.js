import { TaskStatus } from '../constants';
import { createEntityId, DomainInvariantError, isAgentAvailable } from '../domain';
import { redactSecrets } from '../shared/redactSecrets';
import { ApplicationError, createUseCase } from './useCase';

const READ_STAGES = new Set(['INSPECT', 'REVIEW']);
const COMMAND_STAGES = new Set(['REPRODUCE', 'TEST_HYPOTHESIS', 'TEST', 'VERIFY']);
const MAX_COMMAND_MS = 120_000;

/** Execute one debugging action through a task's frozen permission manifest and persist its outcome. */
export function createDebuggingToolAdapter({ sessionRepository, taskRepository, agentRepository, taskToolsProvider,
    debuggingWorkflow, clock = { now: () => new Date().toISOString() } } = {}) {
    if (typeof sessionRepository?.getById !== 'function' || typeof sessionRepository?.listSteps !== 'function'
        || typeof taskRepository?.getById !== 'function' || typeof agentRepository?.getById !== 'function'
        || typeof taskToolsProvider?.forTask !== 'function' || typeof debuggingWorkflow?.recordStep?.run !== 'function'
        || typeof debuggingWorkflow?.stop?.run !== 'function'
        || typeof clock?.now !== 'function') {
        throw new TypeError('Debugging tool adapter requires persisted session, task, actor, task tools, workflow, and clock ports.');
    }
    return createUseCase({ name: 'debugging-authorized-tool-action', dependencies: {
        sessionRepository, taskRepository, agentRepository, taskToolsProvider, debuggingWorkflow, clock,
    }, execute: async ({ input, dependencies: d }) => {
        const sessionId = createEntityId(input?.sessionId, 'Debugging session id');
        const actorId = createEntityId(input?.actorId, 'Debugging actor id');
        const session = d.sessionRepository.getById(sessionId);
        const actor = d.agentRepository.getById(actorId);
        const task = session && d.taskRepository.getById(session.taskId);
        if (!session || !task || !actor || !isAgentAvailable(actor) || task.status !== TaskStatus.IN_PROGRESS
            || task.assigneeId !== actor.id || session.status !== 'ACTIVE') {
            throw new DomainInvariantError('debugging-tool-forbidden', 'Debugging tools require the active assignee on an active session.');
        }
        if (input.signal !== undefined && !(typeof AbortSignal !== 'undefined' && input.signal instanceof AbortSignal)) {
            throw new DomainInvariantError('debugging-cancellation-invalid', 'Debugging cancellation requires a native AbortSignal.');
        }
        if (input.signal?.aborted) return stopSession(d, sessionId, actor, 'user-cancelled', 'Debugging action cancelled before it started.');
        if (input.stage !== undefined && input.stage !== session.stage) {
            throw new DomainInvariantError('debugging-stage-mismatch', 'The requested action does not match the current debugging stage.');
        }
        const file = normalizeFile(input.file);
        const priorFiles = new Set(d.sessionRepository.listSteps(sessionId).flatMap((step) => step.files));
        if (file && !priorFiles.has(file) && session.filesTouched >= session.fileBudget) {
            return escalateSession(d, session, actor, 'The debugging file budget was exhausted before this action.');
        }
        const startedAt = Date.parse(d.clock.now());
        if (!Number.isFinite(startedAt) || startedAt >= Date.parse(session.deadlineAt)) {
            return escalateSession(d, session, actor, 'The debugging deadline expired before this action.');
        }
        if (COMMAND_STAGES.has(session.stage) && session.commandsRun >= session.commandBudget) {
            return escalateSession(d, session, actor, 'The debugging command budget was exhausted before this action.');
        }
        const tools = await d.taskToolsProvider.forTask({ actor, task });
        let outcome = 'PASS';
        let actionSummary;
        let actionOutput = '';
        let toolAction;
        let commandSummary;
        let commandsRun = 0;
        if (READ_STAGES.has(session.stage)) {
            if (!file) throw new DomainInvariantError('debugging-file-required', 'Inspection and review actions must name a workspace file.');
            const content = await tools.filesystem.readFile(file);
            if (typeof content !== 'string' && !Buffer.isBuffer(content)) throw new ApplicationError('debugging-read-invalid', 'The authorized file adapter returned invalid content.');
            actionSummary = `Inspected ${file} (${Buffer.byteLength(content)} bytes).`;
            actionOutput = redactSecrets(Buffer.isBuffer(content) ? content.toString('utf8') : content, 4000);
            toolAction = 'READ_FILE';
        } else if (COMMAND_STAGES.has(session.stage)) {
            if (!input.command || !Array.isArray(input.args)) throw new DomainInvariantError('debugging-command-required', 'A granted executable and exact argument list are required.');
            const controller = new AbortController();
            const onCancel = () => controller.abort();
            input.signal?.addEventListener('abort', onCancel, { once: true });
            const remainingMs = Math.max(1, Date.parse(session.deadlineAt) - startedAt);
            let deadlineExpired = false;
            const timeout = setTimeout(() => { deadlineExpired = true; controller.abort(); }, Math.min(MAX_COMMAND_MS, remainingMs));
            let result;
            try { result = await tools.process.execute({ command: input.command, args: input.args, signal: controller.signal }); }
            catch (error) {
                if (input.signal?.aborted) return stopSession(d, sessionId, actor, 'user-cancelled',
                    'Authorized debug command was cancelled; no test failure was recorded.');
                if (!deadlineExpired) throw error;
                result = { exitCode: null, timedOut: true, aborted: true };
            }
            finally { clearTimeout(timeout); input.signal?.removeEventListener('abort', onCancel); }
            if (input.signal?.aborted) return stopSession(d, sessionId, actor, 'user-cancelled',
                'Authorized debug command was cancelled; no test failure was recorded.');
            if (deadlineExpired) return escalateSession(d, session, actor,
                'The debugging deadline expired during an authorized command.', { commandsRun: 1,
                    durationMs: Math.max(0, Date.parse(d.clock.now()) - startedAt), toolAction: 'EXECUTE_COMMAND',
                    commandSummary: `${input.command} ${input.args.join(' ')}` });
            commandsRun = 1;
            outcome = result?.exitCode === 0 && !result.timedOut && !result.aborted ? 'PASS' : 'FAIL';
            actionSummary = `Command ${outcome.toLowerCase()} (exit ${Number.isInteger(result?.exitCode) ? result.exitCode : 'unknown'}).`;
            actionOutput = redactSecrets([result?.stdout, result?.stderr].filter(Boolean).join('\n'), 4000);
            toolAction = 'EXECUTE_COMMAND';
            commandSummary = `${input.command} ${input.args.join(' ')}`;
        } else if (session.stage === 'PATCH') {
            if (input.confirmPatch !== true) throw new DomainInvariantError('debugging-patch-not-confirmed', 'File patches require explicit confirmation for each change.');
            if (!file || typeof input.contents !== 'string' || input.contents.length > 200_000) {
                throw new DomainInvariantError('debugging-patch-invalid', 'Patch requires a workspace file and contents up to 200 KB.');
            }
            await tools.filesystem.writeFile(file, input.contents);
            actionSummary = `Applied confirmed patch to ${file}.`;
            toolAction = 'WRITE_FILE';
        } else {
            throw new DomainInvariantError('debugging-action-not-supported', 'No automatic action is available at this debugging stage.');
        }
        const durationMs = Math.max(0, Date.parse(d.clock.now()) - startedAt);
        const recorded = await d.debuggingWorkflow.recordStep.run({ sessionId, actorId,
            actorRole: actor.role, stage: session.stage, outcome, summary: redactSecrets(actionSummary, 2000),
            files: file ? [file] : [], commandsRun, durationMs, tokensUsed: 0, toolAction, commandSummary,
            confidence: session.stage === 'HYPOTHESIS' ? input.confidence : undefined });
        if (!recorded.ok) throw new ApplicationError(recorded.error.code, recorded.error.message);
        return Object.freeze({ ...recorded.value, action: Object.freeze({ stage: session.stage, outcome,
            summary: redactSecrets(actionSummary, 2000), output: actionOutput }) });
    } });
}

async function escalateSession(dependencies, session, actor, summary, action = {}) {
    const result = await dependencies.debuggingWorkflow.recordStep.run({ sessionId: session.id, actorId: actor.id,
        actorRole: actor.role, stage: session.stage, outcome: 'BLOCKED', summary: redactSecrets(summary, 2000),
        files: [], commandsRun: action.commandsRun ?? 0, durationMs: action.durationMs ?? 0, tokensUsed: 0,
        toolAction: action.toolAction, commandSummary: action.commandSummary });
    if (!result.ok) throw new ApplicationError(result.error.code, result.error.message);
    return Object.freeze({ ...result.value, action: Object.freeze({ stage: session.stage, outcome: 'BLOCKED',
        summary: redactSecrets(summary, 2000), output: '' }) });
}

async function stopSession(dependencies, sessionId, actor, reason, summary) {
    const stopped = await dependencies.debuggingWorkflow.stop.run({ sessionId, actorId: actor.id,
        actorRole: actor.role, reason, summary });
    if (!stopped.ok) throw new ApplicationError(stopped.error.code, stopped.error.message);
    return Object.freeze({ session: stopped.value, step: undefined,
        action: Object.freeze({ outcome: reason === 'user-cancelled' ? 'CANCELLED' : 'STOPPED',
            summary: redactSecrets(summary, 2000), output: '' }) });
}

function normalizeFile(value) {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !value.trim() || value.length > 240 || value.includes('\0') || value.includes(':')
        || value.startsWith('/') || value.startsWith('\\')
        || value.replace(/\\/g, '/').split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
        throw new DomainInvariantError('invalid-debugging-file', 'Debugging file must be a canonical workspace-relative path.');
    }
    return value.replace(/\\/g, '/');
}
