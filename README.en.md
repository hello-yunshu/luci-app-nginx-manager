# luci-app-nginx-manager

**English** | [中文](README.md)

<p align="center">
  <strong>Visual Nginx Manager for OpenWrt</strong>
</p>

<p align="center">
  Manage Nginx sites, certificates, logs and configuration through the LuCI web interface — no CLI required.
</p>

---

## Features

### Site Management

Four site modes covering common use cases:

| Mode | Description |
|------|-------------|
| **Reverse Proxy** | Forward requests to backend services with WebSocket and custom header support |
| **Static Files** | Serve local files with auto-generated `try_files` rules |
| **Custom Config** | Write raw server blocks with full freedom |
| **Redirect** | 301 permanent redirect to a target URL |

Per-site options:
- Multiple listen ports (including SSL)
- Automatic HTTP→HTTPS redirect
- gRPC Passthrough (gRPC Path + gRPC Backend Address)
- Site-level HSTS (customizable max-age)
- Independent access/error log controls
- One-click enable/disable — disabled sites are preserved but not loaded by nginx
- Site duplication (one-click copy an existing site config)

### SSL Certificate Management

- **Manual Upload** — Paste certificate and private key; auto-stored with correct permissions
- **Self-Signed Generation** — One-click self-signed certs for internal testing
- **ACME Auto-Issuance** — HTTP-01 Webroot, HTTP-01 Standalone, and DNS-01 validation through OpenWrt `acme`
- Certificate expiry detection — auto-flagged as "expiring" within 30 days

### Live Logs

- View access and error logs in real time
- Filter by site name
- Keyword search for quick troubleshooting
- Capped at 500 lines to prevent browser lag

### Configuration Safety

All configuration changes go through a safety pipeline:

```
Modify UCI config → Generate nginx conf → nginx -t test → Reload on pass → Auto-rollback on fail
```

- **Auto-Rollback** — Reverts to the last working state when `nginx -t` fails
- **Dangerous Edit Mode** — Advanced users can directly edit `nginx.conf` and template files
- **Config Preview** — Preview generated nginx config before saving

### Backup & Restore

- **Auto-Backup** — Snapshots created before every configuration change (can be disabled)
- **Manual Backup** — Create snapshots on demand
- **Diff Comparison** — Compare current config against any backup
- **One-Click Restore** — Restored configs go through `nginx -t` too; auto-rollback on failure
- **Auto-Cleanup** — Oldest backups are pruned when the limit is exceeded

### Core Configuration

Adjust common parameters through a visual editor — no manual file editing needed:

- `client_max_body_size` — Request body size limit
- `keepalive_timeout` — Keep-alive timeout
- `gzip` — Compression toggle; when enabled, aligns with OpenWrt `uci.conf.template` by emitting `gzip_vary on` and `gzip_proxied any`
- `server_tokens` — Version info visibility
- `sendfile` — Zero-copy file transfer
- `http2` — HTTP/2 toggle (uses `http2 on;` directive for nginx 1.25.1+)
- `http3` — HTTP/3 (QUIC) toggle, requires nginx with QUIC support
- `ssl_stapling` — OCSP Stapling
- `ssl_buffer_size` — SSL buffer size

## Installation

### Prerequisites

- OpenWrt 24.10.x or snapshot
- `nginx-ssl` installed

### Download & Install

Grab the package for your architecture from the [Releases](../../releases) page:

| Format | Target | Install Command |
|--------|--------|-----------------|
| `.ipk` | OpenWrt 24.10.x | `opkg install luci-app-nginx-manager_*.ipk` |
| `.apk` | OpenWrt snapshot / 25.12+ | `apk add luci-app-nginx-manager_*.apk` |

After installation, clear your browser cache and look for **Services → Nginx Manager** in the LuCI menu.

### Verify

```sh
sha256sum -c sha256sums.txt
```

### Dependencies

```
luci-base  nginx-ssl  rpcd  rpcd-mod-file  openssl-util  acme  acme-acmesh-dnsapi  diffutils  flock
```

## Usage Guide

### Quick Start: Create a Reverse Proxy Site

1. Navigate to **Services → Nginx Manager → Sites**
2. Click **Add** to create a new site
3. Fill in the configuration:
   - **Name**: `myapp`
   - **Mode**: Reverse Proxy
   - **Server Name**: `app.example.com`
   - **Proxy Pass**: `http://127.0.0.1:8080`
   - **Listen**: `443 ssl` (for HTTPS)
   - **SSL Certificate**: Select a previously added certificate
