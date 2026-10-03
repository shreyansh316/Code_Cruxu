# HEADROOM performance baselines

Run `npm run benchmark` on a quiet machine after `npm install`. The benchmark uses fixed fixture sizes and writes one `HEADROOM_BENCHMARK_JSON` line to stdout. It does not write result files into the repository.

The report records the Node version, OS/architecture, warm-up count, sample count, fixture sizes, median, and p95 for:

- SQLite repository insert plus read-back on an in-memory migrated database.
- Exact-owner memory query and deterministic retrieval over a 1,000-record fixture, capped at 100 candidates and 10 returned items.
- One scheduler call over 100 ready tasks with concurrency capped at four.
- Extension activation with a new extension-owned SQLite database, migrations, views, and command registration.

Run the command repeatedly on the same machine before comparing values. Treat differences across OS, architecture, Node, VS Code, or hardware as separate baselines. These measurements are local diagnostics, not Marketplace performance claims; no cross-machine latency threshold is asserted. Phase 080 and Phase 081 will define query-level and workload limits using measured evidence.
