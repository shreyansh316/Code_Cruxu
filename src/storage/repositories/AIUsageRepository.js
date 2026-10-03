import { assertEntityId } from '../../shared/identifiers';

const MAX_USAGE_QUERY_LIMIT = 1000;

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
        const agentId = value.agentId == null ? null : assertEntityId(value.agentId, 'AI usage agent id');
        const taskId = value.taskId == null ? null : assertEntityId(value.taskId, 'AI usage task id');
        this.database.prepare(`
          INSERT INTO ai_usages (
            id, agent_id, task_id, model, input_tokens, output_tokens,
            estimated_cost, duration_ms, purpose, success
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, agentId, taskId, value.model.trim(), value.inputTokens, value.outputTokens,
            value.estimatedCost, value.durationMs, value.purpose?.trim() || null, Number(value.success ?? true));
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
    if (!value || typeof value.model !== 'string' || value.model.trim() === ''
        || !Number.isSafeInteger(value.inputTokens) || value.inputTokens < 0
        || !Number.isSafeInteger(value.outputTokens) || value.outputTokens < 0
        || !Number.isFinite(value.estimatedCost) || value.estimatedCost < 0
        || !Number.isSafeInteger(value.durationMs) || value.durationMs < 0
        || typeof (value.success ?? true) !== 'boolean'
        || (value.purpose != null && typeof value.purpose !== 'string')) {
        throw new TypeError('AI usage requires a model, nonnegative integer counts/duration, finite cost, and boolean success.');
    }
}

function mapUsage(row) {
    if (!row) return undefined;
    return {
        id: row.id, agentId: row.agent_id, taskId: row.task_id, model: row.model,
        inputTokens: row.input_tokens, outputTokens: row.output_tokens,
        estimatedCost: row.estimated_cost, durationMs: row.duration_ms,
        purpose: row.purpose, success: row.success === 1, createdAt: row.created_at,
    };
}
