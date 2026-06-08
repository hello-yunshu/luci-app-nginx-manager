'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require ui';
'require rpc';
'require nginx-manager/utils as utils';

var DNS_API_INFO = {
	'dns_cf':  { name: 'Cloudflare',       keys: [
		{ key: 'CF_Token', desc: _('API Token from Cloudflare dashboard > My Profile > API Tokens') },
		{ key: 'CF_Account_ID', desc: _('Cloudflare Account ID (optional, needed for some tokens)'), optional: true },
		{ key: 'CF_Zone_ID', desc: _('Cloudflare Zone ID (optional, needed for some tokens)'), optional: true }
	] },
	'dns_dp':  { name: 'DNSPod / Tencent', keys: [
		{ key: 'DP_Id', desc: _('DNSPod API ID from console.dnspod.cn') },
		{ key: 'DP_Key', desc: _('DNSPod API Token from console.dnspod.cn') }
	] },
	'dns_ali': { name: 'Alibaba Cloud',    keys: [
		{ key: 'Ali_Key', desc: _('AccessKey ID from Alibaba Cloud RAM console') },
		{ key: 'Ali_Secret', desc: _('AccessKey Secret from Alibaba Cloud RAM console') }
	] },
	'dns_huaweicloud': { name: 'Huawei Cloud', keys: [
		{ key: 'HUAWEICLOUD_Username', desc: _('IAM username from Huawei Cloud console > My Credentials') },
		{ key: 'HUAWEICLOUD_Password', desc: _('Password for the IAM user') },
		{ key: 'HUAWEICLOUD_DomainName', desc: _('Account name from Huawei Cloud console > My Credentials') }
	] },
	'dns_aws': { name: 'AWS Route53',      keys: [
		{ key: 'AWS_ACCESS_KEY_ID', desc: _('AWS IAM Access Key ID with Route53 permissions') },
		{ key: 'AWS_SECRET_ACCESS_KEY', desc: _('AWS IAM Secret Access Key') }
	] },
	'dns_gd':  { name: 'GoDaddy',          keys: [
		{ key: 'GD_Key', desc: _('API Key from developer.godaddy.com (Production key)') },
		{ key: 'GD_Secret', desc: _('API Secret from developer.godaddy.com') }
	] },
	'dns_namecheap': { name: 'Namecheap',  keys: [
		{ key: 'NAMECHEAP_USERNAME', desc: _('Namecheap account username') },
		{ key: 'NAMECHEAP_API_KEY', desc: _('API Key from Namecheap dashboard > Profile > Tools') },
		{ key: 'NAMECHEAP_SOURCEIP', desc: _('Whitelisted IP address for API access') }
	] }
};

var callListCerts = rpc.declare({
	object: 'nginx_manager',
	method: 'list_certs',
	expect: {}
});

var callDeleteCert = rpc.declare({
	object: 'nginx_manager',
	method: 'delete_cert',
	params: ['id'],
	expect: {}
});

var callIssueSelfSigned = rpc.declare({
	object: 'nginx_manager',
	method: 'issue_self_signed',
	params: ['id', 'name', 'domain'],
	expect: {}
});

var callAcmeIssue = rpc.declare({
	object: 'nginx_manager',
	method: 'acme_issue',
	params: ['id', 'domain', 'account_email', 'validation_method', 'dns_api', 'credentials', 'dns_wait', 'auto_renew'],
	expect: {}
});

var callAcmeUpdate = rpc.declare({
	object: 'nginx_manager',
	method: 'acme_update',
	params: ['id', 'domain', 'account_email', 'validation_method', 'dns_api', 'credentials', 'dns_wait', 'auto_renew'],
	expect: {}
});

var callAcmeRenew = rpc.declare({
	object: 'nginx_manager',
	method: 'acme_renew',
	params: ['id', 'disable_auto_renew'],
	expect: {}
});

var callSetCertAutoRenew = rpc.declare({
	object: 'nginx_manager',
	method: 'set_cert_auto_renew',
	params: ['id', 'enabled'],
	expect: {}
});

var callAcmeStatus = rpc.declare({
	object: 'nginx_manager',
	method: 'acme_status',
	params: ['task_id'],
	expect: {}
});

var callUploadCert = rpc.declare({
	object: 'nginx_manager',
	method: 'upload_cert',
	expect: {}
});

var ACME_POLL_INTERVAL = 3000;

function certStatusLabel(status) {
	switch (status) {
		case 'valid': return _('Valid');
		case 'expiring': return _('Expiring Soon');
		case 'expired': return _('Expired');
		case 'missing': return _('File Missing');
		case 'acme_running': return _('Generating...');
		case 'acme_failed': return _('Failed');
		default: return status || '-';
	}
}

function certStatusClass(status) {
	switch (status) {
		case 'valid': return 'nm-badge success';
		case 'expiring': return 'nm-badge warning';
		case 'expired': return 'nm-badge error';
		case 'missing': return 'nm-badge error';
		case 'acme_running': return 'cbi-button cbi-button-apply';
		case 'acme_failed': return 'cbi-button cbi-button-reset';
		default: return 'nm-badge disabled';
	}
}

function isAcmeTaskStatus(status) {
	return status === 'acme_running' || status === 'acme_failed';
}

function certTypeLabel(type) {
	switch (type) {
		case 'manual': return _('Manual');
		case 'self_signed': return _('Self-Signed Certificate');
		case 'acme': return _('Auto (ACME)');
		default: return type || '-';
	}
}

