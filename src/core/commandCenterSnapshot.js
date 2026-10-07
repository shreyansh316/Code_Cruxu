import { calculateTaskProgress } from '../domain/taskProgress';
import { redactSecrets } from '../shared/redactSecrets';

const TERMINAL_TASK_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const MAX_VISIBLE_RECORDS = 20;
export const COMMAND_CENTER_SECTIONS = new Set(['objectives', 'tasks', 'completed-tasks', 'task-errors', 'director-questions', 'activity', 'execution-activity', 'operational-health', 'current-work']);

/** Build a bounded, read-only snapshot from persisted objective and task records.
 * Extracted from CommandCenterPanel (phase 464): snapshot shaping is separate from
 * panel lifecycle and webview rendering.
 */
export function createCommandCenterSnapshot({ objectives, tasks, directorQuestions = [], activity = [], executionActivity = [], agents = [], offices = [], departments = [], organizations = [], collapsedSections = [],
    changedFiles = [], workspace = { folders: [] }, executionStatus, capturedAt = Date.now(), projects = [], operationalHealth, currentWork }) {
    if (!Array.isArray(objectives) || !Array.isArray(tasks) || !Array.isArray(directorQuestions) || !Array.isArray(activity) || !Array.isArray(executionActivity)
        || !Array.isArray(changedFiles) || !Array.isArray(agents) || !Array.isArray(offices) || !Array.isArray(departments) || !Array.isArray(organizations)
        || !Array.isArray(collapsedSections) || !Array.isArray(workspace?.folders)) {
        throw new TypeError('Command center requires objective, task, Director question, and activity records.');
    }
    const orderedObjectives = sortNamedRecords(objectives, 'title');
    const objectiveTitles = new Map(orderedObjectives.map((record) => [record?.id, boundedText(record?.title, 200, 'Untitled objective')]));
    const taskTitles = new Map(tasks.map((record) => [record?.id, boundedText(record?.title, 200, 'Untitled task')]));
    const agentNames = new Map(agents.map((record) => [record?.id, safeAgentName(record)]));
    const activeWorkload = countActiveWorkload(tasks);
    const snapshot = {
        executionStatus: ['PAUSED', 'CANCELLED'].includes(executionStatus) ? executionStatus : 'RUNNING',
        taskProgress: Object.freeze({ ...calculateTaskProgress(tasks) }),
        objectives: Object.freeze(orderedObjectives.slice(0, MAX_VISIBLE_RECORDS).map((record) => {
            const item = {
                title: boundedText(record?.title, 200, 'Untitled objective'),
                status: boundedText(record?.status, 32, 'UNKNOWN'),
            };
            const evidenceProgress = calculateObjectiveEvidenceProgress(record, projects, tasks);
            if (evidenceProgress !== undefined) item.progress = evidenceProgress;
            return Object.freeze(item);
        })),
        activeTasks: Object.freeze(sortNamedRecords(tasks.filter((record) => !TERMINAL_TASK_STATUSES.has(record?.status)), 'title')
            .slice(0, MAX_VISIBLE_RECORDS).map((record) => {
                const item = {
                    title: boundedText(record?.title, 200, 'Untitled task'),
                    status: boundedText(record?.status, 32, 'UNKNOWN'),
                };
                const duration = taskDuration(record, capturedAt, false);
                if (duration !== undefined) item.durationMs = duration;
                if (record?.assigneeId) {
                    const assigneeAgent = agents.find((agent) => agent?.id === record.assigneeId);
                    if (assigneeAgent) {
                        item.assignee = safeAgentName(assigneeAgent);
                        if (record?.managerId) {
                            const explicitManager = agents.find((agent) => agent?.id === record.managerId);
                            if (explicitManager) item.manager = safeAgentName(explicitManager);
                        } else if (assigneeAgent.departmentId) {
                            const deptManager = findDepartmentManager(agents, assigneeAgent.departmentId);
                            if (deptManager) item.manager = safeAgentName(deptManager);
                        }
                    }
                }
                if (record?.status === 'BLOCKED' || record?.blockerReason) {
                    item.blocker = redactSecrets(boundedText(record?.blockerReason, 240, 'Task is blocked.'), 240);
                } else if (Array.isArray(record?.dependencies) && record.dependencies.length > 0) {
                    const unresolved = tasks.filter((t) => record.dependencies.includes(t?.id) && !TERMINAL_TASK_STATUSES.has(t?.status));
                    if (unresolved.length > 0) {
                        item.blocker = redactSecrets(boundedText(unresolved[0]?.title ?? 'Unresolved dependency', 240, 'Dependency pending.'), 240);
                    }
                }
                return Object.freeze(item);
            })),
        completedTasks: Object.freeze(sortNamedRecords(tasks.filter((record) => record?.status === 'COMPLETED'), 'title')
            .slice(0, MAX_VISIBLE_RECORDS).map((record) => Object.freeze({
                title: boundedText(record?.title, 200, 'Untitled task'),
                status: 'COMPLETED',
                ...(taskDuration(record, capturedAt, true) === undefined ? {} : { durationMs: taskDuration(record, capturedAt, true) }),
            }))),
        taskErrors: Object.freeze(sortNamedRecords(tasks.filter((record) => ['FAILED', 'BLOCKED'].includes(record?.status)), 'title')
            .slice(0, MAX_VISIBLE_RECORDS).map((record) => Object.freeze({
                title: boundedText(record?.title, 200, 'Untitled task'),
                status: boundedText(record?.status, 32, 'UNKNOWN'),
                message: redactSecrets(boundedText(record?.blockerReason,
                    240, record?.status === 'FAILED' ? 'Task failed. Review its recorded result.' : 'Task is blocked; no reason was recorded.'), 240),
            }))),
        directorQuestions: Object.freeze(directorQuestions.slice().sort((left, right) =>
            compareText(objectiveTitles.get(left?.objectiveId) ?? 'Objective unavailable',
                objectiveTitles.get(right?.objectiveId) ?? 'Objective unavailable')
            || (left?.status === 'PENDING' ? 0 : 1) - (right?.status === 'PENDING' ? 0 : 1)
            || (Number(left?.sortOrder) || 0) - (Number(right?.sortOrder) || 0)
            || compareText(left?.id, right?.id)).slice(0, MAX_VISIBLE_RECORDS).map((record) => Object.freeze({
            objectiveTitle: objectiveTitles.get(record?.objectiveId) ?? 'Objective unavailable',
            question: boundedText(record?.question, 2000, 'Question unavailable'),
            answer: record?.status === 'ANSWERED' ? boundedText(record?.answer, 2000, '') : '',
            status: boundedText(record?.status, 32, 'UNKNOWN'),
            category: boundedText(record?.category, 100, ''),
        }))),
        activity: Object.freeze(activity.slice(0, MAX_VISIBLE_RECORDS).map((record) => Object.freeze({
            action: boundedText(record?.action, 100, 'Activity'),
            entity: boundedText(record?.entity, 100, 'record'),
            createdAt: boundedText(record?.createdAt, 64, 'Time unavailable'),
        }))),
        executionActivity: Object.freeze(executionActivity.slice(0, MAX_VISIBLE_RECORDS).map((record) => Object.freeze({
            source: boundedText(record?.source, 32, 'activity'),
            action: boundedText(record?.action, 100, 'Activity'),
            target: boundedText(record?.target, 180, ''),
            taskTitle: taskTitles.get(record?.taskId) ?? '',
            agentName: activityActorLabel(record, agentNames),
            activityPersisted: record?.persisted === true,
            status: boundedText(record?.status, 32, 'UNKNOWN'),
            durationMs: Number.isSafeInteger(record?.durationMs) ? Math.min(10_000_000, Math.max(0, record.durationMs)) : 0,
            bytes: Number.isSafeInteger(record?.bytes) ? Math.min(10_000_000, Math.max(0, record.bytes)) : 0,
            detail: redactSecrets(boundedText(record?.detail, 180, ''), 180),
            detailTruncated: record?.detailTruncated === true,
            occurredAt: boundedText(record?.occurredAt, 64, 'Time unavailable'),
        }))),
        changedFiles: Object.freeze(changedFiles.slice(0, MAX_VISIBLE_RECORDS).map((record) => Object.freeze({
            path: redactWorkspacePath(record?.path),
            originalPath: record?.originalPath ? redactWorkspacePath(record.originalPath) : '',
            status: ['UNTRACKED', 'ADDED', 'DELETED', 'RENAMED', 'COPIED', 'MODIFIED'].includes(record?.status)
                ? record.status : 'UNKNOWN',
        }))),
        workforce: Object.freeze(offices.slice().sort((a, b) => compareText(a?.name, b?.name) || compareText(a?.id, b?.id))
            .slice(0, 20).map((office) => Object.freeze({
                name: boundedText(office?.name, 120, 'Office'), status: boundedText(office?.status, 32, 'UNKNOWN'),
                organization: boundedText(organizations.find((organization) => organization?.id === office?.organizationId)?.name, 120, 'Organization unavailable'),
                headManager: safeAgentName(findOfficeHead(agents, office?.id)),
                headManagerStatus: boundedText(findOfficeHead(agents, office?.id)?.status, 32, 'UNKNOWN'),
                headManagerLifecycleStatus: boundedText(findOfficeHead(agents, office?.id)?.lifecycleStatus, 32, 'ACTIVE'),
                headManagerActiveTaskCount: workloadForAgent(activeWorkload, findOfficeHead(agents, office?.id)),
                departments: Object.freeze(departments.filter((department) => department?.officeId === office?.id)
                    .sort((a, b) => compareText(a?.name, b?.name) || compareText(a?.id, b?.id)).slice(0, 20).map((department) => Object.freeze({
                        name: boundedText(department?.name, 120, 'Department'),
                        manager: safeAgentName(findDepartmentManager(agents, department?.id)),
                        managerStatus: boundedText(findDepartmentManager(agents, department?.id)?.status, 32, 'UNKNOWN'),
                        managerLifecycleStatus: boundedText(findDepartmentManager(agents, department?.id)?.lifecycleStatus, 32, 'ACTIVE'),
                        managerActiveTaskCount: workloadForAgent(activeWorkload, findDepartmentManager(agents, department?.id)),
                        employees: Object.freeze(agents.filter((agent) => agent?.departmentId === department?.id)
                            .sort((a, b) => compareText(a?.name, b?.name) || compareText(a?.id, b?.id)).slice(0, 4)
                            .map((agent) => Object.freeze({ name: safeAgentName(agent), specialization: boundedText(agent?.specialization, 100, ''),
                                capabilities: Object.freeze(Array.isArray(agent?.capabilities) ? agent.capabilities.slice(0, 8).map((value) => boundedText(value, 100, '')) : []),
                                status: boundedText(agent?.status, 32, 'UNKNOWN'),
                                lifecycleStatus: boundedText(agent?.lifecycleStatus, 32, 'ACTIVE'),
                                activeTaskCount: workloadForAgent(activeWorkload, agent) }))),
                    }))),
            }))),
        collapsedSections: Object.freeze([...new Set(collapsedSections.filter((section) => COMMAND_CENTER_SECTIONS.has(section)))]),
        workspace: Object.freeze({
            folders: Object.freeze(workspace.folders.slice(0, 10).map((folder) => redactSecrets(boundedText(folder, 120, 'Workspace'), 120))),
            activeFile: safeFileName(workspace.activeFile),
            languageId: boundedText(workspace.languageId, 64, ''),
        }),
    };
    if (operationalHealth !== undefined) {
        const checks = Array.isArray(operationalHealth) ? operationalHealth.map((check) => Object.freeze({
            id: boundedText(check?.id, 64, 'check'),
            label: boundedText(check?.label, 64, 'Check'),
            status: ['HEALTHY', 'READY', 'DEGRADED', 'FAILED', 'UNAVAILABLE', 'NOT_RUN'].includes(check?.status)
                ? check.status : 'UNAVAILABLE',
            detail: redactSecrets(boundedText(check?.detail, 240, 'Status unavailable.'), 240),
        })) : [];
        snapshot.operationalHealth = Object.freeze(checks);
    }
    if (currentWork !== undefined) {
        const runningTasks = tasks.filter((t) => ['STARTED', 'IN_PROGRESS'].includes(t?.status));
        snapshot.currentWork = Object.freeze({
            executionStatus: ['PAUSED', 'CANCELLED'].includes(executionStatus) ? executionStatus : 'RUNNING',
            executingTaskCount: runningTasks.length,
            activeTasks: Object.freeze(runningTasks.slice(0, 5).map((t) => Object.freeze({
                title: boundedText(t?.title, 200, 'Untitled task'),
                status: boundedText(t?.status, 32, 'IN_PROGRESS'),
                assignee: safeAgentName(agents.find((a) => a?.id === t?.assigneeId)),
                ...(taskDuration(t, capturedAt, false) === undefined ? {} : { durationMs: taskDuration(t, capturedAt, false) }),
            }))),
            activePhase: currentWork?.activePhase ? boundedText(currentWork.activePhase, 100, '') : '',
            detail: currentWork?.detail ? redactSecrets(boundedText(currentWork.detail, 240, ''), 240) : '',
        });
    }
    return Object.freeze(snapshot);
}

