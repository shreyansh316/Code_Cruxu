import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({
    test: { globals: true, environment: 'node', include: ['benchmarks/**/*.bench.js'], exclude: ['node_modules', 'out'] },
    resolve: { alias: { vscode: resolve('src/__mocks__/vscode.js') } },
});
