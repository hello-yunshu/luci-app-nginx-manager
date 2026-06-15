'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require baseclass';
'require uci';

var FOOTER_VERSION = '@PKG_VERSION@';

function loadSharedCSS() {
	if (!document.getElementById('nm-shared-css')) {
		var link = E('link', {
			'id': 'nm-shared-css',
			'rel': 'stylesheet',
			'href': L.resource('nginx-manager/nginx-manager.css') + '?v=@PKG_VERSION@'
		});
		document.head.appendChild(link);
	}
}

function footerSeparator(extraClass) {
	var className = 'ys-tool-footer-separator';
	if (extraClass)
		className += ' ' + extraClass;
	return E('span', { 'class': className }, '\u00a0·\u00a0');
}

function footerIcon(name) {
	var svgNS = 'http://www.w3.org/2000/svg';
	var svg = document.createElementNS(svgNS, 'svg');
	var path = document.createElementNS(svgNS, 'path');

	svg.setAttribute('class', 'ys-tool-footer-link-icon ' + name);
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('width', '14');
	svg.setAttribute('height', '14');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('focusable', 'false');
	svg.setAttribute('style', 'width:1em;height:1em;max-width:1em;max-height:1em;display:inline-block;flex:0 0 auto;vertical-align:-0.125em');

	if (name === 'github') {
		path.setAttribute('fill', 'currentColor');
		path.setAttribute('d', 'M12 2C6.48 2 2 6.58 2 12.26c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49v-1.9c-2.78.62-3.37-1.22-3.37-1.22-.45-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.36 9.36 0 0 1 12 6.97c.85 0 1.71.12 2.51.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9v2.82c0 .27.18.59.69.49A10.24 10.24 0 0 0 22 12.26C22 6.58 17.52 2 12 2z');
	} else if (name === 'x') {
		path.setAttribute('fill', 'currentColor');
		path.setAttribute('d', 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z');
	} else {
		return null;
	}

	svg.appendChild(path);
	return svg;
}

function footerLink(href, label, icon) {
	var children = [];
	var iconNode = icon ? footerIcon(icon) : null;
	if (iconNode)
		children.push(iconNode);
	children.push(E('span', { 'class': 'ys-tool-footer-link-label' }, label));

	return E('a', {
		'class': 'ys-tool-footer-link' + (icon ? ' ' + icon : ''),
		'href': href,
		'target': '_blank',
		'rel': 'noopener noreferrer'
	}, children);
}

function footerVersion(version) {
	var value = version && version !== '-' ? version : FOOTER_VERSION;
	if (!value || value === '-' || value.charAt(0) === '@')
		return '';
	return /^v/i.test(value) ? value : 'v' + value;
}

function renderFooter(options) {
	options = options || {};
	var project = options.project || 'Nginx Manager';
	var version = footerVersion(options.version);
	var repoUrl = options.repoUrl || 'https://github.com/hello-yunshu/luci-app-nginx-manager';

	return E('footer', { 'class': 'ys-tool-footer' }, [
		E('div', { 'class': 'ys-tool-footer-brand' }, [
			E('span', { 'class': 'ys-tool-footer-mark' }, '云云舒'),
			footerSeparator('ys-tool-footer-title-separator'),
			E('span', { 'class': 'ys-tool-footer-title' }, project),
			version ? footerSeparator('ys-tool-footer-version-separator') : '',
			version ? E('span', { 'class': 'ys-tool-footer-version' }, version) : ''
		]),
		E('div', { 'class': 'ys-tool-footer-links' }, [
			E('span', { 'class': 'ys-tool-footer-project-link' }, footerLink(repoUrl, 'Project')),
			footerSeparator('ys-tool-footer-project-separator'),
			footerLink('https://github.com/hello-yunshu', 'GitHub', 'github'),
			footerSeparator(),
			footerLink('https://x.com/yunyunyshu', '@云云舒', 'x')
		])
	]);
}

function appendFooter(node, options) {
	loadSharedCSS();
	if (node)
		node.appendChild(renderFooter(options));
	return node;
}

function renderWithFooter(rendered, options) {
	return Promise.resolve(rendered).then(function(node) {
		return appendFooter(node, options);
	});
}

function getErrorMessage(err) {
	if (!err)
		return '';
	if (err.message)
		return String(err.message);
	if (typeof err === 'string')
		return err;
	if (typeof err.toString === 'function')
		return err.toString();
	return '';
}

function isApplyNoDataError(err) {
	var msg = getErrorMessage(err);
	return err && (err.code === 5 || /ubus code 5|No data|未收到数据/i.test(msg));
}

function safeApply() {
	return uci.apply().catch(function(err) {
		if (isApplyNoDataError(err))
			return null;
		throw err;
	});
}

var NAME_PATTERN = /^[a-zA-Z0-9_][a-zA-Z0-9._-]*$/;
var NAME_TIP = _('Letters, digits, underscore to start; dots and hyphens are also allowed after that.');

function validateNameInput(inputEl, descEl) {
	var tip = descEl || inputEl.parentNode.querySelector('.cbi-value-description');
	function check() {
		var val = inputEl.value;
		var valid = !val || NAME_PATTERN.test(val);
		inputEl.style.borderColor = valid ? '' : 'var(--danger-color, #d94b4b)';
		inputEl.style.backgroundColor = valid ? '' : 'rgba(217,75,75,0.05)';
		if (tip) {
			tip.style.color = valid ? '' : 'var(--danger-color, #d94b4b)';
			tip.style.fontWeight = valid ? '' : 'bold';
		}
	}
	inputEl.addEventListener('input', check);
	check();
	return check;
}

/* === Code Editor Helpers (shared with files.js) === */

function escapeHtml(text) {
	return String(text || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function codeSyntax(path) {
	path = String(path || '');
	var name = path.split('/').pop() || '';
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

	if (syntax === 'nginx') {
		code = code.replace(/\b(server|location|listen|proxy_pass|upstream|return|if|set|include|root|index|ssl_certificate|ssl_certificate_key|ssl_protocols|ssl_ciphers|ssl_prefer_server_ciphers|ssl_session_cache|ssl_session_timeout|ssl_session_tickets|ssl_stapling|ssl_stapling_verify|ssl_trusted_certificate|ssl_buffer_size|add_header|error_page|access_log|error_log|http2|http3|http3_stream_buffer_size|quic|server_name|client_max_body_size|keepalive_timeout|sendfile|tcp_nopush|tcp_nodelay|gzip|server_tokens|resolver|resolver_timeout|proxy_set_header|proxy_redirect|proxy_buffering|proxy_connect_timeout|proxy_read_timeout|proxy_send_timeout|grpc_pass|try_files|autoindex|alias|rewrite)\b/g, '<span class="tok-key">$1</span>');
	} else if (syntax === 'json') {
		code = code.replace(/\b(true|false|null)\b/g, '<span class="tok-key">$1</span>');
		code = code.replace(/([A-Za-z0-9_"\ue000-\uf8ff]+)(\s*:)/g, '<span class="tok-prop">$1</span>$2');
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

/**
 * Create a code editor widget with syntax highlighting.
 * Uses nm-code-editor layout (highlight overlay + transparent textarea).
 * @param {string} content - Initial content
 * @param {string} path - File path (used for syntax detection)
 * @param {object} [options] - Options
 * @param {boolean} [options.readonly=true] - Whether the editor is read-only
 * @returns {object} Editor widget with { container, textarea, highlight, setContent, setReadonly }
 */
function createCodeEditor(content, path, options) {
	options = options || {};
	var readonly = options.readonly !== false;

	var textarea = E('textarea', {
		'class': 'nm-code-textarea',
		'spellcheck': 'false'
	});
	textarea.value = content || '';

	var highlight = E('pre', {
		'class': 'nm-code-highlight',
		'aria-hidden': 'true'
	});

	var updateHighlight = function() {
		highlight.innerHTML = highlightCode(textarea.value, path);
	};
	var syncScroll = function() {
		highlight.scrollTop = textarea.scrollTop;
		highlight.scrollLeft = textarea.scrollLeft;
	};

	textarea.addEventListener('input', updateHighlight);
	textarea.addEventListener('scroll', syncScroll);
	updateHighlight();

	var container = E('div', { 'class': 'nm-code-editor cbi-input-textarea' }, [highlight, textarea]);

	function setReadonly(ro) {
		textarea.readOnly = ro;
		if (ro) {
			textarea.classList.add('nm-code-readonly');
			container.classList.remove('nm-code-highlight-editing');
		} else {
			textarea.classList.remove('nm-code-readonly');
			container.classList.add('nm-code-highlight-editing');
		}
	}

	setReadonly(readonly);

	function setContent(text) {
		textarea.value = text || '';
		updateHighlight();
	}

	return {
		container: container,
		textarea: textarea,
		highlight: highlight,
		setContent: setContent,
		setReadonly: setReadonly,
		updateHighlight: updateHighlight
	};
}

return baseclass.extend({
	loadSharedCSS: loadSharedCSS,
	renderFooter: renderFooter,
	appendFooter: appendFooter,
	renderWithFooter: renderWithFooter,
	safeApply: safeApply,
	isApplyNoDataError: isApplyNoDataError,
	validateNameInput: validateNameInput,
	NAME_PATTERN: NAME_PATTERN,
	NAME_TIP: NAME_TIP,
	escapeHtml: escapeHtml,
	codeSyntax: codeSyntax,
	splitComment: splitComment,
	highlightCodePart: highlightCodePart,
	highlightCode: highlightCode,
	createCodeEditor: createCodeEditor
});
