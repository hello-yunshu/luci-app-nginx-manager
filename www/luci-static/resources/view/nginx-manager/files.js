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
		childrenEl.innerHTML = E('div', { 'class': 'nm-file-tree-item' }, _('Loading...'));
		callListFiles(subDirPath).then(function(subData) {
			childrenEl.innerHTML = '';
			var subEntries = (subData && subData.entries) || [];
			renderEntries(childrenEl, subEntries, subDirPath);
		}).catch(function() {
			childrenEl.innerHTML = '';
		});
	}

	function renderEntries(parentEl, entries, dirPath) {
		var sorted = (entries || []).slice().sort(function(a, b) {
			if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
			return a.name.localeCompare(b.name);
		});

		sorted.forEach(function(entry) {
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
				}, entry.name);
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
				}, entry.name);
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
		var toolbar = E('div', { 'class': 'cbi-section' });

		var pathLabel = E('span', {
			'id': 'nm-file-path-label',
			'class': 'nm-file-path-label'
		}, '');
		toolbar.appendChild(pathLabel);

		var btnGroup = E('div', { 'class': 'nm-btn-group', 'style': 'float:right' });

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
						nameInput
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