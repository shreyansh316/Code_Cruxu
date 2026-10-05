import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { COMMANDS } from '../constants';
import { calculateTaskProgress } from '../domain/taskProgress';
import { redactSecrets } from '../shared/redactSecrets';

const TERMINAL_TASK_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const MAX_VISIBLE_RECORDS = 20;
const LIVE_REFRESH_INTERVAL_MS = 5000;
const COMMAND_CENTER_SECTIONS = new Set(['objectives', 'tasks', 'completed-tasks', 'task-errors', 'director-questions', 'activity', 'execution-activity']);

/** Build a bounded, read-only snapshot from persisted objective and task records. */
export function createCommandCenterSnapshot({ objectives, tasks, directorQuestions = [], activity = [], executionActivity = [], agents = [], offices = [], departments = [], organizations = [], collapsedSections = [],
    changedFiles = [], workspace = { folders: [] }, executionStatus, capturedAt = Date.now() }) {
    if (!Array.isArray(objectives) || !Array.isArray(tasks) || !Array.isArray(directorQuestions) || !Array.isArray(activity) || !Array.isArray(executionActivity)
        || !Array.isArray(changedFiles) || !Array.isArray(agents) || !Array.isArray(offices) || !Array.isArray(departments) || !Array.isArray(organizations)
        || !Array.isArray(collapsedSections) || !Array.isArray(workspace?.folders)) {
        throw new TypeError('Command center requires objective, task, Director question, and activity records.');
    }
    const orderedObjectives = sortNamedRecords(objectives, 'title');
    const objectiveTitles = new Map(orderedObjectives.map((record) => [record?.id, boundedText(record?.title, 200, 'Untitled objective')]));
    const taskTitles = new Map(tasks.map((record) => [record?.id, boundedText(record?.title, 200, 'Untitled task')]));
    const agentNames = new Map(agents.map((record) => [record?.id, safeAgentName(record)]));
    return Object.freeze({
        executionStatus: ['PAUSED', 'CANCELLED'].includes(executionStatus) ? executionStatus : 'RUNNING',
        taskProgress: Object.freeze({ ...calculateTaskProgress(tasks) }),
        objectives: Object.freeze(orderedObjectives.slice(0, MAX_VISIBLE_RECORDS).map((record) => Object.freeze({
            title: boundedText(record?.title, 200, 'Untitled objective'),
            status: boundedText(record?.status, 32, 'UNKNOWN'),
        }))),
        activeTasks: Object.freeze(sortNamedRecords(tasks.filter((record) => !TERMINAL_TASK_STATUSES.has(record?.status)), 'title')
            .slice(0, MAX_VISIBLE_RECORDS).map((record) => Object.freeze({
                title: boundedText(record?.title, 200, 'Untitled task'),
                status: boundedText(record?.status, 32, 'UNKNOWN'),
                ...(taskDuration(record, capturedAt, false) === undefined ? {} : { durationMs: taskDuration(record, capturedAt, false) }),
            }))),
        completedTasks: Object.freeze(sortNamedRecords(tasks.filter((record) => record?.status === 'COMPLETED'), 'title')
            .slice(0, MAX_VISIBLE_RECORDS).map((record) => Object.freeze({
                title: boundedText(record?.title, 200, 'Untitled task'),
                status: 'COMPLETED',
                ...(taskDuration(record, capturedAt, true) === undefined ? {} : { durationMs: taskDuration(record, capturedAt, true) }),
            }))),
        taskErrors: Object.freeze(sortNamedRecords(tasks.filter((record) => ['FAILED', 'BLOCKED'].includes(record?.status)), 'title')
            .slice(0, MAX_VISIBLE_RECORDS).map((record) => Object.freeze({
                title: boundedText(record?.title, 200, 'Untitled task'),
                status: boundedText(record?.status, 32, 'UNKNOWN'),
                message: redactSecrets(boundedText(record?.blockerReason,
                    240, record?.status === 'FAILED' ? 'Task failed. Review its recorded result.' : 'Task is blocked; no reason was recorded.'), 240),
            }))),
        directorQuestions: Object.freeze(directorQuestions.slice().sort((left, right) =>
            compareText(objectiveTitles.get(left?.objectiveId) ?? 'Objective unavailable',
                objectiveTitles.get(right?.objectiveId) ?? 'Objective unavailable')
            || (left?.status === 'PENDING' ? 0 : 1) - (right?.status === 'PENDING' ? 0 : 1)
            || (Number(left?.sortOrder) || 0) - (Number(right?.sortOrder) || 0)
            || compareText(left?.id, right?.id)).slice(0, MAX_VISIBLE_RECORDS).map((record) => Object.freeze({
            objectiveTitle: objectiveTitles.get(record?.objectiveId) ?? 'Objective unavailable',
            question: boundedText(record?.question, 2000, 'Question unavailable'),
            answer: record?.status === 'ANSWERED' ? boundedText(record?.answer, 2000, '') : '',
            status: boundedText(record?.status, 32, 'UNKNOWN'),
            category: boundedText(record?.category, 100, ''),
        }))),
        activity: Object.freeze(activity.slice(0, MAX_VISIBLE_RECORDS).map((record) => Object.freeze({
            action: boundedText(record?.action, 100, 'Activity'),
            entity: boundedText(record?.entity, 100, 'record'),
            createdAt: boundedText(record?.createdAt, 64, 'Time unavailable'),
        }))),
        executionActivity: Object.freeze(executionActivity.slice(0, MAX_VISIBLE_RECORDS).map((record) => Object.freeze({
            source: boundedText(record?.source, 32, 'activity'),
            action: boundedText(record?.action, 100, 'Activity'),
            target: boundedText(record?.target, 180, ''),
            taskTitle: taskTitles.get(record?.taskId) ?? '',
            agentName: agentNames.get(record?.agentId) ?? '',
            status: boundedText(record?.status, 32, 'UNKNOWN'),
            durationMs: Number.isSafeInteger(record?.durationMs) ? Math.min(10_000_000, Math.max(0, record.durationMs)) : 0,
            bytes: Number.isSafeInteger(record?.bytes) ? Math.min(10_000_000, Math.max(0, record.bytes)) : 0,
            detail: redactSecrets(boundedText(record?.detail, 180, ''), 180),
            detailTruncated: record?.detailTruncated === true,
            occurredAt: boundedText(record?.occurredAt, 64, 'Time unavailable'),
        }))),
        changedFiles: Object.freeze(changedFiles.slice(0, MAX_VISIBLE_RECORDS).map((record) => Object.freeze({
            path: redactWorkspacePath(record?.path),
            originalPath: record?.originalPath ? redactWorkspacePath(record.originalPath) : '',
            status: ['UNTRACKED', 'ADDED', 'DELETED', 'RENAMED', 'COPIED', 'MODIFIED'].includes(record?.status)
                ? record.status : 'UNKNOWN',
        }))),
        workforce: Object.freeze(offices.slice().sort((a, b) => compareText(a?.name, b?.name) || compareText(a?.id, b?.id))
            .slice(0, 20).map((office) => Object.freeze({
                name: boundedText(office?.name, 120, 'Office'), status: boundedText(office?.status, 32, 'UNKNOWN'),
                organization: boundedText(organizations.find((organization) => organization?.id === office?.organizationId)?.name, 120, 'Organization unavailable'),
                headManager: safeAgentName(findOfficeHead(agents, office?.id)),
                headManagerStatus: boundedText(findOfficeHead(agents, office?.id)?.status, 32, 'UNKNOWN'),
                headManagerLifecycleStatus: boundedText(findOfficeHead(agents, office?.id)?.lifecycleStatus, 32, 'ACTIVE'),
                headManagerActiveTaskCount: activeTaskCount(tasks, findOfficeHead(agents, office?.id)),
                departments: Object.freeze(departments.filter((department) => department?.officeId === office?.id)
                    .sort((a, b) => compareText(a?.name, b?.name) || compareText(a?.id, b?.id)).slice(0, 20).map((department) => Object.freeze({
                        name: boundedText(department?.name, 120, 'Department'),
                        manager: safeAgentName(findDepartmentManager(agents, department?.id)),
                        managerStatus: boundedText(findDepartmentManager(agents, department?.id)?.status, 32, 'UNKNOWN'),
                        managerLifecycleStatus: boundedText(findDepartmentManager(agents, department?.id)?.lifecycleStatus, 32, 'ACTIVE'),
                        managerActiveTaskCount: activeTaskCount(tasks, findDepartmentManager(agents, department?.id)),
                        employees: Object.freeze(agents.filter((agent) => agent?.departmentId === department?.id)
                            .sort((a, b) => compareText(a?.name, b?.name) || compareText(a?.id, b?.id)).slice(0, 4)
                            .map((agent) => Object.freeze({ name: safeAgentName(agent), specialization: boundedText(agent?.specialization, 100, ''),
                                capabilities: Object.freeze(Array.isArray(agent?.capabilities) ? agent.capabilities.slice(0, 8).map((value) => boundedText(value, 100, '')) : []),
                                status: boundedText(agent?.status, 32, 'UNKNOWN'),
                                lifecycleStatus: boundedText(agent?.lifecycleStatus, 32, 'ACTIVE'),
                                activeTaskCount: tasks.filter((task) => task?.assigneeId === agent?.id
                                    && !TERMINAL_TASK_STATUSES.has(task?.status)).length }))),
                    }))),
            }))),
        collapsedSections: Object.freeze([...new Set(collapsedSections.filter((section) => COMMAND_CENTER_SECTIONS.has(section)))]),
        workspace: Object.freeze({
            folders: Object.freeze(workspace.folders.slice(0, 10).map((folder) => redactSecrets(boundedText(folder, 120, 'Workspace'), 120))),
            activeFile: safeFileName(workspace.activeFile),
            languageId: boundedText(workspace.languageId, 64, ''),
        }),
    });
}

