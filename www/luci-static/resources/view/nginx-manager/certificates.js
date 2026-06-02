'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require ui';
'require rpc';

var callListCerts = rpc.declare({
	object: 'nginx_manager',
	method: 'list_certs',
	expect: { certs: [] }
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

return view.extend({
	load: function() {
		return callListCerts();
	},

	render: function(data) {
		var certs = (data && data.certs) || [];

		var container = E('div', { 'class': 'cbi-map' });

		container.appendChild(E('link', {
			'rel': 'stylesheet',
			'href': L.resource('nginx-manager/nginx-manager.css')
		}));

		container.appendChild(E('h2', { 'class': 'cbi-map-title' }, _('Certificates')));

		var headerSection = E('div', { 'class': 'cbi-section' });

		headerSection.appendChild(E('button', {
			'class': 'cbi-button cbi-button-apply',
			'click': function() {
				ui.showModal(_('Add Certificate'), [
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Certificate Name')),
						E('input', { 'type': 'text', 'id': 'new-cert-name', 'class': 'cbi-input-text' })
					]),
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Type')),
						E('select', { 'id': 'new-cert-type', 'class': 'cbi-input-select' }, [
							E('option', { 'value': 'manual' }, _('Manual')),
							E('option', { 'value': 'self_signed' }, _('Self-Signed Certificate'))
						])
					]),
					E('div', { 'class': 'cbi-value', 'id': 'cert-domain-row' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Domain')),
						E('input', { 'type': 'text', 'id': 'new-cert-domain', 'class': 'cbi-input-text' })
					]),
					E('div', { 'class': 'right' }, [
						E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
						' ',
						E('button', {
							'class': 'cbi-button cbi-button-apply',
							'click': function() {
								var certName = document.getElementById('new-cert-name').value.trim();
								var certType = document.getElementById('new-cert-type').value;
								var certDomain = document.getElementById('new-cert-domain').value.trim();

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
									});
								} else {
									ui.showModal(_('Upload Certificate'), [
										E('div', { 'class': 'cbi-value' }, [
											E('label', { 'class': 'cbi-value-title' }, _('Certificate (PEM)')),
											E('textarea', { 'id': 'cert-pem', 'class': 'cbi-input-textarea', 'rows': 10, 'style': 'width: 100%; font-family: monospace;' })
										]),
										E('div', { 'class': 'cbi-value' }, [
											E('label', { 'class': 'cbi-value-title' }, _('Private Key (PEM)')),
											E('textarea', { 'id': 'key-pem', 'class': 'cbi-input-textarea', 'rows': 10, 'style': 'width: 100%; font-family: monospace;' })
										]),
										E('div', { 'class': 'right' }, [
											E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
											' ',
											E('button', {
												'class': 'cbi-button cbi-button-apply',
												'click': function() {
													var certPem = document.getElementById('cert-pem').value;
													var keyPem = document.getElementById('key-pem').value;
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
			return container;
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
			row.appendChild(E('td', {}, cert.type || '-'));

			var domainCell = E('td');
			domainCell.textContent = cert.domain || '-';
			row.appendChild(domainCell);

			var statusCell = E('td');
			statusCell.appendChild(E('span', { 'class': certStatusClass(cert.status) }, certStatusLabel(cert.status)));
			row.appendChild(statusCell);

			var actionsCell = E('td');

			actionsCell.appendChild(E('button', {
				'class': 'cbi-button cbi-button-reset',
				'click': function() {
					ui.showModal(_('Confirm Delete'), [
						E('p', {}, _('Are you sure you want to delete this certificate?')),
						E('div', { 'class': 'right' }, [
							E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
							' ',
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

		return container;
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
