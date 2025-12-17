# Project purpose
MCP server that exposes Demos SDK API reference pages from the `kynesyslabs/demosdk-api-ref` git repo. It clones/updates the repo locally, caches parsed HTML into `.cache`, builds a simple search index, and serves MCP tools for search/list/get.

# Tech stack
- TypeScript (ES2022, strict), Node 20 target.
- MCP SDK `@modelcontextprotocol/sdk` for server + transports (stdio/StreamableHTTP).
- `cheerio` for HTML parsing, `tiktoken` for token counting/truncation, `zod` for tool input validation.
- Uses `git` via `execSync` to clone/pull docs repo.
- Docker (node:20-alpine) with volumes for cache and repo.

# Code structure
- `src/index.ts`: MCP server entry; registers tools (`search_docs`, `get_page`, `list_modules`, `get_stats`, `update_docs`), enforces token limits, supports stdio or HTTP (health endpoint + SSE JSON responses), starts periodic updater.
- `src/services/git-docs.ts`: GitDocumentationService handles cloning/pulling docs repo, parsing HTML into DocPage objects (content trimmed to 20k chars), saving/loading cache/meta, building in-memory search index, search/list/stats helpers.
- `src/services/token-counter.ts`: token counting/truncation helper using `encoding_for_model('gpt-4')` with fallbacks and simple truncation heuristics.
- `src/services/scheduler.ts`: 6-hour interval that triggers `updateDocumentation`.
- `src/scripts/clone-docs.ts`, `src/scripts/update-docs.ts`: CLIs to initialize/update docs; used by Docker entry.
- Docker: `docker-compose.yml`, `Dockerfile`, `docker/start.sh` for HTTP mode with health check.

# Notable behaviors/constraints
- Caching: `.cache/docs.json` + `meta.json` store parsed pages keyed by relative path; rebuilt when git commit changes or cache missing.
- Repo path: `docs-repo/`; cache dir `.cache/`.
- Token limit enforcement in tool handlers set to 25k tokens; responses truncated via TokenCounter.
- Search uses simple word tokenization and additive scoring across page text; no ranking beyond frequency.
- No tests/linters configured; relies on `tsc` for build-time checks.