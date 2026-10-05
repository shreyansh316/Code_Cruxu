const assert = require('assert/strict');
const vscode = require('vscode');
const { runWorkflow } = require('./workflow');

async function run() {
    const extension = vscode.extensions.all.find((entry) => entry.packageJSON.name === 'headroom');
    assert.ok(extension, 'HEADROOM extension must be available in the Extension Host.');
    await extension.activate();
    assert.equal(extension.isActive, true, 'HEADROOM extension must activate successfully.');

    const commandIds = await vscode.commands.getCommands(true);
    for (const command of [
        'headroom.openDashboard',
        'headroom.newObjective',
        'headroom.showStatus',
        'headroom.pauseExecution',
        'headroom.resumeExecution',
    ]) {
        assert.ok(commandIds.includes(command), `Expected registered command ${command}.`);
    }

    const views = extension.packageJSON.contributes.views.headroom.map((view) => view.id);
    assert.ok(views.includes('headroom.objectiveView'), 'Objectives view must be contributed.');
    assert.ok(views.includes('headroom.taskView'), 'Active Tasks view must be contributed.');
    assert.ok(views.includes('headroom.healthView'), 'Operational Health view must be contributed.');

    for (const [command, argument] of [
        ['headroom.openDashboard'],
        ['headroom.showStatus'],
        ['headroom.pauseExecution'],
        ['headroom.resumeExecution'],
        ['headroom.reviewTaskChanges', 'missing-task'],
        ['headroom.reviewPlan'],
        ['headroom.explainSelection'],
        ['headroom.reviewSelection'],
    ]) {
        assert.ok(commandIds.includes(command), `Expected primary workflow command ${command}.`);
        await vscode.commands.executeCommand(command, argument);
    }
    assert.equal(extension.isActive, true, 'HEADROOM remains active after primary native workflows.');
    const workflowApiPath = process.env.HEADROOM_WORKFLOW_API;
    assert.ok(workflowApiPath, 'The Extension Host must receive the bundled workflow API.');
    await runWorkflow(require(workflowApiPath));
}

module.exports = { run };
