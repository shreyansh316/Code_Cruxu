/** Phase 456 — task manifests audited against declared position scope. */
import { describe, expect, it } from 'vitest';

import { auditTaskToolPermissions } from '../src/domain/positionManifestAudit';
import { getDepartmentPositions } from '../src/domain/positionCatalog';
import { pathMatchesScope } from '../src/domain/scopeMatch';

const unrealPosition = getDepartmentPositions('game-development', 'game-engine-systems')[0];
const readOnlyPosition = { name: 'Reviewer', readScope: ['src/**'], writeScope: [], commandScope: ['git'] };
const memoryPosition = { name: 'Memory Steward', readScope: ['src/domain/memory*.js', 'docs/memory/**'],
    writeScope: ['docs/memory/**'], commandScope: [] };

describe('Phase 456 — scope matching grammar', () => {
    it('matches literal, single-star, and directory-tree scopes deterministically', () => {
        expect(pathMatchesScope('Source/Game/Main.cpp', 'Source/**')).toBe(true);
        expect(pathMatchesScope('Source', 'Source/**')).toBe(true);
        expect(pathMatchesScope('SourceEvil/Main.cpp', 'Source/**')).toBe(false);
        expect(pathMatchesScope('MyGame.uproject', '*.uproject')).toBe(true);
        expect(pathMatchesScope('src/domain/memoryRetrieval.js', 'src/domain/memory*.js')).toBe(true);
        expect(pathMatchesScope('src/domain/other.js', 'src/domain/memory*.js')).toBe(false);
        expect(pathMatchesScope('docs/memory/notes.md', 'docs/memory/**')).toBe(true);
        expect(pathMatchesScope('../escape/Main.cpp', 'Source/**')).toBe(false);
    });

    it('rejects patterns that could express escapes or unsupported syntax', () => {
        for (const pattern of ['**/etc', 'a/**/b', '', 'C:/**', '/absolute/**', 'a..b/**'.replace('a..b', 'a//b')]) {
            expect(() => pathMatchesScope('x', pattern)).toThrow();
        }
        expect(pathMatchesScope('x', '**')).toBe(true);
    });
});

describe('Phase 456 — manifest audit against declared position scope', () => {
    it('accepts a manifest fully inside the position scope', () => {
        const report = auditTaskToolPermissions(unrealPosition, {
            readFiles: ['Source/Game/Main.cpp', 'MyGame.uproject'], writeFiles: ['Config/DefaultEngine.ini'],
            commands: [{ command: 'build', args: [] }],
        });
        expect(report.withinScope).toBe(true);
        expect(report.violations).toEqual([]);
    });

    it('flags reads, writes, and commands outside the declared scope in deterministic order', () => {
        const report = auditTaskToolPermissions(unrealPosition, {
            readFiles: ['README.md', 'Source/ok.cpp'], writeFiles: ['Other/leak.txt'],
            commands: [{ command: 'powershell.exe', args: [] }, { command: 'msbuild', args: [] }],
        });
        expect(report.withinScope).toBe(false);
        expect(report.violations.map((violation) => `${violation.kind}:${violation.value}`)).toEqual([
            'read:README.md', 'write:Other/leak.txt', 'command:powershell.exe',
        ]);
    });

    it('treats an empty write scope as read-only and an empty command scope as no commands', () => {
        const writes = auditTaskToolPermissions(readOnlyPosition, { writeFiles: ['src/patch.js'] });
        expect(writes.violations[0]).toMatchObject({ kind: 'write' });
        const commands = auditTaskToolPermissions(memoryPosition, { commands: [{ command: 'node', args: [] }] });
        expect(commands.violations[0]).toMatchObject({ kind: 'command' });
        expect(auditTaskToolPermissions(readOnlyPosition, { readFiles: ['src/deep/file.js'] }).withinScope).toBe(true);
    });

    it('accepts empty manifests and normalizes command names for comparison', () => {
        expect(auditTaskToolPermissions(unrealPosition, {}).withinScope).toBe(true);
        expect(auditTaskToolPermissions(unrealPosition, { commands: [{ command: './tools/MSBUILD.EXE', args: [] }] }).withinScope)
            .toBe(true);
        expect(auditTaskToolPermissions(unrealPosition, { commands: [{ command: './tools/LINK.EXE', args: [] }] }).withinScope)
            .toBe(false);
    });

    it('rejects malformed positions, paths, and commands with stable codes', () => {
        expect(() => auditTaskToolPermissions(null, {})).toThrowError(expect.objectContaining({ code: 'invalid-position-audit-input' }));
        expect(() => auditTaskToolPermissions({ name: 'x', readScope: [], writeScope: [], commandScope: [] }, { readFiles: ['../up'] }))
            .toThrowError(expect.objectContaining({ code: 'invalid-position-audit-input' }));
        expect(() => auditTaskToolPermissions(unrealPosition, { readFiles: 'Source/Main.cpp' }))
            .toThrowError(expect.objectContaining({ code: 'invalid-position-audit-input' }));
        expect(() => auditTaskToolPermissions(unrealPosition, { commands: [{ command: '  ' }] }))
            .toThrowError(expect.objectContaining({ code: 'invalid-position-audit-input' }));
    });
});
