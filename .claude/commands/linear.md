---
description: Manage Linear tickets - create, update, comment, and follow workflow patterns
---

# Linear - Ticket Management

You are tasked with managing Linear tickets, including creating tickets from thoughts documents, updating existing tickets, and following the team's specific workflow patterns.

## Initial Setup

First, verify that Linear MCP tools are available by checking if any `mcp__linear__` tools exist. If not, respond:

```
I need access to Linear tools to help with ticket management. Please run the `/mcp` command to enable the Linear MCP server, then try again.
```

If tools are available, respond based on the user's request:

### For general requests:

```
I can help you with Linear tickets. What would you like to do?
1. Create a new ticket from a thoughts document
2. Add a comment to a ticket (I'll use our conversation context)
3. Search for tickets
4. Update ticket status or details
```

### For specific create requests:

```
I'll help you create a Linear ticket from your thoughts document. Please provide:
1. The path to the thoughts document (or topic to search for)
2. Any specific focus or angle for the ticket (optional)
```

Then wait for the user's input.

## Team Workflow & Status Progression

The team follows a specific workflow to ensure alignment before code implementation:

1. **Backlog** - Default state
2. **Spec Needed** → More detail is needed - problem to solve and solution outline necessary
3. **Needs Research** → Ticket requires investigation before plan can be written
4. **Research In Progress** → Active research/investigation underway
5. **Needs Plan** → Research complete, ticket needs an implementation plan
6. **Plan in Progress** → Actively writing the implementation plan
7. **Plan Created** → Plan written, ready for review
8. **Ready for Dev** → Plan approved, ready for implementation
9. **Todo** → Queued for development
10. **In Progress** → Active development
11. **Code Review** → PR submitted
12. **Done** → Completed

**Key principle**: Review and alignment happen at the plan stage (not PR stage) to move faster and avoid rework.

## Important Conventions

### Default Values

- **Status**: Always create new tickets in "Backlog" status
- **Project**: For new tickets, default to "AWS Cost Savings" (ID: 83b501ba-7a4e-41fd-92c3-74ec25972535) unless told otherwise

### Automatic Label Assignment

Automatically apply labels based on the ticket content:

- **Bug**: For bug fixes and defects
- **Feature**: For new features and capabilities
- **Improvement**: For enhancements to existing functionality
- **claude**: For tickets created or worked on by Claude

## Action-Specific Instructions

### 1. Creating Tickets from Thoughts

#### Steps to follow after receiving the request:

1. **Locate and read the thoughts document:**
   - If given a path, read the document directly
   - If given a topic/keyword, search thoughts/ directory using Grep to find relevant documents
   - If multiple matches found, show list and ask user to select
   - Create a TodoWrite list to track: Read document → Analyze content → Draft ticket → Get user input → Create ticket

2. **Analyze the document content:**
   - Identify the core problem or feature being discussed
   - Extract key implementation details or technical decisions
   - Note any specific code files or areas mentioned
   - Look for action items or next steps
   - Identify what stage the idea is at (early ideation vs ready to implement)
   - Take time to ultrathink about distilling the essence of this document into a clear problem statement and solution approach

3. **Check for related context (if mentioned in doc):**
   - If the document references specific code files, read relevant sections
   - If it mentions other thoughts documents, quickly check them
   - Look for any existing Linear tickets mentioned

4. **Get Linear workspace context:**
   - List teams: `mcp__linear__list_teams`
   - If multiple teams, ask user to select one
   - List projects for selected team: `mcp__linear__list_projects`

5. **Draft the ticket summary:**
   Present a draft to the user:

   ```
   ## Draft Linear Ticket

   **Title**: [Clear, action-oriented title]

   **Description**:
   [2-3 sentence summary of the problem/goal]

   ## Key Details
   - [Bullet points of important details from thoughts]
   - [Technical decisions or constraints]
   - [Any specific requirements]

   ## Implementation Notes (if applicable)
   [Any specific technical approach or steps outlined]

   ## References
   - Source: `thoughts/[path/to/document.md]` ([View on GitHub](converted GitHub URL))
   - Related code: [any file:line references]
   - Parent ticket: [if applicable]

   ---
   Based on the document, this seems to be at the stage of: [ideation/planning/ready to implement]
   ```

6. **Interactive refinement:**
   Ask the user:
   - Does this summary capture the ticket accurately?
   - Which project should this go in? [show list]
   - What priority? (Default: Medium/3)
   - Any additional context to add?
   - Should we include more/less implementation detail?
   - Do you want to assign it to yourself?

   Note: Ticket will be created in "Backlog" status by default.

