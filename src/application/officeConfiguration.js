import { OFFICE_CATALOG } from '../constants';
import { createEntityId, DomainInvariantError } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

const OFFICE_BY_SLUG = new Map(OFFICE_CATALOG.map((office) => [office.slug, office]));

/** Persist only explicitly selected offices from the supported HEADROOM office catalog. */
export function createOfficeConfigurationUseCase({ organizationRepository, officeRepository, unitOfWork, idFactory } = {}) {
    if (typeof organizationRepository?.getById !== 'function' || typeof officeRepository?.listByOrganization !== 'function'
        || typeof officeRepository?.getBySlug !== 'function' || typeof officeRepository?.create !== 'function'
        || typeof unitOfWork?.run !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Office configuration requires organization and office repositories, a transaction, and an ID factory.');
    }
    return createUseCase({ name: 'office-configuration',
        dependencies: { organizationRepository, officeRepository, unitOfWork, idFactory },
        execute: ({ input, dependencies }) => {
            const organizationId = requireId(input?.organizationId);
            if (!dependencies.organizationRepository.getById(organizationId)) {
                throw new ApplicationError('organization-not-found', 'The office configuration organization does not exist.');
            }
            const slugs = input?.officeSlugs;
            if (!Array.isArray(slugs) || slugs.length > OFFICE_CATALOG.length
                || slugs.some((slug) => typeof slug !== 'string' || !OFFICE_BY_SLUG.has(slug))
                || new Set(slugs).size !== slugs.length) {
                throw new DomainInvariantError('invalid-office-configuration',
                    'Office configuration must contain unique slugs from the supported office catalog.');
            }
            return dependencies.unitOfWork.run(() => {
                const configured = dependencies.officeRepository.listByOrganization(organizationId);
                const configuredSlugs = new Set(configured.map(({ slug }) => slug));
                const newOffices = slugs.filter((slug) => !configuredSlugs.has(slug));
                for (const slug of newOffices) {
                    const existing = dependencies.officeRepository.getBySlug(slug);
                    if (existing && existing.organizationId !== organizationId) {
                        throw new ApplicationError('office-configuration-conflict',
                            'A configured office slug is already owned by another organization.');
                    }
                }
                for (const slug of newOffices) {
                    const definition = OFFICE_BY_SLUG.get(slug);
                    dependencies.officeRepository.create({ id: createEntityId(dependencies.idFactory()),
                        organizationId, name: definition.name, slug, status: 'ACTIVE' });
                }
                return Object.freeze({ organizationId,
                    offices: Object.freeze(dependencies.officeRepository.listByOrganization(organizationId)) });
            });
        },
    });
}

function requireId(value) {
    try { return createEntityId(value); }
    catch { throw new DomainInvariantError('invalid-office-configuration', 'A valid organization identifier is required.'); }
}
