# GitHub Branch Protection Configuration Guide

This document records the branch protection policy for the `main` branch of the HEADROOM repository (`https://github.com/shreyansh316/Code_Cruxu`).

---

## 1. Verified Active GitHub Protection Policy

The `main` branch on GitHub has the following protection rules active:

| Protection Setting | Active Value | Description |
|---|---|---|
| **Require Pull Request** | Enabled | Direct pushes to `main` are blocked; all changes must enter via pull request. |
| **Dismiss Stale Approvals** | Enabled (`true`) | New commits pushed to an approved PR automatically dismiss prior approvals. |
| **Strict Status Checks** | Enabled (`strict: true`) | Branches must be up to date with `main` before merging. |
| **Required Status Checks** | `win32-x64 quality gates`<br>`linux-x64 quality gates`<br>`darwin-x64 quality gates` | CI matrix runs from `.github/workflows/quality.yml` must pass before merge. |
| **Block Force Pushes** | Enabled (`false`) | Force-pushes (`git push --force`) are completely prohibited. |
| **Block Branch Deletion** | Enabled (`false`) | The `main` branch cannot be deleted. |
| **Enforce for Administrators**| Enabled (`true`) | Repository administrators cannot bypass the above rules. |

---

## 2. Review Approval Configuration for Solo vs. Team Environments

* **Solo Owner Mode (Current: `0` approvals)**:
  In single-contributor personal repositories on GitHub, PR authors cannot approve their own PRs. Setting `required_approving_review_count: 0` ensures the pull request workflow, status checks, and admin enforcement remain mandatory without locking the owner out.
* **Team / Multi-Agent Mode (Recommended: `1` approval)**:
  Once a second verified collaborator, review agent, or organization bot is onboarded, the repository owner should set approvals to `1`:
  1. Navigate to `https://github.com/shreyansh316/Code_Cruxu/settings/branches`.
  2. Click **Edit** next to the `main` branch protection rule.
  3. Under **Require a pull request before merging**, check **Require approvals** and set the count to `1`.
  4. Ensure **Dismiss stale pull request approvals when new commits are pushed** is checked.
  5. Click **Save changes**.

---

## 3. Protecting Against AI Agent Bypass

AI coding agents (Codex, Claude Code, Gemini, Copilot) must:
1. Never have Administrator or Bypass permissions in repository settings.
2. Only receive standard **Write** collaborator or fine-grained GitHub App access.
3. Target their PRs to `main` and await automated CI execution and human maintainer review.
