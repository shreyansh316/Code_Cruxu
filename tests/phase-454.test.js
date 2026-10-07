/** Phase 454 — native employee position catalog from the workforce blueprint. */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { DEPARTMENTS, OFFICE_CATALOG } from '../src/constants';
import { POSITION_CATALOG, getPositionDepartments, getDepartmentPositions,
    findPositionsByCapability, findPositionBySpecialization } from '../src/domain/positionCatalog';
import { buildDepartmentWorkforceConfig } from '../src/application/positionWorkforceInput';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const blueprint = JSON.parse(readFileSync(`${repoRoot}imports/agency-agents/agency-agents-workforce-map.json`, 'utf8'));

function blueprintPositions() {
    const positions = [];
    for (const office of blueprint.offices) {
        for (const department of office.departments) {
            for (const employee of department.employees) positions.push({ office, department, employee });
        }
    }
    return positions;
}

describe('Phase 454 — position catalog holds the blueprint workforce natively', () => {
    it('registers exactly eighty positions across the four offices and twenty departments', () => {
        expect(POSITION_CATALOG).toHaveLength(80);
        expect(new Set(POSITION_CATALOG.map((entry) => entry.office))).toEqual(
            new Set(OFFICE_CATALOG.map((office) => office.slug)));
        expect(new Set(POSITION_CATALOG.map((entry) => `${entry.office}/${entry.department}`))).toHaveLength(20);
    });

    it('keeps the four-slot invariant with distinct specializations per department', () => {
        const grouped = new Map();
        for (const entry of POSITION_CATALOG) {
            const key = `${entry.office}/${entry.department}`;
            grouped.set(key, [...(grouped.get(key) ?? []), entry]);
        }
        for (const [key, group] of grouped) {
            expect(group, key).toHaveLength(4);
            expect(new Set(group.map((entry) => entry.slot)), key).toEqual(new Set([1, 2, 3, 4]));
            expect(new Set(group.map((entry) => entry.name.toLowerCase())), key).toHaveLength(4);
        }
    });

    it('matches every blueprint position on slot, name, capabilities, verification, and provenance', () => {
        const nativeByKey = new Map(POSITION_CATALOG.map((entry) => [`${entry.office}/${entry.department}/${entry.slot}`, entry]));
        for (const { office, department, employee } of blueprintPositions()) {
            const native = nativeByKey.get(`${office.slug}/${department.slug}/${employee.slot}`);
            expect(native, `${office.slug}/${department.slug}/${employee.slot}`).toBeDefined();
            expect(native.name).toBe(employee.name);
            expect(native.capabilities).toEqual(employee.taskTypes);
            expect(native.verification).toBe(employee.verification);
            expect(native.provenance).toBe(employee.provenance[0]);
            expect(existsSync(`${repoRoot}${native.provenance}`)).toBe(true);
        }
    });

    it('aligns website department slugs with the existing constants catalog', () => {
        expect([...getPositionDepartments('website-development')].sort()).toEqual(Object.values(DEPARTMENTS).sort());
    });

    it('ships frozen entries with bounded, kebab-normalized capability labels', () => {
        for (const entry of POSITION_CATALOG) {
            expect(Object.isFrozen(entry)).toBe(true);
            expect(Object.isFrozen(entry.capabilities)).toBe(true);
            expect(entry.name.length).toBeLessThanOrEqual(100);
            expect(entry.verification.length).toBeLessThanOrEqual(300);
            for (const label of entry.capabilities) expect(label).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        }
    });
});

describe('Phase 454 — catalog accessors feed routing and presentation', () => {
    it('resolves department positions in slot order and rejects unknown departments', () => {
        const group = getDepartmentPositions('game-development', 'game-engine-systems');
        expect(group.map((entry) => entry.slot)).toEqual([1, 2, 3, 4]);
        expect(group[0].name).toBe('Unreal Systems Engineer');
        expect(() => getDepartmentPositions('game-development', 'not-a-department')).toThrow();
    });

    it('lists department slugs per office and returns none for unknown offices', () => {
        expect(getPositionDepartments('research-making')).toHaveLength(4);
        expect(getPositionDepartments('not-an-office')).toEqual([]);
    });

    it('finds positions by capability label case-insensitively', () => {
        const hits = findPositionsByCapability('UNITY-SYSTEMS');
        expect(hits).toHaveLength(1);
        expect(hits[0].name).toBe('Unity Systems Architect');
        expect(findPositionsByCapability('no-such-capability')).toEqual([]);
        expect(findPositionsByCapability('   ')).toEqual([]);
    });

    it('resolves the persisted specialization to one unique position', () => {
        expect(findPositionBySpecialization('unreal systems engineer')).toMatchObject({
            office: 'game-development', department: 'game-engine-systems', slot: 1,
        });
        expect(findPositionBySpecialization('custom legacy role')).toBe(null);
        expect(findPositionBySpecialization(null)).toBe(null);
    });

    it('builds workforce configuration input from catalog positions for the real use case', () => {
        const config = buildDepartmentWorkforceConfig({
            officeSlug: 'website-development', departmentSlug: 'backend', managerName: 'Backend Manager',
        });
        expect(config.slug).toBe('backend');
        expect(config.name).toBe('backend');
        expect(config.managerName).toBe('Backend Manager');
        expect(config.employees).toHaveLength(4);
        for (const employee of config.employees) {
            expect(employee.specialization).toBeTruthy();
            expect(employee.name).toBeTruthy();
            expect(employee.capabilities.length).toBeGreaterThan(0);
        }
        const positions = getDepartmentPositions('website-development', 'backend');
        expect(config.employees.map((employee) => employee.specialization)).toEqual(positions.map((entry) => entry.name));
        expect(Object.isFrozen(config)).toBe(true);
    });

    it('rejects unknown departments, empty manager names, and malformed input', () => {
        expect(() => buildDepartmentWorkforceConfig({ officeSlug: 'game-development', departmentSlug: 'not-real', managerName: 'M' }))
            .toThrowError(expect.objectContaining({ code: 'department-not-in-catalog' }));
        expect(() => buildDepartmentWorkforceConfig({ officeSlug: 'game-development', departmentSlug: 'game-engine-systems', managerName: '  ' }))
            .toThrowError(expect.objectContaining({ code: 'invalid-department-config-input' }));
        expect(() => buildDepartmentWorkforceConfig({ officeSlug: 'game-development', departmentSlug: 'game-engine-systems', managerName: 'M', departmentName: '' }))
            .toThrowError(expect.objectContaining({ code: 'invalid-department-config-input' }));
    });
});
