/**
 * HEADROOM — Phase 001 Smoke Tests
 *
 * Verifies:
 * 1. Constants are defined and correct
 * 2. Command IDs match package.json contributes
 * 3. AgentRole enum values are correct
 * 4. TaskStatus enum values are correct
 * 5. EventType enum values are complete
 * 6. MemoryScope enum values are complete
 * 7. ALLOWED_COMMUNICATION hierarchy is correctly defined
 * 8. Forbidden communication routes are NOT in allowed map
 */
import { describe, it, expect } from 'vitest';
import { COMMANDS, VIEWS, AgentRole, TaskStatus, EventType, MemoryScope, ALLOWED_COMMUNICATION, OFFICES, DEPARTMENTS, } from '../src/constants';
describe('Phase 001 — Constants & Types', () => {
    describe('COMMANDS', () => {
        it('defines all required commands', () => {
            expect(COMMANDS.OPEN_DASHBOARD).toBe('headroom.openDashboard');
            expect(COMMANDS.NEW_OBJECTIVE).toBe('headroom.newObjective');
            expect(COMMANDS.SHOW_STATUS).toBe('headroom.showStatus');
            expect(COMMANDS.PAUSE_EXECUTION).toBe('headroom.pauseExecution');
            expect(COMMANDS.RESUME_EXECUTION).toBe('headroom.resumeExecution');
        });
        it('all command IDs are prefixed with headroom.', () => {
            for (const cmd of Object.values(COMMANDS)) {
                expect(cmd).toMatch(/^headroom\./);
            }
        });
    });
    describe('VIEWS', () => {
        it('defines all view IDs', () => {
            expect(VIEWS.ORGANIZATION).toBe('headroom.organizationView');
            expect(VIEWS.TASKS).toBe('headroom.taskView');
        });
    });
    describe('AgentRole', () => {
        it('defines all hierarchy roles', () => {
            expect(AgentRole.CEO).toBe('CEO');
            expect(AgentRole.DIRECTOR).toBe('DIRECTOR');
            expect(AgentRole.HEAD_MANAGER).toBe('HEAD_MANAGER');
            expect(AgentRole.DEPT_MANAGER).toBe('DEPT_MANAGER');
            expect(AgentRole.EMPLOYEE).toBe('EMPLOYEE');
        });
        it('has exactly 5 roles', () => {
            expect(Object.keys(AgentRole)).toHaveLength(5);
        });
    });
    describe('TaskStatus', () => {
        it('defines all valid task states', () => {
            expect(TaskStatus.CREATED).toBe('CREATED');
            expect(TaskStatus.ASSIGNED).toBe('ASSIGNED');
            expect(TaskStatus.STARTED).toBe('STARTED');
            expect(TaskStatus.IN_PROGRESS).toBe('IN_PROGRESS');
            expect(TaskStatus.BLOCKED).toBe('BLOCKED');
            expect(TaskStatus.REVIEW).toBe('REVIEW');
            expect(TaskStatus.COMPLETED).toBe('COMPLETED');
            expect(TaskStatus.FAILED).toBe('FAILED');
            expect(TaskStatus.CANCELLED).toBe('CANCELLED');
        });
    });
    describe('EventType', () => {
        it('defines all TASK_ event types', () => {
            const taskEvents = Object.keys(EventType).filter(k => k.startsWith('TASK_'));
            expect(taskEvents.length).toBeGreaterThanOrEqual(10);
        });
        it('includes TASK_BLOCKED for escalation', () => {
            expect(EventType.TASK_BLOCKED).toBeDefined();
        });
        it('includes TASK_ESCALATED', () => {
            expect(EventType.TASK_ESCALATED).toBeDefined();
        });
    });
    describe('MemoryScope', () => {
        it('defines all 8 required memory scopes', () => {
            expect(MemoryScope.CEO).toBeDefined();
            expect(MemoryScope.DIRECTOR).toBeDefined();
            expect(MemoryScope.OFFICE).toBeDefined();
            expect(MemoryScope.DEPARTMENT).toBeDefined();
            expect(MemoryScope.TASK).toBeDefined();
            expect(MemoryScope.PROJECT).toBeDefined();
            expect(MemoryScope.DECISION).toBeDefined();
            expect(MemoryScope.KNOWLEDGE).toBeDefined();
        });
    });
    describe('ALLOWED_COMMUNICATION — hierarchy enforcement', () => {
        it('CEO can only communicate with DIRECTOR', () => {
            const allowed = ALLOWED_COMMUNICATION[AgentRole.CEO];
            expect(allowed).toEqual([AgentRole.DIRECTOR]);
        });
        it('DIRECTOR can communicate with CEO and HEAD_MANAGER', () => {
            const allowed = ALLOWED_COMMUNICATION[AgentRole.DIRECTOR];
            expect(allowed).toContain(AgentRole.CEO);
            expect(allowed).toContain(AgentRole.HEAD_MANAGER);
        });
        it('HEAD_MANAGER can communicate with DIRECTOR and DEPT_MANAGER', () => {
            const allowed = ALLOWED_COMMUNICATION[AgentRole.HEAD_MANAGER];
            expect(allowed).toContain(AgentRole.DIRECTOR);
            expect(allowed).toContain(AgentRole.DEPT_MANAGER);
        });
        it('DEPT_MANAGER can communicate with HEAD_MANAGER and EMPLOYEE', () => {
            const allowed = ALLOWED_COMMUNICATION[AgentRole.DEPT_MANAGER];
            expect(allowed).toContain(AgentRole.HEAD_MANAGER);
            expect(allowed).toContain(AgentRole.EMPLOYEE);
        });
        it('EMPLOYEE can only communicate with DEPT_MANAGER', () => {
            const allowed = ALLOWED_COMMUNICATION[AgentRole.EMPLOYEE];
            expect(allowed).toEqual([AgentRole.DEPT_MANAGER]);
        });
        // FORBIDDEN ROUTES — these are architectural constraints
        it('EMPLOYEE cannot communicate directly with another EMPLOYEE', () => {
            const allowed = ALLOWED_COMMUNICATION[AgentRole.EMPLOYEE];
            expect(allowed).not.toContain(AgentRole.EMPLOYEE);
        });
        it('EMPLOYEE cannot communicate directly with HEAD_MANAGER', () => {
            const allowed = ALLOWED_COMMUNICATION[AgentRole.EMPLOYEE];
            expect(allowed).not.toContain(AgentRole.HEAD_MANAGER);
        });
        it('EMPLOYEE cannot communicate directly with DIRECTOR', () => {
            const allowed = ALLOWED_COMMUNICATION[AgentRole.EMPLOYEE];
            expect(allowed).not.toContain(AgentRole.DIRECTOR);
        });
        it('EMPLOYEE cannot communicate directly with CEO', () => {
            const allowed = ALLOWED_COMMUNICATION[AgentRole.EMPLOYEE];
            expect(allowed).not.toContain(AgentRole.CEO);
        });
        it('DEPT_MANAGER cannot communicate directly with another DEPT_MANAGER', () => {
            const allowed = ALLOWED_COMMUNICATION[AgentRole.DEPT_MANAGER];
            expect(allowed).not.toContain(AgentRole.DEPT_MANAGER);
        });
        it('DEPT_MANAGER cannot communicate directly with DIRECTOR', () => {
            const allowed = ALLOWED_COMMUNICATION[AgentRole.DEPT_MANAGER];
            expect(allowed).not.toContain(AgentRole.DIRECTOR);
        });
        it('every role has a defined allowed communication list', () => {
            for (const role of Object.values(AgentRole)) {
                expect(ALLOWED_COMMUNICATION[role]).toBeDefined();
                expect(Array.isArray(ALLOWED_COMMUNICATION[role])).toBe(true);
            }
        });
    });
    describe('OFFICES', () => {
        it('defines WEBSITE as the initial office', () => {
            expect(OFFICES.WEBSITE).toBe('website-development');
        });
        it('defines future offices without implementation', () => {
            expect(OFFICES.GAME).toBeDefined();
            expect(OFFICES.APP).toBeDefined();
            expect(OFFICES.RESEARCH).toBeDefined();
        });
    });
    describe('DEPARTMENTS', () => {
        it('defines core Website Dev Office departments', () => {
            expect(DEPARTMENTS.FRONTEND).toBe('frontend');
            expect(DEPARTMENTS.BACKEND).toBe('backend');
            expect(DEPARTMENTS.UIUX).toBe('ui-ux');
            expect(DEPARTMENTS.QA_TESTING).toBe('qa-testing');
        });
    });
});
