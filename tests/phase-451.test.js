/** Phase 451 — deterministic complexity audit baseline. */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { DEFAULT_COMPLEXITY_THRESHOLDS, METRICS, measureSourceComplexity, evaluateComplexity,
    buildComplexityAudit, auditSourceTree } = require('../scripts/complexity-audit.js');

const srcRoot = fileURLToPath(new URL('../src', import.meta.url));
const SAMPLE = [
    '// header comment',
    'export function first(value) {',
    '    if (value && value.ready) return value;',
    '    for (const key of Object.keys(value ?? {})) {',
    '        while (value[key] || value[key] === 0) break;',
    '    }',
    '    return value ?? null;',
    '}',
    'const second = (items) => items.map((item) => item);',
    '',
].join('\r\n');

describe('Phase 451 — source complexity measurement', () => {
    it('counts lines, function declarations, and branch points deterministically across CRLF and trailing newlines', () => {
        expect(measureSourceComplexity(SAMPLE)).toEqual({ lines: 9, functions: 3, branches: 7 });
        expect(measureSourceComplexity(SAMPLE.replace(/\r\n/g, '\n'))).toEqual(measureSourceComplexity(SAMPLE));
    });

    it('measures empty sources as zero and rejects non-string sources', () => {
        expect(measureSourceComplexity('')).toEqual({ lines: 0, functions: 0, branches: 0 });
        expect(measureSourceComplexity('\r\n')).toEqual({ lines: 0, functions: 0, branches: 0 });
        expect(() => measureSourceComplexity(null)).toThrow(TypeError);
        expect(() => measureSourceComplexity(42)).toThrow(TypeError);
    });
});

describe('Phase 451 — threshold evaluation', () => {
    const thresholds = { maxLines: 10, maxFunctions: 2, maxBranches: 3 };

    it('accepts entries exactly at the limits and reports strict exceedances only', () => {
        const at = { file: 'a.js', lines: 10, functions: 2, branches: 3 };
        expect(evaluateComplexity([at], thresholds)).toEqual([]);
        const over = { file: 'b.js', lines: 11, functions: 2, branches: 3 };
        expect(evaluateComplexity([over], thresholds)).toEqual([
            { file: 'b.js', metric: 'lines', value: 11, limit: 10 },
        ]);
    });

    it('orders violations deterministically by file then metric', () => {
        const violations = evaluateComplexity([
            { file: 'z.js', lines: 99, functions: 99, branches: 99 },
            { file: 'a.js', lines: 99, functions: 99, branches: 99 },
        ], thresholds);
        expect(violations.map((violation) => `${violation.file}:${violation.metric}`)).toEqual([
            'a.js:branches', 'a.js:functions', 'a.js:lines', 'z.js:branches', 'z.js:functions', 'z.js:lines',
        ]);
    });

    it('rejects invalid thresholds and entries with precise errors', () => {
        expect(() => evaluateComplexity([], { maxLines: 0, maxFunctions: 2, maxBranches: 3 })).toThrow(TypeError);
        expect(() => evaluateComplexity([], { maxLines: 10, maxFunctions: Number.NaN, maxBranches: 3 })).toThrow(TypeError);
        expect(() => evaluateComplexity('entries')).toThrow(TypeError);
        expect(() => evaluateComplexity([{ lines: 1, functions: 1, branches: 1 }], thresholds)).toThrow(TypeError);
        expect(() => evaluateComplexity([{ file: 'a.js', lines: -1, functions: 1, branches: 1 }], thresholds)).toThrow(TypeError);
    });
});

describe('Phase 451 — audit report construction', () => {
    it('reports per-file metrics, per-metric worst offenders, and the file count', () => {
        const audit = buildComplexityAudit([
            { file: 'b.js', lines: 5, functions: 2, branches: 4 },
            { file: 'a.js', lines: 9, functions: 3, branches: 2 },
        ], { maxLines: 10, maxFunctions: 2, maxBranches: 3 });
        expect(audit.fileCount).toBe(2);
        expect(audit.files.map((entry) => entry.file)).toEqual(['a.js', 'b.js']);
        expect(audit.worst.lines).toEqual({ file: 'a.js', value: 9 });
        expect(audit.worst.functions).toEqual({ file: 'a.js', value: 3 });
        expect(audit.worst.branches).toEqual({ file: 'b.js', value: 4 });
        expect(audit.violations).toEqual([
            { file: 'a.js', metric: 'functions', value: 3, limit: 2 },
            { file: 'b.js', metric: 'branches', value: 4, limit: 3 },
        ]);
    });

    it('audits an empty tree without violations and rejects malformed entries', () => {
        const audit = buildComplexityAudit([], { maxLines: 10, maxFunctions: 2, maxBranches: 3 });
        expect(audit.fileCount).toBe(0);
        expect(audit.violations).toEqual([]);
        expect(audit.worst.lines).toBe(null);
        expect(() => buildComplexityAudit([{ file: 'a.js', lines: 1.5, functions: 0, branches: 0 }])).toThrow(TypeError);
    });
});

describe('Phase 451 — shipped baseline holds the real source tree', () => {
    it('keeps every src/ file within the recorded complexity baseline', () => {
        const audit = auditSourceTree(srcRoot);
        expect(audit.fileCount).toBeGreaterThan(100);
        expect(audit.violations).toEqual([]);
        expect(audit.worst.lines.file).toBe('core/HeadroomContext.js');
        expect(DEFAULT_COMPLEXITY_THRESHOLDS).toEqual({ maxLines: 1185, maxFunctions: 115, maxBranches: 251 });
        expect(METRICS.map((metric) => metric.key)).toEqual(['lines', 'functions', 'branches']);
    });
});
