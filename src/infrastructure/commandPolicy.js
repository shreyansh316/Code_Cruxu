import { basename, resolve } from 'path';
import { DomainInvariantError } from '../domain/errors';

const MAX_ARGUMENTS = 100;
const MAX_ARGUMENT_BYTES = 64 * 1024;
const MAX_SINGLE_ARGUMENT_BYTES = 2048;
const SHELLS = new Set(['sh', 'bash', 'dash', 'zsh', 'fish', 'cmd', 'powershell', 'pwsh', 'wscript', 'cscript']);

export function normalizeAllowedExecutable(command) {
    if (typeof command !== 'string' || !command.trim()) throw new DomainInvariantError('invalid-command-allowlist', 'Allowed executable paths must be non-empty.');
    const executable = resolve(command);
    const name = basename(executable).toLowerCase().replace(/\.exe$/, '');
    if (SHELLS.has(name)) throw new DomainInvariantError('command-shell-not-allowed', 'Shell interpreters cannot be added to the command allowlist.');
    return executable;
}

export function validateCommandArguments(args) {
    if (!Array.isArray(args) || args.length > MAX_ARGUMENTS
        || args.some((argument) => typeof argument !== 'string' || Buffer.byteLength(argument, 'utf8') > MAX_SINGLE_ARGUMENT_BYTES)
        || args.reduce((total, argument) => total + Buffer.byteLength(argument, 'utf8'), 0) > MAX_ARGUMENT_BYTES) {
        throw new DomainInvariantError('invalid-command-arguments', 'Command arguments must contain at most 100 strings and 64 KiB total.');
    }
    return args;
}
