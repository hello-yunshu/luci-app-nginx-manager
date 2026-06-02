# luci-app-nginx-manager 完整设计方案

> 面向 OpenWrt 的完整 Nginx 图形化管理器  
> 目标：在 LuCI 中管理 Nginx 网站、反向代理、SSL 证书、日志、核心配置与高级配置，同时尽量避免破坏 LuCI 后台。  
> 日期：2026-06-02  
> 推荐许可证：AGPL-3.0-only

---

## 0. 项目基本信息

### 0.1 项目名称

推荐名称：

```text
luci-app-nginx-manager
```

不推荐继续使用：

```text
luci-app-nginx-config
```

原因：

- `nginx-config` 容易被理解为只编辑配置文件。
- `nginx-manager` 更符合本项目定位：网站、反代、SSL、日志、备份、核心配置、高级配置的综合管理器。
- 后续扩展 upstream、证书、日志、配置 diff、备份恢复时，`manager` 命名更自然。

### 0.2 项目定位

`luci-app-nginx-manager` 是一个面向 OpenWrt 的 Nginx 管理插件。

它不是简单的反向代理向导，而是偏完整的 Nginx 配置管理器，提供：

- Nginx 状态查看与服务控制
- 网站 / server block 管理
- 反向代理管理
- SSL 证书管理
- HTTP 到 HTTPS 重定向
- WebSocket 反代支持
- Upstream 管理
- 日志查看
- 配置测试、备份、回滚
- 核心配置查看与受控编辑
- 高级模式下的 nginx.conf / server block 编辑

由于本项目运行在 OpenWrt 上，Nginx 可能同时承担 LuCI 后台访问入口，因此本插件必须优先保证安全性和可恢复性。

### 0.3 核心原则

1. SSL 是必选能力，默认依赖 `nginx-ssl`。
2. 默认不破坏 OpenWrt 原有 Nginx 配置。
3. 插件只自动管理自己生成的配置文件。
4. 所有写入操作必须先备份。
5. 所有保存操作必须执行 `nginx -t`。
6. 配置测试失败必须自动回滚。
7. 高级核心配置编辑必须明确提示风险。
8. 不直接修改 `_lan` 和 `_redirect2ssl` 等系统默认 server 段。
9. 支持完整 Nginx 管理，但采用“基础模式 + 高级模式 + 救援机制”的分层设计。
10. 界面风格采用“LuCI 原生 + 轻量现代化增强”路线。
11. 项目结构、Makefile、LuCI 前端、rpcd ACL、CI/CD 必须符合 OpenWrt 最新开发规范。
12. GitHub Actions 必须自动构建 IPK 与 APK 包，并提供自动清理 workflow 运行记录的 workflow。

---

## 1. 开源协议要求

### 1.1 推荐许可证

本项目采用：

```text
AGPL-3.0-only
.github/workflows/build-packages.yml
.github/workflows/release-packages.yml
.github/workflows/cleanup-runs.yml
IPK + APK 双产物
```

即 GNU Affero General Public License v3.0 only。

### 1.2 选择 AGPL-3.0-only 的原因

本项目是一个 Web 管理界面，用户通过浏览器访问 LuCI 页面使用插件。如果只使用 GPL，部分修改者可能只在网络服务中部署修改版，而不分发修改后的源代码。

AGPL-3.0-only 更严格，适合本项目，原因是：

1. 它适用于通过网络交互使用的软件。
2. 如果有人修改本插件并通过 Web 界面对外提供服务，应当提供对应修改源码。
3. 可以防止闭源商用固件或面板直接拿走代码修改后不公开。
4. 保证项目长期保持开源。
5. 对路由器、NAS、旁路由、网关类 Web 管理工具更合适。

### 1.3 许可证文件

仓库根目录必须包含：

```text
LICENSE
```

内容使用 AGPL-3.0-only 官方文本。

### 1.4 源文件头部声明

建议所有核心源文件添加 SPDX 标识：

```text
SPDX-License-Identifier: AGPL-3.0-only
.github/workflows/build-packages.yml
.github/workflows/release-packages.yml
.github/workflows/cleanup-runs.yml
IPK + APK 双产物
```

例如 JS 文件头部：

```javascript
'use strict';
// SPDX-License-Identifier: AGPL-3.0-only
.github/workflows/build-packages.yml
.github/workflows/release-packages.yml
.github/workflows/cleanup-runs.yml
IPK + APK 双产物
```

Shell 文件头部：

```sh
#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
.github/workflows/build-packages.yml
.github/workflows/release-packages.yml
.github/workflows/cleanup-runs.yml
IPK + APK 双产物
```

Makefile 头部：

```makefile
# SPDX-License-Identifier: AGPL-3.0-only
.github/workflows/build-packages.yml
.github/workflows/release-packages.yml
.github/workflows/cleanup-runs.yml
IPK + APK 双产物
```

### 1.5 第三方代码限制

项目中不得直接复制不兼容许可证代码。

要求：

1. 不复制闭源项目代码。
2. 不复制许可证不明代码。
3. 不引入与 AGPL-3.0-only 冲突的第三方代码。
4. 如参考其他 LuCI 插件，只能学习结构和实现思路，不能直接复制大段代码。
5. 如使用第三方库，必须在 `NOTICE` 或文档中列出来源、版本、许可证。
6. 默认不引入大型前端依赖，减少许可证复杂性。