function acmeModeLabel(cert) {
	if (!cert || cert.type !== 'acme')
		return certTypeLabel(cert && cert.type);
	if (cert.validation_method === 'dns')
		return _('Auto (ACME DNS-01)');
	if (cert.validation_method === 'standalone')
		return _('Auto (ACME Standalone)');
	return _('Auto (ACME HTTP-01)');
}

function showAcmeTaskModal(cert) {
	var statusNode = E('span', { 'class': certStatusClass(cert.status) }, certStatusLabel(cert.status));
	var commandNode = E('pre', { 'class': 'nm-code-block' }, _('Loading...'));
	var detailNode = E('pre', { 'class': 'nm-code-block' }, '');
	var logNode = E('pre', { 'class': 'nm-log-area is-loading' }, '');
	var modalOpen = true;

	function update(result) {
		var status = (result && result.status) || cert.acme_status || 'unknown';
		var displayStatus = status === 'running' ? 'acme_running'
			: status === 'failed' ? 'acme_failed'
			: status === 'success' ? 'valid'
			: status;
		statusNode.className = certStatusClass(displayStatus);
		statusNode.textContent = certStatusLabel(displayStatus);
		commandNode.textContent = (result && result.command) || '/etc/init.d/acme renew';

		var detail = (result && result.detail) || '';
		if (detail) {
			detailNode.textContent = detail;
		} else {
			detailNode.textContent = _('No output yet.');
		}

		var log = (result && result.log) || '';
		if (log && log.trim()) {
			logNode.className = 'nm-log-area';
			logNode.textContent = log;
			logNode.scrollTop = logNode.scrollHeight;
		} else {
			logNode.className = 'nm-log-area is-empty';
			logNode.textContent = _('No ACME log entries yet.');
		}

		if (modalOpen && status === 'running')
			setTimeout(refresh, ACME_POLL_INTERVAL);
	}

	function refresh() {
		callAcmeStatus(cert.id).then(update).catch(function(err) {
			logNode.className = 'nm-log-area is-error';
			logNode.textContent = String(err);
		});
	}

	ui.showModal(_('ACME Task'), [
		E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, _('Status')),
			E('div', { 'class': 'cbi-value-field' }, statusNode)
		]),
		E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, _('Command')),
			E('div', { 'class': 'cbi-value-field' }, commandNode)
		]),
		E('div', { 'class': 'cbi-value nm-value-full' }, [
			E('label', { 'class': 'cbi-value-title' }, _('Output')),
			E('div', { 'class': 'cbi-value-field' }, detailNode)
		]),
		E('div', { 'class': 'cbi-value nm-value-full' }, [
			E('label', { 'class': 'cbi-value-title' }, _('Recent ACME Log')),
			E('div', { 'class': 'cbi-value-field' }, logNode)
		]),
		E('div', { 'class': 'right' }, [
			E('button', { 'class': 'btn', 'click': refresh }, _('Refresh')),
			E('button', {
				'class': 'btn',
				'click': function() {
					modalOpen = false;
					ui.hideModal();
					location.reload();
				}
			}, _('Close'))
		])
	]);

	refresh();
}

function showCertStatusModal(cert) {
	if (cert.type === 'acme' && isAcmeTaskStatus(cert.status)) {
		showAcmeTaskModal(cert);
		return;
	}

	var infoItems = [
		E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, _('Certificate Name')),
			E('div', { 'class': 'cbi-value-field' }, cert.name || cert.id)
		]),
		E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, _('Type')),
			E('div', { 'class': 'cbi-value-field' }, certTypeLabel(cert.type))
		])
	];

	if (cert.domain) {
		infoItems.push(E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, _('Domain')),
			E('div', { 'class': 'cbi-value-field' }, cert.domain)
		]));
	}

	infoItems.push(E('div', { 'class': 'cbi-value' }, [
		E('label', { 'class': 'cbi-value-title' }, _('Status')),
		E('div', { 'class': 'cbi-value-field' }, E('span', { 'class': certStatusClass(cert.status) }, certStatusLabel(cert.status)))
	]));

	var statusMsg = '';
	if (cert.status === 'valid') {
		statusMsg = _('Certificate is valid and active.');
	} else if (cert.status === 'expiring') {
		statusMsg = _('Certificate is expiring soon. Consider renewing it.');
	} else if (cert.status === 'expired') {
		statusMsg = _('Certificate has expired. Please renew or replace it.');
	} else if (cert.status === 'missing') {
		statusMsg = _('Certificate file is missing. The certificate may have been issued but the file link is broken. Try regenerating.');
	}

	if (statusMsg) {
		infoItems.push(E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, _('Details')),
			E('div', { 'class': 'cbi-value-field' }, statusMsg)
		]));
	}

	var buttons = [
		E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Close'))
	];

	if (cert.type === 'acme' && (cert.status === 'expired' || cert.status === 'expiring' || cert.status === 'missing')) {
		buttons.unshift(E('button', {
			'class': 'cbi-button cbi-button-apply',
			'click': function() {
				ui.hideModal();
				requestAcmeRenew(cert);
			}
		}, '\u21BB ' + _('Regenerate')));
	}

	infoItems.push(E('div', { 'class': 'right' }, buttons));

	ui.showModal(_('Certificate Status'), infoItems);
}

