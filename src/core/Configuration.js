/**
 * HEADROOM — Configuration validation
 *
 * Validates contributed VS Code settings and returns normalized defaults for
 * invalid values. Diagnostics contain setting identifiers and fixed messages,
 * never the configured values themselves.
 */
export const CONFIGURATION_DEFAULTS = {
    aiProvider: 'mock',
    defaultModel: 'gemini-2.0-flash',
    reasoningModel: 'gemini-2.5-pro',
    maxRetries: 2,
    parallelLimit: 4,
    verbose: false,
};
export const MAX_CONFIGURATION_DIAGNOSTICS = 6;
function addDiagnostic(diagnostics, code, setting, message) {
    // The fixed set of six contributed settings bounds diagnostic volume.
    if (diagnostics.length < MAX_CONFIGURATION_DIAGNOSTICS) {
        diagnostics.push({ source: 'configuration', level: 'warning', code, setting, message });
    }
}
function readString(reader, diagnostics, key, defaultValue) {
    const value = reader.get(key);
    if (value === undefined)
        return defaultValue;
    if (typeof value !== 'string') {
        addDiagnostic(diagnostics, 'invalid-type', `headroom.${key}`, 'Expected a string; using the default.');
        return defaultValue;
    }
    if (value.trim().length === 0) {
        addDiagnostic(diagnostics, 'invalid-value', `headroom.${key}`, 'Expected a non-empty string; using the default.');
        return defaultValue;
    }
    return value;
}
function readInteger(reader, diagnostics, key, defaultValue, minimum, maximum) {
    const value = reader.get(key);
    if (value === undefined)
        return defaultValue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        addDiagnostic(diagnostics, 'invalid-type', `headroom.${key}`, 'Expected a finite number; using the default.');
        return defaultValue;
    }
    if (!Number.isInteger(value)) {
        addDiagnostic(diagnostics, 'invalid-value', `headroom.${key}`, 'Expected a whole number; using the default.');
        return defaultValue;
    }
    if (value < minimum || value > maximum) {
        addDiagnostic(diagnostics, 'out-of-range', `headroom.${key}`, `Expected a value from ${minimum} to ${maximum}; using the default.`);
        return defaultValue;
    }
    return value;
}
function readBoolean(reader, diagnostics, key, defaultValue) {
    const value = reader.get(key);
    if (value === undefined)
        return defaultValue;
    if (typeof value !== 'boolean') {
        addDiagnostic(diagnostics, 'invalid-type', `headroom.${key}`, 'Expected a boolean; using the default.');
        return defaultValue;
    }
    return value;
}
/** Read and validate the contributed settings, falling back safely per key. */
export function validateHeadroomConfiguration(reader) {
    const diagnostics = [];
    const configuredProvider = reader.get('ai.provider');
    let aiProvider = CONFIGURATION_DEFAULTS.aiProvider;
    if (configuredProvider !== undefined) {
        if (typeof configuredProvider !== 'string') {
            addDiagnostic(diagnostics, 'invalid-type', 'headroom.ai.provider', 'Expected a provider name; using the default.');
        }
        else if (configuredProvider === 'mock' || configuredProvider === 'gemini' || configuredProvider === 'openai') {
            aiProvider = configuredProvider;
        }
        else {
            addDiagnostic(diagnostics, 'invalid-value', 'headroom.ai.provider', 'Expected a contributed provider; using the default.');
        }
    }
    const configuration = {
        aiProvider,
        defaultModel: readString(reader, diagnostics, 'ai.defaultModel', CONFIGURATION_DEFAULTS.defaultModel),
        reasoningModel: readString(reader, diagnostics, 'ai.reasoningModel', CONFIGURATION_DEFAULTS.reasoningModel),
        maxRetries: readInteger(reader, diagnostics, 'execution.maxRetries', CONFIGURATION_DEFAULTS.maxRetries, 0, 5),
        parallelLimit: readInteger(reader, diagnostics, 'execution.parallelLimit', CONFIGURATION_DEFAULTS.parallelLimit, 1, 10),
        verbose: readBoolean(reader, diagnostics, 'debug.verbose', CONFIGURATION_DEFAULTS.verbose),
    };
    return { configuration, diagnostics };
}
