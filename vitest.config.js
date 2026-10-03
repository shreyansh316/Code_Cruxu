import { defineConfig } from 'vitest/config';
import path from 'path';
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.test.js', 'tests/**/*.test.js'],
        exclude: ['node_modules', 'out'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.js'],
            exclude: ['src/**/*.test.js', 'src/extension.js', 'src/__mocks__/**'],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            // Mock vscode module for unit testing — runs outside Extension Host
            'vscode': path.resolve(__dirname, './src/__mocks__/vscode.js'),
        },
    },
});
