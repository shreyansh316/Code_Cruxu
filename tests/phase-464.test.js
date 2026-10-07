/** Phase 464 — CommandCenter snapshot shaping extracted from CommandCenterPanel. */
import { describe, expect, it } from 'vitest';
import { COMMAND_CENTER_SECTIONS, createCommandCenterSnapshot } from '../src/core/commandCenterSnapshot';
import { CommandCenterPanel, createCommandCenterSnapshot as panelSnapshotExport } from '../src/core/CommandCenterPanel';
import { renderCommandCenterHtml } from '../src/core/commandCenterView';

describe('Phase 464 — commandCenterSnapshot module architecture', () => {
    it('exports createCommandCenterSnapshot and COMMAND_CENTER_SECTIONS', () => {
        expect(typeof createCommandCenterSnapshot).toBe('function');
        expect(COMMAND_CENTER_SECTIONS instanceof Set).toBe(true);
        expect(COMMAND_CENTER_SECTIONS.has('objectives')).toBe(true);
        expect(COMMAND_CENTER_SECTIONS.has('tasks')).toBe(true);
        expect(COMMAND_CENTER_SECTIONS.has('operational-health')).toBe(true);
        expect(COMMAND_CENTER_SECTIONS.has('current-work')).toBe(true);
    });

    it('preserves 100% backwards-compatible re-exports on CommandCenterPanel', () => {
        expect(panelSnapshotExport).toBe(createCommandCenterSnapshot);
        expect(typeof CommandCenterPanel).toBe('function');
    });

    it('rejects malformed snapshot inputs with TypeError', () => {
        expect(() => createCommandCenterSnapshot({})).toThrow(TypeError);
        expect(() => createCommandCenterSnapshot({ objectives: 'not-array' })).toThrow(TypeError);
        expect(() => createCommandCenterSnapshot({
            objectives: [],
            tasks: [],
            directorQuestions: [],
            activity: [],
            executionActivity: [],
            changedFiles: [],
            agents: [],
            offices: [],
            departments: [],
            organizations: [],
            collapsedSections: 'invalid',
        })).toThrow(TypeError);
    });
});

describe('Phase 464 — deterministic snapshot shaping behavior', () => {
    it('constructs frozen, bounded snapshot with defaults and expected keys', () => {
        const snapshot = createCommandCenterSnapshot({
            objectives: [{ id: 'obj-1', title: 'Ship Phase 464', status: 'IN_PROGRESS' }],
            tasks: [
                { id: 't-1', title: 'Decompose panel', status: 'COMPLETED', createdAt: '2026-10-08T00:00:00Z', updatedAt: '2026-10-08T00:05:00Z' },
                { id: 't-2', title: 'Verify matrix', status: 'IN_PROGRESS', createdAt: '2026-10-08T00:05:00Z' },
            ],
            directorQuestions: [],
            activity: [{ action: 'extract', entity: 'snapshot', createdAt: '2026-10-08T00:01:00Z' }],
            executionActivity: [],
            agents: [{ id: 'ag-1', name: 'Director Agent' }],
            offices: [],
            departments: [],
            organizations: [],
            collapsedSections: ['objectives'],
            changedFiles: [{ path: 'src/core/commandCenterSnapshot.js', status: 'ADDED' }],
            workspace: { folders: ['/workspace/headroom'], activeFile: '/workspace/headroom/src/core/CommandCenterPanel.js' },
            executionStatus: 'RUNNING',
            capturedAt: Date.parse('2026-10-08T00:10:00Z'),
        });

        expect(Object.isFrozen(snapshot)).toBe(true);
        expect(snapshot.executionStatus).toBe('RUNNING');
        expect(snapshot.objectives).toHaveLength(1);
        expect(snapshot.objectives[0].title).toBe('Ship Phase 464');
        expect(snapshot.activeTasks).toHaveLength(1);
        expect(snapshot.activeTasks[0].title).toBe('Verify matrix');
        expect(snapshot.completedTasks).toHaveLength(1);
        expect(snapshot.completedTasks[0].durationMs).toBe(300000);
        expect(snapshot.collapsedSections).toEqual(['objectives']);
        expect(snapshot.workspace.folders).toEqual(['/workspace/headroom']);
        expect(snapshot.workspace.activeFile).toBe('CommandCenterPanel.js');
    });

    it('shapes operational health and current work sub-snapshots when provided', () => {
        const snapshot = createCommandCenterSnapshot({
            objectives: [],
            tasks: [{ id: 't-1', title: 'Active Task', status: 'IN_PROGRESS' }],
            directorQuestions: [],
            activity: [],
            executionActivity: [],
            agents: [],
            offices: [],
            departments: [],
            organizations: [],
            collapsedSections: [],
            changedFiles: [],
            operationalHealth: [
                { id: 'db', label: 'SQLite', status: 'HEALTHY', detail: 'Migration 10 applied' },
                { id: 'provider', label: 'Gemini', status: 'READY', detail: 'Bounded quota active' },
            ],
            currentWork: {
                activePhase: 'Phase 464',
                detail: 'Decomposing CommandCenterPanel',
            },
        });

        expect(snapshot.operationalHealth).toHaveLength(2);
        expect(snapshot.operationalHealth[0]).toEqual({
            id: 'db',
            label: 'SQLite',
            status: 'HEALTHY',
            detail: 'Migration 10 applied',
        });
        expect(snapshot.currentWork).toMatchObject({
            executionStatus: 'RUNNING',
            executingTaskCount: 1,
            activePhase: 'Phase 464',
            detail: 'Decomposing CommandCenterPanel',
        });
    });
});
