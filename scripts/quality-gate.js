const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const mode = process.argv[2];
const sourceRoots = ['src', 'test', 'tests', 'scripts'];
const rootJavaScript = ['esbuild.js', 'vitest.config.js', 'vitest.benchmark.config.js'];

if (!['typecheck', 'lint'].includes(mode)) {
    console.error('Usage: node scripts/quality-gate.js <typecheck|lint>');
    process.exit(2);
}

function collectJavaScript(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) return collectJavaScript(filePath);
        return entry.isFile() && entry.name.endsWith('.js') ? [filePath] : [];
    });
}

const files = [
    ...sourceRoots.flatMap((directory) => collectJavaScript(path.join(root, directory))),
    ...rootJavaScript.map((file) => path.join(root, file)),
];
let failed = false;

for (const file of files) {
    const relativePath = path.relative(root, file);
    if (mode === 'typecheck') {
        // HEADROOM is JavaScript-only. Node's parser is the available static
        // language check and catches invalid syntax without introducing TS.
        const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
        if (result.status !== 0) {
            failed = true;
            process.stderr.write(`${relativePath}:\n${result.stderr || result.stdout}`);
        }
    } else {
        const contents = fs.readFileSync(file, 'utf8');
        const debuggerStatement = /(^|[;{}\s])debugger\s*;/m;
        if (debuggerStatement.test(contents)) {
            failed = true;
            console.error(`${relativePath}: remove debugger statement`);
        }
        const lines = contents.split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
            if (/\s+$/.test(lines[index])) {
                failed = true;
                console.error(`${relativePath}:${index + 1}: trailing whitespace`);
            }
            if (/^(<<<<<<<|=======|>>>>>>>)( |$)/.test(lines[index])) {
                failed = true;
                console.error(`${relativePath}:${index + 1}: unresolved merge conflict marker`);
            }
        }
    }
}

if (mode === 'typecheck') {
    for (const directory of ['src', 'tests']) {
        const forbidden = fs.readdirSync(path.join(root, directory), { recursive: true })
            .filter((entry) => /\.(?:ts|tsx)$/.test(entry));
        if (forbidden.length) {
            failed = true;
            for (const entry of forbidden) console.error(`${directory}/${entry}: TypeScript source is not allowed`);
        }
    }
}

if (failed) process.exit(1);
console.log(`HEADROOM ${mode}: passed (${files.length} JavaScript files)`);
