## Purpose

Defines the PostgreSQL persistence layer for NKNews2 — the tables that store RSS providers and the articles fetched from them, the vector column reserved for article embeddings, and the single database client both applications share.

## ADDED Requirements

### Requirement: Provider records

The system SHALL persist RSS providers. A provider record SHALL carry a display name, a feed source identifier, an optional website URL, a feed type defaulting to RSS, independent `hidden` and `disabled` flags each defaulting to false, and a creation timestamp.

#### Scenario: Storing a provider

- **WHEN** a provider is stored with a name and a feed source
- **THEN** the record persists with `hidden` and `disabled` both false
- **AND** a creation timestamp is recorded automatically

#### Scenario: Duplicate feed source rejected

- **WHEN** a provider is stored with a feed source identifier that already exists
- **THEN** the write is rejected by a uniqueness constraint
- **AND** the existing provider record is left unchanged

### Requirement: Article records

The system SHALL persist articles fetched from providers. An article record SHALL carry the owning provider reference, a title, a URL, an optional description, an optional image URL, a list of provider-assigned category strings, a source language code defaulting to English, a publication timestamp, and a fetch timestamp.

#### Scenario: Storing an article

- **WHEN** an article is stored with a provider reference, title, URL, and publication timestamp
- **THEN** the record persists with an automatically recorded fetch timestamp
- **AND** its provider-assigned categories default to an empty list when none are supplied

#### Scenario: Duplicate URL rejected

- **WHEN** an article is stored with a URL that already exists
- **THEN** the write is rejected by a uniqueness constraint
- **AND** the existing article record is left unchanged

#### Scenario: Article requires a valid provider

- **WHEN** an article is stored referencing a provider that does not exist
- **THEN** the write is rejected by referential integrity

#### Scenario: Content is English-only

- **WHEN** any article text field is read
- **THEN** exactly one value is returned for that field
- **AND** no per-language variant of the field exists in the schema

### Requirement: Article embedding column

Each article SHALL have a nullable 512-dimension vector column reserved for a semantic embedding of the article. The dimension SHALL match the output width requested from the `voyage-3.5-lite` embedding model, which supports 2048, 1024, 512, and 256 and returns 1024 unless a width is requested explicitly. The column SHALL be nullable so that articles can be stored before any embedding is computed.

The column width and the width requested from the embedding provider SHALL derive from a single shared constant, so the two cannot diverge.

#### Scenario: Storing an article without an embedding

- **WHEN** an article is stored and no embedding is supplied
- **THEN** the write succeeds and the embedding column is null

#### Scenario: Storing an embedding

- **WHEN** a 512-dimension vector is written to an article's embedding column
- **THEN** the value persists and is readable as a 512-element numeric vector

#### Scenario: Wrong dimension rejected

- **WHEN** a vector whose dimension is not 512 is written to the embedding column
- **THEN** the write is rejected by the database

#### Scenario: Embedding width is changed

- **WHEN** the shared embedding-width constant is changed to another value the model supports
- **THEN** the column definition and the width requested from the provider both follow from that single edit
- **AND** no second location needs updating to keep them consistent

### Requirement: Vector extension availability

The database SHALL have the vector extension enabled before any schema depending on vector columns is applied, and the migration sequence SHALL enable it rather than assuming it is present.

#### Scenario: Applying migrations to a database without the extension

- **WHEN** migrations are applied to a PostgreSQL database where the vector extension has not been enabled
- **THEN** the migration sequence enables the extension before creating the embedding column
- **AND** the migration run completes successfully

### Requirement: Exported database client and schema

The database package SHALL export a configured database client and every table schema it defines. Consumers SHALL obtain both from the package's public entry point without reaching into its internal file structure.

#### Scenario: Application queries the database

- **WHEN** an application imports the database client and a table schema from the package entry point
- **THEN** it can issue a typed query against that table
- **AND** query results are typed from the schema definition with no manual type assertion

#### Scenario: Client obtains its connection string

- **WHEN** the database client is created
- **THEN** it uses the validated database connection string from the configuration contract
- **AND** it does not read the raw environment directly

### Requirement: Reproducible migrations

Schema changes SHALL be expressed as checked-in migration files generated from the schema definitions. Applying the full migration sequence to an empty database SHALL produce a schema identical to the one the definitions describe.

#### Scenario: Fresh database setup

- **WHEN** the migration sequence is applied to an empty PostgreSQL database
- **THEN** the provider and article tables exist with all constraints described above
- **AND** no further manual schema steps are required

#### Scenario: Schema and migrations agree

- **WHEN** migration generation is run with no pending schema edits
- **THEN** no new migration file is produced
