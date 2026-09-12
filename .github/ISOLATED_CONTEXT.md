# Incident.io Status Page — Isolated Context (On-Call Runbook)

This document contains everything an on-call engineer needs to understand, operate,
and recover the automated Incident.io Status Page integration for the Frontal CLI.
No tribal knowledge required.

## System Overview

| Component | Purpose | Trigger |
|---|---|---|
| `synthetic-monitor` | Runs 6 E2E user journeys against the **published** CLI every 15 min | Cron: `3,18,33,48 * * * *` |
| `incident-manager` | Creates/updates/resolves Incident.io incidents based on flap state | Manual dispatch or `workflow_call` |
| `status-page-sync` | Hourly reconciliation of component health | Cron: `7 * * * *` |
| `flap-state-cleanup` | Daily stale state cleanup | Cron: `13 3 * * *` |
| `validate-status-page` | PR gate for workflow changes | PR on `.github/workflows/**` |

## Where Incidents Live

- **Internal incidents**: `https://app.incident.io` — for team alerting/coordination
- **Status page incidents**: The public status page — for user-facing status

Both are managed automatically by the `synthetic-monitor` workflow's `manage-incidents` job.

## Key Files

| File | Purpose |
|---|---|
| `.github/workflows/synthetic-monitor.yml` | Core monitoring + incident automation |
| `.github/workflows/incident-manager.yml` | Manual operator actions |
| `.github/scripts/e2e-journey.sh` | E2E test definitions (6 journeys) |
| `.github/scripts/flap-state.sh` | Flap prevention state machine |
| `.github/scripts/incident-client.sh` | Incident.io v2 API client |
| `.github/incident/thresholds.json` | Flap threshold configuration |
| `.github/incident/components.json` | Status page component ID mappings |

## Secrets & Variables

| Name | Where | How to rotate |
|---|---|---|
| `INCIDENT_IO_API_KEY` | Repo Secrets | Create new key in Incident.io Settings → API Keys, update here, revoke old |
| `FRONTAL_TEST_API_KEY` | Repo Secrets | Generate new key in Frontal dashboard |
| `FRONTAL_TEST_API_URL` | Repo Secrets | Update if API URL changes |
| `INCIDENT_IO_STATUS_PAGE_ID` | Repo Variables | Get from Incident.io Status Pages → your page → ID in URL |
| `INCIDENT_IO_SEVERITY_MINOR_ID` | Repo Variables | Get from Incident.io Settings → Severities |
| `INCIDENT_IO_SEVERITY_MAJOR_ID` | Repo Variables | Get from Incident.io Settings → Severities |
| `MONITOR_FAIL_THRESHOLD` | Repo Variables | Default: 3 |
| `MONITOR_RECOVER_THRESHOLD` | Repo Variables | Default: 2 |

## Recovery Procedures

### 1. False Positive / Flapping Alert

**Symptom**: Incident was created but journeys are actually working (CI issue, npm outage).

**Action**:
1. Go to Actions → `incident-manager` → Run workflow
2. Set `action` = `force-resolve`
3. This resolves the status page incident AND resets flap state

**Alternative** (quick):
1. Go to Actions → `synthetic-monitor` → Run workflow
2. Set `dry_run` = `false`
3. This will re-evaluate and auto-resolve if journeys pass

### 2. Preventing an Incident You Know is Coming

**Symptom**: You're about to deploy a breaking change and don't want alerts.

**Action**:
1. Go to repo Settings → Variables → Add `MANUAL_OVERRIDE` = `true`
2. This pauses automated incident management (monitoring still runs)
3. After the change settles, remove or set to `false`

### 3. Stale / Corrupted Flap State

**Symptom**: Incident remains open after recovery, or no incident created when one should exist.

**Action**:
1. Run `flap-state-cleanup` workflow manually (Actions → Flap State Cleanup → Run)
2. This trims history, verifies linked incidents still exist, and resets stale flags
3. If still broken: manually force-resolve via `incident-manager`

### 4. Incident.io API is Down

**Symptom**: HTTP 5xx errors in workflow logs, incidents not syncing.

**Automatic behavior**: The system degrades gracefully. API failures do NOT increment flap
counters — only journey failures do. The next successful API call will retry.

**Action**: No immediate action needed. The system self-recovers when Incident.io is back up.

### 5. npm Registry is Down (Can't Install CLI for Monitoring)

**Symptom**: All 6 journeys fail because `npm install -g frontal-cli@latest` fails.

**Action**: This is a legitimate partial outage — the CLI can't be installed. The incident
will be created automatically. Resolve it manually once npm is healthy:
1. Run `incident-manager` → `force-resolve`
2. Add a message explaining npm registry was down, not the CLI itself

### 6. Updating Status Page Components

**When**: You add a new component to the status page or rename an existing one.

**Action**:
1. Get the new component ID from `GET /v2/status_page_structures/{status_page_id}`
2. Update `.github/incident/components.json` with the new component ID
3. Commit and push — the validation workflow will verify the schema

## Flap Prevention Explained

The system uses **hysteresis** to prevent alert flapping:

```
Failures counter increments on each failed run, resets to 0 on any success.
Successes counter increments on each successful run, resets to 0 on any failure.

CREATION:  consecutive_failures >= FAIL_THRESHOLD (3) AND not currently alerting
UPDATE:    consecutive_failures >= FAIL_THRESHOLD AND currently alerting
RESOLVE:   consecutive_successes >= RECOVER_THRESHOLD (2) AND currently alerting
NO-OP:     everything else
```

**Why 3 failures before alerting?** A single npm registry blip or runner network issue
shouldn't page anyone. Three consecutive failures across 45 minutes (15-min intervals)
is a real pattern.

**Why 2 successes before resolving?** One success might be a fluke (transient recovery).
Two consecutive successes across 30 minutes confirms the fix is stable.

## Testing Changes

Before merging changes to any incident workflow:

1. Run `validate-status-page` workflow manually on your branch
2. Verify all 5 validation jobs pass (config, dry-run, flap logic, API, secrets)
3. If changing `e2e-journey.sh`, run `synthetic-monitor` with `dry_run: true`

## Quick Links

- [Synthetic Monitor runs](https://github.com/frontal-labs/cli/actions/workflows/synthetic-monitor.yml)
- [Incident Manager](https://github.com/frontal-labs/cli/actions/workflows/incident-manager.yml)
- [Status Page Sync](https://github.com/frontal-labs/cli/actions/workflows/status-page-sync.yml)
- [Flap State Cleanup](https://github.com/frontal-labs/cli/actions/workflows/flap-state-cleanup.yml)
- [Incident.io Dashboard](https://app.incident.io)
- [Incident.io API Docs](https://docs.incident.io/api-reference/introduction)