### 1.6 README 中的许可证说明

README 应写明：

```text
This project is licensed under the GNU Affero General Public License v3.0 only.
If you modify this project and provide it as a network-accessible service,
you must make the corresponding source code available under the same license.
```

中文说明：

```text
本项目使用 AGPL-3.0-only 协议。任何修改本项目并通过网络服务形式提供给用户使用的行为，都需要按照 AGPL-3.0-only 的要求开放对应修改源码。
```

---

## 2. 与 OpenWrt Nginx 体系的关系

OpenWrt Nginx 通常存在以下配置结构：

```text
/etc/config/nginx
/etc/nginx/uci.conf.template
/etc/nginx/uci.conf -> /var/lib/nginx/uci.conf
/etc/nginx/conf.d/*.conf
/etc/nginx/conf.d/*.locations
```

OpenWrt 的 `nginx-util` 可根据 `/etc/config/nginx` 生成 `/var/lib/nginx/uci.conf`。

本插件不替换 `nginx-util`，也不默认接管 `/etc/config/nginx`，而是采用独立配置源：

```text
/etc/config/nginx_manager
```

插件根据 `/etc/config/nginx_manager` 生成独立 Nginx 配置文件：

```text
/etc/nginx/conf.d/luci-manager/*.conf
```

即：

```text
/etc/config/nginx_manager
        ↓
/usr/sbin/nginx-manager-gen
        ↓
/etc/nginx/conf.d/luci-manager/*.conf
        ↓
nginx -t
        ↓
/etc/init.d/nginx reload
```

这样可以避免污染 OpenWrt 原生 `/etc/config/nginx`，同时方便备份、回滚和判断哪些配置由插件生成。

---

## 3. 管理模式设计

本插件提供三种管理层级。

### 3.1 基础模式：站点与反代管理

基础模式面向普通用户。

可以管理：

- 域名
- 监听端口
- HTTP / HTTPS
- SSL 证书
- HTTP 自动跳转 HTTPS
- 静态网站 root
- 反向代理 proxy_pass
- WebSocket
- 常用 proxy header
- access_log / error_log
- 启用 / 禁用站点

基础模式不会直接编辑 `/etc/nginx/nginx.conf` 或 `/etc/nginx/uci.conf.template`。

每个站点生成一个完整 server block，例如：

```text
/etc/nginx/conf.d/luci-manager/sites/grafana.conf
```

### 3.2 高级模式：完整 server block 编辑

高级模式面向熟悉 Nginx 的用户。

允许用户：

- 查看插件生成的完整 server block
- 切换为高级编辑
- 直接编辑某个站点的 server block
- 查看 diff
- 保存前自动备份
- 保存后执行 `nginx -t`
- 失败自动回滚

高级模式只允许编辑插件管理目录下的文件：

```text
/etc/nginx/conf.d/luci-manager/
```

默认不允许编辑系统目录中的非插件配置。

### 3.3 核心配置模式：受控编辑 nginx 核心配置

由于本项目偏向完整 Nginx 配置管理器，因此提供核心配置管理能力。

核心配置分为两类。

#### A. 安全表单项

通过表单管理常见核心参数：

- worker_processes
- worker_connections
- client_max_body_size
- keepalive_timeout
- gzip
- server_tokens
- sendfile
- access_log 默认策略
- error_log 路径
- include 路径查看
- SSL protocols 默认值
- SSL ciphers 默认值

这类配置由插件生成到：

```text
/etc/nginx/conf.d/luci-manager/00-global.conf
```

或根据 OpenWrt 当前 nginx 模板能力生成到合适位置。

#### B. 高风险核心文件编辑

高级用户可以查看：

```text
/etc/nginx/uci.conf.template
/etc/nginx/nginx.conf
/etc/nginx/uci.conf
nginx -T 输出
```

但默认只读。

只有用户开启“危险编辑模式”后，才允许编辑核心配置文件。

危险编辑模式必须满足：

1. 明确提示风险。
2. 保存前完整备份 `/etc/nginx` 与 `/etc/config/nginx`。
3. 保存后执行 `nginx -t`。
4. 失败自动回滚。
5. 成功后才允许 reload。
6. 提供恢复按钮。
7. 建议保留 uhttpd 或 SSH 作为救援通道。

---

## 4. 插件配置文件

插件主配置文件：

```text
/etc/config/nginx_manager
```

### 4.1 全局配置

```uci
config global 'global'
    option enabled '1'
    option ssl_required '1'
    option managed_dir '/etc/nginx/conf.d/luci-manager'
    option cert_dir '/etc/nginx/certs/luci-manager'
    option backup_dir '/etc/nginx-manager/backups'
    option auto_backup '1'
    option test_before_reload '1'
    option reload_after_save '1'
    option advanced_mode '0'
    option dangerous_core_edit '0'
```

### 4.2 站点配置：反向代理

```uci
config site 'grafana'
    option enabled '1'
    option name 'grafana'
    option mode 'reverse_proxy'
    option server_name 'grafana.lan'
    list listen '443 ssl'
    list listen '[::]:443 ssl'
    option redirect_https '1'
    option proxy_pass 'http://192.168.1.201:3000'
    option websocket '1'
    option proxy_host '1'
    option proxy_xff '1'
    option proxy_xfp '1'
    option proxy_xri '1'
    option ssl_cert 'grafana'
    option access_log '0'
    option error_log '1'
    option custom_server_block '0'
```

