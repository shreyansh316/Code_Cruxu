/** Phase 221 — communicate terminal output truncation in activity. */
import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';
import { renderCommandCenterHtml } from '../src/core/commandCenterView';
import { ExecutionActivityFeed } from '../src/core/ExecutionActivityFeed';

describe('Phase 221 — terminal preview truncation', () => {
    it('preserves output truncation metadata through feed and snapshot normalization', () => {
        const feed = new ExecutionActivityFeed();
        feed.record('command', { event: 'finished', command: 'node', exitCode: 0,
            outputPreview: 'partial output', outputTruncated: true });
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks: [], executionActivity: feed.listRecent() });
        expect(snapshot.executionActivity[0]).toMatchObject({ detail: 'partial output', detailTruncated: true });
        expect(renderCommandCenterHtml()).toContain('[output truncated]');
    });
});
