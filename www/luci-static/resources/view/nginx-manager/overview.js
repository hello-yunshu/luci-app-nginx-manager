'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require ui';
'require rpc';

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

var callCheckCertExpiry = rpc.declare({
	object: 'nginx_manager',
	method: 'check_cert_expiry',
	expect: { certificates: [] }
});

var callCheckEnv = rpc.declare({
	object: 'nginx_manager',
	method: 'check_env',
	expect: {}
});

function createCard(title, value, statusClass) {
	var card = E('div', { 'class': 'nginx-manager-card' });
	card.appendChild(E('div', { 'class': 'nginx-manager-card-title' }, title));
	var valEl = E('div', { 'class': 'nginx-manager-card-value' });
	if (statusClass) {
		valEl.appendChild(E('span', { 'class': 'nginx-manager-status ' + statusClass }, value));
	} else {
		valEl.textContent = value;
	}
	card.appendChild(valEl);
	return card;
}

function statusClassForRunning(running) {
	return running === '1' ? 'nginx-manager-status-success' : 'nginx-manager-status-error';
}

function statusTextForRunning(running) {
	return running === '1' ? _('Running') : _('Stopped');
}

function statusClassForTest(result) {
	if (!result || result === 'unknown') return 'nginx-manager-status-disabled';
	return result.startsWith('pass') ? 'nginx-manager-status-success' : 'nginx-manager-status-error';
}

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
	btn.dataset.origText = btn.textContent;
	btn.textContent = '...';
}

function resetBusy(btn) {
	btn.disabled = false;
	btn.textContent = btn.dataset.origText || btn.textContent;
}

function reloadSoon(ms) {
	setTimeout(function() { location.reload(); }, ms || 1500);
}

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

		var page = E('div', { 'class': 'nginx-manager-page' });

		page.appendChild(E('link', {
			'rel': 'stylesheet',
			'href': L.resource('nginx-manager/nginx-manager.css')
		}));

		var overview = E('div', { 'class': 'nginx-manager-overview' });

		overview.appendChild(createCard(
			_('Nginx Status'),
			statusTextForRunning(status.running),
			statusClassForRunning(status.running)
		));

		overview.appendChild(createCard(
			_('Version'),
			status.version || '-'
		));

		overview.appendChild(createCard(
			_('SSL Module'),
			status.ssl_module === '1' ? _('Enabled') : _('Disabled'),
			status.ssl_module === '1' ? 'nginx-manager-status-success' : 'nginx-manager-status-warning'
		));

		overview.appendChild(createCard(
			_('Listening Ports'),
			status.listening_ports || '-'
		));

		overview.appendChild(createCard(
			_('Managed Sites'),
			status.managed_sites || '0'
		));

		overview.appendChild(createCard(
			_('Non-Managed Configs'),
			status.non_managed_configs || '0'
		));

		overview.appendChild(createCard(
			_('Last Config Test'),
			(status.last_test_result || 'unknown').split('\n')[0],
			statusClassForTest(status.last_test_result)
		));

		overview.appendChild(createCard(
			_('Last Reload'),
			status.last_reload || '-'
		));

		page.appendChild(overview);

		var envSection = E('div', { 'class': 'nm-env-section' });
		envSection.appendChild(E('h3', {}, _('Environment Detection')));

		var envMeta = E('div', { 'class': 'nm-env-meta' });
		envMeta.appendChild(E('div', { 'class': 'nm-env-meta-item' },
			_('OpenWrt') + ': ' + E('span', {}, envData.openwrt_version || '-').outerHTML));
		envMeta.appendChild(E('div', { 'class': 'nm-env-meta-item' },
			_('Package Manager') + ': ' + E('span', {}, envData.package_manager || '-').outerHTML));
		envMeta.appendChild(E('div', { 'class': 'nm-env-meta-item' },
			_('Plugin Version') + ': ' + E('span', {}, envData.version || '-').outerHTML));
		envSection.appendChild(envMeta);

		var depChecks = [
			{ key: 'nginx_ssl', label: 'nginx-ssl' },
			{ key: 'nginx_util', label: 'nginx-util' },
			{ key: 'openssl_util', label: 'openssl-util' },
			{ key: 'rpcd', label: 'rpcd' },
			{ key: 'initd_nginx', label: 'init.d nginx' },
			{ key: 'uci_template', label: 'uci.conf.template' }
		];

		var envGrid = E('div', { 'class': 'nm-env-grid' });
		depChecks.forEach(function(dep) {
			var passed = envData[dep.key] === 1 || envData[dep.key] === '1';
			var iconClass = passed ? 'pass' : 'fail';
			var iconText = passed ? '\u2713' : '\u2717';
			var item = E('div', { 'class': 'nm-env-item' });
			item.appendChild(E('span', { 'class': 'nm-env-icon ' + iconClass }, iconText));
			item.appendChild(E('span', { 'class': 'nm-env-label' }, dep.label));
			envGrid.appendChild(item);
		});
		envSection.appendChild(envGrid);

		page.appendChild(envSection);

		if (certExpiry.certificates && certExpiry.certificates.length > 0) {
			var expiring = certExpiry.certificates.filter(function(c) {
				return c.days_remaining !== undefined && parseInt(c.days_remaining) < 30;
			});
			if (expiring.length > 0) {
				var warnings = E('div', { 'class': 'nginx-manager-danger-zone' });
				warnings.appendChild(E('h3', {}, _('Certificate Expiry')));
				expiring.forEach(function(cert) {
					var days = parseInt(cert.days_remaining);
					var msg = cert.name + ': ' + days + ' ' + _('days remaining');
					if (days < 0) {
						msg = cert.name + ': ' + _('Expired');
					}
					warnings.appendChild(E('p', {}, msg));
				});
				page.appendChild(warnings);
			}
		}

		var actions = E('div', { 'class': 'nginx-manager-actions' });

		actions.appendChild(E('button', {
			'class': 'btn cbi-button-action',
			'click': ui.createHandlerFn(this, function() {
				setBusy(this);
				return safeApply(callReloadNginx).then(function() {
					resetBusy(this);
					reloadSoon();
				}.bind(this));
			})
		}, _('Reload')));

		actions.appendChild(E('button', {
			'class': 'btn cbi-button-action',
			'click': ui.createHandlerFn(this, function() {
				setBusy(this);
				return safeApply(callRestartNginx).then(function() {
					resetBusy(this);
					reloadSoon();
				}.bind(this));
			})
		}, _('Restart')));

		actions.appendChild(E('button', {
			'class': 'btn cbi-button',
			'click': ui.createHandlerFn(this, function() {
				setBusy(this);
				return safeApply(callTestConfig).then(function() {
					resetBusy(this);
					reloadSoon();
				}.bind(this));
			})
		}, _('Test Config')));

		actions.appendChild(E('button', {
			'class': 'btn cbi-button',
			'click': ui.createHandlerFn(this, function() {
				return rpc.declare({
					object: 'nginx_manager',
					method: 'get_nginx_T',
					expect: {}
				})().then(function(result) {
					ui.showModal(_('View Full Config'), [
						E('div', { 'class': 'nginx-manager-code-block' }, (result && result.content) || ''),
						E('div', { 'class': 'right' }, [
							E('button', {
								'class': 'btn',
								'click': ui.createHandlerFn(this, function() { ui.hideModal(); })
							}, _('Close'))
						])
					]);
				});
			})
		}, _('View Full Config')));

		page.appendChild(actions);

		return page;
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
