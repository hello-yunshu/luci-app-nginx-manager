'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require ui';
'require rpc';
'require nginx-manager/utils as utils';

var callListSites = rpc.declare({
	object: 'nginx_manager',
	method: 'list_sites',
	expect: {}
});

var callDeleteSite = rpc.declare({
	object: 'nginx_manager',
	method: 'delete_site',
	params: ['id'],
	expect: {}
});

var callEnableSite = rpc.declare({
	object: 'nginx_manager',
	method: 'enable_site',
	params: ['id'],
	expect: {}
});

var callDisableSite = rpc.declare({
	object: 'nginx_manager',
	method: 'disable_site',
	params: ['id'],
	expect: {}
});

var callRenderSite = rpc.declare({
	object: 'nginx_manager',
	method: 'render_site',
	params: ['id'],
	expect: {}
});

var callSetSite = rpc.declare({
	object: 'nginx_manager',
	method: 'set_site',
	params: ['id', 'name', 'mode', 'server_name', 'listen_addr', 'listen_port', 'proxy_pass', 'root', 'index',
		'websocket', 'proxy_type', 'custom_proxy_headers', 'redirect_https', 'proxy_host', 'proxy_xff', 'proxy_xfp', 'proxy_xri',
		'ssl_cert', 'access_log', 'error_log', 'custom_server_block', 'redirect_target', 'enabled'],
	expect: {}
});

function modeLabel(mode) {
	switch (mode) {
		case 'reverse_proxy': return _('Reverse Proxy');
		case 'static': return _('Static Website');
		case 'custom': return _('Custom Server Block');
		case 'redirect': return _('Redirect');
		default: return mode || '-';
	}
}

