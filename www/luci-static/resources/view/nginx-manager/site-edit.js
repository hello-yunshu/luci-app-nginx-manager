'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require ui';
'require rpc';
'require nginx-manager/utils as utils';

var callGetSite = rpc.declare({
	object: 'nginx_manager',
	method: 'get_site',
	params: ['id'],
	expect: {}
});

var callSetSite = rpc.declare({
	object: 'nginx_manager',
	method: 'set_site',
	params: ['id', 'name', 'mode', 'server_name', 'listen_addr', 'listen_port', 'proxy_pass', 'root', 'index',
		'websocket', 'proxy_type', 'grpc_path', 'grpc_pass', 'custom_proxy_headers', 'redirect_https', 'redirect_http_port', 'proxy_host', 'proxy_xff', 'proxy_xfp', 'proxy_xri',
		'ssl_cert', 'ssl_protocols', 'ssl_ciphers',
		'access_log', 'error_log', 'custom_server_block', 'redirect_target', 'enabled',
		'proxy_connect_timeout', 'proxy_read_timeout', 'proxy_send_timeout'],
	expect: {}
});

var callListCerts = rpc.declare({
	object: 'nginx_manager',
	method: 'list_certs',
	expect: {}
});

var callRenderSite = rpc.declare({
	object: 'nginx_manager',
	method: 'render_site',
	params: ['id'],
	expect: {}
});

