'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require ui';
'require rpc';
'require nginx-manager/utils as utils';

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
	params: ['id', 'domain'],
	expect: {}
});

var callAcmeRenew = rpc.declare({
	object: 'nginx_manager',
	method: 'acme_renew',
	params: ['id'],
	expect: {}
});

var callUploadCert = rpc.declare({
	object: 'nginx_manager',
	method: 'upload_cert',
	expect: {}
});

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

				certTypeSelect.addEventListener('change', function() {
					var domainRow = document.getElementById('cert-domain-row');
					if (domainRow) domainRow.style.display = certTypeSelect.value === 'manual' ? 'none' : '';
				});

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
					E('div', { 'class': 'right' }, [
						E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
						E('button', {
							'class': 'cbi-button cbi-button-apply',
							'click': function() {
								var certName = certNameInput.value.trim();
								var certType = certTypeSelect.value;
								var certDomain = certDomainInput.value.trim();

								if (!certName) {
									ui.addNotification(null, E('p', {}, _('Certificate name is required')), 'error');
									return;
								}
								if (!/^[a-zA-Z0-9_][a-zA-Z0-9._-]*$/.test(certName)) {
									ui.addNotification(null, E('p', {}, _('Certificate name must start with a letter, number or underscore, and can contain letters, numbers, dots, hyphens and underscores')), 'error');
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
									if (certDomain.includes('*')) {
										ui.addNotification(null, E('p', {}, _('Wildcard domains are not supported for ACME certificates')), 'error');
										return;
									}
									ui.showModal(_('Requesting...'), [E('p', {}, _('Please wait, ACME certificate issuance may take a while...'))]);
									callAcmeIssue(certName, certDomain).then(function(result) {
										ui.hideModal();
										if (result && result.error) {
											var errMsg = _(result.error);
											if (result.detail) errMsg += ': ' + result.detail;
											ui.addNotification(null, E('p', {}, _('Failed to issue ACME certificate') + ': ' + errMsg), 'error');
										} else {
											ui.addNotification(null, E('p', {}, _('ACME certificate issued successfully')), 'info');
											setTimeout(function() { location.reload(); }, 500);
										}
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
			row.appendChild(E('td', {}, certTypeLabel(cert.type)));

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
						ui.showModal(_('Renewing...'), [E('p', {}, _('Please wait...'))]);
						callAcmeRenew(cert.id).then(function(result) {
							ui.hideModal();
							if (result && result.error) {
								var errMsg = _(result.error);
								if (result.detail) errMsg += ': ' + result.detail;
								ui.addNotification(null, E('p', {}, _('Failed to renew ACME certificate') + ': ' + errMsg), 'error');
							} else {
								ui.addNotification(null, E('p', {}, _('ACME certificate renewed successfully')), 'info');
								setTimeout(function() { location.reload(); }, 500);
							}
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
