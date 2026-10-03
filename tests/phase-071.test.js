import { describe, expect, it } from 'vitest';
import { getPromptContract, listPromptContractIds } from '../src/application/promptRegistry';

describe('Phase 071 — AI prompt/version registry', () => {
    it('provides stable versioned contracts for existing reasoning tasks', () => {
        expect(listPromptContractIds()).toEqual([
            'department.task-decomposition.v1', 'director.objective-analysis.v1', 'director.plan-proposal.v1',
        ]);
        for (const id of listPromptContractIds()) {
            const contract = getPromptContract(id);
            expect(contract.systemPrompt.length).toBeGreaterThan(0);
            expect(contract.outputSchema).toMatchObject({ type: 'object' });
            expect(Object.isFrozen(contract)).toBe(true);
            expect(Object.isFrozen(contract.outputSchema)).toBe(true);
        }
    });

    it('fails closed for unknown or malformed versions and prevents schema mutation', () => {
        const contract = getPromptContract('director.objective-analysis.v1');
        expect(() => getPromptContract('director.objective-analysis.v2')).toThrow(/Unknown HEADROOM prompt contract/);
        expect(() => getPromptContract({})).toThrow(/Unknown HEADROOM prompt contract/);
        expect(() => { contract.outputSchema.properties.questions.maxItems = 1000; }).toThrow();
        expect(getPromptContract('director.objective-analysis.v1').outputSchema.properties.questions.maxItems).toBe(8);
    });
});
