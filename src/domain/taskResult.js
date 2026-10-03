import { DomainInvariantError } from './errors';
import { validateTaskAcceptanceCriteria } from './taskAcceptanceCriteria';

const MAX_RESULT_SUMMARY_LENGTH = 4_000;
const MAX_CRITERION_EVIDENCE_LENGTH = 2_000;
const MAX_RESULT_BYTES = 64_000;

/** Validate a submitted result and the evidence claimed for every planned criterion. */
export function validateTaskResult(value, criteria) {
    if (!isPlainObject(value) || typeof value.summary !== 'string'
        || value.summary.trim() === '' || value.summary.length > MAX_RESULT_SUMMARY_LENGTH
        || !Array.isArray(value.acceptanceCriteria)) {
        throw new DomainInvariantError('invalid-task-result', 'A task result requires a bounded summary and acceptance evidence array.');
    }
    if (!Array.isArray(criteria)) {
        throw new DomainInvariantError('invalid-task-acceptance-criteria', 'Task acceptance criteria must be an array.');
    }
    validateTaskAcceptanceCriteria(criteria);
    if (value.acceptanceCriteria.length !== criteria.length) {
        throw new DomainInvariantError('invalid-task-result', 'Result evidence must cover every acceptance criterion exactly once.');
    }
    const submitted = new Map();
    for (const evidence of value.acceptanceCriteria) {
        if (!isPlainObject(evidence) || typeof evidence.criterionId !== 'string'
            || typeof evidence.met !== 'boolean' || typeof evidence.evidence !== 'string'
            || evidence.evidence.trim() === '' || evidence.evidence.length > MAX_CRITERION_EVIDENCE_LENGTH
            || submitted.has(evidence.criterionId)) {
            throw new DomainInvariantError('invalid-task-result', 'Each criterion needs unique, bounded evidence and a boolean outcome.');
        }
        submitted.set(evidence.criterionId, evidence);
    }
    const acceptanceCriteria = criteria.map((criterion) => {
        const evidence = submitted.get(criterion.id);
        if (!evidence) {
            throw new DomainInvariantError('invalid-task-result', 'Result evidence must match the task acceptance criteria exactly.');
        }
        return { ...criterion, met: evidence.met };
    });
    const acceptance = validateTaskAcceptanceCriteria(acceptanceCriteria);
    if (!acceptance.valid) {
        throw new DomainInvariantError('task-acceptance-incomplete', 'Required acceptance criteria must be met before submitting a task for review.');
    }
    const result = {
        summary: value.summary.trim(),
        acceptanceCriteria: acceptanceCriteria.map((criterion) => ({
            criterionId: criterion.id,
            met: criterion.met,
            evidence: submitted.get(criterion.id).evidence.trim(),
        })),
    };
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_RESULT_BYTES) {
        throw new DomainInvariantError('invalid-task-result', `Task results cannot exceed ${MAX_RESULT_BYTES} bytes.`);
    }
    return { result, acceptanceCriteria };
}

function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
