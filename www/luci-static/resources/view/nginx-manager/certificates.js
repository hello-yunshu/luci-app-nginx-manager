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
	params: ['id', 'domain', 'validation_method', 'dns_api', 'credentials', 'dns_wait'],
	expect: {}
});

var callAcmeRenew = rpc.declare({
	object: 'nginx_manager',
	method: 'acme_renew',
	params: ['id'],
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
var ACME_POLL_TIMEOUT = 300000;

function pollAcmeStatus(taskId, onSuccess, onFailed) {
	var startTime = Date.now();

	function poll() {
		callAcmeStatus(taskId).then(function(result) {
			var status = (result && result.status) || 'unknown';

			if (status === 'success') {
				onSuccess();
				return;
			}

			if (status === 'failed') {
				onFailed((result && result.detail) || '');
				return;
			}

			if (status === 'running') {
				if (Date.now() - startTime > ACME_POLL_TIMEOUT) {
					onFailed(_('ACME operation timed out'));
					return;
				}
				setTimeout(poll, ACME_POLL_INTERVAL);
				return;
			}

			onFailed(_('Unknown ACME task status') + ': ' + status);
		}).catch(function() {
			if (Date.now() - startTime > ACME_POLL_TIMEOUT) {
				onFailed(_('ACME operation timed out'));
				return;
			}
			setTimeout(poll, ACME_POLL_INTERVAL);
		});
	}

	poll();
}

function certStatusLabel(status) {
	switch (status) {
		case 'valid': return _('Valid');
		case 'expiring': return _('Expiring Soon');
		case 'expired': return _('Expired');
		case 'missing': return _('File Missing');
		default: return status || '-';
	}
}

function certStatusClass(status) {
	switch (status) {
		case 'valid': return 'nm-badge success';
		case 'expiring': return 'nm-badge warning';
		case 'expired': return 'nm-badge error';
		case 'missing': return 'nm-badge error';
		default: return 'nm-badge disabled';
	}
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
							var row = E('div', { 'class': 'cbi-value' }, [
								E('label', { 'class': 'cbi-value-title', 'style': 'font-weight:normal' }, keyName + (keyInfo.optional ? ' (' + _('Optional') + ')' : '')),
								E('div', { 'style': 'display:flex;flex-direction:column;gap:2px;flex:1' }, [
									E('input', { 'type': 'text', 'class': 'cbi-input-text', 'data-cred-key': keyName, 'placeholder': keyName + '=...' }),
									keyInfo.desc ? E('div', { 'class': 'cbi-value-description' }, keyInfo.desc) : null
								])
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
					var acmeMethodRow = document.getElementById('cert-acme-method-row');
					var isAcme = certTypeSelect.value === 'acme';
					var isDns = isAcme && acmeMethodSelect.value === 'dns';

					if (domainRow) domainRow.style.display = certTypeSelect.value === 'manual' ? 'none' : '';
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
						certNameInput
					]),
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Type')),
						certTypeSelect
					]),
					E('div', { 'class': 'cbi-value', 'id': 'cert-domain-row' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Domain')),
						certDomainInput
					]),
					E('div', { 'class': 'cbi-value', 'id': 'cert-acme-method-row', 'style': 'display:none' }, [
						E('label', { 'class': 'cbi-value-title' }, _('ACME Validation')),
						acmeMethodSelect
					]),
					E('div', { 'class': 'cbi-value cert-dns-row', 'style': 'display:none' }, [
						E('label', { 'class': 'cbi-value-title' }, _('DNS Provider')),
						dnsApiSelect
					]),
					E('div', { 'class': 'cbi-value', 'id': 'cert-dns-api-custom-row', 'style': 'display:none' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Custom DNS API Name')),
						dnsApiCustomInput,
						E('div', { 'class': 'cbi-value-description' }, _('acme.sh DNS API script name, e.g. dns_myapi. See acme.sh dnsapi wiki for full list.'))
					]),
					E('div', { 'id': 'cert-dns-creds-row', 'style': 'display:none' }, [
						E('label', { 'class': 'cbi-value-title' }, _('DNS Credentials')),
						dnsCredsContainer,
						dnsCredentialsInput,
						E('div', { 'class': 'cbi-value-description', 'id': 'cert-dns-creds-desc', 'style': 'display:none' }, _('One credential per line in KEY=VALUE format'))
					]),
					E('div', { 'class': 'cbi-value cert-dns-row', 'style': 'display:none' }, [
						E('label', { 'class': 'cbi-value-title' }, _('DNS Wait Seconds')),
						dnsWaitInput,
						E('div', { 'class': 'cbi-value-description' }, _('Seconds to wait for DNS propagation before validation. Leave empty for default.'))
					]),
					E('div', { 'class': 'right' }, [
						E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
						E('button', {
							'class': 'cbi-button cbi-button-apply',
							'click': function() {
								var certName = certNameInput.value.trim();
								var certType = certTypeSelect.value;
								var certDomain = certDomainInput.value.trim();
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
									callAcmeIssue(certName, certDomain, acmeMethod, dnsApi, dnsCredentials, dnsWait).then(function(result) {
										if (result && result.error) {
											ui.hideModal();
											var errMsg = _(result.error);
											if (result.detail) errMsg += ': ' + result.detail;
											ui.addNotification(null, E('p', {}, _('Failed to issue ACME certificate') + ': ' + errMsg), 'error');
											return;
										}
										pollAcmeStatus((result && result.task_id) || certName,
											function() {
												ui.hideModal();
												ui.addNotification(null, E('p', {}, _('ACME certificate issued successfully')), 'info');
												setTimeout(function() { location.reload(); }, 500);
											},
											function(detail) {
												ui.hideModal();
												var errMsg = _('Failed to issue ACME certificate');
												if (detail) errMsg += ': ' + detail;
												ui.addNotification(null, E('p', {}, errMsg), 'error');
											}
										);
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
											certPemInput
										]),
										E('div', { 'class': 'cbi-value' }, [
											E('label', { 'class': 'cbi-value-title' }, _('Private Key (PEM)')),
											keyPemInput
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
			statusCell.appendChild(E('span', { 'class': certStatusClass(cert.status) }, certStatusLabel(cert.status)));
			row.appendChild(statusCell);

			var actionsCell = E('td', { 'class': 'nm-actions' });

			if (cert.type === 'acme') {
				actionsCell.appendChild(E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': function() {
						ui.showModal(_('Renewing...'), [E('p', {}, _('Please wait, ACME renewal may take a while...'))]);
						callAcmeRenew(cert.id).then(function(result) {
							if (result && result.error) {
								ui.hideModal();
								var errMsg = _(result.error);
								if (result.detail) errMsg += ': ' + result.detail;
								ui.addNotification(null, E('p', {}, _('Failed to renew ACME certificate') + ': ' + errMsg), 'error');
								return;
							}
							pollAcmeStatus((result && result.task_id) || cert.id,
								function() {
									ui.hideModal();
									ui.addNotification(null, E('p', {}, _('ACME certificate renewed successfully')), 'info');
									setTimeout(function() { location.reload(); }, 500);
								},
								function(detail) {
									ui.hideModal();
									var errMsg = _('Failed to renew ACME certificate');
									if (detail) errMsg += ': ' + detail;
									ui.addNotification(null, E('p', {}, errMsg), 'error');
								}
							);
						}).catch(function(err) {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, _('Failed to renew ACME certificate') + ': ' + err), 'error');
						});
					}
				}, '\u21BB ' + _('Renew')));
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
