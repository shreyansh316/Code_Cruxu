const contracts = {
    'director.objective-analysis.v1': {
        systemPrompt: [
            'You are HEADROOM AI Director. Analyze the CEO objective only for ambiguity that blocks safe, useful planning.',
            'Propose concise clarification questions not already present in priorQuestions. Do not repeat or rephrase existing questions.',
            'Do not answer for the CEO, approve the objective, create a plan, or claim work is approved.',
            'Use the supplied schema. If no blocking ambiguity exists, return an empty questions array.',
        ].join(' '),
        outputSchema: { type: 'object', additionalProperties: false, required: ['questions'], properties: {
            questions: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false,
                required: ['question', 'category', 'rationale'], properties: {
                    question: { type: 'string', minLength: 1, maxLength: 2000 },
                    category: { type: 'string', minLength: 1, maxLength: 100 },
                    rationale: { type: 'string', minLength: 1, maxLength: 1000 },
                } } },
        } },
    },
    'director.plan-proposal.v1': {
        systemPrompt: 'You are HEADROOM AI Director. Propose a concise project plan from the CEO objective and answered clarifications. Return only the requested structure. Do not approve, activate, or claim authorization for the plan. Every task needs concrete acceptance criteria. When a task requires a specific employee skill, list concise requiredCapabilities labels; omit the field when no special capability is required. Dependencies must reference earlier task indexes and form a DAG.',
        outputSchema: { type: 'object', required: ['projects', 'milestones', 'tasks', 'dependencies'], additionalProperties: false,
            properties: {
                projects: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } },
                milestones: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'object', required: ['projectIndex', 'title'], properties: { projectIndex: { type: 'integer' }, title: { type: 'string' } } } },
                tasks: { type: 'array', minItems: 1, maxItems: 80, items: { type: 'object', required: ['projectIndex', 'milestoneIndex', 'title', 'acceptanceCriteria'], properties: {
                    projectIndex: { type: 'integer' }, milestoneIndex: { type: 'integer' }, title: { type: 'string' },
                    acceptanceCriteria: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'string' } },
                    requiredCapabilities: { type: 'array', maxItems: 32, items: { type: 'string', minLength: 1, maxLength: 100 } },
                } } },
                dependencies: { type: 'array', maxItems: 200, items: { type: 'object', required: ['dependentTaskIndex', 'dependencyTaskIndex'], properties: {
                    dependentTaskIndex: { type: 'integer' }, dependencyTaskIndex: { type: 'integer' },
                } } },
            } },
    },
    'department.task-decomposition.v1': {
        systemPrompt: 'You are a HEADROOM Department Manager. Decompose each routed task into practical subtasks, assign each subtask to an available employee index, and specify concrete acceptance criteria. Carry every source task requiredCapabilities label into its subtasks, and add any other specific employee capabilities each subtask requires. Work only within this department packet. Do not contact employees or other managers, create cross-department work, approve plans, or claim execution. Return only the requested JSON structure.',
        outputSchema: { type: 'object', additionalProperties: false, required: ['subtasks', 'dependencies'], properties: {
            subtasks: { type: 'array', minItems: 1, maxItems: 80, items: { type: 'object', additionalProperties: false,
                required: ['parentTaskIndex', 'title', 'description', 'acceptanceCriteria', 'employeeIndex'], properties: {
                    parentTaskIndex: { type: 'integer' }, title: { type: 'string' }, description: { type: 'string' },
                    acceptanceCriteria: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string' } }, employeeIndex: { type: 'integer' },
                    requiredCapabilities: { type: 'array', maxItems: 32, items: { type: 'string', minLength: 1, maxLength: 100 } },
                } } },
            dependencies: { type: 'array', maxItems: 200, items: { type: 'object', additionalProperties: false,
                required: ['dependentSubtaskIndex', 'dependencySubtaskIndex'], properties: {
                    dependentSubtaskIndex: { type: 'integer' }, dependencySubtaskIndex: { type: 'integer' },
                } } },
        } },
    },
};

deepFreeze(contracts);

/** Return a stable versioned prompt/schema contract; unknown versions fail closed. */
export function getPromptContract(id) {
    if (typeof id !== 'string' || !Object.hasOwn(contracts, id)) throw new TypeError('Unknown HEADROOM prompt contract version.');
    return contracts[id];
}

export function listPromptContractIds() { return Object.freeze(Object.keys(contracts).sort()); }

function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) deepFreeze(child);
        Object.freeze(value);
    }
    return value;
}
