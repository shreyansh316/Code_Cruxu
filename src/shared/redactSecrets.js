/** Remove common credential forms before text is retained in user-visible activity. */
export function redactSecrets(value, maxLength = 180) {
    if (typeof value !== 'string' || !Number.isInteger(maxLength) || maxLength < 1 || maxLength > 1024 * 1024) return '';
    return value.replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/([a-z][a-z0-9+.-]*:\/\/[^:/\s@]+:)[^@\s/]+(@)/ig, '$1[redacted]$2')
        .replace(/(api[_-]?key|token|password|secret|access[_-]?key|client[_-]?secret)(\s*[:=]\s*)[^\s&/\\]+/ig, '$1$2[redacted]')
        .replace(/Basic\s+[A-Za-z0-9+/=]+/ig, 'Basic [redacted]')
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/ig, 'Bearer [redacted]')
        .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g, '[redacted-jwt]')
        .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[redacted-github-token]')
        .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, '[redacted-api-key]')
        .replace(/\bAIza[A-Za-z0-9_-]{30,}\b/g, '[redacted-api-key]')
        .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[redacted-aws-key]')
        .slice(0, maxLength);
}
