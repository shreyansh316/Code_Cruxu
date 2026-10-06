/** Phase 433 — save cited review findings through a confirmed VS Code task-memory flow. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { SqliteConnection, applyMigrations, AgentRepository, AuditLogRepository, MemoryRepository,
    ObjectiveRepository, OrganizationRepository, ProjectRepository, TaskRepository } from '../src/storage';
import { saveReviewFindingsFromEditor } from '../src/core/ReviewFindingCommands';

const review = { area: 'SECURITY', selected: 'src/auth.js', findings: [{ id: 'finding-433', title: 'Authorization check is missing',
    severity: 'HIGH', confidence: 'UNASSESSED', whyItMatters: 'A caller can read another task.',
    recommendedFix: 'Check the persisted organization before returning data.', alternatives: [], evidenceIds: ['source-433'],
    evidenceQuotes: [{ evidenceId: 'source-433', text: 'return taskRepository.getById(taskId);' }] }], speculations: [],
evidence: [{ id: 'source-433', type: 'source', label: 'src/auth.js:20', excerpt: 'return taskRepository.getById(taskId);' }] };

describe('Phase 433 — save review findings flow', () => {
    let connection;
    afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); delete vscode.window.activeTextEditor; connection?.close(); connection = undefined; });

    function setup() {
        connection = new SqliteConnection();
        const database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-433', name: 'Engineering' });
        new ObjectiveRepository(database).create({ id: 'objective-433', organizationId: 'org-433', title: 'Secure app', description: 'Security objective' });
        new ProjectRepository(database).create({ id: 'project-433', objectiveId: 'objective-433', name: 'App' });
        new AgentRepository(database).create({ id: 'ceo-433', organizationId: 'org-433', name: 'CEO', role: 'CEO' });
        new TaskRepository(database).create({ id: 'task-433', taskCode: 'TASK-433', title: 'Review authorization', projectId: 'project-433' });
        vscode.window.activeTextEditor = { document: { getText: () => JSON.stringify(review) } };
        return database;
    }

    it('requires a picked task and explicit confirmation, persists cited findings unverified, and audits the CEO', async () => {
        const database = setup();
        vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValue({ task: new TaskRepository(database).getById('task-433') });
        vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Save findings');
        const result = await saveReviewFindingsFromEditor({ database });
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ scope: 'TASK', taskId: 'task-433', sourceKind: 'REVIEW_FINDING', verified: 0 });
        expect(JSON.parse(result[0].content).evidence[0]).toMatchObject({ id: 'source-433', label: 'src/auth.js:20' });
        expect(new MemoryRepository(database).listByOwner('TASK', 'task-433')).toHaveLength(1);
        expect(new AuditLogRepository(database).listByTask('task-433')).toEqual(expect.arrayContaining([
            expect.objectContaining({ action: 'REVIEW_FINDINGS_STORED', actorId: 'ceo-433' }),
        ]));
    });

    it('does not write memory when confirmation is declined or the editor content is malformed', async () => {
        const database = setup();
        vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValue({ task: new TaskRepository(database).getById('task-433') });
        vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(undefined);
        await saveReviewFindingsFromEditor({ database });
        expect(new MemoryRepository(database).listByOwner('TASK', 'task-433')).toEqual([]);
        vscode.window.activeTextEditor.document.getText = () => '{bad json';
        await saveReviewFindingsFromEditor({ database });
        expect(new MemoryRepository(database).listByOwner('TASK', 'task-433')).toEqual([]);
    });
});
