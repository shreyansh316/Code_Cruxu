/** Phase 005 — configuration defaults, bounds, and diagnostics. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as vscode from 'vscode';
import {
  CONFIGURATION_DEFAULTS,
  MAX_CONFIGURATION_DIAGNOSTICS,
  validateHeadroomConfiguration,
  type ConfigurationReader,
} from '../src/core/Configuration';
import { HeadroomContext } from '../src/core/HeadroomContext';

const manifest = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
  contributes: { configuration: { properties: Record<string, {
    type: string;
    default: unknown;
    enum?: string[];
    minimum?: number;
    maximum?: number;
  }> } };
};

function reader(values: Record<string, unknown> = {}): ConfigurationReader {
  return { get: <T>(key: string) => values[key] as T | undefined };
}

describe('Phase 005 — configuration validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('preserves all contributed defaults when settings are unset', () => {
    const result = validateHeadroomConfiguration(reader());

    expect(result.configuration).toEqual(CONFIGURATION_DEFAULTS);
    expect(result.diagnostics).toEqual([]);
  });

  it('accepts supported provider, model, boolean, and numeric boundary values', () => {
    const result = validateHeadroomConfiguration(reader({
      'ai.provider': 'openai',
      'ai.defaultModel': 'custom-model',
      'ai.reasoningModel': 'reasoner',
      'execution.maxRetries': 5,
      'execution.parallelLimit': 1,
      'debug.verbose': true,
    }));

    expect(result.configuration).toEqual({
      aiProvider: 'openai',
      defaultModel: 'custom-model',
      reasoningModel: 'reasoner',
      maxRetries: 5,
      parallelLimit: 1,
      verbose: true,
    });
    expect(result.diagnostics).toEqual([]);

    const geminiProvider = validateHeadroomConfiguration(reader({ 'ai.provider': 'gemini' }));
    expect(geminiProvider.configuration.aiProvider).toBe('gemini');
    expect(geminiProvider.diagnostics).toEqual([]);

    const oppositeEdges = validateHeadroomConfiguration(reader({
      'execution.maxRetries': 0,
      'execution.parallelLimit': 10,
    }));
    expect(oppositeEdges.configuration.maxRetries).toBe(0);
    expect(oppositeEdges.configuration.parallelLimit).toBe(10);
    expect(oppositeEdges.diagnostics).toEqual([]);
  });

  it('falls back for unsupported providers, blank model names, and wrong types', () => {
    const result = validateHeadroomConfiguration(reader({
      'ai.provider': 'unlisted-provider',
      'ai.defaultModel': '   ',
      'ai.reasoningModel': 42,
      'debug.verbose': 'yes',
    }));

    expect(result.configuration.aiProvider).toBe(CONFIGURATION_DEFAULTS.aiProvider);
    expect(result.configuration.defaultModel).toBe(CONFIGURATION_DEFAULTS.defaultModel);
    expect(result.configuration.reasoningModel).toBe(CONFIGURATION_DEFAULTS.reasoningModel);
    expect(result.configuration.verbose).toBe(CONFIGURATION_DEFAULTS.verbose);
    expect(result.diagnostics.map(diagnostic => diagnostic.code)).toEqual([
      'invalid-value', 'invalid-value', 'invalid-type', 'invalid-type',
    ]);
  });

  it('bounds integer settings to manifest ranges and rejects fractional values', () => {
    const result = validateHeadroomConfiguration(reader({
      'execution.maxRetries': -1,
      'execution.parallelLimit': 11,
    }));
    const fractional = validateHeadroomConfiguration(reader({
      'execution.maxRetries': 1.5,
      'execution.parallelLimit': 2.5,
    }));

    expect(result.configuration.maxRetries).toBe(CONFIGURATION_DEFAULTS.maxRetries);
    expect(result.configuration.parallelLimit).toBe(CONFIGURATION_DEFAULTS.parallelLimit);
    expect(result.diagnostics.map(diagnostic => diagnostic.code)).toEqual(['out-of-range', 'out-of-range']);
    expect(fractional.diagnostics.map(diagnostic => diagnostic.code)).toEqual(['invalid-value', 'invalid-value']);
  });

  it('keeps diagnostics structured, bounded, and free of raw configured values', () => {
    const sensitiveLikeValue = 'invalid-secret-looking-setting-value';
    const result = validateHeadroomConfiguration(reader({
      'ai.provider': sensitiveLikeValue,
      'ai.defaultModel': '',
      'ai.reasoningModel': '',
      'execution.maxRetries': 99,
      'execution.parallelLimit': 0,
      'debug.verbose': 'bad',
      unknownSetting: sensitiveLikeValue,
    }));

    expect(result.diagnostics).toHaveLength(MAX_CONFIGURATION_DIAGNOSTICS);
    expect(result.diagnostics.every(diagnostic => diagnostic.source === 'configuration' && diagnostic.level === 'warning')).toBe(true);
    expect(result.diagnostics.every(diagnostic => diagnostic.message.length <= 100)).toBe(true);
    expect(JSON.stringify(result.diagnostics)).not.toContain(sensitiveLikeValue);
  });

  it('keeps defaults, enums, and ranges aligned with package.json', () => {
    const properties = manifest.contributes.configuration.properties;
    expect(properties['headroom.ai.provider']).toMatchObject({
      type: 'string', default: CONFIGURATION_DEFAULTS.aiProvider,
      enum: ['mock', 'gemini', 'openai'],
    });
    expect(properties['headroom.ai.defaultModel']).toMatchObject({ type: 'string', default: CONFIGURATION_DEFAULTS.defaultModel });
    expect(properties['headroom.ai.reasoningModel']).toMatchObject({ type: 'string', default: CONFIGURATION_DEFAULTS.reasoningModel });
    expect(properties['headroom.execution.maxRetries']).toMatchObject({
      type: 'number', default: CONFIGURATION_DEFAULTS.maxRetries, minimum: 0, maximum: 5,
    });
    expect(properties['headroom.execution.parallelLimit']).toMatchObject({
      type: 'number', default: CONFIGURATION_DEFAULTS.parallelLimit, minimum: 1, maximum: 10,
    });
    expect(properties['headroom.debug.verbose']).toMatchObject({ type: 'boolean', default: CONFIGURATION_DEFAULTS.verbose });
  });

  it('reports invalid settings through one bounded startup warning and structured log', async () => {
    const config = {
      get: (key: string) => key === 'execution.maxRetries' ? 99 : undefined,
    } as unknown as vscode.WorkspaceConfiguration;
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(config);
    vi.mocked(vscode.window.createStatusBarItem).mockReturnValue({
      name: '', text: '', tooltip: '', command: '',
      show: vi.fn(), hide: vi.fn(), dispose: vi.fn(),
    } as unknown as vscode.StatusBarItem);
    vi.mocked(vscode.commands.registerCommand).mockReturnValue({ dispose: vi.fn() });
    const warningLog = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const extensionContext = {
      subscriptions: [],
      globalState: { get: () => true, update: vi.fn().mockResolvedValue(undefined) },
      globalStorageUri: { fsPath: 'test-storage' },
    } as unknown as vscode.ExtensionContext;
    const headroom = new HeadroomContext(extensionContext);

    await headroom.initialize();
    await headroom.initialize();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'HEADROOM is using defaults for 1 invalid setting(s). See the Extension Host log for details.',
    );
    expect(warningLog).toHaveBeenCalledTimes(1);
    expect(headroom.configuration.maxRetries).toBe(CONFIGURATION_DEFAULTS.maxRetries);
    const warning = JSON.parse(warningLog.mock.calls[0][1] as string) as {
      diagnostics: Array<{ code: string; setting: string; level: string }>;
    };
    expect(warning.diagnostics).toEqual([{
      source: 'configuration', level: 'warning', code: 'out-of-range',
      setting: 'headroom.execution.maxRetries',
      message: 'Expected a value from 0 to 5; using the default.',
    }]);
    headroom.dispose();
  });
});
