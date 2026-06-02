'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require ui';
'require rpc';

var callGetLogs = rpc.declare({
	object: 'nginx_manager',
	method: 'get_logs',
	params: ['type', 'lines', 'filter', 'site'],
	expect: {}
});

var callListSites = rpc.declare({
	object: 'nginx_manager',
	method: 'list_sites',
	expect: { sites: [] }
});

return view.extend({
	load: function() {
		return callListSites();
	},

	render: function(data) {
		var sites = (data && data.sites) || [];

		var page = E('div', { 'class': 'nginx-manager-page nginx-manager-log-viewer' });

		page.appendChild(E('link', {
			'rel': 'stylesheet',
			'href': L.resource('nginx-manager/nginx-manager.css')
		}));

		page.appendChild(E('h3', {}, _('Logs')));

		var controls = E('div', { 'class': 'nginx-manager-log-controls' });

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
		controls.appendChild(E('label', { 'style': 'margin-left: 12px;' }, _('Line Count') + ': '));
		controls.appendChild(lineSelect);

		var siteSelect = E('select', { 'class': 'cbi-input-select' }, [
			E('option', { 'value': '' }, _('All Sites'))
		]);
		sites.forEach(function(site) {
			siteSelect.appendChild(E('option', { 'value': site.name }, site.name));
		});
		controls.appendChild(E('label', { 'style': 'margin-left: 12px;' }, _('Site') + ': '));
		controls.appendChild(siteSelect);

		var filterInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'placeholder': _('Filter'),
			'style': 'max-width: 200px; margin-left: 4px;'
		});
		controls.appendChild(E('label', { 'style': 'margin-left: 12px;' }, _('Filter') + ': '));
		controls.appendChild(filterInput);

		var loadBtn = E('button', {
			'class': 'btn cbi-button-action',
			'style': 'margin-left: 12px;'
		}, _('Load'));
		controls.appendChild(loadBtn);

		page.appendChild(controls);

		var logOutput = E('div', { 'class': 'nginx-manager-code-block', 'style': 'min-height: 200px;' }, _('Click "Load" to view logs'));

		loadBtn.addEventListener('click', function() {
			logOutput.textContent = _('Loading...');

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
				} else if (result && result.content) {
					logOutput.textContent = result.content || _('No log entries found');
				} else {
					logOutput.textContent = _('No log entries found');
				}
			}).catch(function(err) {
				logOutput.textContent = _('Failed to load logs') + ': ' + err;
			});
		});

		page.appendChild(logOutput);

		return page;
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
