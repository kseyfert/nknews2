## Why

NKNews v1 works but is a single-package vanilla Node.js/Express app with all code in `src/` and no type safety. NKNews2 is a full rewrite in TypeScript with a Next.js web reader and a background pipeline that must share the same database schema, environment contract, and domain types. Those shared pieces need to exist and be enforced by the toolchain *before* any pipeline or UI work starts — otherwise the two apps drift and duplicate their data access, exactly as `src/api/routes/*` and `src/pipeline/*` do in v1.

This change lays the foundation only: workspace topology, the database package, the environment contract, and shared types. No ingestion, clustering, enrichment, or HTTP endpoints.

## What Changes

- **Turborepo + pnpm workspaces monorepo**, replacing v1's single-package layout. Root holds workspace config, a base `tsconfig.json`, and Turborepo task orchestration.
- **`apps/web`** — Next.js 15 App Router application, scaffolded and building. No feature routes yet.
- **`apps/pipeline`** — Node.js 22 worker entrypoint run via `tsx`. Boots, validates config, connects to the database, exits cleanly. No jobs yet.
- **`packages/db`** — Drizzle ORM schema and migrations for PostgreSQL with the `pgvector` extension. Exports a configured database client and every table schema. Owns `drizzle.config.ts`.
- **`packages/types`** — shared domain TypeScript types consumed by both apps.
- **`packages/config`** — Zod-validated environment variable schema in two tiers: globally required variables that every process must have, and optional variables that individual services assert for themselves at their own startup. Fails fast with a readable error listing every missing or malformed variable. Ships the assertion helper services use to declare what they need.
- **Workspace import aliases** — apps and packages resolve each other as `@nknews2/db`, `@nknews2/types`, `@nknews2/config`.
- **Per-package `package.json` and `tsconfig.json`**, each extending the root base config.
- **`.env.example`** enumerating every variable the config schema requires.
- **Database schema: `Provider` and `Article` only**, mirroring v1's field configuration, plus a new `embedding vector(512)` column on `Article` for future similarity clustering. The width is the dimension requested from Voyage AI's `voyage-3.5-lite`, the chosen embedding model, and is exported as a shared constant alongside the model name so the schema and the future API call cannot drift.
- **BREAKING** relative to v1: all localization is dropped. There are no `*Ru` columns and no `lang` concept anywhere. Every content field is English-only. v1's `Story`/`MacroSnapshot` bilingual field pairs do not carry over.
- **BREAKING** relative to v1: ORM changes from Prisma to Drizzle. v1's `prisma/` directory and migration history are not carried forward; NKNews2 starts from a fresh migration baseline against its own database.

Explicitly **not** in this change: `Cluster`, `Story`, and `MacroSnapshot` tables; RSS fetching; clustering; Claude enrichment; the job queue; any HTTP endpoint or UI route.

## Capabilities

### New Capabilities
- `project-structure`: Monorepo workspace topology — package boundaries, workspace import aliases, TypeScript project configuration inheritance, and Turborepo task orchestration. Covers what each app and package may depend on and how builds and type-checks run across the workspace.
- `data-layer`: The PostgreSQL persistence layer — the `Provider` and `Article` table schemas and their constraints, the `pgvector` extension and embedding column, migration generation and application, and the exported database client.
- `configuration`: The environment variable contract — which variables exist, their validation rules, fail-fast startup behavior, and how both apps obtain validated configuration.

### Modified Capabilities
None. This is the first change in the repository; `openspec/specs/` is currently empty.

## Impact

**Created:** the entire repository structure. The current `src/index.ts` placeholder and root-level `tsconfig.json`/`package.json` are replaced by the workspace layout.

**Dependencies added:** `turbo`, `typescript`, `drizzle-orm`, `drizzle-kit`, `postgres` (or `pg`), `zod`, `next` 15, `react` 19, `tsx`, `@types/node`. Node.js 22 and pnpm become required tooling.

**External systems:** a PostgreSQL database on Supabase with the `vector` extension enabled. `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` are declared in the config schema for downstream changes but are optional and unconsumed by any code path in this change — neither an Anthropic nor a Voyage account is needed to run the workspace until the changes that call those providers land.

**Downstream:** every subsequent change (ingestion, clustering, enrichment, macro, web reader) builds on the package boundaries and schema baseline established here. The tables deliberately omitted above are added by those changes.

**Open decisions deferred to later changes**, recorded here so they are not lost:
- The HTTP API surface — Next.js route handlers reading `@nknews2/db` directly versus a separate Hono service. This change scaffolds no endpoints, so the decision is not yet forced.
- Whether clustering uses the embedding column or ports v1's title-Jaccard algorithm. The column exists either way and is nullable.
