'use strict';
// SPDX-License-Identifier: AGPL-3.0-only

'require baseclass';

function loadSharedCSS() {
	if (!document.getElementById('nm-shared-css')) {
		var link = E('link', {
			'id': 'nm-shared-css',
			'rel': 'stylesheet',
			'href': L.resource('nginx-manager/nginx-manager.css')
		});
		document.head.appendChild(link);
	}
}

function footerLink(href, label) {
	return E('a', {
		'class': 'ys-tool-footer-link',
		'href': href,
		'target': '_blank',
		'rel': 'noopener noreferrer'
	}, label);
}

function renderFooter(options) {
	options = options || {};
	var project = options.project || 'Nginx Manager';
	var version = options.version && options.version !== '-' ? 'v' + options.version : '';
	var repoUrl = options.repoUrl || 'https://github.com/hello-yunshu/luci-app-nginx-manager';

	return E('footer', { 'class': 'ys-tool-footer' }, [
		E('div', { 'class': 'ys-tool-footer-brand' }, [
			E('span', { 'class': 'ys-tool-footer-mark' }, 'Yunshu Lab'),
			E('span', { 'class': 'ys-tool-footer-title' }, project),
			version ? E('span', { 'class': 'ys-tool-footer-version' }, version) : ''
		]),
		E('div', { 'class': 'ys-tool-footer-links' }, [
			footerLink(repoUrl, 'Project'),
			footerLink('https://github.com/hello-yunshu', 'GitHub'),
			footerLink('https://x.com/yunyunyshu', 'X @yunyunyshu')
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

return baseclass.extend({
	loadSharedCSS: loadSharedCSS,
	renderFooter: renderFooter,
	appendFooter: appendFooter,
	renderWithFooter: renderWithFooter
});
