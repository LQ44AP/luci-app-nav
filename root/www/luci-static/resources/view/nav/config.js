'use strict';
'require view';
'require fs';
'require ui';

var NAV_FILE    = '/www/nav.html';
var UCI         = '/sbin/uci';
var UHTTPD_INIT = '/etc/init.d/uhttpd';

/* 匹配 nav.html 里的数据块 */
var DATA_RE = /(<script\s+id="nav-data"[^>]*>)([\s\S]*?)(<\/script>)/;

/* 常用图标预设 */
var ICONS = [
	{ v: '🧭', l: '导航' },
	{ v: '📊', l: '监控' },
	{ v: '🐳', l: '容器' },
	{ v: '📁', l: '文件' },
	{ v: '🎬', l: '媒体' },
	{ v: '🌐', l: '网络' },
	{ v: '⚙️', l: '设置' },
	{ v: '🔒', l: '安全' },
	{ v: '🛡️', l: '防火墙' },
	{ v: '🔑', l: '密钥' },
	{ v: '💾', l: '存储' },
	{ v: '📡', l: '无线' },
	{ v: '🖥️', l: '服务器' },
	{ v: '🔧', l: '工具' },
	{ v: '📦', l: '软件' },
	{ v: '📈', l: '统计' },
	{ v: '🏠', l: '主页' },
	{ v: '🔗', l: '链接' },
	{ v: '☁️', l: '云' },
	{ v: '📷', l: '摄像' },
	{ v: '🎵', l: '音乐' },
	{ v: '📥', l: '下载' },
	{ v: '🗂️', l: '归档' },
	{ v: '🧩', l: '插件' },
	{ v: '🛰️', l: '卫星' },
	{ v: '📻', l: '电台' },
	{ v: '🚀', l: '加速' },
	{ v: '🐚', l: '终端' },
	{ v: '🔔', l: '通知' },
	{ v: '📝', l: '日志' }
];

/* 读取数据块 */
function readData(html) {
	var m = html.match(DATA_RE);
	if (!m) throw new Error('未在 nav.html 中找到 <script id="nav-data"> 数据块');
	try {
		return JSON.parse(m[2].trim());
	} catch (e) {
		throw new Error('nav.html 中的数据块不是合法 JSON：' + e.message);
	}
}

/* 写回数据块 */
function writeData(html, data) {
	var block = JSON.stringify(data, null, 2);
	return html.replace(DATA_RE, function(m, open, body, close) {
		return open + '\n' + block + '\n' + close;
	});
}

/* 图标选择控件：下拉 + 自定义输入 */
function makeIconPicker(current, onChange) {
	current = current || '';
	var isCustom = !ICONS.some(function(ic) { return ic.v === current; });

	var wrap = E('div', { style: 'display:flex;flex-direction:column;gap:6px' });

	var sel = E('select', { class: 'cbi-input-select' });
	ICONS.forEach(function(ic) {
		sel.appendChild(E('option', { value: ic.v }, ic.v + '  ' + ic.l));
	});
	sel.appendChild(E('option', { value: '__custom__' }, '✏️ 自定义…'));
	sel.value = isCustom ? '__custom__' : current;

	var custom = E('input', {
		type: 'text',
		class: 'cbi-input-text',
		value: isCustom ? current : '',
		placeholder: '输入任意 emoji 或字符',
		style: 'display:' + (isCustom ? 'block' : 'none')
	});

	sel.addEventListener('change', function() {
		if (sel.value === '__custom__') {
			custom.style.display = 'block';
			custom.focus();
			onChange(custom.value);
		} else {
			custom.style.display = 'none';
			onChange(sel.value);
		}
	});

	custom.addEventListener('input', function() {
		onChange(custom.value);
	});

	wrap.appendChild(sel);
	wrap.appendChild(custom);
	return wrap;
}

/* 执行命令，非 0 退出码视为失败 */
function execOk(cmd, args) {
	return fs.exec(cmd, args).then(function(r) {
		if (r && r.code && r.code !== 0) {
			throw new Error((r.stderr || '').trim() || (cmd + ' 退出码 ' + r.code));
		}
		return r;
	});
}

/* 延迟重载 uhttpd：脱离当前请求，避免自己掐断自己的响应 */
function reloadUhttpdDeferred() {
	return fs.exec('/bin/sh', [
		'-c',
		'(sleep 2; ' + UHTTPD_INIT + ' reload) >/dev/null 2>&1 &'
	]);
}

