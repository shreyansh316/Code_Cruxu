/** Phase 395 — expose task token/cost/retry observability in the VS Code command palette. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { showTaskUsageSummary } from '../src/core/HeadroomUsageCommands';
import { AgentRepository, AIUsageRepository, ObjectiveRepository, OrganizationRepository, ProjectRepository,
    SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 395 — task usage summary command', () => {
    let connection;
    afterEach(() => { connection?.close(); connection = undefined; vi.clearAllMocks(); });

    it('shows a bounded usage report for a task under its organization CEO authority', async () => {
        connection = new SqliteConnection(); const database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-395', name: 'Org' });
        new AgentRepository(database).create({ id: 'ceo-395', organizationId: 'org-395', name: 'CEO', role: 'CEO', status: 'IDLE' });
        new ObjectiveRepository(database).create({ id: 'objective-395', organizationId: 'org-395', title: 'Ship', description: 'Ship safely' });
        new ProjectRepository(database).create({ id: 'project-395', objectiveId: 'objective-395', name: 'Release', description: 'Release' });
        new TaskRepository(database).create({ id: 'task-395', taskCode: 'PH395-001', projectId: 'project-395', title: 'Build release' });
        new AIUsageRepository(database).record({ id: 'usage-395', requestId: 'request-395', provider: 'gemini', model: 'model',
            taskId: 'task-395', inputTokens: 500, outputTokens: 100, estimatedCost: 0.025, durationMs: 3000 });
        vi.mocked(vscode.window.showQuickPick).mockImplementation(async (items) => items[0]);

        const summary = await showTaskUsageSummary({ database });

        expect(summary).toMatchObject({ taskId: 'task-395', totalTokens: 600, estimatedCost: 0.025 });
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('600 tokens'));
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('gemini/model'));
    });

    it('refuses usage display when the selected task has no organization ownership', async () => {
        connection = new SqliteConnection(); const database = connection.open(':memory:'); applyMigrations(database);
        new TaskRepository(database).create({ id: 'task-395-unscoped', taskCode: 'PH395-002', title: 'Unscoped task' });
        await showTaskUsageSummary({ database, taskId: 'task-395-unscoped' });
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('organization objective'));
    });
});