return view.extend({
	load: function() {
		return callListSites();
	},

	render: function(data) {
		var sites = (data && data.sites) || [];

		var container = E('div', { 'class': 'cbi-map' });

		utils.loadSharedCSS();

		container.appendChild(E('h2', { 'class': 'cbi-map-title' }, _('Sites')));

		var headerSection = E('div', { 'class': 'cbi-section' });

		headerSection.appendChild(E('button', {
			'class': 'cbi-button cbi-button-apply',
			'click': function() {
				var nameInput = E('input', {
					'type': 'text',
					'id': 'new-site-name',
					'placeholder': 'my-site',
					'class': 'cbi-input-text'
				});
				var modeSelect = E('select', { 'id': 'new-site-mode', 'class': 'cbi-input-select' }, [
					E('option', { 'value': 'reverse_proxy' }, _('Reverse Proxy')),
					E('option', { 'value': 'static' }, _('Static Website')),
					E('option', { 'value': 'custom' }, _('Custom Server Block')),
					E('option', { 'value': 'redirect' }, _('Redirect'))
				]);
				ui.showModal(_('Add Site'), [
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Site Name')),
						nameInput
					]),
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Type')),
						modeSelect
					]),
					E('div', { 'class': 'right' }, [
						E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
						E('button', {
							'class': 'cbi-button cbi-button-apply',
							'click': function() {
								var name = nameInput.value.trim();
								var mode = modeSelect.value;
								if (!name) {
									ui.addNotification(null, E('p', {}, _('Site name is required')), 'error');
									return;
								}
								if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
									ui.addNotification(null, E('p', {}, _('Invalid site name')), 'error');
									return;
								}
								ui.hideModal();
								ui.showModal(_('Creating site...'), [E('p', {}, _('Please wait...'))]);
								callSetSite(name, name, mode, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '1').then(function(result) {
									ui.hideModal();
									if (result && result.error) {
										ui.addNotification(null, E('p', {}, result.error), 'error');
									} else {
										ui.showModal(_('Redirecting'), [E('p', {}, _('Site created, redirecting to edit page...'))]);
										setTimeout(function() {
											ui.hideModal();
											location.href = L.url('admin/services/nginx-manager/sites/edit', name);
										}, 500);
									}
								});
							}
						}, _('Create'))
					])
				]);
			}
		}, '\u271A ' + _('Add Site')));

		container.appendChild(headerSection);

		if (sites.length === 0) {
			container.appendChild(E('div', { 'class': 'cbi-section' }, [
				E('p', { 'class': 'nm-empty-state' },
					_('No sites configured. Click "Add Site" to create one.'))
			]));
			return utils.appendFooter(container, {
				project: 'Nginx Manager',
				repoUrl: 'https://github.com/hello-yunshu/luci-app-nginx-manager'
			});
		}

		var table = E('table', { 'class': 'table' });
		var thead = E('thead');
		var headerRow = E('tr');
		[_('Enabled'), _('Name'), _('Domain'), _('Type'), _('SSL'), _('Backend / Root'), _('Actions')].forEach(function(title) {
			headerRow.appendChild(E('th', {}, title));
		});
		thead.appendChild(headerRow);
		table.appendChild(thead);

		sites.forEach(function(site) {
			var row = E('tr');

			var enabledCell = E('td');
			enabledCell.appendChild(E('span', { 'class': 'nm-badge ' + (site.enabled === '1' ? 'success' : 'disabled') },
				site.enabled === '1' ? _('Enabled') : _('Disabled')));
			row.appendChild(enabledCell);

			row.appendChild(E('td', {}, site.name || '-'));
			row.appendChild(E('td', {}, site.server_name || '-'));
			row.appendChild(E('td', {}, modeLabel(site.mode)));

			var sslCell = E('td');
			sslCell.appendChild(E('span', { 'class': 'nm-badge ' + (site.has_ssl === '1' ? 'success' : 'disabled') },
				site.has_ssl === '1' ? _('SSL') : '-'));
			row.appendChild(sslCell);

			row.appendChild(E('td', {}, site.proxy_pass || site.root || '-'));

			var actionsCell = E('td', { 'class': 'nm-actions' });

			actionsCell.appendChild(E('button', {
				'class': 'cbi-button',
				'click': function() {
					location.href = L.url('admin/services/nginx-manager/sites/edit', site.id);
				}
			}, _('Edit')));

			actionsCell.appendChild(E('button', {
				'class': 'cbi-button',
				'click': function() {
					callRenderSite(site.id).then(function(result) {
						ui.showModal(_('Generated Config'), [
							E('pre', { 'class': 'nm-code-block' }, (result && result.config) || ''),
							E('div', { 'class': 'right' }, [
								E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Close'))
							])
						]);
					});
				}
			}, _('View Config')));

			if (site.enabled === '1') {
				actionsCell.appendChild(E('button', {
					'class': 'cbi-button cbi-button-reset',
					'click': function() {
						callDisableSite(site.id).then(function() {
							ui.addNotification(null, E('p', {}, _('Site disabled')), 'info');
							setTimeout(function() { location.reload(); }, 500);
						});
					}
				}, _('Disable')));
			} else {
				actionsCell.appendChild(E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': function() {
						callEnableSite(site.id).then(function() {
							ui.addNotification(null, E('p', {}, _('Site enabled')), 'info');
							setTimeout(function() { location.reload(); }, 500);
						});
					}
				}, _('Enable')));
			}

			actionsCell.appendChild(E('button', {
				'class': 'cbi-button cbi-button-reset',
				'click': function() {
					ui.showModal(_('Confirm Delete'), [
						E('p', {}, _('Are you sure you want to delete this site?')),
						E('div', { 'class': 'right' }, [
							E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
							E('button', {
								'class': 'cbi-button cbi-button-reset',
								'click': function() {
									ui.hideModal();
									callDeleteSite(site.id).then(function(result) {
										if (result && result.error) {
											ui.addNotification(null, E('p', {}, result.error), 'error');
										} else {
											ui.addNotification(null, E('p', {}, _('Site deleted successfully')), 'info');
											setTimeout(function() { location.reload(); }, 500);
										}
									});
								}
							}, _('Delete'))
						])
					]);
				}
			}, _('Delete')));

			row.appendChild(actionsCell);
			table.appendChild(row);
		});

		container.appendChild(E('div', { 'class': 'cbi-section' }, [table]));

		return utils.appendFooter(container, {
			project: 'Nginx Manager',
			repoUrl: 'https://github.com/hello-yunshu/luci-app-nginx-manager'
		});
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
