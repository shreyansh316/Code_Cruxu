/**
 * HEADROOM — Domain Layer
 *
 * Contains the core business logic of the HEADROOM AI organization:
 * - Agent definitions and roles
 * - Organization hierarchy rules
 * - Task state machine
 * - Communication routing rules
 * - Memory scope definitions
 * - Event type definitions
 *
 * This layer has NO dependency on VS Code APIs.
 * This layer has NO dependency on the database (infrastructure).
 * Pure JavaScript business logic only.
 *
 * Pure domain types and invariants are implemented in Phase 008.
 */
export { DomainInvariantError } from './errors';
export { ExecutionControl } from './executionControl';
export { assertTaskDependencyGraph, getTaskReadiness } from './taskDependencies';
export { calculateTaskProgress } from './taskProgress';
export { validateTaskAcceptanceCriteria } from './taskAcceptanceCriteria';
export { validateTaskResult } from './taskResult';
export { evaluateTaskRetry, MAX_TASK_RETRIES } from './taskRetryPolicy';
export { getTaskEscalationRoute } from './taskEscalation';
export { createDomainEvent, DOMAIN_EVENT_VERSION } from './events';
export { retrieveScopedMemories } from './memoryRetrieval';
export { canTransitionQuestion, QuestionStatus, transitionQuestion } from './questionLifecycle';
export { assertExecutionPlan } from './executionPlan';
export { assertPlanApproved, PlanDecision, recordPlanDecision } from './planApproval';
export { assertTaskAssignment } from './assignmentValidation';
export { assertObjectiveTransition, canTransitionObjective, OBJECTIVE_TRANSITIONS, transitionObjective, } from './objectiveLifecycle';
export { assertTaskTransition, canTransitionTask, TASK_TRANSITIONS, transitionTask, } from './taskLifecycle';
export { assertAgentInvariant, assertCanReportTo, assertDepartmentInvariant, assertObjectiveInvariant, assertOfficeInvariant, assertOrganizationHierarchyInvariant, assertOrganizationInvariant, assertTaskInvariant, } from './invariants';
export { createEntityId, createSlug } from './values';
