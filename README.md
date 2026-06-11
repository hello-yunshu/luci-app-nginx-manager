# luci-app-nginx-manager

[English](README.en.md) | **中文**

<p align="center">
  <strong>OpenWrt 上的 Nginx 可视化管理工具</strong>
</p>

<p align="center">
  通过 LuCI Web 界面管理 Nginx 站点、证书、日志与配置，无需命令行操作。
</p>

---

## 功能特性

### 站点管理

支持四种站点模式，覆盖常见使用场景：

| 模式 | 说明 |
|------|------|
| **反向代理** | 将请求转发到后端服务，支持 WebSocket、自定义代理头 |
| **静态文件** | 托管本地文件，自动生成 `try_files` 规则 |
| **自定义配置** | 直接编写 server 块，完全自由 |
| **重定向** | 301 永久重定向到目标地址 |

每个站点支持：
- 多个 listen 端口（含 SSL）
- 自动 HTTP→HTTPS 跳转
- gRPC 透传（gRPC Path + gRPC Backend Address）
- 站点级 HSTS（max-age 自定义）
- 独立的访问日志与错误日志控制
- 一键启用/禁用，禁用后配置文件保留但不会被 nginx 加载
- 站点复制（一键复制已有站点配置）

### SSL 证书管理

- **手动上传** — 粘贴证书和私钥内容，自动存储并设置权限
- **自签名生成** — 一键生成自签名证书，适合内网测试
- **ACME 自动签发** — 基于 OpenWrt `acme`，支持 HTTP-01 Webroot、HTTP-01 Standalone 与 DNS-01 验证
- 证书到期检测，30 天内自动标记为「即将过期」

### 实时日志

- 在线查看访问日志和错误日志
- 支持按站点筛选
- 关键词过滤，快速定位问题
- 最多显示 500 行，防止浏览器卡顿

### 配置安全机制

所有配置变更都经过安全流程：

```
修改 UCI 配置 → 生成 nginx conf → nginx -t 测试 → 通过则 reload → 失败则自动回滚
```

- **自动回滚** — 配置测试失败时，自动恢复到上一个可用状态
- **危险编辑模式** — 高级用户可开启，直接编辑 nginx.conf 和模板文件
- **配置预览** — 保存前可预览将要生成的 nginx 配置

### 备份与恢复

- **自动备份** — 每次配置变更前自动创建备份（可关闭）
- **手动备份** — 随时创建快照
- **差异对比** — 查看当前配置与备份之间的 diff
- **一键恢复** — 恢复后同样经过 `nginx -t` 验证，失败自动回滚
- **自动清理** — 超过最大备份数时自动删除最旧的备份

### 核心配置

通过可视化界面调整常用参数，无需手动编辑配置文件：

- `client_max_body_size` — 请求体大小限制
- `keepalive_timeout` — 长连接超时
- `gzip` — 压缩开关，启用时对齐 OpenWrt `uci.conf.template` 的 `gzip_vary on` 与 `gzip_proxied any`
- `server_tokens` — 版本信息显示
- `sendfile` — 零拷贝传输
- `http2` — HTTP/2 开关（nginx 1.25.1+ 用 `http2 on;` 指令）
- `http3` — HTTP/3 (QUIC) 开关，需 nginx 编译 QUIC 支持
- `ssl_protocols` / `ssl_ciphers` — SSL 协议与加密套件
- `ssl_stapling` — OCSP Stapling（仅自定义证书，ACME 证书因 Let's Encrypt 官方停用 OCSP 不支持）
- `ssl_buffer_size` — SSL 缓冲区大小

## 安装

### 前置条件

- OpenWrt 24.10.x 或 snapshot
- 已安装 `nginx-ssl`

### 下载安装

从 [Releases](../../releases) 页面下载对应架构的包：

| 包格式 | 适用版本 | 安装命令 |
|--------|---------|---------|
| `.ipk` | OpenWrt 24.10.x | `opkg install luci-app-nginx-manager_*.ipk` |
| `.apk` | OpenWrt snapshot / 25.12+ | `apk add luci-app-nginx-manager_*.apk` |

安装后刷新浏览器缓存即可在 **服务 → Nginx Manager** 中看到菜单。

### 校验

```sh
sha256sum -c sha256sums.txt
```

### 依赖

```
luci-base  nginx-ssl  rpcd  rpcd-mod-file  openssl-util  acme  acme-acmesh-dnsapi  diffutils  flock
```

## 使用指南

### 快速上手：创建一个反向代理站点

1. 进入 **服务 → Nginx Manager → Sites**
2. 点击 **Add** 创建新站点
3. 填写配置：
   - **名称**：`myapp`
   - **模式**：反向代理
   - **Server Name**：`app.example.com`
   - **Proxy Pass**：`http://127.0.0.1:8080`
   - **Listen**：`443 ssl`（如需 HTTPS）
   - **SSL 证书**：选择已添加的证书
4. 点击 **Save** — 系统自动生成配置、测试并重载

### 添加 SSL 证书

1. 进入 **Certificates** 页面
2. 选择 **上传证书**、**生成自签名** 或 **自动 (ACME)**
3. 上传模式：粘贴 fullchain 和 privkey 内容
4. ACME HTTP-01 Webroot：域名需解析到路由器，公网 80 端口需可访问
5. ACME HTTP-01 Standalone：由 acme.sh 临时监听 80 端口；签发时需确保 80 端口未被 nginx/uhttpd 占用
6. ACME DNS-01：选择 DNS API hook（如 `dns_cf`），填写对应 `KEY=VALUE` 凭据；支持通配符证书，不要求公网 80 端口
7. 证书会自动存储到 `/etc/nginx/certs/luci-manager/<id>/`

