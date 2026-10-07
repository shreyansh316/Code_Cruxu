/** Phase 204 — bounded execution activity feed and Command Center visibility. */
import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';
import { renderCommandCenterHtml } from '../src/core/commandCenterView';
import { ExecutionActivityFeed } from '../src/core/ExecutionActivityFeed';

describe('Phase 204 — execution activity feed', () => {
    it('normalizes metadata from workspace, terminal, and verification observers', () => {
        const feed = new ExecutionActivityFeed({ clock: () => new Date('2026-10-05T10:00:00.000Z') });
        feed.record('workspace', { operation: 'write', path: 'src/api_key=private.js', bytes: 45, succeeded: true });
        feed.record('command', { event: 'finished', durationMs: 32, exitCode: 0, stdoutBytes: 12, stderrBytes: 0 });
        feed.record('verification', { event: 'finished', check: 'unit-tests', status: 'PASSED', durationMs: 140 });

        const records = feed.listRecent({ limit: 3 });
        expect(records.map(({ source, status }) => [source, status])).toEqual([
            ['verification', 'PASSED'], ['command', 'SUCCEEDED'], ['workspace', 'SUCCEEDED'],
        ]);
        expect(records[2].target).toContain('[redacted]');
        expect(JSON.stringify(records)).not.toContain('private.js');
        expect(records[0].occurredAt).toBe('2026-10-05T10:00:00.000Z');
    });

    it('retains a bounded newest-first window and ignores unsupported event shapes', () => {
        const feed = new ExecutionActivityFeed({ maxEntries: 2 });
        expect(feed.record('command', { event: 'output', text: 'secret' })).toBe(false);
        feed.record('verification', { event: 'finished', check: 'one', status: 'PASSED' });
        feed.record('verification', { event: 'finished', check: 'two', status: 'FAILED' });
        feed.record('verification', { event: 'finished', check: 'three', status: 'PASSED' });
        expect(feed.listRecent().map(({ target }) => target)).toEqual(['three', 'two']);
        expect(() => feed.listRecent({ limit: 101 })).toThrow(/between 1 and 100/);
    });

    it('renders only bounded execution activity fields in the Command Center snapshot', () => {
        const feed = new ExecutionActivityFeed();
        feed.record('command', { event: 'finished', durationMs: 250, exitCode: 1, stdoutBytes: 12, stderrBytes: 4 });
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks: [], executionActivity: feed.listRecent() });
        expect(snapshot.executionActivity[0]).toMatchObject({ action: 'Terminal command finished', status: 'FAILED', durationMs: 250, bytes: 16 });
        expect(renderCommandCenterHtml()).toContain('Workspace and execution activity');
        expect(JSON.stringify(snapshot)).not.toContain('stdout');
    });
});
