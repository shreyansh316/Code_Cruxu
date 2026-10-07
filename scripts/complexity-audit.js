/** Phase 451 — deterministic per-file complexity audit for Advanced-level simplicity control.
 *
 * Heuristic structural metrics (file lines, function declarations, branch points)
 * computed identically on every run. The shipped thresholds record the current
 * worst offenders in src/; a file exceeding them fails the audit so complexity
 * cannot grow silently. This is a development-time gate, not extension runtime.
 */
const fs = require('fs');
const path = require('path');

const METRICS = Object.freeze([
    Object.freeze({ key: 'lines', limit: 'maxLines' }),
    Object.freeze({ key: 'functions', limit: 'maxFunctions' }),
    Object.freeze({ key: 'branches', limit: 'maxBranches' }),
]);

/** Baseline tightened at Phase 463 after the HeadroomContext decomposition: the current worst src/ file on each metric.
 * Any file exceeding these bounds fails the audit; raising a limit is a deliberate,
 * reviewed simplification exception, never a side effect of adding code. */
const DEFAULT_COMPLEXITY_THRESHOLDS = Object.freeze({ maxLines: 962, maxFunctions: 132, maxBranches: 203 });

const FUNCTION_PATTERN = /\bfunction\b|=>/g;
const BRANCH_PATTERN = /\b(?:if|for|while|case|catch)\b|&&|\|\||\?\?/g;

function compareStrings(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}

/** Measure deterministic structural metrics for one source text. */
function measureSourceComplexity(source) {
    if (typeof source !== 'string') {
        throw new TypeError('complexity-audit-source-required');
    }
    const text = source.replace(/\r\n/g, '\n').replace(/\n$/, '');
    const lines = text === '' ? 0 : text.split('\n').length;
    const functions = (text.match(FUNCTION_PATTERN) || []).length;
    const branches = (text.match(BRANCH_PATTERN) || []).length;
    return Object.freeze({ lines, functions, branches });
}

function assertThresholds(thresholds) {
    if (!thresholds || typeof thresholds !== 'object') {
        throw new TypeError('complexity-audit-thresholds-required');
    }
    for (const metric of METRICS) {
        const value = thresholds[metric.limit];
        if (!Number.isFinite(value) || value <= 0) {
            throw new TypeError(`complexity-audit-invalid-threshold:${metric.limit}`);
        }
    }
    return thresholds;
}

function assertEntry(entry, index) {
    if (!entry || typeof entry !== 'object' || typeof entry.file !== 'string' || !entry.file.trim()) {
        throw new TypeError(`complexity-audit-invalid-entry:${index}`);
    }
    for (const metric of METRICS) {
        const value = entry[metric.key];
        if (!Number.isInteger(value) || value < 0) {
            throw new TypeError(`complexity-audit-invalid-metric:${entry.file}:${metric.key}`);
        }
    }
    return entry;
}

/** Return the sorted violations where a file metric strictly exceeds its limit. */
function evaluateComplexity(entries, thresholds = DEFAULT_COMPLEXITY_THRESHOLDS) {
    assertThresholds(thresholds);
    if (!Array.isArray(entries)) {
        throw new TypeError('complexity-audit-entries-required');
    }
    const violations = [];
    entries.forEach((entry, index) => {
        assertEntry(entry, index);
        for (const metric of METRICS) {
            const value = entry[metric.key];
            if (value > thresholds[metric.limit]) {
                violations.push(Object.freeze({ file: entry.file, metric: metric.key, value, limit: thresholds[metric.limit] }));
            }
        }
    });
    violations.sort((a, b) => compareStrings(a.file, b.file) || compareStrings(a.metric, b.metric));
    return Object.freeze(violations);
}

/** Build a full audit report with per-file metrics, per-metric worst offenders, and violations. */
function buildComplexityAudit(entries, thresholds = DEFAULT_COMPLEXITY_THRESHOLDS) {
    assertThresholds(thresholds);
    if (!Array.isArray(entries)) {
        throw new TypeError('complexity-audit-entries-required');
    }
    const files = entries.map((entry, index) => Object.freeze({ ...assertEntry(entry, index) }))
        .sort((a, b) => compareStrings(a.file, b.file));
    const worst = {};
    for (const metric of METRICS) {
        worst[metric.key] = files.reduce((max, entry) => {
            const value = entry[metric.key];
            return !max || value > max.value ? Object.freeze({ file: entry.file, value }) : max;
        }, null);
    }
    return Object.freeze({ fileCount: files.length, files, worst: Object.freeze(worst), violations: evaluateComplexity(files, thresholds) });
}

function collectSourceFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) return collectSourceFiles(filePath);
        return entry.isFile() && entry.name.endsWith('.js') ? [filePath] : [];
    });
}

/** Audit every .js file under a source root and evaluate it against the thresholds. */
function auditSourceTree(rootDir, thresholds = DEFAULT_COMPLEXITY_THRESHOLDS) {
    const entries = collectSourceFiles(rootDir).map((filePath) => {
        const source = fs.readFileSync(filePath, 'utf8');
        return { file: path.relative(rootDir, filePath).split(path.sep).join('/'), ...measureSourceComplexity(source) };
    });
    return buildComplexityAudit(entries, thresholds);
}

function main() {
    const audit = auditSourceTree(path.resolve(__dirname, '..', 'src'));
    console.log(`HEADROOM complexity audit: ${audit.fileCount} files under src/`);
    for (const metric of METRICS) {
        const offender = audit.worst[metric.key];
        console.log(`  worst ${metric.key}: ${offender.value} (${offender.file}; limit ${DEFAULT_COMPLEXITY_THRESHOLDS[metric.limit]})`);
    }
    if (audit.violations.length > 0) {
        console.error(`HEADROOM complexity audit: ${audit.violations.length} violation(s). Simplify before extending:`);
        for (const violation of audit.violations) {
            console.error(`  ${violation.file}: ${violation.metric} ${violation.value} > ${violation.limit}`);
        }
        process.exit(1);
    }
    console.log('HEADROOM complexity audit: passed');
}

if (require.main === module) {
    main();
}

module.exports = { DEFAULT_COMPLEXITY_THRESHOLDS, METRICS, measureSourceComplexity, evaluateComplexity, buildComplexityAudit, auditSourceTree };