7. **Create the Linear ticket:**

   ```
   mcp__linear__create_issue with:
   - title: [refined title]
   - description: [final description in markdown]
   - teamId: [selected team]
   - projectId: [use default project from above unless user specifies]
   - priority: [selected priority number, default 3]
   - stateId: [Backlog status ID]
   - assigneeId: [if requested]
   - labelIds: [apply automatic label assignment from above]
   - links: [{url: "GitHub URL", title: "Document Title"}]
   ```

8. **Post-creation actions:**
   - Show the created ticket URL
   - Ask if user wants to:
     - Add a comment with additional implementation details
     - Create sub-tasks for specific action items
     - Update the original thoughts document with the ticket reference
   - If yes to updating thoughts doc:
     ```
     Add at the top of the document:
     ---
     linear_ticket: [URL]
     created: [date]
     ---
     ```

## Example transformations:

### From verbose thoughts:

```
"I've been thinking about how our resumed sessions don't inherit permissions properly.
This is causing issues where users have to re-specify everything. We should probably
store all the config in the database and then pull it when resuming. Maybe we need
new columns for permission_prompt_tool and allowed_tools..."
```

### To concise ticket:

```
Title: Fix resumed sessions to inherit all configuration from parent

Description:

## Problem to solve
Currently, resumed sessions only inherit Model and WorkingDir from parent sessions,
causing all other configuration to be lost. Users must re-specify permissions and
settings when resuming.

## Solution
Store all session configuration in the database and automatically inherit it when
resuming sessions, with support for explicit overrides.
```

### 2. Adding Comments and Links to Existing Tickets

When user wants to add a comment to a ticket:

1. **Determine which ticket:**
   - Use context from the current conversation to identify the relevant ticket
   - If uncertain, use `mcp__linear__get_issue` to show ticket details and confirm with user
   - Look for ticket references in recent work discussed

2. **Format comments for clarity:**
   - Attempt to keep comments concise (~10 lines) unless more detail is needed
   - Focus on the key insight or most useful information for a human reader
   - Not just what was done, but what matters about it
   - Include relevant file references with backticks and GitHub links

3. **File reference formatting:**
   - Wrap paths in backticks: `thoughts/allison/example.md`
   - Add GitHub link after: `([View](url))`
   - Do this for both thoughts/ and code files mentioned

4. **Comment structure example:**

   ```markdown
   Implemented retry logic in webhook handler to address rate limit issues.

   Key insight: The 429 responses were clustered during batch operations,
   so exponential backoff alone wasn't sufficient - added request queuing.

   Files updated:

   - `hld/webhooks/handler.go` ([GitHub](link))
   - `thoughts/shared/rate_limit_analysis.md` ([GitHub](link))
   ```

5. **Handle links properly:**
   - If adding a link with a comment: Update the issue with the link AND mention it in the comment
   - If only adding a link: Still create a comment noting what link was added for posterity
   - Always add links to the issue itself using the `links` parameter

6. **For comments with links:**

   ```
   # First, update the issue with the link
   mcp__linear__update_issue with:
   - id: [ticket ID]
   - links: [existing links + new link with proper title]

   # Then, create the comment mentioning the link
   mcp__linear__create_comment with:
   - issueId: [ticket ID]
   - body: [formatted comment with key insights and file references]
   ```

7. **For links only:**

   ```
   # Update the issue with the link
   mcp__linear__update_issue with:
   - id: [ticket ID]
   - links: [existing links + new link with proper title]

   # Add a brief comment for posterity
   mcp__linear__create_comment with:
   - issueId: [ticket ID]
   - body: "Added link: `path/to/document.md` ([View](url))"
   ```

### 3. Searching for Tickets

When user wants to find tickets:

1. **Gather search criteria:**
   - Query text
   - Team/Project filters
   - Status filters
   - Date ranges (createdAt, updatedAt)

2. **Execute search:**

   ```
   mcp__linear__list_issues with:
   - query: [search text]
   - teamId: [if specified]
   - projectId: [if specified]
   - stateId: [if filtering by status]
   - limit: 20
   ```

3. **Present results:**
   - Show ticket ID, title, status, assignee
   - Group by project if multiple projects
   - Include direct links to Linear

### 4. Updating Ticket Status

When moving tickets through the workflow:

1. **Get current status:**
   - Fetch ticket details
   - Show current status in workflow

