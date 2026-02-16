#!/bin/bash
# Hook to set up worktrees with .dev.vars, Claude settings, and dependencies
# Runs on SessionStart to ensure worktrees are ready for development

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Find the main worktree (contains the actual .git directory)
get_main_worktree() {
  local git_dir

  # Check if .git is a file (worktree) or directory (main repo)
  if [ -f "$PROJECT_ROOT/.git" ]; then
    # We're in a worktree - .git file contains path to main repo
    git_dir=$(cat "$PROJECT_ROOT/.git" | sed 's/gitdir: //' | sed 's|/\.git/worktrees/.*||')
    echo "$git_dir"
  else
    # We're in the main repo
    echo "$PROJECT_ROOT"
  fi
}

MAIN_WORKTREE=$(get_main_worktree)

# Check if we're in a worktree (not the main repo)
is_worktree() {
  [ -f "$PROJECT_ROOT/.git" ]
}

# Copy .dev.vars files from main worktree
copy_dev_vars() {
  local copied=false

  # Copy root .dev.vars
  if [ -f "$MAIN_WORKTREE/.dev.vars" ] && [ ! -f "$PROJECT_ROOT/.dev.vars" ]; then
    cp "$MAIN_WORKTREE/.dev.vars" "$PROJECT_ROOT/.dev.vars"
    echo "Copied .dev.vars to project root"
    copied=true
  fi

  # Copy apps/web/.dev.vars
  if [ -f "$MAIN_WORKTREE/apps/web/.dev.vars" ] && [ ! -f "$PROJECT_ROOT/apps/web/.dev.vars" ]; then
    mkdir -p "$PROJECT_ROOT/apps/web"
    cp "$MAIN_WORKTREE/apps/web/.dev.vars" "$PROJECT_ROOT/apps/web/.dev.vars"
    echo "Copied .dev.vars to apps/web"
    copied=true
  fi

  if [ "$copied" = true ]; then
    return 0
  fi
  return 1
}

# Copy Claude settings.local.json from main worktree
copy_claude_settings() {
  local source="$MAIN_WORKTREE/.claude/settings.local.json"
  local dest="$PROJECT_ROOT/.claude/settings.local.json"

  if [ -f "$source" ]; then
    # Always copy to ensure we have the latest settings
    mkdir -p "$PROJECT_ROOT/.claude"
    cp "$source" "$dest"
    echo "Copied .claude/settings.local.json from main worktree"
    return 0
  fi
  return 1
}

# Install dependencies if needed
install_deps() {
  if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    echo "Installing dependencies with pnpm..."
    cd "$PROJECT_ROOT"
    pnpm install
    echo "Dependencies installed"
    return 0
  fi
  return 1
}

# Main execution
main() {
  local setup_needed=false

  # Only run setup for worktrees or if .dev.vars is missing
  if is_worktree || [ ! -f "$PROJECT_ROOT/.dev.vars" ]; then
    if copy_dev_vars; then
      setup_needed=true
    fi
  fi

  # Copy Claude settings when in a worktree
  if is_worktree; then
    if copy_claude_settings; then
      setup_needed=true
    fi
  fi

  # Check for missing node_modules
  if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    install_deps
    setup_needed=true
  fi

  if [ "$setup_needed" = true ]; then
    echo "Worktree setup complete"
  fi
}

main