### 4.3 站点配置：静态网站

```uci
config site 'homepage'
    option enabled '1'
    option name 'homepage'
    option mode 'static'
    option server_name 'home.lan'
    list listen '443 ssl'
    option redirect_https '1'
    option root '/www/homepage'
    option index 'index.html'
    option ssl_cert 'homepage'
```

### 4.4 Upstream 配置

```uci
config upstream 'backend_grafana'
    option enabled '1'
    option name 'backend_grafana'
    list server '192.168.1.201:3000'
    list server '192.168.1.202:3000'
    option keepalive '16'
```

### 4.5 证书配置

```uci
config cert 'grafana'
    option name 'grafana'
    option type 'manual'
    option cert_path '/etc/nginx/certs/luci-manager/grafana/fullchain.pem'
    option key_path '/etc/nginx/certs/luci-manager/grafana/privkey.pem'
    option domain 'grafana.lan'
    option auto_renew '0'
```

支持证书类型：

```text
manual       手动上传证书
self_signed  自签名证书
acme         通过 OpenWrt acme/acme.sh 集成
existing     选择已有证书路径
```

---

## 5. 生成文件结构

插件生成的文件统一放在独立目录：

```text
/etc/nginx/conf.d/luci-manager/
├── 00-global.conf
├── upstreams.conf
├── sites/
│   ├── grafana.conf
│   ├── homepage.conf
│   └── jellyfin.conf
└── disabled/
    └── old-site.conf.disabled
```

证书文件放在：

```text
/etc/nginx/certs/luci-manager/
├── grafana/
│   ├── fullchain.pem
│   └── privkey.pem
└── homepage/
    ├── fullchain.pem
    └── privkey.pem
```

备份文件放在：

```text
/etc/nginx-manager/backups/
├── 2026-06-02-153000/
│   ├── nginx/
│   ├── config-nginx
│   ├── config-nginx-manager
│   └── manifest.json
```

每个生成文件顶部加入标记：

```nginx
# Generated by luci-app-nginx-manager.
# Source: /etc/config/nginx_manager
# SPDX-License-Identifier: AGPL-3.0-only
# Do not edit manually unless advanced mode is enabled.
```

---

## 6. 配置生成逻辑

保存配置时，后端执行：

```text
1. 校验输入
2. 创建备份
3. 读取 /etc/config/nginx_manager
4. 生成临时配置到 /tmp/nginx-manager-build/
5. 检查生成文件
6. 同步到 /etc/nginx/conf.d/luci-manager/
7. 执行 nginx -t
8. 如果成功：
      /etc/init.d/nginx reload
   如果失败：
      恢复备份
      再次 nginx -t
      返回错误信息
```

重要要求：

- 禁止直接拼接未经校验的 shell 命令。
- 站点名称只能包含字母、数字、点、下划线、短横线。
- 域名、路径、端口必须校验。
- 证书私钥文件权限建议为 600。
- 不允许通过表单写入任意系统路径。
- 不自动删除非插件生成的 Nginx 配置。
- 非插件配置只读展示。
- 所有写入动作都应通过后端白名单 API 完成。
- 前端不得直接执行 shell 命令。

---

## 7. 生成配置示例

