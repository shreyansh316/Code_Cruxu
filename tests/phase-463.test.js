/** Phase 463 — director analysis and plan commands extracted from HeadroomContext. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
    analyzeObjective,
    proposePlan,
    reviewPlan,
    answerDirectorQuestion,
    explainSelection,
    reviewSelection,
    resolveObjectiveOrganization,
} from '../src/core/HeadroomDirectorCommands';
import { HeadroomContext } from '../src/core/HeadroomContext';

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

describe('Phase 463 — HeadroomDirectorCommands module exports', () => {
    it('exports all cohesive Director command and resolution handlers', () => {
        expect(typeof analyzeObjective).toBe('function');
        expect(typeof proposePlan).toBe('function');
        expect(typeof reviewPlan).toBe('function');
        expect(typeof answerDirectorQuestion).toBe('function');
        expect(typeof explainSelection).toBe('function');
        expect(typeof reviewSelection).toBe('function');
        expect(typeof resolveObjectiveOrganization).toBe('function');
    });
});

describe('Phase 463 — Director request gating and validation', () => {
    it('blocks analyzeObjective when execution is paused without invoking provider', async () => {
        const createProvider = vi.fn();
        await analyzeObjective({
            executionControl: { status: 'PAUSED' },
            configuration: { aiProvider: 'gemini' },
            createProvider,
        });

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            'Execution is paused. Resume execution before starting a Director request.');
        expect(createProvider).not.toHaveBeenCalled();
    });

    it('blocks proposePlan when execution is cancelled without invoking provider', async () => {
        const createProvider = vi.fn();
        await proposePlan({
            executionControl: { status: 'CANCELLED' },
            configuration: { aiProvider: 'gemini' },
            createProvider,
        });

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            'The Director request was cancelled.');
        expect(createProvider).not.toHaveBeenCalled();
    });

    it('blocks analyzeObjective when AI provider is not gemini', async () => {
        const createProvider = vi.fn();
        await analyzeObjective({
            executionControl: { status: 'ACTIVE' },
            configuration: { aiProvider: 'mock' },
            createProvider,
        });

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            'Director analysis requires Gemini. Select Gemini in HEADROOM settings and configure its credential.');
        expect(createProvider).not.toHaveBeenCalled();
    });

    it('blocks proposePlan when AI provider is missing', async () => {
        const createProvider = vi.fn();
        await proposePlan({
            executionControl: { status: 'ACTIVE' },
            configuration: {},
            createProvider,
        });

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            'Director analysis requires Gemini. Select Gemini in HEADROOM settings and configure its credential.');
        expect(createProvider).not.toHaveBeenCalled();
    });

    it('requires text selection for explainSelection', async () => {
        vi.stubGlobal('vscode', {
            ...vscode,
            window: {
                ...vscode.window,
                activeTextEditor: undefined,
            },
        });

        await explainSelection({ configuration: { aiProvider: 'gemini' } });
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            'Select code first, then run HEADROOM: Explain Selected Code.');
    });

    it('requires text selection for reviewSelection', async () => {
        vi.stubGlobal('vscode', {
            ...vscode,
            window: {
                ...vscode.window,
                activeTextEditor: undefined,
            },
        });

        await reviewSelection({ configuration: { aiProvider: 'gemini' } });
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            'Select code first, then run HEADROOM: Review Selected Code.');
    });

    it('warns on missing plan in reviewPlan', async () => {
        await reviewPlan(null);
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            'HEADROOM: No execution plan was provided for review.');
    });

    it('returns undefined from resolveObjectiveOrganization when objective or database is missing', async () => {
        expect(await resolveObjectiveOrganization(null)).toBeUndefined();
        expect(await resolveObjectiveOrganization({ id: 'test' }, {})).toBeUndefined();
    });
});

describe('Phase 463 — HeadroomContext delegation contracts', () => {
    it('wires context delegation methods to HeadroomDirectorCommands', () => {
        const context = new HeadroomContext({ subscriptions: [] });
        expect(typeof context._analyzeObjective).toBe('function');
        expect(typeof context._proposePlan).toBe('function');
        expect(typeof context._reviewPlan).toBe('function');
        expect(typeof context._answerDirectorQuestion).toBe('function');
        expect(typeof context._explainSelection).toBe('function');
        expect(typeof context._reviewSelection).toBe('function');
    });
});
