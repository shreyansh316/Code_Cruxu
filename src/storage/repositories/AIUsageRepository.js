import { assertEntityId } from '../../shared/identifiers';
import { redactSecrets } from '../../shared/redactSecrets';

const MAX_USAGE_QUERY_LIMIT = 1000;
const MAX_USAGE_MODEL_LENGTH = 200;
const MAX_USAGE_PROVIDER_LENGTH = 120;
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
        const provider = value.provider == null ? null : redactSecrets(value.provider.trim(), MAX_USAGE_PROVIDER_LENGTH);
        const costKnown = value.costKnown ?? true;
        this.database.prepare(`
          INSERT INTO ai_usages (
            id, agent_id, task_id, model, input_tokens, output_tokens,
            estimated_cost, duration_ms, purpose, success, request_id, attempt, provider, cost_known
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, agentId, taskId, redactSecrets(value.model.trim(), MAX_USAGE_MODEL_LENGTH), value.inputTokens, value.outputTokens,
            value.estimatedCost, value.durationMs, value.purpose?.trim()
                ? redactSecrets(value.purpose.trim(), MAX_USAGE_PURPOSE_LENGTH) : null, Number(value.success ?? true),
            requestId, attempt, provider, Number(costKnown));
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

    /** Aggregate the complete task ledger in SQLite without materializing usage rows in JavaScript. */
    summarizeByTask(taskId) {
        taskId = assertEntityId(taskId, 'AI usage task id');
        const totals = this.database.prepare(`SELECT COUNT(*) AS attempt_count,
          COUNT(DISTINCT request_id) AS request_count,
          COALESCE(SUM(CASE WHEN attempt > 1 THEN 1 ELSE 0 END), 0) AS retry_count,
          COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END), 0) AS success_count,
          COALESCE(SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END), 0) AS failure_count,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens,
          COALESCE(SUM(CASE WHEN cost_known = 1 THEN estimated_cost ELSE 0 END), 0) AS estimated_cost,
          COALESCE(SUM(cost_known), 0) AS cost_known_attempts,
          COALESCE(SUM(duration_ms), 0) AS duration_ms
          FROM ai_usages WHERE task_id = ?`).get(taskId);
        const models = this.database.prepare(`SELECT provider, model, COUNT(*) AS attempts,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens,
          COALESCE(SUM(CASE WHEN cost_known = 1 THEN estimated_cost ELSE 0 END), 0) AS estimated_cost,
          COALESCE(SUM(cost_known), 0) AS cost_known_attempts
          FROM ai_usages WHERE task_id = ? GROUP BY provider, model ORDER BY attempts DESC, provider, model LIMIT 20`).all(taskId);
        const inputTokens = Number(totals.input_tokens);
        const outputTokens = Number(totals.output_tokens);
        if (![inputTokens, outputTokens, totals.attempt_count, totals.request_count, totals.retry_count,
            totals.success_count, totals.failure_count, totals.cost_known_attempts, totals.duration_ms].every(Number.isSafeInteger)
            || !Number.isFinite(totals.estimated_cost) || !Number.isSafeInteger(inputTokens + outputTokens)) {
            throw new TypeError('AI usage task summary exceeds supported numeric precision.');
        }
        return Object.freeze({ taskId, attemptCount: totals.attempt_count, requestCount: totals.request_count,
            retryCount: totals.retry_count, successCount: totals.success_count, failureCount: totals.failure_count,
            inputTokens, outputTokens, totalTokens: inputTokens + outputTokens,
            estimatedCost: totals.estimated_cost, costKnownAttempts: totals.cost_known_attempts,
            costComplete: totals.cost_known_attempts === totals.attempt_count, durationMs: totals.duration_ms,
            models: Object.freeze(models.map((row) => Object.freeze({ provider: row.provider === null ? null
                    : redactSecrets(row.provider, MAX_USAGE_PROVIDER_LENGTH),
                model: redactSecrets(row.model, MAX_USAGE_MODEL_LENGTH),
                attempts: row.attempts, inputTokens: row.input_tokens, outputTokens: row.output_tokens,
                estimatedCost: row.estimated_cost, costKnownAttempts: row.cost_known_attempts,
                costComplete: row.cost_known_attempts === row.attempts }))) });
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
        || (value.provider != null && (typeof value.provider !== 'string' || value.provider.trim() === ''
            || value.provider.trim().length > MAX_USAGE_PROVIDER_LENGTH))
        || (value.costKnown !== undefined && typeof value.costKnown !== 'boolean')
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
        provider: row.provider == null ? null : redactSecrets(row.provider, MAX_USAGE_PROVIDER_LENGTH),
        inputTokens: row.input_tokens, outputTokens: row.output_tokens,
        estimatedCost: row.estimated_cost, costKnown: row.cost_known === 1, durationMs: row.duration_ms,
        purpose: row.purpose === null ? null : redactSecrets(row.purpose, MAX_USAGE_PURPOSE_LENGTH),
        success: row.success === 1, createdAt: row.created_at,
    };
}
