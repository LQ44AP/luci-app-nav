# SPDX-License-Identifier: Apache-2.0
#
# luci-app-nav - 自定义 LuCI 导航首页

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-nav
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_LICENSE:=Apache-2.0
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=Your Name <you@example.com>

LUCI_TITLE:=LuCI support for a customizable navigation page
LUCI_DESCRIPTION:=Adds a "Nav" page under Services where you can edit \
  /www/nav.html and optionally make it uhttpd's default index page.
LUCI_DEPENDS:=+rpcd
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# 如果启用 CONFIG_LUCI_SRCDIET，取消下面一行的注释
# $(call BuildPackage,$(PKG_NAME))





