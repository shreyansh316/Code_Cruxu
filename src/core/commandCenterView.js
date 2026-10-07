import { randomBytes } from 'node:crypto';

/** Webview markup for the Command Center panel, extracted from
 * CommandCenterPanel (phase 464): the view layer is separate from snapshot
 * shaping and panel lifecycle. */

export function renderCommandCenterHtml() {
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
    .command-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .5rem; }
    h1 { font-size: 1.4rem; margin: 0; }
    h2 { font-size: 1.05rem; margin-top: 1.5rem; }
    button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: .45rem .8rem; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
    .skip-link { position: absolute; left: -10000px; top: 0; z-index: 1; padding: .5rem; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    .skip-link:focus { left: .5rem; top: .5rem; outline: 2px solid var(--vscode-focusBorder); }
    .summary { color: var(--vscode-descriptionForeground); margin: .5rem 0 1rem; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    .record { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .35rem 1rem; min-width: 0; padding: .55rem .7rem; border-bottom: 1px solid var(--vscode-panel-border); }
    .record > :first-child { flex: 1 1 12rem; min-width: 0; overflow-wrap: anywhere; }
    .status { flex: 0 1 auto; color: var(--vscode-descriptionForeground); text-align: right; overflow-wrap: anywhere; }
    .empty, .error { color: var(--vscode-descriptionForeground); padding: .65rem .7rem; }
    .error { color: var(--vscode-errorForeground); }
    ul { list-style: none; margin: 0; padding: 0; }
    .section-toggle { margin-left: .75rem; }
    .section-title-bar { display: flex; align-items: center; justify-content: space-between; }
    .header-action-group { display: flex; gap: .5rem; align-items: center; }
    .action-btn { font-size: .85em; padding: .2rem .5rem; margin-left: .5rem; }
    .status-healthy, .status-ready { color: var(--vscode-testing-iconPassed, #4ec9b0); }
    .status-degraded { color: var(--vscode-editorWarning-foreground, #cca700); }
    .status-failed { color: var(--vscode-errorForeground, #f14c4c); }
    .status-unavailable, .status-not_run { color: var(--vscode-descriptionForeground); }
    @media (max-width: 600px) { body { padding: .5rem; } header { align-items: stretch; flex-direction: column; } .command-actions { justify-content: flex-start; } .status { text-align: left; } }
  </style>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to command center content</a>
  <header><h1>HEADROOM Command Center</h1><nav class="command-actions" aria-label="Command center actions"><button id="new-objective" type="button">New objective</button><button id="run-task" type="button">Run task</button><button id="ask-director" type="button">Ask Director</button><button id="propose-plan" type="button">Ask Director for plan</button><button id="pause-execution" type="button">Pause</button><button id="resume-execution" type="button" hidden>Resume</button><button id="cancel-execution" type="button">Cancel execution</button><button id="refresh" type="button">Refresh</button></nav></header>
  <p id="summary" class="summary">Loading current workspace data…</p>
  <p id="execution-announcement" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p>
  <main id="main-content" tabindex="-1">
  <section aria-labelledby="objectives-heading"><div class="section-title-bar"><h2 id="objectives-heading">Objectives</h2><button class="section-toggle" type="button" data-section-toggle="objectives" aria-label="Hide Objectives section" aria-controls="objectives" aria-expanded="true">Hide</button></div><ul id="objectives"></ul></section>
  <section aria-labelledby="tasks-heading"><div class="section-title-bar"><h2 id="tasks-heading">Active tasks</h2><button class="section-toggle" type="button" data-section-toggle="tasks" aria-label="Hide Active tasks section" aria-controls="tasks" aria-expanded="true">Hide</button></div><ul id="tasks"></ul></section>
  <section aria-labelledby="health-heading"><div class="section-title-bar"><h2 id="health-heading">Operational Health</h2><div class="header-action-group"><button id="inspect-health" type="button">Inspect health</button><button class="section-toggle" type="button" data-section-toggle="operational-health" aria-label="Hide Operational Health section" aria-controls="operational-health" aria-expanded="true">Hide</button></div></div><ul id="operational-health" aria-label="Operational health checks"></ul></section>
  <section aria-labelledby="current-work-heading"><div class="section-title-bar"><h2 id="current-work-heading">Current Work</h2><button class="section-toggle" type="button" data-section-toggle="current-work" aria-label="Hide Current Work section" aria-controls="current-work" aria-expanded="true">Hide</button></div><ul id="current-work" aria-label="Current execution and active work"></ul></section>
  <section aria-labelledby="completed-heading"><h2 id="completed-heading">Completed tasks</h2><button class="section-toggle" type="button" data-section-toggle="completed-tasks" aria-label="Hide Completed tasks section" aria-controls="completed-tasks" aria-expanded="true">Hide</button><ul id="completed-tasks" aria-label="Completed tasks"></ul></section>
  <section aria-labelledby="errors-heading"><h2 id="errors-heading">Task errors and blockers</h2><button class="section-toggle" type="button" data-section-toggle="task-errors" aria-label="Hide Task errors and blockers section" aria-controls="task-errors" aria-expanded="true">Hide</button><ul id="task-errors" aria-label="Failed and blocked tasks"></ul></section>
  <section aria-labelledby="progress-heading"><h2 id="progress-heading">Task progress</h2><progress id="task-progress" max="100" value="0" aria-label="Completed task percentage"></progress><span id="progress-summary">No task progress yet.</span></section>
  <section aria-labelledby="director-heading"><h2 id="director-heading">AI Director</h2><button id="answer-director-question" type="button">Respond to pending question</button><button class="section-toggle" type="button" data-section-toggle="director-questions" aria-label="Hide Director questions section" aria-controls="director-questions" aria-expanded="true">Hide</button><ul id="director-questions" aria-label="Director clarification questions"></ul></section>
  <section aria-labelledby="workspace-heading"><h2 id="workspace-heading">Workspace</h2><ul id="workspace" aria-label="Current workspace and editor"></ul></section>
  <section aria-labelledby="changed-files-heading"><h2 id="changed-files-heading">Changed files</h2><ul id="changed-files" aria-label="Files changed in the workspace"></ul></section>
  <section aria-labelledby="workforce-heading"><h2 id="workforce-heading">Organization</h2><ul id="workforce" aria-label="Office departments and employee identities"></ul></section>
  <section aria-labelledby="activity-heading"><h2 id="activity-heading">Live activity</h2><button class="section-toggle" type="button" data-section-toggle="activity" aria-label="Hide Live activity section" aria-controls="activity" aria-expanded="true">Hide</button><ul id="activity" aria-label="Recent recorded activity"></ul></section>
  <section aria-labelledby="execution-activity-heading"><h2 id="execution-activity-heading">Workspace and execution activity</h2><button class="section-toggle" type="button" data-section-toggle="execution-activity" aria-label="Hide Workspace and execution activity section" aria-controls="execution-activity" aria-expanded="true">Hide</button><ul id="execution-activity" aria-label="Recent file, terminal, and verification activity"></ul></section>
  </main>
  <script nonce="${nonce}">
    const api = acquireVsCodeApi();
    const summary = document.getElementById('summary');
    const executionAnnouncement = document.getElementById('execution-announcement');
    let lastAnnouncedExecutionStatus;
    let workspaceLoadFailed = false;
    const objectives = document.getElementById('objectives');
    const tasks = document.getElementById('tasks');
    const operationalHealth = document.getElementById('operational-health');
    const currentWork = document.getElementById('current-work');
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
    const sectionIds = ['objectives', 'tasks', 'operational-health', 'current-work', 'completed-tasks', 'task-errors', 'director-questions', 'activity', 'execution-activity'];
    const sectionLabels = { objectives: 'Objectives', tasks: 'Active tasks', 'operational-health': 'Operational Health', 'current-work': 'Current Work', 'completed-tasks': 'Completed tasks',
      'task-errors': 'Task errors and blockers', 'director-questions': 'Director questions', activity: 'Live activity',
      'execution-activity': 'Workspace and execution activity' };
    function setSectionCollapsed(section, collapsed, persist) {
      const list = document.getElementById(section);
      const button = document.querySelector('[data-section-toggle="' + section + '"]');
      if (!list || !button) return;
      list.hidden = collapsed;
      button.setAttribute('aria-expanded', String(!collapsed));
      button.textContent = collapsed ? 'Show' : 'Hide';
      button.setAttribute('aria-label', (collapsed ? 'Show ' : 'Hide ') + sectionLabels[section] + ' section');
      if (persist) api.postMessage({ type: 'setSectionCollapsed', section, collapsed });
    }
    for (const button of document.querySelectorAll('[data-section-toggle]')) {
      button.addEventListener('click', () => {
        const section = button.getAttribute('data-section-toggle');
        const list = document.getElementById(section);
        setSectionCollapsed(section, !list.hidden, true);
      });
    }
    function showObjectives(records) {
      objectives.replaceChildren();
      if (records.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'No objectives yet.';
        objectives.append(empty);
        return;
      }
      for (const record of records) {
        const row = document.createElement('li');
        row.className = 'record';
        const info = document.createElement('span');
        const title = document.createElement('strong');
        title.textContent = record.title;
        info.append(title);
        if (record.progress) {
          const prog = document.createElement('span');
          prog.className = 'summary';
          prog.textContent = ' · ' + record.progress.completed + ' of ' + record.progress.total + ' tasks completed (' + record.progress.percentage + '%)';
          info.append(prog);
        }
        const right = document.createElement('span');
        right.className = 'status';
        right.textContent = record.status;
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'action-btn';
        openBtn.textContent = 'Open';
        openBtn.setAttribute('data-action', 'open-objective');
        openBtn.setAttribute('data-title', record.title);
        openBtn.setAttribute('aria-label', 'Open objective: ' + record.title);
        right.append(' ', openBtn);
        row.append(info, right);
        objectives.append(row);
      }
    }
    function showActiveTasks(records) {
      tasks.replaceChildren();
      if (records.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'No active tasks.';
        tasks.append(empty);
        return;
      }
      for (const record of records) {
        const row = document.createElement('li');
        row.className = 'record';
        const info = document.createElement('span');
        const title = document.createElement('strong');
        title.textContent = record.title;
        info.append(title);
        if (record.assignee) {
          const who = document.createElement('span');
          who.className = 'summary';
          who.textContent = ' · Assignee: ' + record.assignee + (record.manager ? ' · Manager: ' + record.manager : '');
          info.append(who);
        }
        if (record.blocker) {
          const block = document.createElement('span');
          block.className = 'summary error';
          block.textContent = ' · Blocker: ' + record.blocker;
          info.append(block);
        }
        const right = document.createElement('span');
        right.className = 'status';
        right.textContent = record.status + (Number.isSafeInteger(record.durationMs) ? ' · ' + formatDuration(record.durationMs) : '');
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'action-btn';
        openBtn.textContent = 'Open';
        openBtn.setAttribute('data-action', 'open-task');
        openBtn.setAttribute('data-title', record.title);
        openBtn.setAttribute('aria-label', 'Open task: ' + record.title);
        right.append(' ', openBtn);
        row.append(info, right);
        tasks.append(row);
      }
    }
    function showOperationalHealth(records) {
      operationalHealth.replaceChildren();
      if (!Array.isArray(records) || records.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'Operational health status unavailable.';
        operationalHealth.append(empty);
        return;
      }
      for (const record of records) {
        const row = document.createElement('li');
        row.className = 'record';
        const info = document.createElement('span');
        const label = document.createElement('strong');
        label.textContent = record.label;
        const detail = document.createElement('span');
        detail.className = 'summary';
        detail.textContent = ' · ' + record.detail;
        info.append(label, detail);
        const right = document.createElement('span');
        right.className = 'status status-' + String(record.status).toLowerCase();
        right.textContent = record.status;
        row.append(info, right);
        operationalHealth.append(row);
      }
    }
    function showCurrentWork(work) {
      currentWork.replaceChildren();
      const activeList = Array.isArray(work?.activeTasks) ? work.activeTasks : [];
      if (activeList.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'Engine idle · No task execution currently running.';
        currentWork.append(empty);
        return;
      }
      for (const record of activeList) {
        const row = document.createElement('li');
        row.className = 'record';
        const info = document.createElement('span');
        const title = document.createElement('strong');
        title.textContent = 'Executing: ' + record.title;
        info.append(title);
        if (record.assignee) {
          const who = document.createElement('span');
          who.className = 'summary';
          who.textContent = ' · Assignee: ' + record.assignee;
          info.append(who);
        }
        const right = document.createElement('span');
        right.className = 'status';
        right.textContent = record.status + (Number.isSafeInteger(record.durationMs) ? ' · ' + formatDuration(record.durationMs) : '');
        row.append(info, right);
        currentWork.append(row);
      }
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
        detail.textContent = record.action + ' · Actor: ' + record.agentName
          + (record.activityPersisted ? '' : ' · Not saved to task report')
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
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!target || typeof target.getAttribute !== 'function') return;
      const action = target.getAttribute('data-action');
      const title = target.getAttribute('data-title');
      if (action === 'open-objective' && title) api.postMessage({ type: 'openObjective', title });
      if (action === 'open-task' && title) api.postMessage({ type: 'openTask', title });
    });
    document.getElementById('refresh').addEventListener('click', () => api.postMessage({ type: 'refresh' }));
    document.getElementById('new-objective').addEventListener('click', () => api.postMessage({ type: 'newObjective' }));
    document.getElementById('run-task').addEventListener('click', () => api.postMessage({ type: 'runTask' }));
    document.getElementById('inspect-health').addEventListener('click', () => api.postMessage({ type: 'inspectHealth' }));
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
        executionAnnouncement.textContent = summary.textContent;
        workspaceLoadFailed = true;
        return;
      }
      if (message?.type !== 'snapshot' || !message.snapshot) return;
      const snapshot = message.snapshot;
      const executionStatus = ['PAUSED', 'CANCELLED'].includes(snapshot.executionStatus) ? snapshot.executionStatus : 'RUNNING';
      const label = executionStatus === 'PAUSED' ? 'paused' : executionStatus === 'CANCELLED' ? 'cancelled' : 'running';
      if (workspaceLoadFailed) {
        executionAnnouncement.textContent = 'Workspace data loaded. Execution ' + label + '.';
        workspaceLoadFailed = false;
        lastAnnouncedExecutionStatus = executionStatus;
      } else if (executionStatus !== lastAnnouncedExecutionStatus) {
        executionAnnouncement.textContent = 'Execution ' + label + '.';
        lastAnnouncedExecutionStatus = executionStatus;
      }
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
      showObjectives(objectiveRecords);
      showActiveTasks(taskRecords);
      showOperationalHealth(snapshot.operationalHealth);
      showCurrentWork(snapshot.currentWork);
      showRecords(completedTasks, completedRecords, 'No completed tasks yet.');
      showTaskErrors(taskErrorRecords);
      showDirectorQuestions(questionRecords);
      showActivity(activityRecords);
      showExecutionActivity(executionActivityRecords);
      const completion = Number.isFinite(progress.completionPercentage)
        ? Math.min(100, Math.max(0, progress.completionPercentage)) : 0;
      taskProgress.value = completion;
      taskProgress.setAttribute('aria-valuetext', progress.total > 0
        ? progress.completed + ' of ' + progress.total + ' tasks completed (' + completion + '%).'
        : 'No task progress yet.');
      progressSummary.textContent = progress.total > 0
        ? progress.completed + ' of ' + progress.total + ' tasks completed (' + completion + '%).'
        : 'No task progress yet.';
      const collapsed = Array.isArray(snapshot.collapsedSections) ? snapshot.collapsedSections : [];
      for (const section of sectionIds) setSectionCollapsed(section, collapsed.includes(section), false);
      summary.className = 'summary';
      summary.textContent = 'Execution ' + executionStatus.toLowerCase() + ' · ' + objectiveRecords.length + ' objective(s) · ' + taskRecords.length + ' active task(s) · ' + completedRecords.length + ' completed task(s) · ' + taskErrorRecords.length + ' task error(s) · ' + questionRecords.length + ' Director question(s) · ' + activityRecords.length + ' recent event(s) · ' + executionActivityRecords.length + ' workspace/execution event(s)';
    });
  </script>
</body>
</html>`;
};
