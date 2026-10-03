/** Phase 008 — pure domain types and invariants. */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { AgentRole, ObjectiveStatus, TaskStatus } from '../src/constants';
import {
  assertAgentInvariant,
  assertCanReportTo,
  assertDepartmentInvariant,
  assertObjectiveInvariant,
  assertOfficeInvariant,
  assertOrganizationHierarchyInvariant,
  assertOrganizationInvariant,
  assertTaskInvariant,
  createEntityId,
  createSlug,
  DomainInvariantError,
} from '../src/domain';
import type {
  Agent,
  Department,
  Objective,
  Office,
  Organization,
  OrganizationHierarchy,
  Task,
} from '../src/domain';

const organization: Organization = { id: createEntityId('org-1'), name: 'HEADROOM' };
const office: Office = {
  id: createEntityId('office-1'), organizationId: organization.id,
  name: 'Website Development', slug: createSlug('website-development'), status: 'ACTIVE',
};
const department: Department = {
  id: createEntityId('department-1'), officeId: office.id,
  name: 'Frontend', slug: createSlug('frontend'), status: 'ACTIVE',
};
const headManager: Agent = {
  id: createEntityId('agent-head'), name: 'Office Head', role: AgentRole.HEAD_MANAGER,
  status: 'IDLE', managedOfficeId: office.id,
};
const departmentManager: Agent = {
  id: createEntityId('agent-dept'), name: 'Department Manager', role: AgentRole.DEPT_MANAGER,
  status: 'IDLE', managedDepartmentId: department.id,
};
const employee: Agent = {
  id: createEntityId('agent-employee'), name: 'Employee', role: AgentRole.EMPLOYEE,
  status: 'IDLE', departmentId: department.id,
};
const validObjective: Objective = {
  id: createEntityId('objective-1'), title: 'Ship a feature', description: 'Implement the feature.',
  status: ObjectiveStatus.NEW, priority: 0,
};
const validTask: Task = {
  id: createEntityId('task-1'), taskCode: 'TASK-1', title: 'Implement domain types',
  status: TaskStatus.CREATED, priority: 0, retryCount: 0, maxRetries: 2,
};

function domainSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? domainSourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('Phase 008 — value objects and entity invariants', () => {
  it('normalizes non-empty entity ids and validates canonical slugs', () => {
    expect(createEntityId(' org-1 ')).toBe('org-1');
    expect(createSlug('website-development')).toBe('website-development');
    expect(() => createEntityId('  ')).toThrowError(DomainInvariantError);
    expect(() => createEntityId(null)).toThrowError(DomainInvariantError);
    expect(() => createSlug('Website Development')).toThrowError(DomainInvariantError);
    expect(() => createSlug(42)).toThrowError(DomainInvariantError);
  });

  it('accepts valid organization units and rejects missing required values', () => {
    expect(() => assertOrganizationInvariant(organization)).not.toThrow();
    expect(() => assertOfficeInvariant(office)).not.toThrow();
    expect(() => assertDepartmentInvariant(department)).not.toThrow();
    expect(() => assertOfficeInvariant({ ...office, name: ' ' })).toThrowError(DomainInvariantError);
    expect(() => assertDepartmentInvariant({ ...department, status: 'UNKNOWN' as Department['status'] }))
      .toThrowError(DomainInvariantError);
  });

  it('enforces valid role placement and adjacent reporting lines', () => {
    expect(() => assertAgentInvariant(headManager)).not.toThrow();
    expect(() => assertAgentInvariant(departmentManager)).not.toThrow();
    expect(() => assertAgentInvariant(employee)).not.toThrow();
    expect(() => assertAgentInvariant({ ...employee, departmentId: null })).toThrowError(DomainInvariantError);
    expect(() => assertCanReportTo(AgentRole.HEAD_MANAGER, AgentRole.DEPT_MANAGER)).not.toThrow();
    expect(() => assertCanReportTo(AgentRole.CEO, AgentRole.EMPLOYEE)).toThrowError(
      expect.objectContaining({ code: 'invalid-hierarchy' }),
    );
  });

  it('validates hierarchy membership, parent references, and duplicate identifiers', () => {
    const hierarchy: OrganizationHierarchy = {
      organization, offices: [office], departments: [department],
      agents: [headManager, departmentManager, employee],
    };
    expect(() => assertOrganizationHierarchyInvariant(hierarchy)).not.toThrow();
    expect(() => assertOrganizationHierarchyInvariant({
      ...hierarchy,
      departments: [{ ...department, officeId: createEntityId('missing-office') }],
    })).toThrowError(DomainInvariantError);
    expect(() => assertOrganizationHierarchyInvariant({
      ...hierarchy,
      offices: [office, { ...office, name: 'Duplicate' }],
    })).toThrowError(/ids must be unique/);
  });

  it('accepts valid objectives and tasks and rejects invalid statuses and retry budgets', () => {
    expect(() => assertObjectiveInvariant(validObjective)).not.toThrow();
    expect(() => assertObjectiveInvariant({ ...validObjective, priority: 1.5 })).toThrowError(DomainInvariantError);
    expect(() => assertObjectiveInvariant({ ...validObjective, status: 'INVALID' as ObjectiveStatus }))
      .toThrowError(DomainInvariantError);
    expect(() => assertTaskInvariant(validTask)).not.toThrow();
    expect(() => assertTaskInvariant({ ...validTask, retryCount: 3 })).toThrowError(/cannot exceed/);
    expect(() => assertTaskInvariant({ ...validTask, tokenBudget: -1 })).toThrowError(DomainInvariantError);
  });

  it('keeps the domain free of VS Code and storage dependencies', () => {
    const files = domainSourceFiles(join(__dirname, '..', 'src', 'domain'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/from\s+['"]vscode['"]/);
      expect(source, file).not.toMatch(/from\s+['"][^'"]*\/storage(?:\/[^'"]*)?['"]/);
    }
  });
});
