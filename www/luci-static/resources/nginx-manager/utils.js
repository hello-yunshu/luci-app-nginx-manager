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
	// Nginx config
	if (name === 'nginx.conf' || name === 'nginx' || ext === 'conf' || ext === 'config') return 'nginx';
	// JSON
	if (ext === 'json') return 'json';
	// CSS
	if (ext === 'css') return 'css';
	// HTML / XML
	if (ext === 'html' || ext === 'htm' || ext === 'xml') return 'html';
	// Shell
	if (ext === 'sh' || ext === 'ash' || ext === 'bash' || path.indexOf('/etc/init.d/') === 0) return 'shell';
	// Diff
	if (ext === 'diff' || ext === 'patch') return 'diff';
	// JavaScript / TypeScript
	if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return 'javascript';
	if (ext === 'ts' || ext === 'tsx' || ext === 'jsx') return 'typescript';
	// YAML
	if (ext === 'yaml' || ext === 'yml') return 'yaml';
	// TOML
	if (ext === 'toml') return 'toml';
	// INI / UCI config / systemd unit
	if (ext === 'ini' || ext === 'cnf' || ext === 'service' || name === 'uci' || path.indexOf('/etc/config/') === 0) return 'ini';
	// Lua (OpenWrt core language)
	if (ext === 'lua') return 'lua';
	// Python
	if (ext === 'py') return 'python';
	// PHP
	if (ext === 'php') return 'php';
	// Ruby
	if (ext === 'rb') return 'ruby';
	// Go
	if (ext === 'go') return 'go';
	// C / C++
	if (ext === 'c' || ext === 'h') return 'c';
	if (ext === 'cpp' || ext === 'hpp' || ext === 'cc' || ext === 'cxx') return 'cpp';
	// Makefile / Dockerfile
	if (name === 'Makefile' || name === 'Dockerfile' || ext === 'mk') return 'makefile';
	// Log files
	if (ext === 'log') return 'log';
	return 'generic';
}

/**
 * Token-based syntax highlighter.
 * Scans the input left-to-right, matching token patterns in priority order.
 * Inspired by PrismJS nginx language definition.
 * Token types: comment, string, key, num, var, bool, prop, punct, op
 *
 * IMPORTANT: All regex patterns operate on the RAW (unescaped) text.
 * escapeHtml is applied to each token's content individually when building output,
 * so regexes can match quotes, angle brackets, etc. naturally.
 */
