import { createEntityId, DomainInvariantError, validateTaskAcceptanceCriteria, validateTaskResult } from '../domain';
import { redactSecrets } from '../shared/redactSecrets';

const MAX_PACKET_BYTES = 64_000;
const MAX_ITEMS = 100;
const MAX_TEXT = 10_000;

/** Create a bounded, immutable employee packet without forwarding arbitrary caller context. */
export function createEmployeeTaskPacket({ task, relevantContext = [], dependencies = [] } = {}) {
    if (!task || typeof task !== 'object' || !Array.isArray(task.acceptanceCriteria)
        || !Array.isArray(relevantContext) || relevantContext.length > MAX_ITEMS
        || !Array.isArray(dependencies) || dependencies.length > MAX_ITEMS) invalid();
    const id = entityId(task.id);
    if (typeof task.title !== 'string' || !task.title.trim() || task.title.length > MAX_TEXT
        || typeof task.description !== 'string' || !task.description.trim() || task.description.length > MAX_TEXT) invalid();
    validateTaskAcceptanceCriteria(task.acceptanceCriteria);
    const packet = {
        taskId: id, objective: task.title.trim(), requirements: task.description.trim(),
        relevantContext: relevantContext.map((item) => boundedText(item, 'Relevant context')),
        dependencies: dependencies.map((item) => entityId(item)),
        acceptanceCriteria: task.acceptanceCriteria.map((item) => ({ ...item })),
        output: { status: 'PENDING', result: null, files: [], tests: [], blockers: [] },
    };
    if (new TextEncoder().encode(JSON.stringify(packet)).byteLength > MAX_PACKET_BYTES) invalid();
    for (const criterion of packet.acceptanceCriteria) Object.freeze(criterion);
    Object.freeze(packet.acceptanceCriteria);
    Object.freeze(packet.relevantContext);
    Object.freeze(packet.dependencies);
    for (const collection of ['files', 'tests', 'blockers']) Object.freeze(packet.output[collection]);
    Object.freeze(packet.output);
    return Object.freeze(packet);
}

/** Validate a completed employee response, including claims that can be verified later. */
export function validateEmployeeTaskResult(value, criteria) {
    if (!plainObject(value) || !['SUCCEEDED', 'BLOCKED', 'FAILED'].includes(value.status)
        || !Array.isArray(value.files) || value.files.length > MAX_ITEMS
        || !Array.isArray(value.tests) || value.tests.length > MAX_ITEMS
        || !Array.isArray(value.blockers) || value.blockers.length > MAX_ITEMS) invalid();
    const result = validateTaskResult(value.result, criteria).result;
    const files = value.files.map((file) => boundedText(file, 'File reference'));
    const tests = value.tests.map((test) => boundedText(test, 'Test evidence'));
    const blockers = value.blockers.map((blocker) => boundedText(blocker, 'Blocker'));
    if (value.status === 'SUCCEEDED' && blockers.length) invalid();
    if (value.status === 'BLOCKED' && blockers.length === 0) invalid();
    const response = { status: value.status, result, files, tests, blockers };
    if (new TextEncoder().encode(JSON.stringify(response)).byteLength > MAX_PACKET_BYTES) invalid();
    for (const list of [files, tests, blockers]) Object.freeze(list);
    return Object.freeze(response);
}

function boundedText(value, label) {
    if (typeof value !== 'string' || !value.trim() || value.length > 2_000) {
        throw new DomainInvariantError('invalid-employee-contract', `${label} must be non-empty bounded text.`);
    }
    return redactSecrets(value.trim(), 2_000);
}
function entityId(value) {
    try { return createEntityId(value); }
    catch { invalid(); }
}
function plainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function invalid() {
    throw new DomainInvariantError('invalid-employee-contract', 'Employee task packet or result is malformed or exceeds its bounds.');
}
