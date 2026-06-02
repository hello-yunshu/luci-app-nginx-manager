'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require ui';
'require rpc';
'require form';
'require uci';

var callGetCoreConfig = rpc.declare({
	object: 'nginx_manager',
	method: 'get_core_config',
	expect: {}
});

var callSetCoreConfigSafe = rpc.declare({
	object: 'nginx_manager',
	method: 'set_core_config_safe',
	expect: {}
});

var callGetNginxT = rpc.declare({
	object: 'nginx_manager',
	method: 'get_nginx_T',
	expect: {}
});

var callGetFileReadonly = rpc.declare({
	object: 'nginx_manager',
	method: 'get_file_readonly',
	params: ['path'],
	expect: {}
});

var callSetFileDangerous = rpc.declare({
	object: 'nginx_manager',
	method: 'set_file_dangerous',
	expect: {}
});

return view.extend({
	load: function() {
		return callGetCoreConfig();
	},

	render: function(data) {
		var config = data || {};

		var page = E('div', { 'class': 'nginx-manager-page' });

		page.appendChild(E('link', {
			'rel': 'stylesheet',
			'href': L.resource('nginx-manager/nginx-manager.css')
		}));

		var m = new form.Map('nginx_manager', _('Core Config'));

		var safeSection = m.section(form.NamedSection, 'global', 'global', _('Safe Settings'));
		safeSection.anonymous = false;
		safeSection.addremove = false;

		var maxBody = safeSection.option(form.Value, 'client_max_body_size', _('Client Max Body Size'));
		maxBody.placeholder = '1m';

		var keepalive = safeSection.option(form.Value, 'keepalive_timeout', _('Keepalive Timeout'));
		keepalive.datatype = 'uinteger';
		keepalive.placeholder = '65';

		var gzip = safeSection.option(form.Flag, 'gzip', _('Gzip'));

		var serverTokens = safeSection.option(form.ListValue, 'server_tokens', _('Server Tokens'));
		serverTokens.value('', _('Default'));
		serverTokens.value('off', _('Off'));
		serverTokens.value('on', _('On'));

		var sendfile = safeSection.option(form.Flag, 'sendfile', _('Sendfile'));

		var accessLog = safeSection.option(form.Value, 'access_log', _('Access Log'));
		accessLog.placeholder = '/var/log/nginx/access.log';

		var errorLog = safeSection.option(form.Value, 'error_log', _('Error Log'));
		errorLog.placeholder = '/var/log/nginx/error.log';

		var sslProtocols = safeSection.option(form.Value, 'ssl_protocols', _('SSL Protocols'));
		sslProtocols.placeholder = 'TLSv1.2 TLSv1.3';

		var sslCiphers = safeSection.option(form.Value, 'ssl_ciphers', _('SSL Ciphers'));
		sslCiphers.placeholder = 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';

		return m.render().then(function(node) {
			var readonlySection = E('div', { 'class': 'cbi-section', 'style': 'margin-top: 20px;' });
			readonlySection.appendChild(E('h3', {}, _('Read-only View')));

			var readonlyBtns = E('div', { 'class': 'nginx-manager-actions' });

			readonlyBtns.appendChild(E('button', {
				'class': 'btn cbi-button',
				'click': function() {
					callGetNginxT().then(function(result) {
						ui.showModal(_('nginx -T Output'), [
							E('div', { 'class': 'nginx-manager-code-block' }, (result && result.content) || ''),
							E('div', { 'class': 'right', 'style': 'margin-top: 8px;' }, [
								E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Close'))
							])
						]);
					});
				}
			}, _('View nginx -T')));

			readonlyBtns.appendChild(E('button', {
				'class': 'btn cbi-button',
				'click': function() {
					callGetFileReadonly('/etc/nginx/uci.conf.template').then(function(result) {
						ui.showModal(_('/etc/nginx/uci.conf.template'), [
							E('div', { 'class': 'nginx-manager-code-block' }, (result && result.content) || _('File not found')),
							E('div', { 'class': 'right', 'style': 'margin-top: 8px;' }, [
								E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Close'))
							])
						]);
					});
				}
			}, _('View uci.conf.template')));

			readonlySection.appendChild(readonlyBtns);
			node.appendChild(readonlySection);

			var dangerZone = E('div', { 'class': 'nginx-manager-danger-zone', 'style': 'margin-top: 20px;' });
			dangerZone.appendChild(E('h3', {}, _('Danger Zone')));
			dangerZone.appendChild(E('p', {}, _('Modifying core configuration may prevent Nginx from starting, which could make the LuCI web interface inaccessible. Please ensure SSH is available or keep uhttpd as a backup entry point.')));

			var dangerToggle = E('button', {
				'class': 'btn cbi-button-negative',
				'click': function() {
					var current = uci.get('nginx_manager', 'global', 'dangerous_core_edit') || '0';
					var newVal = current === '1' ? '0' : '1';
					uci.set('nginx_manager', 'global', 'dangerous_core_edit', newVal);
					return uci.save().then(function() {
						return uci.apply();
					}).then(function() {
						ui.addNotification(null, E('p', {}, newVal === '1' ? _('Dangerous edit mode enabled') : _('Dangerous edit mode disabled')), newVal === '1' ? 'warning' : 'success');
						setTimeout(function() { location.reload(); }, 500);
					}).catch(function(err) {
						ui.addNotification(null, E('p', {}, _('Save failed') + ': ' + (err.message || err)), 'error');
					});
				}
			}, config.dangerous_core_edit === '1' ? _('Disable Dangerous Edit') : _('Enable Dangerous Edit'));

			dangerZone.appendChild(dangerToggle);
			node.appendChild(dangerZone);

			return node;
		});
	},

	handleSave: function(ev) {
		var data = {};

		var fields = ['client_max_body_size', 'keepalive_timeout', 'gzip', 'server_tokens', 'sendfile',
			'access_log', 'error_log', 'ssl_protocols', 'ssl_ciphers'];

		fields.forEach(function(field) {
			var el = document.querySelector('[data-name="' + field + '"] input, [data-name="' + field + '"] select');
			if (el) {
				if (el.type === 'checkbox') {
					data[field] = el.checked ? '1' : '0';
				} else {
					data[field] = el.value;
				}
			}
		});

		return callSetCoreConfigSafe(data).then(function(result) {
			if (result && result.error) {
				ui.addNotification(null, E('p', {}, _('Save failed') + ': ' + result.error), 'error');
			} else {
				ui.addNotification(null, E('p', {}, _('Core config saved and applied')), 'success');
			}
		});
	},

	handleSaveApply: function(ev) {
		return this.handleSave(ev);
	},

	handleReset: null
});
