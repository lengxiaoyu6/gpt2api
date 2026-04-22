#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

print_dsn() {
    local config="$1"
    make -s -f Makefile --eval 'print-dsn: ; @printf "%s\n" "$(DSN)"' CONFIG="$config" print-dsn
}

print_migrate_cmd() {
    local config="$1"
    make -n -f Makefile CONFIG="$config" migrate-up
}

assert_eq() {
    local actual="$1"
    local expected="$2"
    local name="$3"
    if [[ "$actual" != "$expected" ]]; then
        printf 'FAIL: %s\nexpected: %s\nactual:   %s\n' "$name" "$expected" "$actual" >&2
        return 1
    fi
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

cat >"$tmpdir/single.yaml" <<'EOF'
app:
  name: demo
mysql:
  dsn: 'user:pass@tcp(127.0.0.1:3306)/demo?parseTime=true'
  max_open_conns: 100
redis:
  addr: '127.0.0.1:6379'
EOF

cat >"$tmpdir/double.yaml" <<'EOF'
app:
  name: demo
mysql:
  dsn: "demo:secret@tcp(localhost:3306)/sample?charset=utf8mb4"
  max_idle_conns: 20
redis:
  addr: "127.0.0.1:6379"
EOF

assert_eq \
    "$(print_dsn "$tmpdir/single.yaml")" \
    "user:pass@tcp(127.0.0.1:3306)/demo?parseTime=true" \
    "single-quoted mysql.dsn"

assert_eq \
    "$(print_dsn "$tmpdir/double.yaml")" \
    "demo:secret@tcp(localhost:3306)/sample?charset=utf8mb4" \
    "double-quoted mysql.dsn"

cat >"$tmpdir/no-multi.yaml" <<'EOF'
mysql:
  dsn: 'user:pass@tcp(127.0.0.1:3306)/demo?parseTime=true'
EOF

assert_eq \
    "$(print_migrate_cmd "$tmpdir/no-multi.yaml")" \
    'goose -dir sql/migrations mysql "user:pass@tcp(127.0.0.1:3306)/demo?parseTime=true&multiStatements=true" up' \
    "migrate-up appends multiStatements=true"

printf 'PASS: make DSN extraction\n'
