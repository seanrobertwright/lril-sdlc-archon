#!/usr/bin/env bash
# Mirror this pack into .archon/workflows/lril-sdlc/ (gitignored) so Archon's
# project discovery can validate and fixture-test it, then run the checks.
#
#   tools/dev.sh            # sync, validate the pack, typecheck, unit tests, fixtures
#   tools/dev.sh sync       # sync only
#   tools/dev.sh test NAME  # sync + fixtures for one workflow
#
# The published plugin root is the repository root, but Archon only discovers
# fixtures under a project's .archon/workflows/, and it doesn't follow junctions.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
mirror="$root/.archon/workflows/lril-sdlc"

rm -rf "$mirror"
mkdir -p "$mirror"
for entry in "$root"/* "$root"/.shared; do
  name="$(basename "$entry")"
  case "$name" in
    tools|docs|README.md|LICENSE|NOTICE.md|CHANGELOG.md) continue ;;
  esac
  cp -r "$entry" "$mirror/"
done

cd "$root"
case "${1:-all}" in
  sync) echo "synced to $mirror" ;;
  test) archon workflow test "${2:?workflow name}" ;;
  *)
    failed=0
    for yaml in "$root"/*/lril-*.yaml; do
      name="$(basename "$yaml" .yaml)"
      if ! archon validate workflows "$name" >/dev/null 2>&1; then
        archon validate workflows "$name"
        failed=1
      fi
    done
    [ "$failed" -eq 0 ] && echo "validate: every lril workflow loads"
    (cd tools && bunx tsc -p tsconfig.json && echo "typecheck: clean" && bun test)
    archon workflow test lril-sdlc
    exit "$failed"
    ;;
esac
