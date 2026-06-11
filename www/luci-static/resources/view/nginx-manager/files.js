'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require view';
'require fs';
'require ui';
'require rpc';
'require nginx-manager/utils as utils';

var DEFAULT_DIR = '/etc/nginx';
var currentPath = DEFAULT_DIR;
var currentEntries = [];
var selectedPath = '';
var BLOCKED_ROOTS = [ '/proc', '/sys', '/dev' ];

function normalizePath(path) {
	path = (path || '/').trim();
	if (path === '') path = '/';
	if (path.charAt(0) !== '/') path = '/' + path;

	var parts = [];
	path.split('/').forEach(function(part) {
		if (!part || part === '.') return;
		if (part === '..') parts.pop();
		else parts.push(part);
	});

	return '/' + parts.join('/');
}

function joinPath(dir, name) {
	dir = normalizePath(dir);
	return dir === '/' ? '/' + name : dir + '/' + name;
}

function parentPath(path) {
	path = normalizePath(path);
	if (path === '/') return '/';
	var idx = path.lastIndexOf('/');
	return idx <= 0 ? '/' : path.substring(0, idx);
}

function isBlockedPath(path) {
	path = normalizePath(path);
	return BLOCKED_ROOTS.some(function(root) {
		return path === root || path.indexOf(root + '/') === 0;
	});
}

function blockIfUnsafe(path) {
	if (!isBlockedPath(path))
		return false;

	ui.addNotification(null, E('p', {}, _('System virtual directories cannot be modified')), 'error');
	return true;
}

function formatSize(bytes) {
	bytes = Number(bytes || 0);
	if (bytes < 1024) return bytes + ' B';
	var units = ['KB', 'MB', 'GB', 'TB'];
	var size = bytes / 1024;
	var unit = 0;
	while (size >= 1024 && unit < units.length - 1) {
		size = size / 1024;
		unit++;
	}
	return size.toFixed(size >= 10 ? 0 : 1) + ' ' + units[unit];
}

function modeToPerms(mode) {
	var value = Number(mode || 0) & 511;
	var text = value.toString(8);
	while (text.length < 3) text = '0' + text;
	return text;
}

function formatTime(ts) {
	if (!ts) return '-';
	return new Date(ts * 1000).toLocaleString();
}

function showError(prefix, err) {
	ui.addNotification(null, E('p', {}, prefix + ': ' + (err && err.message ? err.message : err)), 'error');
}

function showPathConfirmModal(title, message, path, actionLabel, buttonClass, callback) {
	var input = E('input', {
		'type': 'text',
		'class': 'cbi-input-text',
		'placeholder': path
	});

	ui.showModal(title, [
		E('p', {}, message),
		E('pre', { 'class': 'nm-file-confirm-path' }, path),
		E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, _('Confirm Path')),
			E('div', { 'class': 'cbi-value-field' }, [input])
		]),
		E('div', { 'class': 'right' }, [
			E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
			E('button', {
				'class': buttonClass,
				'click': function() {
					if (input.value.trim() !== path) {
						ui.addNotification(null, E('p', {}, _('Path confirmation does not match')), 'error');
						return;
					}
					callback();
				}
			}, actionLabel)
		])
	]);
}

function validateEntryName(name) {
	if (!name) return _('Name is required');
	if (name === '.' || name === '..' || name.indexOf('/') !== -1) {
		return _('Name cannot contain slashes or parent directory references');
	}
	return '';
}

function setStatus(text) {
	var el = document.getElementById('nm-file-status');
	if (el) el.textContent = text || '';
}

function sortEntries(entries) {
	return (entries || []).slice().sort(function(a, b) {
		if (a.type !== b.type) {
			if (a.type === 'directory') return -1;
			if (b.type === 'directory') return 1;
		}
		return String(a.name || '').localeCompare(String(b.name || ''));
	});
}

function uploadFile(path, file) {
	return new Promise(function(resolve, reject) {
		var formData = new FormData();
		formData.append('sessionid', rpc.getSessionID());
		formData.append('filename', path);
		formData.append('filedata', file);

		var xhr = new XMLHttpRequest();
		xhr.open('POST', L.env.cgi_base + '/cgi-upload', true);
		xhr.onload = function() {
			if (xhr.status === 200) resolve(xhr.responseText);
			else reject(new Error(xhr.statusText || xhr.responseText || xhr.status));
		};
		xhr.onerror = function() {
			reject(new Error(_('Network error')));
		};
		xhr.send(formData);
	});
}

