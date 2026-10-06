const MAX_PATHS = 100;
const MAX_COMMANDS = 20;
const MAX_MANIFEST_BYTES = 64_000;
const SHELL_NAMES = new Set(['sh', 'bash', 'dash', 'zsh', 'fish', 'cmd', 'powershell', 'pwsh', 'wscript', 'cscript']);

/** Validate and freeze a task's explicit workspace-relative file and exact process grants. */
export function normalizeTaskToolPermissions(value) {
    if (value === undefined || value === null) return null;
    if (!isPlainObject(value) || Object.keys(value).some((key) => !['readFiles', 'writeFiles', 'commands', 'workspaceFingerprint'].includes(key))
        || !Array.isArray(value.readFiles) || !Array.isArray(value.writeFiles) || !Array.isArray(value.commands)
        || (value.workspaceFingerprint !== undefined && (typeof value.workspaceFingerprint !== 'string'
            || !/^[a-f0-9]{64}$/.test(value.workspaceFingerprint)))
        || value.readFiles.length > MAX_PATHS || value.writeFiles.length > MAX_PATHS || value.commands.length > MAX_COMMANDS) invalid();
    const readFiles = normalizePaths(value.readFiles);
    const writeFiles = normalizePaths(value.writeFiles);
    const commandKeys = new Set();
    const commands = value.commands.map((entry) => {
        if (!isPlainObject(entry) || Object.keys(entry).some((key) => !['command', 'args'].includes(key))
            || typeof entry.command !== 'string' || !entry.command.trim() || entry.command.length > 260
            || /[\u0000-\u001f\u007f]/.test(entry.command) || !Array.isArray(entry.args) || entry.args.length > 100) invalid();
        const command = entry.command.trim();
        const commandName = command.split(/[\\/]/).at(-1).trimEnd().replace(/[. ]+$/g, '').toLowerCase()
            .replace(/\.(?:exe|com|bat|cmd)$/, '');
        if (SHELL_NAMES.has(commandName)) invalid();
        const normalizedCommand = command.replaceAll('\\', '/').replace(/[. ]+$/, '').toLocaleLowerCase('en-US');
        if (commandKeys.has(normalizedCommand)) invalid();
        commandKeys.add(normalizedCommand);
        let argumentBytes = 0;
        const args = entry.args.map((argument) => {
            if (typeof argument !== 'string' || new TextEncoder().encode(argument).byteLength > 2048) invalid();
            argumentBytes += new TextEncoder().encode(argument).byteLength;
            return argument;
        });
        if (argumentBytes > 64_000) invalid();
        return Object.freeze({ command, args: Object.freeze(args) });
    });
    const result = Object.freeze({ readFiles, writeFiles, commands: Object.freeze(commands),
        ...(value.workspaceFingerprint ? { workspaceFingerprint: value.workspaceFingerprint } : {}) });
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_MANIFEST_BYTES) invalid();
    return result;
}

function normalizePaths(value) {
    const paths = new Set();
    return Object.freeze(value.map((entry) => {
        if (typeof entry !== 'string' || !entry.trim() || entry.length > 500 || entry.includes('\0') || entry.includes(':')
            || entry.startsWith('/') || entry.startsWith('\\') || /^[a-z]:/i.test(entry)
            || entry.split(/[\\/]/).some((segment) => !segment || segment === '.' || segment === '..'
                || /[. ]$/.test(segment) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment))) invalid();
        const normalized = entry.replaceAll('\\', '/');
        const key = normalized.toLocaleLowerCase('en-US');
        if (paths.has(key)) invalid();
        paths.add(key);
        return normalized;
    }));
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function invalid() {
    throw new TypeError('Task tool permissions must contain bounded, workspace-relative file paths and exact non-shell command grants.');
}
