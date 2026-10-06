import { createCodeExplanation, DomainInvariantError } from '../domain';

/** Project persisted engineering decisions into cited claims; this function invents no rationale. */
export function createDecisionEvidenceExplanation(records, { action = 'WHY_THIS', selected = 'Persisted engineering decisions' } = {}) {
    if (!Array.isArray(records) || records.length > 20) {
        throw new DomainInvariantError('invalid-decision-explanation-source', 'At most 20 persisted decision records can be projected.');
    }
    const evidence = [];
    const sections = { WHY: [], ALTERNATIVES: [], REJECTED_OPTIONS: [], TRADE_OFFS: [] };
    for (const record of records) {
        if (!record || typeof record.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(record.id)
            || typeof record.taskTitle !== 'string' || !record.taskTitle.trim()
            || typeof record.selectedOption !== 'string' || !record.selectedOption.trim()
            || typeof record.reason !== 'string' || !record.reason.trim()
            || !Array.isArray(record.options) || record.options.length < 2 || record.options.length > 20
            || !Array.isArray(record.rejectedOptions) || record.rejectedOptions.length > 20
            || !Array.isArray(record.tradeOffs) || record.tradeOffs.length > 20
            || [...record.options, ...record.rejectedOptions, ...record.tradeOffs].some((item) => typeof item !== 'string' || !item.trim() || item.length > 2000)) {
            throw new DomainInvariantError('invalid-decision-explanation-record', 'Only complete persisted decision records can support original-decision claims.');
        }
        const evidenceId = `decision-record:${record.id}`;
        evidence.push({ id: evidenceId, type: 'decision-record',
            label: `${record.taskTitle}: selected ${record.selectedOption}` });
        sections.WHY.push({ text: `Recorded decision reason: ${record.reason}`, source: 'ORIGINAL_DECISION', evidenceIds: [evidenceId] });
        sections.ALTERNATIVES.push({ text: `Recorded options: ${record.options.join('; ')}`, source: 'ORIGINAL_DECISION', evidenceIds: [evidenceId] });
        if (record.rejectedOptions.length) sections.REJECTED_OPTIONS.push({
            text: `Recorded rejected options: ${record.rejectedOptions.join('; ')}`, source: 'ORIGINAL_DECISION', evidenceIds: [evidenceId] });
        if (record.tradeOffs.length) sections.TRADE_OFFS.push({
            text: `Recorded trade-offs: ${record.tradeOffs.join('; ')}`, source: 'ORIGINAL_DECISION', evidenceIds: [evidenceId] });
    }
    return createCodeExplanation({ action, selected, sections, evidence, confidence: 'UNASSESSED' });
}
