#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# e2e-journey.sh — Synthetic E2E test runner for Frontal CLI
#
# Runs isolated user journeys against the published CLI, capturing exit codes,
# timing, and error output per journey. Outputs structured run-result.json.
#
# Environment variables:
#   FRONTAL_API_KEY       — API key for authenticated journeys
#   FRONTAL_API_URL       — API base URL for connectivity tests
#   E2E_TIMEOUT_SECS      — Per-journey timeout in seconds (default: 120)
#   E2E_DRY_RUN           — If "true", failures are recorded but script exits 0
# ---------------------------------------------------------------------------

readonly CLI="${CLI_BIN:-frontal}"
readonly TIMEOUT_SECS="${E2E_TIMEOUT_SECS:-120}"
readonly DRY_RUN="${E2E_DRY_RUN:-false}"
readonly RESULT_FILE="${E2E_RESULT_FILE:-run-result.json}"
readonly RUN_ID="${GITHUB_RUN_ID:-local-$(date +%s)}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

now_iso() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

run_journey() {
  local name="$1"
  shift
  local cmd=("$@")
  local start end duration exit_code
  local stdout_file stderr_file

  stdout_file="$(mktemp)"
  stderr_file="$(mktemp)"

  start=$(date +%s%3N)
  timeout "$TIMEOUT_SECS" "${cmd[@]}" >"$stdout_file" 2>"$stderr_file" && exit_code=$? || exit_code=$?
  end=$(date +%s%3N)
  duration=$((end - start))

  # Collect output (truncated for JSON safety)
  local stdout_preview stderr_preview
  stdout_preview="$(head -c 2000 "$stdout_file" | jq -Rs .)"
  stderr_preview="$(head -c 2000 "$stderr_file" | jq -Rs .)"

  # Determine status
  local status
  if [[ "$exit_code" -eq 0 ]]; then
    status="pass"
  elif [[ "$exit_code" -eq 124 ]]; then
    status="timeout"
  else
    status="fail"
  fi

  local error_message="null"
  if [[ "$status" != "pass" ]]; then
    error_message="$stderr_preview"
  fi

  cat <<INNER_JSON
    {
      "name": $(jq -Rs . <<<"$name"),
      "status": $(jq -Rs . <<<"$status"),
      "duration_ms": $duration,
      "exit_code": $exit_code,
      "stdout": $stdout_preview,
      "stderr": $stderr_preview,
      "error_message": $error_message
    }
INNER_JSON

  rm -f "$stdout_file" "$stderr_file"
}

# ---------------------------------------------------------------------------
# Journey definitions — each is a function that returns a JSON object
# ---------------------------------------------------------------------------

journey_smoke() {
  local results
  results="["
  # Test 1a: --version
  results+="$(run_journey "smoke-version" "$CLI" --version)"
  results+=","
  # Test 1b: --help
  results+="$(run_journey "smoke-help" "$CLI" --help)"
  results+="]"
  echo "$results"
}

journey_auth() {
  run_journey "auth-status" "$CLI" auth status
}

journey_config() {
  run_journey "config-get" "$CLI" config get
}

journey_api() {
  run_journey "api-connectivity" "$CLI" workflows list --limit 1
}

journey_output() {
  local results
  results="["
  results+="$(run_journey "output-json" "$CLI" --version --output json)"
  results+=","
  results+="$(run_journey "output-yaml" "$CLI" --version --output yaml)"
  results+="]"
  echo "$results"
}

journey_interactive() {
  run_journey "interactive-help" "$CLI" auth login --help
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  local start_ts="$(now_iso)"
  local overall_start overall_end overall_duration
  overall_start=$(date +%s%3N)

  echo "=== Frontal CLI E2E Journey Runner ==="
  echo "CLI binary: $CLI"
  echo "Timeout per journey: ${TIMEOUT_SECS}s"
  echo "Run ID: $RUN_ID"
  echo ""

  local version_info="null"
  if version_info="$("$CLI" --version 2>/dev/null)"; then
    version_info="$(jq -Rs . <<<"$version_info")"
  fi

  # Run all journeys — each isolated
  echo "[1/6] Smoke (version + help)..."
  local smoke_json
  smoke_json="$(journey_smoke)" || true

  echo "[2/6] Auth status..."
  local auth_json
  auth_json="$(journey_auth)" || true

  echo "[3/6] Config get..."
  local config_json
  config_json="$(journey_config)" || true

  echo "[4/6] API connectivity..."
  local api_json
  api_json="$(journey_api)" || true

  echo "[5/6] Output formats (JSON + YAML)..."
  local output_json
  output_json="$(journey_output)" || true

  echo "[6/6] Interactive help..."
  local interactive_json
  interactive_json="$(journey_interactive)" || true

  overall_end=$(date +%s%3N)
  overall_duration=$((overall_end - overall_start))

  # Aggregate results
  cat > "$RESULT_FILE" <<EOF
{
  "run_id": "$RUN_ID",
  "timestamp": "$start_ts",
  "overall_duration_ms": $overall_duration,
  "cli_version": $version_info,
  "environment": {
    "os": "$(uname -s)",
    "arch": "$(uname -m)",
    "node_version": "$(node --version 2>/dev/null || echo 'unknown')",
    "npm_version": "$(npm --version 2>/dev/null || echo 'unknown')"
  },
  "journeys": {
    "smoke": $smoke_json,
    "auth": $auth_json,
    "config": $config_json,
    "api": $api_json,
    "output": $output_json,
    "interactive": $interactive_json
  },
  "summary": $(compute_summary)
}
EOF

  echo ""
  echo "Results written to $RESULT_FILE"

  # Compute exit code
  local failed
  failed="$(jq -r '.summary.journeys_failed' "$RESULT_FILE")"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "Dry run enabled — exiting 0 regardless of result"
    exit 0
  fi
  if [[ "$failed" -gt 0 ]]; then
    echo "FAIL: $failed journey(s) failed"
    exit 1
  fi
  echo "PASS: All journeys successful"
  exit 0
}

compute_summary() {
  # Walk the journey results and count pass/fail
  # Handles both singleton objects and arrays
  local passed=0 failed=0
  local smoke_json="$smoke_json"
  local auth_json="$auth_json"
  local config_json="$config_json"
  local api_json="$api_json"
  local output_json="$output_json"
  local interactive_json="$interactive_json"

  count_status() {
    local json_str="$1"
    # If it's an array, iterate; otherwise treat as single object
    if echo "$json_str" | jq -e 'type == "array"' >/dev/null 2>&1; then
      local count
      count=$(echo "$json_str" | jq -r '[.[] | select(.status == "pass")] | length')
      passed=$((passed + count))
      count=$(echo "$json_str" | jq -r '[.[] | select(.status != "pass")] | length')
      failed=$((failed + count))
    else
      local status
      status=$(echo "$json_str" | jq -r '.status // "fail"')
      if [[ "$status" == "pass" ]]; then
        passed=$((passed + 1))
      else
        failed=$((failed + 1))
      fi
    fi
  }

  count_status "$smoke_json"
  count_status "$auth_json"
  count_status "$config_json"
  count_status "$api_json"
  count_status "$output_json"
  count_status "$interactive_json"

  local overall="pass"
  if [[ "$failed" -gt 0 ]]; then
    overall="fail"
  fi

  cat <<SUM
{
  "journeys_passed": $passed,
  "journeys_failed": $failed,
  "overall_status": "$overall"
}
SUM
}

main "$@"
