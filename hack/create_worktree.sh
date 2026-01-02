#!/bin/bash

# create_worktree.sh - Create a new worktree for development work
# Usage: ./create_worktree.sh SRC_PATH DST_PATH

set -e

if [ $# -ne 2 ]; then
    echo "Usage: $0 SRC_PATH DST_PATH"
    echo "  SRC_PATH: Path to the source repository"
    echo "  DST_PATH: Path where the worktree will be created"
    exit 1
fi

SRC_PATH="$1"
DST_PATH="$2"
BRANCH_NAME=$(basename "$DST_PATH")

# Validate source is a git repo
if [ ! -d "$SRC_PATH/.git" ] && [ ! -f "$SRC_PATH/.git" ]; then
    echo "❌ Error: $SRC_PATH is not a git repository"
    exit 1
fi

# Check if destination already exists
if [ -d "$DST_PATH" ]; then
    echo "❌ Error: $DST_PATH already exists"
    exit 1
fi

# Create parent directory if needed
mkdir -p "$(dirname "$DST_PATH")"

echo "🌳 Creating worktree: $BRANCH_NAME"
echo "📁 From: $SRC_PATH"
echo "📁 To: $DST_PATH"

cd "$SRC_PATH"

# Create worktree with new branch
if git show-ref --verify --quiet "refs/heads/${BRANCH_NAME}"; then
    echo "📋 Using existing branch: ${BRANCH_NAME}"
    git worktree add "$DST_PATH" "$BRANCH_NAME"
else
    echo "🆕 Creating new branch: ${BRANCH_NAME}"
    git worktree add -b "$BRANCH_NAME" "$DST_PATH"
fi

# Copy .claude directory if it exists
if [ -d ".claude" ]; then
    echo "📋 Copying .claude directory..."
    cp -r .claude "$DST_PATH/"
fi

cd "$DST_PATH"

REPO_NAME=$(git -C "$SRC_PATH" remote get-url origin | sed 's/.*\///' | sed 's/\.git$//')
hlyr thoughts init --force --directory "$REPO_NAME"
hlyr thoughts sync

#echo "🔧 Running make setup..."
#if ! make setup; then
#    echo "❌ Setup failed. Cleaning up..."
#    cd "$SRC_PATH"
#    git worktree remove --force "$DST_PATH"
#    git branch -D "$BRANCH_NAME" 2>/dev/null || true
#    exit 1
#fi

echo "✅ Worktree created successfully!"
echo "📁 Path: $DST_PATH"
echo "🔀 Branch: $BRANCH_NAME"
echo ""
echo "To remove later:"
echo "  git worktree remove $DST_PATH && git branch -D $BRANCH_NAME"
