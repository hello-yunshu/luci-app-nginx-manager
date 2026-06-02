'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require ui';
'require rpc';

var callListSites = rpc.declare({
	object: 'nginx_manager',
	method: 'list_sites',
	expect: { sites: [] }
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

var callTestConfig = rpc.declare({
	object: 'nginx_manager',
	method: 'test_config',
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

		var page = E('div', { 'class': 'nginx-manager-page' });

		page.appendChild(E('link', {
			'rel': 'stylesheet',
			'href': L.resource('nginx-manager/nginx-manager.css')
		}));

		var header = E('div', { 'class': 'cbi-section' });
		header.appendChild(E('h3', {}, _('Sites')));

		var addBtn = E('button', {
			'class': 'btn cbi-button-action',
			'style': 'margin-bottom: 12px;',
			'click': function() {
				ui.showModal(_('Add Site'), [
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Site Name')),
						E('input', {
							'type': 'text',
							'id': 'new-site-name',
							'placeholder': 'my-site',
							'class': 'cbi-input-text'
						})
					]),
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Type')),
						E('select', { 'id': 'new-site-mode', 'class': 'cbi-input-select' }, [
							E('option', { 'value': 'reverse_proxy' }, _('Reverse Proxy')),
							E('option', { 'value': 'static' }, _('Static Website')),
							E('option', { 'value': 'custom' }, _('Custom Server Block')),
							E('option', { 'value': 'redirect' }, _('Redirect'))
						])
					]),
					E('div', { 'class': 'right' }, [
						E('button', {
							'class': 'btn',
							'click': function() { ui.hideModal(); }
						}, _('Cancel')),
						' ',
						E('button', {
							'class': 'btn cbi-button-action',
							'click': function() {
								var name = document.getElementById('new-site-name').value.trim();
								var mode = document.getElementById('new-site-mode').value;
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
								rpc.declare({
									object: 'nginx_manager',
									method: 'set_site',
									params: ['id', 'name', 'mode', 'enabled'],
									expect: {}
								})(name, name, mode, '1').then(function(result) {
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
		}, _('Add Site'));

		header.appendChild(addBtn);
		page.appendChild(header);

		if (sites.length === 0) {
			page.appendChild(E('div', { 'class': 'cbi-section' }, [
				E('p', { 'style': 'text-align: center; color: #888; padding: 20px;' },
					_('No sites configured. Click "Add Site" to create one.'))
			]));
			return page;
		}

		var table = E('table', { 'class': 'table cbi-section-table' });
		var thead = E('thead');
		var headerRow = E('tr', { 'class': 'cbi-section-table-titles' });
		[_('Enabled'), _('Name'), _('Domain'), _('Type'), _('SSL'), _('Backend / Root'), _('Actions')].forEach(function(title) {
			headerRow.appendChild(E('th', { 'class': 'cbi-section-table-cell' }, title));
		});
		thead.appendChild(headerRow);
		table.appendChild(thead);

		var tbody = E('tbody');

		sites.forEach(function(site) {
			var row = E('tr', { 'class': 'cbi-section-table-row' });

			var enabledCell = E('td', { 'class': 'cbi-section-table-cell' });
			if (site.enabled === '1') {
				enabledCell.appendChild(E('span', { 'class': 'nginx-manager-status nginx-manager-status-success' }, _('Enabled')));
			} else {
				enabledCell.appendChild(E('span', { 'class': 'nginx-manager-status nginx-manager-status-disabled' }, _('Disabled')));
			}
			row.appendChild(enabledCell);

			row.appendChild(E('td', { 'class': 'cbi-section-table-cell' }, site.name || '-'));
			row.appendChild(E('td', { 'class': 'cbi-section-table-cell' }, site.server_name || '-'));
			row.appendChild(E('td', { 'class': 'cbi-section-table-cell' }, modeLabel(site.mode)));

			var sslCell = E('td', { 'class': 'cbi-section-table-cell' });
			if (site.has_ssl === '1') {
				sslCell.appendChild(E('span', { 'class': 'nginx-manager-status nginx-manager-status-success' }, 'SSL'));
			} else {
				sslCell.appendChild(E('span', { 'class': 'nginx-manager-status nginx-manager-status-disabled' }, '-'));
			}
			row.appendChild(sslCell);

			var backend = site.proxy_pass || site.root || '-';
			row.appendChild(E('td', { 'class': 'cbi-section-table-cell' }, backend));

			var actionsCell = E('td', { 'class': 'cbi-section-table-cell' });

			actionsCell.appendChild(E('button', {
				'class': 'btn cbi-button-action',
				'style': 'margin-right: 4px;',
				'click': function() {
					location.href = L.url('admin/services/nginx-manager/sites/edit', site.id);
				}
			}, _('Edit')));

			actionsCell.appendChild(E('button', {
				'class': 'btn cbi-button',
				'style': 'margin-right: 4px;',
				'click': function() {
					callRenderSite(site.id).then(function(result) {
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
			}, _('View Config')));

			if (site.enabled === '1') {
				actionsCell.appendChild(E('button', {
					'class': 'btn cbi-button',
					'style': 'margin-right: 4px;',
					'click': function() {
						callDisableSite(site.id).then(function() {
							ui.addNotification(null, E('p', {}, _('Site disabled')), 'success');
							setTimeout(function() { location.reload(); }, 500);
						});
					}
				}, _('Disable')));
			} else {
				actionsCell.appendChild(E('button', {
					'class': 'btn cbi-button',
					'style': 'margin-right: 4px;',
					'click': function() {
						callEnableSite(site.id).then(function() {
							ui.addNotification(null, E('p', {}, _('Site enabled')), 'success');
							setTimeout(function() { location.reload(); }, 500);
						});
					}
				}, _('Enable')));
			}

			actionsCell.appendChild(E('button', {
				'class': 'btn cbi-button-negative',
				'click': function() {
					ui.showModal(_('Confirm Delete'), [
						E('p', {}, _('Are you sure you want to delete this site?')),
						E('div', { 'class': 'right' }, [
							E('button', {
								'class': 'btn',
								'click': function() { ui.hideModal(); }
							}, _('Cancel')),
							' ',
							E('button', {
								'class': 'btn cbi-button-negative',
								'click': function() {
									ui.hideModal();
									callDeleteSite(site.id).then(function(result) {
										if (result && result.error) {
											ui.addNotification(null, E('p', {}, result.error), 'error');
										} else {
											ui.addNotification(null, E('p', {}, _('Site deleted successfully')), 'success');
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
			tbody.appendChild(row);
		});

		table.appendChild(tbody);
		page.appendChild(E('div', { 'class': 'cbi-section' }, [table]));

		return page;
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
