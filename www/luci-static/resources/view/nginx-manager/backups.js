'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require ui';
'require rpc';

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

		var page = E('div', { 'class': 'cbi-map' });

		page.appendChild(E('link', {
			'rel': 'stylesheet',
			'href': L.resource('nginx-manager/nginx-manager.css')
		}));

		page.appendChild(E('h2', { 'class': 'cbi-map-title' }, _('Backups')));

		var section = E('div', { 'class': 'cbi-section' });
		section.appendChild(E('h3', {}, _('Backup Management')));

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
			return page;
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
							' ',
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

			row.appendChild(actionsCell);
			tbody.appendChild(row);
		});

		table.appendChild(tbody);
		section.appendChild(table);
		page.appendChild(section);

		return page;
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