function requestAcmeRenew(cert) {
	var disableAutoRenew = cert.auto_renew === '1';

	function startRenew() {
		ui.showModal(_('Renewing...'), [E('p', {}, _('Please wait, ACME renewal may take a while...'))]);
		callAcmeRenew(cert.id, disableAutoRenew ? '1' : '0').then(function(result) {
			ui.hideModal();
			if (result && result.error) {
				var errMsg = _(result.error);
				if (result.detail) errMsg += ': ' + result.detail;
				ui.addNotification(null, E('p', {}, _('Failed to renew ACME certificate') + ': ' + errMsg), 'error');
				return;
			}
			ui.addNotification(null, E('p', {}, _('ACME certificate requested')), 'info');
			setTimeout(function() { location.reload(); }, 500);
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, _('Failed to renew ACME certificate') + ': ' + err), 'error');
		});
	}

	if (!disableAutoRenew) {
		startRenew();
		return;
	}

	ui.showModal(_('Manual Renewal'), [
		E('p', {}, _('This certificate is configured for automatic renewal. If you renew it manually now, automatic renewal will be disabled for this certificate. You can enable it again with Edit later.')),
		E('div', { 'class': 'right' }, [
			E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
			E('button', {
				'class': 'cbi-button cbi-button-apply',
				'click': function() {
					ui.hideModal();
					startRenew();
				}
			}, _('Continue'))
		])
	]);
}

function setCertAutoRenew(cert, enabled) {
	callSetCertAutoRenew(cert.id, enabled ? '1' : '0').then(function(result) {
		if (result && result.error) {
			ui.addNotification(null, E('p', {}, _(result.error)), 'error');
			return;
		}
		ui.addNotification(null, E('p', {}, enabled ? _('Automatic renewal enabled') : _('Automatic renewal disabled')), 'info');
		setTimeout(function() { location.reload(); }, 500);
	}).catch(function(err) {
		ui.addNotification(null, E('p', {}, _('Failed to update automatic renewal') + ': ' + err), 'error');
	});
}

