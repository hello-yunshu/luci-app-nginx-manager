'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require ui';
'require rpc';
'require nginx-manager/utils as utils';

var callListFiles = rpc.declare({
	object: 'nginx_manager',
	method: 'list_files',
	params: ['dir'],
	expect: {}
});

var callGetFileReadonly = rpc.declare({
	object: 'nginx_manager',
	method: 'get_file_readonly',
	params: ['path'],
	expect: {}
});

var callSaveFile = rpc.declare({
	object: 'nginx_manager',
	method: 'save_file',
	params: ['path', 'content'],
	expect: {}
});

var callChmodFile = rpc.declare({
	object: 'nginx_manager',
	method: 'chmod_file',
	params: ['path', 'perms'],
	expect: {}
});

function highlightNginx(text) {
	if (!text) return '';
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/#.*/g, function(m) { return '<span class="cm">' + m + '</span>'; })
		.replace(/("[^"]*")/g, '<span class="str">$1</span>')
		.replace(/(\$[\w_]+)/g, '<span class="var">$1</span>')
		.replace(/\b(server|location|listen|proxy_pass|upstream|return|if|set|include|root|index|ssl_certificate|ssl_certificate_key|ssl_protocols|ssl_ciphers|ssl_prefer_server_ciphers|ssl_session_cache|ssl_session_timeout|ssl_session_tickets|ssl_stapling|ssl_stapling_verify|ssl_trusted_certificate|ssl_buffer_size|add_header|error_page|access_log|error_log|http2|http3|quic|server_name|client_max_body_size|keepalive_timeout|sendfile|tcp_nopush|tcp_nodelay|gzip|server_tokens|resolver|resolver_timeout|proxy_set_header|proxy_redirect|proxy_buffering|proxy_buffer_size|proxy_buffers|proxy_busy_buffers_size|proxy_connect_timeout|proxy_read_timeout|proxy_send_timeout|grpc_pass|grpc_set_header|try_files|autoindex|alias|rewrite|limit_rate|limit_rate_after|default_type|types|charset|etag|expires|cache_control)\b/g,
			'<span class="kw">$1</span>');
}

var currentPath = '';
var currentDir = 'conf.d/luci-manager';
var ROOT_DIR = '/etc/nginx';

function loadFileTree(container, dir) {
	callListFiles(dir).then(function(data) {
		renderFileTree(container, data);
	}).catch(function(err) {
		container.innerHTML = '';
		container.appendChild(E('div', { 'class': 'nm-file-tree-item' },
			_('Failed to load directory') + ': ' + (err.message || err)));
	});
}

function renderFileTree(container, data) {
	container.innerHTML = '';

	// Root /etc/nginx entry
	var rootItem = E('div', {
		'class': 'nm-file-tree-item nm-file-tree-dir expanded',
		'click': function(e) {
			e.stopPropagation();
			this.classList.toggle('expanded');
			var children = this.nextElementSibling;
			if (children) children.style.display = children.style.display === 'none' ? '' : 'none';
		}
	}, ROOT_DIR);
	container.appendChild(rootItem);

	var rootChildren = E('div', { 'class': 'nm-file-tree-children' });
	container.appendChild(rootChildren);

	function loadSubDir(childrenEl, subDirPath) {
		childrenEl.textContent = _('Loading...');
		callListFiles(subDirPath).then(function(subData) {
			childrenEl.innerHTML = '';
			var subEntries = (subData && subData.entries) || [];
			renderEntries(childrenEl, subEntries, subDirPath);
		}).catch(function() {
			childrenEl.innerHTML = '';
		});
	}

	function showChmodModal(path, currentPerms) {
		// Handle 4-digit octal (e.g. 4755) by stripping the leading special-bits digit
		var permStr = currentPerms;
		if (permStr.length === 4) permStr = permStr.substring(1);

		var u = parseInt(permStr[0]) || 0, g = parseInt(permStr[1]) || 0, o = parseInt(permStr[2]) || 0;
		var uR = !!(u & 4), uW = !!(u & 2), uX = !!(u & 1);
		var gR = !!(g & 4), gW = !!(g & 2), gX = !!(g & 1);
		var oR = !!(o & 4), oW = !!(o & 2), oX = !!(o & 1);

		var octalInput = E('input', {
			'type': 'text', 'class': 'cbi-input-text nm-perm-octal',
			'value': permStr, 'maxlength': '3'
		});

		var cbU = { r: null, w: null, x: null };
		var cbG = { r: null, w: null, x: null };
		var cbO = { r: null, w: null, x: null };

		function syncOctal() {
			var uv = (cbU.r.checked ? 4 : 0) + (cbU.w.checked ? 2 : 0) + (cbU.x.checked ? 1 : 0);
			var gv = (cbG.r.checked ? 4 : 0) + (cbG.w.checked ? 2 : 0) + (cbG.x.checked ? 1 : 0);
			var ov = (cbO.r.checked ? 4 : 0) + (cbO.w.checked ? 2 : 0) + (cbO.x.checked ? 1 : 0);
			octalInput.value = '' + uv + gv + ov;
		}

		function syncCheckboxes() {
			var v = octalInput.value.replace(/[^0-7]/g, '').slice(0, 3);
			if (v.length < 3) v = v.padEnd(3, '0');
			octalInput.value = v;
			var uv = parseInt(v[0]), gv = parseInt(v[1]), ov = parseInt(v[2]);
			cbU.r.checked = !!(uv & 4); cbU.w.checked = !!(uv & 2); cbU.x.checked = !!(uv & 1);
			cbG.r.checked = !!(gv & 4); cbG.w.checked = !!(gv & 2); cbG.x.checked = !!(gv & 1);
			cbO.r.checked = !!(ov & 4); cbO.w.checked = !!(ov & 2); cbO.x.checked = !!(ov & 1);
		}

		octalInput.addEventListener('input', syncCheckboxes);

		function makeCb(key, checked) {
			return E('label', { 'class': 'nm-perm-check' }, [
				E('input', { 'type': 'checkbox', 'checked': checked, 'change': syncOctal }),
				' ' + key
			]);
		}

		cbU.r = makeCb('r', uR); cbU.w = makeCb('w', uW); cbU.x = makeCb('x', uX);
		cbG.r = makeCb('r', gR); cbG.w = makeCb('w', gW); cbG.x = makeCb('x', gX);
		cbO.r = makeCb('r', oR); cbO.w = makeCb('w', oW); cbO.x = makeCb('x', oX);

		var table = E('table', { 'class': 'nm-perm-table' }, [
			E('tr', {}, [E('th', {}), E('th', {}, _('Owner')), E('th', {}, _('Group')), E('th', {}, _('Other'))]),
			E('tr', {}, [E('td', {}, _('Read')),    E('td', {}, cbU.r), E('td', {}, cbG.r), E('td', {}, cbO.r)]),
			E('tr', {}, [E('td', {}, _('Write')),   E('td', {}, cbU.w), E('td', {}, cbG.w), E('td', {}, cbO.w)]),
			E('tr', {}, [E('td', {}, _('Execute')),  E('td', {}, cbU.x), E('td', {}, cbG.x), E('td', {}, cbO.x)])
		]);

		ui.showModal(_('Change Permissions') + ' - ' + path, [
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Octal')),
				E('div', { 'class': 'cbi-value-field' }, [octalInput])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('div', { 'class': 'cbi-value-field' }, [table])
			]),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
				E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': function() {
						var newPerms = octalInput.value.replace(/[^0-7]/g, '').slice(0, 3);
						if (newPerms.length < 3) {
							ui.addNotification(null, E('p', {}, _('Invalid permissions')), 'error');
							return;
						}
						ui.hideModal();
						callChmodFile(path.replace(ROOT_DIR + '/', ''), newPerms).then(function(result) {
							if (result && result.error) {
								ui.addNotification(null, E('p', {}, result.error), 'error');
							} else {
								ui.addNotification(null, E('p', {}, _('Permissions updated')), 'info');
								loadFileTree(document.getElementById('nm-file-tree'), currentDir);
							}
						}).catch(function(err) {
							ui.addNotification(null, E('p', {}, _('Failed to change permissions') + ': ' + (err.message || err)), 'error');
						});
					}
				}, _('Apply'))
			])
		]);
	}

	function renderEntries(parentEl, entries, dirPath) {
		var sorted = (entries || []).slice().sort(function(a, b) {
			if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
			return a.name.localeCompare(b.name);
		});

		sorted.forEach(function(entry) {
			var entryPerms = (entry.perms || '???');
			var hasPerms = /^[0-7]{3,4}$/.test(entryPerms);
			var permBadge = E('span', {
				'class': 'nm-perm-badge' + (hasPerms ? '' : ' nm-perm-badge-unknown'),
				'title': (entry.owner || '?') + ':' + (entry.group || '?') + ' ' + entryPerms,
				'click': hasPerms ? function(e) {
					e.stopPropagation();
					var filePath = dirPath ? ROOT_DIR + '/' + dirPath + '/' + entry.name : ROOT_DIR + '/' + entry.name;
					showChmodModal(filePath, entryPerms);
				} : null
			}, entryPerms);

			if (entry.type === 'dir') {
				var subDirPath = dirPath ? dirPath + '/' + entry.name : entry.name;
				var subItem = E('div', {
					'class': 'nm-file-tree-item nm-file-tree-dir',
					'click': function(e) {
						e.stopPropagation();
						this.classList.toggle('expanded');
						var children = this.nextElementSibling;
						if (children) {
							var wasHidden = children.style.display === 'none';
							children.style.display = wasHidden ? '' : 'none';
							if (wasHidden && children.getAttribute('data-loaded') !== '1') {
								children.setAttribute('data-loaded', '1');
								loadSubDir(children, subDirPath);
							}
						}
					}
				}, [E('span', {}, entry.name), permBadge]);
				parentEl.appendChild(subItem);

				var subChildren = E('div', { 'class': 'nm-file-tree-children', 'style': 'display:none' });
				parentEl.appendChild(subChildren);
			} else {
				var filePath = dirPath ? ROOT_DIR + '/' + dirPath + '/' + entry.name : ROOT_DIR + '/' + entry.name;
				var fileItem = E('div', {
					'class': 'nm-file-tree-item nm-file-tree-file',
					'click': function(e) {
						e.stopPropagation();
						loadFileContent(filePath);
						parentEl.querySelectorAll('.nm-file-tree-item.active').forEach(function(el) {
							el.classList.remove('active');
						});
						this.classList.add('active');
					}
				}, [E('span', {}, entry.name), permBadge]);
				parentEl.appendChild(fileItem);
			}
		});
	}

	var entries = (data && data.entries) || [];
	renderEntries(rootChildren, entries, currentDir);
}

