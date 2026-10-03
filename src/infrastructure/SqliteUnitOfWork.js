/** Adapt a SQLite connection's transaction primitive to the application port. */
export function createSqliteUnitOfWork(database) {
    if (!database || typeof database.transaction !== 'function') {
        throw new TypeError('SQLite unit of work requires a transaction-capable database handle.');
    }
    return Object.freeze({
        run(operation) {
            if (typeof operation !== 'function') throw new TypeError('Unit-of-work operation must be a function.');
            return database.transaction(() => {
                const result = operation();
                if (result && typeof result.then === 'function') {
                    throw new TypeError('SQLite unit-of-work operations must be synchronous.');
                }
                return result;
            })();
        },
    });
}