### 查看日志

1. 进入 **Logs** 页面
2. 选择日志类型（访问/错误）
3. 可选选择站点并填写过滤关键词
4. 日志会自动加载；点击 **Refresh** 可手动重读
5. 点击 **Clear** 会清空当前选择的日志文件内容

### 高级编辑

如需直接修改 nginx 配置文件：

1. 进入 **Core Config** 页面
2. 开启 **危险编辑模式**
3. 页面底部会出现文件编辑器，可直接编辑 `nginx.conf` 和 `uci.conf.template`
4. 编辑后保存 — 系统自动测试，失败则回滚

> ⚠️ 危险编辑模式下，Core Config 页面的可视化编辑将被禁用。

## 项目结构

```
root/
├── etc/
│   ├── config/nginx_manager                    # UCI 配置文件
│   └── uci-defaults/90-luci-app-nginx-manager  # 首次安装初始化脚本
├── usr/
│   ├── libexec/rpcd/nginx_manager              # RPC 后端（38 个 API 方法）
│   ├── sbin/nginx-manager-gen                  # 配置生成与部署工具
│   └── share/
│       ├── luci/menu.d/                        # LuCI 菜单注册
│       └── rpcd/acl.d/                         # RPC 权限控制

htdocs/luci-static/resources/
├── nginx-manager/nginx-manager.css             # 全局样式
├── nginx-manager/utils.js                      # 共享工具函数
└── view/nginx-manager/
    ├── overview.js                             # 总览仪表盘
    ├── sites.js                                # 站点列表
    ├── site-edit.js                            # 站点编辑表单
    ├── certificates.js                         # 证书管理
    ├── logs.js                                 # 日志查看器
    ├── core-config.js                          # 核心配置编辑（含危险编辑）
    └── backups.js                              # 备份与恢复
```

## 架构设计

```
┌──────────────┐     ubus/rpcd     ┌──────────────────┐     UCI      ┌──────────────┐
│  LuCI 前端    │ ──────────────→  │  rpcd 后端        │ ──────────→ │  UCI 配置     │
│  (7 个 JS 视图)│ ←──────────────  │  (38 个 API 方法)  │ ←──────────  │  nginx_manager│
└──────────────┘     JSON 响应      └──────────────────┘              └──────┬───────┘
                                                                            │
                                                              nginx-manager-gen
                                                                            │
                                                                   ┌────────▼────────┐
                                                                   │  nginx conf 文件  │
                                                                   │  (conf.d/luci-manager/)
                                                                   └────────┬────────┘
                                                                            │
                                                                 nginx -t → reload
                                                                  (失败则回滚)
```

**数据流**：

1. 前端通过 `ubus call nginx_manager <method>` 调用 rpcd 后端
2. 后端读写 UCI 配置（`/etc/config/nginx_manager`）
3. 变更后调用 `nginx-manager-gen apply` 生成配置并部署
4. 生成器从 UCI 读取配置，输出到 `/etc/nginx/conf.d/luci-manager/`
5. 自动执行 `nginx -t` 验证，通过则 reload，失败则回滚到备份

## UCI 配置参考

### global section

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | 1 | 是否启用管理器 |
| `ssl_required` | boolean | 1 | 是否要求 SSL |
| `managed_dir` | string | `/etc/nginx/conf.d/luci-manager` | 生成的配置文件目录 |
| `cert_dir` | string | `/etc/nginx/certs/luci-manager` | 证书存储目录 |
| `backup_dir` | string | `/etc/nginx-manager/backups` | 备份存储目录 |
| `auto_backup` | boolean | 1 | 变更前自动备份 |
| `test_before_reload` | boolean | 1 | 重载前测试配置 |
| `reload_after_save` | boolean | 1 | 保存后自动重载 |
| `advanced_mode` | boolean | 0 | 高级模式 |
| `dangerous_core_edit` | boolean | 0 | 危险编辑模式 |
| `max_backups` | integer | 5 | 最大备份数量 |

### site section

| 选项 | 类型 | 说明 |
|------|------|------|
| `name` | string | 站点名称（用于文件名） |
| `mode` | enum | `reverse_proxy` / `static` / `custom` / `redirect` |
| `server_name` | string | 域名 |
| `proxy_pass` | string | 后端地址（反向代理模式） |
| `root` | path | 文件根目录（静态模式） |
| `index` | string | 默认首页文件 |
| `websocket` | boolean | 启用 WebSocket 代理 |
| `redirect_https` | boolean | HTTP→HTTPS 自动跳转 |
| `ssl_cert` | string | 关联的证书 ID |
| `listen` | list | 监听端口列表 |
| `enabled` | boolean | 是否启用 |

## 命令行工具

`nginx-manager-gen` 是配置生成器，也可独立使用：

```sh
nginx-manager-gen generate              # 从 UCI 生成所有配置文件
nginx-manager-gen apply                 # 生成 + 测试 + 重载（失败回滚）
nginx-manager-gen render <section>      # 预览指定站点的生成配置
nginx-manager-gen test                  # 执行 nginx -t
nginx-manager-gen backup                # 手动创建备份
```

## 构建

本项目使用 GitHub Actions 自动构建，支持以下目标：

| 架构 | OpenWrt 24.10 (ipk) | Snapshot (apk) |
|------|---------------------|----------------|
| x86_64 | ✅ | ✅ |
| aarch64 | ✅ | ✅ |

- 推送 `v*` 标签触发 Release 构建
- 也可在 Actions 页面手动触发

## 许可证

[AGPL-3.0-only](LICENSE)
