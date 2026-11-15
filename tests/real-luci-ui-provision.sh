#!/usr/bin/env bash
set -euo pipefail

CONTAINER="${1:-nginx-ui-gate}"
PORT="${2:-18080}"
LANG_CODE="${NGINX_UI_LANG:-en}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

for command in docker; do
	command -v "$command" >/dev/null || { echo "missing host command: $command" >&2; exit 1; }
done

docker exec "$CONTAINER" sh -c '
	set -eu
	for command in bash jq curl; do
		command -v "$command" >/dev/null || { echo "missing container command: $command" >&2; exit 1; }
	done
	mkdir -p /usr/libexec/rpcd /usr/share/luci/menu.d /usr/share/rpcd/acl.d \
		/usr/lib/lua/luci/i18n /www/luci-static/resources/nginx-manager \
		/www/luci-static/resources/view/nginx-manager
'

docker cp "$ROOT/root/etc/config/nginx_manager" "$CONTAINER:/etc/config/nginx_manager"
docker cp "$ROOT/root/etc/init.d/nginx_manager" "$CONTAINER:/etc/init.d/nginx_manager"
docker cp "$ROOT/root/etc/uci-defaults/90-luci-app-nginx-manager" "$CONTAINER:/etc/uci-defaults/90-luci-app-nginx-manager"
docker cp "$ROOT/root/usr/sbin/nginx-manager-gen" "$CONTAINER:/usr/sbin/nginx-manager-gen"
docker cp "$ROOT/root/usr/libexec/rpcd/nginx_manager" "$CONTAINER:/usr/libexec/rpcd/nginx_manager"
docker cp "$ROOT/root/usr/share/luci/menu.d/luci-app-nginx-manager.json" "$CONTAINER:/usr/share/luci/menu.d/"
docker cp "$ROOT/root/usr/share/rpcd/acl.d/luci-app-nginx-manager.json" "$CONTAINER:/usr/share/rpcd/acl.d/"
docker cp "$ROOT/www/luci-static/resources/nginx-manager/." "$CONTAINER:/www/luci-static/resources/nginx-manager/"
docker cp "$ROOT/www/luci-static/resources/view/nginx-manager/." "$CONTAINER:/www/luci-static/resources/view/nginx-manager/"

if [ -n "${NGINX_UI_LMO:-}" ]; then
	docker cp "$NGINX_UI_LMO" "$CONTAINER:/usr/lib/lua/luci/i18n/nginx-manager.zh-cn.lmo"
fi

PKG_VERSION="$(sed -n 's/^PKG_VERSION:=//p' "$ROOT/Makefile" | head -n1)"
PKG_RELEASE="$(sed -n 's/^PKG_RELEASE:=//p' "$ROOT/Makefile" | head -n1)"
PKG_FULL_VERSION="$PKG_VERSION-r$PKG_RELEASE"

docker exec "$CONTAINER" sh -c "
	set -eu
	chmod +x /etc/init.d/nginx_manager /etc/uci-defaults/90-luci-app-nginx-manager /usr/sbin/nginx-manager-gen /usr/libexec/rpcd/nginx_manager
	sed -i 's|@PKG_VERSION@|$PKG_VERSION|g; s|@PKG_FULL_VERSION@|$PKG_FULL_VERSION|g' \
		/www/luci-static/resources/nginx-manager/utils.js
	uci set uhttpd.main.listen_http='127.0.0.1:$PORT'
	uci set uhttpd.main.listen_https=''
	uci set luci.main.mediaurlbase='/luci-static/bootstrap'
	uci set luci.main.lang='$LANG_CODE'
	uci commit uhttpd
	uci commit luci
	/etc/uci-defaults/90-luci-app-nginx-manager 2>/dev/null || true
	rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache*
	/etc/init.d/rpcd restart >/dev/null 2>&1
	/etc/init.d/uhttpd restart >/dev/null 2>&1
"

HASH="$(docker exec "$CONTAINER" openssl passwd -6 -salt nginx-ui-gate "${NGINX_UI_PASSWORD:-nginx-gate}")"
docker exec "$CONTAINER" sh -c "sed -i 's|^root:[^:]*:|root:$HASH:|' /etc/shadow"

for attempt in 1 2 3 4 5 6 7 8 9 10; do
	status="$(curl -sS --max-time 3 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/cgi-bin/luci/" 2>/dev/null || true)"
	if [ "$status" = 200 ] || [ "$status" = 302 ] || [ "$status" = 403 ]; then
		echo "provisioned $CONTAINER on 127.0.0.1:$PORT lang=$LANG_CODE"
		exit 0
	fi
	sleep 1
done
echo "uhttpd did not become ready on 127.0.0.1:$PORT" >&2
exit 1
