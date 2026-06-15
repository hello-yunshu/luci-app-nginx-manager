'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require ui';
'require rpc';
'require nginx-manager/utils as utils';

var callStatus = rpc.declare({
	object: 'nginx_manager',
	method: 'status',
	expect: {}
});

var callTestConfig = rpc.declare({
	object: 'nginx_manager',
	method: 'test_config',
	expect: {}
});

var callReloadNginx = rpc.declare({
	object: 'nginx_manager',
	method: 'reload_nginx',
	expect: {}
});

var callRestartNginx = rpc.declare({
	object: 'nginx_manager',
	method: 'restart_nginx',
	expect: {}
});

var callStartNginx = rpc.declare({
	object: 'nginx_manager',
	method: 'start_nginx',
	expect: {}
});

var callCheckCertExpiry = rpc.declare({
	object: 'nginx_manager',
	method: 'check_cert_expiry',
	expect: {}
});

var callCheckEnv = rpc.declare({
	object: 'nginx_manager',
	method: 'check_env',
	expect: {}
});

var callGetNginxT = rpc.declare({
	object: 'nginx_manager',
	method: 'get_nginx_T',
	expect: {}
});

function safeApply(fn) {
	return fn().catch(function(err) {
		if (err.code === 5) {
			ui.addNotification(null, E('p', _('Permission denied. Make sure UCI changes are applied.')));
		} else {
			ui.addNotification(null, E('p', _('Error: ') + (err.message || JSON.stringify(err))));
		}
	});
}

function setBusy(btn) {
	btn.disabled = true;
	btn.setAttribute('data-original-title', btn.textContent);
	btn.textContent = _('Loading...');
}

function resetBusy(btn) {
	btn.disabled = false;
	btn.textContent = btn.getAttribute('data-original-title') || btn.textContent;
	btn.removeAttribute('data-original-title');
}

function reloadSoon(ms) {
	setTimeout(function() { location.reload(); }, ms || 1200);
}

