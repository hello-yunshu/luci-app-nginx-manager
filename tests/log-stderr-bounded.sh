#!/bin/sh
# Contract: a failing sub-command is reported as ONE bounded log line, its raw
# stderr never reaches syslog verbatim, and a repeating failure is reported once
# instead of once per apply / cron tick.
#
# Regression source: log_err "Nginx reload failed: ${reload_output}" handed
# whatever `nginx -t` or /etc/init.d/nginx printed straight to `logger`. nginx -t
# failures are two lines, so one event became several syslog records that lost
# their tag and level, and every retry of the same broken config added them
# again. The reference implementation of this contract lives in
# luci-app-cloudflare-ip (tests/log-stderr-bounded.sh there).
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
GEN="$ROOT/root/usr/sbin/nginx-manager-gen"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM

OUT="$TMP/out.log"
: > "$OUT"
LOG_STATE_DIR="$TMP/log_state"
export OUT LOG_STATE_DIR

: > "$TMP/functions.sh"
extract_function() {
	awk -v name="$1" '
		$0 == name "() {" { copying = 1 }
		copying { print }
		copying && $0 == "}" { exit }
	' "$GEN" >> "$TMP/functions.sh"
}

for function in summarize_command_output log_once log_state_reset log_command_failure; do
	extract_function "$function"
done

# `logger` is replaced by a file append so the test can count records.
cat >> "$TMP/functions.sh" <<'EOF'
log_err()  { printf 'ERR %s\n' "$1" >> "$OUT"; }
log_warn() { printf 'WARN %s\n' "$1" >> "$OUT"; }
log_info() { printf 'INFO %s\n' "$1" >> "$OUT"; }

lines() { wc -l < "$OUT" | tr -d ' '; }
EOF

. "$TMP/functions.sh"

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

# nginx -t on a broken config: exactly what used to be dumped verbatim.
MULTILINE='nginx: [emerg] unknown directive "proxy_pas" in /etc/nginx/conf.d/site.conf:12
nginx: configuration file /etc/nginx/nginx.conf test failed'

# 1. Multi-line output collapses to one line that keeps the verdict line.
summary="$(summarize_command_output "$MULTILINE")"
[ -n "$summary" ] || fail "summary is empty"
[ "$(printf '%s' "$summary" | wc -l | tr -d ' ')" -eq 0 ] \
	|| fail "summary still spans multiple lines"
case "$summary" in
	*"test failed") ;;
	*) fail "summary dropped the verdict line: $summary" ;;
esac
case "$summary" in
	*" | "*) ;;
	*) fail "summary did not join the lines: $summary" ;;
esac

# 2. The clamp is a hard byte budget. OpenWrt has no UTF-8 locale, so the
#    ellipsis must be ASCII: a multi-byte one would overrun the budget.
long="$(awk 'BEGIN { for (i = 0; i < 600; i++) printf "x" }')"
summary="$(summarize_command_output "$long")"
bytes="$(printf '%s' "$summary" | LC_ALL=C wc -c | tr -d ' ')"
[ "$bytes" -eq 200 ] || fail "summary clamped to ${bytes} bytes, expected 200"
case "$summary" in
	*...) ;;
	*) fail "clamped summary lost its ASCII ellipsis" ;;
esac
[ "$(printf '%s' "$summary" | LC_ALL=C wc -c | tr -d ' ')" -le 200 ] \
	|| fail "clamp overran in the C locale"

# 3. A failing reload logs ONE line: no trace of the raw output, rc included.
log_command_failure nginx_reload "Nginx reload failed" "$MULTILINE" 1
[ "$(lines)" -eq 1 ] || fail "failing reload wrote $(lines) lines, expected 1"
grep -q '^ERR Nginx reload failed (rc=1): nginx: \[emerg\] unknown directive' "$OUT" \
	|| { cat "$OUT" >&2; fail "summary line missing or malformed"; }
grep -q '^nginx: configuration file' "$OUT" \
	&& { cat "$OUT" >&2; fail "raw output reached the log as its own record"; }

# 4. The same failure on the next apply is suppressed.
log_command_failure nginx_reload "Nginx reload failed" "$MULTILINE" 1
[ "$(lines)" -eq 1 ] || fail "repeated failure was logged again"

# 5. A different failure is still reported.
log_command_failure nginx_reload "Nginx reload failed" "nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address in use)" 1
[ "$(lines)" -eq 2 ] || fail "changed failure was suppressed"
grep -q 'Address in use' "$OUT" || fail "changed failure not reported"

# 6. A successful run re-arms the key, so the same failure is reported again.
log_state_reset nginx_reload
log_command_failure nginx_reload "Nginx reload failed" "$MULTILINE" 1
[ "$(lines)" -eq 3 ] || fail "recovery did not re-arm the failure report"

# 7. Static guard: no log_* call may interpolate a raw capture. Every capture
#    goes through log_command_failure (which summarizes and dedups) instead.
if grep -nE '^[[:space:]]*log_(err|warn|info) ".*\$\{[A-Za-z_]*(output|stdout|stderr|detail|err)[A-Za-z_]*\}' "$GEN" >"$TMP/raw" 2>/dev/null; then
	cat "$TMP/raw" >&2
	fail "log_* still interpolates a raw command capture"
fi

printf 'log-stderr-bounded contract passed\n'
