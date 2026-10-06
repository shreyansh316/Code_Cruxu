import * as vscode from 'vscode';
import { CODE_EXPLANATION_ACTIONS } from '../domain';

const ACTION_LABELS = Object.freeze({
    WHY_THIS: 'Why this?',
    WHY_NOT_THAT: 'Why not that?',
    EXPLAIN_FILE: 'Explain this selection',
    EXPLAIN_CHANGE: 'Explain this change',
    SHOW_ALTERNATIVES: 'Show alternatives',
    CHALLENGE: 'Challenge this implementation',
    FIND_WEAKNESSES: 'Find weaknesses',
    SIMPLIFY: 'Make it simpler',
    REVIEW_SECURITY: 'Review security',
    REVIEW_PERFORMANCE: 'Review performance',
    REVIEW_TOKEN_COST: 'Review token cost',
    FIX: 'Suggest a fix',
});

const ACTION_ITEMS = Object.freeze(CODE_EXPLANATION_ACTIONS.map((action) => Object.freeze({
    label: ACTION_LABELS[action], action,
})));

/** Let users select one supported explainability intent before selected code is sent. */
export async function chooseCodeExplanationAction() {
    const selected = await vscode.window.showQuickPick(ACTION_ITEMS, {
        title: 'Choose an evidence-backed code explanation action', ignoreFocusOut: true,
    });
    return ACTION_ITEMS.find((item) => item.action === selected?.action)?.action;
}
