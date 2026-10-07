import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';
import { renderCommandCenterHtml } from '../src/core/commandCenterView';

describe('Phase 114 — current workspace summary', () => {
    it('limits folder labels and exposes only the active filename and language, never its absolute path', () => {
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks: [], workspace: {
            folders: ['Headroom', 'Docs'], activeFile: 'D:\\private\\source\\secret.js', languageId: 'javascript',
        } });
        expect(snapshot.workspace).toEqual({ folders: ['Headroom', 'Docs'], activeFile: 'secret.js', languageId: 'javascript' });
        expect(JSON.stringify(snapshot)).not.toContain('D:\\private');
        expect(renderCommandCenterHtml()).toContain('No workspace folder or active file.');
        expect(renderCommandCenterHtml()).toContain('row.textContent = entry');
    });
});
