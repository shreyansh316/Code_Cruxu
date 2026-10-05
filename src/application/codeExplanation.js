import { createCodeExplanation, createEntityId, DomainInvariantError,
    CODE_EXPLANATION_ACTIONS, CODE_EXPLANATION_SECTIONS, CODE_EXPLANATION_SOURCES } from '../domain';
import { ApplicationError, createUseCase } from './useCase';
import { createCodeExplanationPrompt } from './codeExplanationPrompt';

const EXPLANATION_OUTPUT_SCHEMA = Object.freeze({
    type: 'object', additionalProperties: false,
    required: [...CODE_EXPLANATION_SECTIONS, 'confidence'],
    properties: {
        ...Object.fromEntries(CODE_EXPLANATION_SECTIONS.map((section) => [section, {
            type: 'array', maxItems: 20, items: { type: 'object', additionalProperties: false,
                required: ['text', 'source', 'evidenceIds'], properties: {
                    text: { type: 'string', minLength: 1, maxLength: 500 },
                    source: { type: 'string', enum: CODE_EXPLANATION_SOURCES },
                    evidenceIds: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string' } },
                } },
        }])),
        confidence: { type: 'string', enum: ['UNASSESSED'] },
    },
});

/** Convert verified review records into factual claims without generating rationale. */
export function createReviewEvidenceExplanation(bundle, { action = 'EXPLAIN_CHANGE', selected = 'Reviewed code change' } = {}) {
    if (!bundle || bundle.schemaVersion !== 1 || !bundle.provenance
        || typeof bundle.provenance.head !== 'string' || !/^[a-f0-9]{40,64}$/i.test(bundle.provenance.head)
        || !Array.isArray(bundle.checks) || !bundle.changes
        || ['added', 'modified', 'deleted', 'renamed'].some((name) => !Array.isArray(bundle.changes[name])) || !bundle.acceptance
        || !Array.isArray(bundle.acceptance.criteria)) {
        throw new DomainInvariantError('invalid-review-explanation-source', 'A validated review evidence bundle is required.');
    }
    const evidence = [];
    const sections = {};
    const addEvidence = (id, type, label) => {
        evidence.push({ id, type, label });
        return id;
    };

    const changeId = addEvidence('workspace-changes', 'source', 'Before and after workspace snapshot comparison');
    const changes = bundle.changes;
    const changeCounts = [
        ['added', changes.added], ['modified', changes.modified], ['deleted', changes.deleted], ['renamed', changes.renamed],
    ];
    sections.CHANGE = changeCounts.filter(([, records]) => Array.isArray(records) && records.length > 0)
        .map(([kind, records]) => ({ text: `${records.length} ${kind} file change(s) were recorded.`,
            source: 'RECONSTRUCTED_DECISION', evidenceIds: [changeId] }));

    const requirementId = addEvidence('persisted-acceptance', 'requirement', 'Persisted task acceptance evidence');
    if (typeof bundle.acceptance.summary === 'string' && bundle.acceptance.summary.trim()) {
        sections.REQUIREMENT = [{ text: bundle.acceptance.summary, source: 'RECONSTRUCTED_DECISION', evidenceIds: [requirementId] }];
    }
    if (bundle.acceptance.criteria.length > 0) {
        sections.REQUIREMENT = [...(sections.REQUIREMENT ?? []), ...bundle.acceptance.criteria.slice(0, 20)
            .filter((criterion) => criterion && typeof criterion.criterionId === 'string' && typeof criterion.evidence === 'string')
            .map((criterion) => ({ text: `Acceptance criterion ${criterion.criterionId}: ${criterion.met ? 'met' : 'not met'}; ${criterion.evidence}`,
                source: 'RECONSTRUCTED_DECISION',
                evidenceIds: [requirementId] }))];
    }

    sections.TESTS = [];
    sections.RISKS = [];
    for (const [index, check] of bundle.checks.slice(0, 20).entries()) {
        if (!check || typeof check.id !== 'string' || typeof check.status !== 'string') continue;
        const evidenceId = addEvidence(`verification-${index}`, 'test', `Verification check: ${check.id}`);
        sections.TESTS.push({ text: `Check ${check.id} finished with status ${check.status}${Number.isInteger(check.exitCode) ? ` (exit ${check.exitCode})` : ''}.`,
            source: 'RECONSTRUCTED_DECISION',
            evidenceIds: [evidenceId] });
        if (check.status !== 'PASSED') {
            sections.RISKS.push({ text: `Check ${check.id} did not pass (${check.status}).`,
                source: 'RECONSTRUCTED_DECISION', evidenceIds: [evidenceId] });
        }
    }

    return createCodeExplanation({ action, selected, sections, evidence, confidence: 'UNASSESSED' });
}

/** Validate model JSON against the original selection and trusted evidence catalogue. */
export function parseCodeExplanationResponse({ action, selected, response, evidence = [] } = {}) {
    if (!CODE_EXPLANATION_ACTIONS.includes(action) || typeof selected !== 'string' || !selected.trim()
        || typeof response !== 'string' || Buffer.byteLength(response, 'utf8') > 32 * 1024 || !Array.isArray(evidence)) {
        throw new DomainInvariantError('invalid-code-explanation-response', 'Explanation response or its evidence envelope is invalid.');
    }
    let parsed;
    try { parsed = JSON.parse(response); }
    catch {
        throw new DomainInvariantError('invalid-code-explanation-response', 'Explanation response must be valid JSON.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
        || Object.keys(parsed).some((key) => ![...CODE_EXPLANATION_SECTIONS, 'confidence'].includes(key))
        || [...CODE_EXPLANATION_SECTIONS, 'confidence'].some((key) => !Object.hasOwn(parsed, key))) {
        throw new DomainInvariantError('invalid-code-explanation-response', 'Explanation response has missing or unsupported fields.');
    }
    if (parsed.confidence !== undefined && parsed.confidence !== 'UNASSESSED') {
        throw new DomainInvariantError('invalid-code-explanation-confidence', 'AI confidence requires calibration evidence and must remain unassessed.');
    }
    return createCodeExplanation({ action, selected, sections: parsed, evidence, confidence: parsed.confidence ?? 'UNASSESSED' });
}

/** Run the explain-code contract through the injected, budgeted AI provider port. */
export function createCodeExplanationUseCase({ provider, idFactory } = {}) {
    if (typeof provider?.generate !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Code explanation requires a bounded AI provider and request ID factory.');
    }
    return createUseCase({ name: 'code-explanation', dependencies: { provider, idFactory },
        execute: async ({ input, dependencies }) => {
            const prompt = createCodeExplanationPrompt(input);
            const request = {
                requestId: createEntityId(dependencies.idFactory()), model: input.model,
        systemPrompt: prompt.system, input: prompt.user, outputSchema: EXPLANATION_OUTPUT_SCHEMA,
            };
            const options = { purpose: 'code-explanation', budget: input.budget };
            if (input.signal) options.signal = input.signal;
            const result = await dependencies.provider.generate(request, options);
            if (result?.finishReason === 'ERROR') {
                throw new ApplicationError(result.errorCode ?? 'code-explanation-provider-error',
                    'Code explanation could not be completed.', { retryable: true });
            }
            if (result?.finishReason !== 'STOP') {
                throw new ApplicationError('code-explanation-incomplete', 'Code explanation did not produce a complete response.');
            }
            const response = typeof result.output === 'string' ? result.output : JSON.stringify(result.output);
            const explanation = parseCodeExplanationResponse({ action: input.action, selected: input.selected,
                response, evidence: input.evidence });
            return Object.freeze({ explanation, usage: result.usage });
        },
    });
}
