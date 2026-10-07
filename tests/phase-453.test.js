/** Phase 453 — native workforce skills re-engineered from the agency-agents import. */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { WORKFORCE_SKILLS, getWorkforceSkill, resolveWorkforceSkills,
    buildSkillInstructionBlock } from '../src/application/workforceSkills';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const mapPath = `${repoRoot}imports/agency-agents/agency-agents-workforce-map.json`;
const blueprint = JSON.parse(readFileSync(mapPath, 'utf8'));
const blueprintBySlug = new Map(blueprint.sharedSkills.map((skill) => [skill.slug, skill]));

describe('Phase 453 — shared skill catalog matches the workforce blueprint', () => {
    it('registers exactly the blueprint shared skills under identical slugs', () => {
        expect(WORKFORCE_SKILLS.map((skill) => skill.slug).sort())
            .toEqual([...blueprintBySlug.keys()].sort());
        expect(new Set(WORKFORCE_SKILLS.map((skill) => skill.slug)).size).toBe(WORKFORCE_SKILLS.length);
    });

    it('keeps the blueprint role scope and tool requirements per skill', () => {
        for (const skill of WORKFORCE_SKILLS) {
            const expected = blueprintBySlug.get(skill.slug);
            expect(skill.applicableRoles).toEqual(expected.applicableRoles);
            expect(skill.requiredTools).toEqual(expected.toolsRequired);
        }
    });

    it('traces every skill to its recorded upstream source with MIT attribution', () => {
        for (const skill of WORKFORCE_SKILLS) {
            expect(skill.provenance.source).toBe(blueprintBySlug.get(skill.slug).provenance);
            expect(skill.provenance).toEqual({
                source: skill.provenance.source, license: 'MIT', adaptation: 'REENGINEERED',
            });
            expect(existsSync(`${repoRoot}${skill.provenance.source}`)).toBe(true);
        }
    });

    it('ships frozen, bounded, tool-vocabulary-clean skill definitions', () => {
        const vocabulary = new Set(['filesystem:read', 'filesystem:write', 'process:execute:git']);
        for (const skill of WORKFORCE_SKILLS) {
            expect(Object.isFrozen(skill)).toBe(true);
            expect(skill.instruction.length).toBeLessThanOrEqual(1600);
            expect(skill.description.length).toBeLessThanOrEqual(300);
            expect(skill.verification.length).toBeLessThanOrEqual(300);
            expect(skill.requiredTools.every((tool) => vocabulary.has(tool))).toBe(true);
        }
    });
});

describe('Phase 453 — skill resolution follows requiredCapabilities routing semantics', () => {
    it('resolves referenced skills case-insensitively in catalog order and collapses duplicates', () => {
        const resolved = resolveWorkforceSkills([
            'SKILL:GIT-PR-WORKFLOW', 'unknown-employee-capability', 'skill:minimal-change-discipline',
            'skill:git-pr-workflow',
        ]);
        expect(resolved.map((skill) => skill.slug)).toEqual([
            'skill:minimal-change-discipline', 'skill:git-pr-workflow',
        ]);
    });

    it('returns nothing for absent, empty, or unrelated capability lists and rejects malformed input', () => {
        expect(resolveWorkforceSkills(undefined)).toEqual([]);
        expect(resolveWorkforceSkills(null)).toEqual([]);
        expect(resolveWorkforceSkills([])).toEqual([]);
        expect(resolveWorkforceSkills(['employee-specific-skill'])).toEqual([]);
        expect(() => resolveWorkforceSkills('skill:minimal-change-discipline')).toThrow();
    });

    it('applies the execution-plan capability contract without coercing malformed labels', () => {
        for (const malformed of [
            [null], [42], [{}], ['   '], ['x'.repeat(101)], Array.from({ length: 33 }, (_, index) => `cap-${index}`),
        ]) {
            expect(() => resolveWorkforceSkills(malformed)).toThrowError(
                expect.objectContaining({ code: 'invalid-required-capabilities' }),
            );
        }
        expect(resolveWorkforceSkills([' skill:minimal-change-discipline '])).toHaveLength(1);
        expect(resolveWorkforceSkills(['skill:git-pr-workflow', 'SKILL:GIT-PR-WORKFLOW'])).toHaveLength(1);
    });

    it('exposes lookup by exact slug and null for non-shared labels', () => {
        expect(getWorkforceSkill('skill:evidence-collection').name).toBe('Verifiable Evidence Collection');
        expect(getWorkforceSkill('SKILL:EVIDENCE-COLLECTION').slug).toBe('skill:evidence-collection');
        expect(getWorkforceSkill('not-a-skill')).toBe(null);
        expect(getWorkforceSkill(42)).toBe(null);
    });
});

describe('Phase 453 — bounded instruction block for task packets', () => {
    it('returns null when no shared skill applies so packets stay minimal', () => {
        expect(buildSkillInstructionBlock([])).toBe(null);
        expect(buildSkillInstructionBlock(['employee-specific-skill'])).toBe(null);
        expect(buildSkillInstructionBlock(undefined)).toBe(null);
    });

    it('marks every included skill with its slug and stays inside the packet token budget', () => {
        const allSlugs = WORKFORCE_SKILLS.map((skill) => skill.slug);
        const block = buildSkillInstructionBlock(allSlugs);
        for (const slug of allSlugs) expect(block).toContain(`[${slug}]`);
        const bytes = Buffer.byteLength(block, 'utf8');
        expect(bytes).toBeLessThanOrEqual(8 * 1024);
        expect(bytes).toBeLessThan(6000);
    });

    it('refuses to produce a block beyond the supplied byte budget', () => {
        const allSlugs = WORKFORCE_SKILLS.map((skill) => skill.slug);
        expect(() => buildSkillInstructionBlock(allSlugs, 64)).toThrow();
    });

    it('rejects invalid or unbounded caller-supplied byte budgets', () => {
        for (const budget of [0, -1, 1.5, Number.NaN, Infinity, 8 * 1024 + 1, '8192']) {
            expect(() => buildSkillInstructionBlock([], budget)).toThrowError(
                expect.objectContaining({ code: 'invalid-skill-instruction-budget' }),
            );
        }
    });
});
