#!/usr/bin/env bash
# bootstrap_project.sh — bootstrap gemDirect1 plan into Codec CLI and start the workflow

set -euo pipefail

PLAN_FILE="PLAN.md"
BACKLOG_FILE="backlog.json"

function ingest_plan() {
  echo "=== Ingesting plan into Codec CLI ==="
  codec plan ingest "$PLAN_FILE" "$BACKLOG_FILE"
  echo "Done."
}

function list_tasks() {
  echo "=== Listing all tasks ==="
  codec plan list
  echo
}

function next_tasks() {
  local NUM="$1"
  echo "=== Fetching next ${NUM} ready tasks ==="
  codec plan next "$NUM"
  echo
}

function complete_task() {
  local TASK_ID="$1"
  echo "=== Marking task ${TASK_ID} as complete ==="
  codec plan complete "$TASK_ID"
  echo
}

function usage() {
  cat <<'EOF'
Usage: ./bootstrap_project.sh {ingest|list|next <n>|complete <taskId>}

Commands:
  ingest           Ingest plan & backlog into Codec CLI
  list             List all tasks / backlog status
  next <n>         Get next n ready tasks for implementation
  complete <id>    Mark a task (by ID) completed
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

case "$1" in
  ingest)
    ingest_plan
    ;;
  list)
    list_tasks
    ;;
  next)
    if [[ -z "${2:-}" ]]; then
      echo "Error: need number of tasks"
      usage
      exit 1
    fi
    next_tasks "$2"
    ;;
  complete)
    if [[ -z "${2:-}" ]]; then
      echo "Error: need task ID"
      usage
      exit 1
    fi
    complete_task "$2"
    ;;
  *)
    usage
    exit 1
    ;;
esac
