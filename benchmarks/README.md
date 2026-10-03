# HEADROOM performance baselines

Run `npm run benchmark` on a quiet machine after `npm install`. The benchmark uses fixed fixture sizes and writes one `HEADROOM_BENCHMARK_JSON` line to stdout. It does not write result files into the repository.

The report records the Node version, OS/architecture, warm-up count, sample count, fixture sizes, median, and p95 for:

- SQLite repository insert plus read-back on an in-memory migrated database.
- Exact-owner memory query and deterministic retrieval over a 1,000-record fixture, capped at 100 candidates and 10 returned items.
- One scheduler call over 100 ready tasks with concurrency capped at four.
- Extension activation with a new extension-owned SQLite database, migrations, views, and command registration.

Run the command repeatedly on the same machine before comparing values. Treat differences across OS, architecture, Node, VS Code, or hardware as separate baselines. These measurements are local diagnostics, not Marketplace performance claims.

Phase 080 adds representative in-memory SQLite lookups for one organization’s memories among 3,000 records split across two owners, agent usage, and task audit. Each attribution table contains 3,000 matching rows and each query returns at most 100. The p95 local threshold is 10 ms on the current test runner; it is a regression guard for this fixture and not a cross-machine or Marketplace claim. The benchmark also checks `EXPLAIN QUERY PLAN` for the owner/attribution indexes in `tests/phase-080.test.js`.
