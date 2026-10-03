/** Phase 031 — dependency-injected application use-case outcomes. */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationError, createUseCase } from '../src/application';
import { DomainInvariantError } from '../src/domain';

describe('Phase 031 — application use-case boundary', () => {
    it('injects dependencies and returns explicit success values', async () => {
        const repository = { save: vi.fn().mockResolvedValue({ id: 'record-1' }) };
        const useCase = createUseCase({
            name: 'save-record', dependencies: { repository },
            execute: ({ input, dependencies }) => dependencies.repository.save(input),
        });
        expect(await useCase.run({ title: 'Record' })).toEqual({ ok: true, value: { id: 'record-1' } });
        expect(repository.save).toHaveBeenCalledWith({ title: 'Record' });
    });

    it('maps expected application/domain errors and hides unexpected exception details', async () => {
        const applicationFailure = createUseCase({ name: 'expected', execute: () => {
            throw new ApplicationError('not-authorized', 'This action is not allowed.');
        } });
        expect(await applicationFailure.run()).toEqual({ ok: false, error: {
            code: 'not-authorized', message: 'This action is not allowed.', retryable: false,
        } });
        const domainFailure = createUseCase({ name: 'domain', execute: () => {
            throw new DomainInvariantError('invalid-input', 'Input is invalid.');
        } });
        expect((await domainFailure.run()).error.code).toBe('invalid-input');
        const unexpectedFailure = createUseCase({ name: 'unknown', execute: () => {
            throw new Error('credential=private-secret');
        } });
        expect(await unexpectedFailure.run()).toEqual({ ok: false, error: {
            code: 'operation-failed', message: 'The requested operation could not be completed.', retryable: false,
        } });
    });

    it('validates use-case definitions and has no VS Code or database-driver imports', () => {
        expect(() => createUseCase({ name: 'bad name', execute: () => undefined })).toThrow();
        expect(() => createUseCase({ name: 'missing-execute' })).toThrow();
        const applicationDirectory = join(__dirname, '..', 'src', 'application');
        for (const entry of readdirSync(applicationDirectory, { withFileTypes: true })) {
            if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
            const source = readFileSync(join(applicationDirectory, entry.name), 'utf8');
            expect(source, entry.name).not.toMatch(/from\s+['"](?:vscode|better-sqlite3)['"]/);
        }
    });
});
