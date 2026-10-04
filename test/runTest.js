const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const {
    downloadAndUnzipVSCode,
    resolveCliPathFromVSCodeExecutablePath,
    runTests,
} = require('@vscode/test-electron');

async function main() {
    const root = path.resolve(__dirname, '..');
    const packageOnly = process.argv.includes('--package');
    const testVsix = packageOnly || process.argv.includes('--vsix');
    const extensionManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const vsceTarget = `${process.platform}-${process.arch}`;
    const version = '1.101.0';
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headroom-vscode-'));
    const extensionPath = path.join(temporaryDirectory, 'extension');
    const nativeAddon = path.join(root, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
    // Keep the backup outside the temp tree used by VS Code/Electron so an
    // interrupted native rebuild cannot remove the only working Node addon.
    const nativeAddonBackupDirectory = path.join(root, '.test-cache');
    fs.mkdirSync(nativeAddonBackupDirectory, { recursive: true });
    const nativeAddonBackup = path.join(nativeAddonBackupDirectory, `better-sqlite3-${process.pid}.node`);
    let extensionLinked = false;
    let nativeAddonBackedUp = false;
    let packagePath;
    try {
        const vscodeExecutablePath = await downloadAndUnzipVSCode({ version });
        const appRoot = findVSCodeAppRoot(vscodeExecutablePath);
        if (!appRoot) {
            throw new Error(`Could not locate VS Code ${version} runtime metadata.`);
        }
        const appPackage = JSON.parse(fs.readFileSync(
            path.join(appRoot, 'package.json'), 'utf8',
        ));
        const electronVersion = appPackage.devDependencies?.electron;
        if (!electronVersion) {
            throw new Error(`VS Code ${version} does not declare its bundled Electron version.`);
        }
        fs.copyFileSync(nativeAddon, nativeAddonBackup);
        nativeAddonBackedUp = true;
        // Electron rebuild derives its cache directory from the current user's
        // profile. Import it only after the caller has had a chance to provide
        // a workspace-local USERPROFILE in restricted environments.
        const { rebuild } = require('@electron/rebuild');
        await rebuild({
            buildPath: root,
            electronVersion,
            arch: process.arch,
            force: true,
            onlyModules: ['better-sqlite3'],
        });
        let extensionDevelopmentPath = extensionPath;
        let extensionTestsPath = path.join(extensionPath, 'test', 'suite');
        if (testVsix) {
            packagePath = packageOnly
                ? path.join(root, `${extensionManifest.name}-${extensionManifest.version}-${vsceTarget}.vsix`)
                : path.join(nativeAddonBackupDirectory, `headroom-${process.pid}.vsix`);
            await require('@vscode/vsce').createVSIX({ cwd: root, packagePath, target: vsceTarget });
            const files = listVSIXFiles(packagePath);
            const required = [
                'extension/package.json', 'extension/package.nls.json', 'extension/out/extension.js',
                'extension/media/headroom-icon.svg', 'extension/changelog.md',
                'extension/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
            ];
            for (const file of required) {
                if (!files.includes(file)) throw new Error(`VSIX is missing required runtime file: ${file}`);
            }
            const forbidden = files.find((file) => /(^|\/)(\.env[^/]*|src|tests|benchmarks|coverage|\.test-cache)(\/|$)/i.test(file)
                || /(^|\/)(vitest|@vitest|@vscode\/test-electron)(\/|$)/i.test(file));
            if (forbidden) throw new Error(`VSIX contains excluded development or environment data: ${forbidden}`);
            const vsixManifest = readVSIXFile(packagePath, 'extension.vsixmanifest');
            if (!vsixManifest.includes(`TargetPlatform="${vsceTarget}"`)) {
                throw new Error(`VSIX target does not match the native package target ${vsceTarget}.`);
            }

            if (packageOnly) {
                console.log(`Verified installable VSIX: ${packagePath}`);
                return;
            } else {
                const installData = path.join(temporaryDirectory, 'install-data');
                const installedExtensions = path.join(temporaryDirectory, 'installed-extensions');
                const vscodeCli = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath);
                if (!fs.existsSync(vscodeCli)) throw new Error('VS Code CLI is missing from the test runtime.');
                const installArgs = [
                    `--user-data-dir=${installData}`, `--extensions-dir=${installedExtensions}`,
                    '--install-extension', packagePath, '--force',
                ];
                runVscodeCli(vscodeCli, installArgs, { timeout: 120_000, stdio: 'inherit' });
                const installed = runVscodeCli(vscodeCli, [
                    `--user-data-dir=${installData}`, `--extensions-dir=${installedExtensions}`, '--list-extensions', '--show-versions',
                ], { encoding: 'utf8', timeout: 30_000 });
                const expectedExtension = `${extensionManifest.publisher}.${extensionManifest.name}@${extensionManifest.version}`.toLowerCase();
                if (!installed.toLowerCase().split(/\r?\n/).some((line) => line.trim() === expectedExtension)) {
                    throw new Error('VSIX installation did not appear in the isolated VS Code extensions list.');
                }

                fs.mkdirSync(extensionPath, { recursive: true });
                extractVSIX(packagePath, extensionPath);
                extensionDevelopmentPath = path.join(extensionPath, 'extension');
                const packagedTestSuite = path.join(extensionDevelopmentPath, 'test', 'suite');
                fs.mkdirSync(path.dirname(packagedTestSuite), { recursive: true });
                fs.cpSync(path.join(root, 'test', 'suite'), packagedTestSuite, { recursive: true });
                extensionTestsPath = packagedTestSuite;
            }
        } else {
            fs.symlinkSync(root, extensionPath, process.platform === 'win32' ? 'junction' : 'dir');
            extensionLinked = true;
        }
        const exitCode = await runTests({
            version,
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                `--user-data-dir=${path.join(temporaryDirectory, 'user-data')}`,
                `--extensions-dir=${path.join(temporaryDirectory, 'extensions')}`,
                '--disable-gpu',
                '--disable-updates',
                '--skip-welcome',
            ],
        });
        if (exitCode !== 0) {
            process.exitCode = exitCode || 1;
        }
    }
    finally {
        if (nativeAddonBackedUp && fs.existsSync(nativeAddonBackup)) {
            fs.mkdirSync(path.dirname(nativeAddon), { recursive: true });
            fs.copyFileSync(nativeAddonBackup, nativeAddon);
        }
        else if (nativeAddonBackedUp) {
            console.error('The saved better-sqlite3 addon backup is missing; the Node addon could not be restored.');
            process.exitCode = 1;
        }
        if (fs.existsSync(nativeAddonBackup)) fs.rmSync(nativeAddonBackup, { force: true });
        if (!packageOnly && packagePath && fs.existsSync(packagePath)) fs.rmSync(packagePath, { force: true });
        if (extensionLinked) {
            fs.unlinkSync(extensionPath);
        }
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
}

