import { AgentRole, ObjectiveStatus, TaskStatus } from '../constants';
import type { EntityId, Slug } from './values';

export type { AgentRole, ObjectiveStatus, TaskStatus };

export type OrganizationalUnitStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type AgentStatus = 'IDLE' | 'BUSY' | 'OFFLINE' | 'ERROR';

export interface Organization {
  readonly id: EntityId;
  readonly name: string;
}

export interface Office {
  readonly id: EntityId;
  readonly organizationId: EntityId;
  readonly name: string;
  readonly slug: Slug;
  readonly description?: string | null;
  readonly status: OrganizationalUnitStatus;
}

export interface Department {
  readonly id: EntityId;
  readonly officeId: EntityId;
  readonly name: string;
  readonly slug: Slug;
  readonly description?: string | null;
  readonly status: OrganizationalUnitStatus;
}

export interface Agent {
  readonly id: EntityId;
  readonly name: string;
  readonly role: AgentRole;
  readonly specialization?: string | null;
  readonly status: AgentStatus;
  readonly managedOfficeId?: EntityId | null;
  readonly managedDepartmentId?: EntityId | null;
  readonly departmentId?: EntityId | null;
}

export interface OrganizationHierarchy {
  readonly organization: Organization;
  readonly offices: readonly Office[];
  readonly departments: readonly Department[];
  readonly agents: readonly Agent[];
}

export interface Objective {
  readonly id: EntityId;
  readonly title: string;
  readonly description: string;
  readonly status: ObjectiveStatus;
  readonly priority: number;
}

export interface Task {
  readonly id: EntityId;
  readonly taskCode: string;
  readonly title: string;
  readonly description?: string | null;
  readonly status: TaskStatus;
  readonly priority: number;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly tokenBudget?: number | null;
  readonly timeBudgetMs?: number | null;
  readonly projectId?: EntityId | null;
  readonly assigneeId?: EntityId | null;
  readonly creatorId?: EntityId | null;
}