return view.extend({
	load: function() {
		var siteId = L.env.pathinfo ? L.env.pathinfo.split('/').pop() : null;
		if (!siteId && window.location.hash) {
			var parts = window.location.hash.split('/');
			siteId = parts[parts.length - 1];
		}

		var promises = [callListCerts()];

		if (siteId) {
			promises.push(callGetSite(siteId));
		} else {
			promises.push(Promise.resolve(null));
		}

		return Promise.all(promises);
	},

	render: function(data) {
		var certs = (data[0] && data[0].certs) || [];
		var site = data[1];
		var isNew = !site || !!site.error;

		var siteId = '';
		if (L.env.pathinfo) {
			siteId = L.env.pathinfo.split('/').pop();
		}
		if (!siteId && window.location.hash) {
			siteId = window.location.hash.split('/').pop();
		}

		var page = E('div', { 'class': 'cbi-map' });

		utils.loadSharedCSS();

		page.appendChild(E('h2', { 'class': 'cbi-map-title' }, isNew ? _('Add Site') : _('Edit Site')));

		/* ---- helpers ---- */

		function makeField(id, label, inputEl, desc) {
			var row = E('div', { 'class': 'cbi-value' });
			row.appendChild(E('label', { 'class': 'cbi-value-title', 'for': id }, label));
			var field = E('div', { 'class': 'cbi-value-field' });
			inputEl.id = id;
			field.appendChild(inputEl);
			if (desc)
				field.appendChild(E('div', { 'class': 'cbi-value-description' }, desc));
			row.appendChild(field);
			return row;
		}

		function makeFlag(id, label, checked) {
			var row = E('div', { 'class': 'cbi-value' });
			row.appendChild(E('label', { 'class': 'cbi-value-title', 'for': id }, label));
			var field = E('div', { 'class': 'cbi-value-field' });
			var cb = E('input', { 'type': 'checkbox', 'id': id, 'class': 'cbi-input-checkbox' });
			if (checked) cb.checked = true;
			field.appendChild(cb);
			row.appendChild(field);
			return row;
		}

		/* ---- conditional sections ---- */
		var sslSection, proxySection, staticSection, redirectSection, customSection;

		/* references for visibility updates */
		var proxyTypeSelect, proxyPassInput, websocketRow, grpcPassthroughSection;
		var proxyHostRow, proxyXffRow, proxyXfpRow, proxyXriRow;
		var proxyHeadersTitle, customHeadersField, customHeadersInput, customHeadersDesc;

		function updateVisibility() {
			var mode = modeSelect.value;
			sslSection.style.display      = (mode === 'reverse_proxy' || mode === 'static') ? '' : 'none';
			proxySection.style.display    = mode === 'reverse_proxy' ? '' : 'none';
			staticSection.style.display   = mode === 'static'        ? '' : 'none';
			redirectSection.style.display = mode === 'redirect'      ? '' : 'none';
			customSection.style.display   = mode === 'custom'        ? '' : 'none';

			/* proxy-type specific: update proxy_pass placeholder and sub-sections */
			if (mode === 'reverse_proxy' && proxyTypeSelect) {
				var ptype = proxyTypeSelect.value;
				var isGrpc = (ptype === 'grpc');
				if (isGrpc) {
					proxyPassInput.placeholder = 'grpc://192.168.1.1:9000';
					websocketRow.style.display = 'none';
					grpcPassthroughSection.style.display = 'none';
				} else {
					proxyPassInput.placeholder = 'http://192.168.1.1:3000';
					websocketRow.style.display = '';
					grpcPassthroughSection.style.display = '';
				}

				/* gRPC: hide XFF/XFP (not applicable), update headers title & custom placeholder */
				if (proxyXffRow) proxyXffRow.style.display = isGrpc ? 'none' : '';
				if (proxyXfpRow) proxyXfpRow.style.display = isGrpc ? 'none' : '';
				if (proxyHeadersTitle) proxyHeadersTitle.textContent = isGrpc ? _('gRPC Headers') : _('Common Proxy Headers');
				if (customHeadersInput) customHeadersInput.placeholder = isGrpc
					? 'grpc_set_header X-Custom-Header "value";\ngrpc_set_header Authorization $http_authorization;'
					: 'proxy_set_header X-Custom-Header "value";\nproxy_set_header Authorization $http_authorization;';
				if (customHeadersDesc) customHeadersDesc.textContent = isGrpc
					? _('Use grpc_set_header instead of proxy_set_header. One directive per line.')
					: _('One directive per line.');
			}
		}

		/* ========== Basic Settings ========== */
		var basicSection = E('div', { 'class': 'cbi-section' });
		basicSection.appendChild(E('h3', {}, _('Basic Settings')));

		basicSection.appendChild(makeFlag('opt-enabled', _('Enabled'),
			isNew ? true : site && site.enabled === '1'));

		var nameInput = E('input', { 'type': 'text', 'class': 'cbi-input-text' });
		if (isNew && siteId) nameInput.value = siteId;
		if (!isNew && site && site.name) nameInput.value = site.name;
		basicSection.appendChild(makeField('opt-name', _('Site Name'), nameInput));

		var modeSelect = E('select', { 'class': 'cbi-input-select' }, [
			E('option', { 'value': 'reverse_proxy' }, _('Reverse Proxy')),
			E('option', { 'value': 'static' },        _('Static Website')),
			E('option', { 'value': 'custom' },        _('Custom Server Block')),
			E('option', { 'value': 'redirect' },      _('Redirect'))
		]);
		if (!isNew && site && site.mode) modeSelect.value = site.mode;
		modeSelect.addEventListener('change', updateVisibility);
		basicSection.appendChild(makeField('opt-mode', _('Type'), modeSelect));

		var serverNameInput = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'placeholder': 'example.com' });
		if (!isNew && site && site.server_name) serverNameInput.value = site.server_name;
		basicSection.appendChild(makeField('opt-server_name', _('Domain'), serverNameInput));

		/* Listen Address — optional IP to bind to */
		var listenAddrInput = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'placeholder': _('All interfaces') });
		if (!isNew && site && site.listen_addr) listenAddrInput.value = site.listen_addr;
		basicSection.appendChild(makeField('opt-listen_addr', _('Listen Address'), listenAddrInput,
			_('Leave empty for all interfaces, or specify an IP (e.g. 127.0.0.1).')));

		/* Listen Port */
		var listenPortInput = E('input', { 'type': 'number', 'class': 'cbi-input-text', 'min': '1', 'max': '65535', 'placeholder': '80' });
		if (!isNew && site && site.listen_port) {
			listenPortInput.value = site.listen_port;
		} else {
			listenPortInput.value = '80';
		}
		basicSection.appendChild(makeField('opt-listen_port', _('Listen Port'), listenPortInput,
			_('SSL can be enabled on any port, no need to switch to 443.')));

		page.appendChild(basicSection);

		/* ========== SSL Settings ========== */
		sslSection = E('div', { 'class': 'cbi-section' });
		sslSection.appendChild(E('h3', {}, _('SSL Settings')));

		var sslCertSelect = E('select', { 'class': 'cbi-input-select' }, [
			E('option', { 'value': '' }, _('-- None --'))
		]);
		certs.forEach(function(cert) {
			sslCertSelect.appendChild(E('option', { 'value': cert.id },
				cert.name + (cert.domain ? ' (' + cert.domain + ')' : '')));
		});
		if (!isNew && site && site.ssl_cert) sslCertSelect.value = site.ssl_cert;
		sslSection.appendChild(makeField('opt-ssl_cert', _('SSL Certificate'), sslCertSelect));

		var sslWarning = E('div', { 'class': 'alert-message warning', 'style': 'display:none;' });
		sslSection.appendChild(sslWarning);

		sslCertSelect.addEventListener('change', function() {
			var sel = certs.find(function(c) { return c.id === sslCertSelect.value; });
			if (sel && (sel.status === 'expiring' || sel.status === 'expired')) {
				sslWarning.style.display = '';
				sslWarning.textContent = sel.status === 'expired'
					? _('This certificate has expired.')
					: _('This certificate is expiring soon.');
			} else {
				sslWarning.style.display = 'none';
			}

			/* Auto-update listen defaults when SSL is toggled */
			updateListenDefaults();
		});

		var redirectHttpsRow = makeFlag('opt-redirect_https', _('HTTP to HTTPS Redirect'),
			!isNew && site ? site.redirect_https === '1' : true);
		var redirectHttpsCb = redirectHttpsRow.querySelector('input[type="checkbox"]');
		sslSection.appendChild(redirectHttpsRow);

		var redirectHttpPortWrapper = E('div', { 'class': 'cbi-option' }, [
			E('label', { 'class': 'cbi-value-title' }, _('HTTP Redirect Port')),
			E('div', { 'class': 'cbi-value-field' }, [
				E('input', {
					'type': 'text',
					'id': 'opt-redirect_http_port',
					'class': 'cbi-input-text',
					'placeholder': _('Leave empty to use same-port redirect (error_page 497)'),
					'value': !isNew && site ? (site.redirect_http_port || '') : ''
				})
			])
		]);
		sslSection.appendChild(redirectHttpPortWrapper);

		function updateRedirectHttpPortVisibility() {
			redirectHttpPortWrapper.style.display = redirectHttpsCb.checked ? '' : 'none';
		}
		redirectHttpsCb.addEventListener('change', updateRedirectHttpPortVisibility);
		updateRedirectHttpPortVisibility();

		/* SSL Advanced Options */
		var sslAdvancedWrapper = E('div', { 'class': 'cbi-option', 'style': 'display:none;' });

		var sslProtocolsInput = E('input', {
			'type': 'text', 'class': 'cbi-input-text',
			'placeholder': 'TLSv1.2 TLSv1.3',
			'value': !isNew && site ? (site.ssl_protocols || '') : ''
		});
		sslAdvancedWrapper.appendChild(makeField('opt-ssl_protocols', _('SSL Protocols'), sslProtocolsInput,
			_('Leave empty to use default: TLSv1.2 TLSv1.3')));

		var sslCiphersInput = E('input', {
			'type': 'text', 'class': 'cbi-input-text',
			'placeholder': 'ECDHE-ECDSA-AES128-GCM-SHA256:...',
			'value': !isNew && site ? (site.ssl_ciphers || '') : ''
		});
		sslAdvancedWrapper.appendChild(makeField('opt-ssl_ciphers', _('SSL Ciphers'), sslCiphersInput,
			_('Leave empty to use default ciphers.')));

		sslSection.appendChild(sslAdvancedWrapper);

		function updateSslAdvancedVisibility() {
			var hasCert = sslCertSelect.value !== '';
			sslAdvancedWrapper.style.display = hasCert ? '' : 'none';
		}
		sslCertSelect.addEventListener('change', updateSslAdvancedVisibility);
		updateSslAdvancedVisibility();

		page.appendChild(sslSection);

		/* Helper */
		function updateListenDefaults() {
			// Port stays as-is when toggling SSL; nginx adds ssl flag to any port
		}

		/* ========== Reverse Proxy ========== */
		proxySection = E('div', { 'class': 'cbi-section' });
		proxySection.appendChild(E('h3', {}, _('Reverse Proxy')));

		/* Proxy Type: HTTP / gRPC (WebSocket is a checkbox under HTTP) */
		proxyTypeSelect = E('select', { 'class': 'cbi-input-select' }, [
			E('option', { 'value': 'http' }, _('HTTP')),
			E('option', { 'value': 'grpc' }, _('gRPC'))
		]);
		/* Backward compat: migrate proxy_type=websocket → http + websocket=1 */
		if (!isNew && site && site.proxy_type) {
			if (site.proxy_type === 'websocket') {
				proxyTypeSelect.value = 'http';
				site.websocket = '1';
			} else {
				proxyTypeSelect.value = site.proxy_type;
			}
		}
		proxyTypeSelect.addEventListener('change', updateVisibility);
		proxySection.appendChild(makeField('opt-proxy_type', _('Proxy Type'), proxyTypeSelect));

		/* Proxy Pass */
		proxyPassInput = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'placeholder': 'http://192.168.1.1:3000' });
		if (!isNew && site && site.proxy_pass) proxyPassInput.value = site.proxy_pass;
		proxySection.appendChild(makeField('opt-proxy_pass', _('Backend Address'), proxyPassInput,
			_('gRPC uses grpc:// or grpcs:// scheme.')));

		/* WebSocket Support (only visible when proxy_type=http) */
		websocketRow = makeFlag('opt-websocket', _('WebSocket Support'),
			!isNew && site ? site.websocket === '1' : false);
		proxySection.appendChild(websocketRow);

		/* gRPC Passthrough Section (only visible when proxy_type=http) */
		grpcPassthroughSection = E('div', { 'class': 'cbi-section' });
		grpcPassthroughSection.appendChild(E('h4', { 'style': 'margin-top:1em;margin-bottom:0.5em;' }, _('gRPC Passthrough')));

		var grpcPathInput = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'placeholder': '/grpc' });
		if (!isNew && site && site.grpc_path) grpcPathInput.value = site.grpc_path;
		grpcPassthroughSection.appendChild(makeField('opt-grpc_path', _('gRPC Path'), grpcPathInput,
			_('URL path for gRPC traffic, e.g. /grpc or /api.Service')));

		var grpcPassInput = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'placeholder': 'grpc://192.168.1.1:9000' });
		if (!isNew && site && site.grpc_pass) grpcPassInput.value = site.grpc_pass;
		grpcPassthroughSection.appendChild(makeField('opt-grpc_pass', _('gRPC Backend Address'), grpcPassInput,
			_('Uses grpc:// or grpcs:// scheme.')));

		proxySection.appendChild(grpcPassthroughSection);

		/* Common Proxy Headers */
		proxyHeadersTitle = E('h4', { 'style': 'margin-top:1em;margin-bottom:0.5em;' }, _('Common Proxy Headers'));
		proxySection.appendChild(proxyHeadersTitle);

		proxyHostRow = makeFlag('opt-proxy_host', _('Proxy Host Header'),
			!isNew && site ? site.proxy_host === '1' : true);
		proxySection.appendChild(proxyHostRow);

		proxyXffRow = makeFlag('opt-proxy_xff', _('X-Forwarded-For'),
			!isNew && site ? site.proxy_xff === '1' : true);
		proxySection.appendChild(proxyXffRow);

		proxyXfpRow = makeFlag('opt-proxy_xfp', _('X-Forwarded-Proto'),
			!isNew && site ? site.proxy_xfp === '1' : true);
		proxySection.appendChild(proxyXfpRow);

		proxyXriRow = makeFlag('opt-proxy_xri', _('X-Real-IP'),
			!isNew && site ? site.proxy_xri === '1' : true);
		proxySection.appendChild(proxyXriRow);

		/* Custom Proxy Headers */
		customHeadersInput = E('textarea', {
			'class': 'cbi-input-textarea',
			'rows': 4,
			'placeholder': 'proxy_set_header X-Custom-Header "value";\nproxy_set_header Authorization $http_authorization;'
		});
		if (!isNew && site && site.custom_proxy_headers) customHeadersInput.value = site.custom_proxy_headers;
		customHeadersField = makeField('opt-custom_proxy_headers', _('Custom Proxy Headers'), customHeadersInput, null);
		customHeadersDesc = E('div', { 'class': 'cbi-value-description' }, _('One directive per line.'));
		customHeadersField.querySelector('.cbi-value-field').appendChild(customHeadersDesc);
		proxySection.appendChild(customHeadersField);

		/* Proxy Timeouts */
		proxySection.appendChild(E('h4', { 'style': 'margin-top:1em;margin-bottom:0.5em;' }, _('Proxy Timeouts')));

		var proxyConnectTimeoutInput = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'placeholder': '60s' });
		if (!isNew && site && site.proxy_connect_timeout) proxyConnectTimeoutInput.value = site.proxy_connect_timeout;
		proxySection.appendChild(makeField('opt-proxy_connect_timeout', _('Connect Timeout'), proxyConnectTimeoutInput,
			_('Timeout for establishing a connection to the backend. Default: 60s.')));

		var proxyReadTimeoutInput = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'placeholder': '60s' });
		if (!isNew && site && site.proxy_read_timeout) proxyReadTimeoutInput.value = site.proxy_read_timeout;
		proxySection.appendChild(makeField('opt-proxy_read_timeout', _('Read Timeout'), proxyReadTimeoutInput,
			_('Timeout for reading a response from the backend. Default: 60s.')));

		var proxySendTimeoutInput = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'placeholder': '60s' });
		if (!isNew && site && site.proxy_send_timeout) proxySendTimeoutInput.value = site.proxy_send_timeout;
		proxySection.appendChild(makeField('opt-proxy_send_timeout', _('Send Timeout'), proxySendTimeoutInput,
			_('Timeout for sending a request to the backend. Default: 60s.')));

		page.appendChild(proxySection);

		/* ========== Static Website ========== */
		staticSection = E('div', { 'class': 'cbi-section' });
		staticSection.appendChild(E('h3', {}, _('Static Website')));

		var rootInput = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'placeholder': '/www/mysite' });
		if (!isNew && site && site.root) rootInput.value = site.root;
		staticSection.appendChild(makeField('opt-root', _('Root Directory'), rootInput));

		var indexInput = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'placeholder': 'index.html' });
		if (!isNew && site && site.index) indexInput.value = site.index;
		else indexInput.value = 'index.html';
		staticSection.appendChild(makeField('opt-index', _('Index File'), indexInput));

		page.appendChild(staticSection);

		/* ========== Redirect ========== */
		redirectSection = E('div', { 'class': 'cbi-section' });
		redirectSection.appendChild(E('h3', {}, _('Redirect')));

		var redirectTargetInput = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'placeholder': 'https://example.com' });
		if (!isNew && site && site.redirect_target) redirectTargetInput.value = site.redirect_target;
		redirectSection.appendChild(makeField('opt-redirect_target', _('Redirect Target'), redirectTargetInput));

		page.appendChild(redirectSection);

		/* ========== Custom Server Block ========== */
		customSection = E('div', { 'class': 'cbi-section' });
		customSection.appendChild(E('h3', {}, _('Custom Server Block')));

		var customBlockInput = E('textarea', { 'class': 'cbi-input-textarea nm-modal-textarea', 'rows': 15 });
		if (!isNew && site && site.custom_server_block) customBlockInput.value = site.custom_server_block;
		customSection.appendChild(makeField('opt-custom_server_block', _('Custom Server Block Content'), customBlockInput));

		page.appendChild(customSection);

		/* ========== Logging ========== */
		var loggingSection = E('div', { 'class': 'cbi-section' });
		loggingSection.appendChild(E('h3', {}, _('Logging')));

		loggingSection.appendChild(makeFlag('opt-access_log', _('Access Log'),
			!isNew && site ? site.access_log === '1' : false));

		loggingSection.appendChild(makeFlag('opt-error_log', _('Error Log'),
			!isNew && site ? site.error_log === '1' : true));

		page.appendChild(loggingSection);

		/* ========== Actions ========== */
		var actionsDiv = E('div', { 'class': 'nm-btn-group', 'style': 'justify-content: flex-end; margin-top: 1.5em;' });

		if (!isNew) {
			actionsDiv.appendChild(E('button', {
				'class': 'cbi-button',
				'click': function() {
					callRenderSite(siteId).then(function(result) {
						ui.showModal(_('Generated Config'), [
							E('pre', { 'class': 'nm-code-block' }, (result && result.config) || ''),
							E('div', { 'class': 'right', 'style': 'margin-top:8px;' }, [
								E('button', {
									'class': 'btn',
									'click': function() { ui.hideModal(); }
								}, _('Close'))
							])
						]);
					});
				}
			}, '\u21BB ' + _('View Generated Config')));
		}

		actionsDiv.appendChild(E('button', {
			'class': 'cbi-button cbi-button-apply',
			'click': function() { saveSite(); }
		}, _('Save')));

		actionsDiv.appendChild(E('button', {
			'class': 'cbi-button cbi-button-reset',
			'click': function() {
				location.href = L.url('admin/services/nginx-manager/sites');
			}
		}, '\u2190 ' + _('Back to Sites')));

		page.appendChild(actionsDiv);

		/* initial visibility */
		updateVisibility();

		/* ---- save logic ---- */
		function saveSite() {
			var data = { id: siteId || document.getElementById('opt-name').value.trim() };

			data.enabled             = document.getElementById('opt-enabled').checked ? '1' : '0';
			data.name                = document.getElementById('opt-name').value.trim();
			data.mode                = document.getElementById('opt-mode').value;
			data.server_name         = document.getElementById('opt-server_name').value.trim();

			data.listen_addr         = document.getElementById('opt-listen_addr').value.trim();
			data.listen_port         = document.getElementById('opt-listen_port').value.trim() || '80';

			data.ssl_cert            = document.getElementById('opt-ssl_cert').value;
			data.ssl_protocols       = document.getElementById('opt-ssl_protocols').value.trim();
			data.ssl_ciphers         = document.getElementById('opt-ssl_ciphers').value.trim();
			data.redirect_https      = document.getElementById('opt-redirect_https').checked ? '1' : '0';
			data.redirect_http_port  = document.getElementById('opt-redirect_http_port').value.trim();
			data.proxy_pass          = document.getElementById('opt-proxy_pass').value.trim();
			data.proxy_type          = document.getElementById('opt-proxy_type').value;
			data.websocket           = document.getElementById('opt-websocket').checked ? '1' : '0';
			data.grpc_path           = document.getElementById('opt-grpc_path').value.trim();
			data.grpc_pass           = document.getElementById('opt-grpc_pass').value.trim();
			data.custom_proxy_headers = document.getElementById('opt-custom_proxy_headers').value.trim();
			data.proxy_host          = document.getElementById('opt-proxy_host').checked ? '1' : '0';
			data.proxy_xff           = document.getElementById('opt-proxy_xff').checked ? '1' : '0';
			data.proxy_xfp           = document.getElementById('opt-proxy_xfp').checked ? '1' : '0';
			data.proxy_xri           = document.getElementById('opt-proxy_xri').checked ? '1' : '0';
			data.root                = document.getElementById('opt-root').value.trim();
			data.index               = document.getElementById('opt-index').value.trim();
			data.redirect_target     = document.getElementById('opt-redirect_target').value.trim();
			data.custom_server_block = document.getElementById('opt-custom_server_block').value;
			data.access_log          = document.getElementById('opt-access_log').checked ? '1' : '0';
			data.error_log           = document.getElementById('opt-error_log').checked ? '1' : '0';

			data.proxy_connect_timeout = document.getElementById('opt-proxy_connect_timeout').value.trim();
			data.proxy_read_timeout    = document.getElementById('opt-proxy_read_timeout').value.trim();
			data.proxy_send_timeout    = document.getElementById('opt-proxy_send_timeout').value.trim();

			return callSetSite(
				data.id,
				data.name,
				data.mode,
				data.server_name,
				data.listen_addr,
				data.listen_port,
				data.proxy_pass,
				data.root,
				data.index,
				data.websocket,
				data.proxy_type,
				data.grpc_path,
				data.grpc_pass,
				data.custom_proxy_headers,
				data.redirect_https,
				data.redirect_http_port,
				data.proxy_host,
				data.proxy_xff,
				data.proxy_xfp,
				data.proxy_xri,
				data.ssl_cert,
				data.ssl_protocols,
				data.ssl_ciphers,
				data.access_log,
				data.error_log,
				data.custom_server_block,
				data.redirect_target,
				data.enabled,
				data.proxy_connect_timeout,
				data.proxy_read_timeout,
				data.proxy_send_timeout
			).then(function(result) {
				if (result && result.error) {
					ui.addNotification(null, E('p', {}, _('Configuration test failed') + ': ' + (result.detail || result.error)), 'error');
				} else {
					ui.addNotification(null, E('p', {}, _('Site saved successfully')), 'info');
					setTimeout(function() {
						location.href = L.url('admin/services/nginx-manager/sites');
					}, 800);
				}
			}).catch(function(err) {
				ui.addNotification(null, E('p', {}, _('Save failed') + ': ' + (err.message || JSON.stringify(err))), 'error');
			});
		}

		return utils.appendFooter(page, {
			project: 'Nginx Manager',
			repoUrl: 'https://github.com/hello-yunshu/luci-app-nginx-manager'
		});
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