function runVscodeCli(cliPath, args, options) {
    if (process.platform === 'win32') {
        const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
        const command = `& ${quote(cliPath)} ${args.map(quote).join(' ')}`;
        return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
            ...options,
            windowsHide: true,
        });
    }
    return execFileSync(cliPath, args, {
        ...options,
    });
}

function findVSCodeAppRoot(vscodeExecutablePath) {
    let directory = path.dirname(vscodeExecutablePath);
    for (let depth = 0; depth < 6; depth += 1) {
        for (const resourcesDirectory of ['resources', 'Resources']) {
            const candidate = path.join(directory, resourcesDirectory, 'app');
            if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
        }
        const parent = path.dirname(directory);
        if (parent === directory) break;
        directory = parent;
    }
    return undefined;
}

function listVSIXFiles(packagePath) {
    const args = process.platform === 'win32' ? ['-tf', packagePath] : ['-Z1', packagePath];
    const command = process.platform === 'win32' ? 'tar' : 'unzip';
    return execFileSync(command, args, { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
}

function readVSIXFile(packagePath, filePath) {
    const args = process.platform === 'win32'
        ? ['-xOf', packagePath, filePath]
        : ['-p', packagePath, filePath];
    const command = process.platform === 'win32' ? 'tar' : 'unzip';
    return execFileSync(command, args, { encoding: 'utf8' });
}

function extractVSIX(packagePath, destination) {
    const args = process.platform === 'win32'
        ? ['-xf', packagePath, '-C', destination]
        : ['-q', packagePath, '-d', destination];
    const command = process.platform === 'win32' ? 'tar' : 'unzip';
    execFileSync(command, args, { stdio: 'inherit' });
}

main().catch((error) => {
    console.error('VS Code Extension Host test failed:', error);
    process.exitCode = 1;
});
