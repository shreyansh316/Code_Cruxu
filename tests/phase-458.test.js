/** Phase 458 — duplicate-logic detection across source files. */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeLine, buildFileWindows, findDuplicateGroups, buildCorpus, loadBaseline,
    evaluateAgainstBaseline } = require('../scripts/duplicate-logic-audit.js');

const BLOCK = [
    '    if (!value) return null;',
    ...Array.from({ length: 9 }, (_, index) => `    const step${index} = compute(value, ${index});`),
];

describe('Phase 458 — statement normalization', () => {
    it('masks strings and numbers so cosmetic edits do not hide duplication', () => {
        expect(normalizeLine("const name = 'alpha'; // trailing")).toBe("const name = 'S';");
        expect(normalizeLine('const name = "beta";')).toBe(normalizeLine("const name = 'alpha';"));
        expect(normalizeLine('retry(100, 250);')).toBe(normalizeLine('retry(1, 2);'));
    });

    it('drops blank and comment-only lines from the logic stream', () => {
        expect(normalizeLine('')).toBe(null);
        expect(normalizeLine('   ')).toBe(null);
        expect(normalizeLine('// commented out')).toBe(null);
        expect(normalizeLine('* block comment continuation')).toBe(null);
    });
});

describe('Phase 458 — window grouping', () => {
    it('flags a duplicated statement block only when it spans multiple files', () => {
        const corpus = {
            'src/a.js': BLOCK.join('\n'),
            'src/b.js': BLOCK.join('\n'),
            'src/c.js': 'export function three(value) { return value; }',
        };
        const groups = findDuplicateGroups(corpus);
        expect(groups).toHaveLength(1);
        expect(new Set(groups[0].occurrences.map((occurrence) => occurrence.file))).toEqual(new Set(['src/a.js', 'src/b.js']));
    });

    it('ignores repetition inside a single file and reports none for distinct files', () => {
        const sameFile = `export function loop(value) {\n${BLOCK.join('\n')}\n${BLOCK.join('\n')}\n}`;
        expect(findDuplicateGroups({ 'src/solo.js': sameFile })).toEqual([]);
        expect(findDuplicateGroups({ 'src/x.js': 'const a = 1;', 'src/y.js': 'const b = 2;' })).toEqual([]);
    });

    it('tracks originating line numbers for actionable findings', () => {
        const windows = buildFileWindows('src/t.js', `// header\nexport function start() {\n${BLOCK.join('\n')}\n}`);
        expect(windows.length).toBeGreaterThan(0);
        expect(windows[0].line).toBe(2);
        expect(windows[0].file).toBe('src/t.js');
    });
});

describe('Phase 458 — baseline gate over the real source tree', () => {
    it('keeps every cross-file duplicate inside the recorded baseline', () => {
        const groups = findDuplicateGroups(buildCorpus());
        expect(groups).toEqual([]);
        expect(loadBaseline().groups).toEqual([]);
    });

    it('rejects signatures missing from the baseline', () => {
        const findings = [{ signature: 'new123', occurrences: [{ file: 'src/a.js', line: 1 }] }];
        expect(evaluateAgainstBaseline(findings, [{ signature: 'other456', files: ['src/b.js'] }])).toEqual(findings);
        expect(evaluateAgainstBaseline(findings, [{ signature: 'new123', files: ['src/a.js'] }])).toEqual([]);
    });
});
