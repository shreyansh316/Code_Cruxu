import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { CommandCenterPanel, createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';
import { HeadroomContext } from '../src/core/HeadroomContext';
import { AgentRepository, AuditLogRepository, DirectorQuestionRepository, ObjectiveRepository, OrganizationRepository,
    SqliteConnection, applyMigrations } from '../src/storage';

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

describe('Phase 109 — Director question answer action', () => {
    it('opens the injected, persisted answer workflow without accepting data from the webview', async () => {
        let receiveMessage;
        const webview = {
            html: '', postMessage: vi.fn().mockResolvedValue(true),
            onDidReceiveMessage: vi.fn((handler) => { receiveMessage = handler; return { dispose: vi.fn() }; }),
        };
        const panel = { visible: true, webview, reveal: vi.fn(), dispose: vi.fn(), onDidDispose: vi.fn(() => ({ dispose: vi.fn() })) };
        vscode.window.createWebviewPanel.mockReturnValue(panel);
        const openDirectorQuestions = vi.fn().mockResolvedValue(undefined);
        const commandCenter = new CommandCenterPanel(
            () => createCommandCenterSnapshot({ objectives: [], tasks: [] }), undefined, openDirectorQuestions);
        commandCenter.show();

        receiveMessage({ type: 'answerDirectorQuestion', questionId: 'attacker-controlled' });
        await vi.waitFor(() => expect(openDirectorQuestions).toHaveBeenCalledOnce());
        expect(openDirectorQuestions).toHaveBeenCalledWith();
        expect(webview.html).toContain('Respond to pending question');
        expect(webview.html).toContain("api.postMessage({ type: 'answerDirectorQuestion' })");
        commandCenter.dispose();
    });

    it('answers the persisted question and writes its event and audit record transactionally', async () => {
        const connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        const objectiveRepository = new ObjectiveRepository(database);
        new OrganizationRepository(database).create({ id: 'organization-109', name: 'Organization' });
        objectiveRepository.create({ id: 'objective-109', organizationId: 'organization-109', title: 'Ship safely', description: 'Release the extension.' });
        new AgentRepository(database).create({ id: 'ceo-109', organizationId: 'organization-109', name: 'CEO', role: 'CEO' });
        const questionRepository = new DirectorQuestionRepository(database);
        questionRepository.create({ id: 'question-109', objectiveId: 'objective-109', question: 'Which platform?', status: 'PENDING', sortOrder: 0 });
        vi.mocked(vscode.window.showQuickPick)
            .mockResolvedValueOnce({ questionId: 'question-109', objectiveId: 'objective-109' })
            .mockResolvedValueOnce({ value: 'ANSWER' });
        vi.mocked(vscode.window.showInputBox).mockResolvedValue('Windows first');
        const extensionContext = { subscriptions: [], globalState: { get: () => [], update: vi.fn() } };
        const context = new HeadroomContext(extensionContext);
        context._databaseConnection = connection;
        context._refreshStatusViews = vi.fn();
        context._commandCenter = { refresh: vi.fn() };

        try {
            await context._answerDirectorQuestion();
            expect(questionRepository.getById('question-109')).toMatchObject({ status: 'ANSWERED', answer: 'Windows first' });
            expect(database.prepare('SELECT type FROM events').all()).toEqual([{ type: 'QUESTION_ANSWERED' }]);
            expect(new AuditLogRepository(database).listByEntity('objective', 'objective-109'))
                .toMatchObject([{ action: 'QUESTION_ANSWERED', entityId: 'objective-109' }]);
            expect(context._commandCenter.refresh).toHaveBeenCalledOnce();
        } finally {
            context.dispose();
        }
    });

    it('skips a pending question only after an explicit choice', async () => {
        const connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'organization-109-skip', name: 'Organization' });
        new ObjectiveRepository(database).create({ id: 'objective-109-skip', organizationId: 'organization-109-skip',
            title: 'Ship safely', description: 'Release the extension.' });
        new AgentRepository(database).create({ id: 'ceo-109-skip', organizationId: 'organization-109-skip', name: 'CEO', role: 'CEO' });
        const questionRepository = new DirectorQuestionRepository(database);
        questionRepository.create({ id: 'question-109-skip', objectiveId: 'objective-109-skip', question: 'Defer docs?', status: 'PENDING', sortOrder: 0 });
        vi.mocked(vscode.window.showQuickPick)
            .mockResolvedValueOnce({ questionId: 'question-109-skip', objectiveId: 'objective-109-skip' })
            .mockResolvedValueOnce({ value: 'SKIP' });
        const context = new HeadroomContext({ subscriptions: [], globalState: { get: () => [], update: vi.fn() } });
        context._databaseConnection = connection;
        context._refreshStatusViews = vi.fn();
        context._commandCenter = { refresh: vi.fn() };

        try {
            await context._answerDirectorQuestion();
            expect(questionRepository.getById('question-109-skip').status).toBe('SKIPPED');
            expect(database.prepare('SELECT type FROM events').all()).toEqual([{ type: 'QUESTION_SKIPPED' }]);
            expect(new AuditLogRepository(database).listByEntity('objective', 'objective-109-skip'))
                .toMatchObject([{ action: 'QUESTION_SKIPPED' }]);
        } finally {
            context.dispose();
        }
    });

    it('shows and mutates only pending questions owned by the selected organization', async () => {
        const connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        const organizations = new OrganizationRepository(database);
        organizations.create({ id: 'organization-109-a', name: 'A' });
        organizations.create({ id: 'organization-109-b', name: 'B' });
        const objectives = new ObjectiveRepository(database);
        objectives.create({ id: 'objective-109-a', organizationId: 'organization-109-a', title: 'A objective', description: 'Owned by A.' });
        objectives.create({ id: 'objective-109-b', organizationId: 'organization-109-b', title: 'B objective', description: 'Owned by B.' });
        new AgentRepository(database).create({ id: 'ceo-109-a', organizationId: 'organization-109-a', name: 'CEO A', role: 'CEO' });
        new AgentRepository(database).create({ id: 'ceo-109-b', organizationId: 'organization-109-b', name: 'CEO B', role: 'CEO' });
        const questions = new DirectorQuestionRepository(database);
        questions.create({ id: 'question-109-a', objectiveId: 'objective-109-a', question: 'Question A?', status: 'PENDING', sortOrder: 0 });
        questions.create({ id: 'question-109-b', objectiveId: 'objective-109-b', question: 'Question B?', status: 'PENDING', sortOrder: 0 });
        vi.mocked(vscode.window.showQuickPick)
            .mockImplementationOnce((items) => items.find((item) => item.organization?.id === 'organization-109-a'))
            .mockImplementationOnce((items) => {
                expect(items.map((item) => item.questionId)).toEqual(['question-109-a']);
                return items[0];
            })
            .mockResolvedValueOnce({ value: 'SKIP' });
        const context = new HeadroomContext({ subscriptions: [], globalState: { get: () => [], update: vi.fn() } });
        context._databaseConnection = connection;
        context._refreshStatusViews = vi.fn();
        context._commandCenter = { refresh: vi.fn() };

        try {
            await context._answerDirectorQuestion();
            expect(questions.getById('question-109-a').status).toBe('SKIPPED');
            expect(questions.getById('question-109-b').status).toBe('PENDING');
            expect(new AuditLogRepository(database).listByTask('question-109-a')).toEqual([]);
            expect(new AuditLogRepository(database).listByEntity('objective', 'objective-109-a'))
                .toMatchObject([{ action: 'QUESTION_SKIPPED', actorId: 'ceo-109-a' }]);
        } finally {
            context.dispose();
            connection.close();
        }
    });
});
