import { assertEntityId } from '../../shared/identifiers';
import { redactSecrets } from '../../shared/redactSecrets';

const MAX_CONTEXT = 20_000;
const MAX_DETAIL = 4_000;
const MAX_OPTION_COUNT = 20;
const MAX_EVIDENCE_COUNT = 50;
const MAX_ITEM_LENGTH = 2_000;

/** Persist complete, immutable engineering decision records with bounded, redacted fields. */
export class EngineeringDecisionRepository {
    constructor(database) {
        if (!database || typeof database.prepare !== 'function') throw new TypeError('EngineeringDecisionRepository requires a SQLite database handle.');
        this.database = database;
    }

    create(value) {
        const record = normalize(value);
        this.database.prepare(`INSERT INTO engineering_decisions
          (id, task_id, author_id, context, options_json, selected_option, rejected_options_json,
           reason, trade_offs_json, evidence_json, confidence)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(record.id, record.taskId, record.authorId, record.context, JSON.stringify(record.options),
                record.selectedOption, JSON.stringify(record.rejectedOptions), record.reason,
                JSON.stringify(record.tradeOffs), JSON.stringify(record.evidence), record.confidence);
        return this.getById(record.id);
    }

    getById(id) {
        id = assertEntityId(id, 'Decision id');
        return mapDecision(this.database.prepare('SELECT * FROM engineering_decisions WHERE id = ?').get(id));
    }

    listByTask(taskId, { limit = 100 } = {}) {
        taskId = assertEntityId(taskId, 'Decision task id');
        if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new TypeError('Decision query limit must be between 1 and 1000.');
        return this.database.prepare(`SELECT * FROM engineering_decisions WHERE task_id = ?
          ORDER BY created_at, id LIMIT ?`).all(taskId, limit).map(mapDecision);
    }

    /** Link two immutable decisions; database triggers enforce tenant scope and acyclic supersession. */
    createLink({ id, sourceDecisionId, targetDecisionId, relationship, authorId }) {
        id = assertEntityId(id, 'Decision link id');
        sourceDecisionId = assertEntityId(sourceDecisionId, 'Source decision id');
        targetDecisionId = assertEntityId(targetDecisionId, 'Target decision id');
        authorId = assertEntityId(authorId, 'Decision link author id');
        if (sourceDecisionId === targetDecisionId || !['SUPERSEDES', 'RELATED_TO'].includes(relationship)) {
            throw new TypeError('Engineering decision link is invalid.');
        }
        this.database.prepare(`INSERT INTO engineering_decision_links
          (id, source_decision_id, target_decision_id, relationship, created_by_agent_id)
          VALUES (?, ?, ?, ?, ?)`).run(id, sourceDecisionId, targetDecisionId, relationship, authorId);
        return this.listLinks(sourceDecisionId).find((link) => link.id === id);
    }

    listLinks(decisionId, { limit = 100 } = {}) {
        decisionId = assertEntityId(decisionId, 'Decision id');
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Decision link query limit must be between 1 and 100.');
        return this.database.prepare(`SELECT * FROM engineering_decision_links
          WHERE source_decision_id = ? OR target_decision_id = ? ORDER BY created_at, id LIMIT ?`)
            .all(decisionId, decisionId, limit).map((row) => Object.freeze({ id: row.id,
                sourceDecisionId: row.source_decision_id, targetDecisionId: row.target_decision_id,
                relationship: row.relationship, authorId: row.created_by_agent_id, createdAt: row.created_at }));
    }

    getOrganizationIdForDecision(decisionId) {
        decisionId = assertEntityId(decisionId, 'Decision id');
        return this.database.prepare(`SELECT o.organization_id FROM engineering_decisions d
          JOIN tasks t ON t.id = d.task_id JOIN projects p ON p.id = t.project_id
          JOIN objectives o ON o.id = p.objective_id WHERE d.id = ?`).get(decisionId)?.organization_id;
    }

    getDecisionTaskId(decisionId) {
        decisionId = assertEntityId(decisionId, 'Decision id');
        return this.database.prepare('SELECT task_id FROM engineering_decisions WHERE id = ?').get(decisionId)?.task_id;
    }

    searchByOrganization(organizationId, query, { limit = 20 } = {}) {
        organizationId = assertEntityId(organizationId, 'Decision organization id');
        if (typeof query !== 'string' || query.trim().length < 2 || query.length > 200
            || !Number.isInteger(limit) || limit < 1 || limit > 50) {
            throw new TypeError('Decision recall query or result bound is invalid.');
        }
        const pattern = `%${query.trim().replace(/[\\%_]/g, '\\$&')}%`;
        return this.database.prepare(`SELECT d.*, t.title AS task_title FROM engineering_decisions d
          JOIN tasks t ON t.id = d.task_id
          JOIN projects p ON p.id = t.project_id
          JOIN objectives o ON o.id = p.objective_id
          WHERE o.organization_id = ? AND (d.context LIKE ? ESCAPE '\\' OR d.reason LIKE ? ESCAPE '\\'
            OR d.selected_option LIKE ? ESCAPE '\\' OR t.title LIKE ? ESCAPE '\\')
          ORDER BY d.created_at DESC, d.id LIMIT ?`).all(organizationId, pattern, pattern, pattern, pattern, limit).map(mapDecision);
    }
}

function normalize(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
    const id = assertEntityId(value.id, 'Decision id');
    const taskId = assertEntityId(value.taskId, 'Decision task id');
    const authorId = assertEntityId(value.authorId, 'Decision author id');
    const context = boundedText(value.context, MAX_CONTEXT, 'Decision context');
    const options = stringList(value.options, MAX_OPTION_COUNT, 'Decision options', 2);
    const selectedOption = boundedText(value.selectedOption, MAX_ITEM_LENGTH, 'Selected option');
    const rejectedOptions = stringList(value.rejectedOptions, MAX_OPTION_COUNT, 'Rejected options', 0);
    const reason = boundedText(value.reason, MAX_DETAIL, 'Decision reason');
    const tradeOffs = stringList(value.tradeOffs, MAX_OPTION_COUNT, 'Decision trade-offs', 0);
    const evidence = stringList(value.evidence, MAX_EVIDENCE_COUNT, 'Decision evidence', 0);
    if (!options.includes(selectedOption) || rejectedOptions.includes(selectedOption)
        || rejectedOptions.some((option) => !options.includes(option))
        || new Set(options).size !== options.length
        || new Set(rejectedOptions).size !== rejectedOptions.length
        || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) invalid();
    return { id, taskId, authorId, context, options, selectedOption, rejectedOptions, reason, tradeOffs, evidence, confidence: value.confidence };
}

function boundedText(value, max, label) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new TypeError(`${label} must be non-empty bounded text.`);
    return redactSecrets(value.trim(), max);
}

function stringList(value, maxItems, label, minItems = 1) {
    if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) throw new TypeError(`${label} must contain ${minItems} to ${maxItems} entries.`);
    return value.map((item) => boundedText(item, MAX_ITEM_LENGTH, label));
}

function mapDecision(row) {
    if (!row) return undefined;
    try {
        return Object.freeze({ id: row.id, taskId: row.task_id, authorId: row.author_id, context: row.context,
            options: Object.freeze(parseStringArray(row.options_json)), selectedOption: row.selected_option,
            rejectedOptions: Object.freeze(parseStringArray(row.rejected_options_json)), reason: row.reason,
            tradeOffs: Object.freeze(parseStringArray(row.trade_offs_json)), evidence: Object.freeze(parseStringArray(row.evidence_json)),
            confidence: row.confidence, createdAt: row.created_at,
            ...(typeof row.task_title === 'string' ? { taskTitle: row.task_title } : {}) });
    } catch {
        throw new TypeError('Persisted engineering decision record is malformed.');
    }
}

function parseStringArray(value) {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) throw new TypeError('Invalid decision array.');
    return parsed;
}

function invalid() {
    throw new TypeError('Engineering decision record is invalid or exceeds its bounds.');
}
