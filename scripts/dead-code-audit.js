/** Phase 452 — deterministic dead-export detection for Advanced-level complexity control.
 *
 * An export is DEAD when no file in the repository (src, test, tests, scripts, root
 * configs) references its name outside its own defining module, ignoring pure
 * re-export lines. Barrels are treated as defining modules too, so a symbol that
 * only survives via `export { X } from './y'` chains is still reported.
 *
 * The gate fails when the audit finds dead exports that are not recorded in the
 * baseline (scripts/dead-code-baseline.json). Burn-down of recorded findings
 * happens in later phases with per-item verification; growth is blocked now.
 * This is a development-time gate, not extension runtime.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOTS = ['src', 'test', 'tests', 'scripts'];
const ROOT_FILES = ['esbuild.js', 'vitest.config.js', 'vitest.benchmark.config.js'];
const BASELINE_PATH = path.join(__dirname, 'dead-code-baseline.json');

const EXPORT_PATTERNS = [
    /export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)/g,
    /export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g,
    /export\s+class\s+([A-Za-z0-9_$]+)/g,
];
const REEXPORT_LINE = /export\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?/g;
const STAR_REEXPORT_LINE = /export\s*\*\s*from\s*['"][^'"]+['"];?/g;

function toPosix(p) {
    return p.split(path.sep).join('/');
}

function collectJavaScript(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) return collectJavaScript(filePath);
        return entry.isFile() && entry.name.endsWith('.js') ? [filePath] : [];
    });
}

/** Build the file corpus: { 'relative/path.js': fileText }. */
function buildCorpus() {
    const corpus = {};
    for (const root of SOURCE_ROOTS) {
        for (const filePath of collectJavaScript(path.join(ROOT, root))) {
            corpus[toPosix(path.relative(ROOT, filePath))] = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
        }
    }
    for (const name of ROOT_FILES) {
        const filePath = path.join(ROOT, name);
        if (fs.existsSync(filePath)) corpus[name] = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
    }
    return corpus;
}

/** Extract the names a module exports locally (not via `from` re-exports). */
function extractExportedNames(sourceText) {
    const names = new Set();
    for (const pattern of EXPORT_PATTERNS) {
        for (const match of sourceText.matchAll(pattern)) {
            if (match[1] && match[1] !== 'default') names.add(match[1]);
        }
    }
    for (const match of sourceText.matchAll(/export\s*\{([^}]*)\}\s*;/g)) {
        for (const part of match[1].split(',')) {
            const exported = part.trim().split(/\s+as\s+/).pop().trim();
            if (exported && exported !== 'default') names.add(exported);
        }
    }
    return [...names];
}

function wordRegExp(name) {
    return new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`);
}

/** Count references to `name` in files other than `definingModule`, ignoring re-export lines. */
function hasExternalReference(name, definingModule, corpus) {
    const pattern = wordRegExp(name);
    for (const [module, text] of Object.entries(corpus)) {
        if (module === definingModule) continue;
        const body = text.replace(REEXPORT_LINE, ' ').replace(STAR_REEXPORT_LINE, ' ');
        if (pattern.test(body)) return true;
    }
    return false;
}

/** Find dead exports across the corpus: [{ module, name }], deterministically sorted.
 * src/extension.js is excluded: VS Code's host invokes activate/deactivate dynamically,
 * so its exports are contracts with the editor, not candidates for static dead-code flags. */
function findDeadExports(corpus = buildCorpus()) {
    const findings = [];
    for (const [module, text] of Object.entries(corpus)) {
        if (!module.startsWith('src/') || module === 'src/extension.js') continue;
        for (const name of extractExportedNames(text)) {
            if (!hasExternalReference(name, module, corpus)) findings.push({ module, name });
        }
    }
    findings.sort((a, b) => (a.module < b.module ? -1 : a.module > b.module ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return findings;
}

/** Load the recorded baseline: { baseline: [{ module, name }...] }. */
function loadBaseline() {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

/** Compare findings with the baseline: new findings are gate violations. */
function evaluateAgainstBaseline(findings, baselineEntries) {
    const baselineKeys = new Set(baselineEntries.map((entry) => `${entry.module}::${entry.name}`));
    return findings.filter((finding) => !baselineKeys.has(`${finding.module}::${finding.name}`));
}

function main() {
    const findings = findDeadExports();
    const baseline = loadBaseline();
    const newFindings = evaluateAgainstBaseline(findings, baseline.deadExports);
    console.log(`HEADROOM dead-code audit: ${findings.length} dead-export finding(s), ${baseline.deadExports.length} recorded in baseline`);
    if (newFindings.length > 0) {
        console.error(`HEADROOM dead-code audit: ${newFindings.length} NEW dead export(s). Remove them or extend the baseline deliberately:`);
        for (const finding of newFindings) console.error(`  ${finding.module} :: ${finding.name}`);
        process.exit(1);
    }
    console.log('HEADROOM dead-code audit: no new dead exports');
}

if (require.main === module) {
    main();
}

module.exports = { buildCorpus, extractExportedNames, hasExternalReference, findDeadExports, loadBaseline, evaluateAgainstBaseline };
