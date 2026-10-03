import { AgentRole, ObjectiveStatus, TaskStatus } from '../constants';
import { DomainInvariantError } from './errors';
import type {
  Agent,
  Department,
  Objective,
  Office,
  Organization,
  OrganizationHierarchy,
  Task,
} from './types';

const REPORTS_TO: Readonly<Record<AgentRole, readonly AgentRole[]>> = {
  [AgentRole.CEO]: [],
  [AgentRole.DIRECTOR]: [AgentRole.CEO],
  [AgentRole.HEAD_MANAGER]: [AgentRole.DIRECTOR],
  [AgentRole.DEPT_MANAGER]: [AgentRole.HEAD_MANAGER],
  [AgentRole.EMPLOYEE]: [AgentRole.DEPT_MANAGER],
};

export function assertOrganizationInvariant(value: Organization): void {
  requireText(value.id, 'Organization id');
  requireText(value.name, 'Organization name');
}

export function assertOfficeInvariant(value: Office): void {
  requireText(value.id, 'Office id');
  requireText(value.organizationId, 'Office organization id');
  requireText(value.name, 'Office name');
  requireText(value.slug, 'Office slug');
  requireMember(value.status, ['ACTIVE', 'PAUSED', 'ARCHIVED'], 'Office status');
}

export function assertDepartmentInvariant(value: Department): void {
  requireText(value.id, 'Department id');
  requireText(value.officeId, 'Department office id');
  requireText(value.name, 'Department name');
  requireText(value.slug, 'Department slug');
  requireMember(value.status, ['ACTIVE', 'PAUSED', 'ARCHIVED'], 'Department status');
}

export function assertAgentInvariant(value: Agent): void {
  requireText(value.id, 'Agent id');
  requireText(value.name, 'Agent name');
  requireMember(value.role, Object.values(AgentRole), 'Agent role');
  requireMember(value.status, ['IDLE', 'BUSY', 'OFFLINE', 'ERROR'], 'Agent status');

  const managesOffice = hasReference(value.managedOfficeId);
  const managesDepartment = hasReference(value.managedDepartmentId);
  const assignedDepartment = hasReference(value.departmentId);
  if ((value.role === AgentRole.CEO || value.role === AgentRole.DIRECTOR)
    && (managesOffice || managesDepartment || assignedDepartment)) {
    invalidHierarchy(`${value.role} cannot be attached directly to an office or department.`);
  }
  if (value.role === AgentRole.HEAD_MANAGER && (!managesOffice || managesDepartment || assignedDepartment)) {
    invalidHierarchy('A head manager must manage one office and cannot be assigned to a department.');
  }
  if (value.role === AgentRole.DEPT_MANAGER && (!managesDepartment || managesOffice || assignedDepartment)) {
    invalidHierarchy('A department manager must manage one department and cannot manage an office.');
  }
  if (value.role === AgentRole.EMPLOYEE && (!assignedDepartment || managesOffice || managesDepartment)) {
    invalidHierarchy('An employee must be assigned to a department and cannot manage an organizational unit.');
  }
}

export function assertObjectiveInvariant(value: Objective): void {
  requireText(value.id, 'Objective id');
  requireText(value.title, 'Objective title');
  requireText(value.description, 'Objective description');
  requireMember(value.status, Object.values(ObjectiveStatus), 'Objective status');
  requireInteger(value.priority, 'Objective priority');
}

export function assertTaskInvariant(value: Task): void {
  requireText(value.id, 'Task id');
  requireText(value.taskCode, 'Task code');
  requireText(value.title, 'Task title');
  requireMember(value.status, Object.values(TaskStatus), 'Task status');
  requireInteger(value.priority, 'Task priority');
  requireInteger(value.maxRetries, 'Task max retries', 0);
  requireInteger(value.retryCount, 'Task retry count', 0);
  if (value.retryCount > value.maxRetries) {
    invalidEntity('Task retry count cannot exceed its maximum retries.');
  }
  if (value.tokenBudget != null) requireInteger(value.tokenBudget, 'Task token budget', 0);
  if (value.timeBudgetMs != null) requireInteger(value.timeBudgetMs, 'Task time budget', 0);
}

/** Validate a manager-to-report edge against the single-level org structure. */
export function assertCanReportTo(manager: AgentRole, report: AgentRole): void {
  requireMember(manager, Object.values(AgentRole), 'Manager role');
  requireMember(report, Object.values(AgentRole), 'Report role');
  if (!REPORTS_TO[report].includes(manager)) {
    invalidHierarchy(`${report} cannot report directly to ${manager}.`);
  }
}

/** Validate references and role placement for a complete organization snapshot. */
export function assertOrganizationHierarchyInvariant(value: OrganizationHierarchy): void {
  assertOrganizationInvariant(value.organization);
  assertUnique(value.offices, 'Office');
  assertUnique(value.departments, 'Department');
  assertUnique(value.agents, 'Agent');

  const officeIds = new Set(value.offices.map((office) => office.id));
  const departmentIds = new Set(value.departments.map((department) => department.id));

  for (const office of value.offices) {
    assertOfficeInvariant(office);
    if (office.organizationId !== value.organization.id) {
      invalidHierarchy(`Office ${office.id} references a different organization.`);
    }
  }
  for (const department of value.departments) {
    assertDepartmentInvariant(department);
    if (!officeIds.has(department.officeId)) {
      invalidHierarchy(`Department ${department.id} references an unknown office.`);
    }
  }
  for (const agent of value.agents) {
    assertAgentInvariant(agent);
    if (hasReference(agent.managedOfficeId) && !officeIds.has(agent.managedOfficeId)) {
      invalidHierarchy(`Agent ${agent.id} manages an unknown office.`);
    }
    if (hasReference(agent.managedDepartmentId) && !departmentIds.has(agent.managedDepartmentId)) {
      invalidHierarchy(`Agent ${agent.id} manages an unknown department.`);
    }
    if (hasReference(agent.departmentId) && !departmentIds.has(agent.departmentId)) {
      invalidHierarchy(`Agent ${agent.id} is assigned to an unknown department.`);
    }
  }
}

function assertUnique<T extends { readonly id: string; readonly slug?: string }>(
  values: readonly T[],
  label: string,
): void {
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const value of values) {
    if (ids.has(value.id)) invalidHierarchy(`${label} ids must be unique.`);
    ids.add(value.id);
    if (value.slug !== undefined) {
      if (slugs.has(value.slug)) invalidHierarchy(`${label} slugs must be unique.`);
      slugs.add(value.slug);
    }
  }
}

function requireText(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalidEntity(`${label} must be a non-empty string.`);
  }
}

function requireInteger(value: number, label: string, minimum?: number): void {
  if (!Number.isSafeInteger(value) || (minimum !== undefined && value < minimum)) {
    invalidEntity(`${label} must be a safe integer${minimum === undefined ? '' : ` greater than or equal to ${minimum}`}.`);
  }
}

function requireMember<T extends string>(value: T, allowed: readonly string[], label: string): void {
  if (!allowed.includes(value)) invalidEntity(`${label} is not supported.`);
}

function hasReference(value: string | null | undefined): value is string {
  return value !== null && value !== undefined;
}

function invalidEntity(message: string): never {
  throw new DomainInvariantError('invalid-entity', message);
}

function invalidHierarchy(message: string): never {
  throw new DomainInvariantError('invalid-hierarchy', message);
}
