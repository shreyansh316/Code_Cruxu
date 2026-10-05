const SAFE_ENV_TEMPLATES = new Set(['.env.example', '.env.sample', '.env.template']);
const SENSITIVE_NAMES = new Set([
    '.npmrc', '.pypirc', '.netrc', '.git-credentials',
    'credentials', 'credentials.json', 'secrets.json', 'service-account.json',
    'credentials.db', 'kubeconfig', '.vault-token', 'terraform.tfstate', 'terraform.tfstate.backup',
    'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519',
]);

/** Return whether a relative workspace path commonly contains credentials or private keys. */
export function isSensitiveWorkspacePath(value) {
    if (typeof value !== 'string') return false;
    const path = value.replace(/\\/g, '/').toLowerCase();
    const segments = path.split('/').filter(Boolean).map((segment) => segment.replace(/[. ]+$/g, ''));
    const base = segments.at(-1) ?? '';
    if (SAFE_ENV_TEMPLATES.has(base)) return false;
    if (segments.some((segment) => ['.ssh', '.aws', '.azure', '.kube', '.docker', '.terraform', '.vault',
        '.gnupg', '.git', '.secrets', 'credentials', 'secrets', 'private-keys', 'certificates'].includes(segment))) return true;
    if (base === '.env' || (base.startsWith('.env.') && !SAFE_ENV_TEMPLATES.has(base))) return true;
    if (SENSITIVE_NAMES.has(base) || /^service-account-.+\.json$/.test(base)
        || /^secrets\./.test(base) || /^credentials\./.test(base)
        || (/^id_.+_sk$/.test(base))) return true;
    if (/\.(?:pem|p12|pfx|p7b|p7c|p8|key|keystore|jks|crt|cer|der|kdb|jceks)$/.test(base)) return true;
    return false;
}
