#!/usr/bin/env bash
# Save what show-me needs about a pull request into a work directory.
# Usage: bash fetch-pr.sh <owner/repo> <number> <workdir>
# Writes pr.json (metadata), files.json (every changed file, with previous
# names for moves), pr.diff (the raw patch), commits.json (each non-merge commit
# with the files it touched), and description.md (the PR body, kept apart so it
# can be read after the grouping is written). Nothing is checked out.
set -euo pipefail

repo="${1:?usage: fetch-pr.sh <owner/repo> <number> <workdir>}"
number="${2:?usage: fetch-pr.sh <owner/repo> <number> <workdir>}"
dir="${3:?usage: fetch-pr.sh <owner/repo> <number> <workdir>}"
mkdir -p "$dir"

gh pr view "$number" --repo "$repo" \
  --json number,title,url,author,state,isDraft,headRefName,baseRefName,headRefOid,baseRefOid,additions,deletions,changedFiles \
  > "$dir/pr.json"
gh pr view "$number" --repo "$repo" --json body --jq .body > "$dir/description.md"

# gh pr view's files field stops at about 100 files; the REST endpoint pages
# through all of them and includes previous_filename for renames.
gh api --paginate "repos/$repo/pulls/$number/files?per_page=100" \
  --jq '.[] | {path: .filename, previous: .previous_filename, status, additions, deletions}' \
  | jq -s '.' > "$dir/files.json"

gh pr diff "$number" --repo "$repo" > "$dir/pr.diff"

# Each non-merge commit with its files. Merge commits carry other people's work.
gh api --paginate "repos/$repo/pulls/$number/commits?per_page=100" \
  --jq '.[] | select((.parents | length) == 1) | {sha, message: .commit.message}' \
  | jq -s '.' > "$dir/commits.raw.json"
jq -c '.[]' "$dir/commits.raw.json" | while read -r commit; do
  sha=$(jq -r .sha <<< "$commit")
  files=$(gh api --paginate "repos/$repo/commits/$sha" --jq '.files[] | .filename' | jq -R . | jq -s .)
  jq --argjson files "$files" '. + {headline: (.message | split("\n")[0]), files: $files}' <<< "$commit"
done | jq -s '.' > "$dir/commits.json"
rm "$dir/commits.raw.json"

count=$(jq length "$dir/files.json")
expected=$(jq .changedFiles "$dir/pr.json")
echo "$dir: $count files (PR reports $expected), $(jq length "$dir/commits.json") commits, $(wc -c < "$dir/pr.diff" | tr -d ' ') bytes of diff"
if [ "$count" != "$expected" ]; then
  echo "warning: file count differs from the PR's changedFiles" >&2
fi
