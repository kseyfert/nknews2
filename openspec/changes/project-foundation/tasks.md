## 1. Workspace foundation

- [ ] 1.1 Remove the v1 placeholder `src/index.ts` and the current root `tsconfig.json`/`package.json` contents
- [ ] 1.2 Write the root `package.json` as a private workspace root: `"type": "module"`, `packageManager` pinned to pnpm, `engines.node >= 22`, no runtime dependencies
- [ ] 1.3 Add `pnpm-workspace.yaml` declaring the `apps/*` and `packages/*` globs
- [ ] 1.4 Write the root base `tsconfig.json`: `strict: true`, ES2023 target, ESM module resolution, `noEmit` by default, no project-specific paths
- [ ] 1.5 Add `turbo.json` defining `build`, `typecheck`, `dev`, and `lint` tasks, with `build` and `typecheck` declaring `dependsOn: ["^build"]`
- [ ] 1.6 Add root scripts delegating to Turborepo (`build`, `typecheck`, `dev`) so no task requires knowing package order
- [ ] 1.7 Add root `.gitignore` covering `node_modules`, `.env`, `.next`, `.turbo`, and build output

## 2. Configuration package (`@nknews2/config`)

- [ ] 2.1 Create `packages/config` with a manifest naming it `@nknews2/config`, `"type": "module"`, entry point exporting `./src/index.ts`, depending on `zod` and `server-only`
- [ ] 2.2 Add its `tsconfig.json` extending the root base config
- [ ] 2.3 Define the globally required tier of the Zod schema: `DATABASE_URL` validated as a PostgreSQL URL, plus `NODE_ENV` with a default
- [ ] 2.4 Define the optional tier: `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY`, each optional but rejected when present-and-empty, so they surface as `string | undefined`
- [ ] 2.5 Parse `process.env` at module load and export the frozen validated object as the package's only configuration surface
- [ ] 2.6 On validation failure, print every offending variable name with its reason — never its value — and exit non-zero before any other work
- [ ] 2.7 Export the per-service assertion helper: given one or more optional variable names, it either returns them narrowed to defined values or exits non-zero naming the missing variables and the requiring service, without printing values
- [ ] 2.8 Import `server-only` in the package entry point so a client-component import fails the build
- [ ] 2.9 Write root `.env.example` listing every declared variable with placeholder values only, marking each as globally required or optional and naming which services need the optional ones

## 3. Shared types package (`@nknews2/types`)

- [ ] 3.1 Create `packages/types` with a manifest naming it `@nknews2/types`, `"type": "module"`, entry point exporting `./src/index.ts`, and no runtime dependencies
- [ ] 3.2 Add its `tsconfig.json` extending the root base config
- [ ] 3.3 Establish the export surface with the domain types shared by both apps today, keeping it free of database-row types (those are derived from the schema in `@nknews2/db`)
- [ ] 3.4 Export the embedding constants as the single source of truth: the model name `voyage-3.5-lite` and the requested output dimension `512`, with a comment noting the model defaults to 1024 and that 512 must be requested explicitly on every call

## 4. Database package (`@nknews2/db`)

