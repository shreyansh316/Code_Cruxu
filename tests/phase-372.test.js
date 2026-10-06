/** Phase 372 — CEO-authorized VS Code decision recall exposes recorded lineage. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { recallEngineeringDecisions } from '../src/core/HeadroomAdministrationCommands';
import { AgentRepository, EngineeringDecisionRepository, ObjectiveRepository, OrganizationRepository,
    ProjectRepository, SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 372 — engineering decision recall UX', () => {
    let connection; let database;
    afterEach(() => { connection?.close(); connection = undefined; vi.restoreAllMocks(); vi.clearAllMocks(); });

    function setup() {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-372', name: 'Engineering' });
        const agents = new AgentRepository(database);
        agents.create({ id: 'ceo-372', organizationId: 'org-372', name: 'CEO', role: 'CEO' });
        agents.create({ id: 'author-372', organizationId: 'org-372', name: 'Engineer', role: 'EMPLOYEE' });
        new ObjectiveRepository(database).create({ id: 'objective-372', organizationId: 'org-372', title: 'Improve storage', description: 'Keep data safe' });
        new ProjectRepository(database).create({ id: 'project-372', objectiveId: 'objective-372', name: 'Persistence', description: 'Storage' });
        new TaskRepository(database).create({ id: 'task-372', taskCode: 'PH372-001', title: 'Select persistence',
            projectId: 'project-372', assigneeId: 'author-372' });
        const decisions = new EngineeringDecisionRepository(database);
        const base = { taskId: 'task-372', authorId: 'author-372', context: 'SQLite needs transactional persistence',
            options: ['SQLite', 'JSON files'], selectedOption: 'SQLite', rejectedOptions: ['JSON files'],
            reason: 'SQLite offers atomic migrations', tradeOffs: ['Schema maintenance'], evidence: ['Recovery test'], confidence: 0.8 };
        decisions.create({ ...base, id: 'decision-372-old', selectedOption: 'SQLite' });
        decisions.create({ ...base, id: 'decision-372-new', selectedOption: 'SQLite', reason: 'SQLite remains the best fit.' });
        decisions.createLink({ id: 'link-372', sourceDecisionId: 'decision-372-new', targetDecisionId: 'decision-372-old',
            relationship: 'SUPERSEDES', authorId: 'author-372' });
    }

    it('searches only after organization selection and opens a bounded evidence and lineage report', async () => {
        setup();
        vi.spyOn(vscode.window, 'showQuickPick').mockImplementation(async (items) => items[0]);
        vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('SQLite');
        const records = await recallEngineeringDecisions({ database });
        expect(records).toHaveLength(2);
        expect(vscode.workspace.openTextDocument).toHaveBeenCalledOnce();
        const content = vscode.workspace.openTextDocument.mock.calls[0][0].content;
        expect(content).toContain('Engineering decision recall: SQLite');
        expect(content).toContain('Selected: SQLite');
        expect(content).toContain('Confidence: 0.8 (recorded)');
        expect(content).toContain('SUPERSEDES: decision-372-new → decision-372-old');
        expect(vscode.window.showTextDocument).toHaveBeenCalledOnce();
    });

    it('does not start recall when no organization has a persisted available CEO', async () => {
        setup();
        new AgentRepository(database).update('ceo-372', { status: 'OFFLINE' });
        await recallEngineeringDecisions({ database });
        expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            'Decision recall requires an organization with an available CEO.');
    });
});
