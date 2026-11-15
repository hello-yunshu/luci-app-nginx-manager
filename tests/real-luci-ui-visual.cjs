'use strict';
/* Real OpenWrt/LuCI screenshot matrix. Initial states need manual visual
 * review; this gate does not claim to cover all business interactions. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const base = process.env.NGINX_UI_BASE || 'http://127.0.0.1:18080';
const container = process.env.NGINX_UI_CONTAINER || 'nginx-ui-gate';
const password = process.env.NGINX_UI_PASSWORD || 'nginx-gate';
const output = process.env.NGINX_VISUAL_OUT || path.join(process.cwd(), 'real-luci-visual-evidence');
const language = process.env.NGINX_UI_LANG || 'en';
const routes = [
	{ path: 'overview', label: 'overview', title: ['Nginx Manager', 'Nginx 管理器'] },
	{ path: 'sites', label: 'sites', title: ['Sites', '站点'] },
	{ path: 'sites/edit', label: 'site-edit', title: ['Add Site', '添加站点'] },
	{ path: 'certificates', label: 'certificates', title: ['Certificates', '证书'] },
	{ path: 'files', label: 'files', title: ['Files', '文件'] },
	{ path: 'core-config', label: 'core-config', title: ['Core Config', '核心配置'] },
	{ path: 'backups', label: 'backups', title: ['Backups', '备份'] },
	{ path: 'logs', label: 'logs', title: ['Logs', '日志'] }
];
const languageIndex = language === 'en' ? 0 : language === 'zh_cn' ? 1 : -1;
if (languageIndex < 0) throw new Error('Unsupported NGINX_UI_LANG: ' + language);
const commonWidths = [320, 360, 375, 390, 430, 640, 768, 1024, 1280, 1440, 1920];
const breakpoints = [600, 700, 768, 991, 1048, 1319];
const widths = [...new Set([...commonWidths, ...breakpoints.flatMap(w => [w - 1, w, w + 1])])].sort((a, b) => a - b);
const shortViewports = [{ width: 320, height: 568 }, { width: 568, height: 320 }];
const themes = [
	{ id: 'bootstrap-default-light', media: 'bootstrap', theme: 'bootstrap', colorScheme: 'light', dark: 'false' },
	{ id: 'bootstrap-default-dark', media: 'bootstrap', theme: 'bootstrap', colorScheme: 'dark', dark: 'true' },
	{ id: 'bootstrap-light', media: 'bootstrap', theme: 'bootstrap-light', colorScheme: 'light', dark: 'false' },
	{ id: 'bootstrap-dark', media: 'bootstrap', theme: 'bootstrap-dark', colorScheme: 'dark', dark: 'true' },
	{ id: 'aurora-light', media: 'aurora', theme: 'aurora', colorScheme: 'light', dark: 'false', aurora: 'light' },
	{ id: 'aurora-dark', media: 'aurora', theme: 'aurora', colorScheme: 'dark', dark: 'true', aurora: 'dark' }
];
const smokeOnly = process.env.NGINX_UI_SMOKE_ONLY === '1';
if (smokeOnly && process.env.GITHUB_ACTIONS === 'true') throw new Error('Smoke-only mode is prohibited in GitHub Actions');
const selectedThemes = smokeOnly ? themes.filter(theme => theme.id === 'aurora-light') : themes;
const selectedWidths = smokeOnly ? [320, 1280] : widths;
const selectedShortViewports = smokeOnly ? shortViewports : shortViewports;
const report = {
	schemaVersion: 1, sha: process.env.GITHUB_SHA || 'unknown',
	environment: 'OpenWrt 24.10.8 rootfs with LuCI, uhttpd, rpcd, nginx and Chromium',
	language, mode: smokeOnly ? 'local-smoke-only' : 'full-matrix', routes: routes.map(r => r.path),
	widths: selectedWidths, shortViewports: selectedShortViewports,
	method: 'Initial route state; all registered views; breakpoint-adjacent and common CSS widths; short portrait and landscape; Bootstrap system, explicit Light/Dark, Aurora Light/Dark.',
	dataScenario: 'Two disposable managed sites (enabled and disabled), one missing certificate, one backup fixture, plus files/core configuration/log states.',
	notCovered: ['manual visual review', 'business interactions and confirmed mutation flows', 'valid certificate/ACME success and full backup-restore lifecycle', 'installed router behavior'], rows: [], errors: []
};
fs.mkdirSync(output, { recursive: true });

function shell(command) {
	return execFileSync('docker', ['exec', container, 'sh', '-c', command], { encoding: 'utf8' }).trim();
}

async function login(page) {
	await page.goto(base + '/cgi-bin/luci/', { waitUntil: 'domcontentloaded' });
	const username = page.locator('input[name="luci_username"]');
	if (await username.count()) {
		await username.fill('root');
		await page.locator('input[name="luci_password"]').fill(password);
		const submit = page.locator('button[type="submit"], input[type="submit"]').first();
		if (await submit.count()) await submit.click();
		else await page.locator('input[name="luci_password"]').press('Enter');
	}
	await page.waitForTimeout(1000);
	if (await page.locator('input[name="luci_password"]').count()) throw new Error('LuCI login failed');
}

async function capture(page, theme, route, width, height, label, checkTitle = true) {
	const suffix = height === 900 ? `${width}` : `${width}x${height}`;
	const file = path.join(output, `${theme.id}-${suffix}-${label}.png`);
	const errors = [];
	const onConsole = m => { if (m.type() === 'error') errors.push(m.text()); };
	const onPageError = e => errors.push('PAGE_ERROR ' + e.message);
	page.on('console', onConsole); page.on('pageerror', onPageError);
	let metrics = null, navigationError = null;
	try {
		await page.setViewportSize({ width, height });
		const url = base + '/cgi-bin/luci/admin/services/nginx-manager' + (route ? '/' + route.path : '');
		await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
		await page.waitForFunction(() => {
			const main = document.querySelector('#maincontent');
			return main && main.innerText.trim().length > 10 && !/Loading view|加载视图/.test(main.innerText);
		}, null, { timeout: 20000 });
		await page.waitForTimeout(450);
		metrics = await page.evaluate(({ media, viewId }) => {
			const root = document.documentElement, main = document.querySelector('#maincontent');
			const h = main && main.querySelector('h2[name="content"], .view h2, h2');
			const active = document.querySelector('#maincontent #tabmenu .active a, #maincontent #tabmenu a[aria-current="page"]');
			const resources = Array.from(document.querySelectorAll('link[href],script[src]')).map(el => el.href || el.src);
			const truncated = Array.from((main || document).querySelectorAll('*')).filter(el => {
				if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.closest('.cbi-dropdown, #tabmenu')) return false;
				const css = getComputedStyle(el);
				return css.whiteSpace === 'nowrap' && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2;
			}).slice(0, 8).map(el => ({ tag: el.tagName, text: (el.innerText || '').trim().slice(0, 80) }));
			const activeRect = active && active.getBoundingClientRect();
			const routeTabLinks = Array.from(document.querySelectorAll('#tabmenu ul.tabs a'));
			const routeTabRects = routeTabLinks.map(link => {
				const rect = link.getBoundingClientRect();
				return rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.right <= innerWidth + 1;
			});
			const detailTables = viewId === 'overview' ? Array.from(main ? main.querySelectorAll('table.nm-overview-detail-table') : []) : null;
			const overviewRowsAccessible = detailTables ? detailTables.length === 2 && detailTables.every(table => {
				const rows = Array.from(table.querySelectorAll('tr'));
				return rows.length > 0 && rows.every(row => {
					const heading = row.querySelector('th.th');
					return heading && heading.getAttribute('scope') === 'row' && !row.querySelector('td.td[data-title]');
				});
			}) : null;
			const logFilterFields = Array.from(main ? main.querySelectorAll('.nm-log-filter-field') : []).map(field => ({
				label: (field.querySelector('span') && field.querySelector('span').textContent || '').trim(),
				controls: field.querySelectorAll('select, input').length
			}));
			const logOutput = main && main.querySelector('.nm-log-area');
			const logSize = main && main.querySelector('.nm-log-size');
			const fileHeader = viewId === 'files' && main && main.querySelector('.nm-file-table thead tr');
			const siteEditBack = viewId === 'site-edit' && main && main.querySelector('.ys-actions button:last-child');
			const outputLabelId = logOutput && logOutput.getAttribute('aria-labelledby');
			return {
				heading: h ? h.textContent.trim() : '', hasMain: !!main,
				mainLength: (main && main.innerText || '').trim().length,
				loading: !!(main && /Loading view|加载视图/.test(main.innerText)),
				darkMode: root.getAttribute('data-darkmode'), scrollWidth: root.scrollWidth, width: innerWidth,
				overflow: root.scrollWidth > innerWidth + 1,
				activeTabVisible: !activeRect || (activeRect.left >= -1 && activeRect.right <= innerWidth + 1),
				routeTabs: { count: routeTabLinks.length, visibleCount: routeTabRects.filter(Boolean).length },
				themeLoaded: resources.some(src => src.includes('/luci-static/' + media + '/')),
				pluginCssLoaded: resources.some(src => src.includes('nginx-manager/nginx-manager.css')),
				fileHeaderNative: viewId === 'files' ? !!(fileHeader && fileHeader.classList.contains('cbi-section-table-titles')) : null,
				fileHeaderVisible: viewId === 'files' && fileHeader ? getComputedStyle(fileHeader).display !== 'none' : null,
				overviewRowsAccessible,
				logFilterFields: viewId === 'logs' ? logFilterFields : null,
				logOutput: viewId === 'logs' && logOutput ? {
					state: ['is-empty', 'is-error', 'is-loading'].find(name => logOutput.classList.contains(name)) || 'content',
					height: Math.round(logOutput.getBoundingClientRect().height),
					labelled: !!(outputLabelId && document.getElementById(outputLabelId)),
					filterPlaceholder: (main.querySelector('.nm-log-filter-field input') || {}).placeholder || ''
				} : null,
				logSizeStatus: viewId === 'logs' && logSize ? {
					labelled: logSize.getAttribute('role') === 'status' && logSize.getAttribute('aria-live') === 'polite' && /^(Log size|日志大小)$/.test(logSize.getAttribute('aria-label') || ''),
					text: (logSize.textContent || '').trim()
				} : null,
				siteEditBackDestructive: viewId === 'site-edit' ? !!(siteEditBack && /cbi-button-(reset|negative)/.test(siteEditBack.className)) : null,
				truncated
			};
		}, { media: theme.media, viewId: route && route.id });
		await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
	} catch (error) { navigationError = error.message; }
	finally { page.off('console', onConsole); page.off('pageerror', onPageError); }
	const failures = [];
	if (navigationError) failures.push('navigation-or-render: ' + navigationError);
	if (metrics) {
		if (!metrics.hasMain || metrics.mainLength < 10 || metrics.loading) failures.push('blank-or-loading-view');
		if (!metrics.themeLoaded) failures.push('theme-assets-not-loaded');
		if (!metrics.pluginCssLoaded) failures.push('plugin-css-not-loaded');
		if (metrics.overflow) failures.push('horizontal-overflow');
		if (!metrics.activeTabVisible) failures.push('active-tab-outside-visible-strip');
		if (metrics.routeTabs.count && metrics.routeTabs.visibleCount !== metrics.routeTabs.count) failures.push('route-tab-outside-visible-strip');
		if (route && route.id === 'files' && (!metrics.fileHeaderNative || (width <= 600 && metrics.fileHeaderVisible))) failures.push('mobile-file-table-header-not-native');
		if (route && route.id === 'logs') {
			if (!metrics.logFilterFields || metrics.logFilterFields.length !== 4 || metrics.logFilterFields.some(field => field.controls !== 1)) failures.push('log-filter-label-control-pairing');
			if (!metrics.logOutput || !metrics.logOutput.labelled || metrics.logOutput.filterPlaceholder) failures.push('log-output-labeling-or-redundant-placeholder');
			if (!metrics.logSizeStatus || !metrics.logSizeStatus.labelled || !/Log size:|日志大小：/.test(metrics.logSizeStatus.text)) failures.push('log-size-status-not-labeled');
			if (metrics.logOutput && ['is-empty', 'is-error'].includes(metrics.logOutput.state) && metrics.logOutput.height > 192) failures.push('log-empty-error-state-not-compact');
		}
		if (route && route.id === 'overview' && metrics.overviewRowsAccessible !== true) failures.push('overview-detail-rows-duplicate-or-unlabeled');
		if (route && route.id === 'site-edit' && metrics.siteEditBackDestructive !== false) failures.push('back-navigation-styled-as-destructive');
		if (metrics.truncated.length) failures.push('truncated-non-dropdown-text');
		if (metrics.darkMode !== theme.dark) failures.push('theme-dark-mode-mismatch');
		if (checkTitle && metrics.heading !== route.title[languageIndex]) failures.push('wrong-view-heading: ' + metrics.heading);
	}
	if (errors.length) failures.push('browser-errors');
	const row = {
		theme: theme.id, language,
		route: 'admin/services/nginx-manager' + (route ? '/' + route.path : ''),
		view: label, viewport: `${width}x${height}`, result: failures.length ? 'FAIL' : 'PASS',
		failures, metrics, screenshot: path.basename(file), errors: errors.slice(0, 8)
	};
	report.rows.push(row);
	if (failures.length) report.errors.push({ route: row.route, theme: theme.id, viewport: row.viewport, failures, errors: errors.slice(0, 8) });
	fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
	console.log(`${row.result} ${theme.id} ${row.viewport} ${label}${failures.length ? ' -- ' + failures.join(', ') : ''}`);
}

(async () => {
	const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE || undefined });
	try {
	for (const theme of selectedThemes) {
			shell(`uci set luci.main.mediaurlbase='/luci-static/${theme.media}'; uci set luci.main.theme='${theme.theme}'; uci commit luci; rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache*; /etc/init.d/uhttpd restart >/dev/null 2>&1`);
			await new Promise(resolve => setTimeout(resolve, 900));
			const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: theme.colorScheme });
			if (theme.aurora) await context.addInitScript(mode => localStorage.setItem('aurora.theme', mode), theme.aurora);
			const page = await context.newPage();
			try {
				await login(page);
				for (const width of selectedWidths) for (const route of routes) await capture(page, theme, route, width, 900, route.label);
				for (const viewport of selectedShortViewports) for (const route of routes) await capture(page, theme, route, viewport.width, viewport.height, route.label);
				await capture(page, theme, null, 1280, 900, 'root-alias', false);
			} finally { await context.close(); }
		}
	} finally { await browser.close(); }
	const expectedRows = selectedThemes.length * ((selectedWidths.length + selectedShortViewports.length) * routes.length + 1);
	console.log('VISUAL_MATRIX ' + JSON.stringify({ total: report.rows.length, expectedRows, pass: report.rows.filter(r => r.result === 'PASS').length, fail: report.errors.length }));
	if (report.rows.length !== expectedRows || report.errors.length) process.exitCode = 1;
})().catch(error => {
	report.errors.push({ fatal: error.stack || error.message });
	fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
	console.error(error);
	process.exitCode = 1;
});
