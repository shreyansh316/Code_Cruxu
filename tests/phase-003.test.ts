/** Phase 003 — canonical SQLite relational schema tests. */
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { CORE_SCHEMA_SQL, initializeCoreSchema } from '../src/storage';

describe('Phase 003 — SQLite schema foundation', () => {
  let db: Database.Database | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  function openDatabase(): Database.Database {
    db = new Database(':memory:');
    return db;
  }

  it('creates the complete core entity schema in an in-memory database', () => {
    const database = openDatabase();
    initializeCoreSchema(database);

    const tables = database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    ).all().map(row => (row as { name: string }).name);

    expect(tables).toEqual([
      'agents', 'ai_usages', 'audit_logs', 'departments', 'director_questions',
      'events', 'memories', 'objectives', 'offices', 'organizations', 'projects',
      'task_dependencies', 'tasks',
    ]);
  });

  it('can be initialized repeatedly without dropping persisted rows', () => {
    const database = openDatabase();
    initializeCoreSchema(database);
    database.prepare('INSERT INTO organizations (id, name) VALUES (?, ?)').run('org-1', 'Test');

    expect(() => initializeCoreSchema(database)).not.toThrow();
    expect(database.prepare('SELECT name FROM organizations WHERE id = ?').get('org-1'))
      .toEqual({ name: 'Test' });
  });

  it('enforces required fields, unique task codes, and valid task states', () => {
    const database = openDatabase();
    initializeCoreSchema(database);

    expect(() => database.prepare('INSERT INTO tasks (id, task_code, title) VALUES (?, ?, ?)')
      .run('t1', 'WD-FE-1', 'First')).not.toThrow();
    expect(() => database.prepare('INSERT INTO tasks (id, task_code, title) VALUES (?, ?, ?)')
      .run('t2', 'WD-FE-1', 'Duplicate')).toThrow();
    expect(() => database.prepare('INSERT INTO tasks (id, task_code, title, status) VALUES (?, ?, ?, ?)')
      .run('t3', 'WD-FE-3', 'Invalid state', 'UNKNOWN')).toThrow();
    expect(() => database.prepare('INSERT INTO tasks (id, task_code) VALUES (?, ?)')
      .run('t4', 'WD-FE-4')).toThrow();
    expect(() => database.prepare(
      'INSERT INTO tasks (id, task_code, title, retry_count, max_retries) VALUES (?, ?, ?, ?, ?)',
    ).run('t5', 'WD-FE-5', 'Over retry limit', 3, 2)).toThrow();
  });

  it('enables foreign keys and enforces task dependency integrity', () => {
    const database = openDatabase();
    initializeCoreSchema(database);
    expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
    const insertTask = database.prepare('INSERT INTO tasks (id, task_code, title) VALUES (?, ?, ?)');
    insertTask.run('t1', 'WD-FE-1', 'First');
    insertTask.run('t2', 'WD-FE-2', 'Second');

    const insertDependency = database.prepare(
      'INSERT INTO task_dependencies (id, dependent_task_id, dependency_task_id) VALUES (?, ?, ?)',
    );
    expect(() => insertDependency.run('d1', 't2', 't1')).not.toThrow();
    expect(() => insertDependency.run('d2', 't2', 't1')).toThrow();
    expect(() => insertDependency.run('d3', 't1', 't1')).toThrow();
    expect(() => insertDependency.run('d4', 'missing', 't1')).toThrow();
  });

  it('checks hierarchy roles, memory scopes, and bounded numeric fields', () => {
    const database = openDatabase();
    initializeCoreSchema(database);

    expect(() => database.prepare('INSERT INTO agents (id, name, role) VALUES (?, ?, ?)')
      .run('a1', 'Worker', 'EMPLOYEE')).not.toThrow();
    expect(() => database.prepare('INSERT INTO agents (id, name, role) VALUES (?, ?, ?)')
      .run('a2', 'Unknown', 'INTERN')).toThrow();
    expect(() => database.prepare('INSERT INTO memories (id, scope, title, content, importance) VALUES (?, ?, ?, ?, ?)')
      .run('m1', 'KNOWLEDGE', 'Fact', 'Verified text', 3)).not.toThrow();
    expect(() => database.prepare('INSERT INTO memories (id, scope, title, content, importance) VALUES (?, ?, ?, ?, ?)')
      .run('m2', 'KNOWLEDGE', 'Fact', 'Bad importance', 4)).toThrow();
  });

  it('has indexes for common task, event, memory, and audit lookups', () => {
    const database = openDatabase();
    initializeCoreSchema(database);
    const indexes = database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'",
    ).all().map(row => (row as { name: string }).name);

    expect(indexes).toEqual(expect.arrayContaining([
      'idx_tasks_project_status', 'idx_events_processed_created',
      'idx_memories_scope_created', 'idx_audit_entity',
    ]));
  });
});
