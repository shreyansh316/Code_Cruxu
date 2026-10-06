/**
 * HEADROOM — VS Code Module Mock
 * Used by Vitest to run unit tests outside VS Code Extension Host.
 *
 * IMPORTANT: This mock only covers what is needed for unit tests.
 * Do NOT add fake implementations here — only enough to prevent import errors
 * and enable deterministic unit testing of pure logic.
 *
 * VS Code integration tests use @vscode/test-electron instead.
 */
const vscode = {
    // ExtensionContext mock
    ExtensionContext: class {
    },
    // Window
    window: {
        showInformationMessage: vi.fn().mockResolvedValue(undefined),
        showWarningMessage: vi.fn().mockResolvedValue(undefined),
        showErrorMessage: vi.fn().mockResolvedValue(undefined),
        showQuickPick: vi.fn().mockResolvedValue(undefined),
        showTextDocument: vi.fn().mockResolvedValue(undefined),
        withProgress: vi.fn(async (_options, task) => task({ report: vi.fn() }, {
            onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() })),
        })),
        showInputBox: vi.fn().mockResolvedValue(undefined),
        createStatusBarItem: vi.fn().mockReturnValue({
            id: '',
            name: '',
            text: '',
            tooltip: '',
            command: '',
            show: vi.fn(),
            hide: vi.fn(),
            dispose: vi.fn(),
        }),
        createOutputChannel: vi.fn().mockReturnValue({
            appendLine: vi.fn(),
            append: vi.fn(),
            show: vi.fn(),
            dispose: vi.fn(),
        }),
        createTerminal: vi.fn().mockReturnValue({
            sendText: vi.fn(),
            show: vi.fn(),
            dispose: vi.fn(),
        }),
        registerTreeDataProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        createWebviewPanel: vi.fn(),
    },
    // Commands
    commands: {
        registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        executeCommand: vi.fn().mockResolvedValue(undefined),
    },
    // Workspace
    workspace: {
        workspaceFolders: [],
        getConfiguration: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
        }),
        openTextDocument: vi.fn().mockResolvedValue({ uri: { fsPath: 'review-evidence.json' } }),
        onDidChangeConfiguration: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        fs: {
            readFile: vi.fn(),
            writeFile: vi.fn(),
            stat: vi.fn(),
        },
    },
    // URI
    Uri: {
        file: (path) => ({ fsPath: path, scheme: 'file', path }),
        parse: (uri) => ({ fsPath: uri, scheme: 'file', path: uri }),
    },
    // StatusBarAlignment
    StatusBarAlignment: {
        Left: 1,
        Right: 2,
    },
    ViewColumn: { One: 1 },
    ProgressLocation: { Notification: 15 },
    // Disposable
    Disposable: class {
        dispose() { }
        static from(...disposables) {
            return {
                dispose() {
                    for (const d of disposables)
                        d.dispose();
                }
            };
        }
    },
    // EventEmitter
    EventEmitter: class {
        _listeners = [];
        event = (listener) => {
            this._listeners.push(listener);
            return { dispose: () => { this._listeners = this._listeners.filter(l => l !== listener); } };
        };
        fire(...args) {
            this._listeners.forEach(l => l(...args));
        }
        dispose() { this._listeners = []; }
    },
    // TreeItem
    TreeItem: class {
        label;
        collapsibleState;
        constructor(label, collapsibleState) {
            this.label = label;
            this.collapsibleState = collapsibleState;
        }
    },
    TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2,
    },
    // ThemeIcon
    ThemeIcon: class {
        id;
        color;
        constructor(id, color) {
            this.id = id;
            this.color = color;
        }
    },
    // MarkdownString
    MarkdownString: class {
        value;
        constructor(value) {
            this.value = value;
        }
        appendMarkdown(v) { this.value = (this.value ?? '') + v; return this; }
    },
};
export const {
    ExtensionContext, window, commands, workspace, Uri, StatusBarAlignment, ViewColumn, ProgressLocation,
    Disposable, EventEmitter, TreeItem, TreeItemCollapsibleState, ThemeIcon, MarkdownString,
} = vscode;
export default vscode;