function showEditCertModal(cert) {
	var domainInput = E('input', { 'type': 'text', 'class': 'cbi-input-text' });
	domainInput.value = cert.domain || '';

	var accountEmailInput = E('input', {
		'type': 'email',
		'class': 'cbi-input-text',
		'placeholder': 'admin@your-domain.com'
	});
	accountEmailInput.value = cert.account_email || '';

	var autoRenewInput = E('input', { 'type': 'checkbox', 'class': 'cbi-input-checkbox' });
	autoRenewInput.checked = cert.auto_renew === '1';

	var methodSelect = E('select', { 'class': 'cbi-input-select' }, [
		E('option', { 'value': 'webroot' }, _('HTTP-01 Webroot')),
		E('option', { 'value': 'dns' }, _('DNS-01')),
		E('option', { 'value': 'standalone' }, _('HTTP-01 Standalone'))
	]);
	methodSelect.value = cert.validation_method || 'webroot';

	var dnsApiSelectOptions = [E('option', { 'value': '' }, _('-- Please choose --'))];
	var dnsApiKeys = Object.keys(DNS_API_INFO);
	for (var k = 0; k < dnsApiKeys.length; k++) {
		var apiId = dnsApiKeys[k];
		dnsApiSelectOptions.push(E('option', { 'value': apiId }, apiId + ' (' + DNS_API_INFO[apiId].name + ')'));
	}
	dnsApiSelectOptions.push(E('option', { 'value': '_custom' }, _('Custom...')));
	var dnsApiSelect = E('select', { 'class': 'cbi-input-select' }, dnsApiSelectOptions);
	if (cert.dns_api && DNS_API_INFO[cert.dns_api]) {
		dnsApiSelect.value = cert.dns_api;
	} else if (cert.dns_api) {
		dnsApiSelect.value = '_custom';
	}

	var dnsApiCustomInput = E('input', {
		'type': 'text',
		'class': 'cbi-input-text',
		'placeholder': 'dns_xx'
	});
	if (cert.dns_api && !DNS_API_INFO[cert.dns_api]) {
		dnsApiCustomInput.value = cert.dns_api;
	}

	var dnsCredsContainer = E('div');
	var dnsCredentialsInput = E('textarea', {
		'class': 'cbi-input-textarea nm-modal-textarea',
		'rows': 5,
		'placeholder': 'KEY=VALUE\nKEY2=VALUE2'
	});
	var dnsWaitInput = E('input', {
		'type': 'number',
		'class': 'cbi-input-text',
		'min': '0',
		'placeholder': '120'
	});
	dnsWaitInput.value = cert.dns_wait || '';

	var customRow = E('div', { 'class': 'cbi-value', 'id': 'edit-dns-api-custom-row', 'style': 'display:none' }, [
		E('label', { 'class': 'cbi-value-title' }, _('Custom DNS API Name')),
		E('div', { 'class': 'cbi-value-field' }, [
			dnsApiCustomInput,
			E('div', { 'class': 'cbi-value-description' }, _('acme.sh DNS API script name, e.g. dns_myapi'))
		])
	]);

	var credsRow = E('div', { 'class': 'cbi-value', 'id': 'edit-dns-creds-row', 'style': 'display:none' }, [
		E('label', { 'class': 'cbi-value-title' }, _('DNS Credentials')),
		E('div', { 'class': 'cbi-value-field' }, [
			dnsCredsContainer,
			dnsCredentialsInput,
			E('div', { 'class': 'cbi-value-description', 'id': 'edit-dns-creds-desc', 'style': 'display:none' }, _('One credential per line in KEY=VALUE format')),
			E('div', { 'class': 'cbi-value-description' }, _('Leave empty to keep existing credentials.'))
		])
	]);

	function updateDnsCredsFields() {
		var apiId = dnsApiSelect.value;
		var info = DNS_API_INFO[apiId];
		var isDns = methodSelect.value === 'dns';
		dnsCredsContainer.innerHTML = '';
		dnsCredentialsInput.style.display = 'none';

		if (!isDns) {
			customRow.style.display = 'none';
			credsRow.style.display = 'none';
			dnsApiCustomInput.style.display = 'none';
			return;
		}

		credsRow.style.display = '';

		if (apiId === '_custom') {
			dnsApiCustomInput.style.display = '';
			customRow.style.display = '';
			dnsCredentialsInput.style.display = '';
			document.getElementById('edit-dns-creds-desc').style.display = '';
		} else if (info) {
			dnsApiCustomInput.style.display = 'none';
			customRow.style.display = 'none';
			document.getElementById('edit-dns-creds-desc').style.display = 'none';
			for (var i = 0; i < info.keys.length; i++) {
				var keyInfo = info.keys[i];
				var row = E('div', { 'class': 'nm-cred-field' }, [
					E('label', { 'class': 'nm-cred-label' }, keyInfo.key + (keyInfo.optional ? ' (' + _('Optional') + ')' : '')),
					E('input', { 'type': 'text', 'class': 'cbi-input-text', 'data-cred-key': keyInfo.key, 'placeholder': keyInfo.key + '=...' }),
					keyInfo.desc ? E('div', { 'class': 'cbi-value-description' }, keyInfo.desc) : null
				]);
				dnsCredsContainer.appendChild(row);
			}
		} else {
			dnsApiCustomInput.style.display = 'none';
			customRow.style.display = 'none';
			document.getElementById('edit-dns-creds-desc').style.display = 'none';
		}
	}

	function updateMethodRows() {
		var isDns = methodSelect.value === 'dns';
		var dnsBasicRows = document.querySelectorAll('.edit-dns-row');
		for (var i = 0; i < dnsBasicRows.length; i++)
			dnsBasicRows[i].style.display = isDns ? '' : 'none';
		updateDnsCredsFields();
	}

	methodSelect.addEventListener('change', updateMethodRows);
	dnsApiSelect.addEventListener('change', updateDnsCredsFields);

	var reissueNote = E('div', { 'class': 'cbi-value-description', 'style': 'display:none; color: #c44; font-weight: bold' },
		_('Changing domain, validation method, or DNS provider requires re-issuing the certificate.'));

	function checkReissueNeeded() {
		var domainChanged = domainInput.value.trim() !== (cert.domain || '');
		var methodChanged = methodSelect.value !== (cert.validation_method || 'webroot');
		var newDnsApi = dnsApiSelect.value === '_custom' ? dnsApiCustomInput.value.trim() : dnsApiSelect.value;
		var dnsApiChanged = methodSelect.value === 'dns' && newDnsApi !== (cert.dns_api || '');
		reissueNote.style.display = (domainChanged || methodChanged || dnsApiChanged) ? '' : 'none';
	}

	domainInput.addEventListener('input', checkReissueNeeded);
	methodSelect.addEventListener('change', checkReissueNeeded);
	dnsApiSelect.addEventListener('change', checkReissueNeeded);
	dnsApiCustomInput.addEventListener('input', checkReissueNeeded);

	ui.showModal(_('Edit Certificate'), [
		E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, _('Certificate Name')),
			E('div', { 'class': 'cbi-value-field' }, cert.name || cert.id)
		]),
		E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, _('Domain')),
			E('div', { 'class': 'cbi-value-field' }, domainInput)
		]),
		E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, _('ACME Account Email')),
			E('div', { 'class': 'cbi-value-field' }, [
				accountEmailInput,
				E('div', { 'class': 'cbi-value-description' }, _('A real email address is required for ACME account registration.'))
			])
		]),
		E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, _('ACME Validation')),
			E('div', { 'class': 'cbi-value-field' }, methodSelect)
		]),
		E('div', { 'class': 'cbi-value edit-dns-row', 'style': 'display:none' }, [
			E('label', { 'class': 'cbi-value-title' }, _('DNS Provider')),
			E('div', { 'class': 'cbi-value-field' }, dnsApiSelect)
		]),
		customRow,
		credsRow,
		E('div', { 'class': 'cbi-value edit-dns-row', 'style': 'display:none' }, [
			E('label', { 'class': 'cbi-value-title' }, _('DNS Wait Seconds')),
			E('div', { 'class': 'cbi-value-field' }, [
				dnsWaitInput,
				E('div', { 'class': 'cbi-value-description' }, _('Seconds to wait for DNS propagation before validation.'))
			])
		]),
		E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, _('Automatic Renewal')),
			E('div', { 'class': 'cbi-value-field' }, [
				E('label', {}, [
					autoRenewInput,
					' ',
					_('Enable automatic renewal')
				])
			])
		]),
		reissueNote,
		E('div', { 'class': 'right' }, [
			E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
			E('button', {
				'class': 'cbi-button cbi-button-apply',
				'click': function() {
					var newDomain = domainInput.value.trim();
					var newEmail = accountEmailInput.value.trim();
					var newMethod = methodSelect.value;
					var newDnsApi, newCredentials, newDnsWait;

					if (newMethod === 'dns') {
						newDnsApi = dnsApiSelect.value === '_custom' ? dnsApiCustomInput.value.trim() : dnsApiSelect.value;
						var credInputs = dnsCredsContainer.querySelectorAll('input[data-cred-key]');
						if (credInputs.length > 0) {
							var lines = [];
							for (var ci = 0; ci < credInputs.length; ci++) {
								var cVal = credInputs[ci].value.trim();
								if (cVal) lines.push(credInputs[ci].getAttribute('data-cred-key') + '=' + cVal);
							}
							newCredentials = lines.join('\n');
						} else {
							newCredentials = dnsCredentialsInput.value.trim();
						}
					}
					newDnsWait = dnsWaitInput.value.trim();

					if (!newDomain) {
						ui.addNotification(null, E('p', {}, _('Domain is required')), 'error');
						return;
					}
					if (!newEmail) {
						ui.addNotification(null, E('p', {}, _('ACME account email is required')), 'error');
						return;
					}
					if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(newEmail) || /@(example\.(com|net|org)|localhost)$/i.test(newEmail)) {
						ui.addNotification(null, E('p', {}, _('Invalid ACME account email')), 'error');
						return;
					}
					if (newMethod === 'dns') {
						if (!newDnsApi) {
							ui.addNotification(null, E('p', {}, _('DNS API is required for DNS-01 validation')), 'error');
							return;
						}
					}

					ui.hideModal();
					ui.showModal(_('Saving...'), [E('p', {}, _('Please wait...'))]);

					callAcmeUpdate(cert.id, newDomain, newEmail, newMethod, newDnsApi, newCredentials, newDnsWait, autoRenewInput.checked ? '1' : '0').then(function(result) {
						ui.hideModal();
						if (result && result.error) {
							ui.addNotification(null, E('p', {}, _(result.error)), 'error');
							return;
						}

						if (result && result.needs_reissue === '1') {
							ui.showModal(_('Re-issue Required'), [
								E('p', {}, _('The changes you made require re-issuing the certificate. Would you like to re-issue now?')),
								E('div', { 'class': 'right' }, [
									E('button', { 'class': 'btn', 'click': function() {
										ui.hideModal();
										ui.addNotification(null, E('p', {}, _('Settings saved. Certificate will be re-issued on next renewal.')), 'info');
										setTimeout(function() { location.reload(); }, 500);
									} }, _('Later')),
									E('button', {
										'class': 'cbi-button cbi-button-apply',
										'click': function() {
											ui.hideModal();
											requestAcmeRenew(cert);
										}
									}, '\u21BB ' + _('Re-issue Now'))
								])
							]);
						} else {
							ui.addNotification(null, E('p', {}, _('Certificate settings updated')), 'info');
							setTimeout(function() { location.reload(); }, 500);
						}
					}).catch(function(err) {
						ui.hideModal();
						ui.addNotification(null, E('p', {}, _('Failed to update certificate') + ': ' + err), 'error');
					});
				}
			}, _('Save'))
		])
	]);

	updateMethodRows();
	checkReissueNeeded();
}