return view.extend({

	load: function() {
		return Promise.all([
			L.resolveDefault(fs.read(NAV_FILE), ''),
			L.resolveDefault(fs.exec(UCI, [ 'get', 'uhttpd.main.index_page' ]), null)
		]);
	},

	render: function(data) {
		var html = data[0];
		var indexPage = '';
		if (data[1] && data[1].stdout) indexPage = data[1].stdout.trim();

		var cfg;
		try {
			cfg = readData(html);
		} catch (e) {
			return E('div', { class: 'cbi-map' }, [
				E('h2', {}, '导航页配置'),
				E('div', { class: 'alert-message error' }, '解析失败：' + e.message)
			]);
		}

		cfg.items = cfg.items || [];

		var titleIn = E('input', {
			type: 'text', class: 'cbi-input-text',
			value: cfg.title || '', placeholder: '路由器控制台'
		});
		var subIn = E('input', {
			type: 'text', class: 'cbi-input-text',
			value: cfg.subtitle || '', placeholder: '选择要进入的服务'
		});

		/* 设为默认首页开关 */
		var enableCb = E('input', { type: 'checkbox' });
		enableCb.checked = (indexPage === 'nav.html');

		var listBox = E('div');

		function renderList() {
			listBox.innerHTML = '';

			cfg.items.forEach(function(it, idx) {

				var iconPicker = makeIconPicker(it.icon, function(v) { it.icon = v; });

				var titleIn2 = E('input', {
					type: 'text', class: 'cbi-input-text',
					value: it.title || '', placeholder: '标题'
				});
				var descIn = E('input', {
					type: 'text', class: 'cbi-input-text',
					value: it.desc || '', placeholder: '描述'
				});
				var urlIn = E('input', {
					type: 'text', class: 'cbi-input-text',
					value: it.url || '', placeholder: '/cgi-bin/luci 或 http://ip:port'
				});

				titleIn2.addEventListener('input', function() { it.title = titleIn2.value; });
				descIn.addEventListener('input', function() { it.desc = descIn.value; });
				urlIn.addEventListener('input', function() { it.url = urlIn.value; });

				var radio = E('input', { type: 'radio', name: 'nav-primary' });
				radio.checked = !!it.primary;
				radio.addEventListener('change', function() {
					cfg.items.forEach(function(x) { x.primary = false; });
					it.primary = true;
					renderList();
				});

				var upBtn = E('button', { type: 'button', class: 'btn cbi-button' }, '↑');
				var downBtn = E('button', { type: 'button', class: 'btn cbi-button' }, '↓');
				var delBtn = E('button', { type: 'button', class: 'btn cbi-button cbi-button-remove' }, '删除');

				upBtn.addEventListener('click', function() {
					if (idx === 0) return;
					var t = cfg.items[idx - 1];
					cfg.items[idx - 1] = cfg.items[idx];
					cfg.items[idx] = t;
					renderList();
				});
				downBtn.addEventListener('click', function() {
					if (idx === cfg.items.length - 1) return;
					var t = cfg.items[idx + 1];
					cfg.items[idx + 1] = cfg.items[idx];
					cfg.items[idx] = t;
					renderList();
				});
				delBtn.addEventListener('click', function() {
					cfg.items.splice(idx, 1);
					renderList();
				});

				listBox.appendChild(
					E('div', {
						class: 'cbi-section',
						style: 'padding:12px;border:1px solid rgba(128,128,128,.3);border-radius:8px;margin-bottom:10px'
					}, [
						E('div', { style: 'display:flex;gap:10px;align-items:center;margin-bottom:8px' }, [
							E('span', { style: 'color:#888;font-size:12px' }, '#' + (idx + 1)),
							E('label', { style: 'display:flex;gap:4px;align-items:center;font-size:13px' }, [ radio, '主入口' ]),
							E('span', { style: 'flex:1' }),
							upBtn, downBtn, delBtn
						]),
						E('div', { class: 'cbi-value' }, [
							E('label', { class: 'cbi-value-title' }, '图标'),
							E('div', { class: 'cbi-value-field' }, iconPicker)
						]),
						E('div', { class: 'cbi-value' }, [
							E('label', { class: 'cbi-value-title' }, '标题'),
							E('div', { class: 'cbi-value-field' }, titleIn2)
						]),
						E('div', { class: 'cbi-value' }, [
							E('label', { class: 'cbi-value-title' }, '描述'),
							E('div', { class: 'cbi-value-field' }, descIn)
						]),
						E('div', { class: 'cbi-value' }, [
							E('label', { class: 'cbi-value-title' }, '地址'),
							E('div', { class: 'cbi-value-field' }, urlIn)
						])
					])
				);
			});
		}
		renderList();

		var addBtn = E('button', { type: 'button', class: 'btn cbi-button cbi-button-add' }, '添加卡片');
		addBtn.addEventListener('click', function() {
			cfg.items.push({ icon: '🔗', title: '新卡片', desc: '', url: '/' });
			renderList();
		});

		var saveBtn = E('button', { type: 'button', class: 'btn cbi-button cbi-button-save' }, '保存');
		saveBtn.addEventListener('click', function() {

			cfg.title = titleIn.value;
			cfg.subtitle = subIn.value;

			var problems = [];
			cfg.items.forEach(function(it, i) {
				if (!it.title) problems.push('第 ' + (i + 1) + ' 个卡片缺少标题');
				if (!/^(https?:\/\/|\/)/i.test(it.url || ''))
					problems.push('第 ' + (i + 1) + ' 个卡片地址必须以 http://、https:// 或 / 开头');
			});
			if (problems.length) {
				ui.addNotification(null, E('p', {}, problems.join('；')), 'error');
				return;
			}

			/* 清理 primary：只有主入口保留该字段 */
			cfg.items.forEach(function(it) {
				if (it.primary) it.primary = true;
				else delete it.primary;
			});

			var wantEnabled = enableCb.checked;
			var curEnabled = (indexPage === 'nav.html');

			saveBtn.disabled = true;

			/* 1) 写 nav.html */
			fs.read(NAV_FILE)
				.then(function(cur) {
					return fs.write(NAV_FILE, writeData(cur, cfg), 420);
				})

			/* 2) 若开关状态变化，用 uci 命令操作并延迟重载 */
				.then(function() {
					if (wantEnabled === curEnabled) return null;

					var step;
					if (wantEnabled) {
						step = execOk(UCI, [ 'set', 'uhttpd.main.index_page=nav.html' ]);
					} else {
						step = execOk(UCI, [ 'delete', 'uhttpd.main.index_page' ]);
					}

					return step
						.then(function() { return execOk(UCI, [ 'commit', 'uhttpd' ]); })
						.then(function() { return reloadUhttpdDeferred(); });
				})

			/* 3) 完成 */
				.then(function() {
					if (wantEnabled !== curEnabled) {
						indexPage = wantEnabled ? 'nav.html' : '';
					}
					var msg = wantEnabled
						? '已保存。访问 http://路由器IP/ 会先打开导航页。'
						: '已保存。uhttpd 首页恢复默认。';
					ui.addNotification(null, E('p', {}, msg), 'info');
				})
				.catch(function(err) {
					ui.addNotification(null, E('p', {}, '保存失败：' + (err.message || err)), 'error');
				})
				.finally(function() {
					saveBtn.disabled = false;
				});
		});

		var previewBtn = E('a', {
			class: 'btn cbi-button',
			href: '/nav.html',
			target: '_blank',
			rel: 'noopener'
		}, '预览导航页');

		return E('div', { class: 'cbi-map' }, [
			E('h2', {}, '导航页配置'),
			E('div', { class: 'cbi-map-descr' },
				'编辑 /www/nav.html 中的导航数据块，并可将其设为 uhttpd 的默认首页。'),

			E('div', { class: 'cbi-section' }, [
				E('h3', {}, '默认首页'),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, '设为默认首页'),
					E('div', { class: 'cbi-value-field' }, [
						E('label', { style: 'display:flex;align-items:center;gap:8px;cursor:pointer' }, [
							enableCb,
							E('span', {}, '访问 http://路由器IP/ 时先打开导航页')
						]),
						E('div', { class: 'cbi-value-description' },
							'启用会写入 uhttpd 的 index_page=nav.html；停用则删除该项，恢复默认 index.html。修改后约 2 秒生效。')
					])
				])
			]),

			E('div', { class: 'cbi-section' }, [
				E('h3', {}, '站点信息'),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, '主标题'),
					E('div', { class: 'cbi-value-field' }, titleIn)
				]),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, '副标题'),
					E('div', { class: 'cbi-value-field' }, subIn)
				])
			]),

			E('div', { class: 'cbi-section' }, [
				E('h3', {}, '链接卡片'),
				listBox,
				E('div', { style: 'margin-top:8px' }, [ addBtn ])
			]),

			E('div', { class: 'cbi-page-actions' }, [ previewBtn, ' ', saveBtn ])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});