/** Phase 325 — make the dedicated 50-phase security regression matrix fail closed. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import securityRegression from '../scripts/security-regression';

const { resolveSecurityRegressionFiles } = securityRegression;

const directories = [];
async function fixtureDirectory() {
    const directory = await mkdtemp(join(tmpdir(), 'headroom-security-matrix-'));
    directories.push(directory);
    return directory;
}

afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe('Phase 325 — dedicated security regression matrix', () => {
    it('selects the threat-boundary suite and all 50 numbered security-phase suites in order', async () => {
        const directory = await fixtureDirectory();
        const expected = [91, ...Array.from({ length: 50 }, (_, index) => index + 276)]
            .map((phase) => `phase-${String(phase).padStart(3, '0')}.test.js`);
        await Promise.all(expected.map((file) => writeFile(join(directory, file), '')));
        expect(resolveSecurityRegressionFiles(directory).map((file) => basename(file))).toEqual(expected);
    });

    it('fails with the missing phase number rather than silently running partial coverage', async () => {
        const directory = await fixtureDirectory();
        const phases = [91, ...Array.from({ length: 50 }, (_, index) => index + 276).filter((phase) => phase !== 300)];
        await Promise.all(phases.map((phase) => writeFile(join(directory,
            `phase-${String(phase).padStart(3, '0')}.test.js`), '')));
        expect(() => resolveSecurityRegressionFiles(directory)).toThrow(/phase-300\.test\.js/);
    });
});
