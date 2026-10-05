/** Phase 121 — invoke the persisted Director clarification flow from the command center. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { HeadroomContext } from '../src/core/HeadroomContext';
import { AgentRepository, DepartmentRepository, DirectorQuestionRepository, ObjectiveRepository, OfficeRepository,
    OrganizationRepository, TaskRepository } from '../src/storage';

const directories = [];

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('Phase 121 — interactive Director analysis', () => {
    it('gets CEO confirmation, calls the bounded Gemini adapter, records usage, and persists selected questions', async () => {
        const directory = mkdtempSync(join(tmpdir(), 'headroom-phase-121-'));
        directories.push(directory);
        const registrations = new Map();
        const disposable = { dispose: vi.fn() };
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
            get: (key) => ({ 'ai.provider': 'gemini', 'ai.reasoningModel': 'gemini-test-model' })[key],
        });
        vi.mocked(vscode.window.registerTreeDataProvider).mockReturnValue(disposable);
        vi.mocked(vscode.commands.registerCommand).mockImplementation((id, handler) => {
            registrations.set(id, handler);
            return disposable;
        });
        vi.mocked(vscode.window.createStatusBarItem).mockReturnValue({ ...disposable, show: vi.fn() });
        vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Send to Gemini');
        const proposal = { question: 'Which platforms should launch first?', category: 'scope',
            rationale: 'The objective does not specify an initial platform set.' };
        vi.mocked(vscode.window.showQuickPick)
            .mockImplementationOnce((items) => items.find((item) => item.organization?.id === 'organization-phase-121'))
            .mockImplementationOnce((items) => {
                expect(items.map((item) => item.objectiveId)).toEqual(['objective-phase-121']);
                return items.find((item) => item.objectiveId === 'objective-phase-121');
            })
            .mockResolvedValueOnce([{ proposal }]);
        const providerResponse = {
            candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ questions: [proposal] }) }] } }],
            usageMetadata: { promptTokenCount: 42, candidatesTokenCount: 30 },
        };
        const fetchMock = vi.fn(async (url) => ({ ok: true, json: async () => String(url).endsWith(':countTokens')
            ? { totalTokens: 42 } : providerResponse }));
        vi.stubGlobal('fetch', fetchMock);

        const context = new HeadroomContext({ subscriptions: [],
            globalState: { get: () => true, update: vi.fn() },
            globalStorageUri: { fsPath: directory },
            secrets: { get: vi.fn(async () => 'test-gemini-credential'), store: vi.fn(), delete: vi.fn() },
        });
        try {
            await context.initialize();
            const database = context._databaseConnection.database;
            new OrganizationRepository(database).create({ id: 'organization-phase-121', name: 'Organization A' });
            new OrganizationRepository(database).create({ id: 'organization-phase-121-other', name: 'Organization B' });
            new ObjectiveRepository(database).create({ id: 'objective-phase-121', organizationId: 'organization-phase-121',
                title: 'Build release', description: 'Deliver a stable mobile application.' });
            new ObjectiveRepository(database).create({ id: 'objective-phase-121-other', organizationId: 'organization-phase-121-other',
                title: 'Confidential other objective', description: 'Belongs to another organization.' });

            await registrations.get('headroom.analyzeObjective')();

            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                'Send this objective and its prior clarifications to Gemini for analysis?', { modal: true }, 'Send to Gemini');
            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith(':generateContent'))).toBe(true);
            expect(new DirectorQuestionRepository(database).listByObjective('objective-phase-121'))
                .toMatchObject([{ question: proposal.question, category: proposal.category, status: 'PENDING' }]);
            expect(database.prepare('SELECT purpose, success, input_tokens, output_tokens FROM ai_usages').get())
                .toMatchObject({ purpose: 'director-objective-analysis', success: 1, input_tokens: 42, output_tokens: 30 });
            expect(database.prepare('SELECT type FROM events').all()).toEqual([{ type: 'QUESTION_ASKED' }]);
            expect(database.prepare('SELECT action FROM audit_logs').all()).toEqual([{ action: 'QUESTION_ASKED' }]);
        } finally {
            context.dispose();
        }
    });

    it('does not send a plan request while an objective has unanswered Director questions', async () => {
        const directory = mkdtempSync(join(tmpdir(), 'headroom-phase-121-pending-'));
        directories.push(directory);
        const registrations = new Map();
        const disposable = { dispose: vi.fn() };
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
            get: (key) => ({ 'ai.provider': 'gemini', 'ai.reasoningModel': 'gemini-test-model' })[key],
        });
        vi.mocked(vscode.window.registerTreeDataProvider).mockReturnValue(disposable);
        vi.mocked(vscode.commands.registerCommand).mockImplementation((id, handler) => {
            registrations.set(id, handler);
            return disposable;
        });
        vi.mocked(vscode.window.createStatusBarItem).mockReturnValue({ ...disposable, show: vi.fn() });
        vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({ objectiveId: 'objective-pending-plan', label: 'Build release' });
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const context = new HeadroomContext({ subscriptions: [],
            globalState: { get: () => true, update: vi.fn() },
            globalStorageUri: { fsPath: directory },
            secrets: { get: vi.fn(async () => 'test-gemini-credential'), store: vi.fn(), delete: vi.fn() },
        });
        try {
            await context.initialize();
            const database = context._databaseConnection.database;
            new OrganizationRepository(database).create({ id: 'organization-pending-plan', name: 'Organization' });
            new ObjectiveRepository(database).create({ id: 'objective-pending-plan', organizationId: 'organization-pending-plan',
                title: 'Build release', description: 'Deliver a stable mobile application.' });
            new DirectorQuestionRepository(database).create({ id: 'question-pending-plan',
                objectiveId: 'objective-pending-plan', question: 'Which platforms?', status: 'PENDING', sortOrder: 0 });

            await registrations.get('headroom.proposePlan')();

            expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
            expect(fetchMock).not.toHaveBeenCalled();
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                'Answer or skip pending Director questions before asking for a plan.');
        } finally {
            context.dispose();
        }
    });

    it('shows a generated plan to the CEO for approval and does not execute its tasks', async () => {
        const directory = mkdtempSync(join(tmpdir(), 'headroom-phase-121-plan-'));
        directories.push(directory);
        const registrations = new Map();
        const disposable = { dispose: vi.fn() };
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
            get: (key) => ({ 'ai.provider': 'gemini', 'ai.reasoningModel': 'gemini-test-model' })[key],
        });
        vi.mocked(vscode.window.registerTreeDataProvider).mockReturnValue(disposable);
        vi.mocked(vscode.commands.registerCommand).mockImplementation((id, handler) => {
            registrations.set(id, handler);
            return disposable;
        });
        vi.mocked(vscode.window.createStatusBarItem).mockReturnValue({ ...disposable, show: vi.fn() });
        vi.mocked(vscode.window.showWarningMessage)
            .mockResolvedValueOnce('Generate Plan')
            .mockResolvedValueOnce('Create Tasks');
        vi.mocked(vscode.window.showQuickPick)
            .mockResolvedValueOnce({ objectiveId: 'objective-plan-review', label: 'Build release' })
            .mockResolvedValueOnce({ label: 'Approve Plan', value: 'APPROVED' })
            .mockResolvedValueOnce([{ taskId: 'plan-task-id-placeholder' }]);
        const planOutput = { projects: [{ name: 'Mobile release' }],
            milestones: [{ projectIndex: 0, title: 'First release' }],
            tasks: [{ projectIndex: 0, milestoneIndex: 0, title: 'Define supported platforms',
                acceptanceCriteria: ['Supported platforms are documented and approved.'] }], dependencies: [] };
        const providerResponse = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(planOutput) }] } }],
            usageMetadata: { promptTokenCount: 42, candidatesTokenCount: 30 } };
        const fetchMock = vi.fn(async (url) => ({ ok: true, json: async () => String(url).endsWith(':countTokens')
            ? { totalTokens: 42 } : providerResponse }));
        vi.stubGlobal('fetch', fetchMock);
        const document = { uri: { toString: () => 'untitled:director-plan' } };
        vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(document);
        const context = new HeadroomContext({ subscriptions: [],
            globalState: { get: () => true, update: vi.fn() },
            globalStorageUri: { fsPath: directory },
            secrets: { get: vi.fn(async () => 'test-gemini-credential'), store: vi.fn(), delete: vi.fn() },
        });
        try {
            await context.initialize();
            const database = context._databaseConnection.database;
            new OrganizationRepository(database).create({ id: 'organization-plan-review', name: 'Organization',
                slug: 'organization-plan-review', status: 'ACTIVE' });
            new ObjectiveRepository(database).create({ id: 'objective-plan-review',
                title: 'Build release', description: 'Deliver a stable mobile application.' });
            new OfficeRepository(database).create({ id: 'office-plan-review', organizationId: 'organization-plan-review',
                name: 'Development', slug: 'development', status: 'ACTIVE' });
            new DepartmentRepository(database).create({ id: 'department-plan-review', officeId: 'office-plan-review',
                name: 'Engineering', slug: 'engineering', status: 'ACTIVE' });
            new AgentRepository(database).create({ id: 'ceo-plan-review', name: 'CEO', role: 'CEO',
                organizationId: 'organization-plan-review', status: 'IDLE' });
            new AgentRepository(database).create({ id: 'director-plan-review', name: 'Director', role: 'DIRECTOR',
                organizationId: 'organization-plan-review', status: 'IDLE' });
            new AgentRepository(database).create({ id: 'head-plan-review', name: 'Office Head', role: 'HEAD_MANAGER',
                managedOfficeId: 'office-plan-review', status: 'IDLE' });
            new AgentRepository(database).create({ id: 'manager-plan-review', name: 'Department Manager', role: 'DEPT_MANAGER',
                managedDepartmentId: 'department-plan-review', status: 'IDLE' });
            for (let index = 0; index < 4; index += 1) {
                new AgentRepository(database).create({ id: `employee-plan-review-${index}`, name: `Employee ${index}`,
                    role: 'EMPLOYEE', departmentId: 'department-plan-review', status: 'IDLE' });
            }
            const planTaskOption = { taskId: 'task-000', creatorId: 'director-plan-review', assigneeId: 'head-plan-review' };
            vi.mocked(vscode.window.showQuickPick).mockReset()
                .mockResolvedValueOnce({ objectiveId: 'objective-plan-review', label: 'Build release' })
                .mockResolvedValueOnce({ label: 'Approve Plan', value: 'APPROVED' })
                .mockImplementationOnce((items) => items.filter((item) => item.creatorId === planTaskOption.creatorId
                    && item.assigneeId === planTaskOption.assigneeId));

            await registrations.get('headroom.proposePlan')();

            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(vscode.workspace.openTextDocument).toHaveBeenCalledOnce();
            expect(vscode.workspace.openTextDocument.mock.calls[0][0].content).toContain('Define supported platforms');
            expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(3);
            expect(database.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count).toBeGreaterThan(0);
            expect(new ObjectiveRepository(database).getById('objective-plan-review').organizationId).toBe('organization-plan-review');
            expect(new TaskRepository(database).list()).toMatchObject([
                { status: 'CREATED', creatorId: 'director-plan-review', assigneeId: 'head-plan-review' },
            ]);
        } finally {
            context.dispose();
        }
    });
});