- [ ] 4.1 Create `packages/db` with a manifest naming it `@nknews2/db`, `"type": "module"`, entry point exporting `./src/index.ts`, depending on `drizzle-orm`, `postgres`, `@nknews2/config`, and `@nknews2/types`, with `drizzle-kit` as a dev dependency
- [ ] 4.2 Add its `tsconfig.json` extending the root base config
- [ ] 4.3 Define the `providers` table: identity primary key, name, unique feed source, optional website, feed type defaulting to `rss`, `hidden` and `disabled` booleans defaulting to false, and a `timestamptz` creation timestamp
- [ ] 4.4 Define the `articles` table mirroring v1's field configuration minus every localized field and minus `clusterId`: identity primary key, provider foreign key, title, unique URL, optional description, optional image URL, a text array of provider categories defaulting to empty, source language defaulting to `en`, and `timestamptz` publication and fetch timestamps
- [ ] 4.5 Add the nullable embedding column to `articles`, taking its width from the shared embedding-dimension constant rather than a literal, with a comment recording that the width is *requested* from `voyage-3.5-lite` (which defaults to 1024) and that the API call carries the matching obligation
- [ ] 4.6 Configure `snake_case` column naming so the database reads idiomatically while TypeScript stays `camelCase`
- [ ] 4.7 Create the database client using `postgres.js` with `prepare: false`, reading the connection string from `@nknews2/config`, with a comment recording that the flag is required by Supabase's transaction-mode pooler
- [ ] 4.8 Write the package entry point re-exporting the client and every table schema so consumers never import internal paths
- [ ] 4.9 Add `drizzle.config.ts` inside `packages/db`, pointing at the schema definitions and a package-local migrations directory
- [ ] 4.10 Add `db:generate`, `db:migrate`, and `db:studio` scripts to the package manifest
- [ ] 4.11 Generate the initial migration and prepend `CREATE EXTENSION IF NOT EXISTS vector` so it runs before the embedding column is created

## 5. Pipeline worker (`apps/pipeline`)

- [ ] 5.1 Create `apps/pipeline` with a manifest, `"type": "module"`, `tsx` as a dev dependency, and workspace dependencies on `@nknews2/db`, `@nknews2/types`, and `@nknews2/config`
- [ ] 5.2 Add its `tsconfig.json` extending the root base config
- [ ] 5.3 Write the entrypoint: import configuration (triggering validation), open a database connection, issue one trivial query to prove connectivity, log success, and shut down cleanly
- [ ] 5.4 Add `dev` and `start` scripts running the entrypoint under `tsx`

## 6. Web application (`apps/web`)

- [ ] 6.1 Create `apps/web` as a Next.js 15 App Router application with React 19, and workspace dependencies on `@nknews2/db`, `@nknews2/types`, and `@nknews2/config`
- [ ] 6.2 Add its `tsconfig.json` extending the root base config, preserving the Next.js-required compiler settings
- [ ] 6.3 Set `transpilePackages` in `next.config.ts` to include every `@nknews2/*` package, since they export TypeScript source
- [ ] 6.4 Add a root layout and a single placeholder page that performs a server-side import from `@nknews2/db` to prove the alias and types resolve end to end

## 7. Verification

- [ ] 7.1 Run a clean install and a from-scratch build with Turborepo caching disabled; confirm packages build before their consumers with no manual ordering
- [ ] 7.2 Run workspace-wide type-check and confirm it reports errors from any package and exits non-zero on failure
- [ ] 7.3 Apply the migration sequence to an empty PostgreSQL database; confirm the extension is enabled and both tables exist with every constraint
- [ ] 7.4 Re-run migration generation with no pending schema edits and confirm no new migration file is produced
- [ ] 7.5 Confirm the uniqueness constraints reject a duplicate provider feed source and a duplicate article URL, leaving the existing rows unchanged
- [ ] 7.6 Confirm the embedding column accepts a 512-dimension vector, accepts null, and rejects a vector of any other dimension — including a 1024-wide one, the width `voyage-3.5-lite` returns by default
- [ ] 7.7 Confirm the generated migration's column width traces back to the shared constant, so changing the constant changes the schema
- [ ] 7.8 Confirm that starting either app without `DATABASE_URL` — and with other variables malformed at the same time — exits non-zero, names every problem at once, prints no values, and opens no database connection
- [ ] 7.9 Confirm both apps start normally with `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` absent, since no service consumes them yet
- [ ] 7.10 Confirm an optional key set to an empty string fails validation rather than being accepted as a credential
- [ ] 7.11 Confirm the assertion helper exits non-zero naming the variable and the requiring service when a required-by-that-service key is absent, and narrows the type to defined on success
- [ ] 7.12 Confirm both apps resolve `@nknews2/db`, `@nknews2/types`, and `@nknews2/config` with full types, and that no source file reaches another package by relative path
