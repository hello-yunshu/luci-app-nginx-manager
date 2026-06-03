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
			siteSelect.appendChild(E('option', { 'value': site.name }, site.name));
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

		btnGroup.appendChild(refreshBtn);
		btnGroup.appendChild(clearBtn);

		controlSection.appendChild(btnGroup);
		page.appendChild(controlSection);

		/* Log Output Section */
		var logSection = E('div', { 'class': 'cbi-section' });
		logSection.appendChild(E('h3', {}, _('Log Output')));

		var logOutput = E('pre', {
			'class': 'nm-log-area is-empty'
		}, _('Click "Refresh" to view logs'));

		logSection.appendChild(logOutput);
		page.appendChild(logSection);

		refreshBtn.addEventListener('click', function() {
			logOutput.textContent = _('Loading...');
			logOutput.className = 'nm-log-area is-loading';

			callGetLogs(
				typeSelect.value,
				lineSelect.value,
				filterInput.value,
				siteSelect.value
			).then(function(result) {
				if (result && result.error) {
					logOutput.textContent = result.error;
					if (result.path) {
						logOutput.textContent += '\n' + _('Path') + ': ' + result.path;
					}
					logOutput.className = 'nm-log-area is-error';
				} else if (result && result.content) {
					logOutput.textContent = result.content || _('No log entries found');
					logOutput.className = 'nm-log-area';
				} else {
					logOutput.textContent = _('No log entries found');
					logOutput.className = 'nm-log-area';
				}
			}).catch(function(err) {
				logOutput.textContent = _('Failed to load logs') + ': ' + err;
				logOutput.className = 'nm-log-area is-error';
			});
		});

		clearBtn.addEventListener('click', function() {
			logOutput.textContent = '';
			logOutput.className = 'nm-log-area is-empty';
		});

		return utils.appendFooter(page, {
			project: 'Nginx Manager',
			repoUrl: 'https://github.com/hello-yunshu/luci-app-nginx-manager'
		});
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