### 7.1 HTTPS 反向代理站点

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name grafana.lan;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name grafana.lan;

    ssl_certificate /etc/nginx/certs/luci-manager/grafana/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/luci-manager/grafana/privkey.pem;

    location / {
        proxy_pass http://192.168.1.201:3000;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 7.2 静态网站

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name home.lan;

    ssl_certificate /etc/nginx/certs/luci-manager/homepage/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/luci-manager/homepage/privkey.pem;

    root /www/homepage;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

### 7.3 Upstream

```nginx
upstream backend_grafana {
    server 192.168.1.201:3000;
    server 192.168.1.202:3000;
    keepalive 16;
}
```

---

## 8. LuCI 界面设计

菜单：

```text
服务 → Nginx 管理器
    ├── 概览
    ├── 网站
    ├── 反向代理
    ├── Upstream
    ├── SSL 证书
    ├── 日志
    ├── 核心配置
    ├── 备份与恢复
    └── 高级工具
```

### 8.1 概览页

显示：

- Nginx 是否安装
- Nginx 是否运行
- Nginx 版本
- SSL 模块状态
- 当前监听端口
- 插件管理站点数量
- 非插件管理配置数量
- 证书到期提醒
- 最近一次配置测试结果
- 最近一次 reload 时间

快捷操作：

- 启动
- 停止
- 重启
- Reload
- `nginx -t`
- 查看 `nginx -T`

### 8.2 网站页

管理：

- 新增站点
- 编辑站点
- 启用 / 禁用
- 删除
- 复制站点
- 查看生成配置
- 查看 diff
- 测试单站点配置
- 高级编辑 server block

站点类型：

```text
反向代理
静态网站
自定义 server block
重定向站点
```

### 8.3 SSL 证书页

功能：

- 上传证书
- 生成自签名证书
- 选择已有证书
- 集成 OpenWrt acme
- 查看证书域名
- 查看证书到期时间
- 续签
- 替换证书
- 删除证书

SSL 为必选能力，因此本插件默认依赖 `nginx-ssl`。

### 8.4 核心配置页

分为两个部分。

#### 安全设置

表单管理常见核心项：

- worker_processes
- worker_connections
- client_max_body_size
- keepalive_timeout
- gzip
- server_tokens
- sendfile
- error_log
- access_log
- SSL protocols
- SSL ciphers

#### 危险编辑

默认关闭。

开启后可以编辑：

- `/etc/nginx/uci.conf.template`
- `/etc/nginx/nginx.conf`
- 插件生成的 `00-global.conf`
- 插件生成的 server block

危险编辑必须有确认提示、备份、测试、回滚。

### 8.5 日志页

支持：

- error log 查看
- access log 查看
- 按站点筛选
- 查看最近 100 / 200 / 500 行
- 关键词过滤
- 下载日志

### 8.6 备份与恢复页

功能：

- 查看备份列表
- 查看备份时间
- 查看备份内容
- 比较当前配置与备份
- 一键恢复
- 恢复前测试
- 恢复后 reload

---

## 9. 界面风格与前端规范

本插件的界面设计需要在“现代化”和“LuCI 原生一致性”之间取得平衡。

目标不是做一个完全脱离 OpenWrt 的独立管理后台，而是在 LuCI 原生界面体系内，做出更清晰、更现代、更高级的 Nginx 管理体验。

### 9.1 风格总纲

界面风格采用：

```text
LuCI 原生结构
+ 轻量卡片化概览
+ 状态徽标
+ 清晰分组
+ 危险区域隔离
+ 高级功能折叠
```

插件应看起来像 OpenWrt 的一部分，而不是一个嵌进 LuCI 的独立 Web 面板。

### 9.2 设计原则

1. 尊重 LuCI 原生布局
   - 使用 LuCI 原生菜单、页面标题、section、form、table、modal、button 等结构。
   - 不引入 Element Plus、Ant Design、Naive UI、Bootstrap、Tailwind 等大型 UI 框架。
   - 不重置 LuCI 全局样式。
   - 不破坏不同 LuCI 主题下的兼容性。

2. 尽量使用 LuCI 原生 CSS
   - 优先使用 LuCI 已有 class。
   - 自定义 CSS 只用于局部增强。
   - 自定义样式必须作用在插件根容器下，例如 `.nginx-manager-page`，避免污染 LuCI 全局。
   - 禁止覆盖 `body`、`html`、`.main`、`.cbi-section` 等全局样式。

3. 现代化但不浮夸
   - 页面可以有卡片化概览、状态徽标、轻量图标、分组面板。
   - 不做重度玻璃拟态、复杂动画、强渐变背景。
   - 不做全屏独立 Dashboard。
   - 不使用会影响低性能路由器的复杂动效。

4. 信息层级清晰
   - 概览页优先展示状态、风险、快捷操作。
   - 站点页优先展示启用状态、域名、监听端口、SSL 状态、后端地址。
   - 高危操作必须有明显提示。
   - 高级功能默认收起。

5. 移动端可用
   - 页面在窄屏下可阅读、可操作。
   - 表格列过多时允许横向滚动。
   - 表单分组清晰，不堆叠过长。

### 9.3 可参考的 LuCI app

可以参考优秀 LuCI app 的组织方式，例如：

- `luci-app-opkg`
- `luci-app-firewall`
- `luci-app-openclash`
- `luci-app-passwall`
- `luci-app-statistics`
- `luci-app-ttyd`
- `luci-app-acme`

但本插件不应照搬某一个插件的视觉风格。

### 9.4 页面布局规范

#### 概览页

概览页采用轻量卡片布局，但仍基于 LuCI 原生 section。

建议包括：

```text
Nginx 状态
SSL 状态
站点数量
证书到期
最近一次配置测试
最近一次 reload
```

状态类型：

```text
running    运行中
stopped    已停止
warning    警告
error      错误
success    正常
disabled   未启用
```

#### 网站列表页

站点列表使用 LuCI 原生 table / GridSection 风格。

列建议：

```text
启用
名称
域名
类型
监听
SSL
后端 / 根目录
状态
操作
```

操作按钮：

```text
编辑
测试
复制
禁用
删除
```

删除、恢复、危险编辑等操作必须使用二次确认。

#### 站点编辑页

站点编辑页使用分组表单，不要把所有字段堆在一个长表单里。

推荐分组：

```text
基础设置
监听与域名
SSL 证书
反向代理
日志
高级设置
```

高级设置默认折叠。

#### SSL 证书页

证书页需要重点展示：

```text
证书名称
类型
绑定域名
证书路径
到期时间
状态
使用中的站点
```

证书状态：

```text
有效
即将过期
已过期
文件缺失
证书与私钥不匹配
```

#### 核心配置页

核心配置页必须明显区分：

```text
安全配置
危险编辑
只读查看
```

危险编辑区域必须默认折叠，并显示警告：

```text
修改核心配置可能导致 Nginx 无法启动，甚至导致 LuCI 后台不可访问。
请确保 SSH 可用，或保留 uhttpd 作为备用入口。
```

### 9.5 自定义 CSS 规范

允许添加一个很小的 CSS 文件：

```text
htdocs/luci-static/resources/nginx-manager/nginx-manager.css
```

但必须满足：

1. 只写插件局部样式。
2. 所有 class 以 `.nginx-manager-` 开头。
3. 不覆盖 LuCI 全局 class。
4. 不使用复杂动画。
5. 不依赖外部字体、图标库或 CDN。
6. 不使用 Tailwind / Bootstrap / Bulma 等 CSS 框架。

推荐 class 命名：

```css
.nginx-manager-page {}
.nginx-manager-overview {}
.nginx-manager-card {}
.nginx-manager-card-title {}
.nginx-manager-card-value {}
.nginx-manager-status {}
.nginx-manager-status-success {}
.nginx-manager-status-warning {}
.nginx-manager-status-error {}
.nginx-manager-actions {}
.nginx-manager-danger-zone {}
.nginx-manager-code-block {}
```

### 9.6 交互规范

1. 保存前提示用户是否立即 reload。
2. 配置测试失败时，展示 nginx 错误输出。
3. 删除站点前确认。
4. 危险编辑前确认。
5. 证书即将过期时在概览页提示。
6. 操作成功后使用 LuCI 原生 notification。
7. 长任务显示 loading 状态。
8. 避免无提示地执行重启、删除、覆盖等操作。

### 9.7 前端技术要求

前端应使用 LuCI JS 体系：

```javascript
'use strict';
'require view';
'require form';
'require fs';
'require ui';
'require rpc';
'require uci';
```

优先使用：

```text
form.Map
form.TypedSection
form.GridSection
form.NamedSection
form.Value
form.Flag
form.ListValue
form.DynamicList
ui.showModal
ui.addNotification
rpc.declare
```

不要使用：

```text
Vue
React
Svelte
jQuery
大型 CSS 框架
外部 CDN
```

### 9.8 代码编辑器策略

第一版不引入 Monaco Editor、CodeMirror 等大型编辑器。

配置查看和高级编辑使用普通 textarea + 语法提示说明。

后续如果确实需要代码编辑器，应作为可选依赖或独立高级功能，不默认打包进入插件。

### 9.9 性能要求

1. 页面首屏加载快。
2. 不在前端一次性渲染巨大 `nginx -T` 输出。
3. 日志默认只读取最近 200 行。
4. 大日志需要分页或按行数加载。
5. 不做持续轮询，除非用户打开实时日志。
6. 不引入大体积前端依赖。

### 9.10 可访问性与主题兼容

1. 不依赖单一颜色表达状态，状态文字必须可见。
2. 兼容 LuCI 默认主题。
3. 兼容深色主题或第三方主题时不出现严重不可读。
4. 不硬编码大面积背景色。
5. 按钮、表单、表格尽量使用 LuCI 原生样式。

---

## 10. 技术架构

目录结构：

```text
luci-app-nginx-manager/
├── .github/
│   └── workflows/
│       ├── build-packages.yml
│       ├── release-packages.yml
│       └── cleanup-runs.yml
├── LICENSE
├── README.md
├── Makefile
├── htdocs/
│   └── luci-static/
│       └── resources/
│           ├── nginx-manager/
│           │   └── nginx-manager.css
│           └── view/
│               └── nginx-manager/
│                   ├── overview.js
│                   ├── sites.js
│                   ├── site-edit.js
│                   ├── upstreams.js
│                   ├── certificates.js
│                   ├── logs.js
│                   ├── core-config.js
│                   ├── backups.js
│                   └── advanced.js
├── root/
│   ├── etc/
│   │   ├── config/
│   │   │   └── nginx_manager
│   │   └── uci-defaults/
│   │       └── 90-luci-app-nginx-manager
│   └── usr/
│       ├── sbin/
│       │   └── nginx-manager-gen
│       ├── libexec/
│       │   └── rpcd/
│       │       └── nginx_manager
│       └── share/
│           ├── luci/
│           │   └── menu.d/
│           │       └── luci-app-nginx-manager.json
│           └── rpcd/
│               └── acl.d/
│                   └── luci-app-nginx-manager.json
└── po/
    └── zh-cn/
        └── nginx-manager.po
```

---

## 11. rpcd / ubus API

后端提供：

```text
status
list_sites
get_site
set_site
delete_site
enable_site
disable_site
render_site
test_config
reload_nginx
restart_nginx

list_upstreams
get_upstream
set_upstream
delete_upstream

list_certs
get_cert
set_cert
delete_cert
upload_cert
issue_self_signed
acme_issue
acme_renew
check_cert_expiry

get_logs
get_error_log
get_access_log

get_core_config
set_core_config_safe
get_nginx_T
get_file_readonly
set_file_dangerous

list_backups
create_backup
restore_backup
diff_backup
```

### 11.1 API 安全要求

1. 所有 API 必须进行权限检查。
2. rpcd ACL 只开放本插件必要方法。
3. 不提供任意 shell 命令执行接口。
4. 不提供任意文件读写接口。
5. 读取文件必须限制在白名单路径中。
6. 写入文件必须限制在插件管理路径或明确允许的核心配置路径中。
7. 危险写入必须检查 `dangerous_core_edit=1`。
8. 所有错误信息应返回给前端，但不得泄露敏感私钥内容。

---

## 12. 依赖

必选依赖：

```text
luci-base
nginx-ssl
nginx-util
rpcd
rpcd-mod-file
openssl-util
```

可选依赖：

```text
acme
acme-common
ca-bundle
```

如果启用 ACME 页面，则检测是否安装 `acme`。未安装时提示用户安装。

因为本项目要求 SSL 是核心能力，所以 `nginx-ssl` 为必选依赖。

---

## 13. 与 luci-nginx 的兼容

如果用户安装了 `luci-nginx` 或 `luci-ssl-nginx`，Nginx 可能正在承载 LuCI 后台。

本插件必须：

- 不修改 `_lan`
- 不修改 `_redirect2ssl`
- 不删除系统默认 `.locations`
- 不覆盖 `/etc/config/nginx`
- 不默认修改 `/etc/nginx/uci.conf.template`
- 不抢占 LuCI 已使用的 listen 配置
- 修改前检测 80 / 443 是否已有默认 server
- 修改失败自动恢复

如果检测到 LuCI 运行在 Nginx 上，则在核心配置页显示警告：

```text
当前 LuCI 后台可能运行在 Nginx 上。错误修改核心配置可能导致 Web 管理界面不可访问。请确保 SSH 可用，或保留 uhttpd 作为备用入口。
```

---

## 14. 备份与回滚策略

### 14.1 备份触发时机

以下操作前必须备份：

- 新增站点
- 修改站点
- 删除站点
- 修改证书
- 上传证书
- 修改 upstream
- 修改核心配置
- 进入危险编辑并保存
- 恢复旧备份前

### 14.2 备份内容

备份目录：

```text
/etc/nginx-manager/backups/<timestamp>/
```

备份内容：

```text
/etc/nginx/
/etc/config/nginx
/etc/config/nginx_manager
生成文件 manifest
操作来源
操作时间
```

### 14.3 回滚流程

配置测试失败时：

```text
1. 停止应用当前生成结果
2. 恢复最近一次有效备份
3. 再次执行 nginx -t
4. 如果测试通过，reload nginx
5. 如果仍失败，提示用户通过 SSH 检查
```

### 14.4 备份清理

默认保留最近 20 个备份。

可在设置中调整：

```uci
option max_backups '20'
```

---

## 15. 日志与状态检测

### 15.1 状态检测

概览页应检测：

- nginx 进程状态
- `/etc/init.d/nginx enabled`
- nginx 版本
- SSL 模块状态
- 当前监听端口
- 最近一次 `nginx -t` 结果
- 最近一次 reload 结果
- 证书有效期
- 插件生成配置数量
- 非插件配置数量

### 15.2 日志读取

日志读取要求：

- 默认读取最近 200 行。
- 支持选择 100 / 200 / 500 行。
- 禁止一次性读取巨大日志。
- 支持按关键词过滤。
- 支持按站点查看 access_log / error_log。
- 日志路径必须在白名单或配置路径中。

---


## 16. OpenWrt 最新标准与 CI/CD 要求

本项目必须按 OpenWrt 最新包开发习惯设计，而不是只兼容旧版 opkg / ipk。

OpenWrt 25.12 及更新版本已经从 opkg 切换到 apk 包管理，因此项目需要同时考虑：

```text
旧稳定版 / 兼容构建：IPK
OpenWrt 25.12+ / snapshot：APK
```

CI/CD 需要自动构建两类产物：

```text
*.ipk
*.apk
```

### 16.1 OpenWrt 包规范要求

项目必须遵守 OpenWrt LuCI app 的常规结构和打包方式：

```text
Makefile
htdocs/luci-static/resources/view/...
root/etc/config/...
root/usr/libexec/rpcd/...
root/usr/share/rpcd/acl.d/...
root/usr/share/luci/menu.d/...
po/zh-cn/...
```

Makefile 要求：

1. 使用 OpenWrt package Makefile 风格。
2. 使用 `include $(TOPDIR)/rules.mk`。
3. 使用 `include $(INCLUDE_DIR)/package.mk`。
4. LuCI 相关内容按 OpenWrt LuCI app 习惯安装。
5. 不使用非 OpenWrt 标准的安装路径。
6. 包名必须为 `luci-app-nginx-manager`。
7. License 字段必须标明 `AGPL-3.0-only`。
8. 依赖必须明确写入 `DEPENDS`。
9. Shell 脚本安装后必须有可执行权限。
10. rpcd 后端必须安装到 `/usr/libexec/rpcd/nginx_manager`。
11. ACL 必须安装到 `/usr/share/rpcd/acl.d/luci-app-nginx-manager.json`。
12. 菜单必须安装到 `/usr/share/luci/menu.d/luci-app-nginx-manager.json`。

### 16.2 兼容 IPK 与 APK

CI 应至少覆盖两类 OpenWrt SDK：

```text
OpenWrt 24.10.x 或仍使用 opkg 的稳定版：生成 .ipk
OpenWrt 25.12.x / snapshot 或使用 apk 的版本：生成 .apk
```

构建逻辑不能假设产物一定是 `.ipk`。

产物收集必须同时匹配：

```text
bin/packages/**/*.ipk
bin/packages/**/*.apk
```

Release 上传时也必须同时支持：

```text
*.ipk
*.apk
*.buildinfo.txt
*.sha256sum
```

### 16.3 GitHub Actions 目录

仓库必须包含：

```text
.github/workflows/build-packages.yml
.github/workflows/release-packages.yml
.github/workflows/cleanup-runs.yml
```

### 16.4 build-packages.yml

用途：

```text
每次 push / pull_request 时自动构建测试。
```

触发条件：

```yaml
on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
  workflow_dispatch:
```

构建矩阵建议包含：

```text
x86_64
armsr-armv8
aarch64_cortex-a53
```

版本矩阵建议包含：

```text
24.10.x    # IPK 兼容构建
25.12.x    # APK 构建
snapshot   # 最新兼容性验证，可允许失败
```

如果 GitHub Actions 时间较长，第一阶段可先构建：

```text
x86_64 + 24.10.x
x86_64 + 25.12.x
```

然后逐步增加架构。

### 16.5 推荐使用 OpenWrt SDK 构建

优先使用 OpenWrt 官方 SDK 或官方 SDK Docker 容器构建。

可参考官方 GitHub Action：

```text
openwrt/gh-action-sdk
```

该 Action 的设计目标是通过 OpenWrt SDK Docker 容器构建包，适合 downstream package repository 使用。

CI 需要设置：

```text
ARCH
PACKAGES=luci-app-nginx-manager
BUILD_LOG=1
INDEX=1
```

其中 `INDEX=1` 用于生成包索引，便于后续做 package feed。

### 16.6 release-packages.yml

用途：

```text
在 tag 或手动触发时自动构建 release 包，并上传到 GitHub Releases。
```

触发条件：

```yaml
on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
```

Release 产物命名建议：

```text
luci-app-nginx-manager_<version>_<openwrt-version>_<arch>.ipk
luci-app-nginx-manager_<version>_<openwrt-version>_<arch>.apk
```

如果 APK 构建产物文件名本身不包含架构信息，CI 需要在归档或 Release asset 名称中补充 arch / OpenWrt 版本，避免用户混淆。

每次 release 需要附带：

```text
sha256sums.txt
buildinfo_<openwrt-version>_<arch>.txt
```

buildinfo 至少包括：

```text
Git commit
Git tag
OpenWrt version
SDK arch
Package manager type: ipk/apk
Build time
Built package filenames
```

### 16.7 cleanup-runs.yml

用途：

```text
自动清理 GitHub Actions 历史运行记录，避免 Actions 页面堆积过多记录。
```

触发条件：

```yaml
on:
  schedule:
    - cron: '0 3 * * 0'
  workflow_dispatch:
```

清理策略建议：

```text
保留最近 30 天的 workflow runs
每个 workflow 至少保留最近 10 次运行
不删除正在运行中的 workflow
不删除当前 workflow 自身正在执行的 run
```

可使用成熟 action，例如：

```text
Mattraks/delete-workflow-runs
```

也可以使用 GitHub CLI：

```sh
gh run list --limit 200 --json databaseId,createdAt,status,name
```

然后按保留策略删除旧记录。

### 16.8 CI 安全要求

GitHub Actions 必须遵守：

1. 不在 PR 中暴露私钥。
2. feed 签名私钥只允许在 release workflow 中使用。
3. fork PR 不应访问 secrets。
4. 默认 build workflow 不需要写权限。
5. release workflow 才需要 `contents: write`。
6. cleanup workflow 才需要 `actions: write`。
7. workflow permissions 必须最小化。

建议权限：

```yaml
permissions:
  contents: read
```

release workflow：

```yaml
permissions:
  contents: write
```

cleanup workflow：

```yaml
permissions:
  actions: write
  contents: read
```

### 16.9 CI 产物保留策略

普通构建 artifact：

```text
保留 7 天
```

Release 产物：

```text
长期保留在 GitHub Releases
```

构建日志：

```text
失败时必须上传
成功时可选上传
```

### 16.10 与 upnp-bridge-relay 项目的参考关系

可以参考 `upnp-bridge-relay` 项目的 GitHub Actions 思路，尤其是：

```text
自动构建 OpenWrt 包
按架构归档构建产物
上传 Release
清理 workflow 历史记录
```

但本项目最终 workflow 必须以本 plan 为准，并适配：

```text
luci-app-nginx-manager
IPK + APK 双产物
AGPL-3.0-only
LuCI app 打包结构
OpenWrt 25.12+ apk 包管理
```

### 16.11 CI 验收标准

Phase 1 完成时，CI 至少应满足：

1. push 到 main 后自动构建。
2. PR 自动构建。
3. 手动 workflow_dispatch 可构建。
4. 至少生成 x86_64 的 IPK。
5. 至少生成 x86_64 的 APK。
6. 上传构建产物 artifact。
7. Release tag 可自动发布 IPK / APK。
8. cleanup workflow 可手动运行。
9. cleanup workflow 可按周自动运行。
10. CI 失败时能看到完整构建日志。


## 17. 开发计划

### Phase 1：SSL 必选的站点管理 MVP

1. 项目更名为 `luci-app-nginx-manager`
2. 创建 `LICENSE`，采用 AGPL-3.0-only
3. Makefile 与目录骨架
4. `/etc/config/nginx_manager`
5. rpcd API：status / list_sites / get_site / set_site / delete_site
6. 生成完整 server block 到 `/etc/nginx/conf.d/luci-manager/sites/`
7. 必选 SSL 证书路径选择
8. HTTP 到 HTTPS 重定向
9. WebSocket 反代开关
10. `nginx -t`
11. `/etc/init.d/nginx reload`
12. 自动备份与失败回滚
13. LuCI 网站列表与编辑页面
14. 基础日志查看
15. 初版局部 CSS：LuCI 原生 + 轻量卡片 + 状态徽标
16. 添加 GitHub Actions：build-packages.yml
17. 添加 GitHub Actions：release-packages.yml
18. 添加 GitHub Actions：cleanup-runs.yml
19. 实现 IPK / APK 双格式构建产物收集

### Phase 2：证书管理与 Upstream

1. 手动上传证书
2. 自签名证书生成
3. 证书到期检测
4. OpenWrt acme 集成
5. Upstream 管理
6. 静态网站管理
7. 非插件配置扫描与只读展示

### Phase 3：完整配置管理

1. 核心配置安全表单
2. `00-global.conf` 生成
3. `nginx -T` 查看
4. 配置 diff
5. 高级 server block 编辑
6. 危险核心文件编辑
7. 备份与恢复页面
8. 恢复前测试与恢复后 reload

### Phase 4：增强功能

1. Basic Auth
2. IP allow / deny
3. Cloudflare real IP 模板
4. 安全 headers 模板
5. gzip / brotli 检测
6. 缓存配置模板
7. 多站点复制
8. 导入已有 Nginx 配置

---

## 18. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 配置错误导致 Nginx 无法启动 | LuCI 后台不可访问 | 保存前备份，`nginx -t`，失败回滚 |
| LuCI 正在运行在 Nginx 上 | 改坏后无法进入后台 | 不修改 `_lan`，提示保留 SSH / uhttpd |
| 用户已有手写配置 | 被覆盖或冲突 | 插件只管理 `/etc/nginx/conf.d/luci-manager/` |
| SSL 证书错误 | HTTPS 站点不可用 | 保存前检查 cert/key 是否存在且匹配 |
| ACME 配置复杂 | 申请失败 | Phase 2 集成，先支持手动证书和自签名 |
| 高级编辑造成不可控配置 | Nginx 启动失败 | 危险模式默认关闭，强制备份和测试 |
| OpenWrt nginx-util 变化 | 兼容性问题 | 不深度依赖 nginx-util 的 server section 生成机制 |
| 端口冲突 | 站点无法启动 | 保存前检测 listen/server_name 冲突 |
| 文件路径注入 | 安全风险 | 严格限制文件名和路径白名单 |
| UI 脱离 LuCI 原生风格 | 后期难维护，主题不兼容 | 使用 LuCI JS/form/rpc，局部 CSS，禁止大型 UI 框架 |
| 许可证被规避 | 修改版闭源发布 | 使用 AGPL-3.0-only，并添加 SPDX 标识 |

---

## 19. AI IDE 开发约束

给 AI IDE 的强约束：

```text
不要生成独立 index.html。
不要使用 Vue / React / Svelte。
不要引入 Tailwind / Bootstrap / Element Plus / Ant Design。
不要使用外部 CDN。
不要重写 LuCI 布局。
不要直接修改 /etc/config/nginx。
不要默认修改 /etc/nginx/uci.conf.template。
不要直接覆盖用户已有 conf.d 文件。
不要提供任意 shell 命令执行接口。
不要提供任意文件读写接口。
不要把证书放进 /etc/nginx/conf.d/。
不要把自定义 CSS 写成全局覆盖。
不要只构建 IPK，必须同时规划 APK。
不要写死 opkg，OpenWrt 25.12+ 需要兼容 apk。
不要给 GitHub Actions 配置过大的默认权限。
```

应该使用：

```text
LuCI JS view
form.Map
form.TypedSection
form.GridSection
rpc.declare
ui.addNotification
ui.showModal
/etc/config/nginx_manager
/usr/sbin/nginx-manager-gen
/etc/nginx/conf.d/luci-manager/
/etc/nginx/certs/luci-manager/
AGPL-3.0-only
.github/workflows/build-packages.yml
.github/workflows/release-packages.yml
.github/workflows/cleanup-runs.yml
IPK + APK 双产物
```

---

## 20. 最终目标

本项目最终形态是：

```text
一个 OpenWrt 上的完整 Nginx 管理器。
既能让普通用户安全添加 HTTPS 反向代理站点，
也能让高级用户查看、编辑、测试和回滚完整 Nginx 配置。
```

第一阶段重点不是做所有功能，而是先把以下闭环做稳：

```text
创建 HTTPS 站点
生成配置
测试配置
自动备份
失败回滚
成功 reload
可在 LuCI 中查看和修改
```

在这个闭环稳定之后，再扩展证书、upstream、核心配置和高级编辑。

---

## 21. 一句话产品定义

```text
luci-app-nginx-manager 是一个遵循 LuCI 原生体验、采用 AGPL-3.0-only 开源协议、面向 OpenWrt 的完整 Nginx 管理器，重点提供安全的 HTTPS 站点管理、反向代理、SSL 证书、配置测试、备份回滚、高级配置编辑，以及符合 OpenWrt 最新标准的 IPK/APK 自动构建与发布能力。
```
