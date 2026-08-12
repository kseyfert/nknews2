## Context

See `proposal.md` — Why. The constraints that shape this design:

- Two runtimes consume the same schema: a Next.js 15 App Router application (React Server Components, bundled by Next's compiler) and a long-lived Node.js 22 worker process run under `tsx`. Anything shared must work under both.
- The database is PostgreSQL on Supabase, which fronts connections with a transaction-mode connection pooler. That has concrete driver implications, covered below.
- NKNews v1 remains running and untouched on its own database. There is no data migration and no cutover in this change.
- v1's field configuration for `Provider` and `Article` is the reference for column names, nullability, and defaults — minus every `*Ru` field and minus the `clusterId` foreign key, since `Cluster` does not exist in this change.

## Goals / Non-Goals

**Goals:**

- One schema definition, imported by both applications, with query result types derived from it rather than hand-written.
- A misconfigured process dies at startup with a message naming every problem, not on the first query.
- Adding a table later touches one package and produces one migration file.
- `pnpm install && pnpm build` works on a clean checkout with no ordering knowledge.

**Non-Goals:**

- Publishing any package to a registry. These are private internal packages; their build setup may assume in-repo consumers only.
- Runtime performance tuning. No vector index, no query optimization, no connection-pool sizing beyond defaults — there are no queries yet to tune.
- A shared UI component package. `apps/web` owns its own components until a second consumer exists.

## Decisions

### Drizzle over Prisma, driven by pgvector

v1 uses Prisma. The deciding factor for the rewrite is the embedding column: Prisma has no native `vector` type, so a pgvector column must be declared `Unsupported("vector(512)")`, which Prisma Client cannot read, write, or filter — every embedding operation would drop to `$queryRaw` with hand-written types, defeating the point of the ORM. Drizzle models `vector('embedding', { dimensions: 512 })` as a first-class column with typed similarity operators.

Secondary benefits: no code-generation step (schema *is* TypeScript, so the workspace has one less build artifact to order), migrations are readable SQL files rather than an opaque engine format, and there is no query engine binary to ship into either runtime.

*Alternative considered:* keep Prisma and use `$queryRaw` for vector work only. Rejected — it splits data access across two idioms and puts the least type-safe code on the newest, least-understood part of the system.

### Internal packages export TypeScript source, not compiled output

Each package's entry point resolves to `./src/index.ts` rather than a built `dist/`. Consumers compile it: Next.js via `transpilePackages`, the worker via `tsx`.

This removes an entire class of foundation-stage friction — no stale `dist/`, no "did you rebuild the package?", no build-order dependency for local development. Type-checking still runs workspace-wide and still catches everything.

*Trade-off:* the packages are not independently consumable outside this repo. That is acceptable and matches the Non-Goal above; if a package ever needs publishing, adding a build step then is straightforward.

*Alternative considered:* compile each package to `dist/` with `tsc` and let Turborepo order the builds. Rejected as premature — it buys publishability nobody needs and costs a rebuild on every edit.

### `drizzle.config.ts` lives in `packages/db`

The proposal allowed root or `packages/db`. Co-locating it with the schema keeps everything the database owns in one directory: schema definitions, generated migration SQL, and the config that ties them together. `drizzle-kit` commands run with that package as their working directory and are exposed as scripts in its manifest, so the root task runner can invoke them without the root needing to know drizzle-kit exists.

### Driver: `postgres.js` with prepared statements disabled

Supabase's pooler in transaction mode does not support session-level prepared statements. Connecting through it with the default configuration produces intermittent, confusing errors under concurrency rather than a clean failure. The client is therefore constructed with `prepare: false`.

This is the kind of detail that costs an afternoon when discovered later, so it belongs in the client construction from the first commit, with a comment stating why.

### Column naming: `snake_case` in the database, `camelCase` in TypeScript

Drizzle maps between the two, so SQL written by hand against the database reads idiomatically and TypeScript reads idiomatically, without either side compromising.

### Timestamps are `timestamptz`

v1's Prisma `DateTime` columns map to timestamps without time zone. Since every v1 schedule and every source timestamp is reasoned about in UTC, storing without a zone is a latent bug. NKNews2 uses `timestamp with time zone` throughout — a deliberate, small divergence from v1's field configuration.

### Primary keys stay integer identity columns

v1 uses auto-incrementing integers. Keeping integer identity columns (`generated always as identity`) preserves continuity with v1's shape and keeps URLs and logs readable. There is no distributed-write or ID-guessing concern here that would justify UUIDs.

### Embeddings come from Voyage AI `voyage-3.5-lite` at a requested 512 dimensions

Anthropic offers no embeddings API, so the embedding provider is necessarily a second vendor. `voyage-3.5-lite` supports Matryoshka output dimensions — 2048, 1024, 512, and 256 — of which 512 is the chosen width.

**512 is a selected width, not the model's default.** `voyage-3.5-lite` returns **1024** unless the request explicitly asks for another supported width, so every embedding call must pass the output dimension. Omit it and the API returns a 1024-wide vector that the database rejects on insert — a failure that surfaces at write time, inside a background job, rather than anywhere near the code that got it wrong.

Two things follow, and both are cheap now and annoying later:

- The model name and the output dimension are exported as a single pair of constants from `@nknews2/types`, and the `articles` schema derives its column width from that constant rather than hardcoding `512`. One edit changes the schema and the API call together; they cannot drift.
- The column definition carries a comment stating that the width is *requested*, not inherent, so the next person to read it knows the API call has a matching obligation.

Storage cost is worth noting since it is decided here and expensive to revisit: at 512 dimensions a stored vector is roughly 2 KB, against ~4 KB at 1024. Across a growing article table that difference compounds in both table size and index size.

*Alternative considered:* the model's default 1024 dimensions, which retains more semantic detail. Rejected for this workload — the task is grouping near-duplicate crypto headlines published within hours of each other, where the distinctions are coarse and the smaller footprint is the better trade. Because the dimension is now a request parameter rather than a property of the model, revisiting this is a schema migration plus a re-embed, but *not* a model change.

### Configuration is validated once, at module load

The config package parses `process.env` against a Zod schema at import time and exports the frozen result. Because import happens before any application code runs, "validate at startup" needs no explicit call site or ordering discipline — importing the module *is* the validation. Zod's error aggregation gives the all-problems-at-once requirement for free.

### Two validation tiers: globally required versus per-service required

`DATABASE_URL` is globally required — every process touches the database, so a missing connection string is unambiguously fatal. The API keys are not: the pipeline worker will call Anthropic and Voyage, while the web application may never call either. Making them globally required would force every process, including local web-only development, to hold credentials it never uses.

So the shared schema declares them optional, and each service asserts what it actually needs at its own startup:

```
@nknews2/config  ─── DATABASE_URL          required → string
                 ├── ANTHROPIC_API_KEY     optional → string | undefined
                 └── VOYAGE_API_KEY        optional → string | undefined
                            │
     apps/pipeline ─────────┴──▶ asserts both at boot → string
     apps/web      ──────────────asserts neither
```

**The optional tier needs an assertion helper, or it silently defeats the point of the package.** `string | undefined` reaching a call site as `config.VOYAGE_API_KEY!` moves the failure from startup to the first embedding call — exactly the outcome the fail-fast requirement exists to prevent, and worse than before because it now fails mid-job rather than at boot. The config package therefore exports a `requireKeys(...)`-style assertion that a service calls once in its entrypoint: it throws with the same naming-not-printing semantics as shared validation, and it narrows the type so downstream reads need no `!`.

The distinction is *which processes need a variable*, not *how important the variable is*. Both tiers fail at startup; the optional tier just picks its startups.

*Alternative considered:* per-app schemas that each extend a shared base, with the pipeline's schema marking the keys required. Cleaner in principle, but it puts the requirement in the app's configuration wiring rather than next to the code that consumes the key, and it means two schemas to keep in sync. The assertion helper keeps one schema and one source of truth.

*Alternative considered (rejected):* keep everything globally required, as originally designed. It gives the strongest guarantee but demands a Voyage account before anyone can run the web app locally — too high a toll for a guarantee the assertion helper provides anyway.

### Present-but-empty is a failure, not an absence

An optional variable is validated when present. `z.string().optional()` alone accepts `""`, which is the worst case: it passes validation, satisfies a presence assertion, and then fails at the provider with an opaque authentication error. The schema uses a non-empty check that still permits absence, so a blank line in `.env` is caught at startup rather than in an API response.

The config package is marked server-only. It holds API keys, and Next.js will happily bundle a module into client JavaScript if some component imports it. The `server-only` guard turns that mistake into a build error instead of a leaked credential.

## Risks / Trade-offs

**Config package imported into a client component → leaked API keys.** Mitigated by the `server-only` marker, which fails the build rather than shipping the keys. Reviewers should still treat any new import of `@nknews2/config` inside `apps/web` as worth a second look.

**pgvector extension not enabled on the Supabase instance.** The first migration issues `CREATE EXTENSION IF NOT EXISTS vector`. If the database role lacks permission to create extensions, this fails loudly at migration time — the correct place to fail. Supabase permits enabling `vector` from its dashboard as a fallback.

**The column width couples the schema to one requested output dimension.** The schema accepts only 512-wide vectors; changing width means an `ALTER TABLE` plus re-embedding every stored article. The cost is bounded — the column is nullable and unread until the clustering change, so exposure grows only with the article table — but it grows monotonically, so the switch gets more expensive the longer it is deferred. The cheap time to resolve any doubt is before ingestion starts filling the table.

**A mismatched output dimension fails at insert, far from its cause.** Because `voyage-3.5-lite` defaults to 1024, an embedding call that forgets the output-dimension parameter produces vectors the database rejects — inside a background job, with a Postgres type error rather than a message about the API call. Mitigated by deriving both the column width and the request parameter from one shared constant, so there is no second place to forget. The clustering change should also assert the returned vector's length before insert, so the error names the real cause.

**Optional keys can leak past startup as `undefined`.** The whole risk of the optional tier is a consumer writing `config.VOYAGE_API_KEY!` instead of asserting at boot, which relocates the failure to the first provider call. Mitigated by shipping the assertion helper in this change so the correct pattern exists before the first consumer does, and by the type being `string | undefined` — reaching the value requires either handling absence or writing a `!` that is visible in review. This is the one place where reviewers should be strict.

**Source-exporting packages requires `transpilePackages` in Next.js.** Omitting it produces a confusing parse error on the first `@nknews2/*` import from `apps/web`. Setting it is a single line in `next.config.ts` and is part of this change's tasks.

**No vector index yet.** Similarity queries against an unindexed `vector` column do a sequential scan. Irrelevant at this stage — nothing queries the column — but the clustering change must add an HNSW index before it relies on similarity search, or it will silently get slow as the article table grows.

**Turborepo caching can mask a broken clean build.** Cached task output can make a build appear to pass when a from-scratch build would fail. The setup task list includes verifying the build once with caching disabled.

## Migration Plan

There is nothing to migrate. This change creates a new database from an empty state:

1. Provision a PostgreSQL database on Supabase and enable the `vector` extension.
2. Copy `.env.example` to `.env` and fill in the connection string and API key.
3. Generate the initial migration from the schema definitions and apply it.
4. Verify both applications start and pass configuration validation.

**Rollback:** drop the schema and re-apply. No production data exists, and NKNews v1 runs on a separate database that this change never touches.

## Open Questions

These are deferrable — none changes the specs, the package layout, or the task breakdown:

- **Whether clustering uses embeddings at all**, or ports v1's title-Jaccard algorithm and leaves the column unused for now. Both remain open; the schema supports either.
- **Whether embeddings are computed from the title alone, or title plus description.** Affects cost and clustering quality, not the schema — the column stores one vector per article either way.
- **Which vector index type and distance operator** the clustering change should use. Deferred with the index itself.
- **The HTTP API surface** — Next.js route handlers reading `@nknews2/db` directly, versus a separate service. No endpoint is scaffolded here, so nothing forces the decision yet.
