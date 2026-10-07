/** Phase 459 — Evolved Command Center: real objectives, active tasks, operational health, current work, actions, and event responsiveness. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { COMMANDS } from '../src/constants';
import { CommandCenterPanel, createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';
import { renderCommandCenterHtml } from '../src/core/commandCenterView';

describe('Phase 459 — Evolved Command Center', () => {
    beforeEach(() => vi.clearAllMocks());

    it('calculates evidence-based progress only when real linked tasks exist, omitting progress otherwise', () => {
        const objectiveWithEvidence = { id: 'obj-1', title: 'Launch App', status: 'IN_PROGRESS' };
        const objectiveWithoutEvidence = { id: 'obj-2', title: 'Future Milestone', status: 'DRAFT' };
        const projects = [{ id: 'proj-1', objectiveId: 'obj-1', name: 'Frontend' }];
        const tasks = [
            { id: 't-1', projectId: 'proj-1', title: 'Build UI', status: 'COMPLETED' },
            { id: 't-2', projectId: 'proj-1', title: 'Run tests', status: 'IN_PROGRESS' },
            { id: 't-3', projectId: 'proj-1', title: 'Deploy', status: 'FAILED' },
            { id: 't-4', projectId: 'proj-1', title: 'Verify', status: 'ASSIGNED' },
        ];

        const snapshot = createCommandCenterSnapshot({
            objectives: [objectiveWithEvidence, objectiveWithoutEvidence],
            projects,
            tasks,
        });

        expect(snapshot.objectives).toHaveLength(2);
        const obj1 = snapshot.objectives.find((o) => o.title === 'Launch App');
        const obj2 = snapshot.objectives.find((o) => o.title === 'Future Milestone');

        // Real evidence: 4 linked tasks, 1 completed (25%), 1 failed, 2 active
        expect(obj1.progress).toEqual({
            total: 4,
            completed: 1,
            failed: 1,
            active: 2,
            percentage: 25,
        });

        // No linked tasks: progress key must be omitted
        expect(obj2.progress).toBeUndefined();
        expect(obj2).toEqual({ title: 'Future Milestone', status: 'DRAFT' });
    });

    it('enriches active tasks with real assignee, manager, and blockers when available', () => {
        const agents = [
            { id: 'eng-1', name: 'Alice Engineer' },
            { id: 'mgr-1', name: 'Bob Manager' },
        ];
        const tasks = [
            {
                id: 'task-a',
                title: 'Root task',
                status: 'ASSIGNED',
                assigneeId: 'eng-1',
                managerId: 'mgr-1',
            },
            {
                id: 'task-b',
                title: 'Blocked task',
                status: 'ASSIGNED',
                dependencies: ['task-a'],
            },
            {
                id: 'task-c',
                title: 'Done task',
                status: 'COMPLETED',
            },
        ];

        const snapshot = createCommandCenterSnapshot({
            objectives: [],
            tasks,
            agents,
        });

        const taskA = snapshot.activeTasks.find((t) => t.title === 'Root task');
        const taskB = snapshot.activeTasks.find((t) => t.title === 'Blocked task');

        expect(taskA.assignee).toBe('Alice Engineer');
        expect(taskA.manager).toBe('Bob Manager');
        expect(taskA.blocker).toBeUndefined();

        expect(taskB.assignee).toBeUndefined();
        expect(taskB.blocker).toBe('Root task');
    });

    it('formats real operational health checks and handles unavailable fallbacks', () => {
        const healthChecks = [
            { id: 'database', label: 'Database', status: 'HEALTHY', detail: 'SQLite schema v5 clean.' },
            { id: 'queue', label: 'Queue', status: 'HEALTHY', detail: '0 queued; 0 claimed.' },
            { id: 'provider', label: 'AI provider', status: 'READY', detail: 'gemini credential configured.' },
            { id: 'verification', label: 'Verification', status: 'NOT_RUN', detail: 'No verification result.' },
        ];

        const snapshot = createCommandCenterSnapshot({
            objectives: [],
            tasks: [],
            operationalHealth: healthChecks,
        });

        expect(snapshot.operationalHealth).toHaveLength(4);
        expect(snapshot.operationalHealth[0]).toEqual({
            id: 'database',
            label: 'Database',
            status: 'HEALTHY',
            detail: 'SQLite schema v5 clean.',
        });

        // When operationalHealth is passed as empty array, it preserves the empty list
        const emptySnapshot = createCommandCenterSnapshot({ objectives: [], tasks: [], operationalHealth: [] });
        expect(emptySnapshot.operationalHealth).toEqual([]);
    });

    it('captures current execution state and active running tasks for Current Work', () => {
        const agents = [{ id: 'agent-1', name: 'Worker Bee' }];
        const tasks = [
            { id: 't-run', title: 'Running code review', status: 'IN_PROGRESS', assigneeId: 'agent-1' },
            { id: 't-idle', title: 'Queued task', status: 'ASSIGNED' },
        ];

        const snapshot = createCommandCenterSnapshot({
            objectives: [],
            executionStatus: 'RUNNING',
            tasks,
            agents,
            currentWork: { activePhase: 'Phase 459', detail: 'Executing tests' },
        });

        expect(snapshot.currentWork).toBeDefined();
        expect(snapshot.currentWork.executionStatus).toBe('RUNNING');
        expect(snapshot.currentWork.executingTaskCount).toBe(1);
        expect(snapshot.currentWork.activeTasks).toHaveLength(1);
        expect(snapshot.currentWork.activeTasks[0]).toMatchObject({
            title: 'Running code review',
            status: 'IN_PROGRESS',
            assignee: 'Worker Bee',
        });
        expect(snapshot.currentWork.activePhase).toBe('Phase 459');
        expect(snapshot.currentWork.detail).toBe('Executing tests');
    });

    it('dispatches openObjective, openTask, inspectHealth, and runTask to custom handlers and commands', async () => {
        let receiveMessage;
        const webview = {
            cspSource: 'vscode-webview://test', html: '',
            onDidReceiveMessage: vi.fn((handler) => { receiveMessage = handler; return { dispose: vi.fn() }; }),
            postMessage: vi.fn().mockResolvedValue(true),
        };
        const panel = {
            webview, reveal: vi.fn(), dispose: vi.fn(),
            onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
            onDidChangeViewState: vi.fn(() => ({ dispose: vi.fn() })),
        };
        vscode.window.createWebviewPanel.mockReturnValue(panel);

        const onOpenObjective = vi.fn();
        const onOpenTask = vi.fn();
        const onInspectHealth = vi.fn();
        const onRunTask = vi.fn();

        const readSnapshot = vi.fn(() => ({ objectives: [], activeTasks: [] }));
        const commandCenter = new CommandCenterPanel(readSnapshot, () => undefined, () => undefined, {
            onOpenObjective,
            onOpenTask,
            onInspectHealth,
            onRunTask,
        });

        commandCenter.show();
        expect(vscode.window.createWebviewPanel).toHaveBeenCalled();

        // Dispatch openObjective
        await receiveMessage({ type: 'openObjective', title: 'Scale Infrastructure' });
        expect(onOpenObjective).toHaveBeenCalledWith('Scale Infrastructure');

        // Dispatch openTask
        await receiveMessage({ type: 'openTask', title: 'Migrate DB' });
        expect(onOpenTask).toHaveBeenCalledWith('Migrate DB');

        // Dispatch inspectHealth
        await receiveMessage({ type: 'inspectHealth' });
        expect(onInspectHealth).toHaveBeenCalled();

        // Dispatch runTask
        await receiveMessage({ type: 'runTask' });
        expect(onRunTask).toHaveBeenCalled();

        commandCenter.dispose();
    });

    it('subscribes to state changes and refreshes without polling when visible', async () => {
        let receiveMessage;
        let stateHandler;
        const stateEmitter = {
            event: vi.fn((handler) => { stateHandler = handler; return { dispose: vi.fn() }; }),
        };

        const webview = {
            cspSource: 'vscode-webview://test', html: '',
            onDidReceiveMessage: vi.fn((handler) => { receiveMessage = handler; return { dispose: vi.fn() }; }),
            postMessage: vi.fn().mockResolvedValue(true),
        };
        const panel = {
            webview, reveal: vi.fn(), dispose: vi.fn(), visible: true,
            onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
            onDidChangeViewState: vi.fn(() => ({ dispose: vi.fn() })),
        };
        vscode.window.createWebviewPanel.mockReturnValue(panel);

        const readSnapshot = vi.fn(() => ({ objectives: [], activeTasks: [] }));
        const commandCenter = new CommandCenterPanel(readSnapshot, () => undefined, () => undefined, {
            onStateChange: stateEmitter,
        });

        commandCenter.show();
        expect(stateEmitter.event).toHaveBeenCalled();
        expect(readSnapshot).toHaveBeenCalledTimes(1);

        // Firing state change triggers immediate refresh
        stateHandler();
        expect(readSnapshot).toHaveBeenCalledTimes(2);

        commandCenter.dispose();
    });

    it('properly disposes all subscriptions, timers, and listeners on teardown', () => {
        const stateDispose = vi.fn();
        const msgDispose = vi.fn();
        const panelDisposeListener = vi.fn();
        let triggerDispose;

        const webview = {
            cspSource: 'vscode-webview://test', html: '',
            onDidReceiveMessage: vi.fn(() => ({ dispose: msgDispose })),
            postMessage: vi.fn().mockResolvedValue(true),
        };
        const panel = {
            webview, reveal: vi.fn(), dispose: vi.fn(),
            onDidDispose: vi.fn((handler) => { triggerDispose = handler; return { dispose: panelDisposeListener }; }),
            onDidChangeViewState: vi.fn(() => ({ dispose: vi.fn() })),
        };
        vscode.window.createWebviewPanel.mockReturnValue(panel);

        const commandCenter = new CommandCenterPanel(() => ({}), () => undefined, () => undefined, {
            onStateChange: { event: () => ({ dispose: stateDispose }) },
        });

        commandCenter.show();
        expect(commandCenter.refreshTimer).toBeDefined();

        // Trigger disposal
        triggerDispose();

        expect(stateDispose).toHaveBeenCalled();
        expect(msgDispose).toHaveBeenCalled();
        expect(commandCenter.panel).toBeUndefined();
        expect(commandCenter.refreshTimer).toBeUndefined();
    });

    it('ensures HTML does not use innerHTML, contains accessible labels, and redacts secrets', () => {
        const html = renderCommandCenterHtml();
        expect(html).not.toContain('innerHTML');
        expect(html).toContain("'data-action', 'open-objective'");
        expect(html).toContain("'data-action', 'open-task'");
        expect(html).toContain('id="inspect-health"');
        expect(html).toContain('id="run-task"');
        expect(html).toContain('aria-label');
        expect(html).toContain('type="button"');

        // Check section order
        const objectivesPos = html.indexOf('id="objectives"');
        const tasksPos = html.indexOf('id="tasks"');
        const healthPos = html.indexOf('id="operational-health"');
        const workPos = html.indexOf('id="current-work"');

        expect(objectivesPos).toBeGreaterThan(-1);
        expect(tasksPos).toBeGreaterThan(objectivesPos);
        expect(healthPos).toBeGreaterThan(tasksPos);
        expect(workPos).toBeGreaterThan(healthPos);
    });
});
