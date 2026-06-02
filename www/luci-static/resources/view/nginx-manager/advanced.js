'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require ui';
'require rpc';
'require uci';

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
		return uci.load('nginx_manager');
	},

	render: function() {
		var page = E('div', { 'class': 'nginx-manager-page' });

		page.appendChild(E('link', {
			'rel': 'stylesheet',
			'href': L.resource('nginx-manager/nginx-manager.css')
		}));

		page.appendChild(E('h3', {}, _('Advanced Tools')));

		var dangerZone = E('div', { 'class': 'nginx-manager-danger-zone' });
		dangerZone.appendChild(E('h3', {}, _('Danger Zone')));
		dangerZone.appendChild(E('p', {}, _('Modifying core configuration may prevent Nginx from starting, which could make the LuCI web interface inaccessible. Please ensure SSH is available or keep uhttpd as a backup entry point.')));

		var dangerousEdit = uci.get('nginx_manager', 'global', 'dangerous_core_edit') || '0';

		if (dangerousEdit !== '1') {
			dangerZone.appendChild(E('p', { 'style': 'color: #888;' }, _('Enable dangerous edit mode in Core Config page to access advanced editing features.')));
		} else {
			var files = [
				{ path: '/etc/nginx/uci.conf.template', label: 'uci.conf.template' },
				{ path: '/etc/nginx/nginx.conf', label: 'nginx.conf' }
			];

			files.forEach(function(file) {
				var fileDiv = E('div', { 'style': 'margin-bottom: 12px;' });
				fileDiv.appendChild(E('h5', {}, file.label));

				var textarea = E('textarea', {
					'class': 'cbi-input-textarea',
					'style': 'width: 100%; font-family: monospace; min-height: 200px;',
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
					'class': 'btn cbi-button-negative',
					'style': 'margin-top: 4px;',
					'click': function() {
						ui.showModal(_('Confirm Save'), [
							E('p', {}, _('Saving this file may break Nginx configuration. A backup will be created first. Continue?')),
							E('div', { 'class': 'right' }, [
								E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
								' ',
								E('button', {
									'class': 'btn cbi-button-negative',
									'click': function() {
										ui.hideModal();
										callSetFileDangerous({
											path: file.path,
											content: textarea.value
										}).then(function(result) {
											if (result && result.error) {
												ui.addNotification(null, E('p', {}, _('Save failed') + ': ' + (result.detail || result.error)), 'error');
											} else {
												ui.addNotification(null, E('p', {}, _('File saved successfully')), 'success');
											}
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

		page.appendChild(dangerZone);

		return page;
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
