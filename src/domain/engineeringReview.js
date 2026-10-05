import { DomainInvariantError } from './errors';
import { redactSecrets } from '../shared/redactSecrets';

export const ENGINEERING_REVIEW_AREAS = Object.freeze([
    'FULL', 'CORRECTNESS', 'BUGS', 'REGRESSIONS', 'COMPLEXITY', 'DUPLICATION', 'ARCHITECTURE',
    'SECURITY', 'PERFORMANCE', 'MAINTAINABILITY', 'TEST_COVERAGE', 'ERROR_HANDLING',
    'BOUNDARIES', 'DEPENDENCY_RISK', 'TOKEN_EFFICIENCY',
]);

export const ENGINEERING_REVIEW_SEVERITIES = Object.freeze(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);
const MAX_FINDINGS = 20;
const MAX_SPECULATIONS = 20;

/** Normalize a review while separating cited defects from unverified hypotheses. */
export function createEngineeringReview({ area = 'FULL', selected, findings = [], speculations = [], evidence = [] } = {}) {
    if (!ENGINEERING_REVIEW_AREAS.includes(area) || typeof selected !== 'string' || !selected.trim()
        || !Array.isArray(findings) || findings.length > MAX_FINDINGS
        || !Array.isArray(speculations) || speculations.length > MAX_SPECULATIONS
        || !Array.isArray(evidence) || evidence.length > 100) {
        throw new DomainInvariantError('invalid-engineering-review', 'Engineering review scope and result sets must be bounded.');
    }
    const known = new Map();
    for (const item of evidence) {
        if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(item.id)
            || known.has(item.id) || typeof item.type !== 'string' || !item.type.trim()
            || typeof item.label !== 'string' || !item.label.trim()
            || (item.excerpt !== undefined && (typeof item.excerpt !== 'string' || item.excerpt.length > 8000))) {
            throw new DomainInvariantError('invalid-engineering-review-evidence', 'Review evidence requires unique IDs, types, and labels.');
        }
        known.set(item.id, Object.freeze({ id: item.id, type: item.type.trim().slice(0, 40), label: redactSecrets(item.label.trim(), 200),
            ...(item.excerpt === undefined ? {} : { excerpt: redactSecrets(item.excerpt, 8000) }) }));
    }
    const used = new Set();
    const normalizedFindings = findings.map((finding, index) => {
        if (finding?.confidence !== undefined && finding.confidence !== 'UNASSESSED') {
            throw new DomainInvariantError('invalid-engineering-review-confidence', 'Finding confidence remains unassessed without calibration evidence.');
        }
        if (!finding || typeof finding.id !== 'string' || !finding.id.trim() || finding.id.length > 80
            || findings.slice(0, index).some((previous) => previous?.id === finding.id)
            || !ENGINEERING_REVIEW_SEVERITIES.includes(finding.severity)
            || !validText(finding.title, 200) || !validText(finding.whyItMatters, 500)
            || !validText(finding.recommendedFix, 500) || !validEvidenceIds(finding.evidenceIds, known)
            || !validEvidenceQuotes(finding.evidenceQuotes, finding.evidenceIds, known)) {
            throw new DomainInvariantError('invalid-engineering-review-finding', 'Each finding needs a severity, explanation, recommendation, and valid evidence.');
        }
        finding.evidenceIds.forEach((id) => used.add(id));
        return Object.freeze({ id: finding.id, title: redactSecrets(finding.title.trim(), 200), severity: finding.severity,
            confidence: 'UNASSESSED',
            whyItMatters: redactSecrets(finding.whyItMatters.trim(), 500),
            recommendedFix: redactSecrets(finding.recommendedFix.trim(), 500),
            alternatives: Object.freeze(normalizeAlternatives(finding.alternatives ?? [], known, used)),
            evidenceQuotes: Object.freeze(finding.evidenceQuotes.map((quote) => Object.freeze({
                evidenceId: quote.evidenceId, text: redactSecrets(quote.text.trim(), 300),
            }))),
            evidenceIds: Object.freeze([...new Set(finding.evidenceIds)]) });
    });
    const normalizedSpeculations = speculations.map((item) => {
        if (!item || !validText(item.hypothesis, 400) || !validText(item.neededEvidence, 400)
            || (item.evidenceIds !== undefined && !validEvidenceIds(item.evidenceIds, known, true))) {
            throw new DomainInvariantError('invalid-engineering-review-speculation', 'Unverified concerns must state a hypothesis and the evidence needed to verify it.');
        }
        (item.evidenceIds ?? []).forEach((id) => used.add(id));
        return Object.freeze({ hypothesis: redactSecrets(item.hypothesis.trim(), 400),
            neededEvidence: redactSecrets(item.neededEvidence.trim(), 400),
            evidenceIds: Object.freeze([...(item.evidenceIds ?? [])]) });
    });
    return Object.freeze({ area, selected: redactSecrets(selected.trim(), 240),
        findings: Object.freeze(normalizedFindings), speculations: Object.freeze(normalizedSpeculations),
        evidence: Object.freeze([...used].map((id) => known.get(id))) });
}

function normalizeAlternatives(value, known, used) {
    if (!Array.isArray(value) || value.length > 3) {
        throw new DomainInvariantError('invalid-engineering-review-alternatives', 'Review finding alternatives must be a bounded list.');
    }
    return value.map((item) => {
        if (!item || !validText(item.text, 300) || !validEvidenceIds(item.evidenceIds, known)
            || !validEvidenceQuotes(item.evidenceQuotes, item.evidenceIds, known)) {
            throw new DomainInvariantError('invalid-engineering-review-alternative', 'Each alternative must cite review evidence.');
        }
        item.evidenceIds.forEach((id) => used.add(id));
        return Object.freeze({ text: redactSecrets(item.text.trim(), 300), evidenceIds: Object.freeze([...new Set(item.evidenceIds)]),
            evidenceQuotes: Object.freeze(item.evidenceQuotes.map((quote) => Object.freeze({
                evidenceId: quote.evidenceId, text: redactSecrets(quote.text.trim(), 300),
            }))) });
    });
}

function validEvidenceIds(ids, known, allowEmpty = false) {
    return Array.isArray(ids) && ids.length <= 10 && (allowEmpty || ids.length > 0)
        && ids.every((id) => known.has(id));
}

function validEvidenceQuotes(quotes, evidenceIds, known) {
    return Array.isArray(quotes) && quotes.length > 0 && quotes.length <= 8
        && [...new Set(evidenceIds)].every((id) => quotes.some((quote) => quote?.evidenceId === id))
        && quotes.every((quote) => quote && typeof quote.evidenceId === 'string'
            && evidenceIds.includes(quote.evidenceId) && validText(quote.text, 300)
            && typeof known.get(quote.evidenceId)?.excerpt === 'string'
            && known.get(quote.evidenceId).excerpt.includes(quote.text.trim()));
}

function validText(value, max) { return typeof value === 'string' && !!value.trim() && value.length <= max; }
