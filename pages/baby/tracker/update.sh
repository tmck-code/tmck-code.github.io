#!/usr/bin/env bash
# Update this baby-tracker checkout from a code-only zip.
#
#   ./update.sh [path/to/baby-tracker-update.zip] [--up]
#
# 1. brings the docker containers down
# 2. snapshots the database into backups/
# 3. replaces the code with the zip's contents (data/ and backups/ are never touched)
#
# With --up it then rebuilds and starts the app again. Zip defaults to
# ../baby-tracker-update.zip, then ~/baby-tracker-update.zip.

set -euo pipefail

# Everything lives in main() so bash has read the whole script before step 3 overwrites this file.
main() {
  local repo zip='' up=0 arg
  repo="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  for arg in "$@"; do
    case "$arg" in
      --up)      up=1 ;;
      -h|--help) sed -n '2,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; return 0 ;;
      *)         zip="$arg" ;;
    esac
  done

  if [[ -z "$zip" ]]; then
    for arg in "$repo/../baby-tracker-update.zip" "$HOME/baby-tracker-update.zip"; do
      [[ -f "$arg" ]] && { zip="$arg"; break; }
    done
  fi
  [[ -n "$zip" && -f "$zip" ]] || { echo "update: zip not found; pass its path as the first argument" >&2; return 1; }
  zip="$(cd "$(dirname "$zip")" && pwd)/$(basename "$zip")"

  # Check the zip before stopping anything.
  local names
  names="$(unzip -Z1 "$zip")"
  grep -q '^baby-tracker/docker-compose.yml$' <<<"$names" \
    || { echo "update: $zip has no baby-tracker/docker-compose.yml; not a tracker bundle" >&2; return 1; }
  if grep -qE '^baby-tracker/(data|backups)/' <<<"$names"; then
    echo "update: $zip contains data/ or backups/; refusing so the database cannot be overwritten" >&2
    return 1
  fi

  cd "$repo"
  echo "==> Stopping containers"
  docker compose down

  local db="${BABY_DATA_DIR:-$repo/data}/baby.duckdb"
  if [[ -f "$db" ]]; then
    local snap
    snap="$repo/backups/baby-$(date +%Y%m%d-%H%M%S).duckdb"
    mkdir -p "$repo/backups"
    echo "==> Snapshotting database to ${snap#"$repo"/}"
    cp -p "$db" "$snap"
    [[ -f "$db.wal" ]] && cp -p "$db.wal" "$snap.wal"
    cmp -s "$db" "$snap" || { echo "update: snapshot does not match the database; stopping" >&2; return 1; }
  else
    echo "==> No database at $db yet; nothing to snapshot"
  fi

  echo "==> Updating code from $zip"
  local tmp
  tmp="$(mktemp -d)"
  # shellcheck disable=SC2064  # expand now: tmp is local and gone by the time EXIT fires
  trap "rm -rf '$tmp'" EXIT
  unzip -q "$zip" -d "$tmp"
  local src="$tmp/baby-tracker" entry name
  # Replace each top-level file or directory from the zip wholesale, so files deleted upstream go too.
  shopt -s dotglob nullglob
  for entry in "$src"/*; do
    name="$(basename "$entry")"
    [[ "$name" == data || "$name" == backups ]] && continue
    rm -rf "${repo:?}/$name"
    cp -R "$entry" "$repo/$name"
  done
  shopt -u dotglob nullglob
  chmod +x "$repo/update.sh" 2>/dev/null || true

  if (( up )); then
    echo "==> Building and starting"
    docker compose up --build -d --wait
    echo "Baby tracker is up on port ${BABY_PORT:-8765}"
  else
    echo "==> Done. Start it again with: make up"
  fi
}

main "$@"
exit $?
