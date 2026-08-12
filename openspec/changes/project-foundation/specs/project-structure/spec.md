## Purpose

Defines how the NKNews2 repository is divided into applications and shared packages, what each part may depend on, and how type-checking and builds run across the whole workspace so the web reader and the pipeline worker cannot drift apart.

## ADDED Requirements

### Requirement: Workspace package topology

The repository SHALL be a single workspace containing exactly two applications — a web application and a pipeline worker — and three shared packages providing database access, shared domain types, and validated configuration. Each application and package SHALL declare its own manifest with its own dependencies.

#### Scenario: Installing the workspace

- **WHEN** a developer installs dependencies from the repository root
- **THEN** every application and package is linked into the workspace in a single operation
- **AND** no application or package requires a separate install step

#### Scenario: Package declares its own dependencies

- **WHEN** any application or package requires a third-party library
- **THEN** that library is declared in that package's own manifest
- **AND** the package builds without relying on a dependency hoisted from an unrelated package

### Requirement: Workspace import aliases

Applications SHALL import shared packages through stable workspace aliases under the `@nknews2/` namespace — `@nknews2/db`, `@nknews2/types`, and `@nknews2/config` — rather than through relative filesystem paths that cross package boundaries.

#### Scenario: Application imports a shared package

- **WHEN** either application imports from `@nknews2/db`, `@nknews2/types`, or `@nknews2/config`
- **THEN** the import resolves to the corresponding workspace package
- **AND** the imported symbols carry their full TypeScript types with no `any` fallback

#### Scenario: Relative import across a package boundary

- **WHEN** source code in an application uses a relative path that escapes its own package directory to reach another package
- **THEN** the workspace configuration is considered violated and the code SHALL be changed to use the alias

### Requirement: Dependency direction

Dependencies SHALL flow from applications to packages only. No shared package SHALL import from an application, and no application SHALL import from another application.

#### Scenario: Package attempts to import an application

- **WHEN** a shared package imports a module belonging to the web application or the pipeline worker
- **THEN** this is a violation of the workspace contract and the import SHALL be removed

#### Scenario: Both applications use the same schema

- **WHEN** the web application and the pipeline worker each read the same database table
- **THEN** both obtain the table definition from the database package
- **AND** neither declares its own copy of the schema

### Requirement: TypeScript configuration inheritance

Every application and package SHALL have its own TypeScript configuration that extends a single base configuration defined at the repository root. The base configuration SHALL enable strict type-checking and SHALL target ES modules on Node.js 22.

#### Scenario: Compiler option changed once

- **WHEN** a compiler option is changed in the root base configuration
- **THEN** every application and package inherits the change without individual edits

#### Scenario: Type error anywhere in the workspace

- **WHEN** a developer runs the workspace type-check task
- **THEN** type errors in any application or package are reported
- **AND** the task exits with a non-zero status

### Requirement: ES modules throughout

All first-party code SHALL be authored and executed as ES modules. No package SHALL emit or consume CommonJS as its own module format.

#### Scenario: Running the pipeline worker

- **WHEN** the pipeline worker is started
- **THEN** it executes as an ES module under Node.js 22 without a transpile-to-CommonJS step

### Requirement: Workspace task orchestration

The workspace SHALL expose repository-root tasks that build, type-check, and run the applications, resolving inter-package dependency order automatically so that a package is built before any consumer that depends on it.

#### Scenario: Building from a clean checkout

- **WHEN** a developer runs the workspace build task on a clean checkout
- **THEN** shared packages are built before the applications that import them
- **AND** the build completes without the developer specifying an order

#### Scenario: Rebuilding with no changes

- **WHEN** the workspace build task runs a second time with no source changes
- **THEN** unchanged tasks are served from cache rather than re-executed
