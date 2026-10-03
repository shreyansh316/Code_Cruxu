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
export { assertTaskAssignment } from './assignmentValidation';
export { assertObjectiveTransition, canTransitionObjective, OBJECTIVE_TRANSITIONS, transitionObjective, } from './objectiveLifecycle';
export { assertTaskTransition, canTransitionTask, TASK_TRANSITIONS, transitionTask, } from './taskLifecycle';
export { assertAgentInvariant, assertCanReportTo, assertDepartmentInvariant, assertObjectiveInvariant, assertOfficeInvariant, assertOrganizationHierarchyInvariant, assertOrganizationInvariant, assertTaskInvariant, } from './invariants';
export { createEntityId, createSlug } from './values';
