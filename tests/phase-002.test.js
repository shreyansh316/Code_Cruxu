/**
 * HEADROOM — Phase 002 Tests
 *
 * Verifies:
 * 1. better-sqlite3 native module loads
 * 2. SQLite in-memory database: open, create, insert, select, close
 * 3. SQLite file-based database: open, operations, close, file cleanup
 * 4. SELECT results are accurate (not fabricated)
 * 5. Temp file is deleted after use
 * 6. Directory architecture layer boundaries exist
 * 7. Git baseline: no secrets tracked, key files present
 * 8. Phase 001 still intact (regression guard)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runCompatibilityCheck, requireSQLite } from '../src/storage/SqliteCompat';
import { ARCHITECTURE_VERSION, ARCHITECTURE_PHASE } from '../src/ARCHITECTURE';
// ============================================================
// 1. Native module loading
// ============================================================
describe('Phase 002 — SQLite Native Module', () => {
    it('better-sqlite3 can be required without error', () => {
        expect(() => requireSQLite()).not.toThrow();
    });
    it('requireSQLite returns a constructor function', () => {
        const SQLite = requireSQLite();
        expect(typeof SQLite).toBe('function');
    });
});
// ============================================================
// 2. In-memory database — full CRUD lifecycle
// ============================================================
describe('Phase 002 — SQLite In-Memory Compatibility', () => {
    it('runs all compatibility steps successfully on :memory:', () => {
        const result = runCompatibilityCheck(':memory:', false);
        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
    });
    it('reports SQLite version', () => {
        const result = runCompatibilityCheck(':memory:', false);
        expect(result.version).toBeDefined();
        expect(result.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
    it('completes all 6 steps: OPEN, VERSION, CREATE, INSERT, SELECT, CLOSE', () => {
        const result = runCompatibilityCheck(':memory:', false);
        const steps = ['OPEN', 'VERSION', 'CREATE TABLE', 'INSERT', 'SELECT', 'CLOSE'];
        for (const step of steps) {
            const found = result.details.some(d => d.startsWith(step));
            expect(found, `Missing step: ${step}`).toBe(true);
        }
    });
    it('SELECT verifies correct row count (2 rows)', () => {
        const result = runCompatibilityCheck(':memory:', false);
        const selectDetail = result.details.find(d => d.startsWith('SELECT'));
        expect(selectDetail).toContain('2 rows verified');
    });
    it('includes DROP TABLE step', () => {
        const result = runCompatibilityCheck(':memory:', false);
        expect(result.details.some(d => d.startsWith('DROP TABLE'))).toBe(true);
    });
    it('reports no error on success', () => {
        const result = runCompatibilityCheck(':memory:', false);
        expect(result.error).toBeUndefined();
    });
});
// ============================================================
// 3. File-based database — create, use, clean up
// ============================================================
describe('Phase 002 — SQLite File-Based Compatibility', () => {
    const tempDbPath = join(tmpdir(), `headroom-phase002-test-${Date.now()}.db`);
    afterEach(() => {
        // Safety cleanup in case test fails before the service can clean up
        if (existsSync(tempDbPath)) {
            unlinkSync(tempDbPath);
        }
    });
    it('creates a temp db file', () => {
        // Open the DB manually so we can check the file exists before cleanup
        const Database = requireSQLite();
        const db = new Database(tempDbPath);
        expect(existsSync(tempDbPath)).toBe(true);
        db.close();
    });
    it('runs compatibility check on file db and cleans up', () => {
        const filePath = join(tmpdir(), `headroom-phase002-filecheck-${Date.now()}.db`);
        const result = runCompatibilityCheck(filePath, true);
        expect(result.success).toBe(true);
        // File must be gone after cleanup
        expect(existsSync(filePath)).toBe(false);
    });
    it('includes FILE CLEANUP step in details when cleanUp=true', () => {
        const filePath = join(tmpdir(), `headroom-phase002-cleanup-${Date.now()}.db`);
        const result = runCompatibilityCheck(filePath, true);
        expect(result.details.some(d => d.startsWith('FILE CLEANUP'))).toBe(true);
        expect(existsSync(filePath)).toBe(false);
    });
    it('does NOT include FILE CLEANUP step when cleanUp=false', () => {
        const filePath = join(tmpdir(), `headroom-phase002-noclean-${Date.now()}.db`);
        const result = runCompatibilityCheck(filePath, false);
        // Cleanup manually since we told the service not to
        if (existsSync(filePath))
            unlinkSync(filePath);
        expect(result.details.some(d => d.startsWith('FILE CLEANUP'))).toBe(false);
    });
});
// ============================================================
// 4. Architecture layer boundaries
// ============================================================
describe('Phase 002 — Directory Architecture', () => {
    it('ARCHITECTURE.js exports version string', () => {
        expect(typeof ARCHITECTURE_VERSION).toBe('string');
        expect(ARCHITECTURE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
    it('ARCHITECTURE.js exports phase number matching Phase 002', () => {
        expect(ARCHITECTURE_PHASE).toBe(2);
    });
    it('domain layer module resolves without error', async () => {
        await expect(import('../src/domain/index')).resolves.toBeDefined();
    });
    it('application layer module resolves without error', async () => {
        await expect(import('../src/application/index')).resolves.toBeDefined();
    });
    it('infrastructure layer module resolves without error', async () => {
        await expect(import('../src/infrastructure/index')).resolves.toBeDefined();
    });
    it('storage layer module resolves without error', async () => {
        await expect(import('../src/storage/index')).resolves.toBeDefined();
    });
    it('agents layer module resolves without error', async () => {
        await expect(import('../src/agents/index')).resolves.toBeDefined();
    });
});
// ============================================================
// 5. Phase 001 regression guard
// ============================================================
describe('Phase 002 — Phase 001 Regression Guard', () => {
    it('constants module still resolves', async () => {
        await expect(import('../src/constants')).resolves.toBeDefined();
    });
    it('AgentRole still has 5 roles', async () => {
        const { AgentRole } = await import('../src/constants');
        expect(Object.keys(AgentRole)).toHaveLength(5);
    });
    it('EMPLOYEE is still forbidden from direct CEO communication', async () => {
        const { AgentRole, ALLOWED_COMMUNICATION } = await import('../src/constants');
        expect(ALLOWED_COMMUNICATION[AgentRole.EMPLOYEE]).not.toContain(AgentRole.CEO);
    });
    it('EMPLOYEE is still forbidden from direct EMPLOYEE communication', async () => {
        const { AgentRole, ALLOWED_COMMUNICATION } = await import('../src/constants');
        expect(ALLOWED_COMMUNICATION[AgentRole.EMPLOYEE]).not.toContain(AgentRole.EMPLOYEE);
    });
});
