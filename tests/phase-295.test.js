/** Phase 295 — sanitize employee result metadata outside the canonical summary. */
import { describe, expect, it } from 'vitest';
import { validateEmployeeTaskResult } from '../src/agents';

describe('Phase 295 — employee auxiliary output sanitation', () => {
    it('redacts secrets from file, test, and blocker strings', () => {
        const criteria = [{ id: 'criterion-295', description: 'Run the test', required: true, met: false }];
        const result = validateEmployeeTaskResult({
            status: 'BLOCKED',
            result: { summary: 'Blocked on an external service', acceptanceCriteria: [{ criterionId: 'criterion-295',
                met: true, evidence: 'test completed' }] },
            files: ['src/app.js?api_key=file-secret'],
            tests: ['Authorization: Bearer test-secret-value'],
            blockers: ['https://user:blocker-secret@example.test unavailable'],
        }, criteria);

        const serialized = JSON.stringify(result);
        expect(serialized).not.toMatch(/file-secret|test-secret-value|blocker-secret/);
        expect(result.files[0]).toContain('api_key=[redacted]');
        expect(result.tests[0]).toContain('Bearer [redacted]');
        expect(result.blockers[0]).toContain('user:[redacted]@example.test');
    });
});