function loadFileContent(path) {
	currentPath = path;
	var textarea = document.getElementById('nm-file-editor-textarea');
	var overlay = document.getElementById('nm-file-editor-overlay');
	var pathLabel = document.getElementById('nm-file-path-label');

	if (pathLabel) pathLabel.textContent = path;

	if (textarea) textarea.value = '';
	if (overlay) overlay.innerHTML = '';

	callGetFileReadonly(path).then(function(result) {
		if (result && result.error) {
			ui.addNotification(null, E('p', {}, result.error), 'error');
			return;
		}
		var content = (result && result.content) || '';
		if (textarea) {
			textarea.value = content;
			textarea.dispatchEvent(new Event('input'));
			textarea.dispatchEvent(new Event('scroll'));
		}
	}).catch(function(err) {
		ui.addNotification(null, E('p', {}, _('Failed to load file') + ': ' + (err.message || err)), 'error');
	});
}

function syncScroll() {
	var textarea = document.getElementById('nm-file-editor-textarea');
	var overlay = document.getElementById('nm-file-editor-overlay');
	if (textarea && overlay) {
		overlay.scrollTop = textarea.scrollTop;
		overlay.scrollLeft = textarea.scrollLeft;
	}
}

function updateHighlight() {
	var textarea = document.getElementById('nm-file-editor-textarea');
	var overlay = document.getElementById('nm-file-editor-overlay');
	if (textarea && overlay) {
		overlay.innerHTML = highlightNginx(textarea.value);
	}
}