2. **Suggest next status:**
   - Backlog → Spec Needed (lacks detail/problem statement)
   - Spec Needed → Needs Research (once problem/solution outlined but needs investigation)
   - Needs Research → Research In Progress (starting research)
   - Research In Progress → Needs Plan (research complete, needs implementation plan)
   - Needs Plan → Plan in Progress (starting to write plan)
   - Plan in Progress → Plan Created (plan written)
   - Plan Created → Ready for Dev (plan approved)
   - Ready for Dev → Todo (queued for development)
   - Todo → In Progress (work started)
   - In Progress → Code Review (PR submitted)

3. **Update with context:**

   ```
   mcp__linear__update_issue with:
   - id: [ticket ID]
   - stateId: [new status ID]
   ```

   Consider adding a comment explaining the status change.

## Important Notes

- Keep tickets concise but complete - aim for scannable content
- All tickets should include a clear "problem to solve" - if the user asks for a ticket and only gives implementation details, you MUST ask "To write a good ticket, please explain the problem you're trying to solve from a user perspective"
- Focus on the "what" and "why", include "how" only if well-defined
- Always preserve links to source material using the `links` parameter
- Don't create tickets from early-stage brainstorming unless requested
- Use proper Linear markdown formatting
- Include code references as: `path/to/file.ext:linenum`
- Ask for clarification rather than guessing project/status
- Remember that Linear descriptions support full markdown including code blocks
- Always use the `links` parameter for external URLs (not just markdown links)
- remember - you must get a "Problem to solve"!

## Comment Quality Guidelines

When creating comments, focus on extracting the **most valuable information** for a human reader:

- **Key insights over summaries**: What's the "aha" moment or critical understanding?
- **Decisions and tradeoffs**: What approach was chosen and what it enables/prevents
- **Blockers resolved**: What was preventing progress and how it was addressed
- **State changes**: What's different now and what it means for next steps
- **Surprises or discoveries**: Unexpected findings that affect the work

Avoid:

- Mechanical lists of changes without context
- Restating what's obvious from code diffs
- Generic summaries that don't add value

Remember: The goal is to help a future reader (including yourself) quickly understand what matters about this update.

## Commonly Used IDs

### Foobar Software Team

- **Team ID**: `5f0067ca-18c7-4a84-99a6-dd267806e6cc`

### Project IDs

- **AWS Cost Savings**: `83b501ba-7a4e-41fd-92c3-74ec25972535`
- **Human Layer Fork**: `77ee6e40-cc56-4b79-97a7-dcbc9c4ae2cd`

### Label IDs

- **Bug**: `f0323f3e-0b96-4d05-9644-5b5198a1ae48`
- **Feature**: `d73424d2-fab2-4b53-9363-e15241193e33`
- **Improvement**: `c6e2a425-5268-444b-aaee-d9ea33c37fc7`
- **claude**: `d8b16f69-391d-4b24-9144-4af05fe33621`

### Workflow State IDs

- **Backlog**: `5ac5ac92-14be-4917-b1eb-85353b6e8e76` (type: backlog)
- **Spec Needed**: `40c85135-59cb-4b2b-a20b-6858dd964246` (type: backlog)
- **Needs Research**: `6a93bb8f-fe6b-4f39-8482-b61009c667e8` (type: backlog)
- **Research In Progress**: `c521bdc7-b7bc-4076-ae54-7d4c1d8e7079` (type: backlog)
- **Needs Plan**: `d37010da-80ce-4d62-9271-60f8f7b516de` (type: unstarted)
- **Plan in Progress**: `e67d05ce-53e7-454f-bc15-8d85958cbec4` (type: unstarted)
- **Plan Created**: `ec853c6c-21a6-44f5-bc4c-101a653bb4ec` (type: unstarted)
- **Ready for Dev**: `0f6284ed-4dcd-44bf-9f63-7c9f9258dbff` (type: unstarted)
- **Todo**: `bdf1637a-017e-47bf-b845-2ba6d1994ed6` (type: unstarted)
- **In Progress**: `9fdbfaeb-363b-41d7-80dd-c9fb0c48afcc` (type: started)
- **Code Review**: `0bf0f7c8-e0fe-4038-93c7-ad042f8650a8` (type: started)
- **Done**: `9b8204bc-fc10-4d9c-a5a2-cd569fce205e` (type: completed)
- **Duplicate**: `62cfe533-1acd-40c3-a294-dba1eb6b31a8` (type: canceled)
- **Canceled**: `2f22ad43-1199-4281-994b-d23857a34c78` (type: canceled)

## Linear User IDs

- stobias123 (Steven Tobias): `06f3d4dc-4336-4692-94d7-cb40d4e8584a`