function boundedText(value, maxLength, fallback) {
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

function taskDuration(record, capturedAt, completed) {
    const startedAt = Date.parse(record?.createdAt);
    const endAt = completed ? Date.parse(record?.updatedAt) : Number(capturedAt);
    if (!Number.isFinite(startedAt) || !Number.isFinite(endAt) || endAt < startedAt) return undefined;
    return Math.min(315_360_000_000, Math.floor(endAt - startedAt));
}

function sortNamedRecords(records, property) {
    return records.slice().sort((left, right) => compareText(left?.[property], right?.[property])
        || compareText(left?.id, right?.id));
}

function compareText(left, right) {
    const a = typeof left === 'string' ? left.trim() : '';
    const b = typeof right === 'string' ? right.trim() : '';
    return a < b ? -1 : a > b ? 1 : 0;
}

function safeFileName(value) {
    if (typeof value !== 'string') return '';
    const normalized = value.replace(/\\/g, '/');
    return redactSecrets(boundedText(normalized.slice(normalized.lastIndexOf('/') + 1), 160, ''), 160);
}

function redactWorkspacePath(value) {
    if (typeof value !== 'string') return '';
    return redactSecrets(value.replace(/\\/g, '/'), 180);
}

function safeAgentName(agent) {
    return agent ? boundedText(agent.name, 120, 'Employee') : 'Unassigned';
}

function findOfficeHead(agents, officeId) {
    return agents.find((agent) => agent?.managedOfficeId === officeId && agent?.role === 'HEAD_MANAGER');
}

function findDepartmentManager(agents, departmentId) {
    return agents.find((agent) => agent?.managedDepartmentId === departmentId && agent?.role === 'DEPT_MANAGER');
}

function activeTaskCount(tasks, agent) {
    return agent ? tasks.filter((task) => task?.assigneeId === agent.id && !TERMINAL_TASK_STATUSES.has(task?.status)).length : 0;
}

/** Owns one VS Code panel and exposes only a bounded read-only workspace snapshot. */
export class CommandCenterPanel {
    constructor(readSnapshot, persistSectionPreference = () => undefined, openDirectorQuestions = () => undefined) {
        if (typeof readSnapshot !== 'function') throw new TypeError('Command center requires a snapshot reader.');
        if (typeof persistSectionPreference !== 'function') throw new TypeError('Command center requires a preference writer.');
        if (typeof openDirectorQuestions !== 'function') throw new TypeError('Command center requires a Director question handler.');
        this.readSnapshot = readSnapshot;
        this.persistSectionPreference = persistSectionPreference;
        this.openDirectorQuestions = openDirectorQuestions;
        this.panel = undefined;
        this.messageSubscription = undefined;
        this.disposeSubscription = undefined;
        this.workspaceSubscriptions = [];
        this.refreshTimer = undefined;
        this.refreshRevision = 0;
    }

    show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            this.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel('headroom.commandCenter', 'HEADROOM Command Center',
            vscode.ViewColumn.One, { enableScripts: true, localResourceRoots: [] });
        this.panel = panel;
        panel.webview.html = renderCommandCenterHtml();
        this.messageSubscription = panel.webview.onDidReceiveMessage((message) => {
            if (message?.type === 'ready') this.refresh();
            if (message && message.type === 'refresh') this.refresh();
            if (message?.type === 'newObjective') {
                try {
                    const pending = vscode.commands.executeCommand(COMMANDS.NEW_OBJECTIVE);
                    if (pending && typeof pending.then === 'function') void pending.catch(() => this.refresh());
                } catch {
                    this.refresh();
                }
            }
            if (message?.type === 'cancelExecution') {
                try {
                    const pending = vscode.commands.executeCommand(COMMANDS.CANCEL_EXECUTION);
                    if (pending && typeof pending.then === 'function') void pending.catch(() => this.refresh());
                } catch {
                    this.refresh();
                }
            }
            if (message?.type === 'pauseExecution' || message?.type === 'resumeExecution') {
                try {
                    const command = message.type === 'pauseExecution' ? COMMANDS.PAUSE_EXECUTION : COMMANDS.RESUME_EXECUTION;
                    const pending = vscode.commands.executeCommand(command);
                    if (pending && typeof pending.then === 'function') void pending.catch(() => this.refresh());
                } catch {
                    this.refresh();
                }
            }
            if (message?.type === 'analyzeObjective') {
                try {
                    const pending = vscode.commands.executeCommand(COMMANDS.ANALYZE_OBJECTIVE);
                    if (pending && typeof pending.then === 'function') void pending.catch(() => this.refresh());
                } catch {
                    this.refresh();
                }
            }
            if (message?.type === 'proposePlan') {
                try {
                    const pending = vscode.commands.executeCommand(COMMANDS.PROPOSE_PLAN);
                    if (pending && typeof pending.then === 'function') void pending.catch(() => this.refresh());
                } catch {
                    this.refresh();
                }
            }
            if (message?.type === 'answerDirectorQuestion') {
                try {
                    const pending = this.openDirectorQuestions();
                    if (pending && typeof pending.then === 'function') void pending.catch(() => this.refresh());
                } catch {
                    this.refresh();
                }
            }
            if (message?.type === 'setSectionCollapsed' && COMMAND_CENTER_SECTIONS.has(message.section)
                && typeof message.collapsed === 'boolean') {
                try {
                    const pending = this.persistSectionPreference(message.section, message.collapsed);
                    if (pending && typeof pending.then === 'function') void pending.catch(() => this.refresh());
                } catch {
                    this.refresh();
                }
            }
        });
        this.disposeSubscription = panel.onDidDispose(() => this._clearPanel(panel));
        this.workspaceSubscriptions = [
            vscode.window.onDidChangeActiveTextEditor?.(() => this.refresh()),
            vscode.workspace.onDidChangeWorkspaceFolders?.(() => this.refresh()),
        ].filter(Boolean);
        this.refreshTimer = setInterval(() => {
            if (this.panel === panel && panel.visible !== false) this.refresh();
        }, LIVE_REFRESH_INTERVAL_MS);
        this.refreshTimer.unref?.();
        this.refresh();
    }

    refresh() {
        if (!this.panel) return;
        const panel = this.panel;
        const revision = ++this.refreshRevision;
        try {
            const snapshot = this.readSnapshot();
            if (snapshot && typeof snapshot.then === 'function') {
                return snapshot.then((value) => {
                    if (this.panel === panel && revision === this.refreshRevision)
                        this._postMessage({ type: 'snapshot', snapshot: value });
                }).catch(() => {
                    if (this.panel === panel && revision === this.refreshRevision) this._postMessage({ type: 'loadError' });
                });
            }
            this._postMessage({ type: 'snapshot', snapshot });
        } catch {
            this._postMessage({ type: 'loadError' });
        }
    }

    _postMessage(message) {
        try {
            const pending = this.panel?.webview.postMessage(message);
            if (pending && typeof pending.then === 'function') void pending.catch(() => {});
        } catch {
            // The panel may be closing while a refresh is completing.
        }
    }

    _clearPanel(panel) {
        if (this.panel !== panel) return;
        this.messageSubscription?.dispose();
        this.disposeSubscription?.dispose();
        for (const subscription of this.workspaceSubscriptions) subscription.dispose();
        this.workspaceSubscriptions = [];
        if (this.refreshTimer !== undefined) clearInterval(this.refreshTimer);
        this.refreshTimer = undefined;
        this.messageSubscription = undefined;
        this.disposeSubscription = undefined;
        this.panel = undefined;
    }

    dispose() {
        const panel = this.panel;
        if (!panel) return;
        this._clearPanel(panel);
        panel.dispose();
    }
}

