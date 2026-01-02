---
name: Linear Ticket Management
description: Use when creating, updating, or querying Linear tickets. Triggers include "create linear ticket", "update ticket", "my linear issues", "mark ticket done", "work on LINEAR-123".
---

# Linear Ticket Management

Manage Linear tickets using the MCP Linear tools. Use `--help` on any command for full options.

## Core Principle

**Every ticket needs a "problem to solve"** - If given implementation details without a problem statement, ask for the user perspective first.

## Discovery Commands (Start Here)

```bash
# Discover workspace structure
linear list-teams
linear list-projects --team <team>
linear list-statuses <team>
linear list-labels --team <team>

# Find issues
linear list-issues --assignee me --limit 10
linear get-issue <TICKET-ID>
```

## Creating Tickets

### From Thoughts Documents

1. Read the document and identify the core problem
2. Discover team/project with `list-teams` and `list-projects`
3. Draft a concise ticket focusing on "what" and "why"
4. Create with appropriate labels

```bash
linear create-issue \
  --title "Clear, action-oriented title" \
  --team "<team>" \
  --description "Problem statement and key details" \
  --state "Backlog" \
  --labels "Feature,claude"
```

### Ticket Format

```markdown
## Problem to solve
[2-3 sentence summary]

## Key Details
- [Important constraints or requirements]

## References
- Source: `thoughts/path/to/doc.md`
```

## Updating Tickets

```bash
# Update status
linear update-status <TICKET-ID> "In Progress"

# Full update (use --help for all options)
linear update-issue <TICKET-ID> --state "Done" --assignee me
```

## Comments and Links

```bash
# Add comment
linear add-comment "Key insight from investigation" --issue-id <TICKET-ID>

# Add link
linear add-link <TICKET-ID> "<URL>" --title "GitHub PR"
```

Focus comments on: key insights, decisions made, blockers resolved, surprises discovered.

## Workflow States

```
Backlog → Spec Needed → Needs Research → Research In Progress
       → Needs Plan → Plan in Progress → Plan Created
       → Ready for Dev → Todo → In Progress → Code Review → Done
```

Use `linear list-statuses <team>` to get state IDs for your workspace.

## Automatic Labels

| Label | When to Apply |
|-------|---------------|
| Bug | Bug fixes and defects |
| Feature | New features |
| Improvement | Enhancements |
| claude | Tickets created/worked by Claude |

## Defaults

- **Status**: Backlog
- **Priority**: Normal (3) unless specified
