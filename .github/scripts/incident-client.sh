#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# incident-client.sh — Incident.io v2 API client for GitHub Actions
#
# Provides functions for the Incident.io v2 REST API. Designed to be sourced
# by other scripts or called directly with commands.
#
# Usage (direct):
#   incident-client.sh create-internal <name> <summary> <severity_id>
#   incident-client.sh create-status-page <name> <message> <incident_status> <component_statuses_json>
#   incident-client.sh post-update <status_page_incident_id> <message> [incident_status] [component_statuses_json]
#   incident-client.sh resolve <status_page_incident_id> <message>
#   incident-client.sh list-active-incidents
#   incident-client.sh get-status-page-structure <status_page_id>
#   incident-client.sh test-auth
#
# Environment variables:
#   INCIDENT_IO_API_KEY        Required. API key (bearer token).
#   INCIDENT_IO_API_BASE       Optional. Override base URL (default: https://api.incident.io)
#   INCIDENT_IO_STATUS_PAGE_ID Required for status page operations.
#   INCIDENT_IO_DRY_RUN        If "true", print requests instead of sending.
#   INCIDENT_IO_SEVERITY_MINOR_ID   Severity ID for minor incidents.
#   INCIDENT_IO_SEVERITY_MAJOR_ID   Severity ID for major incidents.
# ---------------------------------------------------------------------------

readonly API_BASE="${INCIDENT_IO_API_BASE:-https://api.incident.io}"
readonly API_KEY="${INCIDENT_IO_API_KEY:-}"
readonly DRY_RUN="${INCIDENT_IO_DRY_RUN:-false}"
readonly STATUS_PAGE_ID="${INCIDENT_IO_STATUS_PAGE_ID:-}"
readonly MAX_RETRIES=3
readonly RETRY_BASE_SECS=1

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

now_iso() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

idempotency_key() {
  local prefix="${1:-frontal-cli}"
  echo "${prefix}-$(date -u +%Y%m%d-%H%M)"
}

require_api_key() {
  if [[ -z "$API_KEY" ]]; then
    echo "FATAL: INCIDENT_IO_API_KEY is not set" >&2
    exit 1
  fi
}

# Exponential backoff with jitter for 429 responses
api_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local attempt=0
  local url="$API_BASE$path"

  while [[ "$attempt" -lt "$MAX_RETRIES" ]]; do
    attempt=$((attempt + 1))

    local curl_args=(-s -w '\n%{http_code}' -X "$method" "$url")
    curl_args+=(-H "Authorization: Bearer $API_KEY")
    curl_args+=(-H "Content-Type: application/json")
    curl_args+=(--connect-timeout 10 --max-time 30)

    if [[ -n "$body" ]]; then
      curl_args+=(-d "$body")
    fi

    local response http_code
    response="$(curl "${curl_args[@]}" 2>/dev/null)" || true
    http_code="$(echo "$response" | tail -n1)"
    local response_body
    response_body="$(echo "$response" | sed '$d')"

    if [[ "$http_code" -eq 429 ]]; then
      local retry_after
      retry_after="$((RETRY_BASE_SECS * 2 ** (attempt - 1)))"
      # Add jitter: +/- 50%
      local jitter
      jitter="$((RANDOM % (retry_after / 2 + 1)))"
      local wait_time="$((retry_after + jitter))"
      echo "Rate limited (429) — retrying in ${wait_time}s (attempt $attempt/$MAX_RETRIES)" >&2
      sleep "$wait_time"
      continue
    fi

    if [[ "$http_code" -ge 500 ]]; then
      echo "Server error ($http_code) — retrying (attempt $attempt/$MAX_RETRIES)" >&2
      sleep "$((RETRY_BASE_SECS * 2 ** (attempt - 1)))"
      continue
    fi

    # Return both status code and body
    echo "HTTP_STATUS=$http_code"
    echo "$response_body"
    return 0
  done

  echo "FATAL: API request failed after $MAX_RETRIES attempts" >&2
  return 1
}

# Strip HTTP_STATUS line from response and return just the body
parse_body() {
  grep -v '^HTTP_STATUS=' || true
}

parse_status() {
  grep '^HTTP_STATUS=' | cut -d= -f2
}

# ---------------------------------------------------------------------------
# API operations
# ---------------------------------------------------------------------------

