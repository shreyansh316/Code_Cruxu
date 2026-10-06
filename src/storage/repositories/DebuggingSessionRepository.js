import { assertEntityId } from '../../shared/identifiers';
import { redactSecrets } from '../../shared/redactSecrets';

const STAGES = Object.freeze(['REPRODUCE', 'INSPECT', 'HYPOTHESIS', 'TEST_HYPOTHESIS', 'PATCH', 'TEST', 'REVIEW', 'VERIFY']);
const NEXT_STAGE = Object.freeze({ REPRODUCE: 'INSPECT', INSPECT: 'HYPOTHESIS', HYPOTHESIS: 'TEST_HYPOTHESIS',
    TEST_HYPOTHESIS: 'PATCH', PATCH: 'TEST', TEST: 'REVIEW', REVIEW: 'VERIFY' });

/** Persist a bounded debugging session and its ordered evidence trail. */
export class DebuggingSessionRepository {
    constructor(database) {
        if (!database || typeof database.prepare !== 'function' || typeof database.transaction !== 'function') {
            throw new TypeError('DebuggingSessionRepository requires a transaction-capable SQLite database.');
        }
        this.database = database;
    }

    create(value) {
        const normalized = normalizeSession(value);
        this.database.prepare(`INSERT INTO debugging_sessions
          (id, task_id, created_by_agent_id, max_attempts, file_budget, command_budget, token_budget,
           time_budget_ms, started_at, deadline_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(normalized.id, normalized.taskId, normalized.createdByAgentId, normalized.maxAttempts,
                normalized.fileBudget, normalized.commandBudget, normalized.tokenBudget, normalized.timeBudgetMs,
                normalized.startedAt, normalized.deadlineAt);
        return this.getById(normalized.id);
    }

    getById(id) {
        id = assertEntityId(id, 'Debugging session id');
        return mapSession(this.database.prepare('SELECT * FROM debugging_sessions WHERE id = ?').get(id));
    }

    listByTask(taskId, { limit = 20 } = {}) {
        taskId = assertEntityId(taskId, 'Debugging task id');
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Debugging session query limit must be between 1 and 100.');
        return this.database.prepare('SELECT * FROM debugging_sessions WHERE task_id = ? ORDER BY created_at DESC, id LIMIT ?')
            .all(taskId, limit).map(mapSession);
    }

    hasActiveForTask(taskId) {
        taskId = assertEntityId(taskId, 'Debugging task id');
        return this.database.prepare("SELECT 1 AS active FROM debugging_sessions WHERE task_id = ? AND status = 'ACTIVE' LIMIT 1")
            .get(taskId) !== undefined;
    }

    listSteps(sessionId, { limit = 30 } = {}) {
        sessionId = assertEntityId(sessionId, 'Debugging session id');
        if (!Number.isInteger(limit) || limit < 1 || limit > 30) throw new TypeError('Debugging step query limit must be between 1 and 30.');
        return this.database.prepare('SELECT * FROM debugging_steps WHERE session_id = ? ORDER BY sequence LIMIT ?')
            .all(sessionId, limit).map(mapStep);
    }

    recordStep(value) {
        return this.database.transaction(() => this._recordStep(value))();
    }

    _recordStep(value) {
        const input = normalizeStep(value);
        const session = this.getById(input.sessionId);
        if (!session) throw new TypeError('Debugging session does not exist.');
        if (session.status !== 'ACTIVE') throw new TypeError('Debugging session is no longer active.');
        if (input.now >= session.deadlineAt) return this.escalate(input.sessionId, 'time-budget-exceeded', 'Execution time budget was exhausted.', input.now);
        const steps = this.listSteps(input.sessionId);
        if (steps.length >= 30 || input.stage !== session.stage) throw new TypeError('Debugging step does not match the active stage or attempt limit.');
        const files = [...new Set([...steps.flatMap((step) => step.files), ...input.files])];
        const commandsRun = session.commandsRun + input.commandsRun;
        const tokensUsed = session.tokensUsed + input.tokensUsed;
        if (files.length > session.fileBudget || commandsRun > session.commandBudget || tokensUsed > session.tokenBudget) {
            return this.escalate(input.sessionId, 'resource-budget-exceeded', 'File, command, or token budget was exhausted.', input.now);
        }

        let status = 'ACTIVE'; let stage = session.stage; let stopReason = null;
        let failedTestCount = session.failedTestCount;
        if (input.outcome === 'BLOCKED' || (stage === 'HYPOTHESIS' && !(input.confidence >= 0.35))) {
            status = 'ESCALATED'; stopReason = input.outcome === 'BLOCKED' ? 'blocker' : 'low-confidence';
        } else if (['TEST_HYPOTHESIS', 'TEST', 'VERIFY'].includes(stage) && input.outcome === 'FAIL') {
            failedTestCount += 1;
            if (failedTestCount >= session.maxAttempts) { status = 'ESCALATED'; stopReason = 'repeated-test-failure'; }
            else stage = stage === 'TEST_HYPOTHESIS' ? 'HYPOTHESIS' : 'PATCH';
        } else if (input.outcome === 'FAIL') {
            status = 'ESCALATED'; stopReason = 'stage-failed';
        } else if (stage === 'VERIFY') {
            status = 'RESOLVED';
        } else {
            stage = NEXT_STAGE[stage];
        }
        const sequence = steps.length + 1;
        this.database.prepare(`INSERT INTO debugging_steps
          (id, session_id, sequence, stage, outcome, summary, confidence, files_json, commands_run, tokens_used,
           duration_ms, created_at, tool_action, command_summary)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(input.id, input.sessionId, sequence, input.stage, input.outcome, input.summary, input.confidence,
                JSON.stringify(input.files), input.commandsRun, input.tokensUsed, input.durationMs, input.now,
                input.toolAction, input.commandSummary);
        this.database.prepare(`UPDATE debugging_sessions SET status = ?, stage = ?, attempt_count = ?, failed_test_count = ?,
          files_touched = ?, commands_run = ?, tokens_used = ?, stop_reason = ?, final_summary = ?, updated_at = ? WHERE id = ?`)
            .run(status, stage ?? session.stage, session.attemptCount + 1, failedTestCount, files.length, commandsRun,
                tokensUsed, stopReason, status === 'RESOLVED' ? input.summary : null, input.now, input.sessionId);
        return Object.freeze({ session: this.getById(input.sessionId), step: this.listSteps(input.sessionId).at(-1) });
    }

    stop(sessionId, reason, summary, now = new Date().toISOString()) {
        sessionId = assertEntityId(sessionId, 'Debugging session id');
        if (typeof reason !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(reason)
            || typeof summary !== 'string' || !summary.trim() || summary.length > 2000 || !isTimestamp(now)) {
            throw new TypeError('Debugging stop record is invalid.');
        }
        const changed = this.database.prepare(`UPDATE debugging_sessions SET status = 'STOPPED', stop_reason = ?, final_summary = ?, updated_at = ?
          WHERE id = ? AND status = 'ACTIVE'`).run(reason, redactSecrets(summary.trim(), 2000), now, sessionId).changes;
        if (!changed) throw new TypeError('Only an active debugging session can be stopped.');
        return Object.freeze({ session: this.getById(sessionId), step: undefined });
    }

    /** Close a debugging run as an escalation when its bounded execution budget is exhausted. */
    escalate(sessionId, reason, summary, now = new Date().toISOString()) {
        sessionId = assertEntityId(sessionId, 'Debugging session id');
        if (!['time-budget-exceeded', 'resource-budget-exceeded'].includes(reason)
            || typeof summary !== 'string' || !summary.trim() || summary.length > 2000 || !isTimestamp(now)) {
            throw new TypeError('Debugging escalation record is invalid.');
        }
        const changed = this.database.prepare(`UPDATE debugging_sessions SET status = 'ESCALATED', stop_reason = ?, final_summary = ?, updated_at = ?
          WHERE id = ? AND status = 'ACTIVE'`).run(reason, redactSecrets(summary.trim(), 2000), now, sessionId).changes;
        if (!changed) throw new TypeError('Only an active debugging session can be escalated.');
        return Object.freeze({ session: this.getById(sessionId), step: undefined });
    }
}

function normalizeSession(value) {
    if (!value || typeof value !== 'object') throw new TypeError('Debugging session is invalid.');
    const id = assertEntityId(value.id, 'Debugging session id');
    const taskId = assertEntityId(value.taskId, 'Debugging task id');
    const createdByAgentId = assertEntityId(value.createdByAgentId, 'Debugging creator id');
    const maxAttempts = value.maxAttempts ?? 3; const fileBudget = value.fileBudget ?? 10;
    const commandBudget = value.commandBudget ?? 10; const tokenBudget = value.tokenBudget ?? 12000;
    const timeBudgetMs = value.timeBudgetMs ?? 300000; const startedAt = value.startedAt ?? new Date().toISOString();
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3
        || !Number.isInteger(fileBudget) || fileBudget < 1 || fileBudget > 20
        || !Number.isInteger(commandBudget) || commandBudget < 1 || commandBudget > 20
        || !Number.isInteger(tokenBudget) || tokenBudget < 1 || tokenBudget > 50000
        || !Number.isInteger(timeBudgetMs) || timeBudgetMs < 1000 || timeBudgetMs > 900000 || !isTimestamp(startedAt)) {
        throw new TypeError('Debugging budgets or start time are invalid.');
    }
    return { id, taskId, createdByAgentId, maxAttempts, fileBudget, commandBudget, tokenBudget, timeBudgetMs,
        startedAt, deadlineAt: new Date(Date.parse(startedAt) + timeBudgetMs).toISOString() };
}

