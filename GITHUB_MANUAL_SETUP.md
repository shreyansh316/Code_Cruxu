# GitHub Manual Configuration & Verification Guide

This guide documents the GitHub-side configuration for the HEADROOM repository (`https://github.com/shreyansh316/Code_Cruxu`).

---

## 1. Branch Protection for `main`

The `main` branch is protected. The repository owner can inspect or adjust these settings under **Settings > Branches** or **Settings > Rules > Rulesets**.

### Verified Active Configuration:
- **Require a pull request before merging**: Enabled
- **Dismiss stale pull request approvals when new commits are pushed**: Enabled (`dismiss_stale_reviews: true`)
- **Require status checks to pass before merging**: Enabled (`strict: true`)
  - `win32-x64 quality gates`
  - `linux-x64 quality gates`
  - `darwin-x64 quality gates`
- **Do not allow force pushes**: Enabled (`allow_force_pushes: false`)
- **Do not allow deletions**: Enabled (`allow_deletions: false`)
- **Enforce all above rules for administrators**: Enabled (`enforce_admins: true`)

### Optional Owner Setting: Approving Review Count
- **Current value**: `0` (enforces PR workflow while preventing lockout for single-contributor personal repos).
- **Recommended team value**: `1` (navigate to **Settings > Branches > Edit 'main' > Require approvals > set to 1** once a second human collaborator, team member, or review bot is added).

---

## 2. Setting Up Real AI Agent Access

> **CRITICAL REMINDER**: Never create fake GitHub user accounts named `codex`, `claude`, `gemini`, or `copilot`. AI products authenticate using real GitHub accounts, GitHub Apps, OAuth credentials, or the developer's local authenticated CLI environment.

### A. OpenAI Codex / CLI Agents
1. If running Codex in an automated CI/CD pipeline or runner:
   - Create a dedicated GitHub App or Personal Access Token (Fine-grained PAT).
   - Grant **Contents: Read and write** and **Pull requests: Read and write** permissions.
   - Restrict repository access strictly to `Code_Cruxu`.
2. If running locally:
   - Codex operates via the developer's local Git credentials (`git push origin ai/codex/<task>`).

### B. Claude Code
1. Install Claude Code CLI and authenticate using your authorized Anthropic account.
2. For GitHub operations, Claude Code uses your workstation's local Git credentials (SSH keys or `gh auth login`).
3. Ensure Git is configured to push to `ai/claude/<task>`.

### C. Google Gemini / Antigravity
1. Uses Google Antigravity or Gemini CLI environment.
2. Interacts with Git via the local workspace credentials.
3. Dedicated branches are created as `ai/gemini/<task>`.

### D. GitHub Copilot
1. Ensure GitHub Copilot is enabled in your GitHub user or organization account settings.
2. Assign the Copilot license to the developer's GitHub username.
3. Copilot PR reviews and suggestions operate natively within GitHub pull request threads.

---

## 3. Reviewing Repository Collaborators

To add a human teammate or verified organization bot:
1. Navigate to `https://github.com/shreyansh316/Code_Cruxu/settings/access`.
2. Click **Add people**.
3. Search for the verified collaborator's exact GitHub username.
4. Assign the minimum required role (typically **Write** for contributors, or **Triage** for issue reviewers).