function downloadFile(path) {
	fs.read_direct(path, 'blob').then(function(blob) {
		var url = URL.createObjectURL(blob);
		var a = document.createElement('a');
		a.href = url;
		a.download = path.split('/').pop() || 'download';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}).catch(function(err) {
		showError(_('Failed to download'), err);
	});
}

function renderRows(tbody) {
	tbody.innerHTML = '';

	if (currentPath !== '/') {
		tbody.appendChild(E('tr', {
			'class': 'tr',
			'click': function() { loadDirectory(parentPath(currentPath)); }
		}, [
			E('td', { 'class': 'td nm-file-name' }, '..'),
			E('td', { 'class': 'td' }, _('Directory')),
			E('td', { 'class': 'td' }, '-'),
			E('td', { 'class': 'td' }, '-'),
			E('td', { 'class': 'td' }, '-'),
			E('td', { 'class': 'td' }, '')
		]));
	}

	if (!currentEntries.length) {
		tbody.appendChild(E('tr', {}, [
			E('td', { 'class': 'td center', 'colspan': '6' }, _('No files'))
		]));
		return;
	}

	currentEntries.forEach(function(entry) {
		var path = joinPath(currentPath, entry.name);
		var isDir = entry.type === 'directory';
		var row = E('tr', {
			'class': selectedPath === path ? 'tr active' : 'tr',
			'click': function() {
				selectedPath = path;
				renderRows(tbody);
			},
			'dblclick': function() {
				if (isDir) loadDirectory(path);
				else openEditor(path, entry);
			}
		}, [
			E('td', { 'class': 'td nm-file-name' }, [
				E('span', { 'class': isDir ? 'nm-file-icon dir' : 'nm-file-icon file' }, isDir ? '[D]' : '[F]'),
				' ',
				E('span', {}, entry.name)
			]),
			E('td', { 'class': 'td' }, entry.type || '-'),
			E('td', { 'class': 'td nowrap' }, isDir ? '-' : formatSize(entry.size)),
			E('td', { 'class': 'td nowrap' }, modeToPerms(entry.mode)),
			E('td', { 'class': 'td nowrap' }, formatTime(entry.mtime)),
			E('td', { 'class': 'td nowrap' }, [
				isDir ? E('button', {
					'class': 'cbi-button cbi-button-neutral',
					'click': function(ev) {
						ev.stopPropagation();
						loadDirectory(path);
					}
				}, _('Open')) : E('button', {
					'class': 'cbi-button cbi-button-neutral',
					'click': function(ev) {
						ev.stopPropagation();
						openEditor(path, entry);
					}
				}, _('Edit')),
				' ',
				!isDir ? E('button', {
					'class': 'cbi-button',
					'click': function(ev) {
						ev.stopPropagation();
						downloadFile(path);
					}
				}, _('Download')) : '',
				' ',
				E('button', {
					'class': 'cbi-button',
					'click': function(ev) {
						ev.stopPropagation();
						showRenameModal(path, entry.name);
					}
				}, _('Rename')),
				' ',
				E('button', {
					'class': 'cbi-button cbi-button-remove',
					'click': function(ev) {
						ev.stopPropagation();
						showDeleteModal(path, entry);
					}
				}, _('Delete'))
			])
		]);
		tbody.appendChild(row);
	});
}

function loadDirectory(path) {
	path = normalizePath(path);
	if (isBlockedPath(path)) {
		setStatus('');
		ui.addNotification(null, E('p', {}, _('System virtual directories cannot be opened')), 'error');
		return Promise.resolve();
	}

	var input = document.getElementById('nm-file-path-input');
	var tbody = document.getElementById('nm-file-list-body');

	if (input) input.value = path;
	setStatus(_('Loading...'));

	return fs.list(path).then(function(entries) {
		currentPath = path;
		currentEntries = sortEntries(entries);
		selectedPath = '';
		if (input) input.value = currentPath;
		if (tbody) renderRows(tbody);
		setStatus(currentEntries.length + ' ' + _('items'));
	}).catch(function(err) {
		setStatus('');
		showError(_('Failed to load directory'), err);
	});
}

function openEditor(path, entry) {
	if (entry && entry.type !== 'file') return;
	if (blockIfUnsafe(path)) return;

	setStatus(_('Loading...'));
	fs.read(path).then(function(content) {
		setStatus('');
		var textarea = E('textarea', {
			'id': 'nm-file-editor-textarea',
			'class': 'cbi-input-textarea',
			'spellcheck': 'false'
		});
		textarea.value = content || '';

		ui.showModal(_('Edit') + ' - ' + path, [
			E('div', { 'class': 'nm-file-editor-modal' }, [textarea]),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
				E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': function() {
						if (blockIfUnsafe(path)) return;
						fs.write(path, textarea.value).then(function() {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, _('File saved successfully')), 'info');
							loadDirectory(currentPath);
						}).catch(function(err) {
							showError(_('Save failed'), err);
						});
					}
				}, _('Save'))
			])
		]);
	}).catch(function(err) {
		setStatus('');
		showError(_('Failed to load file'), err);
	});
}

