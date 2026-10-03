const path = require('path');
const fs = require('fs');
const os = require('os');
const { downloadAndUnzipVSCode, runTests } = require('@vscode/test-electron');

async function main() {
    const root = path.resolve(__dirname, '..');
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
    try {
        const cachedExecutable = path.join(root, '.vscode-test', `vscode-win32-${process.arch}-archive-${version}`, 'Code.exe');
        const vscodeExecutablePath = fs.existsSync(cachedExecutable)
            ? cachedExecutable
            : await downloadAndUnzipVSCode({ version });
        const installPath = path.dirname(vscodeExecutablePath);
        const appRoot = [installPath, ...fs.readdirSync(installPath, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => path.join(installPath, entry.name))]
            .find((candidate) => fs.existsSync(path.join(candidate, 'resources', 'app', 'package.json')));
        if (!appRoot) {
            throw new Error(`Could not locate VS Code ${version} runtime metadata.`);
        }
        const appPackage = JSON.parse(fs.readFileSync(
            path.join(appRoot, 'resources', 'app', 'package.json'), 'utf8',
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
        fs.symlinkSync(root, extensionPath, 'junction');
        extensionLinked = true;
        const exitCode = await runTests({
            version,
            vscodeExecutablePath,
            extensionDevelopmentPath: extensionPath,
            extensionTestsPath: path.join(extensionPath, 'test', 'suite'),
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
        if (extensionLinked) {
            fs.unlinkSync(extensionPath);
        }
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error('VS Code Extension Host test failed:', error);
    process.exitCode = 1;
});
