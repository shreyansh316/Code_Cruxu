import { assertEntityId } from '../../shared/identifiers';
import { redactSecrets } from '../../shared/redactSecrets';

const MAX_USAGE_QUERY_LIMIT = 1000;
const MAX_USAGE_MODEL_LENGTH = 200;
const MAX_USAGE_PURPOSE_LENGTH = 120;

/** Validated, attributable AI usage accounting over the existing SQLite table. */
export class AIUsageRepository {
    constructor(database) {
        if (!database || typeof database.prepare !== 'function') {
            throw new TypeError('AIUsageRepository requires a SQLite database handle.');
        }
        this.database = database;
    }

    record(value) {
        validateUsage(value);
        const id = assertEntityId(value.id, 'AI usage id');
        const requestId = value.requestId == null ? null : assertEntityId(value.requestId, 'AI request id');
        const attempt = value.attempt ?? 1;
        const agentId = value.agentId == null ? null : assertEntityId(value.agentId, 'AI usage agent id');
        const taskId = value.taskId == null ? null : assertEntityId(value.taskId, 'AI usage task id');
        this.database.prepare(`
          INSERT INTO ai_usages (
            id, agent_id, task_id, model, input_tokens, output_tokens,
            estimated_cost, duration_ms, purpose, success, request_id, attempt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, agentId, taskId, redactSecrets(value.model.trim(), MAX_USAGE_MODEL_LENGTH), value.inputTokens, value.outputTokens,
            value.estimatedCost, value.durationMs, value.purpose?.trim()
                ? redactSecrets(value.purpose.trim(), MAX_USAGE_PURPOSE_LENGTH) : null, Number(value.success ?? true),
            requestId, attempt);
        return this.getById(id);
    }

    getById(id) {
        id = assertEntityId(id, 'AI usage id');
        return mapUsage(this.database.prepare('SELECT * FROM ai_usages WHERE id = ?').get(id));
    }

    listByTask(taskId, { limit = 100 } = {}) {
        return this._listBy('task_id', assertEntityId(taskId, 'AI usage task id'), limit);
    }

    listByAgent(agentId, { limit = 100 } = {}) {
        return this._listBy('agent_id', assertEntityId(agentId, 'AI usage agent id'), limit);
    }

    _listBy(column, id, limit) {
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_USAGE_QUERY_LIMIT) {
            throw new TypeError(`AI usage query limit must be between 1 and ${MAX_USAGE_QUERY_LIMIT}.`);
        }
        return this.database.prepare(`SELECT * FROM ai_usages WHERE ${column} = ? ORDER BY created_at, rowid LIMIT ?`)
            .all(id, limit).map(mapUsage);
    }
}

function validateUsage(value) {
    if (!value || typeof value.model !== 'string' || value.model.trim() === '' || value.model.trim().length > MAX_USAGE_MODEL_LENGTH
        || (value.requestId != null && (typeof value.requestId !== 'string' || value.requestId.trim() === ''))
        || !Number.isSafeInteger(value.attempt ?? 1) || (value.attempt ?? 1) < 1 || (value.attempt ?? 1) > 4
        || !Number.isSafeInteger(value.inputTokens) || value.inputTokens < 0
        || !Number.isSafeInteger(value.outputTokens) || value.outputTokens < 0
        || !Number.isFinite(value.estimatedCost) || value.estimatedCost < 0
        || !Number.isSafeInteger(value.durationMs) || value.durationMs < 0
        || typeof (value.success ?? true) !== 'boolean'
        || (value.purpose != null && (typeof value.purpose !== 'string' || value.purpose.length > MAX_USAGE_PURPOSE_LENGTH))) {
        throw new TypeError('AI usage requires a model, nonnegative integer counts/duration, finite cost, and boolean success.');
    }
}

function mapUsage(row) {
    if (!row) return undefined;
    return {
        id: row.id, requestId: row.request_id, attempt: row.attempt,
        agentId: row.agent_id, taskId: row.task_id, model: redactSecrets(row.model, MAX_USAGE_MODEL_LENGTH),
        inputTokens: row.input_tokens, outputTokens: row.output_tokens,
        estimatedCost: row.estimated_cost, durationMs: row.duration_ms,
        purpose: row.purpose === null ? null : redactSecrets(row.purpose, MAX_USAGE_PURPOSE_LENGTH),
        success: row.success === 1, createdAt: row.created_at,
    };
}
