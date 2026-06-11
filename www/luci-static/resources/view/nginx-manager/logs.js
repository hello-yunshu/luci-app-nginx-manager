'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require ui';
'require rpc';
'require nginx-manager/utils as utils';

var callGetLogs = rpc.declare({
	object: 'nginx_manager',
	method: 'get_logs',
	params: ['type', 'lines', 'filter', 'site'],
	expect: {}
});

var callClearLogs = rpc.declare({
	object: 'nginx_manager',
	method: 'clear_logs',
	params: ['type', 'site'],
	expect: {}
});

var callClearAllLogs = rpc.declare({
	object: 'nginx_manager',
	method: 'clear_all_logs',
	expect: {}
});

var callGetLogSize = rpc.declare({
	object: 'nginx_manager',
	method: 'get_log_size',
	params: ['type', 'site'],
	expect: {}
});

var callListSites = rpc.declare({
	object: 'nginx_manager',
	method: 'list_sites',
	expect: {}
});

return view.extend({
	load: function() {
		return callListSites();
	},

	render: function(data) {
		var sites = (data && data.sites) || [];

		var page = E('div', { 'class': 'cbi-map' });

		utils.loadSharedCSS();

		page.appendChild(E('h2', { 'class': 'cbi-map-title' }, _('Logs')));

		/* Log Controls Section */
		var controlSection = E('div', { 'class': 'cbi-section' });
		controlSection.appendChild(E('h3', {}, _('Log Settings')));

		var controls = E('div', { 'class': 'nm-log-controls' });

		var typeSelect = E('select', { 'class': 'cbi-input-select' }, [
			E('option', { 'value': 'error' }, _('Error Log')),
			E('option', { 'value': 'access' }, _('Access Log'))
		]);
		controls.appendChild(E('label', {}, _('Type') + ': '));
		controls.appendChild(typeSelect);

		var lineSelect = E('select', { 'class': 'cbi-input-select' }, [
			E('option', { 'value': '100' }, '100'),
			E('option', { 'value': '200', 'selected': true }, '200'),
			E('option', { 'value': '500' }, '500')
		]);
		controls.appendChild(E('label', {}, _('Line Count') + ': '));
		controls.appendChild(lineSelect);

		var siteSelect = E('select', { 'class': 'cbi-input-select' }, [
			E('option', { 'value': '' }, _('All Sites'))
		]);
		sites.forEach(function(site) {
			var label = site.name && site.name !== site.id
				? site.name + ' (' + site.id + ')'
				: (site.name || site.id);
			siteSelect.appendChild(E('option', { 'value': site.id },
				label));
		});
		controls.appendChild(E('label', {}, _('Site') + ': '));
		controls.appendChild(siteSelect);

		var filterInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'placeholder': _('Filter'),
			'style': 'max-width: 200px;'
		});
		controls.appendChild(E('label', {}, _('Filter') + ': '));
		controls.appendChild(filterInput);

		controlSection.appendChild(controls);

		/* Button Group */
		var btnGroup = E('div', { 'class': 'nm-btn-group' });

		var refreshBtn = E('button', {
			'class': 'cbi-button cbi-button-apply'
		}, '\u21BB ' + _('Refresh'));

		var clearBtn = E('button', {
			'class': 'cbi-button cbi-button-reset'
		}, '\u2716 ' + _('Clear'));

		var clearAllBtn = E('button', {
			'class': 'cbi-button cbi-button-reset'
		}, '\u2716\u2716 ' + _('Clear All'));

		var sizeLabel = E('span', { 'class': 'nm-log-size' }, '');

		btnGroup.appendChild(refreshBtn);
		btnGroup.appendChild(clearBtn);
		btnGroup.appendChild(clearAllBtn);
		btnGroup.appendChild(sizeLabel);

		controlSection.appendChild(btnGroup);
		page.appendChild(controlSection);

		/* Log Output Section */
		var logSection = E('div', { 'class': 'cbi-section' });
		logSection.appendChild(E('h3', {}, _('Log Output')));

		var logOutput = E('textarea', {
			'class': 'cbi-input-textarea nm-log-area is-loading',
			'rows': 20,
			'readonly': 'readonly'
		}, _('Loading...'));

		logSection.appendChild(logOutput);
		page.appendChild(logSection);

		var filterTimer = null;

		function setLogText(text) {
			logOutput.value = text;
			logOutput.scrollTop = logOutput.scrollHeight;
		}

		function setLoading() {
			setLogText(_('Loading...'));
			logOutput.className = 'cbi-input-textarea nm-log-area is-loading';
			refreshBtn.disabled = true;
			clearBtn.disabled = true;
			clearAllBtn.disabled = true;
		}

		function setReady() {
			refreshBtn.disabled = false;
			clearBtn.disabled = false;
			clearAllBtn.disabled = false;
		}

		function bytesToSize(bytes) {
			if (bytes === 0 || !bytes) return '0 B';
			var units = ['B', 'KB', 'MB', 'GB'];
			var i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
			return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
		}

		function updateLogSize() {
			callGetLogSize(typeSelect.value, siteSelect.value).then(function(result) {
				sizeLabel.textContent = bytesToSize((result && result.size) || 0);
			}).catch(function() {
				sizeLabel.textContent = '';
			});
		}

		function loadLogs() {
			setLoading();
			callGetLogs(
				typeSelect.value,
				lineSelect.value,
				filterInput.value,
				siteSelect.value
			).then(function(result) {
				if (result && result.error) {
					var errorText = result.error;
					if (result.path) {
						errorText += '\n' + _('Path') + ': ' + result.path;
					}
					setLogText(errorText);
					logOutput.className = 'cbi-input-textarea nm-log-area is-error';
				} else if (result && result.content) {
					setLogText(result.content || _('No log entries found'));
					logOutput.className = 'cbi-input-textarea nm-log-area';
				} else {
					setLogText(_('No log entries found'));
					logOutput.className = 'cbi-input-textarea nm-log-area';
				}
			}).catch(function(err) {
				setLogText(_('Failed to load logs') + ': ' + err);
				logOutput.className = 'cbi-input-textarea nm-log-area is-error';
			}).finally(function() {
				setReady();
				updateLogSize();
			});
		}

		function queueLoadLogs() {
			window.clearTimeout(filterTimer);
			filterTimer = window.setTimeout(loadLogs, 250);
		}

		refreshBtn.addEventListener('click', loadLogs);
		typeSelect.addEventListener('change', loadLogs);
		lineSelect.addEventListener('change', loadLogs);
		siteSelect.addEventListener('change', loadLogs);
		filterInput.addEventListener('input', queueLoadLogs);

		clearBtn.addEventListener('click', function() {
			setLogText(_('Clearing...'));
			logOutput.className = 'cbi-input-textarea nm-log-area is-loading';
			refreshBtn.disabled = true;
			clearBtn.disabled = true;

			callClearLogs(typeSelect.value, siteSelect.value).then(function(result) {
				if (result && result.error) {
					var errorText = result.error;
					if (result.path) {
						errorText += '\n' + _('Path') + ': ' + result.path;
					}
					setLogText(errorText);
					logOutput.className = 'cbi-input-textarea nm-log-area is-error';
					return;
				}

				ui.addNotification(null, E('p', {}, _('Log cleared')), 'info');
				loadLogs();
			}).catch(function(err) {
				setLogText(_('Failed to clear logs') + ': ' + err);
				logOutput.className = 'cbi-input-textarea nm-log-area is-error';
			}).finally(function() {
				setReady();
			});
		});

		clearAllBtn.addEventListener('click', function() {
			ui.showModal(_('Clear All Logs'), [
				E('p', {}, _('Are you sure you want to clear ALL access and error logs for all sites? This cannot be undone.')),
				E('div', { 'class': 'right' }, [
					E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
					E('button', {
						'class': 'cbi-button cbi-button-reset',
						'click': function() {
							ui.hideModal();
							setLoading();
							callClearAllLogs().then(function(result) {
								setReady();
								var count = (result && result.cleared) || 0;
								ui.addNotification(null, E('p', {}, _('Cleared') + ' ' + count + ' ' + _('log file(s)')), 'info');
								loadLogs();
							}).catch(function(err) {
								setReady();
								ui.addNotification(null, E('p', {}, _('Failed to clear logs') + ': ' + err), 'error');
							});
						}
					}, _('Clear All'))
				])
			]);
		});

		window.setTimeout(loadLogs, 0);

		return utils.appendFooter(page, {
			project: 'Nginx Manager',
			repoUrl: 'https://github.com/hello-yunshu/luci-app-nginx-manager'
		});
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