function showNewFileModal() {
	var input = E('input', {
		'type': 'text',
		'class': 'cbi-input-text',
		'placeholder': 'example.conf'
	});

	ui.showModal(_('New File'), [
		E('p', {}, _('Create a new file in') + ' ' + currentPath),
		E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, _('File Name')),
			E('div', { 'class': 'cbi-value-field' }, [input])
		]),
		E('div', { 'class': 'right' }, [
			E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
			E('button', {
				'class': 'cbi-button cbi-button-apply',
				'click': function() {
					var name = input.value.trim();
					var validationError = validateEntryName(name);
					if (validationError) {
						ui.addNotification(null, E('p', {}, !name ? _('File name is required') : validationError), 'error');
						return;
					}
					var path = joinPath(currentPath, name);
					if (blockIfUnsafe(path)) return;

					fs.write(path, '').then(function() {
						ui.hideModal();
						ui.addNotification(null, E('p', {}, _('File created')), 'info');
						loadDirectory(currentPath);
					}).catch(function(err) {
						showError(_('Failed to create file'), err);
					});
				}
			}, _('Create'))
		])
	]);
}

function showNewDirModal() {
	var input = E('input', {
		'type': 'text',
		'class': 'cbi-input-text',
		'placeholder': 'sites'
	});

	ui.showModal(_('New Directory'), [
		E('p', {}, _('Create a new directory in') + ' ' + currentPath),
		E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, _('Directory Name')),
			E('div', { 'class': 'cbi-value-field' }, [input])
		]),
		E('div', { 'class': 'right' }, [
			E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
			E('button', {
				'class': 'cbi-button cbi-button-apply',
				'click': function() {
					var name = input.value.trim();
					var validationError = validateEntryName(name);
					if (validationError) {
						ui.addNotification(null, E('p', {}, !name ? _('Directory name is required') : validationError), 'error');
						return;
					}
					var path = joinPath(currentPath, name);
					if (blockIfUnsafe(path)) return;

					fs.exec('mkdir', [path]).then(function(res) {
						if (res.code !== 0) throw new Error(res.stderr || res.stdout || res.code);
						ui.hideModal();
						ui.addNotification(null, E('p', {}, _('Directory created')), 'info');
						loadDirectory(currentPath);
					}).catch(function(err) {
						showError(_('Failed to create directory'), err);
					});
				}
			}, _('Create'))
		])
	]);
}

function showRenameModal(path, oldName) {
	var input = E('input', {
		'type': 'text',
		'class': 'cbi-input-text',
		'value': oldName
	});

	ui.showModal(_('Rename'), [
		E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, _('New Name')),
			E('div', { 'class': 'cbi-value-field' }, [input])
		]),
		E('div', { 'class': 'right' }, [
			E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
			E('button', {
				'class': 'cbi-button cbi-button-apply',
				'click': function() {
					var name = input.value.trim();
					var validationError = validateEntryName(name);
					if (validationError) {
						ui.addNotification(null, E('p', {}, validationError), 'error');
						return;
					}
					var target = joinPath(parentPath(path), name);
					if (blockIfUnsafe(path) || blockIfUnsafe(target)) return;

					fs.exec('mv', [path, target]).then(function(res) {
						if (res.code !== 0) throw new Error(res.stderr || res.stdout || res.code);
						ui.hideModal();
						ui.addNotification(null, E('p', {}, _('Renamed successfully')), 'info');
						loadDirectory(currentPath);
					}).catch(function(err) {
						showError(_('Failed to rename'), err);
					});
				}
			}, _('Rename'))
		])
	]);
}

function showDeleteModal(path, entry) {
	if (normalizePath(path) === '/') {
		ui.addNotification(null, E('p', {}, _('Cannot delete root directory')), 'error');
		return;
	}
	if (blockIfUnsafe(path)) return;

	showPathConfirmModal(_('Confirm Delete'),
		_('Type the full path to confirm deletion. This operation cannot be undone.'),
		path,
		_('Delete'),
		'cbi-button cbi-button-remove',
		function() {
			var task = entry && entry.type === 'directory'
				? fs.exec('rm', ['-rf', path]).then(function(res) {
					if (res.code !== 0) throw new Error(res.stderr || res.stdout || res.code);
				})
				: fs.remove(path);

			task.then(function() {
				ui.hideModal();
				ui.addNotification(null, E('p', {}, _('Deleted successfully')), 'info');
				loadDirectory(currentPath);
			}).catch(function(err) {
				showError(_('Failed to delete'), err);
			});
		});
}

