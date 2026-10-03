import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { SqliteConnection, applyMigrations, assertUpgradeCompatible,
    inspectUpgradeCompatibility, SCHEMA_MIGRATIONS } from '../src/storage';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const policy = readFileSync(new URL('../RELEASE_POLICY.md', import.meta.url), 'utf8');

describe('Phase 087 — release and compatibility policy', () => {
    it('keeps the extension SemVer, tested engine floor, and release artifact allowlist aligned', () => {
        expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(manifest.engines).toEqual({ vscode: '^1.101.0', node: '>=20.0.0' });
        expect(policy).toContain(`current schema is version ${SCHEMA_MIGRATIONS.at(-1).version}`);
        expect(policy).toContain('VS Code `1.101.0`');
        expect(manifest.files).toContain('CHANGELOG.md');
        expect(manifest.files).toContain('node_modules/better-sqlite3/build/Release/better_sqlite3.node');
        expect(manifest.files).not.toContain('.env');
    });

    it('keeps migration identities immutable, contiguous, and independent of extension version', () => {
        expect(SCHEMA_MIGRATIONS.map(({ version }) => version))
            .toEqual(Array.from({ length: SCHEMA_MIGRATIONS.length }, (_, index) => index + 1));
        expect(new Set(SCHEMA_MIGRATIONS.map(({ name }) => name)).size).toBe(SCHEMA_MIGRATIONS.length);
        expect(manifest.version).not.toBe(String(SCHEMA_MIGRATIONS.at(-1).version));
    });

    it('permits forward-only migration and blocks a future schema without altering its ledger', () => {
        const connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database, SCHEMA_MIGRATIONS.slice(0, -1));
        expect(inspectUpgradeCompatibility(database)).toMatchObject({ status: 'MIGRATION_REQUIRED', safeToUpgrade: true });
        applyMigrations(database);
        expect(assertUpgradeCompatible(database)).toMatchObject({ status: 'CURRENT', safeToUpgrade: true });
        database.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
            .run(SCHEMA_MIGRATIONS.length + 1, 'future-schema');
        expect(inspectUpgradeCompatibility(database)).toMatchObject({ status: 'UNSUPPORTED_FUTURE_VERSION', safeToUpgrade: false });
        expect(() => assertUpgradeCompatible(database)).toThrow(/Do not downgrade/);
        expect(database.prepare('SELECT count(*) AS count FROM schema_migrations').get().count)
            .toBe(SCHEMA_MIGRATIONS.length + 1);
        connection.close();
    });
});
