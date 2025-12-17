# Core commands
- Install deps: `bun install` (preferred) or `npm ci`.
- Type check/build: `bun run build` (runs `tsc`).
- Dev (stdio): `bun run dev` (tsx watch `src/index.ts`).
- Dev HTTP: `bun run dev:http` (StreamableHTTP on :3000 with health route).
- Start (stdio): `bun run start` (uses built dist).
- Start HTTP: `bun run start:http`.
- Initialize docs cache: `bun run clone-docs` (clones/pulls docs repo, builds cache + index).
- Update docs manually: `bun run update-docs`.

# Docker
- Build/start: `bun run docker:up` (compose with build/recreate).
- Logs: `bun run docker:logs`.
- Stop: `bun run docker:down`; restart: `bun run docker:restart`; rebuild image: `bun run docker:build`.

# Helpful notes
- HTTP mode exposes health at `/health` and uses JSON responses (not SSE) with StreamableHTTP transport.
- Docs/data stored in `docs-repo/` and `.cache/`; docker mounts volumes for both.