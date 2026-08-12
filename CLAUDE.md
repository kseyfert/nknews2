## Git conventions

### Commit format
type(scope): description

### Commit types — follow OpenSpec conventions
- spec: creating or modifying specs, proposals (openspec/specs/, proposal.md)
- task: generating or updating execution tasks (tasks.md)
- design: documenting architecture and decisions (design.md)
- archive: merging finalized feature delta (openspec/changes/archive/)
- feat: new feature implementation
- fix: bug fix
- chore: tooling, dependencies, config
- refactor: code change without new feature

### OpenSpec workflow
When I explicitly say "commit the proposal" — commit current openspec state:
spec(<change-name>): propose <what>

When I explicitly say "commit the implementation":
feat(<scope>): <what was built>

When I explicitly say "commit the archive":
archive(<change-name>): finalize <what>

### Rules
- Never auto-commit — always wait for explicit instruction
- Never commit .env files
- Always commit .env.example
- Always commit openspec/ directory changes
- One logical change per commit