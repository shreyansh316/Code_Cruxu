#!/usr/bin/env node
/**
 * HEADROOM — scripts/verify-branch.js
 *
 * Lightweight local safeguard to verify that the active Git branch is not 'main'
 * before an AI agent pushes or commits, and optionally validates branch naming.
 *
 * Usage:
 *   node scripts/verify-branch.js
 */

const { execSync } = require('child_process');

try {
  const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();

  if (currentBranch === 'main' || currentBranch === 'master') {
    console.error(`\x1b[31m[HEADROOM SAFEGUARD] Blocked: direct work on '${currentBranch}' is prohibited.\x1b[0m`);
    console.error('[HEADROOM SAFEGUARD] AI agents and contributors must work on dedicated branches: ai/<agent>/<task>');
    process.exit(1);
  }

  console.log(`[HEADROOM SAFEGUARD] Active branch verified: ${currentBranch}`);
  process.exit(0);
} catch (error) {
  // If git is unavailable or not in a repo, don't break non-git environments
  console.warn('[HEADROOM SAFEGUARD] Notice: Unable to resolve active branch via git.');
  process.exit(0);
}