cmd_test_auth() {
  require_api_key
  echo "Testing Incident.io API authentication..."
  local result
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "DRY RUN: Would GET /v2/identity"
    return 0
  fi
  result="$(api_request GET /v2/identity)"
  local status
  status="$(echo "$result" | parse_status)"
  if [[ "$status" == "200" ]]; then
    echo "Authentication successful"
    echo "$result" | parse_body | jq .
    return 0
  else
    echo "Authentication failed (HTTP $status)"
    echo "$result" | parse_body
    return 1
  fi
}

cmd_create_internal() {
  local name="${1:-}"
  local summary="${2:-}"
  local severity_id="${3:-${INCIDENT_IO_SEVERITY_MINOR_ID:-}}"

  if [[ -z "$name" ]]; then
    echo "FATAL: name is required for create-internal" >&2
    exit 1
  fi

  require_api_key
  local idem_key
  idem_key="$(idempotency_key "frontal-cli-internal")"

  local body
  body="$(jq -c -n '{
    name: $name,
    summary: $summary,
    mode: "standard",
    severity_id: $severity,
    idempotency_key: $idem
  }' --arg name "$name" --arg summary "$summary" --arg severity "$severity_id" --arg idem "$idem_key")"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "DRY RUN: Would POST /v2/incidents"
    echo "$body" | jq .
    echo "INCIDENT_ID=dry-run-id"
    return 0
  fi

  echo "Creating internal incident: $name"
  local result
  result="$(api_request POST /v2/incidents "$body")"
  local status
  status="$(echo "$result" | parse_status)"

  if [[ "$status" == "201" ]]; then
    local incident_id
    incident_id="$(echo "$result" | parse_body | jq -r '.incident.id')"
    echo "incident_id=$incident_id" >> "$GITHUB_OUTPUT"
    echo "Internal incident created: $incident_id"
    echo "$result" | parse_body | jq .
  else
    echo "Failed to create internal incident (HTTP $status)"
    echo "$result" | parse_body
    return 1
  fi
}

cmd_create_status_page() {
  local name="${1:-}"
  local message="${2:-}"
  local incident_status="${3:-investigating}"
  local component_statuses_json="${4:-[]}"

  if [[ -z "$name" || -z "$STATUS_PAGE_ID" ]]; then
    echo "FATAL: name and INCIDENT_IO_STATUS_PAGE_ID are required for create-status-page" >&2
    exit 1
  fi

  require_api_key
  local idem_key
  idem_key="$(idempotency_key "frontal-cli-sp")"

  local body
  body="$(jq -c -n '{
    status_page_id: $spid,
    name: $name,
    incident_status: $status,
    message: $msg,
    notify_subscribers: true,
    component_statuses: $comps,
    idempotency_key: $idem
  }' --arg spid "$STATUS_PAGE_ID" --arg name "$name" --arg status "$incident_status" \
     --arg msg "$message" --argjson comps "$component_statuses_json" --arg idem "$idem_key")"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "DRY RUN: Would POST /v2/status_page_incidents"
    echo "$body" | jq .
    echo "STATUS_PAGE_INCIDENT_ID=dry-run-sp-id"
    return 0
  fi

  echo "Creating status page incident: $name"
  local result
  result="$(api_request POST /v2/status_page_incidents "$body")"
  local status
  status="$(echo "$result" | parse_status)"

  if [[ "$status" == "201" ]]; then
    local sp_incident_id
    sp_incident_id="$(echo "$result" | parse_body | jq -r '.status_page_incident.id')"
    echo "status_page_incident_id=$sp_incident_id" >> "$GITHUB_OUTPUT"
    echo "Status page incident created: $sp_incident_id"
    echo "$result" | parse_body | jq .
  else
    echo "Failed to create status page incident (HTTP $status)"
    echo "$result" | parse_body
    return 1
  fi
}

cmd_post_update() {
  local sp_incident_id="${1:-}"
  local message="${2:-}"
  local incident_status="${3:-}"
  local component_statuses_json="${4:-}"

  if [[ -z "$sp_incident_id" || -z "$message" ]]; then
    echo "FATAL: status_page_incident_id and message are required for post-update" >&2
    exit 1
  fi

  require_api_key

  local body
  body="$(jq -c -n '{
    status_page_incident_id: $id,
    message: $msg,
    notify_subscribers: true
  }' --arg id "$sp_incident_id" --arg msg "$message")"

  # Add optional fields
  if [[ -n "$incident_status" ]]; then
    body="$(echo "$body" | jq -c --arg st "$incident_status" '. + {incident_status: $st}')"
  fi
  if [[ -n "$component_statuses_json" && "$component_statuses_json" != "null" ]]; then
    body="$(echo "$body" | jq -c --argjson comps "$component_statuses_json" '. + {component_statuses: $comps}')"
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "DRY RUN: Would POST /v2/status_page_incident_updates"
    echo "$body" | jq .
    return 0
  fi

  echo "Posting update to status page incident: $sp_incident_id"
  local result
  result="$(api_request POST /v2/status_page_incident_updates "$body")"
  local status
  status="$(echo "$result" | parse_status)"

  if [[ "$status" == "201" ]]; then
    echo "Update posted successfully"
    echo "$result" | parse_body | jq .
  else
    echo "Failed to post update (HTTP $status)"
    echo "$result" | parse_body
    return 1
  fi
}

