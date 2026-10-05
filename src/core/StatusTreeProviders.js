import * as vscode from 'vscode';
import { AgentRole, TaskStatus, VIEWS } from '../constants';
import { getMessage } from './messages';

const TERMINAL_TASK_STATUSES = new Set([
    TaskStatus.COMPLETED,
    TaskStatus.FAILED,
    TaskStatus.CANCELLED,
]);

/** Displays persisted objectives and their current lifecycle status. */
export class ObjectiveStatusTreeProvider {
    constructor(repository) {
        this.repository = repository;
        this._changeEmitter = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._changeEmitter.event;
    }

    refresh() { this._changeEmitter.fire(undefined); }
    dispose() { this._changeEmitter.dispose(); }

    getTreeItem(objective) {
        const item = new vscode.TreeItem(objective.title, vscode.TreeItemCollapsibleState.None);
        item.id = `objective:${objective.id}`;
        item.description = objective.status;
        item.accessibilityInformation = { label: `Objective: ${objective.title}. Status: ${objective.status}.` };
        item.contextValue = 'headroom.objective';
        return item;
    }

    getChildren(element) {
        if (element)
            return [];
        const objectives = this.repository.list();
        if (objectives.length === 0) {
            return [this._emptyState()];
        }
        return objectives;
    }

    _emptyState() {
        const label = getMessage('objectives.empty');
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        item.contextValue = 'headroom.empty';
        item.accessibilityInformation = { label: getMessage('objectives.empty.accessible') };
        return item;
    }
}

/** Displays persisted non-terminal tasks and their current lifecycle status. */
export class ActiveTaskTreeProvider {
    constructor(repository) {
        this.repository = repository;
        this._changeEmitter = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._changeEmitter.event;
    }

    refresh() { this._changeEmitter.fire(undefined); }
    dispose() { this._changeEmitter.dispose(); }

    getTreeItem(task) {
        const item = new vscode.TreeItem(task.title, vscode.TreeItemCollapsibleState.None);
        item.id = `task:${task.id}`;
        item.description = task.status;
        item.accessibilityInformation = { label: `Task: ${task.title}. Status: ${task.status}.` };
        item.contextValue = 'headroom.task';
        return item;
    }

    getChildren(element) {
        if (element)
            return [];
        const tasks = this.repository.list().filter((task) => !TERMINAL_TASK_STATUSES.has(task.status));
        if (tasks.length === 0) {
            const item = new vscode.TreeItem(getMessage('tasks.empty'), vscode.TreeItemCollapsibleState.None);
            item.contextValue = 'headroom.empty';
            item.accessibilityInformation = { label: getMessage('tasks.empty.accessible') };
            return [item];
        }
        return tasks;
    }
}

/** Presents a bounded snapshot of operational checks without exposing diagnostics detail. */
export class HealthStatusTreeProvider {
    constructor(readHealth) {
        if (typeof readHealth !== 'function') throw new TypeError('Health view requires a health snapshot function.');
        this.readHealth = readHealth;
        this._changeEmitter = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._changeEmitter.event;
    }

    refresh() { this._changeEmitter.fire(undefined); }
    dispose() { this._changeEmitter.dispose(); }

    getTreeItem(check) {
        const item = new vscode.TreeItem(`${check.label}: ${check.status}`, vscode.TreeItemCollapsibleState.None);
        item.id = `health:${check.id}`;
        item.description = check.detail;
        item.accessibilityInformation = { label: `${check.label}. ${check.status}. ${check.detail}` };
        item.contextValue = 'headroom.healthCheck';
        return item;
    }

    async getChildren(element) {
        if (element) return [];
        let checks;
        try { checks = await this.readHealth(); }
        catch { checks = unavailableHealth(); }
        if (!Array.isArray(checks) || checks.length !== 4) checks = unavailableHealth();
        return checks.map((check, index) => normalizeHealthCheck(check, index));
    }
}

