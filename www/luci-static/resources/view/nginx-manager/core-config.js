'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require ui';
'require rpc';
'require nginx-manager/utils as utils';
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

		var container = E('div', { 'class': 'cbi-map' });

		utils.loadSharedCSS();

		container.appendChild(E('h2', { 'class': 'cbi-map-title' }, _('Core Config')));

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

		/* ========== General Settings ========== */
		var generalSection = E('div', { 'class': 'cbi-section' });
		generalSection.appendChild(E('h3', {}, _('General Settings')));

		var maxBodyInput = E('input', { 'type': 'text', 'class': 'cbi-input-text' });
		maxBodyInput.placeholder = '1m';
		if (config.client_max_body_size) maxBodyInput.value = config.client_max_body_size;
		generalSection.appendChild(makeField('cfg-client_max_body_size', _('Client Max Body Size'), maxBodyInput));

		var keepaliveInput = E('input', { 'type': 'number', 'class': 'cbi-input-text' });
		keepaliveInput.placeholder = '65';
		if (config.keepalive_timeout) keepaliveInput.value = config.keepalive_timeout;
		generalSection.appendChild(makeField('cfg-keepalive_timeout', _('Keepalive Timeout'), keepaliveInput));

		generalSection.appendChild(makeFlag('cfg-gzip', _('Gzip'), config.gzip === '1'));

		var serverTokensSelect = E('select', { 'class': 'cbi-input-select' }, [
			E('option', { 'value': '' }, _('Default')),
			E('option', { 'value': 'off' }, _('Off')),
			E('option', { 'value': 'on' }, _('On'))
		]);
		if (config.server_tokens) serverTokensSelect.value = config.server_tokens;
		generalSection.appendChild(makeField('cfg-server_tokens', _('Server Tokens'), serverTokensSelect));

		generalSection.appendChild(makeFlag('cfg-sendfile', _('Sendfile'), config.sendfile === '1'));

		var accessLogInput = E('input', { 'type': 'text', 'class': 'cbi-input-text' });
		accessLogInput.placeholder = '/var/log/nginx/access.log';
		if (config.access_log) accessLogInput.value = config.access_log;
		generalSection.appendChild(makeField('cfg-access_log', _('Access Log'), accessLogInput));

		var errorLogInput = E('input', { 'type': 'text', 'class': 'cbi-input-text' });
		errorLogInput.placeholder = '/var/log/nginx/error.log';
		if (config.error_log) errorLogInput.value = config.error_log;
		generalSection.appendChild(makeField('cfg-error_log', _('Error Log'), errorLogInput));

		container.appendChild(generalSection);

		/* ========== SSL Settings ========== */
		var sslSection = E('div', { 'class': 'cbi-section' });
		sslSection.appendChild(E('h3', {}, _('SSL Settings')));

		var sslProtocolsInput = E('input', { 'type': 'text', 'class': 'cbi-input-text' });
		sslProtocolsInput.placeholder = 'TLSv1.2 TLSv1.3';
		if (config.ssl_protocols) sslProtocolsInput.value = config.ssl_protocols;
		sslSection.appendChild(makeField('cfg-ssl_protocols', _('SSL Protocols'), sslProtocolsInput));

		var sslCiphersInput = E('input', { 'type': 'text', 'class': 'cbi-input-text' });
		sslCiphersInput.placeholder = 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
		if (config.ssl_ciphers) sslCiphersInput.value = config.ssl_ciphers;
		sslSection.appendChild(makeField('cfg-ssl_ciphers', _('SSL Ciphers'), sslCiphersInput));

		container.appendChild(sslSection);

		/* ========== Save Button ========== */
		var saveBtnGroup = E('div', { 'class': 'nm-btn-group' });
		saveBtnGroup.appendChild(E('button', {
			'class': 'cbi-button cbi-button-apply',
			'click': function() { saveConfig(); }
		}, _('Save')));
		container.appendChild(saveBtnGroup);

		/* ========== Read-only View Section ========== */
		var readonlySection = E('div', { 'class': 'cbi-section' });
		readonlySection.appendChild(E('h3', {}, _('Read-only View')));

		var readonlyBtns = E('div', { 'class': 'nm-btn-group', 'style': 'margin-bottom: 0.5em;' });

		readonlyBtns.appendChild(E('button', {
			'class': 'cbi-button',
			'click': function() {
				callGetNginxT().then(function(result) {
					ui.showModal(_('nginx -T Output'), [
						E('pre', { 'class': 'nm-code-block' }, (result && result.content) || ''),
						E('div', { 'class': 'right', 'style': 'margin-top: 8px;' }, [
							E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Close'))
						])
					]);
				});
			}
		}, _('View nginx -T')));

		readonlyBtns.appendChild(E('button', {
			'class': 'cbi-button',
			'click': function() {
				callGetFileReadonly('/etc/nginx/uci.conf.template').then(function(result) {
					ui.showModal(_('/etc/nginx/uci.conf.template'), [
						E('pre', { 'class': 'nm-code-block' }, (result && result.content) || _('File not found')),
						E('div', { 'class': 'right', 'style': 'margin-top: 8px;' }, [
							E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Close'))
						])
					]);
				});
			}
		}, _('View uci.conf.template')));

		readonlySection.appendChild(readonlyBtns);
		container.appendChild(readonlySection);

		/* ========== Danger Zone Section ========== */
		var dangerZone = E('div', { 'class': 'cbi-section', 'style': 'border-left: 5px solid var(--danger-color, #d94b4b);' });
		dangerZone.appendChild(E('h3', {}, _('Danger Zone')));

		var dangerWarning = E('div', { 'class': 'alert-message warning' });
		dangerWarning.appendChild(E('p', {}, _('Modifying core configuration may prevent Nginx from starting, which could make the LuCI web interface inaccessible. Please ensure SSH is available or keep uhttpd as a backup entry point.')));
		dangerZone.appendChild(dangerWarning);

		var dangerToggle = E('button', {
			'class': 'cbi-button cbi-button-reset',
			'style': 'margin-bottom: 1em;',
			'click': function() {
				var current = uci.get('nginx_manager', 'global', 'dangerous_core_edit') || '0';
				var newVal = current === '1' ? '0' : '1';
				uci.set('nginx_manager', 'global', 'dangerous_core_edit', newVal);
				return uci.save().then(function() {
					return uci.apply();
				}).then(function() {
					ui.addNotification(null, E('p', {}, newVal === '1' ? _('Dangerous edit mode enabled') : _('Dangerous edit mode disabled')), newVal === '1' ? 'warning' : 'info');
					setTimeout(function() { location.reload(); }, 500);
				}).catch(function(err) {
					ui.addNotification(null, E('p', {}, _('Save failed') + ': ' + (err.message || err)), 'error');
				});
			}
		}, config.dangerous_core_edit === '1' ? _('Disable Dangerous Edit') : _('Enable Dangerous Edit'));

		dangerZone.appendChild(dangerToggle);

		if (config.dangerous_core_edit === '1') {
			var files = [
				{ path: '/etc/nginx/uci.conf.template', label: 'uci.conf.template' },
				{ path: '/etc/nginx/nginx.conf', label: 'nginx.conf' }
			];

			files.forEach(function(file) {
				var fileDiv = E('div', { 'class': 'nm-danger-file' });
				fileDiv.appendChild(E('h5', {}, file.label));

				var textarea = E('textarea', {
					'class': 'cbi-input-textarea nm-danger-editor',
					'id': 'editor-' + file.label.replace(/[^a-z]/g, '')
				});

				callGetFileReadonly(file.path).then(function(result) {
					if (result && result.content) {
						textarea.value = result.content;
					} else {
						textarea.value = _('File not found or not readable');
						textarea.disabled = true;
					}
				});

				fileDiv.appendChild(textarea);

				fileDiv.appendChild(E('button', {
					'class': 'cbi-button cbi-button-reset',
					'click': function() {
						ui.showModal(_('Confirm Save'), [
							E('p', {}, _('Saving this file may break Nginx configuration. A backup will be created first. Continue?')),
							E('div', { 'class': 'right' }, [
								E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
								E('button', {
									'class': 'cbi-button cbi-button-reset',
									'click': function() {
										ui.hideModal();
										callSetFileDangerous({
											path: file.path,
											content: textarea.value
										}).then(function(result) {
											if (result && result.error) {
												ui.addNotification(null, E('p', {}, _('Save failed') + ': ' + (result.detail || result.error)), 'error');
											} else {
												ui.addNotification(null, E('p', {}, _('File saved successfully')), 'info');
											}
										}).catch(function(err) {
											ui.addNotification(null, E('p', {}, _('Save failed') + ': ' + (err.message || err)), 'error');
										});
									}
								}, _('Save'))
							])
						]);
					}
				}, _('Save')));

				dangerZone.appendChild(fileDiv);
			});
		}

		container.appendChild(dangerZone);

		/* ---- save logic ---- */
		function saveConfig() {
			var data = {};
			data.client_max_body_size = maxBodyInput.value.trim();
			data.keepalive_timeout = keepaliveInput.value.trim();
			data.gzip = document.getElementById('cfg-gzip').checked ? '1' : '0';
			data.server_tokens = serverTokensSelect.value;
			data.sendfile = document.getElementById('cfg-sendfile').checked ? '1' : '0';
			data.access_log = accessLogInput.value.trim();
			data.error_log = errorLogInput.value.trim();
			data.ssl_protocols = sslProtocolsInput.value.trim();
			data.ssl_ciphers = sslCiphersInput.value.trim();

			return callSetCoreConfigSafe(data).then(function(result) {
				if (result && result.error) {
					ui.addNotification(null, E('p', {}, _('Save failed') + ': ' + result.error), 'error');
				} else {
					ui.addNotification(null, E('p', {}, _('Core config saved and applied')), 'info');
				}
			}).catch(function(err) {
				ui.addNotification(null, E('p', {}, _('Save failed') + ': ' + (err.message || JSON.stringify(err))), 'error');
			});
		}

		return utils.appendFooter(container, {
			project: 'Nginx Manager',
			repoUrl: 'https://github.com/hello-yunshu/luci-app-nginx-manager'
		});
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