function saveCurrentFile() {
	if (!currentPath) {
		ui.addNotification(null, E('p', {}, _('No file selected')), 'error');
		return;
	}
	var textarea = document.getElementById('nm-file-editor-textarea');
	if (!textarea) return;

	var content = textarea.value;
	ui.showModal(_('Saving...'), [E('p', {}, _('Please wait...'))]);
	callSaveFile(currentPath.replace(ROOT_DIR + '/', ''), content).then(function(result) {
		ui.hideModal();
		if (result && result.error) {
			ui.addNotification(null, E('p', {}, result.error), 'error');
		} else {
			ui.addNotification(null, E('p', {}, _('File saved successfully')), 'info');
		}
	}).catch(function(err) {
		ui.hideModal();
		ui.addNotification(null, E('p', {}, _('Failed to save file') + ': ' + (err.message || err)), 'error');
	});
}

return view.extend({
	load: function() {
		return callListFiles(currentDir);
	},

	render: function(data) {
		var container = E('div', { 'class': 'cbi-map' });
		utils.loadSharedCSS();

		container.appendChild(E('h2', { 'class': 'cbi-map-title' }, _('Files')));

		// Toolbar
		var toolbar = E('div', { 'class': 'cbi-section nm-file-toolbar' });

		var pathLabel = E('span', {
			'id': 'nm-file-path-label',
			'class': 'nm-file-path-label'
		}, '');
		toolbar.appendChild(pathLabel);

		var btnGroup = E('div', { 'class': 'nm-btn-group' });

		var saveBtn = E('button', {
			'class': 'cbi-button cbi-button-apply',
			'click': saveCurrentFile
		}, _('Save'));

		var refreshBtn = E('button', {
			'class': 'cbi-button',
			'click': function() {
				loadFileTree(document.getElementById('nm-file-tree'), currentDir);
			}
		}, _('Refresh'));

		var newFileBtn = E('button', {
			'class': 'cbi-button cbi-button-add',
			'click': function() {
				var nameInput = E('input', {
					'type': 'text',
					'class': 'cbi-input-text',
					'placeholder': 'new-file.conf'
				});
				ui.showModal(_('New File'), [
					E('p', {}, _('Create a new file in') + ' ' + ROOT_DIR + '/' + currentDir + '/'),
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('File Name')),
						E('div', { 'class': 'cbi-value-field' }, [nameInput])
					]),
					E('div', { 'class': 'right' }, [
						E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
						E('button', {
							'class': 'cbi-button cbi-button-apply',
							'click': function() {
								var name = nameInput.value.trim();
								if (!name) {
									ui.addNotification(null, E('p', {}, _('File name is required')), 'error');
									return;
								}
								ui.hideModal();
								var newPath = currentDir + '/' + name;
								ui.showModal(_('Creating...'), [E('p', {}, _('Please wait...'))]);
								callSaveFile(newPath, '').then(function(result) {
									ui.hideModal();
									if (result && result.error) {
										ui.addNotification(null, E('p', {}, result.error), 'error');
									} else {
										ui.addNotification(null, E('p', {}, _('File created')), 'info');
										loadFileTree(document.getElementById('nm-file-tree'), currentDir);
									}
								}).catch(function(err) {
									ui.hideModal();
									ui.addNotification(null, E('p', {}, _('Failed to create file') + ': ' + (err.message || err)), 'error');
								});
							}
						}, _('Create'))
					])
				]);
			}
		}, '\u271A ' + _('New File'));

		btnGroup.appendChild(newFileBtn);
		btnGroup.appendChild(refreshBtn);
		btnGroup.appendChild(saveBtn);
		toolbar.appendChild(btnGroup);
		container.appendChild(toolbar);

		// File manager layout
		var fmContainer = E('div', { 'class': 'nm-file-manager' });

		// File tree
		var fileTree = E('div', {
			'id': 'nm-file-tree',
			'class': 'nm-file-tree'
		});
		fmContainer.appendChild(fileTree);

		// Editor
		var editorContainer = E('div', { 'class': 'nm-file-editor' });

		var textarea = E('textarea', {
			'id': 'nm-file-editor-textarea',
			'spellcheck': 'false',
			'input': function() { updateHighlight(); },
			'scroll': function() { syncScroll(); }
		});

		var overlay = E('pre', {
			'id': 'nm-file-editor-overlay',
			'class': 'nm-highlight-layer',
			'aria-hidden': 'true'
		});

		editorContainer.appendChild(textarea);
		editorContainer.appendChild(overlay);
		fmContainer.appendChild(editorContainer);
		container.appendChild(E('div', { 'class': 'cbi-section' }, [fmContainer]));

		// Render file tree
		setTimeout(function() {
			renderFileTree(fileTree, data);
		}, 50);

		return utils.appendFooter(container, {
			project: 'Nginx Manager',
			repoUrl: 'https://github.com/hello-yunshu/luci-app-nginx-manager'
		});
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});