/** Phase 216 — redact credential-like data from the current-file label. */
import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';

describe('Phase 216 — current-file privacy', () => {
    it('shows only the basename and redacts credential patterns within it', () => {
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks: [], workspace: {
            folders: ['repo'], activeFile: 'C:\\private\\ghp_123456789012345678901234567890123456.js', languageId: 'javascript',
        } });
        expect(snapshot.workspace.activeFile).toBe('[redacted-github-token].js');
        expect(JSON.stringify(snapshot)).not.toContain('C:/private');
        expect(JSON.stringify(snapshot)).not.toContain('ghp_123456789012345678901234567890123456');
    });
});