function normalizeStep(value) {
    const files = Array.isArray(value?.files) ? value.files.map(canonicalWorkspacePath) : null;
    if (!value || !STAGES.includes(value.stage) || !['PASS', 'FAIL', 'BLOCKED'].includes(value.outcome)
        || typeof value.summary !== 'string' || !value.summary.trim() || value.summary.length > 2000
        || (value.confidence !== undefined && value.confidence !== null
            && (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1))
        || !files || files.length > 20 || files.some((file) => file === null)
        || !Number.isInteger(value.commandsRun ?? 0) || (value.commandsRun ?? 0) < 0 || (value.commandsRun ?? 0) > 20
        || !Number.isInteger(value.tokensUsed ?? 0) || (value.tokensUsed ?? 0) < 0 || (value.tokensUsed ?? 0) > 50000
        || !Number.isInteger(value.durationMs ?? 0) || (value.durationMs ?? 0) < 0 || (value.durationMs ?? 0) > 900000) {
        throw new TypeError('Debugging step is malformed or exceeds its bounds.');
    }
    const toolAction = value.toolAction ?? null;
    if (toolAction !== null && !['READ_FILE', 'EXECUTE_COMMAND', 'WRITE_FILE', 'RECORD_HYPOTHESIS'].includes(toolAction)) {
        throw new TypeError('Debugging tool action attribution is invalid.');
    }
    if (value.commandSummary != null && (typeof value.commandSummary !== 'string' || value.commandSummary.length > 500)) {
        throw new TypeError('Debugging command attribution is invalid or exceeds its bound.');
    }
    validateToolAttribution({ stage: value.stage, toolAction, commandSummary: value.commandSummary ?? null,
        files, commandsRun: value.commandsRun ?? 0 });
    const now = value.now ?? new Date().toISOString();
    if (!isTimestamp(now)) throw new TypeError('Debugging step time must be canonical UTC.');
    return { id: assertEntityId(value.id, 'Debugging step id'), sessionId: assertEntityId(value.sessionId),
        stage: value.stage, outcome: value.outcome, summary: redactSecrets(value.summary.trim(), 2000),
        confidence: value.confidence ?? null, files: [...new Set(files)], commandsRun: value.commandsRun ?? 0,
        tokensUsed: value.tokensUsed ?? 0, durationMs: value.durationMs ?? 0, toolAction,
        commandSummary: value.commandSummary == null ? null : redactSecrets(value.commandSummary, 500), now };
}

