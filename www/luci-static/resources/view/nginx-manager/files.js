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
var CODE_EXTENSIONS = {
	conf: true, config: true, json: true, js: true, mjs: true, cjs: true,
	css: true, html: true, htm: true, xml: true, sh: true, ash: true,
	lua: true, py: true, php: true, rb: true, go: true, c: true, h: true,
	cpp: true, hpp: true, ts: true, tsx: true, jsx: true, yaml: true,
	yml: true, toml: true, ini: true, service: true, log: true
};
var TEXT_EXTENSIONS = {
	txt: true, text: true, md: true, markdown: true, crt: true, cer: true,
	pem: true, key: true, csr: true, cert: true, chain: true, bundle: true,
	pub: true, cnf: true, list: true, env: true, sample: true, example: true
};
var CODE_FILENAMES = {
	Makefile: true, Dockerfile: true, nginx: true, uci: true
};
var TEXT_FILENAMES = {
	hosts: true, hostname: true, passwd: true, group: true,
	shadow: true, authorized_keys: true, known_hosts: true
};
var FILE_ICON_TYPES = {
	'7z': { icon: 'archive', title: _('Archive') },
	apk: { icon: 'package', title: _('Package') },
	ash: { icon: 'sh', title: _('Shell') },
	avif: { icon: 'image', title: _('Image') },
	bak: { icon: 'backup', title: _('Backup') },
	backup: { icon: 'backup', title: _('Backup') },
	bin: { icon: 'binary', title: _('Binary') },
	bmp: { icon: 'image', title: _('Image') },
	bundle: { icon: 'cert', title: _('Certificate bundle') },
	c: { icon: 'c', title: 'C' },
	cc: { icon: 'cpp', title: 'C++' },
	cer: { icon: 'cert', title: _('Certificate') },
	cert: { icon: 'cert', title: _('Certificate') },
	chain: { icon: 'cert', title: _('Certificate chain') },
	cjs: { icon: 'js', title: _('JavaScript') },
	cnf: { icon: 'conf', title: _('Config') },
	config: { icon: 'conf', title: _('Config') },
	conf: { icon: 'nginx', title: _('Nginx config') },
	cpp: { icon: 'cpp', title: 'C++' },
	crt: { icon: 'cert', title: _('Certificate') },
	css: { icon: 'css', title: 'CSS' },
	csv: { icon: 'table', title: 'CSV' },
	csr: { icon: 'cert', title: _('Certificate request') },
	db: { icon: 'database', title: _('Database') },
	deb: { icon: 'package', title: _('Package') },
	der: { icon: 'cert', title: _('Certificate') },
	env: { icon: 'env', title: _('Environment file') },
	example: { icon: 'txt', title: _('Example file') },
	gif: { icon: 'image', title: _('Image') },
	go: { icon: 'go', title: 'Go' },
	gz: { icon: 'archive', title: _('Archive') },
	h: { icon: 'c', title: _('C header') },
	hpp: { icon: 'cpp', title: _('C++ header') },
	htm: { icon: 'html', title: 'HTML' },
	html: { icon: 'html', title: 'HTML' },
	ico: { icon: 'image', title: _('Icon') },
	ini: { icon: 'conf', title: 'INI' },
	ipk: { icon: 'package', title: _('OpenWrt package') },
	jpeg: { icon: 'image', title: _('Image') },
	jpg: { icon: 'image', title: _('Image') },
	js: { icon: 'js', title: _('JavaScript') },
	json: { icon: 'json', title: 'JSON' },
	jsx: { icon: 'js', title: 'JSX' },
	key: { icon: 'key', title: _('Private key') },
	list: { icon: 'list', title: _('List') },
	log: { icon: 'log', title: _('Log') },
	lua: { icon: 'lua', title: 'Lua' },
	md: { icon: 'md', title: _('Markdown') },
	markdown: { icon: 'md', title: _('Markdown') },
	mjs: { icon: 'js', title: _('JavaScript') },
	p12: { icon: 'cert', title: _('Certificate bundle') },
	pdf: { icon: 'pdf', title: 'PDF' },
	pem: { icon: 'cert', title: _('PEM certificate') },
	pfx: { icon: 'cert', title: _('Certificate bundle') },
	php: { icon: 'php', title: 'PHP' },
	png: { icon: 'image', title: _('Image') },
	pub: { icon: 'key', title: _('Public key') },
	py: { icon: 'py', title: 'Python' },
	rb: { icon: 'rb', title: 'Ruby' },
	rpm: { icon: 'package', title: _('Package') },
	sample: { icon: 'txt', title: _('Sample file') },
	service: { icon: 'service', title: _('Service unit') },
	sh: { icon: 'sh', title: _('Shell') },
	sql: { icon: 'database', title: 'SQL' },
	sqlite: { icon: 'database', title: _('SQLite database') },
	sqlite3: { icon: 'database', title: _('SQLite database') },
	svg: { icon: 'image', title: _('SVG image') },
	tar: { icon: 'archive', title: _('Archive') },
	tgz: { icon: 'archive', title: _('Archive') },
	toml: { icon: 'toml', title: 'TOML' },
	ts: { icon: 'ts', title: _('TypeScript') },
	tsv: { icon: 'table', title: 'TSV' },
	tsx: { icon: 'ts', title: 'TSX' },
	text: { icon: 'txt', title: _('Text') },
	txt: { icon: 'txt', title: _('Text') },
	webp: { icon: 'image', title: _('Image') },
	xml: { icon: 'xml', title: 'XML' },
	yaml: { icon: 'yaml', title: 'YAML' },
	yml: { icon: 'yaml', title: 'YAML' },
	zip: { icon: 'archive', title: _('Archive') }
};
var FILE_NAME_ICON_TYPES = {
	Dockerfile: { icon: 'docker', title: _('Dockerfile') },
	Makefile: { icon: 'make', title: _('Makefile') },
	authorized_keys: { icon: 'key', title: _('Authorized keys') },
	group: { icon: 'conf', title: _('Group file') },
	hosts: { icon: 'conf', title: _('Hosts file') },
	hostname: { icon: 'conf', title: _('Hostname file') },
	known_hosts: { icon: 'key', title: _('Known hosts') },
	nginx: { icon: 'nginx', title: _('Nginx config') },
	passwd: { icon: 'conf', title: _('Password file') },
	shadow: { icon: 'key', title: _('Shadow password file') },
	uci: { icon: 'conf', title: _('UCI config') }
};

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
	var value = Number(mode || 0) & 4095;
	var text = value.toString(8);
	while (text.length < 3) text = '0' + text;
	return text;
}

