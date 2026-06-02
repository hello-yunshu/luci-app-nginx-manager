'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require ui';
'require rpc';

var callGetSite = rpc.declare({
	object: 'nginx_manager',
	method: 'get_site',
	params: ['id'],
	expect: {}
});

var callSetSite = rpc.declare({
	object: 'nginx_manager',
	method: 'set_site',
	expect: {}
});

var callListCerts = rpc.declare({
	object: 'nginx_manager',
	method: 'list_certs',
	expect: { certs: [] }
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

		page.appendChild(E('link', {
			'rel': 'stylesheet',
			'href': L.resource('nginx-manager/nginx-manager.css')
		}));

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

		function updateVisibility() {
			var mode = document.getElementById('opt-mode').value;
			sslSection.style.display      = (mode === 'reverse_proxy' || mode === 'static') ? '' : 'none';
			proxySection.style.display    = mode === 'reverse_proxy' ? '' : 'none';
			staticSection.style.display   = mode === 'static'        ? '' : 'none';
			redirectSection.style.display = mode === 'redirect'      ? '' : 'none';
			customSection.style.display   = mode === 'custom'        ? '' : 'none';
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

		/* Listen — dynamic list */
		var listenContainer = E('div', { 'class': 'cbi-value' });
		listenContainer.appendChild(E('label', { 'class': 'cbi-value-title' }, _('Listen')));
		var listenField = E('div', { 'class': 'cbi-value-field' });
		var listenItems = E('div', { 'id': 'listen-items' });

		function createListenItem(val) {
			var item = E('div', { 'style': 'display:flex;gap:4px;margin-bottom:4px;' });
			item.appendChild(E('input', { 'type': 'text', 'class': 'cbi-input-text', 'value': val, 'placeholder': '80' }));
			item.appendChild(E('button', {
				'class': 'cbi-button cbi-button-reset',
				'type': 'button',
				'click': function() { if (listenItems.children.length > 1) item.remove(); }
			}, '\u00D7'));
			return item;
		}

		var listenVals = (!isNew && site && site.listen) ? site.listen.split(',') : ['80'];
		listenVals.forEach(function(v) { listenItems.appendChild(createListenItem(v.trim())); });

		listenField.appendChild(listenItems);
		listenField.appendChild(E('button', {
			'class': 'cbi-button',
			'type': 'button',
			'click': function() { listenItems.appendChild(createListenItem('')); }
		}, '+'));
		listenContainer.appendChild(listenField);
		basicSection.appendChild(listenContainer);

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
		});

		sslSection.appendChild(makeFlag('opt-redirect_https', _('HTTP to HTTPS Redirect'),
			!isNew && site ? site.redirect_https === '1' : true));

		page.appendChild(sslSection);

		/* ========== Reverse Proxy ========== */
		proxySection = E('div', { 'class': 'cbi-section' });
		proxySection.appendChild(E('h3', {}, _('Reverse Proxy')));

		var proxyPassInput = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'placeholder': 'http://192.168.1.1:3000' });
		if (!isNew && site && site.proxy_pass) proxyPassInput.value = site.proxy_pass;
		proxySection.appendChild(makeField('opt-proxy_pass', _('Proxy Pass'), proxyPassInput));

		proxySection.appendChild(makeFlag('opt-websocket', _('WebSocket'),
			!isNew && site ? site.websocket === '1' : false));

		proxySection.appendChild(makeFlag('opt-proxy_host', _('Proxy Host Header'),
			!isNew && site ? site.proxy_host === '1' : true));

		proxySection.appendChild(makeFlag('opt-proxy_xff', _('X-Forwarded-For'),
			!isNew && site ? site.proxy_xff === '1' : true));

		proxySection.appendChild(makeFlag('opt-proxy_xfp', _('X-Forwarded-Proto'),
			!isNew && site ? site.proxy_xfp === '1' : true));

		proxySection.appendChild(makeFlag('opt-proxy_xri', _('X-Real-IP'),
			!isNew && site ? site.proxy_xri === '1' : true));

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

		var customBlockInput = E('textarea', { 'class': 'cbi-input-textarea', 'rows': 15, 'style': 'font-family:monospace;width:100%;' });
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
		var actionsDiv = E('div', { 'class': 'nm-btn-group' });

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

			var lv = [];
			document.querySelectorAll('#listen-items input').forEach(function(inp) {
				var v = inp.value.trim();
				if (v) lv.push(v);
			});
			data.listen = lv.join(',');

			data.ssl_cert            = document.getElementById('opt-ssl_cert').value;
			data.redirect_https      = document.getElementById('opt-redirect_https').checked ? '1' : '0';
			data.proxy_pass          = document.getElementById('opt-proxy_pass').value.trim();
			data.websocket           = document.getElementById('opt-websocket').checked ? '1' : '0';
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

			return callSetSite(data).then(function(result) {
				if (result && result.error) {
					ui.addNotification(null, E('p', {}, _('Configuration test failed') + ': ' + (result.detail || result.error)), 'error');
				} else {
					ui.addNotification(null, E('p', {}, _('Site saved successfully')), 'info');
				}
			});
		}

		return page;
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