function calculateObjectiveEvidenceProgress(objective, projects, tasks) {
    if (!objective?.id || !Array.isArray(projects) || !Array.isArray(tasks)) return undefined;
    const projectIds = new Set(projects.filter((p) => p?.objectiveId === objective.id).map((p) => p?.id).filter(Boolean));
    const linkedTasks = tasks.filter((t) => (t?.projectId && projectIds.has(t.projectId)) || t?.objectiveId === objective.id);
    if (linkedTasks.length === 0) return undefined;
    const total = linkedTasks.length;
    const completed = linkedTasks.filter((t) => t?.status === 'COMPLETED').length;
    const failed = linkedTasks.filter((t) => t?.status === 'FAILED').length;
    const active = linkedTasks.filter((t) => !TERMINAL_TASK_STATUSES.has(t?.status)).length;
    const percentage = Math.round((completed / total) * 100);
    return Object.freeze({ total, completed, failed, active, percentage });
}

function boundedText(value, maxLength, fallback) {
    return typeof value === 'string' && value.trim()
        ? redactSecrets(value.trim().slice(0, maxLength), maxLength) : fallback;
}

function taskDuration(record, capturedAt, completed) {
    const startedAt = Date.parse(record?.createdAt);
    const endAt = completed ? Date.parse(record?.updatedAt) : Number(capturedAt);
    if (!Number.isFinite(startedAt) || !Number.isFinite(endAt) || endAt < startedAt) return undefined;
    return Math.min(315_360_000_000, Math.floor(endAt - startedAt));
}

