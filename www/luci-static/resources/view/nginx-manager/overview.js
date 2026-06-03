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

var css = `
	.nm-status-banner {
		display: flex; align-items: center; gap: 1.2em;
		padding: 1.5em; margin-bottom: 1.5em;
	}
	.nm-status-banner.running { border-left: 5px solid var(--success-color, #3aa657); }
	.nm-status-banner.stopped { border-left: 5px solid var(--danger-color, #d94b4b); }
	.nm-status-icon { font-size: 2.5em; line-height: 1; }
	.nm-status-icon.running { color: var(--success-color, #3aa657); }
	.nm-status-icon.stopped { color: var(--danger-color, #d94b4b); }
	.nm-status-text h3 { margin: 0 0 0.2em 0; font-size: 1.3em; }
	.nm-status-text h3.running { color: var(--success-color, #3aa657); }
	.nm-status-text h3.stopped { color: var(--danger-color, #d94b4b); }
	.nm-status-text p { margin: 0; color: var(--subtext-color, #666); font-size: 0.9em; }
	.nm-stats-grid {
		display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 1em; margin-bottom: 1.5em;
	}
	.nm-stat-card {
		padding: 1em 1.2em; border-radius: 8px; text-align: center;
	}
	.nm-stat-card .nm-stat-value {
		font-size: 1.8em; font-weight: bold; line-height: 1.2;
		color: var(--main-color, #0069d9);
	}
	.nm-stat-card .nm-stat-value.green { color: var(--success-color, #3aa657); }
	.nm-stat-card .nm-stat-value.red { color: var(--danger-color, #d94b4b); }
	.nm-stat-card .nm-stat-value.orange { color: var(--warning-color, #c68014); }
	.nm-stat-card .nm-stat-label {
		font-size: 0.85em; color: var(--subtext-color, #666); margin-top: 0.3em;
	}
`;

return view.extend({
	load: function() {
		return Promise.all([
			callStatus(),
			callCheckCertExpiry(),
			callCheckEnv()
		]);
	},

	render: function(data) {
		var status = data[0] || {};
		var certExpiry = data[1] || { certificates: [] };
		var envData = data[2] || {};
		var running = status.running === '1';

		var container = E('div', { 'class': 'cbi-map' });
		container.appendChild(E('style', {}, css));

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
		statsGrid.appendChild(E('div', { 'class': 'cbi-section nm-stat-card' }, [
			E('div', { 'class': 'nm-stat-value' + (nonManagedCount > 0 ? ' orange' : '') }, String(nonManagedCount)),
			E('div', { 'class': 'nm-stat-label' }, _('Non-Managed Configs'))
		]));

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
					ui.showModal(_('Config Test Result'), [
						E('pre', { 'class': 'nm-code-block' }, output),
						E('div', { 'class': 'right', 'style': 'margin-top: 8px;' }, [
							E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); reloadSoon(); } }, _('OK'))
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
					ui.showModal(_('View Full Config'), [
						E('pre', { 'class': 'nm-code-block' }, (result && result.content) || ''),
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

		var infoTable = E('table', { 'class': 'table' });

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

		/* Environment Detection */
		var envSection = E('div', { 'class': 'cbi-section' });
		envSection.appendChild(E('h3', {}, _('Environment Detection')));

		var envTable = E('table', { 'class': 'table' });

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
			E('td', { 'class': 'td' }, envData.version || '-')
		]));

		var depChecks = [
			{ key: 'nginx_ssl', label: 'nginx-ssl' },
			{ key: 'nginx_util', label: 'nginx-util' },
			{ key: 'openssl_util', label: 'openssl-util' },
			{ key: 'rpcd', label: 'rpcd' },
			{ key: 'initd_nginx', label: 'init.d nginx' },
			{ key: 'uci_template', label: 'uci.conf.template' }
		];

		depChecks.forEach(function(dep) {
			var passed = envData[dep.key] === 1 || envData[dep.key] === '1';
			var badge = E('span', { 'class': 'nm-badge ' + (passed ? 'success' : 'error') },
				(passed ? '\u2714 ' : '\u2718 ') + (passed ? _('OK') : _('Missing')));
			envTable.appendChild(E('tr', { 'class': 'tr' }, [
				E('th', { 'class': 'th' }, dep.label),
				E('td', { 'class': 'td' }, badge)
			]));
		});

		envSection.appendChild(envTable);
		container.appendChild(envSection);

		/* Certificate Expiry Warning */
		if (certExpiry.certificates && certExpiry.certificates.length > 0) {
			var expiring = certExpiry.certificates.filter(function(c) {
				return c.days_remaining !== undefined && parseInt(c.days_remaining) < 30;
			});
			if (expiring.length > 0) {
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
				container.appendChild(certSection);
			}
		}

		return utils.appendFooter(container, {
			project: 'Nginx Manager',
			version: envData.version || status.version || '-',
			repoUrl: 'https://github.com/hello-yunshu/luci-app-nginx-manager'
		});
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