function formatTime(ts) {
	if (!ts) return '-';
	return new Date(ts * 1000).toLocaleString();
}

function escapeHtml(text) {
	return String(text || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function isCodeFile(path) {
	path = String(path || '');
	if (path.indexOf('/etc/config/') === 0 || path.indexOf('/etc/init.d/') === 0) return true;
	var name = String(path || '').split('/').pop() || '';
	if (CODE_FILENAMES[name]) return true;
	var dot = name.lastIndexOf('.');
	if (dot < 0) return false;
	return !!CODE_EXTENSIONS[name.substring(dot + 1).toLowerCase()];
}

function isEditableFile(path, entry) {
	if (entry && entry.type !== 'file') return false;
	if (isCodeFile(path)) return true;

	var name = String(path || '').split('/').pop() || '';
	if (TEXT_FILENAMES[name]) return true;

	var dot = name.lastIndexOf('.');
	if (dot < 0) return false;
	return !!TEXT_EXTENSIONS[name.substring(dot + 1).toLowerCase()];
}

function fileIconInfo(path, entry) {
	if (entry && entry.type === 'directory')
		return { className: 'nm-file-icon dir', attrs: {} };

	var name = String(path || '').split('/').pop() || '';
	var meta = FILE_NAME_ICON_TYPES[name];
	var dot = name.lastIndexOf('.');

	if (!meta && dot >= 0)
		meta = FILE_ICON_TYPES[name.substring(dot + 1).toLowerCase()];

	if (!meta)
		meta = { icon: 'generic', title: _('File') };

	return {
		className: 'nm-file-icon file file-type file-type-' + meta.icon + (isEditableFile(path, entry) ? ' editable' : ''),
		attrs: {
			'title': meta.title
		},
		icon: meta.icon
	};
}

function fileIconNode(path, entry) {
	var icon = fileIconInfo(path, entry);
	if (!icon.icon)
		return E('span', { 'class': icon.className, 'aria-hidden': 'true' });

	var svgNS = 'http://www.w3.org/2000/svg';
	var xlinkNS = 'http://www.w3.org/1999/xlink';
	var svg = document.createElementNS(svgNS, 'svg');
	var use = document.createElementNS(svgNS, 'use');
	var href = L.resource('nginx-manager/file-icons.svg') + '#file-' + icon.icon;

	svg.setAttribute('class', icon.className);
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('focusable', 'false');
	if (icon.attrs.title)
		svg.setAttribute('title', icon.attrs.title);
	use.setAttribute('href', href);
	use.setAttributeNS(xlinkNS, 'xlink:href', href);
	svg.appendChild(use);
	return svg;
}

function codeSyntax(path) {
	path = String(path || '');
	var name = String(path || '').split('/').pop() || '';
	var ext = name.indexOf('.') >= 0 ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : '';
	if (name === 'nginx.conf' || ext === 'conf') return 'nginx';
	if (ext === 'json') return 'json';
	if (ext === 'css') return 'css';
	if (ext === 'html' || ext === 'htm' || ext === 'xml') return 'html';
	if (ext === 'sh' || ext === 'ash' || path.indexOf('/etc/init.d/') === 0) return 'shell';
	return 'generic';
}

function splitComment(line, syntax) {
	var markers = syntax === 'json' ? [] : syntax === 'css' || syntax === 'html' ? [ '<!--', '/*' ] : [ '#', '//' ];
	var best = -1;
	markers.forEach(function(marker) {
		var idx = line.indexOf(marker);
		if (idx >= 0 && (best < 0 || idx < best)) best = idx;
	});
	return best >= 0 ? [ line.substring(0, best), line.substring(best) ] : [ line, '' ];
}

function highlightCodePart(code, syntax) {
	var strings = [];
	code = code.replace(/(&quot;(?:\\.|[^&])*?&quot;|'(?:\\.|[^'])*')/g, function(match) {
		var token = '\ue000' + String.fromCharCode(0xe001 + strings.length);
		strings.push('<span class="tok-str">' + match + '</span>');
		return token;
	});

	if (syntax === 'json') {
		code = code.replace(/\b(true|false|null)\b/g, '<span class="tok-key">$1</span>');
		code = code.replace(/([A-Za-z0-9_"\ue000-\uf8ff]+)(\s*:)/g, '<span class="tok-prop">$1</span>$2');
	} else if (syntax === 'nginx') {
		code = code.replace(/\b(server|location|listen|proxy_pass|upstream|return|if|set|include|root|index|ssl_certificate|ssl_certificate_key|ssl_protocols|ssl_ciphers|ssl_prefer_server_ciphers|ssl_session_cache|ssl_session_timeout|ssl_session_tickets|ssl_stapling|ssl_stapling_verify|ssl_trusted_certificate|ssl_buffer_size|add_header|error_page|access_log|error_log|http2|http3|quic|server_name|client_max_body_size|keepalive_timeout|sendfile|tcp_nopush|tcp_nodelay|gzip|server_tokens|resolver|resolver_timeout|proxy_set_header|proxy_redirect|proxy_buffering|proxy_connect_timeout|proxy_read_timeout|proxy_send_timeout|grpc_pass|try_files|autoindex|alias|rewrite)\b/g, '<span class="tok-key">$1</span>');
	} else if (syntax === 'shell') {
		code = code.replace(/\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|local|return|export|readonly|in)\b/g, '<span class="tok-key">$1</span>');
		code = code.replace(/(\$[{(]?[A-Za-z0-9_@#?*!-]+[})]?)/g, '<span class="tok-var">$1</span>');
	} else if (syntax === 'css') {
		code = code.replace(/([A-Za-z-]+)(\s*:)/g, '<span class="tok-prop">$1</span>$2');
		code = code.replace(/(@[A-Za-z-]+)/g, '<span class="tok-key">$1</span>');
	} else {
		code = code.replace(/\b(function|return|var|let|const|if|else|for|while|switch|case|break|continue|class|new|try|catch|true|false|null|undefined)\b/g, '<span class="tok-key">$1</span>');
	}

	code = code.replace(/\b([0-9]+(?:\.[0-9]+)?)([a-zA-Z%]+)?\b/g, '<span class="tok-num">$1$2</span>');
	code = code.replace(/\ue000([\ue001-\uf8ff])/g, function(_, idx) {
		return strings[idx.charCodeAt(0) - 0xe001] || '';
	});
	return code;
}

function highlightCode(text, path) {
	var syntax = codeSyntax(path);
	return String(text || '').split('\n').map(function(line) {
		var parts = splitComment(escapeHtml(line), syntax);
		var code = highlightCodePart(parts[0], syntax);
		return code + (parts[1] ? '<span class="tok-comment">' + parts[1] + '</span>' : '');
	}).join('\n') + '\n';
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

function showChmodModal(path, currentPerms) {
	if (blockIfUnsafe(path)) return;

	var octalInput = E('input', {
		'type': 'text',
		'class': 'cbi-input-text nm-perm-octal',
		'value': /^[0-7]{3,4}$/.test(currentPerms || '') ? currentPerms : '644',
		'maxlength': '4'
	});
	var boxes = { u: {}, g: {}, o: {} };

	function lowerPerms(value) {
		value = String(value || '').replace(/[^0-7]/g, '').slice(0, 4);
		while (value.length < 3) value += '0';
		return value;
	}

	function normalPerms(value) {
		value = lowerPerms(value);
		return value.length === 4 ? value.substring(1) : value;
	}

	function specialPerms(value) {
		value = lowerPerms(value);
		return value.length === 4 ? value.charAt(0) : '';
	}

	function syncCheckboxes() {
		var value = lowerPerms(octalInput.value);
		var normal = normalPerms(value);
		octalInput.value = value;
		[
			[ boxes.u, Number(normal.charAt(0)) ],
			[ boxes.g, Number(normal.charAt(1)) ],
			[ boxes.o, Number(normal.charAt(2)) ]
		].forEach(function(item) {
			item[0].r.checked = !!(item[1] & 4);
			item[0].w.checked = !!(item[1] & 2);
			item[0].x.checked = !!(item[1] & 1);
		});
	}

	function syncOctal() {
		function value(group) {
			return (group.r.checked ? 4 : 0) + (group.w.checked ? 2 : 0) + (group.x.checked ? 1 : 0);
		}
		octalInput.value = specialPerms(octalInput.value) + value(boxes.u) + value(boxes.g) + value(boxes.o);
	}

	function makeBox(group, key, label) {
		var input = E('input', {
			'type': 'checkbox',
			'change': syncOctal
		});
		boxes[group][key] = input;
		return E('label', { 'class': 'nm-perm-check' }, [ input, ' ' + label ]);
	}

	var table = E('table', { 'class': 'nm-perm-table' }, [
		E('tr', {}, [ E('th', {}), E('th', {}, _('Owner')), E('th', {}, _('Group')), E('th', {}, _('Other')) ]),
		E('tr', {}, [ E('td', {}, _('Read')), E('td', {}, makeBox('u', 'r', 'r')), E('td', {}, makeBox('g', 'r', 'r')), E('td', {}, makeBox('o', 'r', 'r')) ]),
		E('tr', {}, [ E('td', {}, _('Write')), E('td', {}, makeBox('u', 'w', 'w')), E('td', {}, makeBox('g', 'w', 'w')), E('td', {}, makeBox('o', 'w', 'w')) ]),
		E('tr', {}, [ E('td', {}, _('Execute')), E('td', {}, makeBox('u', 'x', 'x')), E('td', {}, makeBox('g', 'x', 'x')), E('td', {}, makeBox('o', 'x', 'x')) ])
	]);

	octalInput.addEventListener('input', syncCheckboxes);
	syncCheckboxes();

	ui.showModal(_('Change Permissions') + ' - ' + path, [
		E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, _('Octal')),
			E('div', { 'class': 'cbi-value-field' }, [octalInput])
		]),
		E('div', { 'class': 'cbi-value' }, [
			E('div', { 'class': 'cbi-value-field nm-perm-table-wrap' }, [table])
		]),
		E('div', { 'class': 'right' }, [
			E('button', { 'class': 'btn', 'click': function() { ui.hideModal(); } }, _('Cancel')),
			E('button', {
				'class': 'cbi-button cbi-button-apply',
				'click': function() {
					var newPerms = octalInput.value.replace(/[^0-7]/g, '');
					if (!/^[0-7]{3,4}$/.test(newPerms)) {
						ui.addNotification(null, E('p', {}, _('Invalid permissions')), 'error');
						return;
					}

					fs.exec('chmod', [newPerms, path]).then(function(res) {
						if (res.code !== 0) throw new Error(res.stderr || res.stdout || res.code);
						ui.hideModal();
						ui.addNotification(null, E('p', {}, _('Permissions updated')), 'info');
						loadDirectory(currentPath);
					}).catch(function(err) {
						showError(_('Failed to change permissions'), err);
					});
				}
			}, _('Apply'))
		])
	]);
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

function pushAction(actions, button) {
	actions.push(button);
}

function selectRow(tbody, row, path) {
	selectedPath = path;
	Array.prototype.forEach.call(tbody.querySelectorAll('tr.nm-file-row.active'), function(activeRow) {
		activeRow.classList.remove('active');
	});
	row.classList.add('active');
}

function renderRows(tbody) {
	tbody.innerHTML = '';

	if (currentPath !== '/') {
		var parent = parentPath(currentPath);
		tbody.appendChild(E('tr', {
			'class': 'tr nm-file-row nm-file-row-parent nm-file-openable' + (selectedPath === parent ? ' active' : ''),
			'click': function() {
				selectRow(tbody, this, parent);
			},
			'dblclick': function() {
				loadDirectory(parent);
			}
		}, [
			E('td', { 'class': 'td nm-file-name', 'data-label': _('Name') }, [
				E('span', { 'class': 'nm-file-name-main' }, [
					E('span', { 'class': 'nm-file-icon parent', 'aria-hidden': 'true' }),
					E('span', { 'class': 'nm-file-name-text' }, '..')
				])
			]),
			E('td', { 'class': 'td', 'data-label': _('Type') }, _('Directory')),
			E('td', { 'class': 'td', 'data-label': _('Size') }, '-'),
			E('td', { 'class': 'td', 'data-label': _('Perms') }, '-'),
			E('td', { 'class': 'td', 'data-label': _('Modified') }, '-'),
			E('td', { 'class': 'td nowrap nm-file-actions', 'data-label': _('Actions') }, [
				E('button', {
					'class': 'cbi-button cbi-button-neutral',
					'click': function(ev) {
						ev.stopPropagation();
						loadDirectory(parentPath(currentPath));
					}
				}, _('Open'))
			])
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
		var editable = !isDir && isEditableFile(path, entry);
		var perms = modeToPerms(entry.mode);
		var actions = [];

		if (isDir) {
			pushAction(actions, E('button', {
				'class': 'cbi-button cbi-button-neutral',
				'click': function(ev) {
					ev.stopPropagation();
					loadDirectory(path);
				}
			}, _('Open')));
		} else {
			if (editable) {
				pushAction(actions, E('button', {
					'class': 'cbi-button cbi-button-neutral',
					'click': function(ev) {
						ev.stopPropagation();
						openEditor(path, entry);
					}
				}, _('Edit')));
			}
			pushAction(actions, E('button', {
				'class': 'cbi-button',
				'click': function(ev) {
					ev.stopPropagation();
					downloadFile(path);
				}
			}, _('Download')));
		}

		pushAction(actions, E('button', {
			'class': 'cbi-button',
			'click': function(ev) {
				ev.stopPropagation();
				showRenameModal(path, entry.name);
			}
		}, _('Rename')));

		pushAction(actions, E('button', {
			'class': 'cbi-button cbi-button-remove',
			'click': function(ev) {
				ev.stopPropagation();
				showDeleteModal(path, entry);
			}
		}, _('Delete')));

		var row = E('tr', {
			'class': 'tr nm-file-row ' + (isDir ? 'nm-file-row-dir ' : '') + (isDir || editable ? 'nm-file-openable ' : '') + (editable ? 'nm-file-editable ' : '') + (selectedPath === path ? 'active' : ''),
			'click': function() {
				selectRow(tbody, this, path);
			},
			'dblclick': function() {
				if (isDir) loadDirectory(path);
				else if (editable) openEditor(path, entry);
			}
		}, [
			E('td', { 'class': 'td nm-file-name', 'data-label': _('Name') }, [
				E('span', { 'class': 'nm-file-name-main' }, [
					fileIconNode(path, entry),
					E('span', { 'class': 'nm-file-name-text' }, entry.name)
				])
			]),
			E('td', { 'class': 'td', 'data-label': _('Type') }, entry.type || '-'),
			E('td', { 'class': 'td nowrap', 'data-label': _('Size') }, isDir ? '-' : formatSize(entry.size)),
			E('td', {
				'class': 'td nowrap nm-file-perms',
				'data-label': _('Perms'),
				'title': _('Change Permissions'),
				'click': function(ev) {
					ev.stopPropagation();
					showChmodModal(path, perms);
				}
			}, perms),
			E('td', { 'class': 'td nowrap', 'data-label': _('Modified') }, formatTime(entry.mtime)),
			E('td', { 'class': 'td nowrap nm-file-actions', 'data-label': _('Actions') }, actions)
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
	if (!isEditableFile(path, entry)) return;
	if (blockIfUnsafe(path)) return;

	setStatus(_('Loading...'));
	fs.read(path).then(function(content) {
		setStatus('');
		var codeFile = isCodeFile(path);
		var highlight = null;
		var textarea = E('textarea', {
			'id': 'nm-file-editor-textarea',
			'class': 'cbi-input-textarea' + (codeFile ? ' nm-code-textarea' : ''),
			'spellcheck': 'false'
		});
		textarea.value = content || '';

		if (codeFile) {
			highlight = E('pre', {
				'class': 'nm-code-highlight',
				'aria-hidden': 'true'
			});

			var updateHighlight = function() {
				highlight.innerHTML = highlightCode(textarea.value, path);
			};
			var syncHighlightScroll = function() {
				highlight.scrollTop = textarea.scrollTop;
				highlight.scrollLeft = textarea.scrollLeft;
			};

			textarea.addEventListener('input', updateHighlight);
			textarea.addEventListener('scroll', syncHighlightScroll);
			updateHighlight();
		}

		ui.showModal(_('Edit') + ' - ' + path, [
			E('div', { 'class': 'nm-file-editor-modal' + (codeFile ? ' nm-code-editor' : '') }, codeFile ? [highlight, textarea] : [textarea]),
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
			E('table', { 'class': 'table cbi-section-table nm-responsive-table nm-file-table' }, [
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
