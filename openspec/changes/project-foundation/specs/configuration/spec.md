## Purpose

Defines the environment variable contract for NKNews2 — which variables the system requires, how they are validated, and the guarantee that a misconfigured process fails immediately at startup with an actionable message instead of failing later at the point of use.

## ADDED Requirements

### Requirement: Validated configuration contract

The system SHALL expose configuration to applications only as a validated, fully typed object. Application code SHALL NOT read environment variables directly.

#### Scenario: Application reads a globally required value

- **WHEN** an application reads a globally required configuration value
- **THEN** the value's type is a plain non-nullable type requiring no runtime check or non-null assertion

#### Scenario: Application reads an optional value

- **WHEN** an application reads an optional configuration value
- **THEN** its type is possibly-undefined, so the compiler forces the consumer to either handle absence or assert the requirement

#### Scenario: Optional variable with a default

- **WHEN** a variable that has a declared default is absent from the environment
- **THEN** validation succeeds and the declared default is supplied

### Requirement: Fail-fast startup validation

Configuration SHALL be validated when a process starts. If any required variable is missing or fails its validation rule, the process SHALL exit non-zero before performing any work such as opening a database connection, serving a request, or calling an external API.

#### Scenario: Required variable missing

- **WHEN** a process starts with a required variable absent from the environment
- **THEN** the process exits with a non-zero status
- **AND** no database connection is opened and no external request is made

#### Scenario: All problems reported together

- **WHEN** a process starts with several variables missing or malformed at once
- **THEN** the failure message names every offending variable and why each failed
- **AND** the developer is not required to fix them one at a time across repeated restarts

#### Scenario: Secret values are not leaked

- **WHEN** a validation failure message is emitted
- **THEN** it names the offending variables without printing their values

#### Scenario: Valid environment

- **WHEN** a process starts with every required variable present and well-formed
- **THEN** validation passes silently and startup proceeds

### Requirement: Declared variables and their tiers

The configuration contract SHALL declare, at minimum, a PostgreSQL connection string, an Anthropic API key, and a Voyage AI API key. Each variable SHALL belong to exactly one of two tiers:

- **Globally required** — every process needs it, so its absence fails validation for every process. The PostgreSQL connection string SHALL be globally required and SHALL be validated as a well-formed PostgreSQL URL.
- **Optional in the shared contract** — only some services need it, so its absence SHALL NOT fail shared validation. The Anthropic API key and the Voyage AI API key SHALL both be optional in this tier.

A variable in the optional tier SHALL still be validated when it is present: supplying an empty or whitespace-only value SHALL fail validation rather than being accepted as a usable credential.

#### Scenario: Malformed connection string

- **WHEN** the database connection string is present but is not a well-formed PostgreSQL URL
- **THEN** validation fails and identifies that variable as the cause

#### Scenario: Database connection string missing

- **WHEN** any process starts without the database connection string
- **THEN** shared validation fails regardless of which service is starting

#### Scenario: Optional key absent

- **WHEN** a process starts with the Anthropic API key and the Voyage AI API key both absent
- **THEN** shared validation succeeds
- **AND** each key is exposed to consumers as undefined

#### Scenario: Optional key present but empty

- **WHEN** an optional API key is set to an empty or whitespace-only value
- **THEN** validation fails and identifies that variable as the cause
- **AND** the value is not treated as a usable credential

### Requirement: Per-service required variables

A service that consumes an optional variable SHALL assert that variable's presence at its own startup, before performing any work that depends on it. The assertion SHALL fail with the same guarantees as shared validation: non-zero exit, the variable named, and its value not printed.

This keeps the failure at process start rather than at the first call site, without forcing every process to hold credentials it never uses.

#### Scenario: Service starts without a key it needs

- **WHEN** a service that consumes an optional API key starts while that key is absent
- **THEN** the process exits non-zero at startup
- **AND** the message names the missing variable and the service that requires it
- **AND** no request is made to the provider that key authenticates

#### Scenario: Service starts without a key it does not need

- **WHEN** a service that consumes neither API key starts while both are absent
- **THEN** the service starts normally and performs its work

#### Scenario: Asserted value is narrowed

- **WHEN** a service asserts an optional variable's presence
- **THEN** subsequent reads of that variable in that service are typed as defined, requiring no repeated non-null assertion

#### Scenario: Unused capability does not block startup

- **WHEN** a variable is declared in the contract for a capability that no service consumes yet
- **THEN** its absence blocks no process from starting

### Requirement: Example environment file

The repository SHALL contain a checked-in example environment file listing every variable the contract declares — both tiers — with placeholder rather than real values. Each entry SHALL indicate whether it is globally required or optional, and for optional entries, which services require it. Copying the example and filling in real values SHALL be sufficient to satisfy validation.

#### Scenario: New developer sets up the project

- **WHEN** a developer copies the example file and supplies real values for each entry
- **THEN** both applications start and pass configuration validation
- **AND** no variable the contract declares is missing from the example

#### Scenario: Developer omits an optional key

- **WHEN** a developer fills in only the globally required entries and leaves the optional ones blank or removed
- **THEN** every service that does not consume those keys starts successfully
- **AND** the example file told them which services they have given up by doing so

#### Scenario: Example contains no secrets

- **WHEN** the example environment file is inspected
- **THEN** every value is a placeholder
- **AND** no real credential, key, or connection string is present
