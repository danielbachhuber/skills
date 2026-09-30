#!/usr/bin/env bash
# Download the before and after of every screenshot a PR's visual regression reports flag.
# Usage: bash fetch-visuals.sh <owner/repo> <number> <workdir>
# Looks in the PR's comments for report links (an index.html beside a reg-suit out.json),
# then saves changed, new, and deleted images under <workdir>/visuals/ and lists them in
# <workdir>/visuals.json as [{ report, item, change, before, after }]. Paths are relative
# to <workdir>; before is null for a new screenshot and after is null for a deleted one.
set -euo pipefail

repo="${1:?usage: fetch-visuals.sh <owner/repo> <number> <workdir>}"
number="${2:?usage: fetch-visuals.sh <owner/repo> <number> <workdir>}"
dir="${3:?usage: fetch-visuals.sh <owner/repo> <number> <workdir>}"
mkdir -p "$dir/visuals"

urls=$(gh api --paginate "repos/$repo/issues/$number/comments" --jq '.[].body' \
  | grep -oE 'https://[^ )"]+/index\.html' | sort -u || true)

echo '[]' > "$dir/visuals.json"
for url in $urls; do
  base="${url%/index.html}"
  out=$(curl -sf "$base/out.json") || continue
  jq -e '.failedItems' <<< "$out" > /dev/null 2>&1 || continue
  # The report's own folder name, e.g. visual-regression or e2e-visual-regression.
  report=$(basename "$(dirname "$base")")
  expected=$(jq -r '.expectedDir // "expected"' <<< "$out")
  actual=$(jq -r '.actualDir // "actual"' <<< "$out")
  count=0
  while IFS=$'\t' read -r change item; do
    [ -n "$item" ] || continue
    before=null; after=null
    if [ "$change" != new ]; then
      mkdir -p "$dir/visuals/$report/before/$(dirname "$item")"
      curl -sf -o "$dir/visuals/$report/before/$item" "$base/$expected/$item" && before="\"visuals/$report/before/$item\""
    fi
    if [ "$change" != deleted ]; then
      mkdir -p "$dir/visuals/$report/after/$(dirname "$item")"
      curl -sf -o "$dir/visuals/$report/after/$item" "$base/$actual/$item" && after="\"visuals/$report/after/$item\""
    fi
    jq --arg report "$report" --arg url "$url" --arg item "$item" --arg change "$change" \
      --argjson before "$before" --argjson after "$after" \
      '. + [{report: $report, url: $url, item: $item, change: $change, before: $before, after: $after}]' \
      "$dir/visuals.json" > "$dir/visuals.json.tmp" && mv "$dir/visuals.json.tmp" "$dir/visuals.json"
    count=$((count + 1))
  done < <(jq -r '(.failedItems[] | "changed\t\(.)"), (.newItems[]? | "new\t\(.)"), (.deletedItems[]? | "deleted\t\(.)")' <<< "$out")
  echo "$report: $count flagged screenshots ($url)"
done
echo "$dir/visuals.json: $(jq length "$dir/visuals.json") screenshots"
