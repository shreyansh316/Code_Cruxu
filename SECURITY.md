# Security Policy

## Reporting Security Issues

We take the security of HEADROOM and the developer environments it operates within seriously.

If you discover a security vulnerability, privilege escalation, or boundary bypass in HEADROOM, please do **NOT** open a public issue on GitHub.

Instead, please report security issues responsibly using one of the following methods:

1. **GitHub Private Vulnerability Reporting**:
   Submit an advisory privately via [GitHub Security Advisories](https://github.com/shreyansh316/Code_Cruxu/security/advisories/new).
2. **Direct Maintainer Contact**:
   Contact the repository maintainer directly via GitHub profile (`@shreyansh316`).

Please include:
* Description of the vulnerability.
* Steps to reproduce the issue or proof-of-concept.
* Potential impact on the host system or workspace.

## Defense-in-Depth Security Model

HEADROOM operates with a strict local execution security model:
* **Local-First SQLite Persistence**: All project state, memories, and audit logs reside in a local database. No cloud database or telemetry service is used.
* **OS-Backed Credential Storage**: Provider API keys are stored via VS Code's native `SecretStorage`. Credentials never touch git history or prompt context.
* **Process Sandboxing**: External commands spawn without shell interpolation (`shell: false`), constrained to explicit executable paths and execution timeouts.
* **Path Containment**: Workspace access is restricted to canonical workspace roots; sensitive paths (`.env`, private keys) are rejected.
* **Automatic Secret Redaction**: All captured command outputs, logs, and evidence feeds pass through an automated credential redactor.

For comprehensive architectural details and threat model documentation, see [SECURITY_MODEL.md](./SECURITY_MODEL.md).
