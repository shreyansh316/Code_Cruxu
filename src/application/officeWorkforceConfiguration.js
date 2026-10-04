import { AgentRole, OFFICE_CATALOG } from '../constants';
import { assertOrganizationHierarchyInvariant, createEntityId, DomainInvariantError, validateDepartmentWorkforce } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

/** Configure department managers and the fixed four-person workforce in every enabled office. */
export function createOfficeWorkforceConfigurationUseCase({ organizationRepository, officeRepository,
    departmentRepository, agentRepository, unitOfWork, idFactory } = {}) {
    if (typeof organizationRepository?.getById !== 'function'
        || typeof officeRepository?.listByOrganization !== 'function'
        || typeof departmentRepository?.listByOffice !== 'function' || typeof departmentRepository?.create !== 'function'
        || typeof agentRepository?.list !== 'function' || typeof agentRepository?.create !== 'function'
        || typeof unitOfWork?.run !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Office workforce configuration requires organization, office, department, agent, transaction, and ID dependencies.');
    }
    return createUseCase({ name: 'office-workforce-configuration',
        dependencies: { organizationRepository, officeRepository, departmentRepository, agentRepository, unitOfWork, idFactory },
        execute: ({ input, dependencies }) => {
            const organizationId = requiredId(input?.organizationId);
            const organization = dependencies.organizationRepository.getById(organizationId);
            if (!organization) throw new ApplicationError('organization-not-found', 'The workforce configuration organization does not exist.');
            const offices = dependencies.officeRepository.listByOrganization(organizationId);
            validateConfiguration(input?.offices, offices);
            return dependencies.unitOfWork.run(() => {
                const departments = offices.flatMap((office) => dependencies.departmentRepository.listByOffice(office.id));
                const officeIds = new Set(offices.map(({ id }) => id));
                const departmentIds = new Set(departments.map(({ id }) => id));
                // AgentRepository is global; construct this organization's hierarchy slice only.
                const agents = dependencies.agentRepository.list().filter((agent) =>
                    (agent.role === AgentRole.HEAD_MANAGER && officeIds.has(agent.managedOfficeId))
                    || (agent.role === AgentRole.DEPT_MANAGER && departmentIds.has(agent.managedDepartmentId))
                    || (agent.role === AgentRole.EMPLOYEE && departmentIds.has(agent.departmentId))
                    || [AgentRole.CEO, AgentRole.DIRECTOR].includes(agent.role));
                const hierarchy = { organization, offices, departments, agents };
                assertOrganizationHierarchyInvariant(hierarchy);
                const bySlug = new Map(input.offices.map((configuration) => [configuration.officeSlug, configuration]));
                const managerByOffice = new Map();
                for (const office of offices) {
                    const config = bySlug.get(office.slug);
                    const head = agents.filter((agent) => agent.role === AgentRole.HEAD_MANAGER && agent.managedOfficeId === office.id);
                    if (head.length !== 1 || ['OFFLINE', 'ERROR'].includes(head[0].status)) {
                        throw new ApplicationError('office-head-manager-unavailable',
                            `Enabled office ${office.slug} must have exactly one available Office Head Manager.`);
                    }
                    if (dependencies.departmentRepository.listByOffice(office.id).length) {
                        throw new ApplicationError('office-workforce-already-configured',
                            `Office ${office.slug} already has departments; workforce configuration will not overwrite it.`);
                    }
                    for (const departmentConfig of config.departments) {
                        const departmentId = newEntityId(dependencies.idFactory);
                        const department = dependencies.departmentRepository.create({ id: departmentId, officeId: office.id,
                            name: departmentConfig.name.trim(), slug: departmentConfig.slug.trim(), status: 'ACTIVE' });
                        const manager = dependencies.agentRepository.create({ id: newEntityId(dependencies.idFactory),
                            name: departmentConfig.managerName.trim(), role: AgentRole.DEPT_MANAGER,
                            managedDepartmentId: departmentId, status: 'IDLE' });
                        const employeeInputs = departmentConfig.employees.map((employee) => ({
                            id: newEntityId(dependencies.idFactory), name: employee.name.trim(), role: AgentRole.EMPLOYEE,
                            departmentId, specialization: employee.specialization.trim(), status: 'IDLE',
                        }));
                        const workforce = validateDepartmentWorkforce(departmentId, employeeInputs);
                        for (const employee of workforce) dependencies.agentRepository.create(employee);
                        managerByOffice.set(office.id, [...(managerByOffice.get(office.id) ?? []), manager]);
                        departments.push(department);
                        agents.push(manager, ...workforce);
                    }
                }
                assertOrganizationHierarchyInvariant({ organization, offices, departments, agents });
                return Object.freeze({ organizationId, offices: Object.freeze(offices.map((office) => Object.freeze({
                    officeId: office.id, officeSlug: office.slug,
                    departments: Object.freeze(dependencies.departmentRepository.listByOffice(office.id).map((department) => Object.freeze({
                        ...department,
                        manager: Object.freeze(managerByOffice.get(office.id).find(({ managedDepartmentId }) => managedDepartmentId === department.id)),
                        employees: Object.freeze(dependencies.agentRepository.listByDepartment(department.id)),
                    }))),
                }))) });
            });
        },
    });
}

function validateConfiguration(configurations, enabledOffices) {
    if (!Array.isArray(configurations) || configurations.length !== enabledOffices.length
        || new Set(configurations.map((item) => item?.officeSlug)).size !== configurations.length
        || configurations.some((item) => !enabledOffices.some(({ slug }) => slug === item?.officeSlug)
            || !Array.isArray(item.departments) || !item.departments.length || item.departments.length > 20)) {
        throw new DomainInvariantError('invalid-office-workforce-configuration',
            'Provide a department configuration for every enabled office, with 1–20 departments each.');
    }
    const catalogSlugs = new Set(OFFICE_CATALOG.map(({ slug }) => slug));
    for (const officeConfig of configurations) {
        if (!catalogSlugs.has(officeConfig.officeSlug)) invalidConfiguration();
        const departmentSlugs = new Set();
        for (const department of officeConfig.departments) {
            if (!department || typeof department.name !== 'string' || !department.name.trim() || department.name.length > 100
                || typeof department.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(department.slug)
                || departmentSlugs.has(department.slug) || typeof department.managerName !== 'string'
                || !department.managerName.trim() || department.managerName.length > 100
                || !Array.isArray(department.employees) || department.employees.length !== 4
                || department.employees.some((employee) => !employee || typeof employee.name !== 'string'
                    || !employee.name.trim() || employee.name.length > 100 || typeof employee.specialization !== 'string'
                    || !employee.specialization.trim() || employee.specialization.length > 100)
                || new Set(department.employees.map(({ specialization }) => specialization.trim().toLowerCase())).size !== 4) invalidConfiguration();
            departmentSlugs.add(department.slug);
        }
    }
}
function newEntityId(idFactory) {
    try { return createEntityId(idFactory()); }
    catch { throw new DomainInvariantError('invalid-office-workforce-configuration', 'The workforce ID factory returned an invalid identifier.'); }
}
function requiredId(value) {
    try { return createEntityId(value); }
    catch { throw new DomainInvariantError('invalid-office-workforce-configuration', 'A valid organization identifier is required.'); }
}
function invalidConfiguration() {
    throw new DomainInvariantError('invalid-office-workforce-configuration',
        'Each department requires a unique slug, a manager, and exactly four named, specialized employees.');
}
