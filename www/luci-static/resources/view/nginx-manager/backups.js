'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require ui';
'require rpc';

var callListBackups = rpc.declare({
	object: 'nginx_manager',
	method: 'list_backups',
	expect: { backups: [] }
});

var callCreateBackup = rpc.declare({
	object: 'nginx_manager',
	method: 'create_backup',
	expect: {}
});

var callRestoreBackup = rpc.declare({
	object: 'nginx_manager',
	method: 'restore_backup',
	params: ['id'],
	expect: {}
});

var callDiffBackup = rpc.declare({
	object: 'nginx_manager',
	method: 'diff_backup',
	params: ['id'],
	expect: {}
});

return view.extend({
	load: function() {
		return callListBackups();
	},

	render: function(data) {
		var backups = (data && data.backups) || [];

		var page = E('div', { 'class': 'nginx-manager-page' });

		page.appendChild(E('link', {
			'rel': 'stylesheet',
			'href': L.resource('nginx-manager/nginx-manager.css')
		}));

		page.appendChild(E('h3', {}, _('Backups')));

		var createBtn = E('button', {
			'class': 'btn cbi-button-action',
			'style': 'margin-bottom: 12px;',
			'click': function() {
				callCreateBackup().then(function(result) {
					if (result && result.error) {
						ui.addNotification(null, E('p', {}, result.error), 'error');
					} else {
						ui.addNotification(null, E('p', {}, _('Backup created')), 'success');
						setTimeout(function() { location.reload(); }, 500);
					}
				});
			}
		}, _('Create Backup'));

		page.appendChild(createBtn);

		if (backups.length === 0) {
			page.appendChild(E('div', { 'class': 'cbi-section' }, [
				E('p', { 'style': 'text-align: center; color: #888; padding: 20px;' },
					_('No backups available.'))
			]));
			return page;
		}

		var table = E('table', { 'class': 'table cbi-section-table' });
		var thead = E('thead');
		var headerRow = E('tr', { 'class': 'cbi-section-table-titles' });
		[_('Backup Time'), _('Source'), _('Actions')].forEach(function(title) {
			headerRow.appendChild(E('th', { 'class': 'cbi-section-table-cell' }, title));
		});
		thead.appendChild(headerRow);
		table.appendChild(thead);

		var tbody = E('tbody');

		backups.forEach(function(backup) {
			var row = E('tr', { 'class': 'cbi-section-table-row' });
			row.appendChild(E('td', { 'class': 'cbi-section-table-cell' }, backup.timestamp || '-'));
			row.appendChild(E('td', { 'class': 'cbi-section-table-cell' }, backup.source || '-'));

			var actionsCell = E('td', { 'class': 'cbi-section-table-cell' });

			actionsCell.appendChild(E('button', {
				'class': 'btn cbi-button',
				'style': 'margin-right: 4px;',
				'click': function() {
					callDiffBackup(backup.id).then(function(result) {
						ui.showModal(_('Compare with Current'), [
							E('div', { 'class': 'nginx-manager-code-block' }, (result && result.diff) || _('No differences')),
							E('div', { 'class': 'right', 'style': 'margin-top: 8px;' }, [
								E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Close'))
							])
						]);
					});
				}
			}, _('Compare')));

			actionsCell.appendChild(E('button', {
				'class': 'btn cbi-button-negative',
				'click': function() {
					ui.showModal(_('Confirm Restore'), [
						E('p', {}, _('Are you sure you want to restore this backup? A backup of the current configuration will be created first.')),
						E('div', { 'class': 'right' }, [
							E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
							' ',
							E('button', {
								'class': 'btn cbi-button-negative',
								'click': function() {
									ui.hideModal();
									ui.showModal(_('Restoring...'), [E('p', {}, _('Please wait...'))]);
									callRestoreBackup(backup.id).then(function(result) {
										ui.hideModal();
										if (result && result.error) {
											ui.addNotification(null, E('p', {}, _('Restore failed') + ': ' + (result.detail || result.error)), 'error');
										} else {
											ui.addNotification(null, E('p', {}, _('Backup restored')), 'success');
											setTimeout(function() { location.reload(); }, 500);
										}
									});
								}
							}, _('Restore'))
						])
					]);
				}
			}, _('Restore')));

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
