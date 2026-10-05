import { redactSecrets } from '../shared/redactSecrets';

const MAX_ACTIVITY_ENTRIES = 100;
const MAX_ACTIVITY_TEXT = 180;

/** Bounded, process-local activity feed. It intentionally accepts metadata only. */
export class ExecutionActivityFeed {
    constructor({ clock = () => new Date(), maxEntries = MAX_ACTIVITY_ENTRIES } = {}) {
        if (typeof clock !== 'function' || !Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > MAX_ACTIVITY_ENTRIES) {
            throw new TypeError('Execution activity feed requires a clock and a bounded entry limit.');
        }
        this.clock = clock;
        this.maxEntries = maxEntries;
        this.entries = [];
    }

    record(source, event, { taskId, agentId } = {}) {
        let normalized;
        try { normalized = normalizeActivity(source, event, this.clock()); }
        catch { return false; }
        if (!normalized) return false;
        if (typeof taskId === 'string' && taskId.trim()) normalized.taskId = taskId.trim().slice(0, 160);
        if (typeof agentId === 'string' && agentId.trim()) normalized.agentId = agentId.trim().slice(0, 160);
        this.entries.unshift(Object.freeze(normalized));
        this.entries.length = Math.min(this.entries.length, this.maxEntries);
        return true;
    }

    observer(source, { taskId, agentId } = {}) {
        if (!['workspace', 'command', 'verification'].includes(source)) {
            throw new TypeError('Unsupported execution activity source.');
        }
        return (event) => this.record(source, event, { taskId, agentId });
    }

    listRecent({ limit = 20 } = {}) {
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ACTIVITY_ENTRIES) {
            throw new TypeError(`Activity query limit must be between 1 and ${MAX_ACTIVITY_ENTRIES}.`);
        }
        return this.entries.slice(0, limit);
    }
}

function normalizeActivity(source, event, occurredAt) {
    if (!event || typeof event !== 'object') return undefined;
    const timestamp = occurredAt instanceof Date ? occurredAt.toISOString() : new Date(occurredAt).toISOString();
    if (source === 'workspace' && ['read', 'write', 'create', 'delete', 'rename'].includes(event.operation)) {
        const actions = { read: 'File read', write: 'File written', create: 'File created', delete: 'File deleted', rename: 'File renamed' };
        return { source, action: actions[event.operation],
            target: safeText(event.path, 240), status: event.succeeded === true ? 'SUCCEEDED' : 'FAILED',
            bytes: safeInteger(event.bytes), occurredAt: timestamp };
    }
    if (source === 'command' && ['started', 'finished'].includes(event.event)) {
        return { source, action: event.event === 'started' ? 'Terminal command started' : 'Terminal command finished',
            target: safeText(event.command, 80) || 'Command', status: event.event === 'started' ? 'RUNNING' : commandStatus(event),
            durationMs: safeInteger(event.durationMs), bytes: safeInteger(event.stdoutBytes) + safeInteger(event.stderrBytes),
            detail: event.event === 'finished' ? safeText(event.outputPreview, MAX_ACTIVITY_TEXT) : '',
            detailTruncated: event.event === 'finished' && event.outputTruncated === true,
            occurredAt: timestamp };
    }
    if (source === 'verification' && ['started', 'finished'].includes(event.event)) {
        return { source, action: event.event === 'started' ? 'Verification started' : 'Verification finished',
            target: safeText(event.check, 80), status: event.event === 'started' ? 'RUNNING' : safeStatus(event.status),
            durationMs: safeInteger(event.durationMs),
            detail: event.event === 'finished' ? safeText(event.outputPreview, MAX_ACTIVITY_TEXT) : '',
            detailTruncated: event.event === 'finished' && event.outputTruncated === true,
            occurredAt: timestamp };
    }
    return undefined;
}

function safeText(value, limit) {
    return redactSecrets(value, Math.min(limit, MAX_ACTIVITY_TEXT));
}

function safeStatus(value) {
    return ['PASSED', 'FAILED', 'TIMED_OUT', 'CANCELLED', 'ERROR'].includes(value) ? value : 'UNKNOWN';
}

function commandStatus(event) {
    if (event.error) return 'ERROR';
    if (event.timedOut) return 'TIMED_OUT';
    if (event.aborted) return 'CANCELLED';
    return Number.isInteger(event.exitCode) && event.exitCode === 0 ? 'SUCCEEDED' : 'FAILED';
}

function safeInteger(value) {
    return Number.isSafeInteger(value) && value > 0 ? Math.min(value, 10_000_000) : 0;
}
