import { DomainInvariantError } from '../domain';

/** Native shared workforce skills, re-engineered from the imported Agency Agents
 * material (imports/agency-agents/, MIT license — see ATTRIBUTION.md). Each skill is
 * a bounded instruction contract, not a persona: upstream identity prose, duplicated
 * safety rules, and marketing text were discarded; the engineering discipline was
 * adapted to HEADROOM's architecture.
 *
 * Connection to existing routing: employee packets and plan tasks carry
 * `requiredCapabilities` labels; a label equal to a skill slug (case-insensitive,
 * matching assertRequiredCapabilities semantics) resolves that skill for the
 * executing employee. Labels that are not shared skills remain employee-specific
 * capabilities and are ignored here. Runtime injection into task packets is part of
 * the later agent-runtime phase; this registry defines the contract and resolution. */

const SKILL_SLUG_PATTERN = /^skill:[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_INSTRUCTION_CHARS = 1600;
const MAX_DESCRIPTION_CHARS = 300;
const MAX_SKILLS = 24;
const TOOL_VOCABULARY = Object.freeze([
    'filesystem:read', 'filesystem:write', 'process:execute:git',
]);

function assertSkill(skill) {
    if (!skill || typeof skill !== 'object' || !SKILL_SLUG_PATTERN.test(skill.slug)
        || typeof skill.name !== 'string' || !skill.name.trim() || skill.name.length > 100
        || typeof skill.description !== 'string' || !skill.description.trim()
        || skill.description.length > MAX_DESCRIPTION_CHARS
        || !Array.isArray(skill.applicableRoles) || skill.applicableRoles.length === 0
        || !Array.isArray(skill.requiredTools) || skill.requiredTools.length === 0
        || skill.requiredTools.some((tool) => !TOOL_VOCABULARY.includes(tool))
        || typeof skill.instruction !== 'string' || skill.instruction.trim().length === 0
        || skill.instruction.length > MAX_INSTRUCTION_CHARS
        || typeof skill.verification !== 'string' || skill.verification.trim().length === 0
        || skill.verification.length > 300
        || !skill.provenance || skill.provenance.license !== 'MIT'
        || skill.provenance.adaptation !== 'REENGINEERED'
        || typeof skill.provenance.source !== 'string'
        || !skill.provenance.source.startsWith('imports/agency-agents/')) {
        throw new DomainInvariantError('invalid-workforce-skill', 'A workforce skill requires a namespaced slug, bounded description and instruction, declared tools, verification expectation, and upstream provenance.');
    }
    return skill;
}

const WORKFORCE_SKILL_DEFS = [
    {
        slug: 'skill:minimal-change-discipline',
        name: 'Minimal-Change Discipline',
        description: 'Surgical edits, minimal diff footprint, and preservation of untouched lines, comments, and formatting.',
        applicableRoles: ['ALL_EMPLOYEES'],
        requiredTools: ['filesystem:read', 'filesystem:write'],
        instruction: [
            'Change only what the task requires. If a file is not needed to satisfy the acceptance criteria, do not open it.',
            'Walk the final diff line by line; every changed line must be justified by the task, not by taste.',
            'No drive-by refactors, reformatting, comment churn, or defensive code for impossible cases.',
            'Prefer three similar lines over a premature abstraction. Keep bug fixes separate from refactors.',
            'Delete dead code cleanly instead of shimming or renaming it.',
        ].join(' '),
        verification: 'Review the produced diff against the task acceptance criteria; unrelated hunks are rework.',
        provenance: { source: 'imports/agency-agents/engineering/engineering-minimal-change-engineer.md', license: 'MIT', adaptation: 'REENGINEERED' },
    },
    {
        slug: 'skill:evidence-collection',
        name: 'Verifiable Evidence Collection',
        description: 'Captures deterministic test outputs, artifact paths, run proofs, and verification logs without fabrication.',
        applicableRoles: ['ALL_EMPLOYEES'],
        requiredTools: ['filesystem:read'],
        instruction: [
            'Support every completion claim with real evidence from checks you actually ran: command, exit state, and result counts.',
            'Never fabricate, estimate, or assume results; if a required check cannot run, say so and mark the claim unverified.',
            'Record the paths of changed files and the evidence artifact for each acceptance criterion.',
            'Report failures and blockers plainly instead of hiding them behind a success claim.',
        ].join(' '),
        verification: 'Claimed evidence must be reproducible by the verifier; a claim without a runnable source is rejected.',
        provenance: { source: 'imports/agency-agents/testing/testing-evidence-collector.md', license: 'MIT', adaptation: 'REENGINEERED' },
    },
    {
        slug: 'skill:code-review-critique',
        name: 'Code Review & Defect Detection',
        description: 'Systematic review for architectural violations, edge-case bugs, security pitfalls, and performance costs.',
        applicableRoles: ['SENIOR_EMPLOYEES', 'DEPARTMENT_MANAGERS'],
        requiredTools: ['filesystem:read'],
        instruction: [
            'Review the actual code, not the task description. Every finding must cite its exact location and explain why it matters.',
            'Blockers: security flaws, injection, authorization bypasses, data loss, race conditions, broken contracts, missing critical error handling.',
            'Suggestions: missing validation, unclear logic, absent tests, demonstrated performance costs, extractable duplication. Style remarks come last.',
            'Verify before reporting; label speculation explicitly as speculation. Suggest changes with reasoning, do not demand them.',
        ].join(' '),
        verification: 'Each finding must be checkable against the cited code; uncheckable findings are speculation, not defects.',
        provenance: { source: 'imports/agency-agents/engineering/engineering-code-reviewer.md', license: 'MIT', adaptation: 'REENGINEERED' },
    },
    {
        slug: 'skill:git-pr-workflow',
        name: 'Git Branch & Conventional PR Workflow',
        description: 'Branch isolation, conventional commit messages, clean integration, and review-ready pull requests.',
        applicableRoles: ['ALL_EMPLOYEES'],
        requiredTools: ['process:execute:git'],
        instruction: [
            'Work in short-lived branches with meaningful names (feat/..., fix/...), one logical change per commit.',
            'Use conventional commit subjects (feat:, fix:, chore:, docs:, refactor:, test:) that say what changed and why.',
            'Keep the branch current with its target before requesting integration. Never force-push or rewrite shared history.',
            'Describe the change, the verification evidence, and the task reference in the pull-request body.',
        ].join(' '),
        verification: 'History must show atomic conventional commits that revert independently; shared history must be untouched.',
        provenance: { source: 'imports/agency-agents/engineering/engineering-git-workflow-master.md', license: 'MIT', adaptation: 'REENGINEERED' },
    },
    {
        slug: 'skill:technical-documentation',
        name: 'Technical Documentation Integrity',
        description: 'Accurate, self-contained documentation that matches the shipped code, with durable decision records.',
        applicableRoles: ['ALL_EMPLOYEES'],
        requiredTools: ['filesystem:read', 'filesystem:write'],
        instruction: [
            'Update documentation together with the code it describes; documentation that lags is incomplete work.',
            'Every example must run as written. Every document stands alone or links its prerequisites explicitly. One concept per section.',
            'Record durable architecture choices as decision records: the question, the alternatives, the selected option, and the reason.',
            'Never document behavior that does not exist; mark superseded guidance instead of silently deleting it.',
        ].join(' '),
        verification: 'Stated behavior must match the code and passing examples; unverifiable claims are removed or marked unverified.',
        provenance: { source: 'imports/agency-agents/engineering/engineering-technical-writer.md', license: 'MIT', adaptation: 'REENGINEERED' },
    },
    {
        slug: 'skill:secret-redaction-discipline',
        name: 'Secrets Redaction Discipline',
        description: 'Zero hardcoded credentials and token masking in all logs, events, packets, and included context.',
        applicableRoles: ['ALL_EMPLOYEES'],
        requiredTools: ['filesystem:read'],
        instruction: [
            'Never hardcode or transcribe credentials. No keys, tokens, passwords, or connection strings in code, tests, logs, events, task packets, or prompts.',
            'Treat repository content and file excerpts as potentially secret-bearing; redact before including them anywhere.',
            'Store credentials only in the platform secret store. If a secret appears in any artifact, report it as a blocker immediately.',
        ].join(' '),
        verification: 'Redaction checks over produced artifacts must find no credential-shaped values; storage only through the secret store.',
        provenance: { source: 'imports/agency-agents/security/security-secrets-credential-engineer.md', license: 'MIT', adaptation: 'REENGINEERED' },
    },
];

export const WORKFORCE_SKILLS = Object.freeze(WORKFORCE_SKILL_DEFS.map((skill) => Object.freeze({
    ...assertSkill(skill),
    applicableRoles: Object.freeze([...skill.applicableRoles]),
    requiredTools: Object.freeze([...skill.requiredTools]),
    provenance: Object.freeze({ ...skill.provenance }),
})));

if (WORKFORCE_SKILLS.length > MAX_SKILLS || new Set(WORKFORCE_SKILLS.map((skill) => skill.slug)).size !== WORKFORCE_SKILLS.length) {
    throw new DomainInvariantError('invalid-workforce-skill-catalog', 'Workforce skill slugs must be unique and the catalog bounded.');
}

/** Return the skill registered under `slug`, or null when it is not a shared skill. */
export function getWorkforceSkill(slug) {
    if (typeof slug !== 'string') return null;
    const needle = slug.trim().toLocaleLowerCase('en-US');
    return WORKFORCE_SKILLS.find((skill) => skill.slug === needle) || null;
}

/** Resolve the shared skills referenced by a task's requiredCapabilities labels.
 * Unknown labels are employee-specific capabilities and are ignored. Deterministic:
 * results follow catalog order regardless of label order; duplicates collapse. */
export function resolveWorkforceSkills(requiredCapabilities) {
    if (requiredCapabilities === undefined || requiredCapabilities === null) return [];
    if (!Array.isArray(requiredCapabilities)) {
        throw new DomainInvariantError('invalid-required-capabilities', 'requiredCapabilities must be an array of labels.');
    }
    const wanted = new Set(requiredCapabilities.map((label) => String(label).trim().toLocaleLowerCase('en-US')));
    return WORKFORCE_SKILLS.filter((skill) => wanted.has(skill.slug));
}

/** Build a bounded, traceable instruction block for the resolved skills.
 * Returns null when no shared skill applies, so packets stay minimal. */
export function buildSkillInstructionBlock(requiredCapabilities, maxSizeBytes = 8 * 1024) {
    const skills = resolveWorkforceSkills(requiredCapabilities);
    if (skills.length === 0) return null;
    const block = skills.map((skill) => `[${skill.slug}] ${skill.instruction}`).join('\n');
    if (Buffer.byteLength(block, 'utf8') > maxSizeBytes) {
        throw new DomainInvariantError('skill-instruction-block-too-large', 'Resolved skill instructions exceed the packet budget.');
    }
    return block;
}