return view.extend({
	load: function() {
		return callStatus();
	},

	render: function(data) {
		var status = data || {};
		var running = status.running === '1';

		var container = E('div', { 'class': 'cbi-map' });

		utils.loadSharedCSS();

		container.appendChild(E('h2', { 'class': 'cbi-map-title' }, _('Nginx Manager')));

		/* Status Banner */
		var banner = E('div', {
			'class': 'cbi-section nm-status-banner ' + (running ? 'running' : 'stopped')
		});
		banner.appendChild(E('div', {
			'class': 'nm-status-icon ' + (running ? 'running' : 'stopped')
		}, running ? '\u25CF' : '\u25CB'));
		var bannerText = E('div', { 'class': 'nm-status-text' });
		bannerText.appendChild(E('h3', { 'class': running ? 'running' : 'stopped' },
			running ? _('Nginx is running') : _('Nginx is stopped')));
		bannerText.appendChild(E('p', {},
			running ? _('Nginx service is active and serving requests.')
				: _('Nginx service is not running. Click Start or Reload to begin.')));
		banner.appendChild(bannerText);
		container.appendChild(banner);

		/* Stats Grid */
		var statsGrid = E('div', { 'class': 'nm-stats-grid' });

		var managedCount = parseInt(status.managed_sites) || 0;
		statsGrid.appendChild(E('div', { 'class': 'cbi-section nm-stat-card' }, [
			E('div', { 'class': 'nm-stat-value' + (managedCount > 0 ? ' green' : '') }, String(managedCount)),
			E('div', { 'class': 'nm-stat-label' }, _('Managed Sites'))
		]));

		var nonManagedCount = parseInt(status.non_managed_configs) || 0;
		var nonManagedNames = (status.non_managed_names || '').split(',').filter(Boolean);
		var nonManagedValueAttrs = { 'class': 'nm-stat-value' + (nonManagedCount > 0 ? ' orange' : '') };
		if (nonManagedCount > 0 && nonManagedNames.length > 0) {
			nonManagedValueAttrs['title'] = nonManagedNames.join(', ');
			nonManagedValueAttrs['style'] = 'cursor: help;';
		}
		var nonManagedChildren = [
			E('div', nonManagedValueAttrs, String(nonManagedCount)),
			E('div', { 'class': 'nm-stat-label' }, _('Non-Managed Configs'))
		];
		statsGrid.appendChild(E('div', { 'class': 'cbi-section nm-stat-card' }, nonManagedChildren));

		var sslLabel = status.ssl_module === '1' ? _('Enabled') : _('Disabled');
		var sslClass = status.ssl_module === '1' ? 'nm-stat-value green' : 'nm-stat-value orange';
		statsGrid.appendChild(E('div', { 'class': 'cbi-section nm-stat-card' }, [
			E('div', { 'class': sslClass }, sslLabel),
			E('div', { 'class': 'nm-stat-label' }, _('SSL Module'))
		]));

		var testResultRaw = (status.last_test_result || '').split('\n')[0];
		var testResult = !testResultRaw || testResultRaw === 'unknown' ? _('Unknown') : testResultRaw;
		var testClass = (!testResultRaw || testResultRaw === 'unknown') ? 'nm-stat-value' :
			(testResultRaw.indexOf('pass') === 0 ? 'nm-stat-value green' : 'nm-stat-value red');
		statsGrid.appendChild(E('div', { 'class': 'cbi-section nm-stat-card' }, [
			E('div', { 'class': testClass }, testResult),
			E('div', { 'class': 'nm-stat-label' }, _('Last Config Test'))
		]));

		container.appendChild(statsGrid);

		/* Service Control */
		var controlSection = E('div', { 'class': 'cbi-section' });
		controlSection.appendChild(E('h3', {}, _('Service Control')));

		var btnGroup = E('div', { 'class': 'nm-btn-group' });

		if (!running) {
			btnGroup.appendChild(E('button', {
				'class': 'cbi-button cbi-button-apply',
				'click': function() {
					var btn = this;
					setBusy(btn);
					return safeApply(callStartNginx).then(function() {
						resetBusy(btn);
						reloadSoon();
					});
				}
			}, '\u25B6 ' + _('Start')));
		}

		if (running) {
			btnGroup.appendChild(E('button', {
				'class': 'cbi-button cbi-button-apply',
				'click': function() {
					var btn = this;
					setBusy(btn);
					return safeApply(callReloadNginx).then(function() {
						resetBusy(btn);
						reloadSoon();
					});
				}
			}, '\u21BB ' + _('Reload')));
		}

		btnGroup.appendChild(E('button', {
			'class': 'cbi-button cbi-button-apply',
			'click': function() {
				var btn = this;
				setBusy(btn);
				return safeApply(callRestartNginx).then(function() {
					resetBusy(btn);
					reloadSoon();
				});
			}
		}, '\u21BB ' + _('Restart')));

		btnGroup.appendChild(E('button', {
			'class': 'cbi-button',
			'click': function() {
				var btn = this;
				setBusy(btn);
				return callTestConfig().then(function(result) {
					resetBusy(btn);
					var output = (result && result.output) || _('No output');
					var editor = utils.createCodeEditor(output, 'nginx.conf', { readonly: true });
					ui.showModal(_('Config Test Result'), [
						editor.container,
						E('div', { 'class': 'right' }, [
							E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('OK'))
						])
					]);
				}).catch(function(err) {
					resetBusy(btn);
					ui.addNotification(null, E('p', {}, _('Error: ') + (err.message || JSON.stringify(err))));
				});
			}
		}, _('Test Config')));

		btnGroup.appendChild(E('button', {
			'class': 'cbi-button',
			'click': function() {
				return callGetNginxT().then(function(result) {
					var content = (result && result.content) || '';
					var editor = utils.createCodeEditor(content, 'nginx.conf', { readonly: true });
					ui.showModal(_('View Full Config'), [
						editor.container,
						E('div', { 'class': 'right' }, [
							E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Close'))
						])
					]);
				});
			}
		}, _('View Full Config')));

		controlSection.appendChild(btnGroup);
		container.appendChild(controlSection);

		/* Service Information */
		var infoSection = E('div', { 'class': 'cbi-section' });
		infoSection.appendChild(E('h3', {}, _('Service Information')));

		var infoTable = E('table', { 'class': 'table nm-kv-table' });

		infoTable.appendChild(E('tr', { 'class': 'tr' }, [
			E('th', { 'class': 'th' }, _('Version')),
			E('td', { 'class': 'td' }, status.version || '-')
		]));

		infoTable.appendChild(E('tr', { 'class': 'tr' }, [
			E('th', { 'class': 'th' }, _('Listening Ports')),
			E('td', { 'class': 'td' }, status.listening_ports || '-')
		]));

		infoTable.appendChild(E('tr', { 'class': 'tr' }, [
			E('th', { 'class': 'th' }, _('Last Reload')),
			E('td', { 'class': 'td' }, status.last_reload || '-')
		]));

		infoSection.appendChild(infoTable);
		container.appendChild(infoSection);

		function renderEnvTable(envData) {
			envData = envData || {};
			while (envTable.firstChild)
				envTable.removeChild(envTable.firstChild);

			envTable.appendChild(E('tr', { 'class': 'tr' }, [
				E('th', { 'class': 'th' }, _('OpenWrt')),
				E('td', { 'class': 'td' }, envData.openwrt_version || '-')
			]));

			envTable.appendChild(E('tr', { 'class': 'tr' }, [
				E('th', { 'class': 'th' }, _('Package Manager')),
				E('td', { 'class': 'td' }, envData.package_manager || '-')
			]));

			envTable.appendChild(E('tr', { 'class': 'tr' }, [
				E('th', { 'class': 'th' }, _('Plugin Version')),
				E('td', { 'class': 'td' }, envData.version || status.version || '-')
			]));

			var depChecks = [
				{ key: 'nginx_ssl', label: 'nginx-ssl' },
				{ key: 'openssl_util', label: 'openssl-util' },
				{ key: 'acme', label: 'acme' },
				{ key: 'acme_dnsapi', label: 'acme-acmesh-dnsapi' },
				{ key: 'initd_nginx', label: 'init.d nginx' },
				{ key: 'uci_template', label: 'uci.conf.template' },
				{ key: 'nginx_quic', label: 'nginx-http_v3_module (QUIC)' }
			];

			depChecks.forEach(function(dep) {
				var hasValue = envData[dep.key] !== undefined;
				var passed = envData[dep.key] === 1 || envData[dep.key] === '1';
				var badge = E('span', {
					'class': 'nm-badge ' + (hasValue ? (passed ? 'success' : 'error') : '')
				}, hasValue ? ((passed ? '\u2714 ' : '\u2718 ') + (passed ? _('OK') : _('Missing'))) : _('Loading...'));
				envTable.appendChild(E('tr', { 'class': 'tr' }, [
					E('th', { 'class': 'th' }, dep.label),
					E('td', { 'class': 'td' }, badge)
				]));
			});
		}

		function renderCertExpiry(certExpiry) {
			while (certHost.firstChild)
				certHost.removeChild(certHost.firstChild);

			certExpiry = certExpiry || { certificates: [] };
			if (!certExpiry.certificates || !certExpiry.certificates.length)
				return;

			var expiring = certExpiry.certificates.filter(function(c) {
				return c.days_remaining !== undefined && parseInt(c.days_remaining) < 30;
			});
			if (!expiring.length)
				return;

			var certSection = E('div', { 'class': 'cbi-section' });
			certSection.appendChild(E('h3', {}, _('Certificate Expiry')));
			var certAlert = E('div', { 'class': 'alert-message warning' });
			expiring.forEach(function(cert) {
				var days = parseInt(cert.days_remaining);
				var msg = days < 0
					? cert.name + ': ' + _('Expired')
					: cert.name + ': ' + days + ' ' + _('days remaining');
				certAlert.appendChild(E('p', {}, msg));
			});
			certSection.appendChild(certAlert);
			certHost.appendChild(certSection);
		}

		/* Environment Detection */
		var envSection = E('div', { 'class': 'cbi-section' });
		envSection.appendChild(E('h3', {}, _('Environment Detection')));

		var envTable = E('table', { 'class': 'table nm-kv-table' });
		renderEnvTable({});
		envSection.appendChild(envTable);
		container.appendChild(envSection);

		/* Certificate Expiry Warning */
		var certHost = E('div', {});
		container.appendChild(certHost);
		window.setTimeout(function() {
			callCheckEnv().then(renderEnvTable).catch(function() {
				renderEnvTable({});
			});
			callCheckCertExpiry().then(renderCertExpiry).catch(function() {
				renderCertExpiry({ certificates: [] });
			});
		}, 0);

		return utils.appendFooter(container, {
			project: 'Nginx Manager',
			version: status.version || '-',
			repoUrl: 'https://github.com/hello-yunshu/luci-app-nginx-manager'
		});
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
