import { DomainInvariantError } from './errors';
import { redactSecrets } from '../shared/redactSecrets';

export const CODE_EXPLANATION_ACTIONS = Object.freeze([
    'WHY_THIS', 'WHY_NOT_THAT', 'EXPLAIN_FILE', 'EXPLAIN_CHANGE', 'SHOW_ALTERNATIVES',
    'CHALLENGE', 'FIND_WEAKNESSES', 'SIMPLIFY', 'REVIEW_SECURITY', 'REVIEW_PERFORMANCE',
    'REVIEW_TOKEN_COST', 'FIX',
]);

export const CODE_EXPLANATION_SECTIONS = Object.freeze([
    'CHANGE', 'WHY', 'REQUIREMENT', 'CONTEXT', 'ALTERNATIVES', 'REJECTED_OPTIONS',
    'TRADE_OFFS', 'RISKS', 'TESTS',
]);
export const CODE_EXPLANATION_SOURCES = Object.freeze([
    'ORIGINAL_DECISION', 'RECONSTRUCTED_DECISION', 'INFERENCE', 'ASSUMPTION', 'RECOMMENDATION', 'UNKNOWN',
]);

const MAX_EVIDENCE_ITEMS = 100;
const MAX_CLAIMS_PER_SECTION = 20;

/**
 * Create a display-safe explanation from supplied claims and cited records.
 * This projector does not generate rationale: absent claims remain absent,
 * and every returned claim must cite evidence supplied by its caller.
 */
export function createCodeExplanation({ action, selected, sections = {}, evidence = [], confidence = 'UNASSESSED' } = {}) {
    if (!CODE_EXPLANATION_ACTIONS.includes(action) || typeof selected !== 'string' || !selected.trim()
        || !Array.isArray(evidence) || evidence.length > MAX_EVIDENCE_ITEMS
        || !sections || typeof sections !== 'object' || Array.isArray(sections)
        || !['HIGH', 'MEDIUM', 'LOW', 'UNASSESSED'].includes(confidence)) {
        throw new DomainInvariantError('invalid-code-explanation', 'A supported explanation action and bounded evidence are required.');
    }

    const evidenceById = new Map();
    for (const item of evidence) {
        if (!item || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 160
            || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(item.id)
            || evidenceById.has(item.id) || typeof item.type !== 'string' || !item.type.trim()
            || typeof item.label !== 'string' || !item.label.trim()) {
            throw new DomainInvariantError('invalid-code-explanation-evidence', 'Explanation evidence needs unique IDs, types, and labels.');
        }
        evidenceById.set(item.id, Object.freeze({ id: item.id, type: item.type.trim().slice(0, 40), label: redactSecrets(item.label.trim(), 200) }));
    }

    const usedEvidence = new Set();
    const normalizedSections = {};
    for (const name of CODE_EXPLANATION_SECTIONS) {
        const claims = sections[name] ?? [];
        if (!Array.isArray(claims) || claims.length > MAX_CLAIMS_PER_SECTION) {
            throw new DomainInvariantError('invalid-code-explanation-claims', `Explanation section ${name} exceeds its claim limit.`);
        }
        normalizedSections[name] = Object.freeze(claims.map((claim) => {
            if (!claim || typeof claim.text !== 'string' || !claim.text.trim() || claim.text.length > 1000
                || (claim.source !== undefined && !CODE_EXPLANATION_SOURCES.includes(claim.source))
                || !Array.isArray(claim.evidenceIds) || claim.evidenceIds.length < 1 || claim.evidenceIds.length > 10) {
                throw new DomainInvariantError('uncited-code-explanation-claim', `Every ${name} claim must cite evidence.`);
            }
            const evidenceIds = [...new Set(claim.evidenceIds)];
            if (evidenceIds.some((id) => !evidenceById.has(id))) {
                throw new DomainInvariantError('unknown-code-explanation-evidence', `A ${name} claim references missing evidence.`);
            }
            const source = claim.source ?? 'UNKNOWN';
            if (source === 'ORIGINAL_DECISION'
                && evidenceIds.some((id) => !['decision', 'decision-record'].includes(evidenceById.get(id).type.toLowerCase()))) {
                throw new DomainInvariantError('unsupported-code-explanation-provenance',
                    'Original-decision claims must cite an explicit decision record.');
            }
            evidenceIds.forEach((id) => usedEvidence.add(id));
            return Object.freeze({ text: redactSecrets(claim.text.trim(), 500),
                source, evidenceIds: Object.freeze(evidenceIds) });
        }));
    }

    return Object.freeze({
        action,
        selected: redactSecrets(selected.trim(), 240),
        sections: Object.freeze(normalizedSections),
        evidence: Object.freeze([...usedEvidence].map((id) => evidenceById.get(id))),
        confidence,
    });
}
