import { describe, expect, it } from 'vitest';
import { SqliteConnection } from '../src/storage/SqliteConnection';
import { applyMigrations, SCHEMA_MIGRATIONS } from '../src/storage/migrations';
import { assertUpgradeCompatible, inspectUpgradeCompatibility } from '../src/storage/UpgradeCompatibility';

describe('Phase 070 — extension upgrade compatibility', () => {
    it('classifies fresh, current, and older schemas without mutating them', () => {
        const connection = new SqliteConnection();
        const database = connection.open(':memory:');
        expect(inspectUpgradeCompatibility(database)).toMatchObject({ status: 'INITIAL_INSTALL', safeToUpgrade: true });
        const previousVersion = SCHEMA_MIGRATIONS.at(-1).version - 1;
        applyMigrations(database, SCHEMA_MIGRATIONS.slice(0, -1));
        expect(inspectUpgradeCompatibility(database)).toMatchObject({ status: 'MIGRATION_REQUIRED', currentVersion: previousVersion,
            latestVersion: SCHEMA_MIGRATIONS.at(-1).version, safeToUpgrade: true, backupRecommended: true });
        expect(database.prepare('SELECT max(version) AS version FROM schema_migrations').get().version).toBe(previousVersion);
        applyMigrations(database);
        expect(assertUpgradeCompatible(database)).toMatchObject({ status: 'CURRENT', safeToUpgrade: true });
        connection.close();
    });

    it('blocks future or mismatched history with recovery guidance and no migration writes', () => {
        const connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        database.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)")
            .run(SCHEMA_MIGRATIONS.length + 1, 'future-schema');
        expect(inspectUpgradeCompatibility(database)).toMatchObject({ status: 'UNSUPPORTED_FUTURE_VERSION', safeToUpgrade: false,
            guidance: expect.stringMatching(/newer HEADROOM release/) });
        expect(() => assertUpgradeCompatible(database)).toThrow(/Do not downgrade/);
        expect(database.prepare('SELECT count(*) AS count FROM schema_migrations').get().count).toBe(SCHEMA_MIGRATIONS.length + 1);
        connection.close();
    });

    it('rejects malformed migration metadata before normal startup migrations run', () => {
        const connection = new SqliteConnection();
        const database = connection.open(':memory:');
        database.exec('CREATE TABLE schema_migrations (version INTEGER, name TEXT); INSERT INTO schema_migrations VALUES (2, \'unknown\')');
        expect(inspectUpgradeCompatibility(database)).toMatchObject({ status: 'INVALID_HISTORY', safeToUpgrade: false });
        expect(() => assertUpgradeCompatible(database)).toThrow(/Migration history/);
        connection.close();
    });
});
