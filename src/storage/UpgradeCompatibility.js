import { SCHEMA_MIGRATIONS } from './migrations';

/** Inspect a database version before startup migrations; this function never changes the database. */
export function inspectUpgradeCompatibility(database, migrations = SCHEMA_MIGRATIONS) {
    if (!database || typeof database.prepare !== 'function') throw new TypeError('Upgrade inspection requires a SQLite database.');
    const latestVersion = migrations.at(-1)?.version ?? 0;
    try {
        const hasLedger = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
        if (!hasLedger) return Object.freeze({ status: 'INITIAL_INSTALL', currentVersion: 0, latestVersion,
            safeToUpgrade: true, backupRecommended: false, guidance: 'A fresh database will be initialized.' });
        const records = database.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();
        let invalidIndex = -1;
        for (let index = 0; index < Math.min(records.length, migrations.length); index += 1) {
            if (records[index].version !== index + 1 || records[index].name !== migrations[index].name) {
                invalidIndex = index;
                break;
            }
        }
        const currentVersion = records.at(-1)?.version ?? 0;
        if (invalidIndex !== -1) return Object.freeze({ status: 'INVALID_HISTORY', currentVersion, latestVersion,
            safeToUpgrade: false, backupRecommended: true,
            guidance: 'Migration history does not match this release. Preserve the database file and restore a verified backup or use the release that created it.' });
        if (currentVersion > latestVersion) return Object.freeze({ status: 'UNSUPPORTED_FUTURE_VERSION', currentVersion, latestVersion,
            safeToUpgrade: false, backupRecommended: true,
            guidance: 'This database was created by a newer HEADROOM release. Do not downgrade or edit its schema; open it with that release or restore a verified backup.' });
        return Object.freeze({ status: currentVersion === latestVersion ? 'CURRENT' : 'MIGRATION_REQUIRED',
            currentVersion, latestVersion, safeToUpgrade: true, backupRecommended: currentVersion > 0,
            guidance: currentVersion === latestVersion ? 'The database matches this release.'
                : 'A transactional migration is required. Keep a verified backup before upgrading.' });
    } catch {
        return Object.freeze({ status: 'INSPECTION_FAILED', currentVersion: null, latestVersion,
            safeToUpgrade: false, backupRecommended: true,
            guidance: 'The database version could not be read. Preserve the database file and restore only from a verified backup.' });
    }
}

export function assertUpgradeCompatible(database, migrations = SCHEMA_MIGRATIONS) {
    const report = inspectUpgradeCompatibility(database, migrations);
    if (!report.safeToUpgrade) {
        const error = new Error(`HEADROOM database upgrade blocked (${report.status}). ${report.guidance}`);
        error.code = 'database-upgrade-unsupported';
        error.report = report;
        throw error;
    }
    return report;
}
