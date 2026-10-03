/**
 * HEADROOM — Core Constants
 * Phase 001: Extension identifiers, command IDs, and enums
 *
 * All string constants that are referenced in package.json
 * contributes must exactly match their package.json counterparts.
 */

export const EXTENSION_NAME = 'HEADROOM';
export const EXTENSION_ID = 'headroom';

// ============================================================
// COMMANDS — must match package.json contributes.commands
// ============================================================
export const COMMANDS = {
  OPEN_DASHBOARD: 'headroom.openDashboard',
  NEW_OBJECTIVE:  'headroom.newObjective',
  SHOW_STATUS:    'headroom.showStatus',
  PAUSE_EXECUTION: 'headroom.pauseExecution',
  RESUME_EXECUTION: 'headroom.resumeExecution',
} as const;

// ============================================================
// VIEW IDs — must match package.json contributes.views
// ============================================================
export const VIEWS = {
  ORGANIZATION: 'headroom.organizationView',
  TASKS:        'headroom.taskView',
} as const;

// ============================================================
// CONFIGURATION KEYS — must match package.json contributes.configuration
// ============================================================
export const CONFIG = {
  AI_PROVIDER:       'headroom.ai.provider',
  DEFAULT_MODEL:     'headroom.ai.defaultModel',
  REASONING_MODEL:   'headroom.ai.reasoningModel',
  MAX_RETRIES:       'headroom.execution.maxRetries',
  PARALLEL_LIMIT:    'headroom.execution.parallelLimit',
  DEBUG_VERBOSE:     'headroom.debug.verbose',
} as const;

// ============================================================
// AGENT ROLES — organizational hierarchy
// ============================================================
export enum AgentRole {
  CEO          = 'CEO',
  DIRECTOR     = 'DIRECTOR',
  HEAD_MANAGER = 'HEAD_MANAGER',
  DEPT_MANAGER = 'DEPT_MANAGER',
  EMPLOYEE     = 'EMPLOYEE',
}

// ============================================================
// TASK STATUSES — valid states in the task state machine
// ============================================================
export enum TaskStatus {
  CREATED    = 'CREATED',
  ASSIGNED   = 'ASSIGNED',
  STARTED    = 'STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED    = 'BLOCKED',
  REVIEW     = 'REVIEW',
  COMPLETED  = 'COMPLETED',
  FAILED     = 'FAILED',
  CANCELLED  = 'CANCELLED',
}

// ============================================================
// EVENT TYPES — used by the event system (Phase 025)
// ============================================================
export enum EventType {
  TASK_CREATED         = 'TASK_CREATED',
  TASK_ASSIGNED        = 'TASK_ASSIGNED',
  TASK_STARTED         = 'TASK_STARTED',
  TASK_PROGRESS        = 'TASK_PROGRESS',
  TASK_BLOCKED         = 'TASK_BLOCKED',
  TASK_COMPLETED       = 'TASK_COMPLETED',
  TASK_FAILED          = 'TASK_FAILED',
  TASK_REVIEW_REQUIRED = 'TASK_REVIEW_REQUIRED',
  TASK_REVIEW_PASSED   = 'TASK_REVIEW_PASSED',
  TASK_REVIEW_FAILED   = 'TASK_REVIEW_FAILED',
  TASK_REASSIGNED      = 'TASK_REASSIGNED',
  TASK_ESCALATED       = 'TASK_ESCALATED',
  MILESTONE_COMPLETED  = 'MILESTONE_COMPLETED',
  OBJECTIVE_CREATED    = 'OBJECTIVE_CREATED',
  QUESTION_ASKED       = 'QUESTION_ASKED',
  QUESTION_ANSWERED    = 'QUESTION_ANSWERED',
  PLAN_CREATED         = 'PLAN_CREATED',
  EXECUTION_PAUSED     = 'EXECUTION_PAUSED',
  EXECUTION_RESUMED    = 'EXECUTION_RESUMED',
}

// ============================================================
// MEMORY SCOPES — scoped memory system (Phase 026-027)
// ============================================================
export enum MemoryScope {
  CEO        = 'CEO',
  DIRECTOR   = 'DIRECTOR',
  OFFICE     = 'OFFICE',
  DEPARTMENT = 'DEPARTMENT',
  TASK       = 'TASK',
  PROJECT    = 'PROJECT',
  DECISION   = 'DECISION',
  KNOWLEDGE  = 'KNOWLEDGE',
}

// ============================================================
// OBJECTIVE STATUSES
// ============================================================
export enum ObjectiveStatus {
  NEW        = 'NEW',
  ANALYZING  = 'ANALYZING',
  QUESTIONING = 'QUESTIONING',
  PLANNING   = 'PLANNING',
  ACTIVE     = 'ACTIVE',
  PAUSED     = 'PAUSED',
  COMPLETED  = 'COMPLETED',
  FAILED     = 'FAILED',
}

// ============================================================
// OFFICE SLUGS
// ============================================================
export const OFFICES = {
  WEBSITE: 'website-development',
  GAME:    'game-development',    // Future
  APP:     'app-development',     // Future
  RESEARCH: 'research-making',    // Future
} as const;

// ============================================================
// WEBSITE DEV OFFICE — Department slugs
// ============================================================
export const DEPARTMENTS = {
  FRONTEND:    'frontend',
  BACKEND:     'backend',
  UIUX:        'ui-ux',
  QA_TESTING:  'qa-testing',
  SECURITY:    'security',       // Future
  DEVOPS:      'devops',         // Future
  DATABASE:    'database',       // Future
  PERFORMANCE: 'performance',    // Future
} as const;

// ============================================================
// COMMUNICATION — allowed and forbidden routes
// ============================================================
export const ALLOWED_COMMUNICATION: Record<AgentRole, AgentRole[]> = {
  [AgentRole.CEO]:          [AgentRole.DIRECTOR],
  [AgentRole.DIRECTOR]:     [AgentRole.CEO, AgentRole.HEAD_MANAGER],
  [AgentRole.HEAD_MANAGER]: [AgentRole.DIRECTOR, AgentRole.DEPT_MANAGER],
  [AgentRole.DEPT_MANAGER]: [AgentRole.HEAD_MANAGER, AgentRole.EMPLOYEE],
  [AgentRole.EMPLOYEE]:     [AgentRole.DEPT_MANAGER],
};
