import type Database from 'better-sqlite3';
import type { EntityId } from '../../shared/identifiers';
import type { TimestampedRecord } from './types';

type SqliteParameter = string | number | bigint | Buffer | Uint8Array | null;
type ColumnMap = Readonly<Record<string, string>>;

/** Common, parameterized CRUD mechanics for repositories with timestamp columns. */
export abstract class BaseSqliteRepository<
  RecordType extends TimestampedRecord,
  CreateType extends { readonly id: EntityId },
  ChangeType extends object,
> {
  protected constructor(
    protected readonly database: Database.Database,
    private readonly table: string,
    private readonly selectedColumns: ColumnMap,
    private readonly writableColumns: ColumnMap,
  ) {}

  protected insert(value: CreateType): RecordType {
    const input = value as Record<string, unknown>;
    const fields = Object.entries(this.writableColumns)
      .filter(([property]) => input[property] !== undefined);
    const columns = fields.map(([, column]) => column);
    const placeholders = fields.map(() => '?');
    const parameters = fields.map(([property]) => input[property] as SqliteParameter);

    this.database.prepare(
      `INSERT INTO ${this.table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
    ).run(...parameters);

    const created = this.getById(value.id);
    if (!created) throw new Error(`Inserted ${this.table} record could not be read back.`);
    return created;
  }

  getById(id: EntityId): RecordType | undefined {
    return this.database.prepare(
      `SELECT ${this.selectList()} FROM ${this.table} WHERE id = ?`,
    ).get(id) as RecordType | undefined;
  }

  protected query(
    whereClause = '',
    parameters: readonly SqliteParameter[] = [],
    orderBy = 'id',
  ): RecordType[] {
    const where = whereClause ? ` WHERE ${whereClause}` : '';
    return this.database.prepare(
      `SELECT ${this.selectList()} FROM ${this.table}${where} ORDER BY ${orderBy}`,
    ).all(...parameters) as RecordType[];
  }

  protected updateById(id: EntityId, changes: ChangeType): RecordType | undefined {
    const input = changes as Record<string, unknown>;
    const fields = Object.entries(this.writableColumns)
      .filter(([property]) => property !== 'id' && input[property] !== undefined);
    const current = this.getById(id);
    if (!current || fields.length === 0) return current;

    const assignments = fields.map(([, column]) => `${column} = ?`);
    assignments.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    const parameters = fields.map(([property]) => input[property] as SqliteParameter);
    parameters.push(id);
    this.database.prepare(
      `UPDATE ${this.table} SET ${assignments.join(', ')} WHERE id = ?`,
    ).run(...parameters);
    return this.getById(id);
  }

  deleteById(id: EntityId): boolean {
    return this.database.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id).changes > 0;
  }

  private selectList(): string {
    return Object.entries(this.selectedColumns)
      .map(([property, column]) => `${column} AS "${property}"`)
      .join(', ');
  }
}