function triggerUpload() {
	var input = E('input', {
		'type': 'file',
		'style': 'display:none',
		'change': function() {
			if (!input.files || !input.files.length) return;
			var file = input.files[0];
			var target = joinPath(currentPath, file.name);
			if (input.parentNode) input.parentNode.removeChild(input);
			if (blockIfUnsafe(target)) return;

			var performUpload = function() {
				setStatus(_('Uploading...'));
				uploadFile(target, file).then(function() {
					setStatus('');
					ui.addNotification(null, E('p', {}, _('File uploaded successfully')), 'info');
					loadDirectory(currentPath);
				}).catch(function(err) {
					setStatus('');
					showError(_('Upload failed'), err);
				});
			};

			fs.stat(target).then(function() {
				showPathConfirmModal(_('Confirm Overwrite'),
					_('Type the full path to confirm overwriting the existing file.'),
					target,
					_('Upload'),
					'cbi-button cbi-button-apply',
					performUpload);
			}).catch(performUpload);
		}
	});
	document.body.appendChild(input);
	input.click();
}

return view.extend({
	load: function() {
		return fs.list(DEFAULT_DIR).then(function(entries) {
			return { path: DEFAULT_DIR, entries: entries };
		}).catch(function() {
			return fs.list('/').then(function(entries) {
				return { path: '/', entries: entries };
			});
		});
	},

	render: function(data) {
		var container = E('div', { 'class': 'cbi-map' });
		utils.loadSharedCSS();

		if (data && Array.isArray(data.entries)) {
			currentPath = data.path || DEFAULT_DIR;
			currentEntries = sortEntries(data.entries);
		}

		container.appendChild(E('h2', { 'class': 'cbi-map-title' }, _('Files')));

		var pathInput = E('input', {
			'id': 'nm-file-path-input',
			'type': 'text',
			'class': 'cbi-input-text',
			'value': currentPath,
			'keydown': function(ev) {
				if (ev.key === 'Enter') loadDirectory(pathInput.value);
			}
		});

		var tbody = E('tbody', { 'id': 'nm-file-list-body' });

		container.appendChild(E('div', { 'class': 'cbi-section nm-file-toolbar' }, [
			E('div', { 'class': 'nm-file-path-row' }, [
				E('button', {
					'class': 'cbi-button',
					'click': function() { loadDirectory(parentPath(currentPath)); }
				}, _('Back')),
				pathInput,
				E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': function() { loadDirectory(pathInput.value); }
				}, _('Go'))
			]),
			E('div', { 'class': 'nm-btn-group' }, [
				E('button', { 'class': 'cbi-button', 'click': function() { loadDirectory(currentPath); } }, _('Refresh')),
				E('button', { 'class': 'cbi-button cbi-button-add', 'click': showNewFileModal }, _('New File')),
				E('button', { 'class': 'cbi-button cbi-button-add', 'click': showNewDirModal }, _('New Directory')),
				E('button', { 'class': 'cbi-button', 'click': triggerUpload }, _('Upload'))
			]),
			E('div', { 'id': 'nm-file-status', 'class': 'nm-file-status' }, '')
		]));

		container.appendChild(E('div', { 'class': 'cbi-section nm-file-table-wrap' }, [
			E('table', { 'class': 'table cbi-section-table nm-file-table' }, [
				E('thead', {}, [
					E('tr', { 'class': 'tr cbi-section-table-titles' }, [
						E('th', { 'class': 'th' }, _('Name')),
						E('th', { 'class': 'th' }, _('Type')),
						E('th', { 'class': 'th' }, _('Size')),
						E('th', { 'class': 'th' }, _('Perms')),
						E('th', { 'class': 'th' }, _('Modified')),
						E('th', { 'class': 'th' }, _('Actions'))
					])
				]),
				tbody
			])
		]));

		setTimeout(function() {
			renderRows(tbody);
			setStatus(currentEntries.length + ' ' + _('items'));
		}, 0);

		return utils.appendFooter(container, {
			project: 'Nginx Manager',
			repoUrl: 'https://github.com/hello-yunshu/luci-app-nginx-manager'
		});
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
