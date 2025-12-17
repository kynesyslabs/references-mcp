# When finishing a task
- Run `bun run build` to ensure TypeScript compiles; no dedicated lint/test suites present.
- If relevant to docs cache, run `bun run clone-docs` or `bun run update-docs` to refresh and verify cache builds.
- For HTTP mode changes, consider `bun run dev:http` smoke test or hit `/health` in running server.
- If docker context changed, rebuild and rerun with `bun run docker:up` or `bun run docker:build`.