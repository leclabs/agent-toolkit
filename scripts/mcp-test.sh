#!/usr/bin/env bash
# Manual testing CLI for Navigator MCP server
# Usage: ./scripts/mcp-test.sh <command> [args...]

set -e

MCP_CMD="npx @leclabs/agent-flow-navigator-mcp"

call_mcp() {
  local name="$1"
  local args="$2"
  echo "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$name\",\"arguments\":$args}}" | $MCP_CMD 2>/dev/null | jq -r '.result.content[0].text' | jq .
}

case "${1:-help}" in
  list|ls)
    # List loaded workflows
    call_mcp "ListWorkflows" "{}"
    ;;

  discover)
    # Discover available workflows without loading
    call_mcp "LoadWorkflows" "{}"
    ;;

  load)
    # Load all or specific workflows
    if [ -z "$2" ]; then
      # Load all available
      ids=$(echo '{}' | $MCP_CMD 2>/dev/null <<< '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"LoadWorkflows","arguments":{}}}' | jq -r '.result.content[0].text' | jq -c '.available')
      call_mcp "LoadWorkflows" "{\"workflowIds\":$ids}"
    else
      # Load specific workflow(s)
      shift
      ids=$(printf '%s\n' "$@" | jq -R . | jq -sc .)
      call_mcp "LoadWorkflows" "{\"workflowIds\":$ids}"
    fi
    ;;

  init|start)
    # Initialize a task: mcp-test.sh init <workflow> <taskFile> [description]
    workflow="${2:?workflow required}"
    taskFile="${3:?taskFile required}"
    desc="${4:-Test task}"
    # Create minimal task file if it doesn't exist
    if [ ! -f "$taskFile" ]; then
      echo "{\"description\":\"$desc\"}" > "$taskFile"
    fi
    call_mcp "Start" "{\"workflowType\":\"$workflow\",\"taskFilePath\":\"$taskFile\",\"description\":\"$desc\"}"
    ;;

  advance|next)
    # Advance a task: mcp-test.sh advance <taskFile> <passed|failed>
    taskFile="${2:?taskFile required}"
    result="${3:-passed}"
    call_mcp "Next" "{\"taskFilePath\":\"$taskFile\",\"result\":\"$result\"}"
    ;;

  state|current)
    # Get current state: mcp-test.sh state <taskFile>
    taskFile="${2:?taskFile required}"
    call_mcp "Current" "{\"taskFilePath\":\"$taskFile\"}"
    ;;

  diagram)
    # Generate diagram: mcp-test.sh diagram <workflow> [currentStep]
    workflow="${2:?workflow required}"
    if [ -n "$3" ]; then
      call_mcp "Diagram" "{\"workflowType\":\"$workflow\",\"currentStep\":\"$3\"}"
    else
      call_mcp "Diagram" "{\"workflowType\":\"$workflow\"}"
    fi
    ;;

  task)
    # Show task file contents
    taskFile="${2:?taskFile required}"
    jq . "$taskFile"
    ;;

  catalog)
    # List catalog contents
    call_mcp "ListCatalog" "{}"
    ;;

  test)
    # Full integration test - load, init, advance in one session
    workflow="${2:-context-gather}"
    taskFile="${3:-.flow/tasks/mcp-test-tmp.json}"
    echo "{\"description\":\"MCP integration test\"}" > "$taskFile"

    # Send multiple JSON-RPC calls in one session
    {
      echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"LoadWorkflows","arguments":{}}}'
      echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"LoadWorkflows","arguments":{"workflowIds":["'$workflow'"]}}}'
      echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"Start","arguments":{"workflowType":"'$workflow'","taskFilePath":"'$taskFile'","description":"MCP integration test"}}}'
    } | $MCP_CMD 2>/dev/null | while read -r line; do
      id=$(echo "$line" | jq -r '.id // empty')
      case "$id" in
        1) echo "=== Discover ===" && echo "$line" | jq -r '.result.content[0].text' | jq -c '{available}' ;;
        2) echo "=== Load ===" && echo "$line" | jq -r '.result.content[0].text' | jq . ;;
        3) echo "=== Start ===" && echo "$line" | jq -r '.result.content[0].text' | jq . ;;
      esac
    done

    echo "=== Task File ==="
    jq . "$taskFile"
    rm -f "$taskFile"
    ;;

  help|*)
    cat <<EOF
Navigator MCP Test CLI

Usage: ./scripts/mcp-test.sh <command> [args...]

Commands:
  list, ls              List loaded workflows
  discover              Discover available workflows (without loading)
  load [id...]          Load all or specific workflows
  init, start <wf> <file> [d]  Initialize task with workflow (Start)
  advance, next <file> <p|f>   Advance task (Next with passed/failed)
  state, current <file>        Get current task state (Current)
  diagram <wf> [step]   Generate workflow diagram
  task <file>           Show task file contents
  catalog               List catalog workflows and agents
  test [wf] [file]      Full integration test (load + start in one session)
  help                  Show this help

Note: Each command spawns a fresh MCP server. Workflows loaded in one
command don't persist to the next. Use 'test' for multi-step flows.

Examples:
  ./scripts/mcp-test.sh discover
  ./scripts/mcp-test.sh load context-gather bug-fix
  ./scripts/mcp-test.sh test context-gather
  ./scripts/mcp-test.sh diagram context-gather fork_gather
EOF
    ;;
esac
