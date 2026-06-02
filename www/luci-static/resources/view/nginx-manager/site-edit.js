'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require ui';
'require rpc';
'require uci';
'require form';

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

		var page = E('div', { 'class': 'nginx-manager-page' });

		page.appendChild(E('link', {
			'rel': 'stylesheet',
			'href': L.resource('nginx-manager/nginx-manager.css')
		}));

		var m = new form.Map('nginx_manager', isNew ? _('Add Site') : _('Edit Site'));

		var s = m.section(form.NamedSection, siteId || '_new', 'site', _('Site Configuration'));
		s.anonymous = false;
		s.addremove = false;

		var enabled = s.option(form.Flag, 'enabled', _('Enabled'));
		enabled.default = '1';
		enabled.rmempty = false;

		var name = s.option(form.Value, 'name', _('Site Name'));
		name.datatype = 'and(uciname,maxlength(63))';
		name.rmempty = false;
		if (isNew) name.default = siteId;

		var mode = s.option(form.ListValue, 'mode', _('Type'));
		mode.value('reverse_proxy', _('Reverse Proxy'));
		mode.value('static', _('Static Website'));
		mode.value('custom', _('Custom Server Block'));
		mode.value('redirect', _('Redirect'));
		mode.default = 'reverse_proxy';
		mode.rmempty = false;

		var serverName = s.option(form.Value, 'server_name', _('Domain'));
		serverName.datatype = 'hostname';
		serverName.depends('mode', 'reverse_proxy');
		serverName.depends('mode', 'static');
		serverName.depends('mode', 'redirect');

		var redirectHttps = s.option(form.Flag, 'redirect_https', _('HTTP to HTTPS Redirect'));
		redirectHttps.depends('mode', 'reverse_proxy');
		redirectHttps.depends('mode', 'static');
		redirectHttps.default = '1';

		var sslCert = s.option(form.ListValue, 'ssl_cert', _('SSL Certificate'));
		sslCert.depends('mode', 'reverse_proxy');
		sslCert.depends('mode', 'static');
		sslCert.value('', _('-- None --'));
		certs.forEach(function(cert) {
			sslCert.value(cert.id, cert.name + (cert.domain ? ' (' + cert.domain + ')' : ''));
		});

		var listen = s.option(form.DynamicList, 'listen', _('Listen'));
		listen.datatype = 'string';
		listen.placeholder = '80';
		listen.depends('mode', 'reverse_proxy');
		listen.depends('mode', 'static');
		listen.depends('mode', 'redirect');

		var proxyPass = s.option(form.Value, 'proxy_pass', _('Proxy Pass'));
		proxyPass.depends('mode', 'reverse_proxy');
		proxyPass.placeholder = 'http://192.168.1.1:3000';

		var websocket = s.option(form.Flag, 'websocket', _('WebSocket'));
		websocket.depends('mode', 'reverse_proxy');

		var proxyHost = s.option(form.Flag, 'proxy_host', _('Proxy Host Header'));
		proxyHost.depends('mode', 'reverse_proxy');
		proxyHost.default = '1';

		var proxyXff = s.option(form.Flag, 'proxy_xff', _('X-Forwarded-For'));
		proxyXff.depends('mode', 'reverse_proxy');
		proxyXff.default = '1';

		var proxyXfp = s.option(form.Flag, 'proxy_xfp', _('X-Forwarded-Proto'));
		proxyXfp.depends('mode', 'reverse_proxy');
		proxyXfp.default = '1';

		var proxyXri = s.option(form.Flag, 'proxy_xri', _('X-Real-IP'));
		proxyXri.depends('mode', 'reverse_proxy');
		proxyXri.default = '1';

		var rootDir = s.option(form.Value, 'root', _('Root Directory'));
		rootDir.depends('mode', 'static');
		rootDir.placeholder = '/www/mysite';

		var indexFile = s.option(form.Value, 'index', _('Index File'));
		indexFile.depends('mode', 'static');
		indexFile.default = 'index.html';
		indexFile.placeholder = 'index.html';

		var redirectTarget = s.option(form.Value, 'redirect_target', _('Redirect Target'));
		redirectTarget.depends('mode', 'redirect');
		redirectTarget.placeholder = 'https://example.com';

		var customBlock = s.option(form.TextValue, 'custom_server_block', _('Custom Server Block Content'));
		customBlock.depends('mode', 'custom');
		customBlock.rows = 15;
		customBlock.monospace = true;

		var accessLog = s.option(form.Flag, 'access_log', _('Access Log'));
		accessLog.default = '0';

		var errorLog = s.option(form.Flag, 'error_log', _('Error Log'));
		errorLog.default = '1';

		if (!isNew && site) {
			Object.keys(site).forEach(function(key) {
				if (key === 'id') return;
				if (key === 'listen') {
					uci.set('nginx_manager', siteId, key, site[key] ? site[key].split(',') : []);
				} else {
					uci.set('nginx_manager', siteId, key, site[key]);
				}
			});
		}

		return m.render().then(function(node) {
			var actionsDiv = E('div', { 'class': 'nginx-manager-actions', 'style': 'margin-top: 16px;' });

			if (!isNew) {
				actionsDiv.appendChild(E('button', {
					'class': 'btn cbi-button',
					'click': function() {
						callRenderSite(siteId).then(function(result) {
							ui.showModal(_('Generated Config'), [
								E('div', { 'class': 'nginx-manager-code-block' }, (result && result.config) || ''),
								E('div', { 'class': 'right', 'style': 'margin-top: 8px;' }, [
									E('button', {
										'class': 'btn',
										'click': function() { ui.hideModal(); }
									}, _('Close'))
								])
							]);
						});
					}
				}, _('View Generated Config')));
			}

			actionsDiv.appendChild(E('button', {
				'class': 'btn',
				'click': function() {
					location.href = L.url('admin/services/nginx-manager/sites');
				}
			}, _('Back to Sites')));

			node.appendChild(actionsDiv);
			return node;
		});
	},

	handleSave: function(ev) {
		var siteId = '';
		if (L.env.pathinfo) {
			siteId = L.env.pathinfo.split('/').pop();
		}
		if (!siteId && window.location.hash) {
			siteId = window.location.hash.split('/').pop();
		}

		var formEl = document.querySelector('.cbi-map');
		if (!formEl) return Promise.reject('form not found');

		var data = { id: siteId };

		var fields = ['name', 'mode', 'server_name', 'proxy_pass', 'root', 'index',
			'websocket', 'redirect_https', 'proxy_host', 'proxy_xff', 'proxy_xfp',
			'proxy_xri', 'ssl_cert', 'access_log', 'error_log', 'custom_server_block',
			'redirect_target', 'enabled', 'listen'];

		fields.forEach(function(field) {
			if (field === 'listen') {
				var listenVals = [];
				document.querySelectorAll('[data-name="listen"] input').forEach(function(input) {
					var value = input.value.trim();
					if (value) listenVals.push(value);
				});
				data.listen = listenVals.join(',');
				return;
			}

			var el = document.querySelector('[data-name="' + field + '"] input, [data-name="' + field + '"] select, [data-name="' + field + '"] textarea');
			if (el) {
				if (el.type === 'checkbox') {
					data[field] = el.checked ? '1' : '0';
				} else {
					data[field] = el.value;
				}
			}
		});

		return callSetSite(data).then(function(result) {
			if (result && result.error) {
				ui.addNotification(null, E('p', {}, _('Configuration test failed') + ': ' + (result.detail || result.error)), 'error');
			} else {
				ui.addNotification(null, E('p', {}, _('Site saved successfully')), 'success');
			}
		});
	},

	handleSaveApply: function(ev) {
		return this.handleSave(ev);
	},

	handleReset: null
});