4. Click **Save** — the system generates config, tests it, and reloads nginx

### Add an SSL Certificate

1. Go to the **Certificates** page
2. Choose **Upload Certificate**, **Generate Self-Signed**, or **Auto (ACME)**
3. For upload: paste the fullchain and private key content
4. ACME HTTP-01 Webroot: the domain must resolve to the router and public port 80 must be reachable
5. ACME HTTP-01 Standalone: acme.sh temporarily listens on port 80; make sure nginx/uhttpd is not using port 80 while issuing
6. ACME DNS-01: choose a DNS API hook such as `dns_cf` and enter matching `KEY=VALUE` credentials; wildcard certificates are supported and public port 80 is not required
7. Certificates are stored at `/etc/nginx/certs/luci-manager/<id>/`

### View Logs

1. Go to the **Logs** page
2. Select log type (access / error)
3. Optionally choose a site and enter a filter keyword
4. Logs load automatically; click **Refresh** to read them again
5. Click **Clear** to empty the currently selected log file content

### Advanced Editing

To directly modify nginx configuration files:

1. Go to the **Core Config** page
2. Enable **Dangerous Edit Mode**
3. A file editor will appear at the bottom of the page for editing `nginx.conf` and `uci.conf.template`
4. Save — the system auto-tests and rolls back on failure

> ⚠️ When Dangerous Edit Mode is enabled, the visual Core Config editor is disabled.

## Project Structure

```
root/
├── etc/
│   ├── config/nginx_manager                    # UCI configuration
│   └── uci-defaults/90-luci-app-nginx-manager  # First-install init script
├── usr/
│   ├── libexec/rpcd/nginx_manager              # RPC backend (47 API methods)
│   ├── sbin/nginx-manager-gen                  # Config generator & deployer
│   └── share/
│       ├── luci/menu.d/                        # LuCI menu registration
│       └── rpcd/acl.d/                         # RPC access control

www/luci-static/resources/
├── nginx-manager/
│   ├── file-icons.svg                          # File icons
│   ├── nginx-manager.css                       # Global styles
│   └── utils.js                                # Shared utilities
└── view/nginx-manager/
    ├── overview.js                             # Dashboard overview
    ├── sites.js                                # Site listing
    ├── site-edit.js                            # Site edit form
    ├── certificates.js                         # Certificate management
    ├── files.js                                # File manager
    ├── logs.js                                 # Log viewer
    ├── core-config.js                          # Core config editor (incl. dangerous edit)
    └── backups.js                              # Backup & restore
```

## Architecture

```
┌──────────────┐     ubus/rpcd     ┌──────────────────┐     UCI      ┌──────────────┐
│  LuCI Frontend│ ──────────────→  │  rpcd Backend     │ ──────────→ │  UCI Config   │
│  (8 JS views) │ ←──────────────  │  (47 API methods) │ ←──────────  │  nginx_manager│
└──────────────┘     JSON response └──────────────────┘              └──────┬───────┘
                                                                            │
                                                              nginx-manager-gen
                                                                            │
                                                                   ┌────────▼────────┐
                                                                   │  nginx conf files│
                                                                   │  (conf.d/luci-manager/)
                                                                   └────────┬────────┘
                                                                            │
                                                                 nginx -t → reload
                                                                  (rollback on fail)
```

**Data Flow**:

1. Frontend calls rpcd backend via `ubus call nginx_manager <method>`
2. Backend reads/writes UCI config (`/etc/config/nginx_manager`)
3. On changes, calls `nginx-manager-gen apply` to generate and deploy config
4. Generator reads UCI and outputs to `/etc/nginx/conf.d/luci-manager/`
5. Runs `nginx -t` automatically — reloads on success, rolls back on failure

## UCI Configuration Reference

