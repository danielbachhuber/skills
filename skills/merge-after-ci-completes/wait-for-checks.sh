#!/usr/bin/env bash
# Poll every check on a PR's head commit, required or not, until they all
# finish. Quiet while polling, so it can run in the background and report once.
#
# Usage: bash wait-for-checks.sh <pr> [owner/repo] [head-sha]
#
# Pass the head SHA recorded at preflight so a push in between is caught.
#
# Prints one marker line, then a tab-separated summary of the checks:
#   CHECKS_PASSED    every check passed or was skipped, and stayed that way
#                    through the settle window                        (exit 0)
#   CHECKS_FAILED    at least one check failed or was cancelled       (exit 1)
#   TIMED_OUT        checks were still pending at the deadline        (exit 2)
#   HEAD_CHANGED     a new commit landed on the PR while waiting      (exit 3)
#   NO_CHECKS        no checks registered within the grace period     (exit 4)
#   PR_NOT_OPEN      the PR was merged or closed while waiting        (exit 5)
#
# Tunables (seconds), via environment:
#   POLL=30  SETTLE=60  NO_CHECKS_GRACE=180  TIMEOUT=3600
set -uo pipefail

pr="${1:?usage: wait-for-checks.sh <pr> [owner/repo] [head-sha]}"
repo_args=()
[[ -n "${2:-}" ]] && repo_args=(-R "$2")

POLL="${POLL:-30}"
SETTLE="${SETTLE:-60}"
NO_CHECKS_GRACE="${NO_CHECKS_GRACE:-180}"
TIMEOUT="${TIMEOUT:-3600}"

pr_field() {
  gh pr view "$pr" ${repo_args[@]+"${repo_args[@]}"} --json "$1" --jq ".$1" 2>/dev/null
}

summary() {
  jq -r 'sort_by({fail: 0, cancel: 1, pending: 2, pass: 3, skipping: 4}[.bucket] // 5)
    | .[] | [.bucket, .name, (.workflow // ""), (.link // "")] | @tsv' <<<"$1"
}

start_sha="${3:-$(pr_field headRefOid)}"
if [[ -z "$start_sha" ]]; then
  echo "Could not read PR $pr" >&2
  exit 64
fi

start=$(date +%s)
passed_since=""
passed_count=""

while :; do
  now=$(date +%s)

  state="$(pr_field state)"
  if [[ -n "$state" && "$state" != "OPEN" ]]; then
    echo "PR_NOT_OPEN"
    echo "state	$state"
    exit 5
  fi

  sha="$(pr_field headRefOid)"
  if [[ -n "$sha" && "$sha" != "$start_sha" ]]; then
    echo "HEAD_CHANGED"
    echo "was	$start_sha"
    echo "now	$sha"
    exit 3
  fi

  # gh exits 8 while checks are pending and 1 when one failed, so judge the
  # JSON, not the exit code. A transient API error leaves this empty.
  checks="$(gh pr checks "$pr" ${repo_args[@]+"${repo_args[@]}"} --json name,bucket,state,workflow,link 2>/dev/null)"
  if ! jq -e 'type == "array"' >/dev/null 2>&1 <<<"$checks"; then
    sleep "$POLL"
    continue
  fi

  total=$(jq 'length' <<<"$checks")
  pending=$(jq '[.[] | select(.bucket == "pending")] | length' <<<"$checks")
  failed=$(jq '[.[] | select(.bucket == "fail" or .bucket == "cancel")] | length' <<<"$checks")

  if (( total == 0 )); then
    if (( now - start >= NO_CHECKS_GRACE )); then
      echo "NO_CHECKS"
      exit 4
    fi
  elif (( failed > 0 )); then
    echo "CHECKS_FAILED"
    summary "$checks"
    exit 1
  elif (( pending == 0 )); then
    # All green. Hold for the settle window: some checks only register after
    # others finish, such as e2e runs on deployment_status after a preview
    # deploy, or an external app that reports late.
    if [[ -z "$passed_since" || "$total" != "$passed_count" ]]; then
      passed_since=$now
      passed_count=$total
    elif (( now - passed_since >= SETTLE )); then
      echo "CHECKS_PASSED"
      summary "$checks"
      exit 0
    fi
  else
    passed_since=""
  fi

  if (( now - start >= TIMEOUT )); then
    echo "TIMED_OUT"
    summary "$checks"
    exit 2
  fi

  sleep "$POLL"
done
