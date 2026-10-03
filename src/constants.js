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
    NEW_OBJECTIVE: 'headroom.newObjective',
    SHOW_STATUS: 'headroom.showStatus',
    PAUSE_EXECUTION: 'headroom.pauseExecution',
    RESUME_EXECUTION: 'headroom.resumeExecution',
    CONFIGURE_PROVIDER_CREDENTIAL: 'headroom.configureProviderCredential',
    CLEAR_PROVIDER_CREDENTIAL: 'headroom.clearProviderCredential',
    REVIEW_TASK_CHANGES: 'headroom.reviewTaskChanges',
};
// ============================================================
// VIEW IDs — must match package.json contributes.views
// ============================================================
export const VIEWS = {
    ORGANIZATION: 'headroom.organizationView',
    OBJECTIVES: 'headroom.objectiveView',
    TASKS: 'headroom.taskView',
};
// ============================================================
// CONFIGURATION KEYS — must match package.json contributes.configuration
// ============================================================
export const CONFIG = {
    AI_PROVIDER: 'headroom.ai.provider',
    DEFAULT_MODEL: 'headroom.ai.defaultModel',
    REASONING_MODEL: 'headroom.ai.reasoningModel',
    MAX_RETRIES: 'headroom.execution.maxRetries',
    PARALLEL_LIMIT: 'headroom.execution.parallelLimit',
    DEBUG_VERBOSE: 'headroom.debug.verbose',
};
// ============================================================
// AGENT ROLES — organizational hierarchy
// ============================================================
export var AgentRole;
(function (AgentRole) {
    AgentRole["CEO"] = "CEO";
    AgentRole["DIRECTOR"] = "DIRECTOR";
    AgentRole["HEAD_MANAGER"] = "HEAD_MANAGER";
    AgentRole["DEPT_MANAGER"] = "DEPT_MANAGER";
    AgentRole["EMPLOYEE"] = "EMPLOYEE";
})(AgentRole || (AgentRole = {}));
// ============================================================
// TASK STATUSES — valid states in the task state machine
// ============================================================
export var TaskStatus;
(function (TaskStatus) {
    TaskStatus["CREATED"] = "CREATED";
    TaskStatus["ASSIGNED"] = "ASSIGNED";
    TaskStatus["STARTED"] = "STARTED";
    TaskStatus["IN_PROGRESS"] = "IN_PROGRESS";
    TaskStatus["BLOCKED"] = "BLOCKED";
    TaskStatus["REVIEW"] = "REVIEW";
    TaskStatus["COMPLETED"] = "COMPLETED";
    TaskStatus["FAILED"] = "FAILED";
    TaskStatus["CANCELLED"] = "CANCELLED";
})(TaskStatus || (TaskStatus = {}));
// ============================================================
// EVENT TYPES — used by the event system (Phase 025)
// ============================================================
export var EventType;
(function (EventType) {
    EventType["TASK_CREATED"] = "TASK_CREATED";
    EventType["TASK_ASSIGNED"] = "TASK_ASSIGNED";
    EventType["TASK_STARTED"] = "TASK_STARTED";
    EventType["TASK_PROGRESS"] = "TASK_PROGRESS";
    EventType["TASK_BLOCKED"] = "TASK_BLOCKED";
    EventType["TASK_COMPLETED"] = "TASK_COMPLETED";
    EventType["TASK_FAILED"] = "TASK_FAILED";
    EventType["TASK_REVIEW_REQUIRED"] = "TASK_REVIEW_REQUIRED";
    EventType["TASK_REVIEW_PASSED"] = "TASK_REVIEW_PASSED";
    EventType["TASK_REVIEW_FAILED"] = "TASK_REVIEW_FAILED";
    EventType["TASK_QUEUED"] = "TASK_QUEUED";
    EventType["OBJECTIVE_ACTIVATED"] = "OBJECTIVE_ACTIVATED";
    EventType["OBJECTIVE_COMPLETED"] = "OBJECTIVE_COMPLETED";
    EventType["OBJECTIVE_FAILED"] = "OBJECTIVE_FAILED";
    EventType["TASK_REASSIGNED"] = "TASK_REASSIGNED";
    EventType["TASK_ESCALATED"] = "TASK_ESCALATED";
    EventType["MILESTONE_COMPLETED"] = "MILESTONE_COMPLETED";
    EventType["OBJECTIVE_CREATED"] = "OBJECTIVE_CREATED";
    EventType["QUESTION_ASKED"] = "QUESTION_ASKED";
    EventType["QUESTION_ANSWERED"] = "QUESTION_ANSWERED";
    EventType["PLAN_CREATED"] = "PLAN_CREATED";
    EventType["EXECUTION_PAUSED"] = "EXECUTION_PAUSED";
    EventType["EXECUTION_RESUMED"] = "EXECUTION_RESUMED";
})(EventType || (EventType = {}));
// ============================================================
// MEMORY SCOPES — scoped memory system (Phase 026-027)
// ============================================================
export var MemoryScope;
(function (MemoryScope) {
    MemoryScope["CEO"] = "CEO";
    MemoryScope["DIRECTOR"] = "DIRECTOR";
    MemoryScope["OFFICE"] = "OFFICE";
    MemoryScope["DEPARTMENT"] = "DEPARTMENT";
    MemoryScope["TASK"] = "TASK";
    MemoryScope["PROJECT"] = "PROJECT";
    MemoryScope["DECISION"] = "DECISION";
    MemoryScope["KNOWLEDGE"] = "KNOWLEDGE";
})(MemoryScope || (MemoryScope = {}));
// ============================================================
// OBJECTIVE STATUSES
// ============================================================
export var ObjectiveStatus;
(function (ObjectiveStatus) {
    ObjectiveStatus["NEW"] = "NEW";
    ObjectiveStatus["ANALYZING"] = "ANALYZING";
    ObjectiveStatus["QUESTIONING"] = "QUESTIONING";
    ObjectiveStatus["PLANNING"] = "PLANNING";
    ObjectiveStatus["ACTIVE"] = "ACTIVE";
    ObjectiveStatus["PAUSED"] = "PAUSED";
    ObjectiveStatus["COMPLETED"] = "COMPLETED";
    ObjectiveStatus["FAILED"] = "FAILED";
})(ObjectiveStatus || (ObjectiveStatus = {}));
// ============================================================
// OFFICE SLUGS
// ============================================================
export const OFFICES = {
    WEBSITE: 'website-development',
    GAME: 'game-development', // Future
    APP: 'app-development', // Future
    RESEARCH: 'research-making', // Future
};
// ============================================================
// WEBSITE DEV OFFICE — Department slugs
// ============================================================
export const DEPARTMENTS = {
    FRONTEND: 'frontend',
    BACKEND: 'backend',
    UIUX: 'ui-ux',
    QA_TESTING: 'qa-testing',
    SECURITY: 'security', // Future
    DEVOPS: 'devops', // Future
    DATABASE: 'database', // Future
    PERFORMANCE: 'performance', // Future
};
// ============================================================
// COMMUNICATION — allowed and forbidden routes
// ============================================================
export const ALLOWED_COMMUNICATION = {
    [AgentRole.CEO]: [AgentRole.DIRECTOR],
    [AgentRole.DIRECTOR]: [AgentRole.CEO, AgentRole.HEAD_MANAGER],
    [AgentRole.HEAD_MANAGER]: [AgentRole.DIRECTOR, AgentRole.DEPT_MANAGER],
    [AgentRole.DEPT_MANAGER]: [AgentRole.HEAD_MANAGER, AgentRole.EMPLOYEE],
    [AgentRole.EMPLOYEE]: [AgentRole.DEPT_MANAGER],
};
