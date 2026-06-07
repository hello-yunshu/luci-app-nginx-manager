'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require form';
'require ui';
'require uci';
'require rpc';
'require nginx-manager/utils as utils';

var callSyncCoreFromNginx = rpc.declare({
	object: 'nginx_manager',
	method: 'sync_core_from_nginx',
	expect: {}
});

var callApplyCoreConfig = rpc.declare({
	object: 'nginx_manager',
	method: 'apply_core_config',
	expect: {}
});

var callSetDangerousCoreEdit = rpc.declare({
	object: 'nginx_manager',
	method: 'set_dangerous_core_edit',
	params: ['enabled'],
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
		return callSyncCoreFromNginx();
	},

	render: function() {
		utils.loadSharedCSS();

		var m = new form.Map('nginx_manager', _('Core Config'));
		this.map = m;

		/* ========== General Settings ========== */
		var s1 = m.section(form.TypedSection, 'global', _('General Settings'));
		s1.anonymous = true;

		var o;

		o = s1.option(form.Value, 'client_max_body_size', _('Client Max Body Size'));
		o.placeholder = '1m';
		o.rmempty = true;

		o = s1.option(form.Value, 'keepalive_timeout', _('Keepalive Timeout'));
		o.placeholder = '65';
		o.datatype = 'uinteger';
		o.rmempty = true;

		o = s1.option(form.Flag, 'gzip', _('Gzip'));
		o.rmempty = false;

		o = s1.option(form.ListValue, 'server_tokens', _('Server Tokens'));
		o.value('', _('Default'));
		o.value('off', _('Off'));
		o.value('on', _('On'));
		o.rmempty = true;

		o = s1.option(form.Flag, 'sendfile', _('Sendfile'));
		o.rmempty = false;

		o = s1.option(form.Value, 'access_log', _('Access Log'));
		o.placeholder = '/var/log/nginx/access.log';
		o.rmempty = true;

		o = s1.option(form.Value, 'error_log', _('Error Log'));
	o.placeholder = '/var/log/nginx/error.log';
	o.rmempty = true;

	/* ========== SSL Settings ========== */
		var s2 = m.section(form.TypedSection, 'global', _('SSL Settings'));
		s2.anonymous = true;

		o = s2.option(form.Value, 'ssl_protocols', _('SSL Protocols'));
		o.placeholder = 'TLSv1.2 TLSv1.3';
		o.rmempty = true;

		o = s2.option(form.Value, 'ssl_ciphers', _('SSL Ciphers'));
		o.placeholder = 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
		o.rmempty = true;

		return m.render().then(function(node) {
			/* ========== Read-only View Section ========== */
			var readonlySection = E('div', { 'class': 'cbi-section' });
			readonlySection.appendChild(E('h3', {}, _('Read-only View')));

			var readonlyBtns = E('div', { 'class': 'nm-btn-group', 'style': 'margin-bottom: 0.5em;' });

			readonlyBtns.appendChild(E('button', {
				'type': 'button',
				'class': 'cbi-button',
				'click': function() {
					callGetNginxT().then(function(result) {
						ui.showModal(_('nginx -T Output'), [
							E('pre', { 'class': 'nm-code-block' }, (result && result.content) || ''),
							E('div', { 'class': 'right', 'style': 'margin-top: 8px;' }, [
								E('button', { 'type': 'button', 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Close'))
							])
						]);
					});
				}
			}, _('View nginx -T')));

			readonlyBtns.appendChild(E('button', {
				'type': 'button',
				'class': 'cbi-button',
				'click': function() {
					callGetFileReadonly('/etc/nginx/uci.conf.template').then(function(result) {
						ui.showModal(_('/etc/nginx/uci.conf.template'), [
							E('pre', { 'class': 'nm-code-block' }, (result && result.content) || _('File not found')),
							E('div', { 'class': 'right', 'style': 'margin-top: 8px;' }, [
								E('button', { 'type': 'button', 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Close'))
							])
						]);
					});
				}
			}, _('View uci.conf.template')));

			readonlySection.appendChild(readonlyBtns);
			node.appendChild(readonlySection);

			/* ========== Danger Zone Section ========== */
			var dangerous = (uci.get('nginx_manager', 'global', 'dangerous_core_edit') || '0') === '1';

			var dangerZone = E('div', { 'class': 'cbi-section', 'style': 'border-left: 5px solid var(--danger-color, #d94b4b);' });
			dangerZone.appendChild(E('h3', {}, _('Danger Zone')));

			var dangerWarning = E('div', { 'class': 'alert-message warning' });
			dangerWarning.appendChild(E('p', {}, _('Modifying core configuration may prevent Nginx from starting, which could make the LuCI web interface inaccessible. Please ensure SSH is available or keep uhttpd as a backup entry point.')));
			dangerZone.appendChild(dangerWarning);

			var dangerToggle = E('button', {
				'type': 'button',
				'class': 'cbi-button cbi-button-reset',
				'style': 'margin-bottom: 1em;',
				'click': function() {
					var button = this;
					var current = uci.get('nginx_manager', 'global', 'dangerous_core_edit') || '0';
					var newVal = current === '1' ? '0' : '1';
					button.disabled = true;
					return callSetDangerousCoreEdit(newVal).then(function(result) {
						if (result && result.error) {
							button.disabled = false;
							ui.addNotification(null, E('p', {}, _('Save failed') + ': ' + (result.detail || result.error)), 'error');
							return;
						}
						ui.addNotification(null, E('p', {}, newVal === '1' ? _('Dangerous edit mode enabled') : _('Dangerous edit mode disabled')), newVal === '1' ? 'warning' : 'info');
						setTimeout(function() { location.reload(); }, 500);
					}).catch(function(err) {
						button.disabled = false;
						ui.addNotification(null, E('p', {}, _('Save failed') + ': ' + (err.message || err)), 'error');
					});
				}
			}, dangerous ? _('Disable Dangerous Edit') : _('Enable Dangerous Edit'));

			dangerZone.appendChild(dangerToggle);

			if (dangerous) {
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
						'type': 'button',
						'class': 'cbi-button cbi-button-reset',
						'click': function() {
							ui.showModal(_('Confirm Save'), [
								E('p', {}, _('Saving this file may break Nginx configuration. A backup will be created first. Continue?')),
								E('div', { 'class': 'right' }, [
									E('button', { 'type': 'button', 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
									E('button', {
										'type': 'button',
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

			node.appendChild(dangerZone);

			/* ========== Footer ========== */
			utils.appendFooter(node, {
				project: 'Nginx Manager',
				repoUrl: 'https://github.com/hello-yunshu/luci-app-nginx-manager'
			});

			return node;
		});
	},

	handleSave: function(ev, mode) {
		return this.map.save(null, true).then(function() {
			ui.addNotification(null, E('p', {}, _('Configuration saved')), 'info');
		}).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Save failed') + ': ' + (err.message || err)), 'error');
		});
	},

	handleSaveApply: function(ev, mode) {
		var self = this;
		return this.map.save(null, true).then(function() {
			var dangerous = (uci.get('nginx_manager', 'global', 'dangerous_core_edit') || '0') === '1';
			if (dangerous) {
				ui.addNotification(null, E('p', {}, _('Changes saved but not applied because dangerous edit mode is enabled. Disable it to apply changes.')), 'warning');
				return;
			}
			return callApplyCoreConfig().then(function(result) {
				if (result && result.error) {
					ui.addNotification(null, E('p', {}, _('Apply failed') + ': ' + (result.detail || result.error)), 'error');
				} else {
					ui.addNotification(null, E('p', {}, _('Core config saved and applied')), 'info');
				}
			});
		}).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Save failed') + ': ' + (err.message || err)), 'error');
		});
	},

	handleReset: function(ev, mode) {
		return this.map.reset().then(function() {
			ui.addNotification(null, E('p', {}, _('Configuration reset')), 'info');
		}).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Reset failed') + ': ' + (err.message || err)), 'error');
		});
	}
});
