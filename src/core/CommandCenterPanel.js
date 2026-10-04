import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';

const TERMINAL_TASK_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const MAX_VISIBLE_RECORDS = 20;

/** Build a bounded, read-only snapshot from persisted objective and task records. */
export function createCommandCenterSnapshot({ objectives, tasks, executionStatus }) {
    if (!Array.isArray(objectives) || !Array.isArray(tasks)) {
        throw new TypeError('Command center requires objective and task records.');
    }
    return Object.freeze({
        executionStatus: executionStatus === 'PAUSED' ? 'PAUSED' : 'RUNNING',
        objectives: Object.freeze(objectives.slice(0, MAX_VISIBLE_RECORDS).map((record) => Object.freeze({
            title: boundedText(record?.title, 200, 'Untitled objective'),
            status: boundedText(record?.status, 32, 'UNKNOWN'),
        }))),
        activeTasks: Object.freeze(tasks.filter((record) => !TERMINAL_TASK_STATUSES.has(record?.status))
            .slice(0, MAX_VISIBLE_RECORDS).map((record) => Object.freeze({
                title: boundedText(record?.title, 200, 'Untitled task'),
                status: boundedText(record?.status, 32, 'UNKNOWN'),
            }))),
    });
}

function boundedText(value, maxLength, fallback) {
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

/** Owns one VS Code panel and exposes only a bounded read-only workspace snapshot. */
export class CommandCenterPanel {
    constructor(readSnapshot) {
        if (typeof readSnapshot !== 'function') throw new TypeError('Command center requires a snapshot reader.');
        this.readSnapshot = readSnapshot;
        this.panel = undefined;
        this.messageSubscription = undefined;
        this.disposeSubscription = undefined;
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
            if (message && message.type === 'refresh') this.refresh();
        });
        this.disposeSubscription = panel.onDidDispose(() => this._clearPanel(panel));
        this.refresh();
    }

    refresh() {
        if (!this.panel) return;
        try {
            this._postMessage({ type: 'snapshot', snapshot: this.readSnapshot() });
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
  </style>
</head>
<body>
  <header><h1>HEADROOM Command Center</h1><button id="refresh" type="button">Refresh</button></header>
  <p id="summary" class="summary" role="status" aria-live="polite">Loading current workspace data…</p>
  <section aria-labelledby="objectives-heading"><h2 id="objectives-heading">Objectives</h2><ul id="objectives"></ul></section>
  <section aria-labelledby="tasks-heading"><h2 id="tasks-heading">Active tasks</h2><ul id="tasks"></ul></section>
  <script nonce="${nonce}">
    const api = acquireVsCodeApi();
    const summary = document.getElementById('summary');
    const objectives = document.getElementById('objectives');
    const tasks = document.getElementById('tasks');
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
        status.textContent = record.status;
        row.append(title, status);
        list.append(row);
      }
    }
    document.getElementById('refresh').addEventListener('click', () => api.postMessage({ type: 'refresh' }));
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message?.type === 'loadError') {
        summary.textContent = 'Could not load workspace data. Use Refresh to try again.';
        summary.className = 'error';
        return;
      }
      if (message?.type !== 'snapshot' || !message.snapshot) return;
      const snapshot = message.snapshot;
      const objectiveRecords = Array.isArray(snapshot.objectives) ? snapshot.objectives : [];
      const taskRecords = Array.isArray(snapshot.activeTasks) ? snapshot.activeTasks : [];
      showRecords(objectives, objectiveRecords, 'No objectives yet.');
      showRecords(tasks, taskRecords, 'No active tasks.');
      summary.className = 'summary';
      summary.textContent = 'Execution ' + (snapshot.executionStatus === 'PAUSED' ? 'paused' : 'running') + ' · ' + objectiveRecords.length + ' objective(s) · ' + taskRecords.length + ' active task(s)';
    });
  </script>
</body>
</html>`;
}

export { renderCommandCenterHtml };
