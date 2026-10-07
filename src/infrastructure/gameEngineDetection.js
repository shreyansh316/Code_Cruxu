import { createEngineCapabilityClaim, GAME_ENGINES } from '../domain/gameEngines';

/** Detect game-engine projects inside a workspace through a task-scoped
 * WorkspaceFileAdapter-shaped port ({ listFiles, readFile }).
 *
 * Every produced claim is DETECTION-originated and therefore capped at L2 by the
 * domain invariant: detection proves recognition (L1) and metadata inspection (L2)
 * only. Engine execution (L4+) remains UNAVAILABLE — see ENGINE_EXECUTION_AVAILABILITY.
 * Read failures degrade a claim to L1 with an evidence note instead of failing
 * detection; the workspace operation budget is still enforced by rethrowing it. */
export async function detectGameEngineProjects(adapter) {
    if (!adapter || typeof adapter.listFiles !== 'function' || typeof adapter.readFile !== 'function') {
        throw new TypeError('Game engine detection requires a workspace adapter with listFiles and readFile.');
    }
    const listing = await adapter.listFiles();
    const files = listing.files;
    const readText = async (path) => {
        const contents = await adapter.readFile(path);
        return typeof contents === 'string' ? contents : Buffer.from(contents).toString('utf8');
    };
    const tryRead = async (path) => {
        try {
            return await readText(path);
        } catch (error) {
            if (error && error.code === 'workspace-operation-limit') throw error;
            return null;
        }
    };
    const first = (predicate) => files.find(predicate) || null;
    const claims = [];

    const unityVersion = first((file) => file === 'ProjectSettings/ProjectVersion.txt');
    if (unityVersion) {
        const contents = await tryRead(unityVersion);
        const version = contents ? (contents.match(/m_EditorVersion:\s*(\S+)/) || [])[1] : null;
        claims.push(make('unity', version ? 'L2' : 'L1', version
            ? { path: unityVersion, detail: `Unity editor version ${version}` }
            : { path: unityVersion, detail: 'Version file present but unreadable or missing m_EditorVersion' }));
    } else if (files.some((file) => file.startsWith('Assets/'))) {
        claims.push(make('unity', 'L1', { path: 'Assets/', detail: 'Unity Assets directory marker present' }));
    }

    const uproject = first((file) => file.endsWith('.uproject'));
    if (uproject) {
        const contents = await tryRead(uproject);
        let association = null;
        if (contents) {
            try {
                association = JSON.parse(contents).EngineAssociation || null;
            } catch {
                association = null;
            }
        }
        claims.push(make('unreal-engine', association ? 'L2' : 'L1', association
            ? { path: uproject, detail: `Unreal Engine association ${association}` }
            : { path: uproject, detail: 'Project descriptor present but EngineAssociation unreadable' }));
    }

    const godotProject = first((file) => file === 'project.godot');
    if (godotProject) {
        const contents = await tryRead(godotProject);
        const configVersion = contents ? (contents.match(/config_version=(\d+)/) || [])[1] : null;
        claims.push(make('godot', configVersion ? 'L2' : 'L1', configVersion
            ? { path: godotProject, detail: `Godot project config_version ${configVersion}` }
            : { path: godotProject, detail: 'Project file present but config_version unreadable' }));
    }

    const rojoProject = first((file) => file === 'default.project.json' || file === 'rojo.json');
    const robloxPlace = first((file) => /\.(rbxlx|rbxl|rbxm)$/.test(file));
    if (rojoProject) {
        const contents = await tryRead(rojoProject);
        let parsed = null;
        if (contents) {
            try {
                parsed = JSON.parse(contents);
            } catch {
                parsed = null;
            }
        }
        claims.push(make('roblox-studio', parsed ? 'L2' : 'L1', parsed
            ? { path: rojoProject, detail: `Rojo project tree with ${Object.keys(parsed).length} top-level entries` }
            : { path: rojoProject, detail: 'Rojo project file present but not parseable JSON' }));
    } else if (robloxPlace) {
        claims.push(make('roblox-studio', 'L1', { path: robloxPlace, detail: 'Roblox place file present; Studio automation unavailable' }));
    }

    const blend = first((file) => file.endsWith('.blend') && !file.endsWith('.blend1'));
    if (blend) {
        claims.push(make('blender', 'L1', { path: blend, detail: 'Blender document present; process adapter unavailable' }));
    }

    return Object.freeze(claims);
}

function make(engine, level, evidence) {
    if (!GAME_ENGINES.includes(engine)) throw new TypeError(`Unknown engine ${engine}`);
    return createEngineCapabilityClaim({ engine, level, evidence: [evidence], origin: 'DETECTION' });
}
