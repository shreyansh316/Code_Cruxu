/** Phase 287 — protect common cloud and deployment credential directories. */
import { describe, expect, it } from 'vitest';
import { isSensitiveWorkspacePath } from '../src/infrastructure';

describe('Phase 287 — cloud credential path classification', () => {
    it('blocks generic filenames beneath credential-bearing deployment directories', () => {
        for (const path of ['.azure/accessTokens.json', '.kube/config', '.docker/config.json',
            '.terraform/terraform.tfstate', '.vault/config', 'terraform.tfstate.backup', 'kubeconfig']) {
            expect(isSensitiveWorkspacePath(path)).toBe(true);
        }
        expect(isSensitiveWorkspacePath('src/runtime.js')).toBe(false);
    });
});
