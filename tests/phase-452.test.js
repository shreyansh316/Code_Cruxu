/** Phase 452 — dead-export detection and removal. */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildCorpus, extractExportedNames, hasExternalReference, findDeadExports,
    loadBaseline, evaluateAgainstBaseline } = require('../scripts/dead-code-audit.js');

const DEFINING = [
    'export function live(value) { return helper(value); }',
    'function helper(value) { return value; }',
    'export const CONSTANT = 1;',
    'export async function asyncLive() {}',
    'export class Widget {}',
    'export { helper as internalHelper };',
    "export { reexportedOnly } from './other';",
].join('\n');

describe('Phase 452 — export extraction', () => {
    it('extracts local export names across function, const, class, and alias forms', () => {
        expect(extractExportedNames(DEFINING).sort()).toEqual(
            ['CONSTANT', 'Widget', 'asyncLive', 'live', 'internalHelper'].sort());
    });

    it('treats re-export-only barrels as defining nothing locally', () => {
        expect(extractExportedNames("export { a, b as c } from './x';")).toEqual([]);
    });
});

describe('Phase 452 — external reference counting', () => {
    const corpus = {
        'src/origin.js': 'export function target() {}\nexport function localOnly() { return target(); }',
        'src/barrel.js': "export { target } from './origin';",
        'src/consumer.js': "import { target } from './origin';\nexport function use() { return target(); }",
        'src/extension.js': 'export function activate() {}\nexport function deactivate() {}',
        'test/suite/smoke.js': "const { activate } = require('../../out/extension');",
    };

    it('counts imports and usages in other files as live references', () => {
        expect(hasExternalReference('target', 'src/origin.js', corpus)).toBe(true);
    });

    it('ignores same-module usage and barrel re-exports when deciding liveness', () => {
        expect(hasExternalReference('localOnly', 'src/origin.js', corpus)).toBe(false);
        expect(hasExternalReference('reexportedOnly', 'src/origin.js', corpus)).toBe(false);
    });

    it('skips re-export lines but not real code when scanning reference files', () => {
        const barrelOnly = { 'src/a.js': 'export function ghost() {}', 'src/b.js': "export { ghost } from './a';" };
        expect(hasExternalReference('ghost', 'src/a.js', barrelOnly)).toBe(false);
    });
});

describe('Phase 452 — repository scan', () => {
    it('does not flag the VS Code entry module or non-source modules', () => {
        const corpus = {
            'src/extension.js': 'export function activate() {}\nexport function deactivate() {}',
            'scripts/tool.js': 'export function cli() {}',
        };
        expect(findDeadExports(corpus)).toEqual([]);
    });

    it('finds and sorts dead exports deterministically across modules', () => {
        const corpus = {
            'src/z.js': 'export function alpha() {}',
            'src/a.js': 'export function beta() {}\nexport function gamma() {}',
            'src/used.js': 'export function used() {}',
            'src/app.js': "import { used } from './used';\nused();",
        };
        expect(findDeadExports(corpus)).toEqual([
            { module: 'src/a.js', name: 'beta' },
            { module: 'src/a.js', name: 'gamma' },
            { module: 'src/z.js', name: 'alpha' },
        ]);
    });
});

describe('Phase 452 — baseline gate', () => {
    it('accepts findings recorded in the baseline and flags only new ones', () => {
        const findings = [
            { module: 'src/a.js', name: 'recorded' },
            { module: 'src/b.js', name: 'new' },
        ];
        const baseline = { deadExports: [{ module: 'src/a.js', name: 'recorded' }] };
        expect(evaluateAgainstBaseline(findings, baseline.deadExports)).toEqual([
            { module: 'src/b.js', name: 'new' },
        ]);
    });

    it('keeps a zero-finding tree inside the Phase 452 baseline', () => {
        const findings = findDeadExports(buildCorpus());
        expect(findings).toEqual([]);
        expect(loadBaseline().deadExports).toEqual([]);
        expect(evaluateAgainstBaseline(findings, loadBaseline().deadExports)).toEqual([]);
    });
});
