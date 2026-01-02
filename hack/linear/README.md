# Linear CLI

A command-line interface for interacting with Linear issue tracking.

## Features

### Issue Management
- **Create issues** (`create-issue`) - Create new issues with full field support
- **Update issues** (`update-issue`) - Update any issue field (title, description, status, priority, assignee, labels, project, parent)
- **View issue details** (`get-issue`, `get-issue-v2`) - Show issue details, comments, and parent hierarchy
- **List/filter issues** (`list-issues`, `my-issues`) - Filter by status, assignee, size with JSON/markdown output
- **Add comments** (`add-comment`) - Add comments to issues
- **Update status** (`update-status`) - Change issue workflow state
- **Add links** (`add-link`) - Attach URLs to issues
- **Assign to self** (`assign-to-me`) - Quick self-assignment

### Workspace Discovery
- **List teams** (`list-teams`) - Show all teams in workspace
- **List projects** (`list-projects`) - Show projects (optionally filtered by team)
- **List labels** (`list-labels`) - Show available labels (workspace or team-specific)
- **List statuses** (`list-statuses`) - Show workflow states for a team

### Additional Features
- Download all images from issues (`fetch-images`)
- Automatically detect issue IDs from git branch names
- Shell completions for fish, zsh, and bash
- JSON and markdown output formats
- Cross-platform with support for multiple JavaScript runtimes
- Smart handling of environment variables (only requires API key for operations)

## Setup

1. Make sure you have a Linear API key (you'll need it for actual operations, but not for help/completion):
   ```
   export LINEAR_API_KEY=your_api_key
   ```

2. Install the CLI, from this directory run:
   ```
   npm install -g .
   ```

3. Alternatively, you can add the directory to your PATH or create a symlink manually.

## Usage

```bash
# === Workspace Discovery ===

# List all teams
linear list-teams
linear list-teams --output-format json

# List projects (optionally filter by team)
linear list-projects
linear list-projects --team ENG

# List labels
linear list-labels
linear list-labels --team ENG

# List workflow statuses for a team
linear list-statuses ENG

# === Issue Management ===

# Create a new issue
linear create-issue --title "Fix login bug" --team ENG
linear create-issue -t "Add dark mode" --team ENG -d "User requested dark mode support" \
  --project "UI Improvements" --priority high --state "Backlog" \
  --assignee me --labels "Feature,UI"

# Update an existing issue
linear update-issue ENG-123 --state "In Progress"
linear update-issue ENG-123 --priority urgent --assignee "John Doe"
linear update-issue ENG-123 --labels "Bug,Critical"  # Replaces all labels
linear update-issue ENG-123 --labels none  # Clears all labels

# List your assigned active issues
linear list-issues
linear list-issues --status "In Progress" --output-format json

# View details of an issue
linear get-issue ENG-123
# Or if your git branch contains the issue ID (e.g., feature/ENG-123-something)
linear get-issue

# Add a comment to an issue
linear add-comment "This is my comment" --issue-id ENG-123  # Explicit ID
linear add-comment "This is my comment"  # Uses git branch auto-detection

# Update issue status
linear update-status ENG-123 "In Progress"

# Add a link to an issue
linear add-link ENG-123 "https://github.com/org/repo/pull/456" --title "PR #456"

# Assign issue to yourself
linear assign-to-me ENG-123

# Download all images from an issue to local thoughts directory
linear fetch-images ENG-123
```

### Fetch Images

Download all images from a Linear issue to the local thoughts directory:

```bash
linear fetch-images ENG-123
```

This command:
- Downloads all images embedded in the issue description and comments
- Saves them to `thoughts/shared/images/ENG-123/`
- Names files as `ENG-123-01.png`, `ENG-123-02.jpg`, etc.
- Outputs the list of saved file paths (one per line)
- Shows progress messages to stderr

Example output:
```
Downloaded 2 images:
thoughts/shared/images/ENG-123/ENG-123-01.png
thoughts/shared/images/ENG-123/ENG-123-02.jpg
```

### Add Comment Requirements

- Message is required as the first parameter
- Issue ID is either:
  - Auto-detected from git branch name (e.g., `feature/ENG-123-something`)
  - Provided with the `--issue-id` or `-i` option (e.g., `-i ENG-123`) 
- If neither is available, the tool will prompt you to use one of these options

## Shell Completions

You can also manually generate and install completions for your shell with:

```bash
# Fish
linear completion --fish > ~/.config/fish/completions/linear.fish

# Zsh
mkdir -p ~/.zsh/completions
linear completion --zsh > ~/.zsh/completions/_linear
# Add to .zshrc: fpath=(~/.zsh/completions $fpath)
# Then: autoload -U compinit && compinit

# Bash
mkdir -p ~/.bash_completion.d
linear completion --bash > ~/.bash_completion.d/linear
# Add to .bashrc: source ~/.bash_completion.d/linear
```

## Requirements

One of the following JavaScript runtimes:
- Bun (recommended for speed)
- Node.js with ts-node or tsx
- npm with npx

Required npm packages (installed automatically by setup.sh):
- @linear/sdk
- commander
- chalk
- inquirer

## Development

Clone the repository and install dependencies:

```bash
cd hack/linear
bun install  # or npm install
```

### Files Overview

- `linear-cli.ts` - Main CLI implementation
- `linear` - Shell wrapper script (detects runtime and executes the TypeScript)
- `setup.sh` - Installation and setup helper
- `package.json` - Dependencies and configuration
- `tsconfig.json` - TypeScript configuration

## Update your CLAUDE.md

You may find it helpful to add a note to your `~/.claude/CLAUDE.md`:

```md
## Linear
When asked to fetch a Linear ticket, use the globally installed Linear CLI: `linear get-issue ENG-XXXX > thoughts/shared/tickets/eng-XXXX.md`
```
