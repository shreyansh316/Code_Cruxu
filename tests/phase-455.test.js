/** Phase 455 — game-engine project detection at honest capability levels. */
import { describe, expect, it } from 'vitest';

import { detectGameEngineProjects } from '../src/infrastructure/gameEngineDetection';
import { createEngineCapabilityClaim, ENGINE_EXECUTION_AVAILABILITY, GAME_ENGINE_LEVELS,
    GAME_ENGINES, MAX_DETECTED_LEVEL } from '../src/domain/gameEngines';

function memoryAdapter(files, contents = {}) {
    return {
        listFiles: async () => ({ files: Object.freeze([...files]), truncated: false, limit: 500 }),
        readFile: async (path) => {
            if (!(path in contents)) throw Object.assign(new Error('not found'), { code: 'workspace-file-missing' });
            return contents[path];
        },
    };
}

describe('Phase 455 — engine detection reports only demonstrated levels', () => {
    it('detects Unity projects and reads the editor version for L2', async () => {
        const claims = await detectGameEngineProjects(memoryAdapter(
            ['ProjectSettings/ProjectVersion.txt', 'Assets/Scenes/Main.unity'],
            { 'ProjectSettings/ProjectVersion.txt': 'm_EditorVersion: 2022.3.41f1\n' }));
        expect(claims).toHaveLength(1);
        expect(claims[0]).toMatchObject({ engine: 'unity', level: 'L2', origin: 'DETECTION' });
        expect(claims[0].evidence[0].detail).toContain('2022.3.41f1');
    });

    it('detects Unreal, Godot, Rojo, and Blender projects from their real markers', async () => {
        const claims = await detectGameEngineProjects(memoryAdapter(
            ['MyGame.uproject', 'project.godot', 'default.project.json', 'art/model.blend'],
            {
                'MyGame.uproject': '{"EngineAssociation": "4.27"}',
                'project.godot': 'config_version=5\n[application]\nname="Demo"\n',
                'default.project.json': '{"name": "experience", "tree": {}}',
            }));
        expect(Object.fromEntries(claims.map((claim) => [claim.engine, claim.level]))).toEqual({
            'unreal-engine': 'L2', godot: 'L2', 'roblox-studio': 'L2', blender: 'L1',
        });
        const unreal = claims.find((claim) => claim.engine === 'unreal-engine');
        expect(unreal.evidence[0].detail).toContain('4.27');
    });

    it('falls back to L1 marker evidence when metadata is missing, unreadable, or malformed', async () => {
        const malformed = await detectGameEngineProjects(memoryAdapter(
            ['Broken.uproject', 'Game.rbxl'], { 'Broken.uproject': '{not json' }));
        expect(malformed.map((claim) => `${claim.engine}:${claim.level}`)).toEqual(['unreal-engine:L1', 'roblox-studio:L1']);
        const unreadable = await detectGameEngineProjects({
            listFiles: async () => ({ files: ['ProjectSettings/ProjectVersion.txt'], truncated: false, limit: 500 }),
            readFile: async () => { throw Object.assign(new Error('denied'), { code: 'workspace-file-denied' }); },
        });
        expect(unreadable[0]).toMatchObject({ engine: 'unity', level: 'L1' });
        expect(unreadable[0].evidence[0].detail).toMatch(/unreadable/);
    });

    it('returns no claims for empty or unrelated workspaces without failing', async () => {
        expect(await detectGameEngineProjects(memoryAdapter([]))).toEqual([]);
        expect(await detectGameEngineProjects(memoryAdapter(['src/main.js', 'README.md']))).toEqual([]);
    });

    it('propagates workspace operation-budget exhaustion instead of degrading it', async () => {
        const adapter = {
            listFiles: async () => ({ files: ['ProjectSettings/ProjectVersion.txt'], truncated: false, limit: 500 }),
            readFile: async () => { throw Object.assign(new Error('budget'), { code: 'workspace-operation-limit' }); },
        };
        await expect(detectGameEngineProjects(adapter)).rejects.toMatchObject({ code: 'workspace-operation-limit' });
    });

    it('requires a workspace adapter shaped port', async () => {
        await expect(detectGameEngineProjects(null)).rejects.toThrow(TypeError);
        await expect(detectGameEngineProjects({ listFiles: async () => ({ files: [] }) })).rejects.toThrow(TypeError);
    });
});

describe('Phase 455 — capability claims cannot exceed demonstrated evidence', () => {
    it('rejects detection-origin claims above the L2 detection ceiling', () => {
        const evidence = [{ path: 'project.godot', detail: 'config_version=5' }];
        expect(createEngineCapabilityClaim({ engine: 'godot', level: 'L2', evidence, origin: 'DETECTION' })).toBeDefined();
        for (const level of ['L4', 'L7']) {
            expect(() => createEngineCapabilityClaim({ engine: 'godot', level, evidence, origin: 'DETECTION' }))
                .toThrowError(expect.objectContaining({ code: 'engine-claim-exceeds-detection' }));
        }
    });

    it('rejects unknown engines, malformed evidence, and unknown origins', () => {
        const evidence = [{ path: 'a.txt', detail: 'exists' }];
        expect(() => createEngineCapabilityClaim({ engine: 'cryengine', level: 'L1', evidence, origin: 'DETECTION' })).toThrow();
        expect(() => createEngineCapabilityClaim({ engine: 'unity', level: 'L9', evidence, origin: 'DETECTION' })).toThrow();
        expect(() => createEngineCapabilityClaim({ engine: 'unity', level: 'L1', evidence: [], origin: 'DETECTION' })).toThrow();
        expect(() => createEngineCapabilityClaim({ engine: 'unity', level: 'L1', evidence: [{ path: '', detail: 'x' }], origin: 'DETECTION' })).toThrow();
        expect(() => createEngineCapabilityClaim({ engine: 'unity', level: 'L1', evidence, origin: 'HALLUCINATION' })).toThrow();
    });

    it('records every engine execution capability as UNAVAILABLE with the missing implementation named', () => {
        expect(Object.keys(ENGINE_EXECUTION_AVAILABILITY).sort()).toEqual([...GAME_ENGINES].sort());
        for (const engine of GAME_ENGINES) {
            expect(ENGINE_EXECUTION_AVAILABILITY[engine].availability).toBe('UNAVAILABLE');
            expect(ENGINE_EXECUTION_AVAILABILITY[engine].reason).toMatch(/adapter/i);
        }
        expect(GAME_ENGINE_LEVELS[MAX_DETECTED_LEVEL === 'L2' ? 2 : -1]).toBe('L2');
        expect(GAME_ENGINE_LEVELS).toHaveLength(8);
    });
});
