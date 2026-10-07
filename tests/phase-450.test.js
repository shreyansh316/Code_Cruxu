/** Phase 450 — keep the selected license and non-publishing release policy explicit. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageManifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lockfile = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const releasePolicy = readFileSync(new URL('../RELEASE_POLICY.md', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const licenseText = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8');

describe('Phase 450 — release metadata guard', () => {
    it('keeps the owner-selected MIT SPDX identifier aligned in the manifest and lockfile', () => {
        expect(packageManifest.license).toBe('MIT');
        expect(lockfile.packages[''].license).toBe(packageManifest.license);
    });

    it('keeps verification and packaging distinct from release publication', () => {
        expect(releasePolicy).toMatch(/A release is not published by the build or verification commands\./);
    });

    it('shows the same license to readers and preserves the standard MIT grant and warranty terms', () => {
        expect(readme).toContain('[LICENSE](./LICENSE)');
        expect(packageManifest.files).toContain('LICENSE');
        expect(licenseText).toContain('Copyright (c) 2026 Shreyansh');
        expect(licenseText).toContain('Permission is hereby granted, free of charge');
        expect(licenseText).toContain('The above copyright notice and this permission notice shall be included');
        expect(licenseText).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
    });
});
