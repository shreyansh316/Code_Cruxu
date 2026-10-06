/** Phase 319 — expose persisted engineering decisions through the VS Code command. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as vscode from 'vscode';
import { COMMANDS } from '../src/constants';
import { HeadroomContext } from '../src/core/HeadroomContext';
import { AgentRepository, EngineeringDecisionRepository, OrganizationRepository, TaskRepository } from '../src/storage';

const directories = [];
afterEach(() => {
    vi.restoreAllMocks(); vi.clearAllMocks();
    for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('Phase 319 — engineering decision lookup command', () => {
    it('lets the user select a task and opens its complete decision record', async () => {
        const directory = mkdtempSync(join(tmpdir(), 'headroom-phase319-')); directories.push(directory);
        const handlers = new Map();
        vi.mocked(vscode.commands.registerCommand).mockImplementation((command, handler) => {
            handlers.set(command, handler); return { dispose: vi.fn() };
        });
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ get: () => undefined, update: vi.fn() });
        vi.mocked(vscode.window.registerTreeDataProvider).mockReturnValue({ dispose: vi.fn() });
        vi.mocked(vscode.window.createStatusBarItem).mockReturnValue({ show: vi.fn(), hide: vi.fn(), dispose: vi.fn() });
        const context = new HeadroomContext({ subscriptions: [], globalState: { get: () => true, update: vi.fn() },
            globalStorageUri: { fsPath: directory }, secrets: { get: vi.fn(), store: vi.fn(), delete: vi.fn() } });
        try {
            await context.initialize();
            const database = context.databaseConnection.database;
            new OrganizationRepository(database).create({ id: 'org-319', name: 'Org' });
            new TaskRepository(database).create({ id: 'task-319', taskCode: 'PH319-001', title: 'Choose a storage format' });
            new EngineeringDecisionRepository(database).create({ id: 'decision-319', taskId: 'task-319', authorId: 'author-319',
                context: 'Need durable state.', options: ['SQLite', 'Memory'], selectedOption: 'SQLite', rejectedOptions: ['Memory'],
                reason: 'Survive restarts.', tradeOffs: ['Schema migrations.'], evidence: ['Restart persistence test.'], confidence: 0.9 });
            vi.mocked(vscode.window.showQuickPick).mockImplementationOnce((items) => items.find((item) => item.task?.id === 'task-319'));
            await handlers.get(COMMANDS.SHOW_ENGINEERING_DECISIONS)();
            expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(expect.objectContaining({ language: 'json',
                content: expect.stringContaining('Survive restarts.') }));
            expect(vscode.window.showTextDocument).toHaveBeenCalled();
        } finally { context.dispose(); }
    });

    it('collects decision fields and persists them through the authorized application workflow', async () => {
        const directory = mkdtempSync(join(tmpdir(), 'headroom-phase319-write-')); directories.push(directory);
        const handlers = new Map();
        vi.mocked(vscode.commands.registerCommand).mockImplementation((command, handler) => {
            handlers.set(command, handler); return { dispose: vi.fn() };
        });
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ get: () => undefined, update: vi.fn() });
        vi.mocked(vscode.window.registerTreeDataProvider).mockReturnValue({ dispose: vi.fn() });
        vi.mocked(vscode.window.createStatusBarItem).mockReturnValue({ show: vi.fn(), hide: vi.fn(), dispose: vi.fn() });
        const context = new HeadroomContext({ subscriptions: [], globalState: { get: () => true, update: vi.fn() },
            globalStorageUri: { fsPath: directory }, secrets: { get: vi.fn(), store: vi.fn(), delete: vi.fn() } });
        try {
            await context.initialize();
            const database = context.databaseConnection.database;
            new OrganizationRepository(database).create({ id: 'org-319-write', name: 'Org' });
            database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
                .run('office-319-write', 'org-319-write', 'Office', 'office-319-write');
            database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
                .run('department-319-write', 'office-319-write', 'Department', 'department-319-write');
            new AgentRepository(database).create({ id: 'author-319-write', name: 'Author', role: 'EMPLOYEE', departmentId: 'department-319-write' });
            new TaskRepository(database).create({ id: 'task-319-write', taskCode: 'PH319-002', title: 'Choose cache', assigneeId: 'author-319-write' });
            vi.mocked(vscode.window.showQuickPick)
                .mockImplementationOnce((items) => items.find((item) => item.task?.id === 'task-319-write'))
                .mockImplementationOnce((items) => items.find((item) => item.agent?.id === 'author-319-write'))
                .mockImplementationOnce((items) => items.find((item) => item.option === 'SQLite'));
            vi.mocked(vscode.window.showInputBox)
                .mockResolvedValueOnce('Need durable state.')
                .mockResolvedValueOnce('SQLite\nMemory')
                .mockResolvedValueOnce('Memory')
                .mockResolvedValueOnce('Survives restart.')
                .mockResolvedValueOnce('Adds migration work.')
                .mockResolvedValueOnce('Persistence test.')
                .mockResolvedValueOnce('0.9');
            await handlers.get(COMMANDS.RECORD_ENGINEERING_DECISION)();
            expect(new EngineeringDecisionRepository(database).listByTask('task-319-write')).toMatchObject([
                { authorId: 'author-319-write', selectedOption: 'SQLite', rejectedOptions: ['Memory'],
                    reason: 'Survives restart.', confidence: 0.9 },
            ]);
        } finally { context.dispose(); }
    });
});