### Global Section

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | 1 | Enable the manager |
| `ssl_required` | boolean | 1 | Require SSL |
| `managed_dir` | string | `/etc/nginx/conf.d/luci-manager` | Generated config directory |
| `cert_dir` | string | `/etc/nginx/certs/luci-manager` | Certificate storage directory |
| `backup_dir` | string | `/etc/nginx-manager/backups` | Backup storage directory |
| `auto_backup` | boolean | 1 | Auto-backup before changes |
| `test_before_reload` | boolean | 1 | Test config before reload |
| `reload_after_save` | boolean | 1 | Auto-reload after save |
| `advanced_mode` | boolean | 0 | Advanced mode |
| `dangerous_core_edit` | boolean | 0 | Dangerous edit mode |
| `max_backups` | integer | 10 | Maximum backup count |
| `client_max_body_size` | string | — | Request body size limit |
| `keepalive_timeout` | string | — | Keep-alive timeout |
| `gzip` | boolean | 0 | Compression toggle |
| `server_tokens` | string | — | Version info visibility |
| `sendfile` | boolean | 0 | Zero-copy file transfer |
| `access_log` | string | — | Access log path |
| `error_log` | string | — | Error log path |
| `ssl_session_cache` | string | — | SSL session cache |
| `ssl_session_tickets` | string | 1 | SSL session tickets |
| `ssl_session_timeout` | string | — | SSL session timeout |
| `ssl_stapling` | string | — | OCSP Stapling (custom certs only) |
| `ssl_buffer_size` | string | — | SSL buffer size |
| `custom_ssl_directives` | string | — | Custom SSL directives |
| `http2` | boolean | 1 | HTTP/2 toggle |
| `http3` | boolean | 0 | HTTP/3 (QUIC) toggle |
| `security_headers` | boolean | 1 | Security response headers |
| `core_config_initialized` | boolean | 0 | Whether core config has been initialized |

### Site Section

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | — | Site name (used as filename) |
| `mode` | enum | `reverse_proxy` | `reverse_proxy` / `static` / `custom` / `redirect` |
| `server_name` | string | — | Domain name |
| `enabled` | boolean | 1 | Enable site |
| `listen_addr` | string | — | Listen address |
| `listen_port` | string | 80 | Listen port |
| `proxy_pass` | string | — | Backend address (reverse proxy mode) |
| `root` | path | — | Document root (static mode) |
| `index` | string | `index.html` | Default index file |
| `websocket` | boolean | 0 | Enable WebSocket proxy |
| `proxy_type` | string | `http` | Proxy type: `http` / `grpc` |
| `grpc_path` | string | — | gRPC path |
| `grpc_pass` | string | — | gRPC backend address |
| `custom_proxy_headers` | string | — | Custom proxy headers |
| `redirect_https` | boolean | 0 | Auto HTTP→HTTPS redirect |
| `redirect_http_port` | string | — | HTTP redirect listen port |
| `redirect_target` | string | — | Redirect target URL (redirect mode) |
| `proxy_host` | boolean | 1 | Pass Host header |
| `proxy_xff` | boolean | 1 | Pass X-Forwarded-For header |
| `proxy_xfp` | boolean | 1 | Pass X-Forwarded-Proto header |
| `proxy_xri` | boolean | 1 | Pass X-Real-IP header |
| `ssl_cert` | string | — | Associated certificate ID |
| `ssl_protocols` | string | — | SSL protocols (site-level) |
| `ssl_ciphers` | string | — | SSL cipher suites (site-level) |
| `hsts_max_age` | string | — | HSTS max-age (empty=default 31536000, 0=disable) |
| `access_log` | boolean | 0 | Enable access log |
| `error_log` | boolean | 1 | Enable error log |
| `custom_server_block` | string | — | Custom server block content (custom mode) |
| `proxy_connect_timeout` | string | — | Proxy connect timeout |
| `proxy_read_timeout` | string | — | Proxy read timeout |
| `proxy_send_timeout` | string | — | Proxy send timeout |

## CLI Tool

`nginx-manager-gen` is the config generator, also usable standalone:

```sh
nginx-manager-gen generate              # Generate all config from UCI
nginx-manager-gen apply                 # Generate + test + reload (rollback on fail)
nginx-manager-gen render <section>      # Preview generated config for a site
nginx-manager-gen test                  # Run nginx -t
nginx-manager-gen backup                # Create a manual backup
nginx-manager-gen --status              # Get nginx runtime status (JSON)
nginx-manager-gen --check-env           # Check runtime environment dependencies (JSON)
nginx-manager-gen --test-config         # Test config and record result (JSON)
nginx-manager-gen --reload              # Reload nginx (JSON)
nginx-manager-gen --restart             # Restart nginx (JSON)
nginx-manager-gen --start               # Start nginx (JSON)
```

## Building

This project uses GitHub Actions for automated builds:

| Architecture | OpenWrt 24.10 (ipk) | Snapshot (apk) |
|-------------|---------------------|----------------|
| x86_64 | ✅ | ✅ |
| aarch64 | ✅ | ✅ |

- Push a `v*` tag to trigger a Release build
- Manual dispatch is also available from the Actions tab

## License

[AGPL-3.0-only](LICENSE)
