import { getDepartmentPositions } from '../domain/positionCatalog';
import { ApplicationError } from './useCase';

/** Build one department's workforce configuration input from the native position
 * catalog, so office/department setup can be driven by the re-engineered blueprint
 * positions instead of hand-invented rosters. Employee display names come from the
 * catalog position titles; specializations and capability labels come from the
 * catalog itself. Department display name and manager name remain caller decisions;
 * capability labels stay open for extension while guaranteeing the catalog baseline. */
export function buildDepartmentWorkforceConfig({ officeSlug, departmentSlug, departmentName, managerName } = {}) {
    if (typeof departmentSlug !== 'string' || !departmentSlug.trim()
        || typeof managerName !== 'string' || !managerName.trim()
        || (departmentName !== undefined && (typeof departmentName !== 'string' || !departmentName.trim()))) {
        throw new ApplicationError('invalid-department-config-input', 'A department slug, manager name, and optional department display name are required.');
    }
    let positions;
    try {
        positions = getDepartmentPositions(officeSlug, departmentSlug.trim());
    } catch {
        throw new ApplicationError('department-not-in-catalog', `The position catalog has no department ${departmentSlug} under office ${officeSlug}.`);
    }
    return Object.freeze({
        name: (departmentName ?? departmentSlug.trim()).trim(),
        slug: departmentSlug.trim(),
        managerName: managerName.trim(),
        employees: Object.freeze(positions.map((entry) => Object.freeze({
            name: entry.position,
            specialization: entry.name,
            capabilities: Object.freeze([...entry.capabilities]),
        }))),
    });
}
