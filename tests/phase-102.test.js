import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentRole } from '../src/constants';
import { OrganizationTreeProvider } from '../src/core/StatusTreeProviders';
import { AgentRepository, DepartmentRepository, ObjectiveRepository, OfficeRepository, OrganizationRepository,
    ProjectRepository, SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 102 — persisted organization navigation', () => {
    let connection;
    let repositories;
    let provider;

    beforeEach(() => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        repositories = {
            organizations: new OrganizationRepository(database),
            offices: new OfficeRepository(database),
            departments: new DepartmentRepository(database),
            agents: new AgentRepository(database),
            tasks: new TaskRepository(database),
            projects: new ProjectRepository(database),
            objectives: new ObjectiveRepository(database),
        };
        provider = new OrganizationTreeProvider(repositories);
    });

    afterEach(() => connection.close());

    it('navigates persisted organizations, offices, departments, and role-linked people without crossing organizations', () => {
        repositories.organizations.create({ id: 'org-102-a', name: 'Product Studio' });
        repositories.organizations.create({ id: 'org-102-b', name: 'Research Studio' });
        repositories.offices.create({ id: 'office-102-a', organizationId: 'org-102-a', name: 'App Office',
            slug: 'app-office-102', description: '', status: 'ACTIVE' });
        repositories.offices.create({ id: 'office-102-b', organizationId: 'org-102-b', name: 'Research Office',
            slug: 'research-office-102', description: '', status: 'PAUSED' });
        repositories.departments.create({ id: 'department-102-a', officeId: 'office-102-a', name: 'Mobile',
            slug: 'mobile-102', description: '', status: 'ACTIVE' });
        repositories.departments.create({ id: 'department-102-b', officeId: 'office-102-b', name: 'Lab',
            slug: 'lab-102', description: '', status: 'ACTIVE' });
        repositories.agents.create({ id: 'head-102-a', name: 'App Office Head', role: AgentRole.HEAD_MANAGER,
            managedOfficeId: 'office-102-a', status: 'IDLE' });
        repositories.agents.create({ id: 'manager-102-a', name: 'Mobile Manager', role: AgentRole.DEPT_MANAGER,
            managedDepartmentId: 'department-102-a', status: 'BUSY' });
        repositories.agents.create({ id: 'employee-102-a', name: 'Mobile Engineer', role: AgentRole.EMPLOYEE,
            departmentId: 'department-102-a', specialization: 'Android', status: 'IDLE', capabilities: ['Android', 'Testing'] });
        repositories.agents.create({ id: 'employee-102-b', name: 'Researcher', role: AgentRole.EMPLOYEE,
            departmentId: 'department-102-b', specialization: 'Data', status: 'IDLE' });
        repositories.objectives.create({ id: 'objective-102-a', organizationId: 'org-102-a', title: 'App', description: 'App work' });
        repositories.objectives.create({ id: 'objective-102-b', organizationId: 'org-102-b', title: 'Research', description: 'Research work' });
        repositories.projects.create({ id: 'project-102-a', objectiveId: 'objective-102-a', name: 'App project' });
        repositories.projects.create({ id: 'project-102-b', objectiveId: 'objective-102-b', name: 'Research project' });
        repositories.tasks.create({ id: 'task-102-active', taskCode: 'PH102-001', title: 'Build app',
            status: 'ASSIGNED', projectId: 'project-102-a', assigneeId: 'employee-102-a' });
        repositories.tasks.create({ id: 'task-102-review', taskCode: 'PH102-002', title: 'Review app',
            status: 'REVIEW', projectId: 'project-102-a', assigneeId: 'employee-102-a' });
        repositories.tasks.create({ id: 'task-102-done', taskCode: 'PH102-003', title: 'Old work',
            status: 'COMPLETED', projectId: 'project-102-a', assigneeId: 'employee-102-a' });
        repositories.tasks.create({ id: 'task-102-foreign', taskCode: 'PH102-004', title: 'Foreign work',
            status: 'ASSIGNED', projectId: 'project-102-b', assigneeId: 'employee-102-a' });

        const organizations = provider.getChildren();
        const product = organizations.find(({ record }) => record.id === 'org-102-a');
        const offices = provider.getChildren(product);
        const appOffice = offices.find(({ record }) => record.id === 'office-102-a');
        const officeChildren = provider.getChildren(appOffice);
        const department = officeChildren.find(({ record }) => record.id === 'department-102-a');
        const departmentPeople = provider.getChildren(department);

        expect(organizations.map(({ record }) => record.name)).toEqual(['Product Studio', 'Research Studio']);
        expect(offices.map(({ record }) => record.id)).toEqual(['office-102-a']);
        expect(officeChildren.map(({ record }) => record.id)).toEqual(['head-102-a', 'department-102-a']);
        expect(departmentPeople.map(({ record }) => record.id)).toEqual(['manager-102-a', 'employee-102-a']);
        expect(departmentPeople.map((node) => provider.getTreeItem(node).label)).toEqual(['Mobile Manager', 'Mobile Engineer']);
        expect(provider.getTreeItem(departmentPeople[1]).accessibilityInformation.label)
            .toBe('EMPLOYEE: Mobile Engineer. Status: IDLE. Workload: 2 active task(s). Specialization: Android. Capabilities: Android, Testing.');
        expect(provider.getTreeItem(departmentPeople[1]).description).toBe('IDLE · 2 active task(s)');
    });

    it('shows an explicit empty state when no organization is configured', () => {
        const [empty] = provider.getChildren();
        expect(empty).toMatchObject({ kind: 'empty', label: 'No organization configured.' });
        expect(provider.getTreeItem(empty)).toMatchObject({ label: 'No organization configured.', collapsibleState: 0 });
        expect(provider.getChildren(empty)).toEqual([]);
    });

    it('keeps the empty offices message scoped to the selected organization', () => {
        repositories.organizations.create({ id: 'org-102-empty', name: 'Empty Studio' });
        const [organization] = provider.getChildren();
        const [empty] = provider.getChildren(organization);
        expect(empty.label).toBe('No offices configured for this organization.');
    });
});
