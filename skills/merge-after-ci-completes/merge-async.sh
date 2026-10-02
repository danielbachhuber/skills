#!/usr/bin/env bash
# Merge a PR through GitHub's asynchronous merge API, which is the only way to
# merge a PR that is part of a stack, then poll until GitHub reports a result.
#
# Usage: bash merge-async.sh <pr> <owner/repo> <head-sha> [merge|squash|rebase]
#
# Leave out the method on a merge-queue repo; the request then uses the
# repo's default merge action, which adds the PR to the queue.
#
# Prints one marker line, then GitHub's details as tab-separated key/value:
#   MERGED      GitHub merged it; `sha` is the merge commit           (exit 0)
#   ENQUEUED    the PR is in the merge queue, not merged yet          (exit 0)
#   FAILED      GitHub accepted the request but could not merge       (exit 1)
#   REJECTED    GitHub refused the request; the body is printed       (exit 2)
#   TIMED_OUT   still pending at the deadline                         (exit 3)
#
# Tunables (seconds), via environment:
#   POLL=5  TIMEOUT=600
set -uo pipefail

pr="${1:?usage: merge-async.sh <pr> <owner/repo> <head-sha> [method]}"
repo="${2:?usage: merge-async.sh <pr> <owner/repo> <head-sha> [method]}"
sha="${3:?usage: merge-async.sh <pr> <owner/repo> <head-sha> [method]}"
method="${4:-}"

POLL="${POLL:-5}"
TIMEOUT="${TIMEOUT:-600}"

endpoint="repos/$repo/pulls/$pr/merge-async"

fields=(-f "sha=$sha")
if [[ -n "$method" ]]; then
  fields+=(-f "merge_action=direct_merge" -f "merge_method=$method")
fi

is_merge_status() {
  jq -e '.status | IN("pending", "merged", "enqueued", "failed")' >/dev/null 2>&1 <<<"$1"
}

details() {
  jq -r '.details // {} | to_entries[] | [.key, (.value | tostring)] | @tsv' <<<"$1"
}

# gh api exits non-zero on a 4xx but still prints the response body to
# stdout. A 400 can carry a normal `failed` status, while other errors carry
# an HTTP code in `.status`.
err="$(mktemp)"
response="$(gh api -X PUT "$endpoint" "${fields[@]}" 2>"$err")"
if ! is_merge_status "$response"; then
  echo "REJECTED"
  echo "$response"
  cat "$err"
  rm -f "$err"
  exit 2
fi
rm -f "$err"

uuid="$(jq -r '.details.uuid // empty' <<<"$response")"
start=$(date +%s)
while :; do
  case "$(jq -r '.status' <<<"$response")" in
    merged)   echo "MERGED";   details "$response"; exit 0 ;;
    enqueued) echo "ENQUEUED"; details "$response"; exit 0 ;;
    failed)   echo "FAILED";   details "$response"; exit 1 ;;
  esac

  if (( $(date +%s) - start >= TIMEOUT )); then
    echo "TIMED_OUT"
    details "$response"
    exit 3
  fi

  sleep "$POLL"
  # A transient API error keeps the last known response and polls again.
  if [[ -n "$uuid" ]]; then
    next="$(gh api "$endpoint/$uuid" 2>/dev/null)"
    is_merge_status "$next" && response="$next"
  fi
done
