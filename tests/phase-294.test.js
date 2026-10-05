/** Phase 294 — filter secret-bearing employee results before persistence boundaries. */
import { describe, expect, it } from 'vitest';
import { validateTaskResult } from '../src/domain';

describe('Phase 294 — employee result secret filtering', () => {
    it('redacts credentials in summaries and acceptance evidence before returning validated results', () => {
        const criteria = [{ id: 'criterion-294', description: 'Report verification', required: true, met: false }];
        const { result } = validateTaskResult({
            summary: 'Verified with api_key=summary-secret',
            acceptanceCriteria: [{ criterionId: 'criterion-294', met: true,
                evidence: 'Provider returned https://user:evidence-secret@example.test/status' }],
        }, criteria);

        expect(result.summary).toBe('Verified with api_key=[redacted]');
        expect(result.acceptanceCriteria[0].evidence).toContain('user:[redacted]@example.test');
        expect(JSON.stringify(result)).not.toMatch(/summary-secret|evidence-secret/);
    });

    it('preserves ordinary result text', () => {
        const criteria = [{ id: 'criterion-ordinary', description: 'Run tests', required: true, met: false }];
        const value = { summary: 'All unit tests passed.', acceptanceCriteria: [{ criterionId: 'criterion-ordinary',
            met: true, evidence: 'npm test completed with 10 tests passing.' }] };
        expect(validateTaskResult(value, criteria).result).toMatchObject({ summary: value.summary,
            acceptanceCriteria: [{ evidence: value.acceptanceCriteria[0].evidence }] });
    });
});