function sortNamedRecords(records, property) {
    return records.slice().sort((left, right) => compareText(left?.[property], right?.[property])
        || compareText(left?.id, right?.id));
}

function compareText(left, right) {
    const a = typeof left === 'string' ? left.trim() : '';
    const b = typeof right === 'string' ? right.trim() : '';
    return a < b ? -1 : a > b ? 1 : 0;
}

function safeFileName(value) {
    if (typeof value !== 'string') return '';
    const normalized = value.replace(/\\/g, '/');
    return redactSecrets(boundedText(normalized.slice(normalized.lastIndexOf('/') + 1), 160, ''), 160);
}

function redactWorkspacePath(value) {
    if (typeof value !== 'string') return '';
    return redactSecrets(value.replace(/\\/g, '/'), 180);
}

function safeAgentName(agent) {
    return agent ? boundedText(agent.name, 120, 'Employee') : 'Unassigned';
}

function activityActorLabel(record, agentNames) {
    if (typeof record?.agentId !== 'string' || !record.agentId.trim()) return 'Actor not recorded';
    return agentNames.get(record.agentId) ?? 'Employee identity unavailable';
}

function findOfficeHead(agents, officeId) {
    return agents.find((agent) => agent?.managedOfficeId === officeId && agent?.role === 'HEAD_MANAGER');
}

function findDepartmentManager(agents, departmentId) {
    return agents.find((agent) => agent?.managedDepartmentId === departmentId && agent?.role === 'DEPT_MANAGER');
}

function countActiveWorkload(tasks) {
    const workload = new Map();
    for (const task of tasks) {
        if (typeof task?.assigneeId !== 'string' || TERMINAL_TASK_STATUSES.has(task.status)) continue;
        workload.set(task.assigneeId, (workload.get(task.assigneeId) ?? 0) + 1);
    }
    return workload;
}

function workloadForAgent(workload, agent) {
    return agent ? workload.get(agent.id) ?? 0 : 0;
}