cmd_resolve() {
  local sp_incident_id="${1:-}"
  local message="${2:-All synthetic checks passing. CLI is fully operational.}"

  if [[ -z "$sp_incident_id" ]]; then
    echo "FATAL: status_page_incident_id is required for resolve" >&2
    exit 1
  fi

  require_api_key

  local body
  body="$(jq -c -n '{
    status_page_incident_id: $id,
    incident_status: "resolved",
    message: $msg,
    notify_subscribers: true
  }' --arg id "$sp_incident_id" --arg msg "$message")"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "DRY RUN: Would POST /v2/status_page_incident_updates (resolve)"
    echo "$body" | jq .
    return 0
  fi

  echo "Resolving status page incident: $sp_incident_id"
  local result
  result="$(api_request POST /v2/status_page_incident_updates "$body")"
  local status
  status="$(echo "$result" | parse_status)"

  if [[ "$status" == "201" ]]; then
    echo "Incident resolved successfully — all components auto-reverted to operational"
    echo "$result" | parse_body | jq .
  else
    echo "Failed to resolve incident (HTTP $status)"
    echo "$result" | parse_body
    return 1
  fi
}

cmd_list_active_incidents() {
  require_api_key

  # List incidents with live/active status category
  local query="status_category[one_of]=live&status_category[one_of]=triage"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "DRY RUN: Would GET /v2/incidents?$query"
    return 0
  fi

  local result
  result="$(api_request GET "/v2/incidents?$query")"
  local status
  status="$(echo "$result" | parse_status)"

  if [[ "$status" == "200" ]]; then
    echo "$result" | parse_body | jq -r '.incidents[] | "\(.id) \(.name) [\(.severity.name // "unknown")]"'
  else
    echo "Failed to list incidents (HTTP $status)" >&2
    return 1
  fi
}

cmd_get_status_page_structure() {
  local sp_id="${1:-$STATUS_PAGE_ID}"
  require_api_key

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "DRY RUN: Would GET /v2/status_page_structures/$sp_id"
    return 0
  fi

  local result
  result="$(api_request GET "/v2/status_page_structures/$sp_id")"
  local status
  status="$(echo "$result" | parse_status)"

  if [[ "$status" == "200" ]]; then
    echo "$result" | parse_body | jq .
  else
    echo "Failed to get status page structure (HTTP $status)" >&2
    return 1
  fi
}

cmd_derive_severity() {
  local failed_journeys="${1:-0}"
  if [[ "$failed_journeys" -le 1 ]]; then
    echo "${INCIDENT_IO_SEVERITY_MINOR_ID:-minor}"
  elif [[ "$failed_journeys" -le 2 ]]; then
    echo "${INCIDENT_IO_SEVERITY_MAJOR_ID:-major}"
  else
    echo "${INCIDENT_IO_SEVERITY_MAJOR_ID:-major}"
  fi
}

# ---------------------------------------------------------------------------
# dispatch
# ---------------------------------------------------------------------------

case "${1:-}" in
  test-auth)
    cmd_test_auth
    ;;
  create-internal)
    cmd_create_internal "${2:-}" "${3:-}" "${4:-}"
    ;;
  create-status-page)
    cmd_create_status_page "${2:-}" "${3:-}" "${4:-}" "${5:-}"
    ;;
  post-update)
    cmd_post_update "${2:-}" "${3:-}" "${4:-}" "${5:-}"
    ;;
  resolve)
    cmd_resolve "${2:-}" "${3:-}"
    ;;
  list-active-incidents)
    cmd_list_active_incidents
    ;;
  get-status-page-structure)
    cmd_get_status_page_structure "${2:-}"
    ;;
  derive-severity)
    cmd_derive_severity "${2:-}"
    ;;
  *)
    echo "Usage: $0 {test-auth|create-internal|create-status-page|post-update|resolve|list-active-incidents|get-status-page-structure|derive-severity}" >&2
    exit 1
    ;;
esac
