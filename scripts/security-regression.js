const { existsSync } = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

/** Return the complete, ordered security regression fixture list or fail closed. */
function resolveSecurityRegressionFiles(testDirectory = path.resolve('tests')) {
    const phases = [91, ...Array.from({ length: 50 }, (_, index) => index + 276)];
    const files = phases.map((phase) => path.resolve(testDirectory, `phase-${String(phase).padStart(3, '0')}.test.js`));
    const missing = files.filter((file) => !existsSync(file));
    if (missing.length > 0) {
        throw new Error(`Security regression suite is incomplete; missing phase tests: ${missing.map((file) => file.split(/[\\/]/).at(-1)).join(', ')}`);
    }
    return files;
}

exports.resolveSecurityRegressionFiles = resolveSecurityRegressionFiles;

function runSecurityRegressionSuite() {
    const repositoryRoot = path.resolve(__dirname, '..');
    const testFiles = resolveSecurityRegressionFiles(path.resolve(repositoryRoot, 'tests'));
    const vitestCli = path.resolve(repositoryRoot, 'node_modules/vitest/vitest.mjs');
    if (!existsSync(vitestCli)) throw new Error('Vitest is not installed; run npm ci before the security regression suite.');
    const result = spawnSync(process.execPath, [vitestCli, 'run', ...testFiles,
        '--pool=forks', '--maxWorkers=1', '--minWorkers=1'], { cwd: repositoryRoot, stdio: 'inherit', shell: false });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
}

if (require.main === module) {
    try { runSecurityRegressionSuite(); }
    catch (error) {
        console.error(`[HEADROOM] ${error instanceof Error ? error.message : 'Security regression suite failed.'}`);
        process.exitCode = 1;
    }
}
