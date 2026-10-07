import { DomainInvariantError } from './errors';

/** Game-engine capability scale (L0-L7) and engine catalog.
 *
 * Levels describe what HEADROOM can ACTUALLY do with an engine project; the highest
 * demonstrated level may only be claimed with evidence. Detection (this repository's
 * current integration) can demonstrate at most L2: project detection from workspace
 * markers and metadata inspection through the task-scoped workspace adapter. Script
 * generation (L3) rides on generic task-scoped file tools without engine-specific
 * validation, and L4-L7 require engine execution adapters that do not exist yet, so
 * every engine's execution availability is UNAVAILABLE until one is implemented and
 * verified. Never raise a claimed level without that evidence. */

export const GAME_ENGINE_LEVELS = Object.freeze(['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']);

export const GAME_ENGINES = Object.freeze(['unity', 'unreal-engine', 'godot', 'roblox-studio', 'blender']);

/** Highest level project detection can demonstrate; anything above requires an
 * engine execution adapter plus recorded verification evidence. */
export const MAX_DETECTED_LEVEL = 'L2';

/** Honest availability of engine execution (L4+). UNAVAILABLE means no adapter
 * exists; the reason states exactly what implementation is missing. */
export const ENGINE_EXECUTION_AVAILABILITY = Object.freeze({
    unity: Object.freeze({ availability: 'UNAVAILABLE', reason: 'No Unity editor/CLI execution adapter; L4+ requires a verified build and test adapter.' }),
    'unreal-engine': Object.freeze({ availability: 'UNAVAILABLE', reason: 'No Unreal Build Tool execution adapter; L4+ requires a verified UBT/automation adapter.' }),
    godot: Object.freeze({ availability: 'UNAVAILABLE', reason: 'No Godot headless execution adapter; L4+ requires a verified godot --headless adapter.' }),
    'roblox-studio': Object.freeze({ availability: 'UNAVAILABLE', reason: 'No Studio automation adapter; file-based Rojo workflows reach L2 only.' }),
    blender: Object.freeze({ availability: 'UNAVAILABLE', reason: 'No Blender process adapter; L4+ requires a verified blender --background adapter.' }),
});

function levelIndex(level) {
    return GAME_ENGINE_LEVELS.indexOf(level);
}

/** Validate one engine capability claim. Detection-originated claims may never
 * exceed MAX_DETECTED_LEVEL; a higher level requires execution evidence that the
 * detector cannot produce. */
export function createEngineCapabilityClaim({ engine, level, evidence, origin } = {}) {
    if (!GAME_ENGINES.includes(engine)
        || !GAME_ENGINE_LEVELS.includes(level)
        || !Array.isArray(evidence) || evidence.length === 0
        || evidence.some((item) => !item || typeof item.path !== 'string' || !item.path.trim()
            || typeof item.detail !== 'string' || !item.detail.trim() || item.detail.length > 300)
        || !['DETECTION', 'EXECUTION'].includes(origin)) {
        throw new DomainInvariantError('invalid-engine-claim', 'An engine capability claim requires a known engine, a level on the L0-L7 scale, bounded evidence, and a DETECTION or EXECUTION origin.');
    }
    if (origin === 'DETECTION' && levelIndex(level) > levelIndex(MAX_DETECTED_LEVEL)) {
        throw new DomainInvariantError('engine-claim-exceeds-detection', 'Detection cannot demonstrate levels above L2; execution levels require an EXECUTION-origin claim with verification evidence.');
    }
    return Object.freeze({
        engine, level, origin,
        evidence: Object.freeze(evidence.map((item) => Object.freeze({ path: item.path, detail: item.detail }))),
    });
}
