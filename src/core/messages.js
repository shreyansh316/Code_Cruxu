export const ENGLISH_MESSAGES = Object.freeze({
    'settings.invalid': 'HEADROOM is using defaults for {count} invalid setting(s). See the Extension Host log for details.',
    'welcome.message': 'HEADROOM is active. Open the CEO Dashboard to get started.',
    'welcome.openDashboard': 'Open Dashboard',
    'dashboard.placeholder': 'HEADROOM: CEO Dashboard — Phase 015',
    'execution.paused': 'HEADROOM: Execution paused.',
    'execution.alreadyPaused': 'HEADROOM: Execution is already paused.',
    'execution.resumed': 'HEADROOM: Execution resumed.',
    'execution.alreadyRunning': 'HEADROOM: Execution is already running.',
    'statusBar.name': 'HEADROOM Status',
    'statusBar.text': '$(circuit-board) HEADROOM',
    'statusBar.tooltip': 'HEADROOM AI CEO Office — Click to open dashboard',
    'status.active': 'Active — Execution {state}.',
    'status.inactive': 'Not initialized.',
    'status.message': 'HEADROOM Status: {status}',
    'objective.title': 'HEADROOM — New CEO Objective',
    'objective.title.prompt': 'Enter a concise objective title.',
    'objective.title.placeholder': 'Objective title',
    'objective.title.invalid': 'Title must contain 1 to 200 characters.',
    'objective.description.title': 'HEADROOM — Objective Details',
    'objective.description.prompt': 'Describe the outcome and constraints.',
    'objective.description.placeholder': 'Objective description',
    'objective.description.invalid': 'Description must contain 1 to 10000 characters.',
    'objective.create.failed': 'HEADROOM could not create the objective: {error}',
    'objective.created': 'HEADROOM objective created and saved.',
    'credential.prompt': 'Enter the {provider} API credential. It will be stored in VS Code SecretStorage.',
    'credential.invalid': 'Enter a non-empty, single-line credential of at most 4096 characters.',
    'credential.stored': 'HEADROOM: {provider} credential stored securely.',
    'credential.storeFailed': 'HEADROOM could not store the {provider} credential in VS Code SecretStorage.',
    'credential.removed': 'HEADROOM: {provider} credential removed.',
    'credential.removeFailed': 'HEADROOM could not remove the {provider} credential from VS Code SecretStorage.',
    'credential.select': 'Select provider credential',
    'credential.gemini.description': 'Google AI provider',
    'credential.openai.description': 'OpenAI provider',
    'review.bundle.missing': 'HEADROOM: No matching review evidence bundle was provided.',
    'review.bundle.tooLarge': 'HEADROOM: Review evidence exceeds the display limit.',
    'review.ceo.missing': 'HEADROOM: Review requires exactly one persisted CEO identity.',
    'review.task.missing': 'HEADROOM: The reviewed task no longer exists.',
    'review.task.title': 'HEADROOM — Review {title}',
    'review.decision.placeholder': 'Choose a review decision. Closing this picker records nothing.',
    'review.approveChanges': 'Approve Changes',
    'review.approveChanges.description': 'Record approval for this exact evidence bundle.',
    'review.requestChanges': 'Request Changes',
    'review.requestChanges.description': 'Record that these changes need more work.',
    'review.recordFailed': 'HEADROOM could not record the review: {error}',
    'review.recorded': 'HEADROOM: {decision} recorded for this evidence bundle.',
    'plan.missing': 'HEADROOM: No execution plan was provided for review.',
    'plan.tooLarge': 'HEADROOM: Execution plan exceeds the review display limit.',
    'plan.ceo.missing': 'HEADROOM: Plan approval requires exactly one persisted CEO identity.',
    'plan.title': 'HEADROOM — Review Execution Plan',
    'plan.decision.placeholder': 'Choose a plan decision. Closing this picker records nothing.',
    'plan.approve': 'Approve Plan',
    'plan.approve.description': 'Authorize this plan for execution.',
    'plan.reject': 'Reject Plan',
    'plan.reject.description': 'Reject this plan and prevent execution.',
    'plan.recordFailed': 'HEADROOM could not record the plan decision: {error}',
    'plan.recorded': 'HEADROOM: Plan {decision} and saved to the audit log.',
    'objectives.empty': 'No objectives yet.',
    'objectives.empty.accessible': 'No objectives yet. Use the Command Palette and run HEADROOM: New Objective to add one.',
    'tasks.empty': 'No active tasks.',
    'tasks.empty.accessible': 'No active tasks.',
});

const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;

/** Resolve one catalog key without tying application behavior to its display text. */
export function getMessage(key, parameters = {}, catalog = ENGLISH_MESSAGES) {
    const template = catalog?.[key];
    if (typeof template !== 'string') throw new TypeError(`Unknown HEADROOM message key: ${String(key)}.`);
    return template.replace(PLACEHOLDER, (placeholder, name) => {
        if (!Object.hasOwn(parameters, name)) throw new TypeError(`Missing message parameter: ${name}.`);
        return String(parameters[name]);
    });
}
