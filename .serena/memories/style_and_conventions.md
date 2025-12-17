# Code style & conventions
- ES2022 modules, TypeScript strict mode; `tsconfig` enables `noUnused*`, `noImplicitReturns`, etc.
- No lint/format config present; follow idiomatic Node/TS style already in repo.
- Zod schemas for tool input validation; MCP tool payloads use plain JSON strings in responses.
- Token limits enforced via `TokenCounter` (using `gpt-4` encoding) and manual truncation heuristics.
- Logging to stderr/console with emoji markers; uses synchronous git commands for repo maintenance.
- Service assumes docs repo content is HTML TypeDoc output; content trimmed to ~20k chars before storage.