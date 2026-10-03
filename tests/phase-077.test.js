import { describe, expect, it } from 'vitest';
import { ObjectiveStatusTreeProvider, ActiveTaskTreeProvider } from '../src/core/StatusTreeProviders';

describe('Phase 077 — extension accessibility review', () => {
    it('provides screen-reader labels that include persisted lifecycle status', () => {
        const objective = new ObjectiveStatusTreeProvider({ list: () => [
            { id: 'objective-077', title: 'Accessible objective', status: 'ACTIVE' },
        ] }).getTreeItem({ id: 'objective-077', title: 'Accessible objective', status: 'ACTIVE' });
        const task = new ActiveTaskTreeProvider({ list: () => [] }).getTreeItem({
            id: 'task-077', title: 'Accessible task', status: 'BLOCKED',
        });
        expect(objective.accessibilityInformation).toEqual({ label: 'Objective: Accessible objective. Status: ACTIVE.' });
        expect(task.accessibilityInformation).toEqual({ label: 'Task: Accessible task. Status: BLOCKED.' });
    });

    it('labels empty views clearly and points the objective empty state to a keyboard command', () => {
        const objective = new ObjectiveStatusTreeProvider({ list: () => [] }).getChildren()[0];
        const tasks = new ActiveTaskTreeProvider({ list: () => [] }).getChildren()[0];
        expect(objective.accessibilityInformation.label).toMatch(/Command Palette.*HEADROOM: New Objective/);
        expect(tasks.accessibilityInformation).toEqual({ label: 'No active tasks.' });
    });
});
