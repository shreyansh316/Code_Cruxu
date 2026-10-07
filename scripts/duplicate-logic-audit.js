/** Phase 458 — deterministic duplicate-logic detection for Advanced-level simplicity control.
 *
 * Slides a 10-normalized-statement window over every src/ file and flags windows
 * whose normalized signature appears in more than one file: cross-file copy-paste
 * is the duplication that actually drifts. Normalization strips comments and
 * blanks, masks string literals, and folds numbers so trivial edits do not hide
 * duplication. The gate fails when a duplicate signature is not recorded in the
 * baseline (scripts/duplicate-logic-baseline.json); burn-down happens in later
 * phases with per-case verification. Development-time gate, not extension runtime. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(ROOT, 'src');
const BASELINE_PATH = path.join(__dirname, 'duplicate-logic-baseline.json');
const WINDOW_SIZE = 10;
const MAX_STRING_PLACEHOLDER = "'S'";
/** A window counts as logic (not parallel data shapes) only if it carries at least
 * one control-flow or function token — duplicated object literals with different
 * values are legitimate parallel data, not drifted logic. */
const LOGIC_TOKEN = /\b(if|for|while|switch|catch|return|function)\b|=>/;

/** Normalize one source line to its comparison form, or null when it carries no logic. */
function normalizeLine(line) {
    let text = line.trim();
    if (!text || text.startsWith('//') || text.startsWith('*') || text.startsWith('/*')) return null;
    text = text.replace(/\/\/.*$/, '');
    text = text.replace(/'(?:[^'\\]|\\.)*'/g, MAX_STRING_PLACEHOLDER);
    text = text.replace(/"(?:[^"\\]|\\.)*"/g, MAX_STRING_PLACEHOLDER);
    text = text.replace(/`(?:[^`\\]|\\.)*`/g, MAX_STRING_PLACEHOLDER);
    text = text.replace(/\b\d+\b/g, 'N');
    text = text.replace(/\s+/g, ' ').trim();
    return text;
}

/** Hash one window of normalized statements. */
function windowSignature(statements) {
    return crypto.createHash('sha1').update(statements.join('\n')).digest('hex').slice(0, 12);
}

/** Build all window signatures for one file: [{ signature, file, line }]. */
function buildFileWindows(file, sourceText) {
    const rawLines = sourceText.replace(/\r\n/g, '\n').split('\n');
    const statements = [];
    rawLines.forEach((line, index) => {
        const normalized = normalizeLine(line);
        if (normalized !== null) statements.push({ text: normalized, line: index + 1 });
    });
    const windows = [];
    for (let index = 0; index + WINDOW_SIZE <= statements.length; index += 1) {
        const slice = statements.slice(index, index + WINDOW_SIZE);
        if (!slice.some((statement) => LOGIC_TOKEN.test(statement.text))) continue;
        windows.push({ signature: windowSignature(slice.map((statement) => statement.text)),
            file, line: slice[0].line });
    }
    return windows;
}

function collectSourceFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) return collectSourceFiles(filePath);
        return entry.isFile() && entry.name.endsWith('.js') ? [filePath] : [];
    });
}

/** Group windows by signature across the whole source tree; returns the duplicate
 * groups sorted by signature: [{ signature, occurrences: [{ file, line }] }]. */
function findDuplicateGroups(corpus) {
    const bySignature = new Map();
    for (const [file, sourceText] of Object.entries(corpus)) {
        for (const window of buildFileWindows(file, sourceText)) {
            const group = bySignature.get(window.signature) || [];
            group.push({ file: window.file, line: window.line });
            bySignature.set(window.signature, group);
        }
    }
    const groups = [];
    for (const [signature, occurrences] of bySignature) {
        const files = new Set(occurrences.map((occurrence) => occurrence.file));
        if (files.size > 1) {
            groups.push({ signature, occurrences: occurrences.slice().sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line)) });
        }
    }
    groups.sort((a, b) => (a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0));
    return groups;
}

/** Build the corpus of src/ files: { 'relative/path.js': text }. */
function buildCorpus() {
    const corpus = {};
    for (const filePath of collectSourceFiles(SOURCE_ROOT)) {
        corpus[path.relative(SOURCE_ROOT, filePath).split(path.sep).join('/')] = fs.readFileSync(filePath, 'utf8');
    }
    return corpus;
}

function loadBaseline() {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

/** Duplicate groups not recorded in the baseline are gate violations. */
function evaluateAgainstBaseline(groups, baselineGroups) {
    const known = new Set(baselineGroups.map((group) => group.signature));
    return groups.filter((group) => !known.has(group.signature));
}

function main() {
    const groups = findDuplicateGroups(buildCorpus());
    const baseline = loadBaseline();
    const newGroups = evaluateAgainstBaseline(groups, baseline.groups);
    console.log(`HEADROOM duplicate-logic audit: ${groups.length} duplicate group(s) across src/, ${baseline.groups.length} recorded in baseline`);
    if (newGroups.length > 0) {
        console.error(`HEADROOM duplicate-logic audit: ${newGroups.length} NEW duplicated window(s). Extract shared logic or update the baseline deliberately:`);
        for (const group of newGroups) {
            console.error(`  ${group.signature}:`);
            for (const occurrence of group.occurrences) console.error(`    ${occurrence.file}:${occurrence.line}`);
        }
        process.exit(1);
    }
    console.log('HEADROOM duplicate-logic audit: no new duplicate groups');
}

if (require.main === module) {
    main();
}

module.exports = { normalizeLine, windowSignature, buildFileWindows, findDuplicateGroups, buildCorpus, loadBaseline, evaluateAgainstBaseline };
