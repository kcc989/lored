#!/bin/bash
# Hook to prevent introducing "as any" in edits
# Receives JSON via stdin with tool_input containing the edit parameters

# Read stdin
input=$(cat)

# Extract the new_string from the JSON input
new_string=$(echo "$input" | jq -r '.tool_input.new_string // empty')

# If no new_string, allow the operation (might be a different tool)
if [ -z "$new_string" ]; then
  exit 0
fi

# Check if new_string contains "as any"
if echo "$new_string" | grep -q "as any"; then
  echo "❌ BLOCKED: Edit introduces 'as any' which is prohibited by project guidelines."
  echo ""
  echo "From CLAUDE.md:"
  echo "  - NEVER use type assertions (\`as\` keyword) to fix TypeScript errors"
  echo "  - NEVER use \`as any\` - this defeats the purpose of TypeScript and hides real bugs"
  echo ""
  echo "Instead, either:"
  echo "  1. Fix the underlying type definition"
  echo "  2. Add runtime validation using Zod and infer types from the schema"
  echo "  3. Use proper type guards"
  exit 1
fi

exit 0
