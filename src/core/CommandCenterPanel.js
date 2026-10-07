import * as vscode from 'vscode';
export { renderCommandCenterHtml } from './commandCenterView';
import { renderCommandCenterHtml } from './commandCenterView';
export { createCommandCenterSnapshot } from './commandCenterSnapshot';
import { COMMAND_CENTER_SECTIONS } from './commandCenterSnapshot';
import { COMMANDS } from '../constants';

const LIVE_REFRESH_INTERVAL_MS = 5000;


/** Owns one VS Code panel and exposes only a bounded read-only workspace snapshot. */
export class CommandCenterPanel {
    constructor(readSnapshot, persistSectionPreference = () => undefined, openDirectorQuestions = () => undefined, options = {}) {
        if (typeof readSnapshot !== 'function') throw new TypeError('Command center requires a snapshot reader.');
        this.readSnapshot = readSnapshot;
        this.persistSectionPreference = typeof persistSectionPreference === 'function' ? persistSectionPreference : () => undefined;
        this.openDirectorQuestions = typeof openDirectorQuestions === 'function' ? openDirectorQuestions : () => undefined;
        this.openObjective = typeof options?.onOpenObjective === 'function' ? options.onOpenObjective : undefined;
        this.openTask = typeof options?.onOpenTask === 'function' ? options.onOpenTask : undefined;
        this.inspectHealth = typeof options?.onInspectHealth === 'function' ? options.onInspectHealth : undefined;
        this.runTask = typeof options?.onRunTask === 'function' ? options.onRunTask : undefined;
        this.onStateChange = options?.onStateChange;
        this.panel = undefined;
        this.messageSubscription = undefined;
        this.disposeSubscription = undefined;
        this.stateSubscription = undefined;
        this.viewStateSubscription = undefined;
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
            if (message?.type === 'runTask') {
                try {
                    const pending = this.runTask ? this.runTask() : vscode.commands.executeCommand(COMMANDS.RUN_ASSIGNED_TASK);
                    if (pending && typeof pending.then === 'function') void pending.catch(() => this.refresh());
                } catch {
                    this.refresh();
                }
            }
            if (message?.type === 'openObjective' && typeof message.title === 'string') {
                try {
                    const pending = this.openObjective ? this.openObjective(message.title) : vscode.commands.executeCommand(COMMANDS.ANALYZE_OBJECTIVE);
                    if (pending && typeof pending.then === 'function') void pending.catch(() => this.refresh());
                } catch {
                    this.refresh();
                }
            }
            if (message?.type === 'openTask' && typeof message.title === 'string') {
                try {
                    const pending = this.openTask ? this.openTask(message.title) : vscode.commands.executeCommand(COMMANDS.SHOW_TASK_EXECUTION_REPORT);
                    if (pending && typeof pending.then === 'function') void pending.catch(() => this.refresh());
                } catch {
                    this.refresh();
                }
            }
            if (message?.type === 'inspectHealth') {
                try {
                    const pending = this.inspectHealth ? this.inspectHealth() : vscode.commands.executeCommand(COMMANDS.SHOW_STATUS);
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
        this.viewStateSubscription = panel.onDidChangeViewState?.((event) => {
            if (event.webviewPanel?.visible) this.refresh();
        });
        if (this.onStateChange && typeof this.onStateChange.event === 'function') {
            this.stateSubscription = this.onStateChange.event(() => {
                if (this.panel && panel.visible !== false) this.refresh();
            });
        }
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
        this.stateSubscription?.dispose();
        this.viewStateSubscription?.dispose();
        for (const subscription of this.workspaceSubscriptions) subscription.dispose();
        this.workspaceSubscriptions = [];
        if (this.refreshTimer !== undefined) clearInterval(this.refreshTimer);
        this.refreshTimer = undefined;
        this.stateSubscription = undefined;
        this.viewStateSubscription = undefined;
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
