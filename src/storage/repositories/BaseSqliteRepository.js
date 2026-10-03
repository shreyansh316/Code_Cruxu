/** Common, parameterized CRUD mechanics for repositories with timestamp columns. */
export class BaseSqliteRepository {
    database;
    table;
    selectedColumns;
    writableColumns;
    constructor(database, table, selectedColumns, writableColumns) {
        this.database = database;
        this.table = table;
        this.selectedColumns = selectedColumns;
        this.writableColumns = writableColumns;
    }
    insert(value) {
        const input = { ...value, id: assertEntityId(value.id) };
        const fields = Object.entries(this.writableColumns)
            .filter(([property]) => input[property] !== undefined);
        const columns = fields.map(([, column]) => column);
        const placeholders = fields.map(() => '?');
        const parameters = fields.map(([property]) => input[property]);
        this.database.prepare(`INSERT INTO ${this.table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`).run(...parameters);
        const created = this.getById(value.id);
        if (!created)
            throw new Error(`Inserted ${this.table} record could not be read back.`);
        return created;
    }
    getById(id) {
        id = assertEntityId(id);
        return this.database.prepare(`SELECT ${this.selectList()} FROM ${this.table} WHERE id = ?`).get(id);
    }
    query(whereClause = '', parameters = [], orderBy = 'id', limit) {
        const where = whereClause ? ` WHERE ${whereClause}` : '';
        const bounded = limit === undefined ? '' : ' LIMIT ?';
        const values = limit === undefined ? parameters : [...parameters, limit];
        return this.database.prepare(`SELECT ${this.selectList()} FROM ${this.table}${where} ORDER BY ${orderBy}${bounded}`).all(...values);
    }
    updateById(id, changes) {
        id = assertEntityId(id);
        const input = changes;
        const fields = Object.entries(this.writableColumns)
            .filter(([property]) => property !== 'id' && input[property] !== undefined);
        const current = this.getById(id);
        if (!current || fields.length === 0)
            return current;
        const assignments = fields.map(([, column]) => `${column} = ?`);
        assignments.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
        const parameters = fields.map(([property]) => input[property]);
        parameters.push(id);
        this.database.prepare(`UPDATE ${this.table} SET ${assignments.join(', ')} WHERE id = ?`).run(...parameters);
        return this.getById(id);
    }
    deleteById(id) {
        id = assertEntityId(id);
        return this.database.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id).changes > 0;
    }
    selectList() {
        return Object.entries(this.selectedColumns)
            .map(([property, column]) => `${column} AS "${property}"`)
            .join(', ');
    }
}
import { assertEntityId } from '../../shared/identifiers';