/** Navigates the persisted organization → office → department → workforce hierarchy. */
export class OrganizationTreeProvider {
    constructor(repositories) {
        for (const key of ['organizations', 'offices', 'departments', 'agents', 'tasks', 'projects', 'objectives']) {
            if (typeof repositories?.[key]?.list !== 'function') {
                throw new TypeError(`Organization view requires the ${key} repository.`);
            }
        }
        if (typeof repositories.offices.listByOrganization !== 'function'
            || typeof repositories.departments.listByOffice !== 'function'
            || typeof repositories.agents.listByDepartment !== 'function') {
            throw new TypeError('Organization view requires hierarchy-scoped repository queries.');
        }
        this.repositories = repositories;
        this._changeEmitter = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._changeEmitter.event;
    }

    refresh() { this._changeEmitter.fire(undefined); }
    dispose() { this._changeEmitter.dispose(); }

    getTreeItem(node) {
        const { kind, record } = node;
        const item = new vscode.TreeItem(treeLabel(node), hasChildren(kind)
            ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        item.id = `${kind}:${record?.id ?? 'empty'}`;
        item.contextValue = `headroom.${kind}`;
        item.accessibilityInformation = { label: treeAccessibleLabel(node) };
        if (kind === 'organization') item.description = 'Organization';
        else item.description = kind === 'agent'
            ? `${record?.status ?? 'UNKNOWN'} · ${record?.workloadCount ?? 0} active task(s)`
            : record?.status ?? record?.role ?? '';
        return item;
    }

    getChildren(node) {
        if (!node) {
            const organizations = sortRecords(this.repositories.organizations.list(), 20)
                .map((record) => ({ kind: 'organization', record }));
            return organizations.length ? organizations : [emptyNode(getMessage('organization.empty'))];
        }
        if (node.kind === 'empty') return [];
        if (node.kind === 'organization') {
            const offices = sortRecords(this.repositories.offices.listByOrganization(node.record.id), 30)
                .map((record) => ({ kind: 'office', record }));
            return offices.length ? offices : [emptyNode(getMessage('organization.offices.empty'))];
        }
        if (node.kind === 'office') return this._officeChildren(node.record);
        if (node.kind === 'department') return this._departmentChildren(node.record);
        return [];
    }

    _officeChildren(office) {
        const agents = this.repositories.agents.list();
        const workload = createWorkloadCounts(this.repositories.tasks.list(), office.organizationId,
            this.repositories.projects.list(), this.repositories.objectives.list());
        const heads = sortRecords(agents.filter((agent) => agent.role === AgentRole.HEAD_MANAGER && agent.managedOfficeId === office.id), 20)
            .map((record) => agentNode(record, workload));
        const departments = sortRecords(this.repositories.departments.listByOffice(office.id), 30)
            .map((record) => ({ kind: 'department', record }));
        const children = [...heads, ...departments];
        return children.length ? children : [emptyNode(getMessage('organization.office.empty'))];
    }

    _departmentChildren(department) {
        const agents = this.repositories.agents.list();
        const office = this.repositories.offices.getById(department.officeId);
        const workload = createWorkloadCounts(this.repositories.tasks.list(), office?.organizationId,
            this.repositories.projects.list(), this.repositories.objectives.list());
        const managers = sortRecords(agents.filter((agent) => agent.role === AgentRole.DEPT_MANAGER
            && agent.managedDepartmentId === department.id), 10).map((record) => agentNode(record, workload));
        const employees = sortRecords(this.repositories.agents.listByDepartment(department.id)
            .filter((agent) => agent.role === AgentRole.EMPLOYEE), 20).map((record) => agentNode(record, workload));
        const children = [...managers, ...employees];
        return children.length ? children : [emptyNode(getMessage('organization.department.empty'))];
    }
}

function hasChildren(kind) {
    return ['organization', 'office', 'department'].includes(kind);
}

function treeLabel(node) {
    if (node.kind === 'empty') return node.label;
    if (node.kind === 'agent') return node.record.name;
    return node.record.name;
}

function treeAccessibleLabel(node) {
    if (node.kind === 'empty') return node.label;
    const { record } = node;
    if (node.kind === 'agent') {
        const specialization = record.specialization ? ` Specialization: ${record.specialization}.` : '';
        const capabilities = Array.isArray(record.capabilities) && record.capabilities.length
            ? ` Capabilities: ${record.capabilities.join(', ')}.` : '';
        return `${record.role}: ${record.name}. Status: ${record.status}. Workload: ${record.workloadCount} active task(s).${specialization}${capabilities}`;
    }
    if (node.kind === 'organization') return `Organization: ${record.name}.`;
    return `${node.kind === 'office' ? 'Office' : 'Department'}: ${record.name}. Status: ${record.status}.`;
}

function createWorkloadCounts(tasks, organizationId, projects, objectives) {
    const counts = new Map();
    if (typeof organizationId !== 'string' || !organizationId) return counts;
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const objectiveById = new Map(objectives.map((objective) => [objective.id, objective]));
    for (const task of tasks) {
        const project = projectById.get(task.projectId);
        const objective = project && objectiveById.get(project.objectiveId);
        if (task.assigneeId && !TERMINAL_TASK_STATUSES.has(task.status)
            && objective?.organizationId === organizationId) {
            counts.set(task.assigneeId, (counts.get(task.assigneeId) ?? 0) + 1);
        }
    }
    return counts;
}

function agentNode(record, workload) {
    const workloadCount = workload.get(record.id) ?? 0;
    return { kind: 'agent', record: { ...record, workloadCount }, workloadCount };
}

function emptyNode(label) {
    return { kind: 'empty', label };
}

function sortRecords(records, limit) {
    return records.slice().sort((left, right) => {
        const a = typeof left?.name === 'string' ? left.name : '';
        const b = typeof right?.name === 'string' ? right.name : '';
        if (a < b) return -1;
        if (a > b) return 1;
        const leftId = String(left?.id ?? '');
        const rightId = String(right?.id ?? '');
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
    }).slice(0, limit);
}

function normalizeHealthCheck(value, index) {
    const check = value && typeof value === 'object' ? value : {};
    const labels = ['Database', 'Queue', 'AI provider', 'Verification'];
    const statuses = new Set(['HEALTHY', 'DEGRADED', 'READY', 'UNAVAILABLE', 'NOT_RUN', 'FAILED']);
    return Object.freeze({ id: ['database', 'queue', 'provider', 'verification'][index], label: labels[index],
        status: statuses.has(check.status) ? check.status : 'UNAVAILABLE',
        detail: typeof check.detail === 'string' ? check.detail.slice(0, 120) : 'Status unavailable.' });
}

function unavailableHealth() {
    return ['Database', 'Queue', 'AI provider', 'Verification'].map((label) => ({ status: 'UNAVAILABLE', detail: `${label} status unavailable.` }));
}

/** Register views that present existing repository records. */
export function registerStatusTreeViews(context, repositories, readHealth = unavailableHealth) {
    const organization = new OrganizationTreeProvider(repositories);
    const objectives = new ObjectiveStatusTreeProvider(repositories.objectives);
    const tasks = new ActiveTaskTreeProvider(repositories.tasks);
    const health = new HealthStatusTreeProvider(readHealth);
    const disposables = [];
    try {
        disposables.push(organization);
        disposables.push(vscode.window.registerTreeDataProvider(VIEWS.ORGANIZATION, organization));
        disposables.push(objectives);
        disposables.push(vscode.window.registerTreeDataProvider(VIEWS.OBJECTIVES, objectives));
        disposables.push(tasks);
        disposables.push(vscode.window.registerTreeDataProvider(VIEWS.TASKS, tasks));
        disposables.push(health);
        disposables.push(vscode.window.registerTreeDataProvider(VIEWS.HEALTH, health));
        return { disposables, refresh: () => { organization.refresh(); objectives.refresh(); tasks.refresh(); health.refresh(); } };
    } catch (error) {
        for (const disposable of disposables.reverse()) {
            try { disposable.dispose(); } catch { /* Preserve the registration failure. */ }
        }
        throw error;
    }
}