return view.extend({
	load: function() {
		return callListCerts();
	},

	render: function(data) {
		var certs = (data && data.certs) || [];

		var container = E('div', { 'class': 'cbi-map' });

		utils.loadSharedCSS();

		container.appendChild(E('h2', { 'class': 'cbi-map-title' }, _('Certificates')));

		var headerSection = E('div', { 'class': 'cbi-section' });

		headerSection.appendChild(E('button', {
			'class': 'cbi-button cbi-button-apply',
			'click': function() {
				var certNameInput = E('input', { 'type': 'text', 'id': 'new-cert-name', 'class': 'cbi-input-text' });
				var certTypeSelect = E('select', { 'id': 'new-cert-type', 'class': 'cbi-input-select' }, [
					E('option', { 'value': 'manual' }, _('Manual')),
					E('option', { 'value': 'self_signed' }, _('Self-Signed Certificate')),
					E('option', { 'value': 'acme' }, _('Auto (ACME)'))
				]);
				var certDomainInput = E('input', { 'type': 'text', 'id': 'new-cert-domain', 'class': 'cbi-input-text' });
				var acmeAccountEmailInput = E('input', {
					'type': 'email',
					'id': 'new-acme-account-email',
					'class': 'cbi-input-text',
					'placeholder': 'admin@your-domain.com'
				});
				var acmeAutoRenewInput = E('input', {
					'type': 'checkbox',
					'id': 'new-acme-auto-renew',
					'class': 'cbi-input-checkbox'
				});
				acmeAutoRenewInput.checked = true;
				var acmeMethodSelect = E('select', { 'id': 'new-acme-method', 'class': 'cbi-input-select' }, [
					E('option', { 'value': 'webroot' }, _('HTTP-01 Webroot')),
					E('option', { 'value': 'dns' }, _('DNS-01')),
					E('option', { 'value': 'standalone' }, _('HTTP-01 Standalone'))
				]);
				var dnsApiSelectOptions = [E('option', { 'value': '' }, _('-- Please choose --'))];
				var dnsApiKeys = Object.keys(DNS_API_INFO);
				for (var k = 0; k < dnsApiKeys.length; k++) {
					var apiId = dnsApiKeys[k];
					dnsApiSelectOptions.push(E('option', { 'value': apiId }, apiId + ' (' + DNS_API_INFO[apiId].name + ')'));
				}
				dnsApiSelectOptions.push(E('option', { 'value': '_custom' }, _('Custom...')));
				var dnsApiSelect = E('select', { 'id': 'new-acme-dns-api', 'class': 'cbi-input-select' }, dnsApiSelectOptions);
				var dnsApiCustomInput = E('input', {
					'type': 'text',
					'id': 'new-acme-dns-api-custom',
					'class': 'cbi-input-text',
					'placeholder': 'dns_xx',
					'style': 'display:none'
				});
				var dnsCredsContainer = E('div', { 'id': 'new-acme-dns-creds-container' });
				var dnsCredentialsInput = E('textarea', {
					'id': 'new-acme-dns-credentials',
					'class': 'cbi-input-textarea nm-modal-textarea',
					'rows': 5,
					'placeholder': 'KEY=VALUE\nKEY2=VALUE2',
					'style': 'display:none'
				});
				var dnsWaitInput = E('input', {
					'type': 'number',
					'id': 'new-acme-dns-wait',
					'class': 'cbi-input-text',
					'min': '0',
					'placeholder': '120'
				});

				function updateDnsCredsFields() {
					var apiId = dnsApiSelect.value;
					var info = DNS_API_INFO[apiId];
					var customRow = document.getElementById('cert-dns-api-custom-row');
					var credsRow = document.getElementById('cert-dns-creds-row');
					var credsDesc = document.getElementById('cert-dns-creds-desc');
					var isDns = certTypeSelect.value === 'acme' && acmeMethodSelect.value === 'dns';
					dnsCredsContainer.innerHTML = '';
					dnsCredentialsInput.style.display = 'none';

					if (!isDns) {
						if (customRow) customRow.style.display = 'none';
						if (credsRow) credsRow.style.display = 'none';
						dnsApiCustomInput.style.display = 'none';
						return;
					}

					if (credsRow) credsRow.style.display = '';

					if (apiId === '_custom') {
						dnsApiCustomInput.style.display = '';
						if (customRow) customRow.style.display = '';
						dnsCredentialsInput.style.display = '';
						if (credsDesc) credsDesc.style.display = '';
					} else if (info) {
						dnsApiCustomInput.style.display = 'none';
						if (customRow) customRow.style.display = 'none';
						if (credsDesc) credsDesc.style.display = 'none';
						for (var i = 0; i < info.keys.length; i++) {
							var keyInfo = info.keys[i];
							var keyName = keyInfo.key;
							var row = E('div', { 'class': 'nm-cred-field' }, [
								E('label', { 'class': 'nm-cred-label' }, keyName + (keyInfo.optional ? ' (' + _('Optional') + ')' : '')),
								E('input', { 'type': 'text', 'class': 'cbi-input-text', 'data-cred-key': keyName, 'placeholder': keyName + '=...' }),
								keyInfo.desc ? E('div', { 'class': 'cbi-value-description' }, keyInfo.desc) : null
							]);
							dnsCredsContainer.appendChild(row);
						}
					} else {
						dnsApiCustomInput.style.display = 'none';
						if (customRow) customRow.style.display = 'none';
						if (credsDesc) credsDesc.style.display = 'none';
					}
				}

				function updateAcmeRows() {
					var domainRow = document.getElementById('cert-domain-row');
					var acmeEmailRow = document.getElementById('cert-acme-email-row');
					var acmeAutoRenewRow = document.getElementById('cert-acme-auto-renew-row');
					var acmeMethodRow = document.getElementById('cert-acme-method-row');
					var isAcme = certTypeSelect.value === 'acme';
					var isDns = isAcme && acmeMethodSelect.value === 'dns';

					if (domainRow) domainRow.style.display = certTypeSelect.value === 'manual' ? 'none' : '';
					if (acmeEmailRow) acmeEmailRow.style.display = isAcme ? '' : 'none';
					if (acmeAutoRenewRow) acmeAutoRenewRow.style.display = isAcme ? '' : 'none';
					if (acmeMethodRow) acmeMethodRow.style.display = isAcme ? '' : 'none';

					// Toggle basic DNS rows (provider select + wait)
					var dnsBasicRows = document.querySelectorAll('.cert-dns-row');
					for (var i = 0; i < dnsBasicRows.length; i++)
						dnsBasicRows[i].style.display = isDns ? '' : 'none';

					// Update credential fields (also handles custom-row and creds-row visibility)
					updateDnsCredsFields();
				}

				certTypeSelect.addEventListener('change', updateAcmeRows);
				acmeMethodSelect.addEventListener('change', updateAcmeRows);
				dnsApiSelect.addEventListener('change', updateDnsCredsFields);

				ui.showModal(_('Add Certificate'), [
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Certificate Name')),
						E('div', { 'class': 'cbi-value-field' }, certNameInput)
					]),
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Type')),
						E('div', { 'class': 'cbi-value-field' }, certTypeSelect)
					]),
					E('div', { 'class': 'cbi-value', 'id': 'cert-domain-row' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Domain')),
						E('div', { 'class': 'cbi-value-field' }, certDomainInput)
					]),
					E('div', { 'class': 'cbi-value', 'id': 'cert-acme-email-row', 'style': 'display:none' }, [
						E('label', { 'class': 'cbi-value-title' }, _('ACME Account Email')),
						E('div', { 'class': 'cbi-value-field' }, [
							acmeAccountEmailInput,
							E('div', { 'class': 'cbi-value-description' }, _('A real email address is required for ACME account registration.'))
						])
					]),
					E('div', { 'class': 'cbi-value', 'id': 'cert-acme-auto-renew-row', 'style': 'display:none' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Automatic Renewal')),
						E('div', { 'class': 'cbi-value-field' }, [
							E('label', {}, [
								acmeAutoRenewInput,
								' ',
								_('Enable automatic renewal')
							])
						])
					]),
					E('div', { 'class': 'cbi-value', 'id': 'cert-acme-method-row', 'style': 'display:none' }, [
						E('label', { 'class': 'cbi-value-title' }, _('ACME Validation')),
						E('div', { 'class': 'cbi-value-field' }, acmeMethodSelect)
					]),
					E('div', { 'class': 'cbi-value cert-dns-row', 'style': 'display:none' }, [
						E('label', { 'class': 'cbi-value-title' }, _('DNS Provider')),
						E('div', { 'class': 'cbi-value-field' }, dnsApiSelect)
					]),
					E('div', { 'class': 'cbi-value', 'id': 'cert-dns-api-custom-row', 'style': 'display:none' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Custom DNS API Name')),
						E('div', { 'class': 'cbi-value-field' }, [
							dnsApiCustomInput,
							E('div', { 'class': 'cbi-value-description' }, _('acme.sh DNS API script name, e.g. dns_myapi. See acme.sh dnsapi wiki for full list.'))
						])
					]),
					E('div', { 'class': 'cbi-value', 'id': 'cert-dns-creds-row', 'style': 'display:none' }, [
						E('label', { 'class': 'cbi-value-title' }, _('DNS Credentials')),
						E('div', { 'class': 'cbi-value-field' }, [
							dnsCredsContainer,
							dnsCredentialsInput,
							E('div', { 'class': 'cbi-value-description', 'id': 'cert-dns-creds-desc', 'style': 'display:none' }, _('One credential per line in KEY=VALUE format'))
						])
					]),
					E('div', { 'class': 'cbi-value cert-dns-row', 'style': 'display:none' }, [
						E('label', { 'class': 'cbi-value-title' }, _('DNS Wait Seconds')),
						E('div', { 'class': 'cbi-value-field' }, [
							dnsWaitInput,
							E('div', { 'class': 'cbi-value-description' }, _('Seconds to wait for DNS propagation before validation. Leave empty for default.'))
						])
					]),
					E('div', { 'class': 'right' }, [
						E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
						E('button', {
							'class': 'cbi-button cbi-button-apply',
							'click': function() {
								var certName = certNameInput.value.trim();
								var certType = certTypeSelect.value;
								var certDomain = certDomainInput.value.trim();
								var acmeAccountEmail = acmeAccountEmailInput.value.trim();
								var acmeAutoRenew = acmeAutoRenewInput.checked ? '1' : '0';
								var acmeMethod = acmeMethodSelect.value;
								var dnsApi, dnsCredentials, dnsWait;

								// Resolve DNS API name
								if (acmeMethod === 'dns') {
									if (dnsApiSelect.value === '_custom') {
										dnsApi = dnsApiCustomInput.value.trim();
									} else {
										dnsApi = dnsApiSelect.value;
									}
									// Build credentials from dynamic fields or textarea
									var credInputs = dnsCredsContainer.querySelectorAll('input[data-cred-key]');
									if (credInputs.length > 0) {
										var lines = [];
										for (var ci = 0; ci < credInputs.length; ci++) {
											var cVal = credInputs[ci].value.trim();
											if (cVal) lines.push(credInputs[ci].getAttribute('data-cred-key') + '=' + cVal);
										}
										dnsCredentials = lines.join('\n');
									} else {
										dnsCredentials = dnsCredentialsInput.value.trim();
									}
								}
								dnsWait = dnsWaitInput.value.trim();

								if (!certName) {
									ui.addNotification(null, E('p', {}, _('Certificate name is required')), 'error');
									return;
								}

								ui.hideModal();

								if (certType === 'self_signed') {
									if (!certDomain) {
										ui.addNotification(null, E('p', {}, _('Domain is required for self-signed certificates')), 'error');
										return;
									}
									ui.showModal(_('Generating...'), [E('p', {}, _('Please wait...'))]);
									callIssueSelfSigned(certName, certName, certDomain).then(function(result) {
										ui.hideModal();
										if (result && result.error) {
											ui.addNotification(null, E('p', {}, result.error), 'error');
										} else {
											ui.addNotification(null, E('p', {}, _('Self-signed certificate generated')), 'info');
											setTimeout(function() { location.reload(); }, 500);
										}
									}).catch(function(err) {
										ui.hideModal();
										ui.addNotification(null, E('p', {}, _('Failed to generate self-signed certificate') + ': ' + err), 'error');
									});
								} else if (certType === 'acme') {
									if (!certDomain) {
										ui.addNotification(null, E('p', {}, _('Domain is required for ACME certificates')), 'error');
										return;
									}
									if (!acmeAccountEmail) {
										ui.addNotification(null, E('p', {}, _('ACME account email is required')), 'error');
										return;
									}
									if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(acmeAccountEmail) || /@(example\.(com|net|org)|localhost)$/i.test(acmeAccountEmail)) {
										ui.addNotification(null, E('p', {}, _('Invalid ACME account email')), 'error');
										return;
									}
										if ((acmeMethod === 'webroot' || acmeMethod === 'standalone') && certDomain.includes('*')) {
											ui.addNotification(null, E('p', {}, _('Wildcard domains are not supported for ACME certificates')), 'error');
											return;
										}
									if (acmeMethod === 'dns') {
										if (!dnsApi) {
											ui.addNotification(null, E('p', {}, _('DNS API is required for DNS-01 validation')), 'error');
											return;
										}
										if (!dnsCredentials) {
											ui.addNotification(null, E('p', {}, _('DNS credentials are required for DNS-01 validation')), 'error');
											return;
										}
									}
									ui.showModal(_('Requesting...'), [E('p', {}, _('Please wait, ACME certificate issuance may take a while...'))]);
									callAcmeIssue(certName, certDomain, acmeAccountEmail, acmeMethod, dnsApi, dnsCredentials, dnsWait, acmeAutoRenew).then(function(result) {
										ui.hideModal();
										if (result && result.error) {
											var errMsg = _(result.error);
											if (result.detail) errMsg += ': ' + result.detail;
											ui.addNotification(null, E('p', {}, _('Failed to issue ACME certificate') + ': ' + errMsg), 'error');
											return;
										}
										ui.addNotification(null, E('p', {}, _('ACME certificate requested')), 'info');
										setTimeout(function() { location.reload(); }, 500);
									}).catch(function(err) {
										ui.hideModal();
										ui.addNotification(null, E('p', {}, _('Failed to issue ACME certificate') + ': ' + err), 'error');
									});
								} else {
									var certPemInput = E('textarea', { 'id': 'cert-pem', 'class': 'cbi-input-textarea nm-modal-textarea', 'rows': 10 });
									var keyPemInput = E('textarea', { 'id': 'key-pem', 'class': 'cbi-input-textarea nm-modal-textarea', 'rows': 10 });
									ui.showModal(_('Upload Certificate'), [
									E('div', { 'class': 'cbi-value' }, [
										E('label', { 'class': 'cbi-value-title' }, _('Certificate (PEM)')),
										E('div', { 'class': 'cbi-value-field' }, certPemInput)
									]),
									E('div', { 'class': 'cbi-value' }, [
										E('label', { 'class': 'cbi-value-title' }, _('Private Key (PEM)')),
										E('div', { 'class': 'cbi-value-field' }, keyPemInput)
									]),
										E('div', { 'class': 'right' }, [
											E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
											E('button', {
												'class': 'cbi-button cbi-button-apply',
												'click': function() {
													var certPem = certPemInput.value;
													var keyPem = keyPemInput.value;
													if (!certPem || !keyPem) {
														ui.addNotification(null, E('p', {}, _('Both certificate and key are required')), 'error');
														return;
													}
													ui.hideModal();
													callUploadCert({ id: certName, name: certName, cert_content: certPem, key_content: keyPem, domain: certDomain }).then(function(result) {
														if (result && result.error) {
															ui.addNotification(null, E('p', {}, result.error), 'error');
														} else {
															ui.addNotification(null, E('p', {}, _('Certificate uploaded')), 'info');
															setTimeout(function() { location.reload(); }, 500);
														}
													}).catch(function(err) {
														ui.addNotification(null, E('p', {}, _('Failed to upload certificate') + ': ' + err), 'error');
													});
												}
											}, '\u271A ' + _('Upload'))
										])
									]);
								}
							}
						}, '\u271A ' + _('Create'))
					])
				]);
				updateAcmeRows();
			}
		}, '\u271A ' + _('Add Certificate')));

		container.appendChild(headerSection);

		if (certs.length === 0) {
			container.appendChild(E('div', { 'class': 'cbi-section' }, [
				E('p', { 'class': 'nm-empty-state' },
					_('No certificates configured.'))
			]));
			return utils.appendFooter(container, {
			project: 'Nginx Manager',
			repoUrl: 'https://github.com/hello-yunshu/luci-app-nginx-manager'
		});
		}

		var table = E('table', { 'class': 'table' });
		var thead = E('thead');
		var headerRow = E('tr');
		[_('Name'), _('Type'), _('Domain'), _('Status'), _('Actions')].forEach(function(title) {
			headerRow.appendChild(E('th', {}, title));
		});
		thead.appendChild(headerRow);
		table.appendChild(thead);

		certs.forEach(function(cert) {
			var row = E('tr');

			row.appendChild(E('td', {}, cert.name || '-'));
			row.appendChild(E('td', {}, acmeModeLabel(cert)));

			var domainCell = E('td');
			domainCell.textContent = cert.domain || '-';
			row.appendChild(domainCell);

			var statusCell = E('td');
			statusCell.appendChild(E('button', {
				'class': certStatusClass(cert.status),
				'click': function() { showCertStatusModal(cert); }
			}, certStatusLabel(cert.status)));
			row.appendChild(statusCell);

			var actionsCell = E('td', { 'class': 'nm-actions' });

			if (cert.type === 'acme') {
				actionsCell.appendChild(E('button', {
					'class': 'cbi-button',
					'click': function() { showEditCertModal(cert); }
				}, _('Edit')));

				actionsCell.appendChild(E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': function() { requestAcmeRenew(cert); }
				}, '\u21BB ' + (cert.status === 'acme_failed' || cert.status === 'missing' ? _('Regenerate') : _('Renew'))));
			}

			actionsCell.appendChild(E('button', {
				'class': 'cbi-button cbi-button-reset',
				'click': function() {
					ui.showModal(_('Confirm Delete'), [
						E('p', {}, _('Are you sure you want to delete this certificate?')),
						E('div', { 'class': 'right' }, [
							E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
							E('button', {
								'class': 'cbi-button cbi-button-reset',
								'click': function() {
									ui.hideModal();
									callDeleteCert(cert.id).then(function(result) {
										if (result && result.error) {
											ui.addNotification(null, E('p', {}, result.error), 'error');
										} else {
											ui.addNotification(null, E('p', {}, _('Certificate deleted')), 'info');
											setTimeout(function() { location.reload(); }, 500);
										}
									}).catch(function(err) {
										ui.addNotification(null, E('p', {}, _('Failed to delete certificate') + ': ' + err), 'error');
									});
								}
							}, '\u2718 ' + _('Delete'))
						])
					]);
				}
			}, '\u2718 ' + _('Delete')));

			row.appendChild(actionsCell);
			table.appendChild(row);
		});

		container.appendChild(E('div', { 'class': 'cbi-section' }, [table]));

		return utils.appendFooter(container, {
			project: 'Nginx Manager',
			repoUrl: 'https://github.com/hello-yunshu/luci-app-nginx-manager'
		});
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
