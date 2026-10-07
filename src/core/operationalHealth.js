/** Operational health reporting, extracted from HeadroomContext (phase 457).
 * Pure presentation model: reads each health source independently so an
 * unavailable service does not hide the rest. */

const HEALTH_CHECKS = Object.freeze([
    { id: 'database', label: 'Database' }, { id: 'queue', label: 'Queue' },
    { id: 'provider', label: 'AI provider' }, { id: 'verification', label: 'Verification' },
]);

/** Read each health source independently so an unavailable service does not hide the rest. */
export async function readOperationalHealth(sources) {
    const values = await Promise.all(HEALTH_CHECKS.map(async ({ id, label }) => {
        try {
            const source = sources?.[id];
            if (typeof source !== 'function') throw new Error('unavailable');
            const value = await source();
            if (!value || typeof value !== 'object') throw new Error('unavailable');
            if (id === 'database') return { id, label, status: value.status,
                detail: value.status === 'HEALTHY' ? `SQLite healthy; schema ${value.schemaVersion ?? 'unknown'}.`
                    : `SQLite ${value.status?.toLowerCase() ?? 'unavailable'}; ${value.issues?.length ?? 0} issue(s).` };
            if (id === 'queue') {
                if (!Number.isSafeInteger(value.queued) || value.queued < 0 || !Number.isSafeInteger(value.claimed) || value.claimed < 0) {
                    throw new Error('unavailable');
                }
                return { id, label, status: 'HEALTHY', detail: `${value.queued} queued; ${value.claimed} claimed.` };
            }
            if (id === 'provider') return { id, label, status: value.status, detail: value.detail };
            return { id, label, status: value.status, detail: value.detail };
        } catch {
            return { id, label, status: 'UNAVAILABLE', detail: `${label} status unavailable.` };
        }
    }));
    return values;
}