function renderCommandCenterHtml() {
    const nonce = randomBytes(18).toString('base64');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>HEADROOM Command Center</title>
  <style nonce="${nonce}">
    body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); padding: 1rem 1.5rem; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
    h1 { font-size: 1.4rem; margin: 0; }
    h2 { font-size: 1.05rem; margin-top: 1.5rem; }
    button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: .45rem .8rem; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
    .summary { color: var(--vscode-descriptionForeground); margin: .5rem 0 1rem; }
    .record { display: flex; justify-content: space-between; gap: 1rem; padding: .55rem .7rem; border-bottom: 1px solid var(--vscode-panel-border); }
    .status { color: var(--vscode-descriptionForeground); white-space: nowrap; }
    .empty, .error { color: var(--vscode-descriptionForeground); padding: .65rem .7rem; }
    .error { color: var(--vscode-errorForeground); }
    ul { list-style: none; margin: 0; padding: 0; }
    .section-toggle { margin-left: .75rem; }
  </style>
</head>
<body>
  <header><h1>HEADROOM Command Center</h1><div><button id="new-objective" type="button">New objective</button><button id="ask-director" type="button">Ask Director</button><button id="propose-plan" type="button">Ask Director for plan</button><button id="pause-execution" type="button">Pause</button><button id="resume-execution" type="button" hidden>Resume</button><button id="cancel-execution" type="button">Cancel execution</button><button id="refresh" type="button">Refresh</button></div></header>
  <p id="summary" class="summary" role="status" aria-live="polite">Loading current workspace data…</p>
  <section aria-labelledby="workspace-heading"><h2 id="workspace-heading">Workspace</h2><ul id="workspace" aria-label="Current workspace and editor"></ul></section>
  <section aria-labelledby="changed-files-heading"><h2 id="changed-files-heading">Changed files</h2><ul id="changed-files" aria-label="Files changed in the workspace"></ul></section>
  <section aria-labelledby="workforce-heading"><h2 id="workforce-heading">Organization</h2><ul id="workforce" aria-label="Office departments and employee identities"></ul></section>
  <section aria-labelledby="progress-heading"><h2 id="progress-heading">Task progress</h2><progress id="task-progress" max="100" value="0" aria-label="Completed task percentage"></progress><span id="progress-summary">No task progress yet.</span></section>
  <section aria-labelledby="objectives-heading"><h2 id="objectives-heading">Objectives</h2><button class="section-toggle" type="button" data-section-toggle="objectives" aria-controls="objectives" aria-expanded="true">Hide</button><ul id="objectives"></ul></section>
  <section aria-labelledby="tasks-heading"><h2 id="tasks-heading">Active tasks</h2><button class="section-toggle" type="button" data-section-toggle="tasks" aria-controls="tasks" aria-expanded="true">Hide</button><ul id="tasks"></ul></section>
  <section aria-labelledby="completed-heading"><h2 id="completed-heading">Completed tasks</h2><button class="section-toggle" type="button" data-section-toggle="completed-tasks" aria-controls="completed-tasks" aria-expanded="true">Hide</button><ul id="completed-tasks" aria-label="Completed tasks"></ul></section>
  <section aria-labelledby="errors-heading"><h2 id="errors-heading">Task errors and blockers</h2><button class="section-toggle" type="button" data-section-toggle="task-errors" aria-controls="task-errors" aria-expanded="true">Hide</button><ul id="task-errors" aria-label="Failed and blocked tasks"></ul></section>
  <section aria-labelledby="director-heading"><h2 id="director-heading">AI Director</h2><button id="answer-director-question" type="button">Respond to pending question</button><button class="section-toggle" type="button" data-section-toggle="director-questions" aria-controls="director-questions" aria-expanded="true">Hide</button><ul id="director-questions" aria-label="Director clarification questions"></ul></section>
  <section aria-labelledby="activity-heading"><h2 id="activity-heading">Live activity</h2><button class="section-toggle" type="button" data-section-toggle="activity" aria-controls="activity" aria-expanded="true">Hide</button><ul id="activity" aria-label="Recent recorded activity"></ul></section>
  <section aria-labelledby="execution-activity-heading"><h2 id="execution-activity-heading">Workspace and execution activity</h2><button class="section-toggle" type="button" data-section-toggle="execution-activity" aria-controls="execution-activity" aria-expanded="true">Hide</button><ul id="execution-activity" aria-label="Recent file, terminal, and verification activity"></ul></section>
  <script nonce="${nonce}">
    const api = acquireVsCodeApi();
    const summary = document.getElementById('summary');
    const objectives = document.getElementById('objectives');
    const tasks = document.getElementById('tasks');
    const completedTasks = document.getElementById('completed-tasks');
    const taskErrors = document.getElementById('task-errors');
    const directorQuestions = document.getElementById('director-questions');
    const activity = document.getElementById('activity');
    const executionActivity = document.getElementById('execution-activity');
    const taskProgress = document.getElementById('task-progress');
    const progressSummary = document.getElementById('progress-summary');
    const workspace = document.getElementById('workspace');
    const changedFiles = document.getElementById('changed-files');
    const workforce = document.getElementById('workforce');
    const sectionIds = ['objectives', 'tasks', 'completed-tasks', 'task-errors', 'director-questions', 'activity', 'execution-activity'];
    function setSectionCollapsed(section, collapsed, persist) {
      const list = document.getElementById(section);
      const button = document.querySelector('[data-section-toggle="' + section + '"]');
      if (!list || !button) return;
      list.hidden = collapsed;
      button.setAttribute('aria-expanded', String(!collapsed));
      button.textContent = collapsed ? 'Show' : 'Hide';
      if (persist) api.postMessage({ type: 'setSectionCollapsed', section, collapsed });
    }
    for (const button of document.querySelectorAll('[data-section-toggle]')) {
      button.addEventListener('click', () => {
        const section = button.getAttribute('data-section-toggle');
        const list = document.getElementById(section);
        setSectionCollapsed(section, !list.hidden, true);
      });
    }
    function showRecords(list, records, emptyText) {
      list.replaceChildren();
      if (records.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = emptyText;
        list.append(empty);
        return;
      }
      for (const record of records) {
        const row = document.createElement('li');
        row.className = 'record';
        const title = document.createElement('span');
        title.textContent = record.title;
        const status = document.createElement('span');
        status.className = 'status';
        status.textContent = record.status + (Number.isSafeInteger(record.durationMs) ? ' · ' + formatDuration(record.durationMs) : '');
        row.append(title, status);
        list.append(row);
      }
    }
    function formatDuration(milliseconds) {
      const seconds = Math.floor(milliseconds / 1000);
      if (seconds < 60) return seconds + 's elapsed';
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return minutes + 'm elapsed';
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return hours + 'h elapsed';
      return Math.floor(hours / 24) + 'd elapsed';
    }
    function showDirectorQuestions(records) {
      directorQuestions.replaceChildren();
      if (records.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'No Director questions yet.';
        directorQuestions.append(empty);
        return;
      }
      for (const record of records) {
        const row = document.createElement('li');
        row.className = 'record';
        const content = document.createElement('span');
        const question = document.createElement('strong');
        question.textContent = record.question;
        const context = document.createElement('span');
        context.className = 'summary';
        context.textContent = record.objectiveTitle + (record.category ? ' · ' + record.category : '');
        content.append(question, document.createElement('br'), context);
        if (record.answer) {
          const answer = document.createElement('p');
          answer.textContent = 'CEO answer: ' + record.answer;
          content.append(answer);
        }
        const status = document.createElement('span');
        status.className = 'status';
        status.textContent = record.status;
        row.append(content, status);
        directorQuestions.append(row);
      }
    }
    function showActivity(records) {
      activity.replaceChildren();
      if (records.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'No recorded activity yet.';
        activity.append(empty);
        return;
      }
      for (const record of records) {
        const row = document.createElement('li');
        row.className = 'record';
        const description = document.createElement('span');
        description.textContent = record.action + ' · ' + record.entity;
        const time = document.createElement('time');
        time.dateTime = record.createdAt;
        time.textContent = record.createdAt;
        row.append(description, time);
        activity.append(row);
      }
    }
    function showExecutionActivity(records) {
      executionActivity.replaceChildren();
      if (records.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'No workspace or execution activity yet.';
        executionActivity.append(empty);
        return;
      }
      for (const record of records) {
        const row = document.createElement('li');
        row.className = 'record';
        const detail = document.createElement('span');
        detail.textContent = record.action + (record.agentName ? ' · ' + record.agentName : '')
          + (record.taskTitle ? ' · ' + record.taskTitle : '')
          + (record.target ? ' · ' + record.target : '')
          + (record.detail ? ' · ' + record.detail : '')
          + (record.detailTruncated ? ' · [output truncated]' : '')
          + (record.bytes ? ' · ' + record.bytes + ' bytes' : '')
          + (record.durationMs ? ' · ' + record.durationMs + ' ms' : '');
        const status = document.createElement('span');
        status.className = 'status';
        status.textContent = record.status;
        const time = document.createElement('time');
        time.dateTime = record.occurredAt;
        time.textContent = record.occurredAt;
        row.append(detail, status, time);
        executionActivity.append(row);
      }
    }
    function showWorkspace(value) {
      workspace.replaceChildren();
      const folders = Array.isArray(value?.folders) ? value.folders : [];
      const entries = folders.map((name) => 'Folder: ' + name);
      if (value?.activeFile) entries.push('Active file: ' + value.activeFile + (value.languageId ? ' · ' + value.languageId : ''));
      if (entries.length === 0) entries.push('No workspace folder or active file.');
      for (const entry of entries) {
        const row = document.createElement('li');
        row.className = 'record';
        row.textContent = entry;
        workspace.append(row);
      }
    }
    function showChangedFiles(records) {
      changedFiles.replaceChildren();
      if (records.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'No changed files detected.';
        changedFiles.append(empty);
        return;
      }
      for (const record of records) {
        const row = document.createElement('li');
        row.className = 'record';
        row.textContent = record.status + ' · ' + (record.originalPath ? record.originalPath + ' → ' : '') + record.path;
        changedFiles.append(row);
      }
    }
    function showWorkforce(offices) {
      workforce.replaceChildren();
      if (!Array.isArray(offices) || offices.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'No configured offices.';
        workforce.append(empty);
        return;
      }
      for (const office of offices) {
        const row = document.createElement('li');
        row.className = 'record';
        const heading = document.createElement('strong');
        heading.textContent = office.organization + ' · ' + office.name + ' · ' + office.status + ' · Head: ' + office.headManager
          + ' · ' + office.headManagerStatus + ' · ' + office.headManagerLifecycleStatus + ' · '
          + office.headManagerActiveTaskCount + ' active task(s)';
        row.append(heading);
        for (const department of office.departments ?? []) {
          const detail = document.createElement('div');
          const staff = (department.employees ?? []).map((employee) => employee.name
            + (employee.specialization ? ' (' + employee.specialization + ')' : '')
            + (employee.capabilities?.length ? ' [capabilities: ' + employee.capabilities.join(', ') + ']' : '')
            + ' · ' + employee.status + ' · ' + employee.lifecycleStatus
            + ' · ' + employee.activeTaskCount + ' active task(s)').join(', ');
          detail.textContent = department.name + ' · Manager: ' + department.manager + ' · ' + department.managerStatus
            + ' · ' + department.managerLifecycleStatus + ' · ' + department.managerActiveTaskCount + ' active task(s)'
            + (staff ? ' · Employees: ' + staff : ' · No employees');
          row.append(detail);
        }
        workforce.append(row);
      }
    }
    function showTaskErrors(records) {
      taskErrors.replaceChildren();
      if (records.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'No failed or blocked tasks.';
        taskErrors.append(empty);
        return;
      }
      for (const record of records) {
        const row = document.createElement('li');
        row.className = 'record error';
        const title = document.createElement('strong');
        title.textContent = record.title + ' · ' + record.status;
        const message = document.createElement('span');
        message.textContent = record.message;
        row.append(title, message);
        taskErrors.append(row);
      }
    }
    document.getElementById('refresh').addEventListener('click', () => api.postMessage({ type: 'refresh' }));
    document.getElementById('new-objective').addEventListener('click', () => api.postMessage({ type: 'newObjective' }));
    document.getElementById('cancel-execution').addEventListener('click', () => api.postMessage({ type: 'cancelExecution' }));
    document.getElementById('pause-execution').addEventListener('click', () => api.postMessage({ type: 'pauseExecution' }));
    document.getElementById('resume-execution').addEventListener('click', () => api.postMessage({ type: 'resumeExecution' }));
    document.getElementById('ask-director').addEventListener('click', () => api.postMessage({ type: 'analyzeObjective' }));
    document.getElementById('propose-plan').addEventListener('click', () => api.postMessage({ type: 'proposePlan' }));
    document.getElementById('answer-director-question').addEventListener('click', () => api.postMessage({ type: 'answerDirectorQuestion' }));
    api.postMessage({ type: 'ready' });
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message?.type === 'loadError') {
        summary.textContent = 'Could not load workspace data. Use Refresh to try again.';
        summary.className = 'error';
        return;
      }
      if (message?.type !== 'snapshot' || !message.snapshot) return;
      const snapshot = message.snapshot;
      const pauseButton = document.getElementById('pause-execution');
      const resumeButton = document.getElementById('resume-execution');
      const cancelButton = document.getElementById('cancel-execution');
      pauseButton.hidden = snapshot.executionStatus !== 'RUNNING';
      resumeButton.hidden = snapshot.executionStatus !== 'PAUSED';
      cancelButton.disabled = snapshot.executionStatus === 'CANCELLED';
      const objectiveRecords = Array.isArray(snapshot.objectives) ? snapshot.objectives : [];
      const taskRecords = Array.isArray(snapshot.activeTasks) ? snapshot.activeTasks : [];
      const completedRecords = Array.isArray(snapshot.completedTasks) ? snapshot.completedTasks : [];
      const taskErrorRecords = Array.isArray(snapshot.taskErrors) ? snapshot.taskErrors : [];
      const questionRecords = Array.isArray(snapshot.directorQuestions) ? snapshot.directorQuestions : [];
      const activityRecords = Array.isArray(snapshot.activity) ? snapshot.activity : [];
      const executionActivityRecords = Array.isArray(snapshot.executionActivity) ? snapshot.executionActivity : [];
      const changedFileRecords = Array.isArray(snapshot.changedFiles) ? snapshot.changedFiles : [];
      const progress = snapshot.taskProgress && typeof snapshot.taskProgress === 'object' ? snapshot.taskProgress : {};
      showWorkspace(snapshot.workspace);
      showChangedFiles(changedFileRecords);
      showWorkforce(snapshot.workforce);
      showRecords(objectives, objectiveRecords, 'No objectives yet.');
      showRecords(tasks, taskRecords, 'No active tasks.');
      showRecords(completedTasks, completedRecords, 'No completed tasks yet.');
      showTaskErrors(taskErrorRecords);
      showDirectorQuestions(questionRecords);
      showActivity(activityRecords);
      showExecutionActivity(executionActivityRecords);
      const completion = Number.isFinite(progress.completionPercentage)
        ? Math.min(100, Math.max(0, progress.completionPercentage)) : 0;
      taskProgress.value = completion;
      progressSummary.textContent = progress.total > 0
        ? progress.completed + ' of ' + progress.total + ' tasks completed (' + completion + '%).'
        : 'No task progress yet.';
      const collapsed = Array.isArray(snapshot.collapsedSections) ? snapshot.collapsedSections : [];
      for (const section of sectionIds) setSectionCollapsed(section, collapsed.includes(section), false);
      summary.className = 'summary';
      const executionLabel = snapshot.executionStatus === 'PAUSED' ? 'paused'
        : snapshot.executionStatus === 'CANCELLED' ? 'cancelled' : 'running';
      summary.textContent = 'Execution ' + executionLabel + ' · ' + objectiveRecords.length + ' objective(s) · ' + taskRecords.length + ' active task(s) · ' + completedRecords.length + ' completed task(s) · ' + taskErrorRecords.length + ' task error(s) · ' + questionRecords.length + ' Director question(s) · ' + activityRecords.length + ' recent event(s) · ' + executionActivityRecords.length + ' workspace/execution event(s)';
    });
  </script>
</body>
</html>`;
}

export { renderCommandCenterHtml };
