/** Phase 217 — redact credential-like data from workspace labels. */
import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';

describe('Phase 217 — workspace label privacy', () => {
    it('keeps bounded folder labels while redacting credential patterns', () => {
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks: [], workspace: {
            folders: ['ghp_123456789012345678901234567890123456-project'], activeFile: '', languageId: '',
        } });
        expect(snapshot.workspace.folders[0]).toContain('[redacted-github-token]');
        expect(JSON.stringify(snapshot)).not.toContain('ghp_123456789012345678901234567890123456');
    });
});
