/** Phase 030 — correlated, redacted structured diagnostics. */
import { describe, expect, it, vi } from 'vitest';
import { createDiagnosticLogger } from '../src/application';

describe('Phase 030 — structured diagnostics', () => {
    it('correlates structured records and uses the injected clock', () => {
        const write = vi.fn();
        const logger = createDiagnosticLogger({
            write, correlationId: 'correlation-123', now: () => new Date('2026-10-03T12:00:00.000Z'),
        }).forOperation('task-submit');
        const record = logger.emit('INFO', 'task-result-saved', { taskId: 'task-7', status: 'COMPLETED', durationMs: 40 });
        expect(record).toEqual({ timestamp: '2026-10-03T12:00:00.000Z', level: 'INFO',
            operation: 'task-submit', code: 'task-result-saved', correlationId: 'correlation-123',
            context: { taskId: 'task-7', status: 'COMPLETED', durationMs: 40 }, omittedContextFields: 0 });
        expect(write).toHaveBeenCalledWith(record);
    });

    it('omits credentials, prompts, free-form content, and unsafe values', () => {
        const write = vi.fn();
        const logger = createDiagnosticLogger({ write, correlationId: 'safe-correlation' }).forOperation('provider-call');
        const record = logger.emit('ERROR', 'provider-failed', {
            taskId: 'task-1', apiKey: 'sk-secret-value', authorization: 'Bearer secret',
            prompt: 'private user input', content: 'sensitive response', message: 'token=secret',
            status: 'FAILED', provider: 'vendor',
        });
        expect(record.context).toEqual({ taskId: 'task-1', status: 'FAILED' });
        const serialized = JSON.stringify(record);
        for (const secret of ['sk-secret-value', 'Bearer secret', 'private user input', 'sensitive response', 'token=secret']) {
            expect(serialized).not.toContain(secret);
        }
        expect(record.omittedContextFields).toBe(6);
    });

    it('keeps one stable correlation id per logger and rejects unsafe free-form codes', () => {
        const write = vi.fn();
        const logger = createDiagnosticLogger({ write });
        const operation = logger.forOperation('objective-intake');
        operation.emit('DEBUG', 'request-started');
        operation.emit('ERROR', 'request-failed');
        expect(write.mock.calls[0][0].correlationId).toMatch(/^[0-9a-f-]{36}$/i);
        expect(write.mock.calls[1][0].correlationId).toBe(write.mock.calls[0][0].correlationId);
        expect(() => logger.forOperation('Call with secret key')).toThrow();
        expect(() => operation.emit('INFO', 'raw error: credential=secret')).toThrow();
    });
});
