'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require ui';
'require rpc';
'require nginx-manager/utils as utils';

var callListBackups = rpc.declare({
	object: 'nginx_manager',
	method: 'list_backups',
	expect: {}
});

var callCreateBackup = rpc.declare({
	object: 'nginx_manager',
	method: 'create_backup',
	expect: {}
});

var callSetBackupSettings = rpc.declare({
	object: 'nginx_manager',
	method: 'set_backup_settings',
	params: ['max_backups'],
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

var callDeleteBackup = rpc.declare({
	object: 'nginx_manager',
	method: 'delete_backup',
	params: ['id'],
	expect: {}
});

return view.extend({
	load: function() {
		return callListBackups();
	},

	render: function(data) {
		var backups = (data && data.backups) || [];
		var maxBackups = (data && data.max_backups) || '5';

		var page = E('div', { 'class': 'cbi-map' });

		utils.loadSharedCSS();

		page.appendChild(E('h2', { 'class': 'cbi-map-title' }, _('Backups')));

		var section = E('div', { 'class': 'cbi-section' });
		section.appendChild(E('h3', {}, _('Backup Management')));

		var settingsRow = E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title', 'for': 'backup-max-backups' }, _('Maximum Backups')),
			E('div', { 'class': 'cbi-value-field' }, [
				E('input', {
					'id': 'backup-max-backups',
					'type': 'number',
					'class': 'cbi-input-text',
					'min': '1',
					'max': '100',
					'value': maxBackups,
					'style': 'width: 6em;'
				}),
				E('button', {
					'class': 'cbi-button cbi-button-apply',
					'style': 'margin-left: 8px;',
					'click': function() {
						var input = document.getElementById('backup-max-backups');
						var value = input ? input.value.trim() : '';

						if (!/^[0-9]+$/.test(value) || +value < 1 || +value > 100) {
							ui.addNotification(null, E('p', {}, _('Maximum backups must be between 1 and 100')), 'error');
							return;
						}

						callSetBackupSettings(value).then(function(result) {
							if (result && result.error) {
								ui.addNotification(null, E('p', {}, result.error), 'error');
							} else {
								ui.addNotification(null, E('p', {}, _('Backup settings saved')), 'info');
								setTimeout(function() { location.reload(); }, 500);
							}
						});
					}
				}, _('Save'))
			])
		]);

		section.appendChild(settingsRow);

		var createBtn = E('button', {
			'class': 'cbi-button cbi-button-apply',
			'style': 'margin-bottom: 12px;',
			'click': function() {
				callCreateBackup().then(function(result) {
					if (result && result.error) {
						ui.addNotification(null, E('p', {}, result.error), 'error');
					} else {
						ui.addNotification(null, E('p', {}, _('Backup created')), 'info');
						setTimeout(function() { location.reload(); }, 500);
					}
				});
			}
		}, '\u271A ' + _('Create Backup'));

		section.appendChild(createBtn);

		if (backups.length === 0) {
			section.appendChild(E('div', { 'class': 'nm-empty-state' },
				_('No backups available.')));
			page.appendChild(section);
			return utils.appendFooter(page, {
			project: 'Nginx Manager',
			repoUrl: 'https://github.com/hello-yunshu/luci-app-nginx-manager'
		});
		}

		var table = E('table', { 'class': 'table' });
		var thead = E('thead');
		var headerRow = E('tr');
		[_('Backup Time'), _('Source'), _('Actions')].forEach(function(title) {
			headerRow.appendChild(E('th', {}, title));
		});
		thead.appendChild(headerRow);
		table.appendChild(thead);

		var tbody = E('tbody');

		backups.forEach(function(backup) {
			var row = E('tr');
			row.appendChild(E('td', {}, backup.timestamp || '-'));
			row.appendChild(E('td', {}, backup.source || '-'));

			var actionsCell = E('td', { 'class': 'nm-actions' });

			actionsCell.appendChild(E('button', {
				'class': 'cbi-button',
				'click': function() {
					callDiffBackup(backup.id).then(function(result) {
						ui.showModal(_('Compare with Current'), [
							E('pre', { 'class': 'nm-code-block' }, (result && result.diff) || _('No differences')),
							E('div', { 'class': 'right', 'style': 'margin-top: 8px;' }, [
								E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Close'))
							])
						]);
					});
				}
			}, _('Compare')));

			actionsCell.appendChild(E('button', {
				'class': 'cbi-button cbi-button-apply',
				'click': function() {
					ui.showModal(_('Confirm Restore'), [
						E('div', { 'class': 'alert-message warning' },
							_('Are you sure you want to restore this backup? A backup of the current configuration will be created first.')),
						E('div', { 'class': 'right' }, [
							E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
							E('button', {
								'class': 'cbi-button cbi-button-apply',
								'click': function() {
									ui.hideModal();
									ui.showModal(_('Restoring...'), [E('p', {}, _('Please wait...'))]);
									callRestoreBackup(backup.id).then(function(result) {
										ui.hideModal();
										if (result && result.error) {
											ui.addNotification(null, E('p', {}, _('Restore failed') + ': ' + (result.detail || result.error)), 'error');
										} else {
											ui.addNotification(null, E('p', {}, _('Backup restored')), 'info');
											setTimeout(function() { location.reload(); }, 500);
										}
									});
								}
							}, '\u21A9 ' + _('Restore'))
					])
				]);
			}
		}, '\u21A9 ' + _('Restore')));

			actionsCell.appendChild(E('button', {
				'class': 'cbi-button cbi-button-reset',
				'click': function() {
					ui.showModal(_('Confirm Delete'), [
						E('p', {}, _('Are you sure you want to delete this backup?')),
						E('div', { 'class': 'right' }, [
							E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
							E('button', {
								'class': 'cbi-button cbi-button-reset',
								'click': function() {
									ui.hideModal();
									callDeleteBackup(backup.id).then(function(result) {
										if (result && result.error) {
											ui.addNotification(null, E('p', {}, result.error), 'error');
										} else {
											ui.addNotification(null, E('p', {}, _('Backup deleted')), 'info');
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
		section.appendChild(table);
		page.appendChild(section);

		return utils.appendFooter(page, {
			project: 'Nginx Manager',
			repoUrl: 'https://github.com/hello-yunshu/luci-app-nginx-manager'
		});
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
