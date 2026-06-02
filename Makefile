# SPDX-License-Identifier: AGPL-3.0-only

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-nginx-manager
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_LICENSE:=AGPL-3.0-only
PKG_MAINTAINER:=yunshu

LUCI_TITLE:=Nginx Manager for LuCI
LUCI_DEPENDS:=+luci-base +nginx-ssl +nginx-util +rpcd +rpcd-mod-file +openssl-util
LUCI_PKGARCH:=all

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-nginx-manager
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=$(LUCI_TITLE)
  DEPENDS:=$(LUCI_DEPENDS)
  PKGARCH:=$(LUCI_PKGARCH)
endef

define Package/luci-app-nginx-manager/description
  Complete Nginx management plugin for OpenWrt LuCI.
  Provides site management, reverse proxy, SSL certificates,
  logs, configuration testing, backup and rollback.
endef

define Build/Configure
endef

define Build/Compile
	$(foreach lang,$(shell ls po/ 2>/dev/null), \
		$(STAGING_DIR_HOSTPKG)/bin/po2lmo \
			./po/$(lang)/nginx-manager.po \
			./po/$(lang)/nginx-manager.$(lang).lmo; \
	)
endef

define Package/luci-app-nginx-manager/install
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./root/etc/config/nginx_manager $(1)/etc/config/nginx_manager

	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./root/etc/uci-defaults/90-luci-app-nginx-manager $(1)/etc/uci-defaults/90-luci-app-nginx-manager

	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) ./root/usr/sbin/nginx-manager-gen $(1)/usr/sbin/nginx-manager-gen
	$(SED) 's/@PKG_VERSION@/$(PKG_VERSION)/' $(1)/usr/sbin/nginx-manager-gen

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./root/etc/init.d/nginx_manager $(1)/etc/init.d/nginx_manager

	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_BIN) ./root/usr/libexec/rpcd/nginx_manager $(1)/usr/libexec/rpcd/nginx_manager

	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-nginx-manager.json $(1)/usr/share/luci/menu.d/luci-app-nginx-manager.json

	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-nginx-manager.json $(1)/usr/share/rpcd/acl.d/luci-app-nginx-manager.json

	$(INSTALL_DIR) $(1)/htdocs/luci-static/resources/nginx-manager
	$(INSTALL_DATA) ./htdocs/luci-static/resources/nginx-manager/nginx-manager.css $(1)/htdocs/luci-static/resources/nginx-manager/nginx-manager.css

	$(INSTALL_DIR) $(1)/htdocs/luci-static/resources/view/nginx-manager
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/nginx-manager/overview.js $(1)/htdocs/luci-static/resources/view/nginx-manager/overview.js
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/nginx-manager/sites.js $(1)/htdocs/luci-static/resources/view/nginx-manager/sites.js
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/nginx-manager/site-edit.js $(1)/htdocs/luci-static/resources/view/nginx-manager/site-edit.js
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/nginx-manager/certificates.js $(1)/htdocs/luci-static/resources/view/nginx-manager/certificates.js
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/nginx-manager/logs.js $(1)/htdocs/luci-static/resources/view/nginx-manager/logs.js
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/nginx-manager/core-config.js $(1)/htdocs/luci-static/resources/view/nginx-manager/core-config.js
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/nginx-manager/backups.js $(1)/htdocs/luci-static/resources/view/nginx-manager/backups.js
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/nginx-manager/advanced.js $(1)/htdocs/luci-static/resources/view/nginx-manager/advanced.js

	$(INSTALL_DIR) $(1)/usr/share/luci/i18n
	$(foreach lang,$(shell ls po/ 2>/dev/null), \
		$(INSTALL_DATA) ./po/$(lang)/nginx-manager.$(lang).lmo $(1)/usr/share/luci/i18n/; \
	)
endef

define Package/luci-app-nginx-manager/postinst
#!/bin/sh
[ -n "${IPKG_INSTROOT}" ] || {
	/etc/uci-defaults/90-luci-app-nginx-manager
	rm -f /etc/uci-defaults/90-luci-app-nginx-manager
	rm -f /tmp/luci-indexcache
	rm -f /tmp/luci-modulecache/*
}
exit 0
endef

define Package/luci-app-nginx-manager/postrm
#!/bin/sh
[ -n "${IPKG_INSTROOT}" ] || {
	rm -f /tmp/luci-indexcache
	rm -f /tmp/luci-modulecache/*
}
exit 0
endef

$(eval $(call BuildPackage,luci-app-nginx-manager))