var HIGHLIGHT_RULES = {
	nginx: [
		// Comment: # to end of line (must be preceded by whitespace/start or { ; })
		{ re: /(^|[\s{};])#[^\n]*/g, type: 'comment', lookbehind: true },
		// String: double-quoted (with backslash escapes)
		{ re: /"(?:[^"\\]|\\.)*"/g, type: 'string' },
		// String: single-quoted (with backslash escapes)
		{ re: /'(?:[^'\\]|\\.)*'/g, type: 'string' },
		// Variable: $name or ${name}
		{ re: /\$(?:[A-Za-z_]\w*|\{[^}\s"'\\]+\})/g, type: 'var' },
		// Boolean: on/off
		{ re: /\b(on|off)\b/g, type: 'bool' },
		// Number: integer/float with optional suffix (k, m, g, s, ms, etc.)
		{ re: /\b\d+(?:\.\d+)?[a-zA-Z]*\b/g, type: 'num' },
		// Punctuation
		{ re: /[{};]/g, type: 'punct' },
		// Directive keyword: first word on a line or after { ; (word followed by whitespace)
		{ re: /(^|[\s{};])([\w_]+)(?=\s)/gm, type: 'key', lookbehind: true, group: 2 }
	],
	json: [
		// String (double-quoted)
		{ re: /"(?:[^"\\]|\\.)*"/g, type: 'string' },
		// Boolean / null
		{ re: /\b(true|false|null)\b/g, type: 'key' },
		// Number
		{ re: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, type: 'num' },
		// Punctuation
		{ re: /[{}[\]:,]/g, type: 'punct' }
	],
	shell: [
		// Comment: # to end of line
		{ re: /#[^\n]*/g, type: 'comment' },
		// String: double-quoted
		{ re: /"(?:[^"\\]|\\.)*"/g, type: 'string' },
		// String: single-quoted
		{ re: /'(?:[^'\\]|\\.)*'/g, type: 'string' },
		// Keyword
		{ re: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|local|return|export|readonly|in|select|until|time|coproc)\b/g, type: 'key' },
		// Variable: $name, ${name}, $(cmd), $((expr))
		{ re: /\$\{[^}]+\}|\$\([^)]+\)|\$[A-Za-z_]\w*/g, type: 'var' },
		// Number
		{ re: /\b\d+(?:\.\d+)?\b/g, type: 'num' }
	],
	css: [
		// Block comment
		{ re: /\/\*[\s\S]*?\*\//g, type: 'comment' },
		// String
		{ re: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, type: 'string' },
		// At-rule
		{ re: /@[A-Za-z-]+/g, type: 'key' },
		// Property (word before colon)
		{ re: /[A-Za-z-]+(?=\s*:)/g, type: 'prop' },
		// Number with optional unit
		{ re: /[+-]?\d+(?:\.\d+)?(?:%|[a-zA-Z]+)?/g, type: 'num' },
		// Selector punctuation
		{ re: /[{};:,]/g, type: 'punct' }
	],
	html: [
		// Comment
		{ re: /<!--[\s\S]*?-->/g, type: 'comment' },
		// Closing tag
		{ re: /<\/[A-Za-z][A-Za-z0-9]*/g, type: 'key' },
		// Opening tag
		{ re: /<[A-Za-z][A-Za-z0-9]*/g, type: 'key' },
		// Attribute name
		{ re: /\b[A-Za-z-]+(?=\s*=)/g, type: 'prop' },
		// String value
		{ re: /"[^"]*"|'[^']*'/g, type: 'string' },
		// Tag close
		{ re: /\/?>/g, type: 'punct' }
	],
	diff: [
		// Diff header
		{ re: /^diff\s+--git\s+[^\n]*/gm, type: 'key' },
		// Hunk header
		{ re: /^@@[^@]+@@/gm, type: 'prop' },
		// Added line
		{ re: /^\+[^\n]*/gm, type: 'string' },
		// Removed line
		{ re: /^-[^\n]*/gm, type: 'var' },
		// File markers
		{ re: /^(---|\+\+\+|index)\s+[^\n]*/gm, type: 'key' }
	],
	javascript: [
		// Line comment
		{ re: /\/\/[^\n]*/g, type: 'comment' },
		// Block comment
		{ re: /\/\*[\s\S]*?\*\//g, type: 'comment' },
		// String
		{ re: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, type: 'string' },
		// Keyword
		{ re: /\b(async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|static|super|switch|this|throw|try|typeof|var|void|while|with|yield)\b/g, type: 'key' },
		// Boolean / null / undefined
		{ re: /\b(true|false|null|undefined|NaN|Infinity)\b/g, type: 'bool' },
		// Number
		{ re: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, type: 'num' },
		// Regex (simplified)
		{ re: /\/(?:[^\/\\\n]|\\.)+\/[gimsuy]*/g, type: 'var' }
	],
	typescript: [
		// Line comment
		{ re: /\/\/[^\n]*/g, type: 'comment' },
		// Block comment
		{ re: /\/\*[\s\S]*?\*\//g, type: 'comment' },
		// String
		{ re: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, type: 'string' },
		// Keyword (JS + TS-specific)
		{ re: /\b(async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|if|implements|import|in|instanceof|interface|let|new|of|package|private|protected|public|readonly|return|static|super|switch|this|throw|try|type|typeof|var|void|while|with|yield|as|keyof|infer|namespace|declare|abstract|require)\b/g, type: 'key' },
		// Type annotations (simplified: word before colon in type position)
		{ re: /\b(string|number|boolean|any|void|never|unknown|null|undefined|object|symbol|bigint)\b/g, type: 'prop' },
		// Boolean / null / undefined
		{ re: /\b(true|false|null|undefined|NaN|Infinity)\b/g, type: 'bool' },
		// Number
		{ re: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, type: 'num' },
		// Regex
		{ re: /\/(?:[^\/\\\n]|\\.)+\/[gimsuy]*/g, type: 'var' }
	],
	yaml: [
		// Comment: # to end of line
		{ re: /#[^\n]*/g, type: 'comment' },
		// String: double-quoted
		{ re: /"(?:[^"\\]|\\.)*"/g, type: 'string' },
		// String: single-quoted
		{ re: /'(?:[^'\\]|\\.)*'/g, type: 'string' },
		// Key: word before colon at start of line (with optional leading spaces)
		{ re: /^[\s]*[\w][\w.-]*(?=\s*:)/gm, type: 'key' },
		// Boolean / null
		{ re: /\b(true|false|null|yes|no|on|off)\b/g, type: 'bool' },
		// Number
		{ re: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, type: 'num' },
		// Anchor / alias
		{ re: /[&*]\w+/g, type: 'var' },
		// Document marker
		{ re: /^---|\.\.\.$/gm, type: 'punct' }
	],
	toml: [
		// Comment: # to end of line
		{ re: /#[^\n]*/g, type: 'comment' },
		// String: double-quoted (with escapes)
		{ re: /"(?:[^"\\]|\\.)*"/g, type: 'string' },
		// String: single-quoted (literal)
		{ re: /'(?:[^']|'')*'/g, type: 'string' },
		// String: triple-double-quoted (multiline)
		{ re: /"""[\s\S]*?"""/g, type: 'string' },
		// String: triple-single-quoted (multiline literal)
		{ re: /'''[\s\S]*?'''/g, type: 'string' },
		// Table header: [section] or [[array]]
		{ re: /^\s*\[{1,2}[^\]]+\]{1,2}/gm, type: 'key' },
		// Key: word before = sign
		{ re: /\b[\w-]+(?=\s*=)/g, type: 'prop' },
		// Boolean
		{ re: /\b(true|false)\b/g, type: 'bool' },
		// Number
		{ re: /[+-]?\b(?:0x[\da-fA-F]+|0o[0-7]+|0b[01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, type: 'num' }
	],
	ini: [
		// Comment: # or ; to end of line
		{ re: /[;#][^\n]*/g, type: 'comment' },
		// Section header: [section]
		{ re: /^\s*\[[^\]]+\]/gm, type: 'key' },
		// Key: word before = sign
		{ re: /^\s*[\w.-]+(?=\s*=)/gm, type: 'prop' },
		// String: double-quoted
		{ re: /"(?:[^"\\]|\\.)*"/g, type: 'string' },
		// String: single-quoted
		{ re: /'(?:[^'\\]|\\.)*'/g, type: 'string' },
		// Number
		{ re: /\b\d+(?:\.\d+)?\b/g, type: 'num' },
		// Boolean
		{ re: /\b(true|false|on|off|yes|no|0|1)\b/g, type: 'bool' }
	],
	lua: [
		// Block comment: --[[ ... ]]
		{ re: /--\[\[[\s\S]*?\]\]/g, type: 'comment' },
		// Line comment: -- to end of line
		{ re: /--[^\n]*/g, type: 'comment' },
		// String: double-quoted
		{ re: /"(?:[^"\\]|\\.)*"/g, type: 'string' },
		// String: single-quoted
		{ re: /'(?:[^'\\]|\\.)*'/g, type: 'string' },
		// String: long string [[ ... ]]
		{ re: /\[\[[\s\S]*?\]\]/g, type: 'string' },
		// Keyword
		{ re: /\b(and|break|do|else|elseif|end|false|for|function|goto|if|in|local|nil|not|or|repeat|return|then|true|until|while)\b/g, type: 'key' },
		// Built-in
		{ re: /\b(print|pairs|ipairs|tostring|tonumber|type|require|pcall|xpcall|error|assert|collectgarbage|select|unpack|next|rawget|rawset|setmetatable|getmetatable)\b/g, type: 'prop' },
		// Number
		{ re: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, type: 'num' }
	],
	python: [
		// Block comment / docstring: triple-quoted
		{ re: /"""[\s\S]*?"""|'''[\s\S]*?'''/g, type: 'string' },
		// Line comment
		{ re: /#[^\n]*/g, type: 'comment' },
		// String: double-quoted
		{ re: /"(?:[^"\\]|\\.)*"/g, type: 'string' },
		// String: single-quoted
		{ re: /'(?:[^'\\]|\\.)*'/g, type: 'string' },
		// Decorator
		{ re: /@\w+/g, type: 'prop' },
		// Keyword
		{ re: /\b(and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b/g, type: 'key' },
		// Boolean / None
		{ re: /\b(True|False|None)\b/g, type: 'bool' },
		// Built-in
		{ re: /\b(print|len|range|int|str|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|input|open|map|filter|zip|enumerate|sorted|reversed|any|all|min|max|sum|abs|round|hex|oct|bin|chr|ord|id|hash|dir|vars|locals|globals|exec|eval|compile|__import__|breakpoint)\b/g, type: 'prop' },
		// Number
		{ re: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, type: 'num' }
	],
	php: [
		// Line comment: // and #
		{ re: /(?:\/\/|#)[^\n]*/g, type: 'comment' },
		// Block comment
		{ re: /\/\*[\s\S]*?\*\//g, type: 'comment' },
		// String: double-quoted
		{ re: /"(?:[^"\\]|\\.)*"/g, type: 'string' },
		// String: single-quoted
		{ re: /'(?:[^'\\]|\\.)*'/g, type: 'string' },
		// Variable: $name
		{ re: /\$\w+/g, type: 'var' },
		// Keyword
		{ re: /\b(abstract|and|array|as|break|callable|case|catch|class|clone|const|continue|declare|default|die|do|echo|else|elseif|empty|enddeclare|endfor|endforeach|endif|endswitch|endwhile|eval|exit|extends|final|finally|fn|for|foreach|function|global|goto|if|implements|include|include_once|instanceof|insteadof|interface|isset|list|match|namespace|new|or|print|private|protected|public|readonly|require|require_once|return|static|switch|throw|trait|try|unset|use|var|while|xor|yield)\b/g, type: 'key' },
		// Boolean / null
		{ re: /\b(true|false|null|TRUE|FALSE|NULL)\b/g, type: 'bool' },
		// Number
		{ re: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, type: 'num' }
	],
	ruby: [
		// Line comment
		{ re: /#[^\n]*/g, type: 'comment' },
		// Block comment: =begin ... =end
		{ re: /^=begin[\s\S]*?^=end/gm, type: 'comment' },
		// String: double-quoted
		{ re: /"(?:[^"\\]|\\.)*"/g, type: 'string' },
		// String: single-quoted
		{ re: /'(?:[^'\\]|\\.)*'/g, type: 'string' },
		// Symbol
		{ re: /:[A-Za-z_]\w*/g, type: 'prop' },
		// Instance variable
		{ re: /@[A-Za-z_]\w*/g, type: 'var' },
		// Class variable
		{ re: /@@[A-Za-z_]\w*/g, type: 'var' },
		// Global variable
		{ re: /\$[A-Za-z_]\w*/g, type: 'var' },
		// Keyword
		{ re: /\b(alias|and|begin|break|case|class|def|defined\?|do|else|elsif|end|ensure|false|for|if|in|module|next|nil|not|or|redo|rescue|retry|return|self|super|then|true|undef|unless|until|when|while|yield)\b/g, type: 'key' },
		// Number
		{ re: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, type: 'num' }
	],
	go: [
		// Line comment
		{ re: /\/\/[^\n]*/g, type: 'comment' },
		// Block comment
		{ re: /\/\*[\s\S]*?\*\//g, type: 'comment' },
		// String: double-quoted (interpreted)
		{ re: /"(?:[^"\\]|\\.)*"/g, type: 'string' },
		// String: backtick (raw)
		{ re: /`[^`]*`/g, type: 'string' },
		// String: single-quoted (rune)
		{ re: /'(?:[^'\\]|\\.)*'/g, type: 'string' },
		// Keyword
		{ re: /\b(break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go|goto|if|import|interface|map|package|range|return|select|struct|switch|type|var)\b/g, type: 'key' },
		// Built-in
		{ re: /\b(append|cap|close|copy|delete|imag|len|make|new|panic|print|println|real|recover|true|false|nil|iota|error|bool|byte|complex64|complex128|float32|float64|int|int8|int16|int32|int64|rune|string|uint|uint8|uint16|uint32|uint64|uintptr)\b/g, type: 'prop' },
		// Number
		{ re: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, type: 'num' }
	],
	c: [
		// Line comment
		{ re: /\/\/[^\n]*/g, type: 'comment' },
		// Block comment
		{ re: /\/\*[\s\S]*?\*\//g, type: 'comment' },
		// Preprocessor directive
		{ re: /^#[ \t]*(?:include|define|undef|if|ifdef|ifndef|else|elif|endif|pragma|error|warning|line)[^\n]*/gm, type: 'prop' },
		// String
		{ re: /"(?:[^"\\]|\\.)*"/g, type: 'string' },
		// Char
		{ re: /'(?:[^'\\]|\\.)*'/g, type: 'string' },
		// Keyword
		{ re: /\b(auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|restrict|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|_Bool|_Complex|_Imaginary)\b/g, type: 'key' },
		// Boolean (C99+)
		{ re: /\b(true|false|NULL|nullptr)\b/g, type: 'bool' },
		// Number
		{ re: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFlLuU]*\b/g, type: 'num' }
	],
	cpp: [
		// Line comment
		{ re: /\/\/[^\n]*/g, type: 'comment' },
		// Block comment
		{ re: /\/\*[\s\S]*?\*\//g, type: 'comment' },
		// Preprocessor directive
		{ re: /^#[ \t]*(?:include|define|undef|if|ifdef|ifndef|else|elif|endif|pragma|error|warning|line)[^\n]*/gm, type: 'prop' },
		// String
		{ re: /"(?:[^"\\]|\\.)*"/g, type: 'string' },
		// Char
		{ re: /'(?:[^'\\]|\\.)*'/g, type: 'string' },
		// Keyword (C + C++-specific)
		{ re: /\b(alignas|alignof|and|and_eq|asm|auto|bitand|bitor|bool|break|case|catch|char|char8_t|char16_t|char32_t|class|compl|concept|const|consteval|constexpr|constinit|const_cast|continue|co_await|co_return|co_yield|decltype|default|delete|do|double|dynamic_cast|else|enum|explicit|export|extern|false|float|for|friend|goto|if|inline|int|long|mutable|namespace|new|noexcept|not|not_eq|nullptr|operator|or|or_eq|private|protected|public|register|reinterpret_cast|requires|restrict|return|short|signed|sizeof|static|static_assert|static_cast|struct|switch|template|this|thread_local|throw|true|try|typedef|typeid|typename|union|unsigned|using|virtual|void|volatile|wchar_t|while|xor|xor_eq)\b/g, type: 'key' },
		// Number
		{ re: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFlLuU]*\b/g, type: 'num' }
	],
	makefile: [
		// Comment: # to end of line
		{ re: /#[^\n]*/g, type: 'comment' },
		// Target: line-start identifier followed by colon
		{ re: /^[A-Za-z_][\w.-]*(?=\s*:)/gm, type: 'key' },
		// Variable assignment: name = value or name := value
		{ re: /^[A-Za-z_]\w*\s*(?::=|\?=|\+=|=)/gm, type: 'prop' },
		// Variable reference: $(name) or ${name}
		{ re: /\$\([^)]+\)|\$\{[^}]+\}|\$[A-Za-z_]\w*/g, type: 'var' },
		// String: double-quoted
		{ re: /"(?:[^"\\]|\\.)*"/g, type: 'string' },
		// Directive
		{ re: /^(\s*)(include|ifeq|ifneq|ifdef|ifndef|else|endif|define|endef|export|unexport|override|private|vpath)[^\n]*/gm, type: 'prop' },
		// Number
		{ re: /\b\d+(?:\.\d+)?\b/g, type: 'num' }
	],
	log: [
		// Timestamp patterns (ISO 8601, syslog, etc.)
		{ re: /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, type: 'num' },
		{ re: /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\b/g, type: 'num' },
		// IP address
		{ re: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, type: 'var' },
		// HTTP status code
		{ re: /\s[1-5]\d{2}\s/g, type: 'num' },
		// Log level
		{ re: /\b(ERROR|WARN|WARNING|INFO|DEBUG|TRACE|CRITICAL|FATAL|NOTICE|ALERT|EMERGENCY)\b/g, type: 'key' },
		// Quoted strings
		{ re: /"(?:[^"\\]|\\.)*"/g, type: 'string' },
		// HTTP method
		{ re: /\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|CONNECT|TRACE)\b/g, type: 'prop' }
	],
	generic: [
		// Line comment (// and #)
		{ re: /(?:\/\/|#)[^\n]*/g, type: 'comment' },
		// Block comment
		{ re: /\/\*[\s\S]*?\*\//g, type: 'comment' },
		// String
		{ re: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, type: 'string' },
		// Keyword
		{ re: /\b(function|return|var|let|const|if|else|for|while|switch|case|break|continue|class|new|try|catch|true|false|null|undefined|this|typeof|instanceof|in|of|async|await|yield|import|export|from|default|extends|super|throw|finally|delete|void|with|do|static|get|set)\b/g, type: 'key' },
		// Number
		{ re: /\b\d+(?:\.\d+)?\b/g, type: 'num' }
	]
};

/**
 * Tokenize and highlight code using priority-based regex scanning.
 * Processes the RAW (unescaped) input left-to-right, matching the highest-priority token first.
 * escapeHtml is applied per-token when building output, so regexes match natural syntax.
 */
function highlightCode(text, path) {
	var syntax = codeSyntax(path);
	var rules = HIGHLIGHT_RULES[syntax] || HIGHLIGHT_RULES.generic;
	var raw = String(text || '');

	// Collect all token matches with their positions
	var tokens = [];
	for (var ri = 0; ri < rules.length; ri++) {
		var rule = rules[ri];
		var regex = rule.re;
		regex.lastIndex = 0;
		var match;
		while ((match = regex.exec(raw)) !== null) {
			var start = match.index;
			var content;
			// If rule specifies a capture group, use that group as the token content
			if (rule.group) {
				start += match[0].indexOf(match[rule.group]);
				content = match[rule.group];
			} else {
				content = match[0];
			}
			// For lookbehind rules, strip the leading non-token chars
			if (rule.lookbehind && !rule.group) {
				var lb = match[1];
				if (lb) {
					start += lb.length;
					content = content.substring(lb.length);
				}
			}
			if (content.length > 0) {
				tokens.push({ start: start, end: start + content.length, type: rule.type, content: content });
			}
		}
	}

	// Sort by position, then by longest match (prefer more specific), then by rule priority
	tokens.sort(function(a, b) {
		if (a.start !== b.start) return a.start - b.start;
		if (a.end !== b.end) return b.end - a.end; // longer match wins
		return 0;
	});

	// Remove overlapping tokens (keep the first/longest)
	var filtered = [];
	var lastEnd = 0;
	for (var i = 0; i < tokens.length; i++) {
		var t = tokens[i];
		if (t.start >= lastEnd && t.end > t.start) {
			filtered.push(t);
			lastEnd = t.end;
		}
	}

	// Build highlighted HTML — escapeHtml per token to preserve regex matching on raw text
	var result = '';
	var pos = 0;
	for (var j = 0; j < filtered.length; j++) {
		var tk = filtered[j];
		// Add plain text before this token
		if (tk.start > pos) {
			result += escapeHtml(raw.substring(pos, tk.start));
		}
		result += '<span class="tok-' + tk.type + '">' + escapeHtml(tk.content) + '</span>';
		pos = tk.end;
	}
	// Add remaining plain text
	if (pos < raw.length) {
		result += escapeHtml(raw.substring(pos));
	}

	return result + '\n';
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
	// 用 transform 同步滚动：highlight 是 overflow:hidden，scrollTop/scrollLeft 对它无效。
	// transform 在同一帧内应用，避免 scroll 事件异步导致的跳动。
	var syncScroll = function() {
		highlight.style.transform = 'translate(' + (-textarea.scrollLeft) + 'px,' + (-textarea.scrollTop) + 'px)';
	};

	// 运行时从 textarea 主题样式检测排版与盒模型，同步给 highlight 层。
	// textarea 的 color 是 transparent（隐藏文字），不能直接同步。
	// highlight 用主题文字色：优先 --text-color-medium，回退 --subtext-color，再回退 #333。
	var syncStyle = function() {
		var bs = getComputedStyle(textarea);
		highlight.style.borderTopWidth = bs.borderTopWidth;
		highlight.style.borderRightWidth = bs.borderRightWidth;
		highlight.style.borderBottomWidth = bs.borderBottomWidth;
		highlight.style.borderLeftWidth = bs.borderLeftWidth;
		highlight.style.borderStyle = 'solid';
		highlight.style.borderColor = 'transparent';
		highlight.style.paddingTop = bs.paddingTop;
		highlight.style.paddingRight = bs.paddingRight;
		highlight.style.paddingBottom = bs.paddingBottom;
		highlight.style.paddingLeft = bs.paddingLeft;
		highlight.style.fontFamily = bs.fontFamily;
		highlight.style.fontSize = bs.fontSize;
		highlight.style.lineHeight = bs.lineHeight;
		highlight.style.tabSize = bs.tabSize;
		// 强制同步排版属性，防止 LuCI 主题 CSS（如 Bootstrap 的 pre { white-space: pre-wrap }）覆盖
		highlight.style.whiteSpace = 'pre';
		highlight.style.wordWrap = 'normal';
		highlight.style.overflowWrap = 'normal';
		// 不设内联 color，让 CSS 规则（含暗色媒体查询）生效，避免内联样式覆盖暗色回退值
		highlight.style.removeProperty('color');
	};

	textarea.addEventListener('input', updateHighlight);
	textarea.addEventListener('scroll', syncScroll, { passive: true });
	updateHighlight();
	syncScroll();
	syncStyle();

	var container = E('div', { 'class': 'nm-code-editor' }, [highlight, textarea]);

	function setReadonly(ro) {
		textarea.readOnly = ro;
		if (ro) {
			textarea.classList.add('nm-code-readonly');
			textarea.classList.remove('nm-code-highlight-editing');
		} else {
			textarea.classList.remove('nm-code-readonly');
			textarea.classList.add('nm-code-highlight-editing');
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
		updateHighlight: updateHighlight,
		syncStyle: syncStyle
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