function validateToolAttribution({ stage, toolAction, commandSummary, files, commandsRun }) {
    if (toolAction === null) return;
    const permittedStages = {
        READ_FILE: ['INSPECT', 'REVIEW'],
        EXECUTE_COMMAND: ['REPRODUCE', 'TEST_HYPOTHESIS', 'TEST', 'VERIFY'],
        WRITE_FILE: ['PATCH'],
        RECORD_HYPOTHESIS: ['HYPOTHESIS'],
    };
    if (!permittedStages[toolAction]?.includes(stage)) {
        throw new TypeError('Debugging tool action does not match its workflow stage.');
    }
    if (toolAction === 'EXECUTE_COMMAND' && (commandsRun < 1 || typeof commandSummary !== 'string' || !commandSummary.trim())) {
        throw new TypeError('Command execution attribution requires a command count and redacted summary.');
    }
    if (toolAction === 'READ_FILE' && files.length < 1) {
        throw new TypeError('File read attribution requires at least one workspace file.');
    }
    if (toolAction === 'WRITE_FILE' && files.length < 1) {
        throw new TypeError('File write attribution requires at least one workspace file.');
    }
}

function canonicalWorkspacePath(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 240
        || value.startsWith('/') || /^[A-Za-z]:/.test(value)) return null;
    const segments = value.replace(/\\/g, '/').split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null;
    return segments.join('/');
}
function isTimestamp(value) { return typeof value === 'string' && value.length === 24 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function mapSession(row) {
    if (!row) return undefined;
    return Object.freeze({ id: row.id, taskId: row.task_id, createdByAgentId: row.created_by_agent_id, status: row.status,
        stage: row.stage, attemptCount: row.attempt_count, failedTestCount: row.failed_test_count, maxAttempts: row.max_attempts,
        fileBudget: row.file_budget, filesTouched: row.files_touched, commandBudget: row.command_budget,
        commandsRun: row.commands_run, tokenBudget: row.token_budget, tokensUsed: row.tokens_used,
        timeBudgetMs: row.time_budget_ms, startedAt: row.started_at, deadlineAt: row.deadline_at,
        stopReason: row.stop_reason, finalSummary: row.final_summary, updatedAt: row.updated_at });
}
function mapStep(row) {
    return Object.freeze({ id: row.id, sessionId: row.session_id, sequence: row.sequence, stage: row.stage,
        outcome: row.outcome, summary: row.summary, confidence: row.confidence, files: Object.freeze(JSON.parse(row.files_json)),
        commandsRun: row.commands_run, tokensUsed: row.tokens_used, durationMs: row.duration_ms,
        toolAction: row.tool_action ?? null, commandSummary: row.command_summary ?? null, createdAt: row.created_at });
}
