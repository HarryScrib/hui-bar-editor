// HUI Bar Editor: the page (Look 1, dev/docs/actionbars/BUILD-editor.md). Opened by double-click (file://): no server, no build
// step, no network. Its work is kept in this browser's localStorage (wrapped: the page works without it); the game
// reads only what "Save Layouts.lua" writes, or an export string pasted in game.
(function () {
	'use strict';

	var D = window.HUI_DATA, S = window.HUISerialise, Lay = window.HUILayout, Mac = window.HUIMacro, Sp = window.HUISpells;
	var HB = window.HUIBars, W = window.HUIWow, N = window.HUINeutral;
	var STORE = 'HUIBarEditor.v1';
	var VERSION = 'HUI Bar Editor 0.6.18';
	var PATH = 'Interface\\AddOns\\HUIPresets\\Presets';   // (Harry, Oct 19: "just interface/addons/huipresets/presets ... no need for 2 lines")
	var KEYS12 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
	var QUESTION = 134400;

	var st = {
		layouts: [], cur: {}, cls: 'PRIEST', tab: {}, sel: { bar: 1, i: 1 }, filter: 'All', search: '', keys: false,
		layer: 'None', capture: false, forms: {}, maker: null, importMsg: '', importPink: false, exportStr: '',
		renaming: null, hot: null, view: 'slots', selBar: 1, mouse: null, mouseAsk: null, saveMsg: '', savePink: false,
		rowRank: {},   // 0.3.1: a list row's chosen rank (class:name -> rank number; none = Highest), never kept
		start: null,   // 0.4.0: the Start from / Take neutrals panel { mode: 'new' | 'take', dst, pick, bars }
		cmp: null, cmpSwap: false, cmpCls: null,   // 0.4.0: Compare - the other layout's id, and Swap view (0.6.11: the class picked)
		kbMode: false, kbPick: null,   // 0.4.1: Keybind mode, and a keyboard panel key picked in it (never kept)
		used: 'Show',   // 0.5.7: the spells list's Used < Show | Mark | Hide > (kept in this browser, HUIBarEditor.used)
		move: false, picked: {}, pickL: null,   // 0.6.3: Move < Off | On >, the buttons picked ("bar:i") and their layout's id
	};

	// ------------------------------------------------------------------ helpers
	function $(id) { return document.getElementById(id); }
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	function ic(fid) { return 'icons/' + (fid || QUESTION) + '.png'; }
	function img(fid) { return '<img src="' + ic(fid) + '" alt="" onerror="this.onerror=null;this.src=\'icons/' + QUESTION + '.png\'">'; }
	function uid() { return 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
	function CD() { return D.classes[st.cls]; }
	function copy(o) { return JSON.parse(JSON.stringify(o)); }

	function step(v, attrs, off) {
		return '<span class="step' + (off ? ' off' : '') + '"' + (attrs || '') + '><i data-step="-1">&lsaquo;</i><b>' + v + '</b><i data-step="1">&rsaquo;</i></span>';
	}
	function tick(on, label, attrs, grey) {
		return '<span class="tick' + (on ? ' on' : '') + (grey ? ' grey' : '') + '"' + (attrs || '') + '><i></i>' + (label || '') + '</span>';
	}
	function seg(items, on, attrs, fixed) {
		return '<span class="seg' + (fixed ? ' fixed' : '') + '"' + (attrs || '') + '>' + items.map(function (x) {
			var v = Array.isArray(x) ? x[0] : x, w = Array.isArray(x) ? x[1] : x;
			return '<span data-v="' + esc(v) + '"' + (String(v) === String(on) ? ' class="on"' : '') + '>' + esc(w) + '</span>';
		}).join('') + '</span>';
	}
	function btn(t, cls, attrs) { return '<span class="gb' + (cls ? ' ' + cls : '') + '"' + (attrs || '') + '>' + t + '</span>'; }
	function head(t, r) { return '<div class="ch"><span>' + t + '</span>' + (r ? '<span class="chr">' + r + '</span>' : '') + '</div>'; }
	function row(l, c, attrs) { return '<div class="row"' + (attrs || '') + '><span class="rl">' + l + '</span><span class="rc">' + c + '</span></div>'; }

	// ------------------------------------------------------------------ storage (per viewer, never needed)
	function save() {
		if (st.demo) return;
		try {
			localStorage.setItem(STORE, JSON.stringify({ layouts: st.layouts, cur: st.cur, cls: st.cls, forms: st.forms,
				keys: st.keys, tab: st.tab, view: st.view }));
		} catch (e) { /* private window or blocked: the page still works */ }
	}
	function load() {
		try {
			var raw = localStorage.getItem(STORE);
			if (!raw) return;
			var o = JSON.parse(raw);
			if (Array.isArray(o.layouts)) {
				st.layouts = o.layouts.map(function (l) {
					try { var L = Lay.fromLua(Lay.toLua(l)); L._id = l._id || uid(); L.saved = !!l.saved; updateAutoSlots(L); return L; } catch (e) { return null; }
				}).filter(Boolean);
			}
			st.cur = o.cur || {};
			if (D.classes[o.cls]) st.cls = o.cls;
			st.forms = o.forms || {};
			// 0.6.1 (Harry, Oct 19: "Mouseover and Either is annoying. just include an option inside the mouseover"): a form
			// kept as Either opens as Mouseover with its two spells (the Or), Kind Plain
			Object.keys(st.forms).forEach(function (k) { Mac.FoldForm(st.forms[k]); });
			st.layouts.forEach(nameTooltips);   // 0.6.8: a bare #showtooltip from a kept form named
			st.keys = !!o.keys;
			st.tab = o.tab || {};
			st.view = o.view === 'screen' ? 'screen' : 'slots';
		} catch (e) { /* nothing kept */ }
	}

	// ------------------------------------------------------------------ the current layout
	function classLayouts(cls) { return st.layouts.filter(function (l) { return l.class === cls; }); }
	function uniqueName(cls, base, except) {
		var names = {};
		classLayouts(cls).forEach(function (l) { if (l !== except) names[l.name] = true; });
		if (!names[base]) return base;
		for (var n = 2; ; n++) {
			var s = Lay.cleanName(base.slice(0, 21) + ' ' + n);
			if (!names[s]) return s;
		}
	}
	function cur() {
		var id = st.cur[st.cls], L = null;
		st.layouts.forEach(function (l) { if (l._id === id && l.class === st.cls) L = l; });
		if (!L) L = classLayouts(st.cls)[0];
		if (!L) {
			L = Lay.newLayout(st.cls, 'Main');
			L._id = uid();
			st.layouts.push(L);
		}
		st.cur[st.cls] = L._id;
		return L;
	}
	function tabs() { return Lay.formTabs(st.cls, cur().options); }
	function bar1Page() {
		var t = tabs(), p = st.tab[st.cls];
		for (var i = 0; i < t.length; i++) if (t[i][1] === p) return p;
		return t.length ? t[0][1] : 1;
	}
	function tabName(page) {
		var t = tabs();
		for (var i = 0; i < t.length; i++) if (t[i][1] === page) return t[i][0];
		return '';
	}
	function slotN(bar, i) { return Lay.slotNumber(bar, i, bar1Page()); }
	function slots() { return cur().specs[0].slots; }
	function setSlot(n, e) { if (e) slots()[n] = e; else delete slots()[n]; }

	// ------------------------------------------------------------------ what a slot shows
	function generalSpell(id) {
		for (var i = 0; i < D.general.length; i++) {
			var g = D.general[i];
			if (!g.item && g.r[0][0] === id) return g;
		}
		return racialSpell(id) || professionSpell(id) || mountSpell(id);
	}
	// 0.6.4 (Harry, Oct 19: "we need professions - enchanting, tailoring, smelting, disenchant, fishing etc. these should
	// all be mappable"): data.js "professions" (make_data.py, Forever's profession lines), one row each, every class's. A
	// ranked one (Apprentice .. Artisan) is placed by name at the highest the character knows (Auto rank, its top rank's ID)
	function profRow(p) { return { n: p.n, g: 'Professions', i: p.i, r: p.r, general: true, prof: true }; }
	function professionSpell(id) {
		var ps = D.professions || [];
		for (var i = 0; i < ps.length; i++) for (var j = 0; j < ps[i].r.length; j++) if (ps[i].r[j][0] === id) return profRow(ps[i]);
		return null;
	}
	function profRows() { return (D.professions || []).map(profRow); }
	// 0.6.4: one mount on a button (an ordinary spell slot). 0.6.11 (Harry, Oct 20: "on the website i don't need to see all
	// of those mounts. it just creates a lot of clutter, i just want the mount up best available that we have"): no Mounts
	// group in the list any more - Mount up holds them all; a layout's mount on a button still loads and shows as a spell
	function mountRow(m) { return { n: m.n, g: 'Mounts', i: m.i, r: [[m.s, 0, 1]], general: true, mountRow: m }; }
	function mountSpell(id) { var m = N.mount(D, id); return m ? mountRow(m) : null; }
	// an item by ID: General's tiers, a Utility family's items, a gadget or the Hearthstone -> { g, tier: [id, level, name, icon] }
	function itemInfo(id) {
		for (var i = 0; i < D.general.length; i++) {
			var g = D.general[i];
			if (g.item) for (var j = 0; j < g.tiers.length; j++) if (g.tiers[j][0] === id) return { g: g, tier: g.tiers[j] };
		}
		var found = null;
		utilEntries().forEach(function (u) {
			if (found) return;
			if (u.k === 'item' && u.id === id) found = { g: { n: u.sub }, tier: [id, 1, u.n, u.i] };
			if (u.k === 'family') u.items.forEach(function (x) { if (!found && x[0] === id) found = { g: { n: u.n }, tier: [x[0], x[3], x[1], x[2]] }; });
		});
		return found;
	}

	// ------------------------------------------------------------------ utility and race (0.2.0, LAYOUT-FORMAT "Utility buttons")
	// Harry, Oct 18: "add a utility section under the classes for things like hearthstone, healthstone, potions, trinket
	// 1, trinket 2 ... items by slot ... sapper charges, grenades, various engineering items ... mount up. also include
	// race icons so people can pick racials, and then the mount would be correct for the race"
	var MOUNT_ICON = 132261;
	var utilCache = null;
	function utilEntries() {
		if (utilCache) return utilCache;
		utilCache = [];
		(D.utility || []).forEach(function (g) {
			g.items.forEach(function (u) { u.sub = g.g; u.idx = utilCache.length; utilCache.push(u); });
		});
		return utilCache;
	}
	function familyOf(id) { return utilEntries().filter(function (u) { return u.k === 'family' && u.id === id; })[0] || null; }
	function slotWord(n) { return (utilEntries().filter(function (u) { return u.k === 'slot' && u.slot === n; })[0] || { n: 'Slot ' + n }).n; }
	function slotArt(n) { return (utilEntries().filter(function (u) { return u.k === 'slot' && u.slot === n; })[0] || { i: QUESTION }).i; }
	function racesFor(cls) {
		var out = [];
		Object.keys(D.races || {}).forEach(function (k) { if (D.races[k].classes.indexOf(cls) >= 0) out.push(k); });
		return out;
	}
	// a racial by any of its IDs (every race's)
	function racialSpell(id) {
		var hit = null;
		Object.keys(D.races || {}).forEach(function (k) {
			D.races[k].racials.forEach(function (r) {
				if (hit) return;
				var ids = [r.s].concat(Object.keys(r.byClass || {}).map(function (c) { return r.byClass[c]; }));
				if (ids.indexOf(id) >= 0) hit = { n: r.n, g: 'Racial', i: r.i, r: [[id, 0, 1]], general: true, racial: true, d: r.d, m: r.m };
			});
		});
		return hit;
	}
	// the layout's race's racials for this class, as list rows
	function racials() {
		var R = D.races && cur().race ? D.races[cur().race] : null;
		if (!R) return [];
		return R.racials.map(function (r) {
			var id = (r.byClass && r.byClass[st.cls]) || r.s;
			return id ? { n: r.n, g: 'Racial', i: r.i, r: [[id, 0, 1]], general: true, racial: true, d: r.d, m: r.m } : null;
		}).filter(Boolean);
	}
	function utilRows() {
		return utilEntries().map(function (u) { return { n: u.n, g: 'Utility', sub: u.sub, i: mountOr(u), util: u }; });
	}
	function mountOr(u) { return u.k === 'mount' ? mountInfo(cur()).icon : u.i; }
	// Mount up for a layout: 0.6.4 every mount it can own, fastest first, its class's and race's first among the same speed
	// (neutral.js mountSpells); its icon the race's line's, else the class mount's
	function mountInfo(L) {
		var icon = 0, R = D.races && L.race ? D.races[L.race] : null;
		((D.classMounts || {})[L.class] || []).forEach(function (m) { icon = icon || m[2]; });
		if (R) icon = R.mountIcon || icon;
		return { spells: N.mountSpells(D, L), icon: icon || MOUNT_ICON };
	}
	function mountEntry(L) { return { t: 'mount', spells: mountInfo(L).spells, items: [] }; }
	// a race picked (or the same one again: none): its racials offered, every Mount up of the layout follows it
	function setRace(key) {
		var L = cur();
		L.race = L.race === key ? undefined : key;
		var sl = L.specs[0].slots;
		Object.keys(sl).forEach(function (n) { if (sl[n] && sl[n].t === 'mount') sl[n] = mountEntry(L); });
		changed();
	}
	function scopeOf(m) { return m.scope === 'character' ? 'character' : 'account'; }
	// 0.6.11: a macro of that set with this name and text (not `except`'s)
	function macroTwin(scope, name, body, except) {
		return cur().macros.filter(function (x) { return x.key !== except && scopeOf(x) === scope && x.name === name && x.body === body; })[0] || null;
	}
	function macroOf(key) {
		var m = null;
		cur().macros.forEach(function (x) { if (x.key === key) m = x; });
		return m;
	}
	function spellOf(id) { return Sp.byId(CD(), id) || generalSpell(id); }
	function spellIn(L, id) { return Sp.byId(D.classes[L.class], id) || generalSpell(id); }
	function isAuto(e) { return Lay.autoOf(cur(), e); }
	// { icon, name, mac, pin, empty, cleared } - the current layout's, or (0.4.0, Compare) another's
	function show(e) { return showFor(cur(), e); }
	function showFor(L, e) {
		if (!e || e.t === 'empty') return { empty: true, cleared: !!e, name: 'Empty' };
		if (e.t === 'spell') {
			var s = spellIn(L, e.id), auto = Lay.autoOf(L, e);
			return { icon: s ? Sp.iconOf(s, e.id) : QUESTION, name: e.name || (s && s.n) || ('Spell ' + e.id),
				pin: (!auto && e.rank) ? e.rank : 0, spell: s, rank: e.rank || 0, auto: auto };
		}
		if (e.t === 'item') {
			var it = itemInfo(e.id);
			return { icon: it ? it.tier[3] : QUESTION, name: it ? it.tier[2] : 'Item ' + e.id };
		}
		if (e.t === 'macro') {
			var m = null;
			L.macros.forEach(function (x) { if (x.key === e.key) m = x; });
			return { icon: m ? shownIcon(m.icon, m.body) : QUESTION, name: m ? m.name : '?', mac: true };
		}
		if (e.t === 'slot') return { icon: slotArt(e.slot), name: slotWord(e.slot), sub: 'Equipped' };
		if (e.t === 'family') {
			var f = familyOf(e.id), best = f ? f.items[0] : null;
			return { icon: best ? best[2] : QUESTION, name: f ? f.n : e.id, sub: 'Best carried' };
		}
		if (e.t === 'mount') return { icon: mountInfo(L).icon, name: 'Mount up', sub: 'Best known' };
		return { empty: true, name: 'Empty' };
	}
	function keyText(cmd, L) {
		var k = (L || cur()).specs[0].keys[cmd];
		return k && k.length ? keyWord(k[0]) : '';
	}
	// 0.4.4: a bar button's hover text when its key is a mouse side button's ("Mouse 3 (sends Ctrl-Numpad1)")
	function keyTipAttr(cmd, L) {
		var k = (L || cur()).specs[0].keys[cmd], t = k && k.length ? keyTip(k[0]) : '';
		return t ? ' data-tip="' + esc(t) + '"' : '';
	}
	// 0.4.0, Compare: the other layout's spell in the same place, a small dimmed inset in the corner (its R1 if held);
	// hovered, its name and rank
	function insetHTML(info) {
		if (!info || info.empty) return '';
		var tip = info.name + (info.rank && info.spell && !info.spell.general ? ' \u00b7 Rank ' + info.rank : '') + (info.sub ? ' \u00b7 ' + info.sub : '');
		return '<span class="cmp" data-tip="' + esc(tip) + '">' + img(info.icon) + (info.pin ? '<span class="cpin">R' + info.pin + '</span>' : '') + '</span>';
	}
	// 0.6.12 (Harry, Oct 20: "can you also put tooltips on all of the abilities (not professions etc - simply just the
	// abilities), that are accurate to wow forever, and where a numerical value is required, just use x or x%, or
	// whatever"): a class spell or racial (data.js "d" / "m", make_data.py from Forever's Spell table) carries data-ab,
	// its spell ID; hovered, the ability tooltip (onTip). Professions, items, macros, mounts and General: none.
	function abilityId(s) {
		if (!s || s.prof || s.mountRow || s.item || s.util) return 0;
		if (s.general && !s.racial) return 0;
		return (s.d || s.m) ? s.r[0][0] : 0;
	}
	function abilityOf(id) {
		var s = Sp.byId(CD(), id);
		if (!s) Lay.CLASSES.forEach(function (c) { s = s || Sp.byId(D.classes[c], id); });
		return s || racialSpell(id);
	}
	function abilityTipHTML(id, extra) {
		var s = abilityOf(id);
		if (!s) return '';
		var kind = s.racial ? 'Racial' : esc(s.g) + (s.t ? ' &middot; Talent' : '');
		return '<div class="an">' + esc(s.n) + '</div><div class="ak">' + kind + '</div>'
			+ (s.m && s.m.length ? '<div class="am">' + s.m.map(esc).join(' &middot; ') + '</div>' : '')
			+ (s.d ? '<div class="ad">' + esc(s.d) + '</div>' : '')
			+ (extra ? '<div class="ak">' + esc(extra) + '</div>' : '');
	}
	function slotHTML(info, o) {
		o = o || {};
		var c = ['slot'];
		if (!info || info.empty) c.push('empty');
		if (info && info.cleared) c.push('cleared');
		if (o.sel) c.push('sel');
		if (o.sel && o.armed) c.push('armed');
		if (info && !info.empty && info.mac) c.push('mac');   // a macro, named or not, marked by its edge (Harry, Oct 19)
		if (o.cls) c.push(o.cls);
		if (o.inset && !o.inset.empty) c.push('hasc');
		var s = o.s || 42, ab = info && !info.empty && info.spell ? abilityId(info.spell) : 0;
		return '<div class="' + c.join(' ') + '" style="--s:' + (typeof s === 'number' ? s + 'px' : s) + '"' + (o.attrs || '') + (ab ? ' data-ab="' + ab + '"' : '') + '>'
			+ (info && !info.empty ? img(info.icon) : '')
			+ (o.key ? '<span class="key">' + esc(o.key) + '</span>' : '')
			+ (info && info.mac && info.name && !o.noname ?'<span class="mname">' + esc(info.name) + '</span>' : '')
			+ (info && info.pin ? '<span class="pin">R' + info.pin + '</span>' : '') + (o.inset ? insetHTML(o.inset) : '') + '</div>';
	}

	// ------------------------------------------------------------------ the spells list
	// the school a spell is listed under: a class's forms / stances / auras all together, with the first one's school
	// (a druid's with Feral, Moonkin Form too; a warrior's with Arms; a paladin's with Protection)
	function parentOf(s) {
		if (s.util) return 'Utility';
		if (s.racial) return 'Racial';
		if (s.prof) return 'Professions';
		if (s.general) return 'General';
		if (s.st !== undefined && (st.cls === 'DRUID' || st.cls === 'WARRIOR' || st.cls === 'PALADIN')) {
			var first = null;
			CD().spells.forEach(function (x) { if (x.st === 0 && (!first || x.r[0][2] < first.r[0][2])) first = x; });
			return first ? first.g : s.g;
		}
		return s.g;
	}
	function groupOf(s) {
		if (s.util) return s.sub;
		if (s.racial) return 'Racial';
		if (s.prof) return 'Professions';
		if (s.general) return 'General';
		if (s.st !== undefined) {
			if (st.cls === 'DRUID') return 'Forms';
			if (st.cls === 'WARRIOR') return 'Stances';
			if (st.cls === 'PALADIN') return 'Auras';
		}
		if (st.cls === 'DRUID' && s.f) return s.f;
		return s.g;
	}
	var SUB_ORDER = { Forms: 0, Stances: 0, Auras: 0, Cat: 1, Bear: 2 };
	function offeredList() {
		var L = cur();
		return Sp.offered(CD(), undefined, L.race).concat(racials(), profRows(), Sp.general(D, st.cls), utilRows());
	}
	function spellGroups() {
		var all = offeredList(), C = CD(), U = st.used === 'Hide' ? usedSet() : null;
		var parents = Sp.schools(C, all), q = st.search.toLowerCase();
		var groups = [];
		parents.slice(1).forEach(function (p) {
			if (st.filter !== 'All' && st.filter !== p) return;
			var mine = all.filter(function (s) { return parentOf(s) === p; });
			if (q) mine = mine.filter(function (s) { return s.n.toLowerCase().indexOf(q) >= 0; });
			if (st.used === 'Hide') mine = mine.filter(function (s) { return !rowUsed(s, U); });
			var subs = {};
			mine.forEach(function (s) { var g = groupOf(s); (subs[g] = subs[g] || []).push(s); });
			Object.keys(subs).sort(function (a, b) {
				var A = SUB_ORDER.hasOwnProperty(a) ? SUB_ORDER[a] : 9, B = SUB_ORDER.hasOwnProperty(b) ? SUB_ORDER[b] : 9;
				return A - B;
			}).forEach(function (g) {
				if (SUB_ORDER[g] === 0) subs[g].sort(function (a, b) { return a.st - b.st || a.r[0][2] - b.r[0][2]; });   // the stance bar's order
				groups.push([g, subs[g]]);
			});
		});
		return groups;
	}
	function spellRowHTML(s, used) {
		var L = cur(), rk = '', attrs, tail = '', iconId;
		if (s.util) {
			rk = s.util.k === 'family' ? '<span class="soft">Best carried</span>' : s.util.k === 'slot' ? 'Equipped'
				: s.util.k === 'mount' ? '<span class="soft">' + (cur().race ? esc(D.races[cur().race].name) : 'Best known') + '</span>' : '';
			attrs = ' data-drag="util" data-u="' + s.util.idx + '"';
		} else if (s.item) {
			var t = s.tiers[s.tiers.length - 1];
			rk = esc(t[2]);
			attrs = ' data-drag="item" data-id="' + t[0] + '"';
		} else if (s.racial) {
			attrs = ' data-drag="spell" data-id="' + s.r[0][0] + '"';
		} else if (s.prof) {
			if (s.r.length > 1) rk = '<span class="soft">Best known</span>';
			attrs = ' data-drag="spell" data-id="' + s.r[s.r.length - 1][0] + '"';
		} else {
			var h = Sp.highest(s), ch = Sp.rankChoices(s), pick = rowRankOf(s), shown = pick ? Sp.rankNumbered(s, pick) : h;
			if (pick) rk = 'Rank ' + pick + ' of ' + ch[ch.length - 1];
			else if (h && h[1]) rk = 'Rank ' + h[1];
			if (s.t) rk += (rk ? ' &middot; ' : '') + '<span class="tal">Talent</span>';
			// 0.5.8: a spell or rank a book teaches (Prayer of Fortitude, the Ahn'Qiraj ranks), soft as Talent
			if (s.b && s.b.indexOf((shown || s.r[0])[0]) >= 0) rk += (rk ? ' &middot; ' : '') + '<span class="soft">Book</span>';
			// 0.3.1: with no race picked, a race-only spell says whose it is
			if (s.rc && !L.race) rk += (rk ? ' &middot; ' : '') + '<span class="soft">' + esc(raceWords(s.rc)) + '</span>';
			attrs = ' data-drag="spell" data-id="' + s.r[0][0] + '"' + (pick ? ' data-rank="' + pick + '"' : '');
			// the rank step-through at the row's right end (shown on hover, or while a rank is chosen)
			if (ch.length) tail = rowStep(s.n, pick);
			iconId = (shown || s.r[0])[0];
		}
		var icon = s.item || s.util || s.racial || s.prof ? s.i : Sp.iconOf(s, iconId), ab = abilityId(s);
		return '<div class="sp' + (st.hot === s.n ? ' hot' : '') + (used ? ' used' : '') + '"' + attrs + ' data-n="' + esc(s.n) + '"' + (ab ? ' data-ab="' + ab + '"' : '') + '>'
			+ slotHTML({ icon: icon }, { s: 'calc(30px * var(--ts, 1))' }) + '<div class="spt"><div class="nm">' + esc(s.n) + '</div><div class="rk">'
			+ (rk || '&nbsp;') + '</div></div>' + tail + '</div>';
	}
	// 0.3.1 (Harry, Oct 18: "people should be able to choose the rank - so on the side of the ability we should have
	// means to downrank and then drag that over"): a row's chosen rank (0: Highest), per class and name, never kept
	function rowRankOf(s) {
		var n = st.rowRank[st.cls + ':' + s.n] || 0;
		return n && Sp.rankChoices(s).indexOf(n) >= 0 ? n : 0;
	}
	function rowStep(name, pick) {
		return '<span class="step rstep' + (pick ? ' set' : '') + '" data-act="rowrank" data-n="' + esc(name) + '"><i data-step="-1">&lsaquo;</i><b>'
			+ (pick ? 'Rank ' + pick : 'Highest') + '</b><i data-step="1">&rsaquo;</i></span>';
	}
	function raceWords(keys) {
		return keys.map(function (k) { return D.races && D.races[k] ? D.races[k].name : k; }).join(' / ');
	}
	function spellListHTML() {
		var h = '', U = st.used === 'Mark' ? usedSet() : null;
		spellGroups().forEach(function (g) {
			h += '<div class="sub">' + esc(g[0]) + '</div>';
			g[1].forEach(function (s) { h += spellRowHTML(s, U && rowUsed(s, U)); });
		});
		return h;
	}

	// ------------------------------------------------------------------ used spells (0.5.7)
	// Harry, Oct 19: "abilities that are either being used or macro'd - there should be a toggle for hiding them or putting
	// a purple border around them if they're already being used, that way it's easier to see what is missing". Used
	// < Show | Mark | Hide > at the list's top (kept in this browser): a spell is used at any rank, on any bar or form tab,
	// or named in a made macro's text; a utility row or an item when a button holds it.
	var USED = ['Show', 'Mark', 'Hide'], USED_STORE = 'HUIBarEditor.used';
	// the spell names a macro's text casts or shows: /cast, /use, /castsequence, /castrandom, /userandom, #showtooltip,
	// #show - their [conditions], reset=, a leading ! and a (Rank N) dropped; a slot number (/use 13) is no name
	function macroSpellNames(body) {
		var out = [];
		String(body || '').split(/\r?\n/).forEach(function (line) {
			var m = /^\s*(#showtooltip|#show|\/cast|\/use|\/castsequence|\/castrandom|\/userandom)(?![a-z])(.*)$/i.exec(line);
			if (!m) return;
			m[2].replace(/\[[^\]]*\]/g, ' ').replace(/\breset=\S+/gi, ' ').split(/[;,]/).forEach(function (a) {
				a = a.replace(/^\s*!/, '').replace(/\(\s*(Rank\s*\d+)?\s*\)\s*$/i, '').replace(/^\s+|\s+$/g, '');
				if (a && !/^\d+$/.test(a)) out.push(a.toLowerCase());
			});
		});
		return out;
	}
	// Oct 19 (Harry: "#showtooltip on a blank macro isn't showing the effect of it working"): a macro on the ? icon shows
	// what the game shows - the icon of the first spell or item its text casts or shows (#showtooltip's own name first)
	function iconOfName(n) {
		var s = Sp.byName(CD(), n);
		if (s) return spellIconOf(s);
		for (var i = 0; i < D.general.length; i++) if (D.general[i].n && D.general[i].n.toLowerCase() === n) return D.general[i].i;
		return null;
	}
	function shownIcon(icon, body) {
		if (icon && icon !== QUESTION) return icon;
		var names = macroSpellNames(body);
		for (var i = 0; i < names.length; i++) { var x = iconOfName(names[i]); if (x) return x; }
		return QUESTION;
	}
	function usedSet() {
		var L = cur(), U = { names: {}, items: {}, families: {}, slots: {}, mount: false };
		var sl = L.specs[0].slots;
		Object.keys(sl).forEach(function (n) {
			var e = sl[n];
			if (!e) return;
			if (e.t === 'spell') { var sp = spellIn(L, e.id); U.names[((sp && sp.n) || e.name || '').toLowerCase()] = true; }
			else if (e.t === 'item') U.items[e.id] = true;
			else if (e.t === 'family') U.families[e.id] = true;
			else if (e.t === 'slot') U.slots[e.slot] = true;
			else if (e.t === 'mount') U.mount = true;
		});
		L.macros.forEach(function (m) { macroSpellNames(m.body).forEach(function (x) { U.names[x] = true; }); });
		return U;
	}
	function rowUsed(s, U) {
		if (s.util) {
			var u = s.util;
			return u.k === 'item' ? !!U.items[u.id] : u.k === 'family' ? !!U.families[u.id] : u.k === 'slot' ? !!U.slots[u.slot] : u.k === 'mount' ? U.mount : false;
		}
		if (s.item) return s.tiers.some(function (t) { return U.items[t[0]]; });
		return !!U.names[s.n.toLowerCase()];
	}
	function loadUsed() {
		try { var v = localStorage.getItem(USED_STORE); if (USED.indexOf(v) >= 0) st.used = v; } catch (e) { /* Show */ }
	}
	function saveUsed() {
		if (st.demo) return;
		try { localStorage.setItem(USED_STORE, st.used); } catch (e) { /* only for this visit */ }
	}
	function spellsColHTML() {
		var parents = Sp.schools(CD(), offeredList());
		if (parents.indexOf(st.filter) < 0) st.filter = 'All';
		var search = '<span class="fl" style="flex:1;min-width:0;margin-right:12px"><input id="search" placeholder="Search" value="' + esc(st.search) + '"></span>';
		return head('Spells') + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
			+ search + step(esc(st.filter), ' data-act="filter"') + '</div>'
			+ '<div class="usedrow"><span class="cmpword">Used</span>' + step(st.used, ' data-act="used"') + '</div>'
			+ '<div class="splist" id="splist">' + spellListHTML() + '</div>';
	}

	// ------------------------------------------------------------------ the bars
	function isSel(bar, i) { return st.sel && st.sel.bar === bar && st.sel.i === i; }
	// 0.4.1: in Keybind mode, the chosen button waiting for its key
	function armed() { return !!(st.kbMode && st.capture); }
	function barsHTML(o) {
		var L = cur(), t = tabs(), h = '<div>';   // --bl (the row word) and --bg (the gap): sizeToRoom's
		var O = cmpLayout(), swap = !!(O && st.cmpSwap);
		var rowsDrag = !o.only && !swap;   // 0.6.4: a row's word drags the row (bars 2-8), not in Swap view
		o.s = 'var(--bs)';
		if (t.length && (!o.only || o.only === 1)) {
			h += '<div class="b1head"><span style="width:calc(var(--bl) - 16px)"></span>'
				+ seg(t.map(function (x) { return [x[1], x[0]]; }), bar1Page(), ' data-act="tab"');
			if (st.cls === 'DRUID') {
				h += tick(L.options.prowlBar, 'Prowl bar', ' data-act="prowl"') + tick(L.options.moonkinBar, 'Moonkin bar', ' data-act="moonkin"');
			}
			// the note is a druid's: its forms page bar 1 only (Harry, Oct 18: "this is a druid only thing")
			if (st.cls === 'DRUID') h += '<span class="soft" style="margin-left:auto;font-size:13px;white-space:nowrap">Bars 2&ndash;8: every form</span>';
			h += '</div>';
		}
		for (var bar = 1; bar <= 8; bar++) {
			if (o.only && bar !== o.only) continue;
			if (t.length && bar === 2 && !o.only) h += '<div class="b1sep"></div>';
			// 0.5.1: the row's word opens its menu (Modify > Shift / Ctrl / Alt > Bar N)
			h += '<div class="brow"><span class="bl' + (rowsDrag ? (bar === 1 ? ' rowfixed' : ' rowdrag') : '') + '" data-barmenu="' + bar + '"'
				+ (rowsDrag && bar > 1 ? ' data-rowdrag="' + bar + '"' : '') + '>Bar ' + bar + '</span><div class="slots">';
			for (var i = 1; i <= 12; i++) {
				var n = slotN(bar, i), e = slots()[n], info = show(e), inset = null, cmd = Lay.command(bar, i), kL = L;
				if (O) {
					var oi = showFor(O, O.specs[0].slots[N.placeIn(L, O, bar, i, bar1Page())]);
					if (swap) { inset = info; info = oi; kL = O; } else inset = oi;
				}
				// Swap view shows the other layout: read-only (no drags, no drops), a click still picks the place
				// 0.6.3: while Move is on, the picked buttons wear the chosen look, and any button drags (an empty one too)
				h += slotHTML(info, { s: o.s, key: keyText(cmd, kL), sel: st.move ? isPicked(bar, i) : isSel(bar, i), armed: armed(), inset: inset,
					attrs: (swap ? '' : ' data-drop="slot"') + ' data-n="' + n + '" data-bar="' + bar + '" data-i="' + i + '"' + keyTipAttr(cmd, kL)
						+ (swap ? '' : (info.empty && !st.move) ? ' data-pick="1"' : ' data-drag="slot"') });
			}
			h += '</div></div>';
		}
		if (o.only) return h + '</div>';
		// the game's own stance and pet bars: shown, keyed, not stored
		// 0.6.11: none for a shaman (Forever gives it no stance bar: Ghost Wolf is an ordinary spell)
		if (Lay.hasStanceBar(st.cls)) {
			var stance = Sp.stanceBar(CD());   // 0.6.12: a talent form too (Moonkin Form, Shadowform), in its place
			var ns = stance.length;   // exactly the class's own stances / forms, no spare box
			h += '<div class="brow' + (stance.length ? '' : ' off') + '"><span class="bl">Stance</span><div class="slots">';
			for (var j = 1; j <= ns; j++) {
				var s = stance[j - 1];
				h += slotHTML(s ? { icon: s.i, spell: s } : { empty: true }, { s: o.s, key: keyText(Lay.command('stance', j)),
					sel: isSel('stance', j), armed: armed(), attrs: ' data-pick="1" data-xbar="stance" data-i="' + j + '"' + (s ? ' data-drag="xslot"' : '')
						+ keyTipAttr(Lay.command('stance', j)) });
			}
			h += '</div></div>';
		}
		var pet = CD().pet;
		h += '<div class="brow' + (pet ? '' : ' off') + '"><span class="bl">Pet</span><div class="slots">';
		for (var k = 1; k <= 10; k++) {
			h += slotHTML({ empty: true }, { s: o.s, key: keyText(Lay.command('pet', k)), sel: isSel('pet', k), armed: armed(),
				attrs: ' data-pick="1" data-xbar="pet" data-i="' + k + '"' + (pet ? ' data-drag="xslot"' : '') + keyTipAttr(Lay.command('pet', k)) });
		}
		return h + '</div></div></div>';
	}

	// ------------------------------------------------------------------ Compare (0.4.0)
	// Harry, Oct 18: "if they play a healer, let's say, then being able to press a button to 'view from' a different set of
	// keybinds could be really good, because then they could compare where their downranking abilities are, or their
	// absorbs, or HoTs or whatever - they can take inspiration from the other character at a glimpse". Read-only: neither
	// layout is ever changed by it.
	function layoutById(id) {
		var L = null;
		st.layouts.forEach(function (l) { if (l._id === id) L = l; });
		return L;
	}
	function cmpLayout() {
		var O = st.cmp ? layoutById(st.cmp) : null;
		return O && O !== cur() ? O : null;
	}
	// every layout but the current one, by class then as listed (saved: only the SAVED ones - Harry, Oct 19: "compare
	// should only compare against our saved presets ... when i 'Save' or Import and select a name - then we have a
	// profile"; L.saved is set by Save, Open, an imported string and a Layouts.lua read back, never by a class looked at)
	function otherLayouts(except, saved) {
		var out = [];
		Lay.CLASSES.forEach(function (c) { classLayouts(c).forEach(function (l) { if (l !== except && (!saved || l.saved)) out.push(l); }); });
		return out;
	}
	// 0.6.11 (Harry, Oct 20: "compare priest new makes no sense. priest human is what it is"): a preset is its race and
	// class, the Download file's words ("Human Priest"; no race: the class alone), its name after only when another of
	// `list` has the same race and class ("Human Priest · Healer")
	function raceWord(key) { var R = key && D.races && D.races[key]; return R ? R.name : 'No race'; }
	function presetWord(l) { var R = l.race && D.races && D.races[l.race]; return (R ? R.name + ' ' : '') + D.classes[l.class].name; }
	function sameKind(a, b) { return a.class === b.class && (a.race || '') === (b.race || ''); }
	function layoutWord(l, list) {
		var twin = (list || []).some(function (x) { return x && x !== l && sameKind(x, l); });
		return esc(presetWord(l)) + (twin ? ' &middot; ' + esc(l.name) : '');
	}
	// 0.6.3 (Harry, Oct 19: "i want to make a column draggable ... can you create a simple dragging tool that allows me to
	// move stuff i'm unhappy with"): Move < Off | On > beside Compare
	function moveHTML() {
		if (st.view === 'screen') return '';
		return '<span class="hgrp"><span class="cmpword">Move</span>' + step(st.move ? 'On' : 'Off', ' data-act="move"') + '</span>';
	}
	// 0.6.11 (Harry, Oct 20: "instead of shuffling through them all 1 by 1 compare priest then have another option as the
	// race, but only ones where we have stored settings appear so it's easier to navigate"): Compare < Class > of the
	// classes with a saved preset (never the current layout), then < Race > of that class's saved presets (one race: picked
	// straight away), then < Name > only when that race and class has more than one
	function cmpState() {
		var list = otherLayouts(cur(), true), O = cmpLayout();
		var classes = Lay.CLASSES.filter(function (c) { return list.some(function (l) { return l.class === c; }); });
		var cls = O ? O.class : (classes.indexOf(st.cmpCls) >= 0 ? st.cmpCls : null);
		var races = [];
		list.forEach(function (l) { if (l.class === cls && races.indexOf(l.race || '') < 0) races.push(l.race || ''); });
		return { list: list, O: O, classes: classes, cls: cls, races: races };
	}
	function cmpGroup(c, cls, race) { return c.list.filter(function (l) { return l.class === cls && (l.race || '') === race; }); }
	function compareHTML() {
		if (st.view === 'screen') return '';
		var c = cmpState(), O = c.O, h = '<span class="cmpword">Compare</span>'
			+ step(c.cls ? esc(D.classes[c.cls].name) : 'Off', ' data-act="compare"', !c.classes.length);
		if (c.cls) h += step(O ? esc(raceWord(O.race)) : 'Race', ' data-act="cmprace"', O && c.races.length < 2);
		if (O && cmpGroup(c, O.class, O.race || '').length > 1) h += step(esc(O.name), ' data-act="cmpname"');
		// a group of its own: a narrow Bars heading (1280) wraps between the groups, never inside one or off the end
		return '<span class="hgrp">' + h + (O ? '<span class="soft wordbtn' + (st.cmpSwap ? ' on' : '') + '" data-act="cmpswap">Swap view</span>' : '')
			+ '</span>';
	}
	function cycle(list, at, d) { return list[at < 0 ? (d > 0 ? 0 : list.length - 1) : (at + d + list.length) % list.length]; }
	function stepCompare(act, d) {
		var c = cmpState(), g;
		if (act === 'compare') {
			st.cmpCls = cycle([null].concat(c.classes), [null].concat(c.classes).indexOf(c.cls), d);
			st.cmp = null;
			var rs = cmpState().races;
			if (st.cmpCls && rs.length === 1) st.cmp = cmpGroup(c, st.cmpCls, rs[0])[0]._id;
		} else if (act === 'cmprace' && c.cls && c.races.length) {
			g = cmpGroup(c, c.cls, cycle(c.races, c.O ? c.races.indexOf(c.O.race || '') : -1, d));
			st.cmp = g.length ? g[0]._id : null;
		} else if (act === 'cmpname' && c.O) {
			g = cmpGroup(c, c.O.class, c.O.race || '');
			st.cmp = cycle(g, g.indexOf(c.O), d)._id;
		}
		if (!cmpLayout()) st.cmpSwap = false;
	}

	// Export and Import: the right panel's own section at its foot (0.2.1, Harry, Oct 18: "move import and export over to
	// the side"), each box a few lines high and scrolling; side by side when the panel is wide enough
	function sendHTML() {
		return '<div class="xport"><div>' + head('Export', btn('Copy', 's', ' data-act="copy"')) + '<div class="str" id="exp">' + esc(st.exportStr) + '</div></div>'
			+ '<div>' + head('Import', (st.importMsg ? '<span class="' + (st.importPink ? 'pinkt' : 'soft') + '">' + esc(st.importMsg) + '</span>' : '')
				+ btn('Import', 's', ' data-act="import"')) + '<textarea class="paste" id="imp" placeholder="Paste a string" spellcheck="false"></textarea></div></div>';
	}

	// 0.6.5 (Harry, Oct 19: "we can also give it some other stuff like automatically turn on auto loot if disabled,
	// automatically turn on dps meter if disabled, etc"): the layout's game settings, one tick each, over Export and
	// Import in the right panel. Ticked = written as true and turned on in game; unticked = left out, never turned off.
	function settingsHTML() {
		var set = cur().settings || {};
		return '<div class="lset">' + head('Settings') + '<div class="lsgrid">' + Lay.SETTINGS.map(function (s) {
			return tick(set[s[0]] === true, esc(s[1]), ' data-lset="' + s[0] + '"');
		}).join('') + '</div></div>';
	}
	function toggleSetting(k) {
		var L = cur();
		L.settings = Lay.settingsOf(L.settings) || {};
		if (L.settings[k]) delete L.settings[k]; else L.settings[k] = true;
		changed();
	}

	// ------------------------------------------------------------------ the selected slot
	function selCommand() {
		var s = st.sel;
		if (!s) return null;
		return Lay.command(s.bar, s.i);
	}
	function selEntry() {
		var s = st.sel;
		if (!s || typeof s.bar !== 'number') return null;
		return slots()[slotN(s.bar, s.i)] || null;
	}
	function selWhere() {
		var s = st.sel;
		if (!s) return '';
		if (s.bar === 'stance') return 'Stance &middot; ' + s.i;
		if (s.bar === 'pet') return 'Pet &middot; ' + s.i;
		var t = s.bar === 1 && tabs().length ? tabName(bar1Page()) + ' &middot; ' : '';
		return 'Bar ' + s.bar + ' &middot; ' + t + s.i;
	}
	function slotPanelHTML() {
		var s = st.sel || { bar: 1, i: 1 }, L = cur(), cmd = selCommand(), keys = L.specs[0].keys[cmd] || [];
		var info, sub = '', e = null;
		if (s.bar === 'stance') {
			var sp = Sp.stanceBar(CD())[s.i - 1];
			info = sp ? { icon: sp.i, name: sp.n } : { empty: true, name: 'Stance ' + s.i };
			sub = sp ? 'Stance bar' + (sp.t ? ' &middot; <span class="tal">Talent</span>' : '') : '';
		} else if (s.bar === 'pet') {
			info = { empty: true, name: 'Pet ' + s.i };
			sub = CD().pet ? 'Pet bar' : '';
		} else {
			e = selEntry();
			info = show(e);
			if (e && e.t === 'spell') {
				var top = info.spell && !info.spell.general ? Sp.highest(info.spell) : null;
				if (e.rank) sub = 'Rank ' + e.rank + (!isAuto(e) && top && top[1] ? ' of ' + top[1] : '');
			} else if (e && e.t === 'macro') {
				var m = macroOf(e.key);
				sub = m ? (m.scope === 'character' ? 'Character' : 'Account') : '';
			} else if (e && e.t === 'item') {
				var it = itemInfo(e.id);
				sub = it ? it.g.n : '';
			} else if (e && info.sub) {
				sub = info.sub;
			}
		}
		var h = '<div id="slothead">' + head('Slot', selWhere()) + '<div style="display:flex;gap:12px;align-items:center;margin-bottom:6px">'
			+ slotHTML(info, { s: 'calc(40px * var(--ts, 1))', key: keys[0] ? keyWord(keys[0]) : '' }) + '<div style="min-width:0"><div class="nm big">'
			+ esc(info.empty && !e ? info.name : info.name) + '</div><div class="rk">' + (sub || '&nbsp;') + '</div></div></div></div>';
		if (e && e.t === 'spell' && info.spell && (info.spell.prof || info.spell.mountRow)) {
			// 0.6.4: a profession is always its best known (by name in game), a mount itself: no rank to pin, no Mouseover
			if (info.spell.r.length > 1) h += row('Rank', '<span class="soft">Best known</span>', ' id="rankrow"');
		} else if (e && e.t === 'spell') {
			var ranked = info.spell && !info.spell.general && info.spell.r.length > 1;
			h += row('Auto rank', tick(isAuto(e), '', ' data-act="auto"'), ' id="autorow"');
			if (isAuto(e) || !ranked) h += row('Rank', '<span class="soft">Highest</span>', ' id="rankrow"');
			else h += row('Rank', step('Rank ' + e.rank, ' data-act="pinrank"'), ' id="rankrow"');
			// 0.6.3 (Harry, Oct 19: "when i click on a slot with a pre-existing skill in ... i can just 'create macro version'
			// -> it creates the macro in 'Your Macros', and then it switches it out with the macro version")
			if (info.spell) h += row('Macro', btn('Mouseover', 's', ' id="momacro" data-act="momacro"'), ' id="macrorow"');
		}
		var cap = st.capture, ktip = keys[0] ? keyTip(keys[0]) : '';
		// 0.4.5: with the keyboard closed, the layer switch (the capture modifier) beside the key box, and the hint under it
		// while the key box waits (in Keybind mode the band's switch carries it)
		var lsw = !st.keys;
		h += '<div class="row" id="keyrow"><span class="rl">Key</span><span class="rc" style="flex:1;max-width:' + (lsw ? 'none;justify-content:flex-end' : '230px') + '">'
			+ (lsw ? layerSeg('key') : '')
			+ '<span class="keycap' + (cap ? ' cap' : '') + '" style="flex:1' + (lsw ? ';max-width:200px;min-width:0' : '') + '" data-act="capture"' + (ktip ? ' data-tip="' + esc(ktip) + '"' : '') + '>'
			+ (cap ? 'Press a key' + (keys[0] ? '<span class="was">' + esc(keyWord(keys[0])) + '</span>' : '')
				: (keys[0] ? esc(keyWord(keys[0])) : '<span class="none">None</span>'))
			+ '</span>' + btn('Clear', 's', ' data-act="clearkey"') + '</span></div>'
			+ (hintAt() === 'key' ? hintHTML('key') : '');
		// the same key in every form (bar 1 with form tabs)
		if (s.bar === 1 && tabs().length) {
			h += '<div class="row" id="statesrow"><span class="rl">' + statesWord() + '</span><span class="rc" style="gap:14px">';
			tabs().forEach(function (t) {
				var on = t[1] === bar1Page(), en = slots()[Lay.slotNumber(1, s.i, t[1])];
				h += '<span style="display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer" data-tabpick="' + t[1] + '">'
					+ slotHTML(show(en), { s: 30, key: keys[0] ? keyWord(keys[0]) : '', sel: on, noname: 1 })
					+ '<span style="font-size:12px;color:' + (on ? '#fff' : 'var(--dim)') + '">' + esc(t[0]) + '</span></span>';
			});
			h += '</span></div>';
		}
		return h;
	}

	// ------------------------------------------------------------------ the macro maker (the in-game one's templates)
	function freshMaker(tpl) {
		return { tpl: tpl || 'heal', f: Mac.DefaultFields(tpl || 'heal'), name: '', icon: null,
			iconTyped: false, scope: 'account', editing: null };
	}
	// 0.6.0: the Or (Mouseover's second spell, 0.6.1) is makerSpell('spell2')
	function makerSpell(field) {
		var f = st.maker.f, n = Mac.Trim(f[field || 'spell'] || '');
		if (!n) return null;
		return Sp.byName(CD(), n) || (function () {
			for (var i = 0; i < D.general.length; i++) if (!D.general[i].item && D.general[i].n.toLowerCase() === n.toLowerCase()) return D.general[i];
			return null;
		})();
	}
	// the rank list: Highest, then Rank 1 .. the highest rank by 60 (in game: the spell book's)
	function rankItems(field) {
		var s = makerSpell(field), items = [[0, 'Highest']];
		if (s && !s.general) {
			var h = Sp.highest(s), top = h ? h[1] : 0;
			if (top > 1) for (var r = 1; r <= top; r++) items.push([r, 'Rank ' + r]);
		}
		return items;
	}
	// 0.6.3 (HUI Menus 0.20.1; Harry, Oct 19: "if i want to make a resurrection macro i can't because 'nodead' is
	// engrained"): a Spell that raises the dead (Mac.IsRes), named as data.js names the class spells (in game: the client)
	var resNames = null;
	function resNameOf(id) {
		if (!resNames) {
			resNames = {};
			Object.keys(D.classes).forEach(function (c) {
				D.classes[c].spells.forEach(function (sp) {
					(sp.r || []).forEach(function (r) { if (Mac.RES_SPELLS.indexOf(r[0]) >= 0) resNames[r[0]] = sp.n; });
				});
			});
		}
		return resNames[id] || null;
	}
	function isRes(name) { return Mac.IsRes(name, resNameOf); }
	// 0.6.3 (Harry, Oct 19: "something like penance ... i should at least be able to edit it"): a row changed - the text
	// written fresh from the rows, a hand edit in the code box dropped
	function rowChanged() { delete st.maker.f.typed; }
	// Mouseover's Spell set (typed or dropped): a resurrection puts On at Dead, once, as it becomes one
	function setMakerSpell(v) {
		var m = st.maker, was = m.tpl === 'heal' && isRes(m.f.spell);
		rowChanged();
		m.f.spell = v;
		m.f.rank = (m.tpl === 'spawn' && rankItems().length > 2) ? 1 : 0;
		if (m.tpl === 'heal' && !was && isRes(v)) m.f.on = 'dead';
	}
	// Else: Target, and Me (greyed on an enemy or the dead, kept)
	function elseHTML(f) {
		var friend = f.on !== 'enemy' && f.on !== 'dead';
		return tick(f.target, 'Target', ' data-act="mtarget"') + '<span style="width:14px"></span>'
			+ tick(f.me && friend, 'Me', ' data-act="mme"', !friend);
	}
	function autoIcon() {
		var m = st.maker;
		if (m.iconTyped && m.icon && !(m.tpl === 'blank' && m.icon === QUESTION)) return m.icon;
		if (m.tpl === 'heal' || m.tpl === 'cast') {
			// 0.6.0: Mouseover's icon the Spell's, the Or's when only it is known
			var s = makerSpell() || (m.tpl === 'heal' ? makerSpell('spell2') : null);
			if (s) return spellIconOf(s);
		}
		if (m.tpl === 'blank') return shownIcon(null, m.f.body);   // the ? until the text names something
		return QUESTION;
	}
	function spellIconOf(s) { return s.general ? s.i : Sp.iconOf(s, (Sp.highest(s) || s.r[0])[0]); }
	function makerText() { return Mac.Text(st.maker.tpl, st.maker.f); }
	// 0.5.0 (Harry, Oct 18: "i do not want you to automatically make names for macros (i often leave my macros with no
	// name)"): the Name is only what is typed - never filled in from the fields - and a macro may have none (the in-game
	// window's rule since HUI Menus 0.19.35; Mac.DefaultName stays for the parity test only)
	function makerName() { return Mac.CleanName(st.maker.name || ''); }
	function makerRoom() {
		var m = st.maker, c = Lay.macroCounts(cur()), x = m.editing ? macroOf(m.editing) : null;
		// edited in its own set; moved (0.6.11): the other set needs room, unless the same macro is there already
		if (x && (scopeOf(x) === m.scope || macroTwin(m.scope, makerName(), makerText(), x.key))) return true;
		return m.scope === 'character' ? c.character < Lay.MAX_CHARACTER : c.account < Lay.MAX_ACCOUNT;
	}
	function makerReady() {
		var m = st.maker;
		return Mac.Ready(m.tpl, m.f) && Mac.Letters(makerText()) <= Mac.MAX_LETTERS && makerRoom();
	}
	function codeHTML(text) {
		return Mac.Parts(text).map(function (line) {
			return line.map(function (p) {
				var c = { meta: 'mm', command: 'mk', condition: 'mc', rest: '' }[p[0]];
				return c ? '<span class="' + c + '">' + esc(p[1]) + '</span>' : esc(p[1]);
			}).join('');
		}).join('\n');
	}
	function field(id, value, hint, opts) {
		opts = opts || {};
		return '<span class="fl" style="width:' + (opts.w || 200) + 'px"' + (opts.drop ? ' data-drop="' + opts.drop + '"' : '') + '>'
			+ (opts.icon !== undefined ? '<img id="' + id + '-icon" src="' + ic(opts.icon) + '" alt=""' + (opts.icon ? '' : ' style="visibility:hidden"') + '>' : '')
			+ '<input id="' + id + '" value="' + esc(value || '') + '" placeholder="' + esc(hint || '') + '" spellcheck="false"'
			+ (opts.list ? ' list="' + opts.list + '"' : '') + '></span>';
	}
	function makerFieldsHTML() {
		var m = st.maker, f = m.f, H = Mac.HINTS[m.tpl] || {}, h = '';
		var s = makerSpell();
		var spellIcon = s ? spellIconOf(s) : 0;
		var rankStep = function (two) {
			var items = rankItems(two ? 'spell2' : 'spell'), r = Number(two ? f.rank2 : f.rank) || 0, word = 'Highest';
			items.forEach(function (x) { if (x[0] === r) word = x[1]; });
			return '<span id="mk-rank' + (two ? '2' : '') + '">' + step(word, ' data-act="mrank' + (two ? '2' : '') + '"', items.length < 2) + '</span>';
		};
		if (m.tpl === 'heal') {
			h += row('On', seg(Mac.ON, f.on || 'friendly', ' data-act="mon"'), ' id="mk-onrow"');   // 0.6.3: and Dead
			// 0.6.1 (HUI Menus 0.19.41; Harry, Oct 19: "just include an option inside the mouseover for known/either. also
			// include things like stopcast in mouseover like you did with cast helper, same with trinket"): Spell, and Or (cast
			// where the Spell is not known; 0.6.0's Either), each its own Rank; Kind, Trinket's Slot and Item as Cast helper's
			var s2 = makerSpell('spell2');
			h += row('Spell', field('mk-spell', f.spell, H.spell, { icon: spellIcon, drop: 'mspell', list: 'spellnames' }));
			h += row('Rank', rankStep(false));
			h += row('Or', field('mk-spell2', f.spell2, H.spell2, { icon: s2 ? spellIconOf(s2) : 0, drop: 'mspell2', list: 'spellnames' }));
			h += row('Rank', rankStep(true));
			h += row('Kind', seg(Mac.MO_KINDS, f.kind || 'plain', ' data-act="mkind"'));
			if (f.kind === 'trinket') {
				h += row('Slot', seg(Mac.SLOTS, f.slot, ' data-act="mslot"'));
				if (f.slot === 'other') h += row('Item', field('mk-item', f.item, H.item));
			}
			h += row('Else', elseHTML(f), ' id="mk-elserow"');
		} else if (m.tpl === 'talk') {
			h += row('NPC', field('mk-npc', f.npc, H.npc));
			h += row('Line', field('mk-line', f.line, ''));
			h += row('Talk', '<span style="color:#cfcad8">Then press Interact</span>');
		} else if (m.tpl === 'spawn') {
			h += row('Name', field('mk-sname', f.name, H.name));
			var marks = '';
			for (var i = 8; i >= 1; i--) marks += '<span data-mark="' + i + '"' + (f.mark === i ? ' class="on"' : '') + '><img src="' + ic(D.textures['mark' + i]) + '" alt=""></span>';
			marks += '<span class="none' + (!(f.mark >= 1 && f.mark <= 8) ? ' on' : '') + '" data-mark="0">None</span>';
			h += row('Mark', '<span class="marks">' + marks + '</span>');
			h += row('Found', tick(f.sound, 'Sound', ' data-act="msound"') + '<span style="width:14px"></span>' + tick(f.exact, 'Exact name', ' data-act="mexact"'));
			// 0.5.9 (Harry, Oct 19: "also cast rank 1 version of tag ability"): Tag, cast on the spawn once targeted, Rank 1 first
			h += row('Tag', field('mk-spell', f.spell, H.spell, { icon: spellIcon, drop: 'mspell', list: 'spellnames' }));
			h += row('Rank', rankStep());
		} else if (m.tpl === 'cast') {
			h += row('Kind', seg(Mac.KINDS, f.kind, ' data-act="mkind"'));
			h += row('Spell', field('mk-spell', f.spell, H.spell || 'Greater Heal', { icon: spellIcon, drop: 'mspell', list: 'spellnames' }));
			h += row('Rank', rankStep());
			if (f.kind === 'trinket') {
				h += row('Slot', seg(Mac.SLOTS, f.slot, ' data-act="mslot"'));
				if (f.slot === 'other') h += row('Item', field('mk-item', f.item, H.item));
			}
		}
		return h;
	}
	function makerHTML(codeH) {
		var m = st.maker, T = Mac.BY_KEY[m.tpl];
		var h = head('Macro', btn('New', 's', ' data-act="mnew"'));
		h += '<div class="tpls">' + Mac.TEMPLATES.map(function (t) {
			return '<span class="t' + (t.key === m.tpl ? ' on' : '') + '" data-tpl="' + t.key + '"><img src="' + ic(D.textures[t.key]) + '" alt=""></span>';
		}).join('') + '<span class="tn">' + esc(T.label) + '</span></div>';
		h += makerFieldsHTML();
		h += row('Name', '<span class="fl" style="width:200px" data-drop="micon"><img id="mk-nameicon" src="' + ic(autoIcon()) + '" alt="">'
			+ '<input id="mk-name" value="' + esc(makerName()) + '" spellcheck="false" maxlength="40"></span>');
		// 0.6.11 (Harry, Oct 20: "when i right click healing touch macro and press edit -> and then click on 'Character'
		// instead of account. nothing happens"): live while editing too - Save moves the macro to that set
		h += row('Where', seg([['account', 'Account'], ['character', 'Character']], m.scope, ' data-act="mscope"'));
		var text = makerText();
		if (m.tpl === 'blank') {
			h += '<textarea class="code" id="mk-body" style="margin-top:6px;height:' + codeH + 'px" spellcheck="false" placeholder="#showtooltip">' + esc(m.f.body || '') + '</textarea>';
		} else {
			// 0.6.0: as tall as the text needs (Mouseover's long line with an Or wraps), never less than drawn. 0.6.3: typed in
			// on every template - the text in colour, and over it, in the same place, a clear box that takes the typing
			h += '<div style="position:relative;margin-top:6px"><div class="code" id="mk-code" style="min-height:' + codeH + 'px">' + codeHTML(text) + codeTail(text) + '</div>'
				+ '<textarea class="code" id="mk-edit" spellcheck="false" maxlength="' + Mac.MAX_LETTERS + '" style="position:absolute;left:0;top:0;width:100%;height:100%;'
				+ 'background:transparent;box-shadow:none;color:transparent;caret-color:var(--pearl);overflow:hidden">' + esc(text) + '</textarea></div>';
		}
		h += '<div class="row" style="margin-top:4px;border:0"><span class="count" id="mk-count">' + Mac.Letters(text) + ' / ' + Mac.MAX_LETTERS + '</span>'
			// 0.5.5: a macro opened from Your macros is saved over itself (Save), a new one made (Make). 0.6.3 (Harry could not
			// find how to delete one): beside Save, Delete in the menu's pink words - as Your macros' right-click Delete
			+ '<span style="display:flex;gap:8px;align-items:center">' + (m.editing ? btn('Delete', '', ' id="mk-delete" data-act="mdelete" style="color:var(--pink)"') : '')
			+ btn(m.editing ? 'Save' : 'Make', 'p' + (makerReady() ? '' : ' grey'), ' id="mk-make" data-act="make"') + '</span></div>';
		return '<div id="maker">' + h + '</div>';
	}
	// a text ending in a new line: the coloured copy one line longer too, as the box over it is
	function codeTail(text) { return /\n$/.test(text) ? '<br>' : ''; }
	// the live parts, without touching the field being typed in
	function paintMaker() {
		var m = st.maker, text = makerText(), n = Mac.Letters(text);
		var code = $('mk-code');
		if (code) code.innerHTML = codeHTML(text) + codeTail(text);
		var edit = $('mk-edit');
		if (edit && edit.value !== text) edit.value = text;   // 0.6.3: a row changed - the box holds the fresh text
		var onRow = $('mk-onrow');
		if (onRow) onRow.querySelector('.rc').innerHTML = seg(Mac.ON, m.f.on || 'friendly', ' data-act="mon"');
		var elseRow = $('mk-elserow');
		if (elseRow) elseRow.querySelector('.rc').innerHTML = elseHTML(m.f);
		var count = $('mk-count');
		if (count) { count.textContent = n + ' / ' + Mac.MAX_LETTERS; count.style.color = n > Mac.MAX_LETTERS ? 'var(--pink)' : ''; }
		var make = $('mk-make');
		if (make) make.classList.toggle('grey', !makerReady());
		var ni = $('mk-nameicon');
		if (ni) ni.src = ic(autoIcon());
		['spell', 'spell2'].forEach(function (fd) {
			var two = fd === 'spell2', si = $('mk-' + fd + '-icon'), s = makerSpell(fd);
			if (si) {
				si.style.visibility = s ? 'visible' : 'hidden';
				if (s) si.src = ic(spellIconOf(s));
			}
			var rf = two ? 'rank2' : 'rank', rk = $('mk-' + rf);
			if (rk) {
				var items = rankItems(fd), r = Number(m.f[rf]) || 0, word = 'Highest';
				if (r > items.length - 1) { m.f[rf] = 0; r = 0; }
				items.forEach(function (x) { if (x[0] === r) word = x[1]; });
				rk.innerHTML = step(word, ' data-act="m' + rf + '"', items.length < 2);
			}
		});
	}
	function madeHTML(s) {
		var L = cur(), acc = [], chr = [];
		L.macros.forEach(function (m) { (m.scope === 'character' ? chr : acc).push(m); });
		var one = function (m) {
			return slotHTML({ icon: shownIcon(m.icon, m.body), name: m.name, mac: true }, { s: s, cls: st.maker.editing === m.key ? 'editing' : '',
				attrs: ' data-drag="macro" data-key="' + esc(m.key) + '"' + (m.name ? ' title="' + esc(m.name) + '"' : '') });
		};
		// (Harry, Oct 18: "i don't understand 'made'") the layout's macros: shown from the first one made, each group's
		// word only when it has some
		if (!acc.length && !chr.length) return '';
		var group = function (word, list) {
			return list.length ? '<div class="mg"><div class="soft">' + word + '</div><div class="micons">' + list.map(one).join('') + '</div></div>' : '';
		};
		return '<div id="made">' + head('Your macros') + '<div class="made">' + group('Account', acc) + group('Character', chr) + '</div></div>';
	}
	// the Bar 1 states row's word: the class's own (Harry: "i don't understand ... 'same key'")
	function statesWord() { return { WARRIOR: 'Stances', DRUID: 'Forms', ROGUE: 'Stealth' }[st.cls] || 'Forms'; }

	// ------------------------------------------------------------------ the keyboard and the mouse (docked under the bars)
	// 0.2.0 (Harry, Oct 18: "people will use 12 sidekey button mice, and they can bind to scroll wheel up and scroll
	// wheel down"; "draw out a mouse too"; "or they might have a mouse with 2 side buttons"): the keyboard with its numpad
	// when the room allows, and the player's own mouse drawn beside it - wheel up / down, middle, and its side buttons.
	var KB_ROWS = [[['`'], ['1'], ['2'], ['3'], ['4'], ['5'], ['6'], ['7'], ['8'], ['9'], ['0'], ['-'], ['='], ['Back', 1.5]],
		[['Tab', 1.5], ['Q'], ['W'], ['E'], ['R'], ['T'], ['Y'], ['U'], ['I'], ['O'], ['P'], ['['], [']'], ['\\']],
		[['Caps', 1.75], ['A'], ['S'], ['D'], ['F'], ['G'], ['H'], ['J'], ['K'], ['L'], [';'], ["'"], ['Enter', 1.75]],
		[['Shift', 2.25], ['Z'], ['X'], ['C'], ['V'], ['B'], ['N'], ['M'], [','], ['.'], ['/'], ['Shift', 2.25]],
		[['Ctrl', 1.5], ['Alt', 1.5], ['Space', 8], ['Alt', 1.5], ['Ctrl', 2]]];
	var KB_MOVE = { W: 1, A: 1, S: 1, D: 1 };
	var KB_MOD = { Caps: 1, Shift: 1, Ctrl: 1, Alt: 1, Back: 1, Enter: 1, Space: 1 };
	// 0.4.4: Tab takes a spell like a letter (Ctrl+Tab, which the browser keeps, set by clicking it with Ctrl)
	var KB_GAME = { Tab: 'TAB' };
	// the numpad: [label, game key (null: not bound), column, row, width, height]
	var NUMPAD = [['Num', null, 1, 1, 1, 1], ['/', 'NUMPADDIVIDE', 2, 1, 1, 1], ['*', 'NUMPADMULTIPLY', 3, 1, 1, 1],
		['-', 'NUMPADMINUS', 4, 1, 1, 1], ['7', 'NUMPAD7', 1, 2, 1, 1], ['8', 'NUMPAD8', 2, 2, 1, 1], ['9', 'NUMPAD9', 3, 2, 1, 1],
		['+', 'NUMPADPLUS', 4, 2, 1, 2], ['4', 'NUMPAD4', 1, 3, 1, 1], ['5', 'NUMPAD5', 2, 3, 1, 1], ['6', 'NUMPAD6', 3, 3, 1, 1],
		['1', 'NUMPAD1', 1, 4, 1, 1], ['2', 'NUMPAD2', 2, 4, 1, 1], ['3', 'NUMPAD3', 3, 4, 1, 1], ['Enter', null, 4, 4, 1, 2],
		['0', 'NUMPAD0', 1, 5, 2, 1], ['.', 'NUMPADDECIMAL', 3, 5, 1, 1]];
	// what a 12-button side grid sends, by the mouse's own software (the editor's setting, not the layout's)
	var SIDE_MAPS = {
		keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
		numpad: ['NUMPAD1', 'NUMPAD2', 'NUMPAD3', 'NUMPAD4', 'NUMPAD5', 'NUMPAD6', 'NUMPAD7', 'NUMPAD8', 'NUMPAD9', 'NUMPAD0',
			'NUMPADMINUS', 'NUMPADPLUS'],
		buttons: ['BUTTON6', 'BUTTON7', 'BUTTON8', 'BUTTON9', 'BUTTON10', 'BUTTON11', 'BUTTON12', 'BUTTON13', 'BUTTON14',
			'BUTTON15', 'BUTTON16', 'BUTTON17'],
	};
	// the quick fills, by the mouse: a 12-button grid's three, a 2-button mouse's own Button 4 and 5; 'own' = taught
	var SIDE_MAP_ORDER = { '12': [['keys', '1&ndash;='], ['numpad', 'Numpad'], ['buttons', 'Buttons']], '2': [['native', '4 and 5']] };
	var SIDE2 = ['BUTTON4', 'BUTTON5'];
	var MOUSE_TYPES = [['none', 'No side buttons'], ['2', '2 side buttons'], ['12', '12 side buttons']];
	var MOUSE_STORE = 'HUIBarEditor.mouse';
	function sideCount(type) { return type === '12' ? 12 : type === '2' ? 2 : 0; }
	function presetSends(type, map) { return type === '12' ? (SIDE_MAPS[map] || SIDE_MAPS.keys).slice() : type === '2' ? SIDE2.slice() : []; }
	function presetFor(type, map) { return type === '12' ? (SIDE_MAPS[map] ? map : 'keys') : 'native'; }
	// 0.4.4: the mouse { type, map, sends }: sends[i] = the chord side button i sends (its software's key, taught or a
	// quick fill), '' = not known
	function cleanMouse(o) {
		var type = o && (o.type === 'none' || o.type === '2' || o.type === '12') ? o.type : '2', n = sideCount(type);
		var map = o && o.map === 'own' ? 'own' : presetFor(type, o && o.map);
		var sends = o && Array.isArray(o.sends) && o.sends.length === n && o.sends.every(function (k) { return typeof k === 'string' && k.length <= 40; })
			? o.sends.slice() : presetSends(type, map);
		if (map === 'own' && !(o && Array.isArray(o.sends) && o.sends.length === n)) map = presetFor(type);
		return { type: type, map: map, sends: sends };
	}
	function mouse() { return st.mouse ? (st.mouse.sends && st.mouse.sends.length === sideCount(st.mouse.type) ? st.mouse : cleanMouse(st.mouse)) : cleanMouse(null); }
	function sideSends() { return mouse().sends; }
	// a side button's own number, as drawn: 1-12 on the grid, 4 and 5 on a 2-button mouse
	function sideNumber(i) { return mouse().type === '2' ? i + 4 : i + 1; }
	function sideHit(k) { return mouse().type === 'none' ? null : Lay.sideOf(sideSends(), k); }
	function modLetters(m) { return (m.alt ? 'A' : '') + (m.ctrl ? 'C' : '') + (m.shift ? 'S' : ''); }
	function modWords(m) { return (m.alt ? 'Alt-' : '') + (m.ctrl ? 'Ctrl-' : '') + (m.shift ? 'Shift-' : ''); }
	// a key as a button shows it: the side button's M3 (consistent with M4 / M5) when the mouse sends it, else as HUI Bars
	// abbreviates it
	function keyWord(k) {
		var h = sideHit(k);
		return h ? modLetters(h.extra) + 'M' + sideNumber(h.i) : Lay.abbreviate(k);
	}
	// its hover text: "Mouse 3 (sends Ctrl-Numpad1)"; '' for a key that is not a side button's
	function keyTip(k) {
		var h = sideHit(k);
		if (!h) return '';
		var n = sideNumber(h.i), native = k === Lay.withMods(h.extra, 'BUTTON' + n) && sideSends()[h.i] === 'BUTTON' + n;
		return modWords(h.extra) + 'Mouse ' + n + (native ? '' : ' (sends ' + Lay.chordWords(k) + ')');
	}
	function loadMouse() {
		try {
			var o = JSON.parse(localStorage.getItem(MOUSE_STORE) || 'null');
			if (o && (o.type === 'none' || o.type === '2' || o.type === '12')) st.mouse = cleanMouse(o);
		} catch (e) { /* asked again */ }
	}
	function saveMouse() {
		if (st.demo) return;
		try { localStorage.setItem(MOUSE_STORE, JSON.stringify(st.mouse)); } catch (e) { /* only for this visit */ }
	}
	function layerMods() {
		return { shift: st.layer === 'Shift', ctrl: st.layer === 'Ctrl', alt: st.layer === 'Alt' };
	}
	// 0.4.5 (Harry, Oct 18: "if someone clicks on a modifier like ctrl there and then they press T, it registers as ctrl +
	// T"): the layer switch is also the capture modifier. One control (st.layer), drawn wherever a key can be taken: the
	// keyboard panel's head; with the panel closed, beside the Key row's box and (in Keybind mode) in the title band.
	function layerSeg(where) { return seg(['None', 'Shift', 'Ctrl', 'Alt'], st.layer, ' data-act="layer" data-where="' + where + '"'); }
	// the purple hint, one line under the switch that matters, only while a key can be taken (Keybind mode, or Press a key)
	var LAYER_HINT = 'Browser shortcut in the way? Pick Ctrl, Shift or Alt here, then press the key.';
	function hintAt() {
		if (!st.kbMode && !st.capture) return null;
		if (st.keys) return 'panel';
		return st.kbMode ? 'band' : 'key';
	}
	function hintHTML(where) { return '<div class="lhint" data-hint="' + where + '">' + LAYER_HINT + '</div>'; }
	// 0.4.4: the layer, and the modifiers held while a drawn key is clicked (Ctrl + click T = Ctrl-T: the way to set the
	// chords the browser keeps for itself). 0.4.5: the same for every key, button and wheel turn taken (Press a key,
	// Keybind mode): the layer's modifier added to the ones held, in the game's ALT-CTRL-SHIFT- order (Lay.chord)
	function clickMods(e) {
		var m = layerMods();
		if (e) { m.alt = m.alt || !!e.altKey; m.ctrl = m.ctrl || !!e.ctrlKey; m.shift = m.shift || !!e.shiftKey; }
		return m;
	}
	// a binding command -> { bar, i }
	function placeOf(cmd) {
		var m;
		if ((m = /^ACTIONBUTTON(\d+)$/.exec(cmd))) return { bar: 1, i: +m[1] };
		if ((m = /^MULTIACTIONBAR(\d)BUTTON(\d+)$/.exec(cmd))) return { bar: +m[1] + 1, i: +m[2] };
		if ((m = /^SHAPESHIFTBUTTON(\d+)$/.exec(cmd))) return { bar: 'stance', i: +m[1] };
		if ((m = /^BONUSACTIONBUTTON(\d+)$/.exec(cmd))) return { bar: 'pet', i: +m[1] };
		return null;
	}
	function placeInfo(p, L) {
		if (!p) return null;
		L = L || cur();
		if (p.bar === 'stance') {
			var s = Sp.stanceBar(D.classes[L.class])[p.i - 1];
			return s ? { icon: s.i, name: s.n, spell: s } : null;
		}
		if (p.bar === 'pet') return null;
		var n = L === cur() ? slotN(p.bar, p.i) : N.placeIn(cur(), L, p.bar, p.i, bar1Page());
		var info = showFor(L, L.specs[0].slots[n]);
		return info.empty ? null : info;
	}
	// 0.5.6: the bar button (bars 1-8) a key is on, or null (none, or a stance / pet button: those take no spells)
	function keyPlace(L, chordKey) {
		var cmd = Lay.commandOfKey(L, chordKey), p = cmd ? placeOf(cmd) : null;
		return p && typeof p.bar === 'number' ? p : null;
	}
	// what a key does in a layout (0.4.0: the other layout's too, for Compare)
	function keyInfo(L, chordKey) {
		var cmd = Lay.commandOfKey(L, chordKey);
		return cmd ? placeInfo(placeOf(cmd), L) : null;
	}
	// one bindable key: its label, the game's key (chorded with the layer), where it sits (style)
	// 0.4.4: a keyboard key whose chord a mouse side button sends shows nothing: that binding is drawn on the mouse
	// (Harry, Oct 18: "if i press one of the 12 mouse buttons it's showing the main numbers"), with the button's word
	// under the key's label
	function keyHTML(label, gameKey, style, extra) {
		var selCmd = selCommand(), selKeys = selCmd ? (cur().specs[0].keys[selCmd] || []) : [];
		var chordKey = Lay.withMods(layerMods(), gameKey), onMouse = /\bmk\b/.test(extra || '');
		var byMouse = !onMouse && sideHit(chordKey);
		var info = byMouse ? null : keyInfo(cur(), chordKey), sel = !byMouse && selKeys.indexOf(chordKey) >= 0, O = cmpLayout(), swap = !!(O && st.cmpSwap), inset = null;
		if (O && !byMouse) {
			var oi = keyInfo(O, chordKey);
			if (swap) { inset = info; info = oi; } else inset = oi;
		}
		var pick = st.kbMode && st.kbPick === chordKey;
		var tip = onMouse ? keyTip(chordKey) : byMouse ? keyTip(chordKey) : '';
		// 0.5.6 (Harry, Oct 18: "the keyboard should kind of fade off keys that aren't bound by the bars"): a key or mouse
		// button no button uses is faded (still a key to pick or to bind a button to)
		var off = !Lay.commandOfKey(swap ? O : cur(), chordKey);
		return '<div class="k' + (info ? ' has' : '') + (sel ? ' sel' : '') + (pick ? ' pick' : '') + (byMouse ? ' bym' : '') + (off ? ' off' : '') + (extra ? ' ' + extra : '') + '" style="' + style + '"'
			+ (swap ? '' : ' data-drop="key"') + ' data-key="' + esc(gameKey) + '" title="' + esc(tip || Lay.chordWords(chordKey)) + '"><span class="kl">' + label + '</span>'
			+ (byMouse ? '<span class="mv">' + esc(keyWord(chordKey)) + '</span>' : '')
			+ (info ? slotHTML(info, { s: 'var(--ki)', noname: 1 }) : '') + (inset ? insetHTML(inset) : '') + '</div>';
	}
	function plainKeyHTML(label, style, cls, under, mkey) {
		return '<div class="k ' + cls + '" style="' + style + '"' + (mkey ? ' data-mkey="' + esc(mkey) + '"' : '') + '><span class="kl">' + esc(label) + '</span>'
			+ (under ? '<span class="mv">' + under + '</span>' : '') + '</div>';
	}
	function keyboardHTML() {
		var h = '<div class="kbd">';
		KB_ROWS.forEach(function (r) {
			h += '<div class="krow">';
			r.forEach(function (x) {
				var k = x[0], w = 'width:calc(var(--ku) * ' + (x[1] || 1) + ' - var(--kg))';
				if (KB_MOD[k]) h += plainKeyHTML(k, w, 'mod', '');
				// 0.4.4: W A S D move with no modifier; on the Shift / Ctrl / Alt layers they take spells like any key (and
				// Ctrl + click W sets Ctrl-W, which the browser keeps)
				else if (KB_MOVE[k]) h += st.layer === 'None' ? plainKeyHTML(k, w, 'move', 'Move', k) : keyHTML(esc(k), k, w);
				else h += keyHTML(esc(k), KB_GAME[k] || k, w);
			});
			h += '</div>';
		});
		h += '</div><div class="npad">';
		NUMPAD.forEach(function (n) {
			var style = 'grid-column:' + n[2] + ' / span ' + n[4] + ';grid-row:' + n[3] + ' / span ' + n[5];
			h += n[1] ? keyHTML(esc(n[0]), n[1], style) : plainKeyHTML(n[0], style, 'mod');
		});
		return h + '</div>';
	}
	// the mouse, drawn (0.2.1, Harry, Oct 18: "this mouse overlaps a lot with the actual design"): the body as tall as
	// the keyboard and wholly inside the panel; down its middle Wheel up, the wheel itself (Middle) and Wheel down, each
	// its own key; the side buttons on a plate BESIDE the body's left flank, never on it (Button 4 and 5, or the 3 x 4
	// grid with each cell a key's icon size). All of it in px from the key unit, so nothing can pile up.
	function mouseGeo(type, ku) {
		var kg = 4, kh = ku * .95, bh = Math.round(5 * kh + 4 * kg), bw = Math.round(2.5 * ku), pp = 4;
		var g = { ku: ku, kg: kg, bh: bh, bw: bw, side: null, cell: Math.round(ku * .62), cg: 3, twelve: type === '12' };
		if (type === '12') g.side = { w: 3 * g.cell + 2 * g.cg + 2 * pp, h: 4 * g.cell + 3 * g.cg + 2 * pp };
		else if (type === '2') g.side = { w: Math.round(ku - kg) + 2 * pp, h: 2 * Math.round(kh) + kg + 2 * pp };
		g.bx = g.side ? g.side.w + Math.round(ku * .22) : 0;
		g.w = g.bx + bw;
		if (g.side) { g.side.x = 0; g.side.y = Math.max(0, Math.round(bh * .58 - g.side.h / 2)); g.side.pp = pp; }
		var kw = Math.round(ku - kg), x = Math.round(g.bx + (bw - kw) / 2);
		g.up = { x: x, y: Math.round(ku * .24), w: kw, h: Math.round(kh) };
		g.mid = { x: x, y: g.up.y + g.up.h + kg + 2, w: kw, h: Math.round(kh * 1.2) };
		g.down = { x: x, y: g.mid.y + g.mid.h + kg + 2, w: kw, h: Math.round(kh) };
		g.split = g.down.y + g.down.h + Math.round(ku * .28);
		return g;
	}
	function mouseWidth(type, ku) { return mouseGeo(type, ku).w; }
	// where each side button sits: [ { x, y, w, h } ] in the drawing's px
	function mouseSideCells(g) {
		var out = [], S = g.side;
		if (!S) return out;
		if (g.twelve) {
			for (var i = 0; i < 12; i++) {
				out.push({ x: S.x + S.pp + (i % 3) * (g.cell + g.cg), y: S.y + S.pp + Math.floor(i / 3) * (g.cell + g.cg), w: g.cell, h: g.cell });
			}
		} else {
			var kw = S.w - 2 * S.pp, kh = Math.round(g.ku * .95);
			out.push({ x: S.x + S.pp, y: S.y + S.pp, w: kw, h: kh });
			out.push({ x: S.x + S.pp, y: S.y + S.pp + kh + g.kg, w: kw, h: kh });
		}
		return out;
	}
	// the drawing: the body's outline, the seam between the two buttons, the buttons' lower edge, the side plate; o.cells
	// draws the side buttons and the wheel too (the chooser's pictures, where nothing is bound)
	function mouseSVG(type, ku, o) {
		o = o || {};
		var g = mouseGeo(type, ku), x0 = g.bx + 1, x1 = g.bx + g.bw - 1, w = x1 - x0, h = g.bh - 2, r = w / 2, cx = x0 + r;
		var f = function (n) { return String(Math.round(n * 10) / 10); };
		var body = 'M' + f(x0) + ',' + f(1 + r * 1.05) + ' C' + f(x0) + ',' + f(1 + r * .2) + ' ' + f(cx - r * .55) + ',1 ' + f(cx) + ',1'
			+ ' C' + f(cx + r * .55) + ',1 ' + f(x1) + ',' + f(1 + r * .2) + ' ' + f(x1) + ',' + f(1 + r * 1.05)
			+ ' L' + f(x1) + ',' + f(1 + h - r * 1.1) + ' C' + f(x1) + ',' + f(1 + h - r * .15) + ' ' + f(cx + r * .5) + ',' + f(1 + h) + ' ' + f(cx) + ',' + f(1 + h)
			+ ' C' + f(cx - r * .5) + ',' + f(1 + h) + ' ' + f(x0) + ',' + f(1 + h - r * .15) + ' ' + f(x0) + ',' + f(1 + h - r * 1.1) + ' Z';
		var s = '<svg class="msvg" viewBox="0 0 ' + g.w + ' ' + g.bh + '" width="' + g.w + '" height="' + g.bh + '" aria-hidden="true">'
			+ '<path d="' + body + '" class="mb"/>'
			+ '<path d="M' + f(cx) + ',1 L' + f(cx) + ',' + f(g.up.y - 2) + ' M' + f(x0) + ',' + f(g.split) + ' C' + f(x0 + w * .3) + ',' + f(g.split + g.ku * .14)
			+ ' ' + f(x1 - w * .3) + ',' + f(g.split + g.ku * .14) + ' ' + f(x1) + ',' + f(g.split) + '" class="ml"/>';
		if (g.side) s += '<rect x="0.5" y="' + (g.side.y + .5) + '" width="' + (g.side.w - 1) + '" height="' + (g.side.h - 1) + '" rx="' + Math.round(g.ku * .18) + '" class="mp"/>';
		if (o.cells) {
			s += '<rect x="' + g.mid.x + '" y="' + g.mid.y + '" width="' + g.mid.w + '" height="' + g.mid.h + '" rx="' + Math.round(g.mid.w * .45) + '" class="mw"/>';
			mouseSideCells(g).forEach(function (c, i) {
				s += '<rect x="' + c.x + '" y="' + c.y + '" width="' + c.w + '" height="' + c.h + '" rx="2" class="ms' + (i === o.lit ? ' lit' : '') + '"/>';
			});
		}
		return s + '</svg>';
	}
	function px(r) { return 'left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.w + 'px;height:' + r.h + 'px'; }
	// the live mouse at key unit ku (sizeToRoom draws it once the room is known)
	function mouseHTML(ku) {
		var M = mouse(), g = mouseGeo(M.type, ku), ki = '--ki:' + Math.round(ku * .62) + 'px;';
		var h = mouseSVG(M.type, ku);
		h += keyHTML('Up', 'MOUSEWHEELUP', ki + px(g.up), 'mk');
		h += keyHTML('Middle', 'BUTTON3', ki + px(g.mid), 'mk wheel');
		h += keyHTML('Down', 'MOUSEWHEELDOWN', ki + px(g.down), 'mk');
		// each side button is the chord it sends (0.4.4: taught in Your mouse, or a quick fill); one not known is drawn,
		// not bindable
		var cells = mouseSideCells(g), sends = sideSends();
		cells.forEach(function (c, i) {
			var two = M.type === '2', st0 = two ? ki + px(c) : '--ki:' + c.w + 'px;' + px(c), cls = two ? 'mk' : 'mk side', n = String(sideNumber(i));
			h += sends[i] ? keyHTML(n, sends[i], st0, cls) : plainKeyHTML(n, st0 + ';position:absolute', 'mod ' + cls);
		});
		return { html: h, w: g.w, h: g.bh };
	}
	function keyboardPaneHTML() {
		// 0.3.2 (Harry, Oct 18: "move none-shift-alt etc over to the keyboard section, not the mouse"): the layer switch
		// right after the Keyboard title (it is the keyboard's, and the mouse's too); Mouse (the chooser) at the right
		return '<div class="pane kpane"><div class="phead"><span class="ktitle" style="font-family:&#39;Arial Narrow&#39;,Arial,sans-serif;font-size:14px;color:var(--warm)">Keyboard</span>'
			+ layerSeg('panel')
			+ '<span style="flex:1"></span><span class="soft wordbtn" data-act="mousepick">Mouse</span>'
			+ '<span class="x" data-act="keyboardoff">&times;</span></div>'
			+ (hintAt() === 'panel' ? hintHTML('panel') : '')
			+ '<div class="kbody" id="kbbody">' + keyboardHTML() + '<div class="mouse" id="mouse"></div></div></div>';
	}
	// the chooser (the first visit, and the "Mouse" word after): three drawn mice, then for 2 or 12 what the side buttons
	// send - a quick fill, or (0.4.4) Set buttons: each drawn side button in turn lit, "Press side button N", and the key
	// its software sends recorded (Back, Skip; Escape stops)
	function teaching() { return !!(st.mouseAsk && typeof st.mouseAsk.teach === 'number'); }
	function mouseAskHTML() {
		var M = st.mouseAsk, t = teaching() ? M.teach : -1, h = '<div class="dim"><div class="ask"><div class="ch"><span>Your mouse</span></div><div class="mice">';
		MOUSE_TYPES.forEach(function (x) {
			h += '<div class="mpick' + (M.type === x[0] ? ' on' : '') + '" data-mouse="' + x[0] + '">' + mouseSVG(x[0], 26, { cells: 1, lit: M.type === x[0] ? t : -1 })
				+ '<span>' + x[1] + '</span></div>';
		});
		h += '</div>';
		if ((M.type === '12' || M.type === '2') && !M.fresh) {
			var order = SIDE_MAP_ORDER[M.type], word = M.map === 'own' ? 'Your own' : order.filter(function (x) { return x[0] === M.map; })[0][1];
			h += row('Side buttons', step(word, ' data-act="sidemap"', order.length < 2 && M.map !== 'own'));
			h += '<div class="sgrid' + (M.type === '2' ? ' two' : '') + (t >= 0 ? ' teach' : '') + '">' + M.sends.map(function (k, i) {
				var n = M.type === '2' ? i + 4 : i + 1;
				return '<span data-side="' + i + '"' + (i === t ? ' class="lit"' : '') + '><b>' + n + '</b>' + (k ? esc(Lay.abbreviate(k)) : '<i>&ndash;</i>') + '</span>';
			}).join('') + '</div>';
			if (t >= 0) {
				var n0 = M.type === '2' ? t + 4 : t + 1, now = M.sends[t];
				h += '<div class="row teachrow" style="border:0;gap:14px"><span class="tq">Press side button ' + n0 + '</span>'
					+ '<span class="soft" style="flex:1">' + (now ? 'Sends ' + esc(Lay.chordWords(now)) : '') + '</span>'
					+ btn('Back', 's' + (t === 0 ? ' grey' : ''), ' data-act="teachback"') + btn('Skip', 's', ' data-act="teachskip"') + '</div>';
			} else {
				h += '<div class="row" style="border:0;justify-content:flex-end;gap:10px">' + btn('Set buttons', 's', ' data-act="teach"')
					+ btn('Done', 'p', ' data-act="mousedone"') + '</div>';
			}
		}
		return h + '</div></div>';
	}
	function teachStart(i) {
		st.mouseAsk.teach = Math.max(0, Math.min(st.mouseAsk.sends.length - 1, i || 0));
		renderAsk();
	}
	function teachStop() { if (st.mouseAsk) delete st.mouseAsk.teach; renderAsk(); }
	function teachMove(d) {
		var M = st.mouseAsk, n = M.teach + d;
		if (n < 0) n = 0;
		if (n >= M.sends.length) return teachStop();
		M.teach = n;
		renderAsk();
	}
	// the key the lit button sent: that button's (it leaves any other side button that had it), then the next
	function teachRecord(k) {
		var M = st.mouseAsk;
		M.sends = M.sends.map(function (x, i) { return i !== M.teach && x === k ? '' : x; });
		M.sends[M.teach] = k;
		M.map = 'own';
		teachMove(1);
	}
	function renderAsk() {
		var old = $('askwrap');
		if (old) old.remove();
		if (!st.mouseAsk) return;
		if (!Array.isArray(st.mouseAsk.sends) || st.mouseAsk.sends.length !== sideCount(st.mouseAsk.type)) {
			var a = askFor(st.mouseAsk);
			st.mouseAsk.map = a.map; st.mouseAsk.sends = a.sends;
		}
		var d = document.createElement('div');
		d.id = 'askwrap';
		d.innerHTML = mouseAskHTML();
		$('stage').appendChild(d);
	}
	function pickMouse(type) {
		var A = st.mouseAsk;
		if (A.type !== type) {
			// another kind of mouse: its own quick fill (what it was set to before, when it is that kind)
			var was = st.mouse && st.mouse.type === type ? mouse() : cleanMouse({ type: type });
			A.type = type; A.map = was.map; A.sends = was.sends.slice();
		}
		delete A.teach;
		delete A.fresh;
		if (type === 'none') return finishMouse();
		renderAsk();
	}
	function askFor(M) { M = cleanMouse(M); return { type: M.type, map: M.map, sends: M.sends.slice() }; }
	function finishMouse() {
		st.mouse = cleanMouse({ type: st.mouseAsk.type, map: st.mouseAsk.map, sends: st.mouseAsk.sends });
		st.mouseAsk = null;
		saveMouse();
		renderAsk();
		renderPage();
		if (st.tourAsk === 'pending') showTourAsk();   // 0.3.0: then, once, "Tutorial?"
	}

	// ------------------------------------------------------------------ the tutorial (0.3.0, js/tour.js)
	// Harry, Oct 18: "create a HUI style purple button in the top and call it 'Tutorial' where if you click on it, it
	// greys out the page and creates some sequential text boxes which point to different parts of the app". On the first
	// ever visit, after the mouse question, a small quiet box asks once: "Tutorial?" Show / Later (kept in localStorage).
	var TOUR_STORE = 'HUIBarEditor.tour';
	var T = null;
	function tourAsked() {
		try { return localStorage.getItem(TOUR_STORE) !== null; } catch (e) { return true; }   // no storage: never nag
	}
	function showTourAsk() {
		closeTourAsk(true);
		st.tourAsk = 'open';
		var d = document.createElement('div');
		d.id = 'tourask';
		d.className = 'tourask';
		d.innerHTML = '<span class="tq">Tutorial?</span>' + btn('Later', 's', ' data-act="tourlater"') + btn('Show', 's p', ' data-act="tourshow"');
		$('stage').appendChild(d);
	}
	function closeTourAsk(quiet) {
		var d = $('tourask');
		if (d) d.remove();
		if (quiet || !st.tourAsk) return;
		st.tourAsk = 'done';
		if (st.demo) return;
		try { localStorage.setItem(TOUR_STORE, 'asked'); } catch (e) { /* asked again next visit */ }
	}

	// ------------------------------------------------------------------ the footer
	function sentHTML() {
		var c = Lay.macroCounts(cur());
		return '<div class="sent"><span>Account <b>' + c.account + ' new</b></span><span>Character <b>' + c.character + ' new</b></span>'
			+ '<span class="dimt">Account ' + c.account + ' / ' + Lay.MAX_ACCOUNT + ' &middot; Character ' + c.character + ' / ' + Lay.MAX_CHARACTER + '</span></div>';
	}

	// ------------------------------------------------------------------ render
	function renderBand() {
		var L = cur();
		$('band').innerHTML = '<img class="owl" src="assets/owl.png" alt=""><span class="hui">HUI</span><span class="bar"></span>'
			+ '<span class="path">Bar Editor &nbsp;&rsaquo;&nbsp; ' + esc(CD().name) + ' &nbsp;&rsaquo;&nbsp; <b>' + esc(L.name) + '</b></span>'
			+ '<span style="flex:1"></span><span class="credit">Made by <b>harryscrib</b></span><span style="width:14px"></span>'
			// 0.4.2: Keyboard stays in the band while the keyboard is open, lit, and closes it (the tutorial's Keyboard step
			// points at it)
			// 0.4.5: in Keybind mode with the keyboard closed, the layer switch (the capture modifier) and the hint under it
			// (Harry, Oct 18: "forcing full screen mode isn't an option"): nothing goes full screen
			+ (st.kbMode && !st.keys ? '<span class="lsw">' + layerSeg('band') + (hintAt() === 'band' ? hintHTML('band') : '') + '</span>' : '')
			+ btn('Keyboard', 'kbt' + (st.keys ? ' on' : ''), ' data-act="keyboard"')
			// 0.4.1 (Harry, Oct 18: "create another button called keybind mode where i can press it and then every key i click
			// on i can just put the input and it changes. rather than constantly having to reclick"): lit while on
			+ btn('Keybind mode', 'kbm' + (st.kbMode ? ' on' : ''), ' data-act="kbmode"') + btn('Tutorial', 'tut', ' data-act="tour"')
			+ '<span class="x" data-act="close">&times;</span>';
	}
	function renderRail() {
		var rail = $('rail');
		rail.classList.toggle('slim', st.keys);
		if (st.keys) {
			rail.innerHTML = '<div class="rh" style="padding-left:6px">&nbsp;</div>' + Lay.CLASSES.map(function (c) {
				return '<div class="ri' + (c === st.cls ? ' on' : '') + '" data-cls="' + c + '" title="' + D.classes[c].name + '">' + img(D.classes[c].icon) + '</div>';
			}).join('');
			return;
		}
		var L = cur(), r = '<div class="rh">Classes</div>';
		Lay.CLASSES.forEach(function (c) {
			r += '<div class="ri' + (c === st.cls ? ' on' : '') + '" data-cls="' + c + '">' + img(D.classes[c].icon) + esc(D.classes[c].name) + '</div>';
			if (c !== st.cls) return;
			r += '<div class="spine">' + classLayouts(c).map(function (l) {
				if (st.renaming === l._id) return '<div class="node on"><input id="rename" value="' + esc(l.name) + '" maxlength="40"></div>';
				return '<div class="node' + (l === L ? ' on' : '') + '" data-layout="' + l._id + '">' + esc(l.name)
					+ (l.firstLogin ? '<span class="soft">First login</span>' : '') + '</div>';
			}).join('') + '<div class="node new" data-act="newlayout">New layout</div></div>';
		});
		r += '<div style="position:absolute;left:10px;right:10px;bottom:16px"><div class="rh">New slots</div><div style="padding:0 10px">'
			+ tick(L.autoRankDefault, 'Auto rank', ' data-act="autodefault"') + '</div></div>';
		rail.innerHTML = r;
		var input = $('rename');
		if (input) { input.focus(); input.select(); }
	}
	function renderPage() {
		var L = cur(), page = $('page'), keysMode = st.keys;
		if (!st.maker) st.maker = freshMaker('heal');
		page.classList.toggle('wide', keysMode);
		page.classList.toggle('kbmode', !!st.kbMode);
		var title = st.renaming === 'title' ? '<input id="retitle" value="' + esc(L.name) + '" maxlength="40">' : esc(L.name);
		var p = '<div class="ph"><div><div class="kick">' + headLineHTML() + '</div><div class="title" data-act="retitle">' + title + '</div></div>'
			+ '</div>';
		// 0.2.1: with the keyboard open it is docked at the column's foot and the bars scroll above it, so the bars can
		// take the column's width and the keyboard stays in sight
		var bars = st.view === 'screen' ? screenHTML() : barsHTML({});
		p += '<div class="cols" id="cols"><div class="col spells">' + spellsColHTML() + '</div>';
		p += '<div class="col main' + (keysMode ? ' docked' : '') + '" id="maincol">' + head('Bars', compareHTML() + moveHTML() + step(st.view === 'screen' ? 'Screen' : 'Slots', ' data-act="view"'))
			+ (keysMode ? '<div class="barscroll" id="barscroll">' + bars + '</div>' + keyboardPaneHTML() : bars) + '</div>';
		p += '<div class="col right" id="rcol">' + (st.view === 'screen' ? barPanelHTML() : slotPanelHTML())
			+ '<div style="height:12px"></div>' + makerHTML(66) + '<div style="height:10px"></div>' + madeHTML('calc(34px * var(--ts, 1))')
			+ settingsHTML() + sendHTML() + '</div></div>';
		p += footHTML();
		var keepScroll = $('splist') ? $('splist').scrollTop : 0, rc = $('rcol'), keepR = rc ? rc.scrollTop : 0;
		var mc = $('maincol'), keepM = mc ? mc.scrollTop : 0, bs = $('barscroll'), keepB = bs ? bs.scrollTop : 0;
		// 0.5.4: another view (Slots / Screen) starts at its top
		if (st.view !== st.shownView) { keepM = 0; keepB = 0; st.shownView = st.view; }
		page.innerHTML = p;
		if ($('splist')) $('splist').scrollTop = keepScroll;
		if ($('rcol')) $('rcol').scrollTop = keepR;
		if ($('maincol')) $('maincol').scrollTop = keepM;
		if ($('barscroll')) $('barscroll').scrollTop = keepB;
		var t = $('retitle');
		if (t) { t.focus(); t.select(); }
		var dl = $('spellnames');
		dl.innerHTML = offeredList().filter(function (s) { return !s.item && !s.util; }).map(function (s) { return '<option value="' + esc(s.n) + '">'; }).join('');
		paintMaker();
		sizeToRoom();
	}

	// ------------------------------------------------------------------ sizes from the room (0.2.0: the page fills the window)
	// --bs: the bar buttons, as wide as the Bars column lets twelve of them be, from 40 up to a cap that rises from 64 at
	// 1920 to 72 at 2560 (0.2.1, Harry, Oct 18: the rows stopped at half the column); without the keyboard also as tall
	// as lets all ten rows be seen. --ts: the small text grows gently with them (to 1.15 at 72), --bl the row word's
	// width with it. When the buttons reach the cap the Bars column keeps to the rows' width and the spells list and
	// the right panel take the rest, so no strip is left beside the rows.
	// --ku: the keyboard's key unit, the keys, the numpad and the mouse filling the column; the numpad dropped first
	// when they do not all fit at 42 or more.
	var KEY_MIN_PAD = 42;
	function sizeToRoom() {
		var page = $('page'), main = $('maincol'), cols = $('cols');
		if (!page || !main || !cols) return;
		cols.classList.remove('fit');
		main.style.flexBasis = '';
		// RING: room at the right for the 12th button's outline (Harry, Oct 19: the box cut off on #12)
		var RING = 3, A = main.clientWidth - RING, H = main.clientHeight, slotsView = st.view !== 'screen';
		var cap = Math.round(Math.max(64, Math.min(72, 64 + (innerWidth - 1920) / 80)));
		var g = 4, s = cap, ts = 1, lw = 58;
		for (var n = 0; n < 3; n++) {
			ts = 1 + Math.max(0, Math.min(1, (s - 48) / 24)) * .15;
			lw = Math.round(58 * ts);
			s = Math.min(cap, Math.floor((A - lw - 11 * g) / 12));
			if (!st.keys && slotsView) s = Math.min(s, Math.floor((H - 44 - (tabs().length ? 44 : 0) - 16) / 10) - 8);
			s = Math.max(40, s);
		}
		ts = 1 + Math.max(0, Math.min(1, (s - 48) / 24)) * .15;
		page.style.setProperty('--bs', s + 'px');
		page.style.setProperty('--ts', ts.toFixed(3));
		page.style.setProperty('--bl', lw + 'px');
		page.style.setProperty('--bg', g + 'px');
		var barsW = lw + 12 * s + 11 * g;
		if (slotsView && A - barsW > 6) {
			cols.classList.add('fit');
			main.style.flexBasis = (barsW + RING) + 'px';
		}
		var kb = $('kbbody');
		if (kb) {
			var avail = kb.clientWidth - 28, type = mouse().type, kg = 4;
			var need = function (u, pad) { return 14.5 * u - kg + (pad ? 14 + 6 + 4 * u - kg : 0) + 14 + mouseWidth(type, u); };
			var kuMax = Math.max(30, Math.min(60, Math.floor((H * .42 - 74) / 4.75)));
			var fit = function (pad) { for (var u = kuMax; u > 30; u--) if (need(u, pad) <= avail) return u; return 30; };
			var kuPad = fit(true), pad = kuPad >= KEY_MIN_PAD && need(kuPad, true) <= avail;
			var ku = pad ? kuPad : fit(false);
			kb.classList.toggle('nopad', !pad);
			page.style.setProperty('--ku', ku + 'px');
			var m = $('mouse'), mh = mouseHTML(ku);
			m.style.width = mh.w + 'px';
			m.style.height = mh.h + 'px';
			m.innerHTML = mh.html;
		}
		fitScreen();
	}
	// 0.5.4 (Harry, Oct 18: "when i switch from slots to screen, it should show the render of the bars immediately ... it
	// shows the top of the monitor and you have to scroll down"): the whole 16:9 screen and the picked bar's row under it
	// fit the room they have (the column, or the bars' strip above the keyboard), so nothing needs scrolling; it keeps the
	// column's width when that fits, else it narrows (centred) until its height does
	function fitScreen() {
		var scr = $('screen'), main = $('maincol');
		if (!scr || !main) return;
		scr.style.width = '';
		var box = $('barscroll') || main, head = box === main ? main.querySelector('.ch') : null;
		var row = $('screenrow'), below = 10 + (row ? row.offsetHeight : 0);
		var room = box.clientHeight - (box === main ? head.offsetHeight + 6 : 14) - below - 2;
		var w = Math.floor(Math.min(scr.parentNode.clientWidth, room * 16 / 9));
		if (w < scr.parentNode.clientWidth) scr.style.width = Math.max(240, w) + 'px';
		// still taller than the room (a very small window): the bars, at the screen's foot, scrolled into sight
		var r = scr.getBoundingClientRect(), b = box.getBoundingClientRect();
		if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 4;
	}

	// ------------------------------------------------------------------ the Screen view (0.2.0; js/bars.js = HUI Bars' own maths)
	// Harry, Oct 18: "allow for templating - so for example, let people choose the row sizes of the action bars and where
	// they're placed etc". A 16:9 screen of 1920 x 1080 UI units, every bar that is on drawn where HUI Bars puts it, in
	// the slot rows' button look; a bar dragged moves its group (Unlock.lua), a click picks it, a double-click separates it
	// (0.4.3: so do Shift+drag, which then moves it alone, and the Joined tick; a faint link marks each join).
	var VIS_WORDS = [['always', 'Always'], ['combat', 'Combat'], ['mouseover', 'Mouseover'], ['hidden', 'Hidden']];
	function barsModel() {
		var L = cur();
		if (!L.bars) {
			L.bars = L.barsIn ? HB.fromLua(L.barsIn) : HB.defaults();
			HB.layout(L.bars);
			if (!L.barsIn) L.barsChanged = true;   // opened on a layout with none: from now on it writes its bars
		}
		return L.bars;
	}
	function barsChanged() { cur().barsChanged = true; }
	function pc(v, of) { return (v / of * 100).toFixed(4) + '%'; }
	function screenBarsHTML(B) {
		var W = HB.SCREEN.w, H = HB.SCREEN.h, lay = HB.layout(B), h = '';
		for (var n = 1; n <= HB.NUM_BARS; n++) {
			var L = B.bar[n];
			if (!L.enabled) continue;
			var r = lay.rects[n], g = HB.geometry(L), sc = g.scale;
			var alpha = L.vis === 'hidden' ? 0.3 : (L.vis === 'always' ? 1 : Math.max(0.35, L.fade / 100));
			h += '<div class="sbar' + (st.selBar === n ? ' sel' : '') + '" data-sbar="' + n + '" style="left:' + pc(r[0], W) + ';bottom:' + pc(r[1], H)
				+ ';width:' + pc(r[2], W) + ';height:' + pc(r[3], H) + ';opacity:' + alpha + '"><span class="bn">' + n + '</span>';
			for (var i = 1; i <= 12; i++) {
				var cell = HB.buttonCell(L, i), col = cell.col, rw = cell.row;   // (HUI Bars 0.16.4: Grow Up, row 1 at the bottom)
				var e = slots()[slotN(n, i)], info = show(e);
				h += '<div class="sbtn' + (info.empty && !B.showEmpty ? ' hid' : '') + '" style="left:' + pc(col * (g.size + g.across) * sc, r[2])
					+ ';top:' + pc(rw * (g.size + g.down) * sc, r[3]) + '">'
					+ slotHTML(info, { s: 'calc(' + (g.size * sc / 19.2).toFixed(4) + 'cqw)', key: keyText(Lay.command(n, i)), noname: 1 }) + '</div>';
			}
			h += '</div>';
		}
		return h + linksHTML(B, lay.rects);
	}
	// 0.4.3: a faint link across the gap of each join, so it shows which bars move together. 0.5.2 (Harry, Oct 18: "i just
	// want to be able to double click, or have an unlink icon if i hover near the purple connector to detach"): round each
	// link a small hover spot; hovered, a broken-link mark shows on it, and a click there detaches that join
	var UNLINK_SVG = '<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true"><circle cx="11" cy="11" r="10.25" class="ud"/>'
		+ '<g transform="rotate(-45 11 11)"><rect x="2.2" y="8.7" width="7.8" height="4.6" rx="2.3" class="ul"/><rect x="12" y="8.7" width="7.8" height="4.6" rx="2.3" class="ul"/>'
		+ '<path d="M9.6 5.4l.7 1.6M12.4 5.4l-.7 1.6M9.6 16.6l.7-1.6M12.4 16.6l-.7-1.6" class="ut"/></g></svg>';
	function linksHTML(B, rs) {
		var W = HB.SCREEN.w, H = HB.SCREEN.h, h = '';
		for (var n = 1; n <= HB.NUM_BARS; n++) {
			var L = B.bar[n], p = L.joinTo;
			if (!p || !L.enabled || !B.bar[p] || !B.bar[p].enabled || !rs[n] || !rs[p]) continue;
			var c = rs[n], r = rs[p], s = L.joinSide, mx, my;
			if (s === 'above' || s === 'below') {
				var x = (Math.max(c[0], r[0]) + Math.min(c[0] + c[2], r[0] + r[2])) / 2;
				var y0 = s === 'above' ? r[1] + r[3] : c[1] + c[3], y1 = s === 'above' ? c[1] : r[1];
				h += '<i class="slink v" data-link="' + n + '" style="left:' + pc(x, W) + ';bottom:' + pc(y0 - 6, H) + ';height:' + pc(y1 - y0 + 12, H) + '"></i>';
				mx = x; my = (y0 + y1) / 2;
			} else {
				var y = (Math.max(c[1], r[1]) + Math.min(c[1] + c[3], r[1] + r[3])) / 2;
				var x0 = s === 'right' ? r[0] + r[2] : c[0] + c[2], x1 = s === 'right' ? c[0] : r[0];
				h += '<i class="slink h" data-link="' + n + '" style="bottom:' + pc(y, H) + ';left:' + pc(x0 - 6, W) + ';width:' + pc(x1 - x0 + 12, W) + '"></i>';
				mx = (x0 + x1) / 2; my = y;
			}
			h += '<span class="sunlink' + (st.unlinkHov === n ? ' hov' : '') + '" data-unlink="' + n + '" style="left:' + pc(mx, W) + ';bottom:' + pc(my, H) + '">' + UNLINK_SVG + '</span>';
		}
		return h;
	}
	// a click on a join's unlink mark: that bar leaves the bar it is joined to (as the double-click and the Joined tick)
	function unlinkBar(n) {
		if (st.kbMode) return;
		var B = barsModel();
		if (!B.bar[n] || !B.bar[n].joinTo) return;
		if (HB.detach(B, n)) { barsChanged(); st.selBar = n; changed(); }
	}
	function screenHTML() {
		var B = barsModel(), C = HB.CHAT;
		if (!B.bar[st.selBar] || !st.selBar) st.selBar = 1;
		return '<div class="screen" id="screen"><div class="chat" style="width:' + pc(C.w, HB.SCREEN.w) + ';height:' + pc(C.h, HB.SCREEN.h)
			+ '"><span>Chat</span></div><div id="sbars">' + screenBarsHTML(B) + '</div></div>'
			+ '<div style="height:10px"></div><div id="screenrow">' + barsHTML({ only: st.selBar }) + '</div>';
	}
	function paintScreen(B) { var el = $('sbars'); if (el) el.innerHTML = screenBarsHTML(B || barsModel()); }
	// the right panel for a bar: the template (HUI Bars' Template, Bar count, Button size, Spacing, Show empty slots), then
	// the picked bar (Show this bar, Shape, Button size, Across, Down, Scale, Show, Faded alpha) - in one or two words
	function barPanelHTML() {
		var B = barsModel(), n = st.selBar || 1, L = B.bar[n];
		var tname = B.moved ? 'Custom' : HB.TEMPLATE_NAMES[B.template];
		var h = '<div id="barpanel">' + head('Template') + row('Template', step(esc(tname), ' data-act="btemplate"'))
			+ row('Count', step(String(B.count), ' data-act="bcount"')) + row('Size', step(String(B.size), ' data-act="bsize"'))
			+ row('Gap', step(String(B.gap), ' data-act="bgap"')) + row('Empty', tick(B.showEmpty, '', ' data-act="bempty"'));
		h += '<div style="height:12px"></div>' + head('Bar', step(String(n), ' data-act="bsel"'));
		h += row('Shown', tick(L.enabled, '', ' data-act="benabled"'));
		// 0.4.3 (Harry, Oct 18: "let me detach the bars in the screen version"): Joined, when this bar is in a group or can
		// go back to the bar it left; unticked = the double-click's separate, ticked = joined there again
		var jd = HB.isJoined(B, n);
		if (L.enabled && (jd || HB.canRejoin(B, n))) h += row('Joined', tick(jd, '', ' data-act="bjoined"'), ' id="joinedrow"');
		h += row('Per row', step(String(L.cols), ' data-act="bcols"', !L.enabled));
		h += row('Size', step(String(Math.round(L.size * 10) / 10), ' data-act="bbsize"', !L.enabled));
		h += row('Across', step(String(Math.round(L.across * 10) / 10), ' data-act="bacross"', !L.enabled));
		h += row('Down', step(String(Math.round(L.down * 10) / 10), ' data-act="bdown"', !L.enabled));
		h += row('Grow', step(L.grow === 'up' ? 'Up' : 'Down', ' data-act="bgrow"', !L.enabled));   // HUI Bars 0.16.4
		h += row('Scale', step(L.scale + '%', ' data-act="bscale"', !L.enabled));
		h += row('Show', step(VIS_WORDS.filter(function (v) { return v[0] === L.vis; })[0][1], ' data-act="bvis"', !L.enabled));
		h += row('Fade', step(L.fade + '%', ' data-act="bfade"', !L.enabled));
		return h + '</div>';
	}
	var BAR_STEPS = { bbsize: ['size', 1], bacross: ['across', 1], bdown: ['down', 1], bscale: ['scale', 5], bfade: ['fade', 5] };
	// a stepper of the Screen view's panel; true when it was one
	function onBarStep(act, d) {
		var B = barsModel(), n = st.selBar || 1, L = B.bar[n], v;
		if (act === 'bsel') { st.selBar = ((n - 1 + d + 8) % 8) + 1; renderPage(); return true; }
		if (act === 'btemplate') {
			var o = HB.TEMPLATE_ORDER, i = o.indexOf(B.template);
			delete B.unjoined;   // a template joins its own bars: nothing left to go back to
			HB.setTemplate(B, o[(i + d + o.length) % o.length]);
		} else if (act === 'bcount') {
			// 0.5.3: a list of choices goes round both ways (Harry, Oct 18: "i can't cyclically rotate from 12 to the left, i
			// can only go to the right"): Count 1 | 2 | 3 | 4, Per row 12 | 6 | 4 | 3 | 2 | 1; a measure (Size, Gap, Across,
			// Down, Scale, Fade) holds at its ends
			var lim = HB.PARAM_LIMITS.count, span = lim[1] - lim[0] + 1;
			HB.setParam(B, 'count', lim[0] + ((B.count - lim[0] + d) % span + span) % span);
		} else if (act === 'bsize' || act === 'bgap') {
			var f = act.slice(1);
			HB.setParam(B, f, B[f] + d);
		} else if (act === 'bcols') {
			var c = HB.CHOICES.cols, k = Math.max(0, c.indexOf(L.cols));
			HB.setBar(B, n, 'cols', c[(k + d + c.length) % c.length]);   // 12 | 6 | 4 | 3 | 2 | 1, round both ways
		} else if (act === 'bgrow') {
			var gs = HB.CHOICES.grow, gi = Math.max(0, gs.indexOf(L.grow));
			HB.setBar(B, n, 'grow', gs[(gi + d + gs.length) % gs.length]);   // Down | Up, round both ways
		} else if (act === 'bvis') {
			var vs = HB.CHOICES.vis, j = vs.indexOf(L.vis);
			HB.setBar(B, n, 'vis', vs[(j + d + vs.length) % vs.length]);
		} else if (BAR_STEPS[act]) {
			var fs = BAR_STEPS[act], cur0 = L[fs[0]], stp = fs[1];
			v = d > 0 ? Math.floor(cur0 / stp + 1e-9) * stp + stp : Math.ceil(cur0 / stp - 1e-9) * stp - stp;
			HB.setBar(B, n, fs[0], v);
		} else return false;
		barsChanged();
		changed();
		return true;
	}
	function onBarAct(act) {
		var B = barsModel(), n = st.selBar || 1;
		if (act === 'benabled') HB.setBar(B, n, 'enabled', !B.bar[n].enabled);
		else if (act === 'bjoined') { if (!(HB.isJoined(B, n) ? HB.detach(B, n) : HB.rejoinBar(B, n))) return true; }
		else if (act === 'bempty') B.showEmpty = !B.showEmpty;
		else return false;
		barsChanged();
		changed();
		return true;
	}
	// the screen's own pointer: a press on a bar, a drag of its group, a click to pick it
	var sdrag = null;
	function screenPoint(e) {
		var r = $('screen').getBoundingClientRect(), k = r.width / HB.SCREEN.w;
		return [(e.clientX - r.left) / k, (r.bottom - e.clientY) / k];
	}
	function screenDown(e) {
		var el = e.target.closest('[data-sbar]');
		if (!el || e.button !== 0) return false;
		sdrag = { n: +el.getAttribute('data-sbar'), at: screenPoint(e), x: e.clientX, y: e.clientY, D: null };
		e.preventDefault();
		return true;
	}
	function screenMove(e) {
		if (!sdrag) return false;
		var B = barsModel();
		if (!sdrag.D) {
			if (st.kbMode) return true;   // 0.4.1: no drags in Keybind mode (a click still picks the bar)
			if (Math.abs(e.clientX - sdrag.x) + Math.abs(e.clientY - sdrag.y) < 4) return true;
			// 0.4.3: Shift+drag takes this bar out of its group first and moves it alone (a plain drag moves the group)
			if (e.shiftKey && HB.isJoined(B, sdrag.n) && HB.detach(B, sdrag.n)) barsChanged();
			sdrag.D = HB.startDrag(B, sdrag.n, sdrag.at);
			st.selBar = sdrag.n;
		}
		var p = HB.dragTo(B, sdrag.D, screenPoint(e), e.shiftKey);
		// drawn where it would land: a copy with the root there (the bars themselves change on the drop)
		var C = JSON.parse(JSON.stringify(B)), R = C.bar[sdrag.D.root];
		R.anchor = 'BOTTOM'; R.x = p[0]; R.y = p[1];
		C.moved = true;
		paintScreen(C);
		return true;
	}
	// 0.5.2: the double-click is the screen's own - a second press let go on the same bar within 450 ms, no drag between.
	// The browser's dblclick missed it: each press re-draws the page (the bar picked), so the bar under the pointer was a
	// new element by the second click, and the browser's dblclick went to the removed one, never reaching the page.
	var lastTap = null;
	function screenUp(e) {
		if (!sdrag) return false;
		var d = sdrag, B = barsModel(), now = Date.now();
		sdrag = null;
		if (d.D) {
			if (HB.stopDrag(B, d.D)) barsChanged();
			lastTap = null;
		} else if (lastTap && lastTap.n === d.n && now - lastTap.t < 450 && Math.abs(e.clientX - lastTap.x) + Math.abs(e.clientY - lastTap.y) < 10) {
			lastTap = null;
			if (!st.kbMode && HB.detach(B, d.n)) barsChanged();
		} else lastTap = { n: d.n, t: now, x: e.clientX, y: e.clientY };
		st.selBar = d.n;
		justDragged = !!d.D;
		setTimeout(function () { justDragged = false; }, 0);
		changed();
		return true;
	}
	function screenDouble(e) {
		var el = e.target.closest('[data-sbar]');
		if (!el) return false;
		if (st.kbMode) return true;
		var B = barsModel(), n = +el.getAttribute('data-sbar');
		if (HB.detach(B, n)) { barsChanged(); changed(); }
		return true;
	}

	// ------------------------------------------------------------------ the three saves (LAYOUT-FORMAT "The three ways to save")
	// Harry, Oct 18: "one save should be to have a local template that this app can load up for replication and saves
	// locally, and then the other save should be to 'pick a character that we have in our wow folder -> ie locate it'.
	// the other should be import/export strings". 0.6.4 (Oct 19: "do we need to 'Send' in that case. surely we just save
	// it as a 'human priest' layout, and the addon should recognise that and load it itself"): Save writes this preset
	// into HUIPresets' Presets.lua in the WoW folder (merged by class and name), or - with no folder picker in this
	// browser - downloads Presets.lua; File / Open: the editor's own file (<name>.hui-layouts.lua). No Send, no character.
	function canLocate() { return typeof window.showDirectoryPicker === 'function'; }
	function footHTML() {
		return '<div class="foot"><span class="ver">' + VERSION + '</span><span style="flex:1"></span>' + sentHTML() + '<span style="width:20px"></span>'
			+ '<div style="text-align:right">'
			// 0.6.11 (Harry, Oct 20: "'Keys from file' is very ambiguous. have 'Import Mappings From Saved Lua File' in a space
			// where it makes sense (maybe under or over these buttons). it needs to be obvious"): its own line over the saves
			+ '<div class="kfline">' + btn('Import Mappings From Saved Lua File', '', ' data-act="keysfile"') + '</div>'
			+ '<div class="saves">'
			+ (st.saveMsg ? '<span class="' + (st.savePink ? 'pinkt' : 'soft') + '">' + esc(st.saveMsg) + '</span>'
				: !presetFile() ? '<span class="soft">Pick a race</span>' : '')
			+ btn('Download', 'p' + (presetFile() ? '' : ' grey'), ' data-act="savepre"') + btn('Save', '', ' data-act="savetpl"') + btn('Backup', '', ' data-act="backup"')
			+ btn('Open', '', ' data-act="opentpl"')
			// 0.6.15 (Harry, Oct 25: the editor on GitHub Pages for his guild, "i'd then want to give them HUIPresets
			// (standalone) addon so that they can have it ready to go for launch") the addon itself, beside where it goes: the
			// published site carries HUIPresets.zip (dev/tools/publish_site.py)
			+ '</div><div class="phint"><a class="getaddon" href="HUIPresets.zip" download>HUIPresets.zip</a>' + esc(PATH) + '</div></div></div>';
	}
	// 0.6.6 (Harry, Oct 19: "the solution is to just make Human Priest.lua, Dwarf Rogue.lua"): the file Download gives -
	// this layout's race (the race picker) and class, "HumanPriest.lua" (js/serialise.js presetFileName) - or null when
	// no race is picked (Download greyed, "Pick a race")
	function presetFile() {
		var L = cur(), R = L.race && D.races && D.races[L.race], C = D.classes[L.class];
		return R && C ? S.presetFileName(R.name, C.name) : null;
	}
	function download(name, text) {
		var blob = new Blob([text], { type: 'text/plain' });
		var a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = name;
		document.body.appendChild(a);
		a.click();
		setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
	}
	function fileName() { return (cur().name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'HUI') + '.txt'; }
	// (Harry, Oct 19: "we could also change 'Save' to just save the string in a notepad" / "so we have the download option
	// and the save option") Save keeps THIS layout's export string in a .txt of its own - a backup Open reads back, or to
	// paste into /presets; Download is the addon's Presets.lua
	async function saveTemplate() {
		var L0 = cur();
		nameTooltips(L0);   // 0.6.8
		var text = (await S.encode(Lay.toLua(L0))) + '\n';
		L0.saved = true;
		changed();
		st.lastSave = { name: fileName(), text: text };
		if (typeof window.showSaveFilePicker === 'function' && !st.demo) {
			try {
				// id: the browser opens where the last save went (Harry, Oct 19: "go back to the last folder i was in")
				var h = await window.showSaveFilePicker({ id: 'hui-save', suggestedName: fileName(), types: [{ description: 'HUI layouts', accept: { 'text/plain': ['.txt'] } }] });
				var w = await h.createWritable();
				await w.write(text);
				await w.close();
				return;
			} catch (e) { if (e && e.name === 'AbortError') return; }
		}
		if (!st.demo) download(fileName(), text);
	}
	// the WoW folder: asked once (kept in this browser's IndexedDB), checked again on each Save
	function idb(mode, value) {
		return new Promise(function (ok) {
			if (st.demo || typeof indexedDB === 'undefined') return ok(null);
			try {
				var req = indexedDB.open('HUIBarEditor', 1);
				req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
				req.onerror = function () { ok(null); };
				req.onsuccess = function () {
					try {
						var tx = req.result.transaction('kv', mode === 'put' ? 'readwrite' : 'readonly'), s = tx.objectStore('kv');
						var r = mode === 'put' ? s.put(value, 'wow') : s.get('wow');
						r.onsuccess = function () { ok(mode === 'put' ? true : r.result || null); };
						r.onerror = function () { ok(null); };
					} catch (e) { ok(null); }
				};
			} catch (e) { ok(null); }
		});
	}
	async function allowed(h) {
		if (!h || typeof h.queryPermission !== 'function') return !!h;
		try {
			if (await h.queryPermission({ mode: 'readwrite' }) === 'granted') return true;
			return await h.requestPermission({ mode: 'readwrite' }) === 'granted';
		} catch (e) { return false; }
	}
	async function locate(again) {
		var h = again ? null : st.wow || await idb('get');
		if (h && !(await allowed(h))) h = null;
		if (!h) {
			try { h = await window.showDirectoryPicker({ id: 'hui-wow', mode: 'readwrite' }); } catch (e) { return null; }
			idb('put', h);
		}
		var f = await W.flavourOf(h);
		if (!f) { saySave('Not the WoW folder', true); return null; }
		st.wow = h;
		return f;
	}
	// the line left of Save: soft, or pink when nothing was written
	function saySave(msg, pink) {
		st.saveMsg = msg;
		st.savePink = !!pink;
		renderPage();
	}
	// every saved preset this browser holds of one race and class, one per name (the downloaded race and class file)
	function savedPresets(race, cls) {
		return st.layouts.filter(function (l) { return l.saved && l.race === race && l.class === cls; })
			.map(function (l) { nameTooltips(l); return Lay.toLua(l); }).reduce(S.mergePresets, []);   // 0.6.8: named
	}
	// 0.6.4: Save - this layout a saved preset, written into <WoW>\_classic_beta_\Interface\AddOns\HUIPresets\Presets.lua:
	// the file read first and the preset of the same class and name replaced, every other one kept. A Presets.lua the
	// editor cannot read is left as it is (pink); HUIPresets not installed: nothing written (its .toc and code ship with
	// HUI, the editor never makes the folder). With no folder picker (Firefox): Presets.lua downloaded with every saved
	// preset, and the hint says where it goes.
	// (Harry, Oct 19: "i think the best thing to do is just have a download button and then tell people to move it into
	// the correct folder" - Chrome refuses Program Files, and the file is everyone's backup for launch day) Save marks this
	// layout a saved preset and downloads Presets.lua with EVERY saved preset; Open reads it back.
	// 0.6.6 (Harry, Oct 19: "let's say that i open the website and make a template for dwarf priest then download
	// presets.lua and overwrite. then 2 weeks later i've lost the data and make a new one for undead rogue, download. when
	// i overwrite, i'll lose dwarf priest" - and then: "the solution is to just make Human Priest.lua, Dwarf Rogue.lua"):
	// Download gives ONE file, this layout's race and class (HumanPriest.lua), holding every saved preset of that race and
	// class (a healer and a shadow Human priest share it); every other character's file is never touched. No race picked:
	// greyed, nothing downloaded.
	async function savePresets() {
		var L0 = cur(), name = presetFile();
		if (!name) return;
		L0.saved = true;
		st.saveMsg = '';
		changed();
		var all = S.presetsFile(savedPresets(L0.race, L0.class), D.races[L0.race].name, D.classes[L0.class].name);
		st.lastPresets = { name: name, text: all };
		if (!st.demo) download(name, all);
		return saySave('Downloaded ' + name);
	}


	// the line over the layout's name: its class (and, 0.2.0, the race icons)
	function headLineHTML() {
		var L = cur();
		return '<span class="kickrow">' + esc(CD().name.toUpperCase()) + '<span class="races">' + racesFor(st.cls).map(function (k) {
			var R = D.races[k];
			return '<span class="race' + (L.race === k ? ' on' : '') + '" data-race="' + esc(k) + '" title="' + esc(R.name) + '">' + img(R.icon) + '</span>';
		}).join('') + '</span></span>';
	}
	function render() {
		cur();
		renderBand();
		renderRail();
		renderPage();
		renderAsk();
		save();
		refreshExport();
	}
	function renderSpellList() {
		var l = $('splist');
		if (l) l.innerHTML = spellListHTML();
	}

	var exportSeq = 0;
	function refreshExport() {
		var n = ++exportSeq, L = cur();
		nameTooltips(L);   // 0.6.8
		var value;
		try { value = Lay.toLua(L); } catch (e) { return; }
		S.encode(value).then(function (s) {
			if (n !== exportSeq) return;
			st.exportStr = s;
			var el = $('exp');
			if (el) el.textContent = s;
		}, function () {
			// no CompressionStream here: the plain form, which the game reads too
			st.exportStr = S.encodePlain(value);
			var el = $('exp');
			if (el) el.textContent = st.exportStr;
		});
	}

	// ------------------------------------------------------------------ actions
	function changed() { render(); }

	function entryFrom(p) {
		var L = cur();
		if (p.kind === 'spell') {
			var s = spellOf(p.id);
			if (!s) return null;
			// 0.3.1: a rank chosen in the list places that rank, held (auto = false); Highest the layout's Auto rank
			var fixed = !s.general && p.rank ? Sp.rankNumbered(s, p.rank) : null;
			if (fixed) return { t: 'spell', id: fixed[0], name: s.n, rank: fixed[1], auto: false };
			// 0.6.4: a profession - its top rank, by name in game (Auto rank: the highest the character knows)
			if (s.prof) return { t: 'spell', id: s.r[s.r.length - 1][0], name: s.n, rank: 0, auto: true };
			var h = s.general ? s.r[0] : (Sp.highest(s) || s.r[0]);
			var e = { t: 'spell', id: h[0], name: s.n, rank: h[1] || 0, auto: !!L.autoRankDefault };
			return e;
		}
		if (p.kind === 'item') return { t: 'item', id: p.id };
		if (p.kind === 'macro') return { t: 'macro', key: p.key };
		if (p.kind === 'util') {
			var u = utilEntries()[p.u];
			if (!u) return null;
			if (u.k === 'slot') return { t: 'slot', slot: u.slot };
			if (u.k === 'family') return { t: 'family', id: u.id, items: u.items.map(function (x) { return x[0]; }) };
			if (u.k === 'mount') return mountEntry(L);
			return { t: 'item', id: u.id };
		}
		if (p.kind === 'slot') return slots()[p.n] ? copy(slots()[p.n]) : null;
		return null;
	}
	function payloadIcon(p) {
		if (p.kind === 'spell') {
			var s = spellOf(p.id), fx = s && !s.general && p.rank ? Sp.rankNumbered(s, p.rank) : null;
			return s ? (s.general ? s.i : Sp.iconOf(s, (fx || Sp.highest(s) || s.r[0])[0])) : QUESTION;
		}
		if (p.kind === 'item') { var it = itemInfo(p.id); return it ? it.tier[3] : QUESTION; }
		if (p.kind === 'macro') { var m = macroOf(p.key); return m ? shownIcon(m.icon, m.body) : QUESTION; }
		if (p.kind === 'util') { var u = utilEntries()[p.u]; return u ? mountOr(u) : QUESTION; }
		if (p.kind === 'slot') return show(slots()[p.n]).icon;
		if (p.kind === 'xslot') { var pi = placeInfo({ bar: p.bar, i: p.i }); return pi ? pi.icon : QUESTION; }
		return QUESTION;
	}
	function payloadOf(el) {
		var k = el.getAttribute('data-drag');
		if (k === 'spell') return { kind: 'spell', id: +el.getAttribute('data-id'), name: el.getAttribute('data-n'), rank: +(el.getAttribute('data-rank') || 0) };
		if (k === 'item') return { kind: 'item', id: +el.getAttribute('data-id') };
		if (k === 'macro') return { kind: 'macro', key: el.getAttribute('data-key') };
		if (k === 'util') return { kind: 'util', u: +el.getAttribute('data-u'), name: el.getAttribute('data-n') };
		if (k === 'slot') return { kind: 'slot', n: +el.getAttribute('data-n'), bar: +el.getAttribute('data-bar'), i: +el.getAttribute('data-i') };
		if (k === 'xslot') return { kind: 'xslot', bar: el.getAttribute('data-xbar'), i: +el.getAttribute('data-i') };
		return null;
	}
	// ------------------------------------------------------------------ Move (0.6.3)
	// Harry, Oct 19: "i want to make a column draggable. for example i want to move Bar 1 slot 8, and bar 2 slot 8 inbetween
	// slots 4 and 5 in those bar rows. i don't want to do the same for bar 3 or 4". With Move on a click picks or unpicks a
	// button (any number, any rows); dragging a picked one shows a line in the gap the pointer is at, and the drop moves
	// every picked button to that place in its OWN row - its contents and its key together - the ones between shifting one
	// along, keys and all. Two picked in a row move as a block, in their order. Rows with none picked stay as they are.
	// Bar 1's form pages share its keys: a bar-1 move moves the same buttons on every page. (No undo in the editor.)
	function picks() { return st.move && st.pickL === cur()._id ? st.picked : {}; }
	function isPicked(bar, i) { return !!picks()[bar + ':' + i]; }
	function pick(bar, i, on) {
		if (st.pickL !== cur()._id) { st.picked = {}; st.pickL = cur()._id; }
		var k = bar + ':' + i;
		if (on === undefined) on = !st.picked[k];
		if (on) st.picked[k] = true; else delete st.picked[k];
	}
	function pickedCols(bar) {
		var out = [];
		for (var i = 1; i <= 12; i++) if (isPicked(bar, i)) out.push(i);
		return out;
	}
	// the action pages a bar's buttons are on: bar 1's every form page (and its own first), else the bar's one
	function movePages(bar) {
		if (bar !== 1) return [null];
		var pages = [1];
		Lay.formTabs(st.cls, { prowlBar: true, moonkinBar: true }).forEach(function (t) { if (pages.indexOf(t[1]) < 0) pages.push(t[1]); });
		return pages;
	}
	// the row's new order (old columns, left to right): the picked ones taken out and put back as a block at gap g (0 = before
	// the first button, 12 = after the last)
	function moveOrder(cols, g) {
		var rest = [], before = 0;
		for (var i = 1; i <= 12; i++) {
			if (cols.indexOf(i) < 0) rest.push(i);
			else if (i <= g) before++;
		}
		var at = g - before;
		return rest.slice(0, at).concat(cols, rest.slice(at));
	}
	function moveTo(g) {
		var L = cur(), sl = slots(), keys = L.specs[0].keys, moved = false, np = {};
		for (var bar = 1; bar <= 8; bar++) {
			var cols = pickedCols(bar);
			if (!cols.length) continue;
			var order = moveOrder(cols, g), same = order.every(function (c, j) { return c === j + 1; });
			order.forEach(function (c, j) { if (cols.indexOf(c) >= 0) np[bar + ':' + (j + 1)] = true; });
			if (same) continue;
			moved = true;
			movePages(bar).forEach(function (pg) {
				var old = {};
				for (var i = 1; i <= 12; i++) old[i] = sl[Lay.slotNumber(bar, i, pg)];
				for (var j = 1; j <= 12; j++) {
					var n = Lay.slotNumber(bar, j, pg), e = old[order[j - 1]];
					// 0.6.13 (Harry, Oct 20: "i also moved something to a different slot and it didn't move"): a button
					// that held something and now holds nothing is written emptied, so the game takes the old one off
					if (e) sl[n] = e; else if (old[j]) sl[n] = { t: 'empty' }; else delete sl[n];
				}
			});
			var oldKeys = {};
			for (var k = 1; k <= 12; k++) oldKeys[k] = keys[Lay.command(bar, k)];
			for (var m = 1; m <= 12; m++) {
				var cmd = Lay.command(bar, m), ks = oldKeys[order[m - 1]];
				if (ks) keys[cmd] = ks; else delete keys[cmd];
			}
			if (st.sel && st.sel.bar === bar) st.sel = { bar: bar, i: order.indexOf(st.sel.i) + 1 };
		}
		st.picked = np;
		st.pickL = L._id;
		if (moved) changed(); else renderPage();
	}
	// the gap under the pointer in a bar row (0 .. 12), or null off the bars
	function moveGapAt(x, y) {
		var el = document.elementFromPoint(x, y), row = el && el.closest('.brow');
		var els = row ? row.querySelectorAll('.slot[data-bar]') : [];
		if (!els.length) return null;
		var g = 0;
		Array.prototype.forEach.call(els, function (s) { var r = s.getBoundingClientRect(); if (r.left + r.width / 2 < x) g++; });
		return g;
	}
	// the insertion line, lavender, in that gap of every row with a button picked
	function moveLines(g) {
		Array.prototype.forEach.call(document.querySelectorAll('.moveline'), function (x) { x.remove(); });
		if (g === null) return;
		for (var bar = 1; bar <= 8; bar++) {
			if (!pickedCols(bar).length) continue;
			var els = document.querySelectorAll('.brow .slot[data-bar="' + bar + '"]');
			if (els.length < 12) continue;
			var a = g > 0 ? els[g - 1].getBoundingClientRect() : null, b = g < 12 ? els[g].getBoundingClientRect() : null;
			var x = a && b ? (a.right + b.left) / 2 : a ? a.right + 3 : b.left - 3, r = (a || b);
			var line = document.createElement('div');
			line.className = 'moveline';
			line.setAttribute('data-bar', bar);
			line.style.cssText = 'position:fixed;z-index:50;pointer-events:none;width:2px;border-radius:1px;background:var(--lav);'
				+ 'box-shadow:0 0 8px rgba(176,132,240,.8);left:' + (x - 1) + 'px;top:' + (r.top - 3) + 'px;height:' + (r.height + 6) + 'px';
			document.body.appendChild(line);
		}
	}
	// ------------------------------------------------------------------ Row order (0.6.4)
	// Harry, Oct 19: "i want to be able to drag bar 5 to bar 3 entirely ... maybe i want to add shift modifiers to bar 1,
	// bar 2 being ctrl modifiers of bar 1 ... if i only decide to add shift later then ... it looks untidy. i just want to be
	// able to rearrange the bar numbers whilst maintaining the mapping" - "essentially i just want to re-order the rows".
	// A row's word (bars 2-8) drags the whole row: a lavender line shows the gap it goes into, and the drop puts it at that
	// number, the rows between shifting one along (5 to 3: 3 = old 5, 4 = old 3, 5 = old 4). Every button keeps its contents
	// (pinned rank, Auto rank, macro) and its key together. Bar 1 stays: its form pages and paging are the game's. The
	// Screen view's bars are left as they are - they are the game's own bar places by number, never written by the editor.
	function rowEls() {
		var out = {};
		Array.prototype.forEach.call(document.querySelectorAll('.brow .bl[data-barmenu]'), function (el) { out[+el.getAttribute('data-barmenu')] = el.closest('.brow'); });
		return out;
	}
	// the gap under the pointer: k rows of bars 2-8 above it (0: between bar 1 and bar 2, 7: under bar 8), or null away
	// from the bar rows
	function rowGapAt(x, y) {
		var R = rowEls();
		if (!R[2] || !R[8]) return null;
		var top = R[2].getBoundingClientRect(), bot = R[8].getBoundingClientRect(), sl = R[2].querySelector('.slots').getBoundingClientRect();
		if (x < top.left - 20 || x > sl.right + 40 || y < top.top - top.height || y > bot.bottom + bot.height / 2) return null;
		var k = 0;
		for (var b = 2; b <= 8; b++) { var r = R[b].getBoundingClientRect(); if (r.top + r.height / 2 < y) k++; }
		return k;
	}
	function rowLine(k) {
		var was = $('rowline');
		if (was) was.remove();
		if (k === null) return;
		var R = rowEls(), a = R[1 + k] ? R[1 + k].getBoundingClientRect() : null, b = R[2 + k] ? R[2 + k].getBoundingClientRect() : null;
		var r = a || b, sl = R[2].querySelector('.slots').getBoundingClientRect();
		var y = a && b ? (a.bottom + b.top) / 2 : a ? a.bottom + 2 : b.top - 2;
		var line = document.createElement('div');
		line.id = 'rowline';
		line.className = 'moveline';
		line.style.cssText = 'position:fixed;z-index:50;pointer-events:none;height:2px;border-radius:1px;background:var(--lav);'
			+ 'box-shadow:0 0 8px rgba(176,132,240,.8);left:' + (r.left - 2) + 'px;top:' + (y - 1) + 'px;width:' + (sl.right - r.left + 4) + 'px';
		document.body.appendChild(line);
	}
	// bar `from` (2-8) into gap k: the new order of the rows (new bar 2 .. 8 -> old bar), or null when it stays
	function rowOrder(from, k) {
		var order = [2, 3, 4, 5, 6, 7, 8], at = from - 2, ins = k > at ? k - 1 : k;
		if (ins === at) return null;
		order.splice(at, 1);
		order.splice(ins, 0, from);
		return order;
	}
	function reorderRows(from, k) {
		var order = rowOrder(from, k);
		if (!order) return;
		var L = cur(), sl = slots(), keys = L.specs[0].keys, oldS = {}, oldK = {};
		for (var b = 2; b <= 8; b++) {
			oldS[b] = {}; oldK[b] = {};
			for (var i = 1; i <= 12; i++) { oldS[b][i] = sl[Lay.slotNumber(b, i)]; oldK[b][i] = keys[Lay.command(b, i)]; }
		}
		order.forEach(function (old, j) {
			var nb = j + 2;
			if (old === nb) return;
			for (var i = 1; i <= 12; i++) {
				var n = Lay.slotNumber(nb, i), cmd = Lay.command(nb, i);
				// 0.6.13: a button that held something and now holds nothing: emptied (the game takes the old one off)
				if (oldS[old][i]) sl[n] = oldS[old][i]; else if (oldS[nb][i]) sl[n] = { t: 'empty' }; else delete sl[n];
				if (oldK[old][i]) keys[cmd] = oldK[old][i]; else delete keys[cmd];
			}
		});
		if (st.sel && typeof st.sel.bar === 'number' && st.sel.bar > 1) st.sel = { bar: order.indexOf(st.sel.bar) + 2, i: st.sel.i };
		st.picked = {};
		changed();
	}

	// after a drop, the row's choice goes back to Highest
	function rowRankDone(p) { if (p && p.kind === 'spell' && p.name) delete st.rowRank[st.cls + ':' + p.name]; }
	function drop(p, target) {
		var L = cur();
		if (!target) {
			if (p.kind === 'slot') { setSlot(p.n, { t: 'empty' }); changed(); }   // out of the bars: cleared
			return;
		}
		var kind = target.getAttribute('data-drop');
		if (kind === 'slot') {
			if (p.kind === 'xslot') return;
			var n = +target.getAttribute('data-n');
			var where = { bar: +target.getAttribute('data-bar'), i: +target.getAttribute('data-i') };
			if (p.kind === 'slot') {
				if (p.n === n) return;
				var a = slots()[p.n], b = slots()[n];
				setSlot(n, a || (b ? { t: 'empty' } : null));
				setSlot(p.n, b && b.t !== 'empty' ? b : { t: 'empty' });   // a swap, or a move leaving it emptied
			} else {
				var e = entryFrom(p);
				if (!e) return;
				setSlot(n, e);
				rowRankDone(p);
			}
			st.sel = where;
			st.capture = false;
			changed();
		} else if (kind === 'key') {
			var key = Lay.withMods(layerMods(), target.getAttribute('data-key'));
			if (p.kind === 'slot') Lay.bind(L, Lay.command(p.bar, p.i), key);
			else if (p.kind === 'xslot') Lay.bind(L, Lay.command(p.bar, p.i), key);
			else {
				// 0.5.6 (Harry, Oct 18: "dropping stuff on the keyboard ... takes an empty slot on a bar and changes it. i
				// don't really like this"): a spell, item or macro dropped on a key goes to the bar button that key is on,
				// in place of what it held; on a key no bar button uses (faded) it does nothing
				var place = keyPlace(L, key);
				if (!place) return;
				var e2 = entryFrom(p);
				if (!e2) return;
				rowRankDone(p);
				setSlot(slotN(place.bar, place.i), e2);
				st.sel = place;
			}
			changed();
		} else if (kind === 'mspell') {
			var s = p.kind === 'spell' ? spellOf(p.id) : null;
			if (!s) return;
			setMakerSpell(s.n);
			renderPage();
		} else if (kind === 'mspell2') {   // 0.6.0: the Or
			var s2 = p.kind === 'spell' ? spellOf(p.id) : null;
			if (!s2) return;
			rowChanged();
			st.maker.f.spell2 = s2.n;
			st.maker.f.rank2 = 0;
			renderPage();
		} else if (kind === 'micon') {
			var icon = payloadIcon(p);
			if (icon) { st.maker.icon = icon; st.maker.iconTyped = true; paintMaker(); }
		}
	}

	// an Auto rank slot holds the highest rank (planned at 60): a layout read from a string or a file, or kept from an
	// older editor that planned at a lower level, is brought up to it
	function updateAutoSlots(L) {
		var C = D.classes[L.class], sl = L.specs[0].slots;
		Object.keys(sl).forEach(function (n) {
			var e = sl[n];
			// (Harry, Oct 19: "use conjured before real even if our real one is higher level") a family's and Mount up's list
			// always today's order (conjured first, fastest first), not the one kept when the button was filled
			if (e && e.t === 'family') {
				var fam = familyOf(e.id);
				if (fam) e.items = fam.items.map(function (x) { return x[0]; });
				return;
			}
			if (e && e.t === 'mount') {
				var me = mountEntry(L);
				if (me) { e.items = me.items; e.spells = me.spells; }
				return;
			}
			if (!e || e.t !== 'spell' || !Lay.autoOf(L, e)) return;
			var s = Sp.byId(C, e.id);
			if (!s) return;
			var h = Sp.highest(s);
			if (h) { e.id = h[0]; e.rank = h[1]; }
		});
	}

	// 0.6.8 (HUI Menus 0.20.7; Harry, Oct 19: "resurrection and penance macros both just show a question mark"): a macro
	// made from a kept form before 0.6.8, its text never edited, its #showtooltip bare - that one line named
	// (Mac.NamedBody), as the in-game window does once. On load, a backup opened, a macro opened and every export
	function nameTooltips(L) {
		var n = 0;
		((L && L.macros) || []).forEach(function (m) {
			var form = st.forms[L._id + '\n' + m.key];
			if (!form) return;
			Mac.FoldForm(form);
			if (!Mac.BY_KEY[form.tpl]) return;
			var body = Mac.NamedBody(form.tpl, Mac.Filled(form.tpl, form.f), m.body);
			if (body !== null && Mac.Letters(body) <= Mac.MAX_LETTERS) { m.body = body; n++; }
		});
		return n;
	}
	function makeMacro() {
		var m = st.maker, L = cur();
		if (!makerReady()) return;
		var body = makerText(), name = makerName(), key = m.editing;
		// a Blank on no icon of its own is kept on the ?, so the game shows whatever its text casts (as it is drawn here)
		var icon = (m.tpl === 'blank' && (!m.iconTyped || !m.icon || m.icon === QUESTION)) ? QUESTION : autoIcon();
		var form = { tpl: m.tpl, f: copy(m.f), name: name, iconTyped: m.iconTyped, icon: m.icon };
		if (key && macroOf(key)) {
			var x = macroOf(key);
			x.name = name; x.icon = icon; x.body = body;
			if (scopeOf(x) !== m.scope) {
				// 0.6.11: Where changed - the macro moves to the other set, its key (every button holding it) and form with it;
				// the same macro (name and text) there already: that one is used and this one dropped
				var twin = macroTwin(m.scope, name, body, key);
				if (twin) {
					var sl = slots();
					Object.keys(sl).forEach(function (n) { if (sl[n] && sl[n].t === 'macro' && sl[n].key === key) sl[n] = { t: 'macro', key: twin.key }; });
					L.macros = L.macros.filter(function (y) { return y !== x; });
					delete st.forms[L._id + '\n' + key];
					key = twin.key;
				} else {
					x.scope = m.scope;
				}
			}
		} else {
			key = Lay.nextMacroKey(L);
			L.macros.push({ key: key, name: name, icon: icon, body: body, scope: m.scope });
		}
		st.forms[L._id + '\n' + key] = form;
		var tpl = m.tpl, scope = m.scope;
		st.maker = freshMaker(tpl);
		st.maker.scope = scope;
		changed();
	}
	// 0.6.3 (Harry, Oct 19: "when i click on a slot with a pre-existing skill in, whether it's rank 1 or whatever rank, i
	// can just 'create macro version' -> it creates the macro in 'Your Macros', and then it switches it out with the macro
	// version - making the distinction it's mouseover"): the Slot's Mouseover - a Mouseover macro of the button's spell, at
	// its pinned rank (else Highest), On Enemy for a spell cast at an enemy (data.js "h"), Dead for one that raises the
	// dead, else Friendly; Kind Plain, Else as the template starts; nameless; in the set the maker's Where says. The same
	// text already in that set is used again. It takes the spell's place on the button (its key with it).
	function mouseoverFields(e) {
		var s = e && e.t === 'spell' ? spellOf(e.id) : null;
		if (!s) return null;
		var f = Mac.DefaultFields('heal');
		f.spell = s.n;
		f.rank = (!s.general && s.r.length > 1 && !isAuto(e)) ? (e.rank || 0) : 0;
		f.on = isRes(s.n) ? 'dead' : (s.h ? 'enemy' : 'friendly');
		return { f: f, spell: s };
	}
	function mouseoverMacro() {
		var e = selEntry(), mo = mouseoverFields(e), L = cur();
		if (!mo || !st.sel || typeof st.sel.bar !== 'number') return;
		var scope = st.maker.scope === 'character' ? 'character' : 'account';
		var body = Mac.Text('heal', mo.f);
		var m = L.macros.filter(function (x) { return x.body === body && (x.scope === 'character' ? 'character' : 'account') === scope; })[0];
		if (!m) {
			var c = Lay.macroCounts(L);
			if (scope === 'character' ? c.character >= Lay.MAX_CHARACTER : c.account >= Lay.MAX_ACCOUNT) return;
			m = { key: Lay.nextMacroKey(L), name: '', icon: spellIconOf(mo.spell), body: body, scope: scope };
			L.macros.push(m);
			st.forms[L._id + '\n' + m.key] = { tpl: 'heal', f: copy(mo.f), name: '', iconTyped: false, icon: null };
		}
		setSlot(slotN(st.sel.bar, st.sel.i), { t: 'macro', key: m.key });
		changed();
	}
	function openMacro(key) {
		var L = cur(), m = macroOf(key);
		if (!m) return;
		if (nameTooltips(L)) save();   // 0.6.8
		var form = st.forms[L._id + '\n' + key];
		Mac.FoldForm(form);   // 0.6.1: an Either form is Mouseover's
		if (form && Mac.BY_KEY[form.tpl]) {
			// its template and fields (0.6.1: over the template's start); its icon follows the spell again unless one was
			// dropped on the Name (0.5.5)
			st.maker = { tpl: form.tpl, f: Mac.Filled(form.tpl, copy(form.f)), name: m.name, icon: form.iconTyped ? m.icon : null, iconTyped: !!form.iconTyped,
				scope: m.scope, editing: key };
		} else {
			st.maker = { tpl: 'blank', f: { body: m.body }, name: m.name, icon: m.icon, iconTyped: true,
				scope: m.scope, editing: key };
		}
		renderPage();
	}
	function deleteMacro(key) {
		var L = cur();
		L.macros = L.macros.filter(function (m) { return m.key !== key; });
		var sl = slots();
		Object.keys(sl).forEach(function (n) { if (sl[n] && sl[n].t === 'macro' && sl[n].key === key) sl[n] = { t: 'empty' }; });
		delete st.forms[L._id + '\n' + key];
		if (st.maker && st.maker.editing === key) st.maker = freshMaker(st.maker.tpl);
		changed();
	}

	function addLayout(L) {
		L._id = uid();
		L.name = uniqueName(L.class, L.name);
		if (L.firstLogin) classLayouts(L.class).forEach(function (l) { l.firstLogin = false; });
		st.layouts.push(L);
		st.cls = L.class;
		st.cur[L.class] = L._id;
		st.sel = { bar: 1, i: 1 };
		st.maker = freshMaker('heal');
	}
	// (Harry, Oct 19: "one - a site settings save - imports everything onto the website, all of the different classes and
	// races. two - a singular character save") Backup: the whole site - every layout of every class and race, saved or
	// not, and the macro makers' memory - in one file; Open puts it back (a layout of the same class and name replaced,
	// the rest added). Save is the single character's string.
	var BACKUP_KIND = 'HUI Bar Editor backup';
	function backupText() {
		st.layouts.forEach(nameTooltips);   // 0.6.8
		return JSON.stringify({ kind: BACKUP_KIND, v: 1, cls: st.cls, forms: st.forms,
			layouts: st.layouts.map(function (L) { return { saved: !!L.saved, layout: Lay.toLua(L) }; }) }, null, 1) + '\n';
	}
	function backup() {
		var text = backupText();
		st.lastBackup = { name: 'HUI Bar Editor backup.json', text: text };
		if (!st.demo) download(st.lastBackup.name, text);
		saySave('Backed up');
	}
	function restoreBackup(o) {
		var n = 0, byOld = {};
		(o.layouts || []).forEach(function (e) {
			var L;
			try { L = Lay.fromLua(e.layout); } catch (x) { return; }
			updateAutoSlots(L);
			L.saved = !!e.saved;
			var had = null;
			st.layouts.forEach(function (l) { if (l.class === L.class && l.name === L.name) had = l; });
			if (had) { L._id = had._id; st.layouts[st.layouts.indexOf(had)] = L; } else { L._id = uid(); st.layouts.push(L); }
			n++;
		});
		if (o.forms && typeof o.forms === 'object') Object.keys(o.forms).forEach(function (k) { if (!(k in st.forms)) st.forms[k] = o.forms[k]; });
		st.layouts.forEach(nameTooltips);   // 0.6.8
		if (o.cls && D.classes[o.cls]) st.cls = o.cls;
		st.importMsg = '';
		saySave('Restored ' + n);
		changed();
	}
	function importText(text) {
		text = String(text || '').trim();
		if (!text) { $('file').click(); return; }
		if (text.charAt(0) === '{') {
			var o = null;
			try { o = JSON.parse(text); } catch (x) { o = null; }
			if (o && o.kind === BACKUP_KIND) return restoreBackup(o);
		}
		if (/(HUI_LAYOUTS|HUIPRESETS)\s*=|HUIPresets_Add\s*\(/.test(text)) { loadLayoutsFile(text); return; }
		S.decode(text).then(function (v) {
			var L = Lay.fromLua(v);
			updateAutoSlots(L);
			addLayout(L);
			L.saved = true;
			st.importMsg = '';
			changed();
		}).catch(function (e) {
			st.importMsg = e && e.message === 'Newer' ? 'Newer' : 'Not valid';
			st.importPink = true;
			renderPage();
			var imp = $('imp');
			if (imp) imp.value = text;
		});
	}
	// a Layouts.lua back: a layout of the same class and name is replaced, any other added
	function loadLayoutsFile(text) {
		var list;
		try { list = S.readLayoutsFile(text); } catch (e) { st.importMsg = 'Not valid'; st.importPink = true; renderPage(); return; }
		var n = 0, last = null;
		list.forEach(function (t) {
			var L;
			try { L = Lay.fromLua(t); } catch (e) { return; }
			updateAutoSlots(L);
			var had = null;
			st.layouts.forEach(function (l) { if (l.class === L.class && l.name === L.name) had = l; });
			L.saved = true;
			if (had) { L._id = had._id; st.layouts[st.layouts.indexOf(had)] = L; } else { L._id = uid(); st.layouts.push(L); }
			if (L.firstLogin) classLayouts(L.class).forEach(function (l) { if (l !== L) l.firstLogin = false; });
			last = L;
			n++;
		});
		if (last) { st.cls = last.class; st.cur[last.class] = last._id; st.sel = { bar: 1, i: 1 }; }
		st.importMsg = n ? 'Loaded ' + n : 'Not valid';
		st.importPink = !n;
		changed();
	}
	function saveFile() {
		var text = S.layoutsFile(st.layouts.map(Lay.toLua));
		var blob = new Blob([text], { type: 'text/plain' });
		var a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = 'Layouts.lua';
		document.body.appendChild(a);
		a.click();
		setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
	}
	function copyExport() {
		var text = st.exportStr;
		var done = function () { flash('Copied'); };
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(text).then(done, fallback);
		} else fallback();
		function fallback() {
			var ta = document.createElement('textarea');
			ta.value = text;
			document.body.appendChild(ta);
			ta.select();
			try { document.execCommand('copy'); done(); } catch (e) { /* nothing */ }
			ta.remove();
		}
	}
	function flash(word) {
		var b = document.querySelector('[data-act="copy"]');
		if (!b) return;
		b.textContent = word;
		setTimeout(function () { if (b.isConnected) b.textContent = 'Copy'; }, 1200);
	}

	// ------------------------------------------------------------------ Start from / Take neutrals (0.4.0)
	// Harry, Oct 18: "if the user saves a shaman template, for example, and then makes a warrior build - they should be
	// given the option to keep consumables/mount/neutrals etc in the same slots". New layout asks where to start from;
	// a layout's right-click menu has "Take neutrals from..." (into its empty places only). js/neutral.js has the rules.
	function startList() {
		var s = st.start;
		var others = otherLayouts(s.mode === 'take' ? layoutById(s.dst) : null);
		return s.mode === 'new' ? [null].concat(others) : others;
	}
	function startSrc() { var l = startList(); return l[st.start.pick] || null; }
	function startDst() {
		var s = st.start;
		if (s.mode === 'take') return layoutById(s.dst);
		var L = Lay.newLayout(st.cls, 'New');
		L.race = undefined;
		return L;
	}
	function startHTML() {
		var s = st.start, list = startList(), src = startSrc(), take = s.mode === 'take';
		var hasBars = !!(src && (src.bars || src.barsIn));
		var h = '<div class="dim"><div class="ask start"><div class="ch"><span>' + (take ? 'Take neutrals' : 'New layout') + '</span><span class="chr">'
			+ '<span class="x" data-act="startclose">&times;</span></span></div>';
		h += row(take ? 'From' : 'Start from', list.length ? step(src ? layoutWord(src, list) : 'Empty', ' data-act="startfrom"', list.length < 2) : '<span class="dimt">None</span>');
		if (src) {
			var trial = startDst();
			trial = Lay.fromLua(Lay.toLua(trial));
			if (take) trial.race = layoutById(s.dst).race;
			var r = N.takeNeutrals(D, trial, src, { fill: take ? 'empty' : 'all' });
			h += row('Brings', '<span class="soft">' + r.slots + (r.slots === 1 ? ' button' : ' buttons') + ' &middot; ' + r.keys + (r.keys === 1 ? ' key' : ' keys')
				+ (r.skipped ? ' &middot; ' + r.skipped + ' left' : '') + '</span>');
		}
		h += '<div class="row" style="border:0;justify-content:flex-end;gap:16px">' + tick(s.bars && hasBars, 'Bars too', ' data-act="startbars"', !hasBars)
			+ btn(take ? 'Take' : 'Make', 'p' + (take && !src ? ' grey' : ''), ' data-act="startdo"') + '</div>';
		return h + '</div></div>';
	}
	function renderStart() {
		var old = $('startwrap');
		if (old) old.remove();
		if (!st.start) return;
		var d = document.createElement('div');
		d.id = 'startwrap';
		d.innerHTML = startHTML();
		$('stage').appendChild(d);
	}
	function openStart(mode, dst) {
		st.start = { mode: mode, dst: dst ? dst._id : null, pick: 0, bars: true };
		renderStart();
	}
	// the macro maker's form of each macro brought along (its own key in the new layout)
	function carryForms(src, dst, keyMap) {
		Object.keys(keyMap).forEach(function (k) {
			var f = st.forms[src._id + '\n' + k];
			if (f && !st.forms[dst._id + '\n' + keyMap[k]]) st.forms[dst._id + '\n' + keyMap[k]] = copy(f);
		});
	}
	function startDo() {
		var s = st.start, src = startSrc(), bars = s.bars && !!(src && (src.bars || src.barsIn)), r;
		if (s.mode === 'take') {
			var L = layoutById(s.dst);
			if (!L || !src) return;
			r = N.takeNeutrals(D, L, src, { fill: 'empty', bars: bars });
			carryForms(src, L, r.keyMap);
			st.start = null;
			renderStart();
			st.cls = L.class;
			st.cur[L.class] = L._id;
			return changed();
		}
		var nl = Lay.newLayout(st.cls, uniqueName(st.cls, 'New'));
		addLayout(nl);
		if (src) {
			r = N.takeNeutrals(D, nl, src, { bars: bars });
			carryForms(src, nl, r.keyMap);
		}
		st.start = null;
		renderStart();
		st.renaming = nl._id;
		changed();
	}

	// ------------------------------------------------------------------ Keys from file (0.6.4)
	// Harry, Oct 19: "we will need to have 'load keybinds from file' which would open up the lua of a file and extract just
	// the keybind settings - ie the mapping, that way they don't need to re-map when they make a new class". A saved preset
	// (.hui-layouts.lua) or a Layouts.lua: its layouts offered as Start from offers them (one: the stepper still), and Take
	// puts that layout's key mapping on this one (neutral.js takeKeys) - its spells, macros and bars stay as they are.
	function keysFromText(text) {
		var list = [];
		try {
			S.readLayoutsFile(text).forEach(function (t) { try { list.push(Lay.fromLua(t)); } catch (e) { /* a layout this reader cannot read */ } });
		} catch (e) { list = []; }
		if (!list.length) { st.importMsg = 'Not valid'; st.importPink = true; st.keysFile = null; renderKeysFile(); renderPage(); return; }
		var pick = 0;
		list.forEach(function (l, i) { if (l.class === st.cls && list[pick].class !== st.cls) pick = i; });
		st.importMsg = '';
		st.keysFile = { list: list, pick: pick };
		renderPage();
		renderKeysFile();
	}
	function keysFileHTML() {
		var k = st.keysFile, src = k.list[k.pick], n = 0;
		Object.keys(src.specs[0].keys).forEach(function (c) { n += (src.specs[0].keys[c] || []).length; });
		return '<div class="dim"><div class="ask start keysfile"><div class="ch"><span>Import Mappings</span><span class="chr">'
			+ '<span class="x" data-act="kfclose">&times;</span></span></div>'
			+ row('From', step(layoutWord(src, k.list), ' data-act="kffrom"', k.list.length < 2))
			+ row('Brings', '<span class="soft">' + n + (n === 1 ? ' key' : ' keys') + '</span>')
			+ '<div class="row" style="border:0;justify-content:flex-end;gap:16px">' + btn('Take', 'p', ' data-act="kfdo"') + '</div></div></div>';
	}
	function renderKeysFile() {
		var old = $('keyswrap');
		if (old) old.remove();
		if (!st.keysFile) return;
		var d = document.createElement('div');
		d.id = 'keyswrap';
		d.innerHTML = keysFileHTML();
		$('stage').appendChild(d);
	}
	function keysFileDo() {
		var k = st.keysFile;
		if (!k) return;
		N.takeKeys(cur(), k.list[k.pick]);
		st.keysFile = null;
		st.capture = false;
		renderKeysFile();
		changed();
	}

	// ------------------------------------------------------------------ the small menu
	// items: [word, fn, class, children]; 0.5.1: an item with children opens them beside it (hovered or clicked), each level
	// its own small menu inside #menu, so closing the menu closes them all
	function menu(x, y, items) {
		closeMenu();
		var root = document.createElement('div');
		root.className = 'menu';
		root.id = 'menu';
		document.body.appendChild(root);
		fillMenu(root, items, root);
		root.style.left = Math.max(4, Math.min(x, innerWidth - root.offsetWidth - 4)) + 'px';
		root.style.top = Math.max(4, Math.min(y, innerHeight - root.offsetHeight - 4)) + 'px';
	}
	function fillMenu(m, items, root) {
		items.forEach(function (it) {
			var d = document.createElement('div');
			d.textContent = it[0];
			if (it[2]) d.className = it[2];
			if (it[3]) {
				d.classList.add('more');
				d.setAttribute('data-more', it[0]);
				var open = function (e) {
					if (e) e.stopPropagation();
					openSub(m, d, it[3], root);
				};
				d.addEventListener('mouseenter', function () { open(); });
				d.addEventListener('click', open);
			} else {
				d.addEventListener('mouseenter', function () { closeSubs(m); });
				d.addEventListener('click', function (e) { e.stopPropagation(); if (d.classList.contains('grey')) return; closeMenu(); it[1](); });
			}
			m.appendChild(d);
		});
	}
	// a level's open child (and its own children) closed
	function closeSubs(m) {
		var kids = m._sub ? [m._sub] : [];
		while (kids.length) {
			var k = kids.pop();
			if (k._sub) kids.push(k._sub);
			k.remove();
		}
		m._sub = null;
		Array.prototype.forEach.call(m.querySelectorAll('.more.on'), function (x) { x.classList.remove('on'); });
	}
	function openSub(m, d, items, root) {
		if (m._sub && m._sub._from === d) return;
		closeSubs(m);
		var s = document.createElement('div');
		s.className = 'menu msub';
		s._from = d;
		root.appendChild(s);
		fillMenu(s, items, root);
		m._sub = s;
		d.classList.add('on');
		var r = d.getBoundingClientRect(), w = s.offsetWidth, h = s.offsetHeight;
		var left = r.right + 2 + w <= innerWidth - 4 ? r.right + 2 : r.left - 2 - w;
		s.style.left = Math.max(4, left) + 'px';
		s.style.top = Math.max(4, Math.min(r.top - 4, innerHeight - h - 4)) + 'px';
	}
	function closeMenu() { var m = $('menu'); if (m) m.remove(); }

	// ------------------------------------------------------------------ a bar's menu (0.5.1)
	// Harry, Oct 18: "on action bar 2 you could 'modify -> alt/shift/ctrl -> action bar 1' giving it the ability to import
	// the same keybinds but with modification on all 12". The row's word: Modify > Shift / Ctrl / Alt > Bar N - this bar's
	// 12 keys become that bar's 12 with the modifier added (the game's ALT-CTRL-SHIFT- order), each chord taken off any
	// button that had it. No undo in the editor, so it asks once first, quietly.
	var MODS = [['Shift', { shift: true }], ['Ctrl', { ctrl: true }], ['Alt', { alt: true }]];
	function barKeys(L, bar) {
		var out = [];
		for (var i = 1; i <= 12; i++) out.push((L.specs[0].keys[Lay.command(bar, i)] || [])[0] || '');
		return out;
	}
	// the 12 chords bar dst takes from bar src with mods added ('' = no key there)
	function modifiedKeys(L, src, mods) { return barKeys(L, src).map(function (k) { return k ? Lay.withMods(mods, k) : ''; }); }
	function copyKeys(dst, src, mods) {
		var L = cur(), want = modifiedKeys(L, src, mods);
		want.forEach(function (k, i) {
			if (k) Lay.bind(L, Lay.command(dst, i + 1), k);
			else Lay.unbind(L, Lay.command(dst, i + 1));
		});
		changed();
	}
	function barMenu(bar, el) {
		var L = cur(), r = el.getBoundingClientRect();
		menu(r.left, r.bottom + 2, [['Modify', null, '', MODS.map(function (m) {
			var bars = [];
			for (var b = 1; b <= 8; b++) {
				if (b === bar) continue;
				(function (src) {
					var none = !barKeys(L, src).some(Boolean);
					bars.push(['Bar ' + src, function () { askCopyKeys(bar, src, m); }, none ? 'grey' : '']);
				})(b);
			}
			return [m[0], null, '', bars];
		})]]);
	}
	function askCopyKeys(dst, src, m) {
		closeKeysAsk();
		st.keysAsk = { dst: dst, src: src, mods: m[1] };
		var d = document.createElement('div');
		d.id = 'keysask';
		d.className = 'tourask keysask';
		d.innerHTML = '<span class="tq">Bar ' + dst + ': ' + m[0] + ' + Bar ' + src + '’s keys?</span>'
			+ btn('Cancel', 's', ' data-act="keyscancel"') + btn('Set', 's p', ' data-act="keysset"');
		$('stage').appendChild(d);
		var lab = document.querySelector('.bl[data-barmenu="' + dst + '"]'), r = lab ? lab.getBoundingClientRect() : { left: 240, bottom: 120 };
		d.style.left = Math.max(4, Math.min(r.left, innerWidth - d.offsetWidth - 8)) + 'px';
		d.style.top = Math.max(4, Math.min(r.bottom + 4, innerHeight - d.offsetHeight - 8)) + 'px';
		d.style.right = 'auto';
	}
	function closeKeysAsk() { var d = $('keysask'); if (d) d.remove(); st.keysAsk = null; }
	function layoutMenu(id, x, y) {
		var L = null;
		st.layouts.forEach(function (l) { if (l._id === id) L = l; });
		if (!L) return;
		menu(x, y, [
			['Rename', function () { st.cur[L.class] = L._id; st.renaming = L._id; render(); }],
			[L.firstLogin ? 'Not first login' : 'First login', function () {
				var on = !L.firstLogin;
				classLayouts(L.class).forEach(function (l) { l.firstLogin = false; });
				L.firstLogin = on;
				changed();
			}],
			['Copy', function () {
				var c = Lay.fromLua(Lay.toLua(L));
				c.firstLogin = false;
				c.name = uniqueName(L.class, L.name);
				c._id = uid();
				st.layouts.push(c);
				st.cur[L.class] = c._id;
				changed();
			}],
			['Take neutrals from\u2026', function () { openStart('take', L); }],
			['Delete', function () {
				st.layouts = st.layouts.filter(function (l) { return l !== L; });
				Object.keys(st.forms).forEach(function (k) { if (k.indexOf(L._id + '\n') === 0) delete st.forms[k]; });
				delete st.cur[L.class];
				changed();
			}, 'pink'],
		]);
	}

	// ------------------------------------------------------------------ key capture
	// 0.4.1: Keybind mode - a click on a bar button chooses it and waits for its key at once; the key bound, the button
	// stays chosen and the mode on, so the next button is one click and one key. A keyboard panel key clicked first is
	// held (st.kbPick) for the next bar button clicked.
	function kbModeOff() {
		st.kbMode = false;
		st.kbPick = null;
		st.capture = false;
		changed();
	}
	// 0.4.4 (Harry, Oct 18: "ctrl + T opens a new tab on google chrome. and maybe someone uses alt + q so we need our keys to
	// override google chrome somehow"): while a key is being taken (Press a key, a Keybind mode button waiting, the mouse's
	// Set buttons) every key the page is given is the page's: its default (a browser shortcut) stopped on keydown, keyup
	// and keypress. Chrome and Edge keep a few for themselves (Ctrl+T / W / N, Ctrl+Shift+T / N / W, Ctrl+Tab ...) that
	// never reach a page: 0.4.5 (Harry, Oct 18: "forcing full screen mode isn't an option") - the layer switch is the
	// modifier instead (Ctrl picked, then T pressed = Ctrl-T; the browser sees a plain T), and a drawn key clicked with
	// Ctrl held (or the Ctrl layer) sets Ctrl+it.
	function capturing() { return !!(st.capture || teaching()); }
	// a key pressed while one was being taken stays the page's until it is let go (its keyup: F10's or Alt's would
	// otherwise reach the browser's menu once the key it made is bound)
	var held = {};
	function blockKey(e) {
		var was = !!held[e.code];
		if (e.type === 'keyup') delete held[e.code];
		if (!capturing() && !was) return;
		e.preventDefault();
		e.stopPropagation();
	}
	function bindSelected(key) {
		var cmd = selCommand();
		if (!cmd) return;
		Lay.bind(cur(), cmd, key);
		st.capture = false;
		changed();
	}
	function modifierOnly(e) { return /^(Shift|Control|Alt|Meta|OS)(Left|Right)?$/.test(e.code) || /^(Shift|Control|Alt|Meta|OS)$/.test(e.key); }
	function onKeyDown(e) {
		if (capturing() && e.code) held[e.code] = true;
		if (teaching()) {
			// 0.4.4: Set buttons - the key the lit side button's software sent, with its modifiers
			e.preventDefault();
			e.stopPropagation();
			if (modifierOnly(e)) return;
			if (e.code === 'Escape') return teachStop();
			var tk = Lay.keyFromCode(e.code);
			if (tk) teachRecord(Lay.chord({ alt: e.altKey, ctrl: e.ctrlKey, shift: e.shiftKey }, tk));
			return;
		}
		if (st.capture) {
			e.preventDefault();
			e.stopPropagation();
			if (modifierOnly(e)) return;
			if (e.code === 'Escape') { st.capture = false; changed(); return; }
			var km = clickMods(e);   // 0.4.5: the layer's modifier added to the ones held
			if ((e.code === 'Backspace' || e.code === 'Delete') && !km.shift && !km.ctrl && !km.alt) {
				Lay.unbind(cur(), selCommand());   // as the game's keybind mode: these two clear the button's key
				st.capture = false;
				changed();
				return;
			}
			var k = Lay.keyFromCode(e.code);
			if (!k) return;
			bindSelected(Lay.chord(km, k));
			return;
		}
		var t = e.target;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
			if (e.key === 'Enter' && (t.id === 'rename' || t.id === 'retitle')) t.blur();
			if (e.key === 'Escape' && (t.id === 'rename' || t.id === 'retitle')) { st.renaming = null; render(); }
			return;
		}
		if (e.key === 'Escape') {
			var open = !!($('menu') || st.start || st.keysAsk);
			closeMenu();
			closeKeysAsk();
			if (st.start) { st.start = null; renderStart(); }
			if (!open && st.kbMode) kbModeOff();   // 0.4.1: Escape disarms (above), a second one leaves Keybind mode
			return;
		}
		if (st.kbMode) {
			// 0.4.1: in Keybind mode Backspace / Delete are about keys: the chosen button's key, never its spell
			if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel && !e.shiftKey && !e.ctrlKey && !e.altKey) {
				e.preventDefault();
				Lay.unbind(cur(), selCommand());
				changed();
			}
			return;
		}
		if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel && typeof st.sel.bar === 'number') {
			var n = slotN(st.sel.bar, st.sel.i);
			if (slots()[n]) { setSlot(n, { t: 'empty' }); changed(); }
			e.preventDefault();
		}
	}
	function captureMouse(e) {
		if (!capturing()) return false;
		var k = Lay.keyFromMouse(e.button);
		if (k) {
			e.preventDefault();
			// a side button left as the mouse's own Button 4 / 5: Set buttons records it raw, a binding takes the layer too
			if (teaching()) teachRecord(Lay.chord({ alt: e.altKey, ctrl: e.ctrlKey, shift: e.shiftKey }, k));
			else bindSelected(Lay.chord(clickMods(e), k));
			return true;
		}
		return false;
	}
	// the mouse's back / forward buttons and the middle one leave the browser alone while a key is taken
	function blockMouse(e) { if (capturing() && e.button > 0) { e.preventDefault(); e.stopPropagation(); } }

	// ------------------------------------------------------------------ pointer: clicks and drags
	var drag = null, justDragged = false;
	function dropTargetAt(x, y) {
		var el = document.elementFromPoint(x, y);
		return el ? el.closest('[data-drop]') : null;
	}
	function onPointerDown(e) {
		if (captureMouse(e)) return;
		if (e.button !== 0) return;
		// a press inside the menu or the quiet ask is theirs (closing them here lost the click: the item was gone)
		if (!e.target.closest('#menu')) closeMenu();
		if (st.keysAsk && !e.target.closest('#keysask')) closeKeysAsk();
		if (e.target.closest('#menu, #keysask')) return;
		if (screenDown(e)) return;
		if (e.target.closest('.rstep')) return;   // the row's rank step-through: a click, not a drag
		if (st.kbMode) return;   // 0.4.1: no drags in Keybind mode, so nothing moves by accident
		var rw = e.target.closest('[data-rowdrag]');
		if (rw) { drag = { row: +rw.getAttribute('data-rowdrag'), el: rw, x: e.clientX, y: e.clientY, started: false }; return; }
		var src = e.target.closest('[data-drag]');
		if (!src) return;
		var p = payloadOf(src);
		if (!p) return;
		drag = { p: p, x: e.clientX, y: e.clientY, started: false, ghost: null, over: null };
	}
	function onPointerMove(e) {
		if (screenMove(e)) return;
		if (!drag) return;
		if (drag.row) {   // 0.6.4: a row's word dragged - the line in the gap it goes into
			if (!drag.started) {
				if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 5) return;
				drag.started = true;
				drag.el.classList.add('rowsrc');
				document.body.classList.add('rowdragging');
			}
			rowLine(rowGapAt(e.clientX, e.clientY));
			return;
		}
		if (!drag.started) {
			if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 5) return;
			drag.started = true;
			var g = document.createElement('div');
			g.className = 'ghost slot';
			g.style.setProperty('--s', Math.round(34 * scale) + 'px');
			g.innerHTML = img(payloadIcon(drag.p));
			document.body.appendChild(g);
			drag.ghost = g;
			if (drag.p.name) { st.hot = drag.p.name; }
		}
		drag.ghost.style.left = (e.clientX + 6) + 'px';
		drag.ghost.style.top = (e.clientY - 14) + 'px';
		if (st.move && drag.p.kind === 'slot') {
			// 0.6.3: Move - the button dragged is one of the picked ones; the line shows where they go
			if (!isPicked(drag.p.bar, drag.p.i)) { pick(drag.p.bar, drag.p.i, true); var se = document.querySelector('.brow .slot[data-n="' + drag.p.n + '"]'); if (se) se.classList.add('sel'); }
			drag.gap = moveGapAt(e.clientX, e.clientY);
			moveLines(drag.gap);
			return;
		}
		var t = dropTargetAt(e.clientX, e.clientY);
		if (t !== drag.over) {
			if (drag.over) drag.over.classList.remove('drop');
			drag.over = t;
			if (t && acceptable(drag.p, t)) t.classList.add('drop');
		}
	}
	function acceptable(p, t) {
		var k = t.getAttribute('data-drop');
		if (k === 'slot') return p.kind !== 'xslot';
		// 0.5.6: a button binds any key; anything else only a key a bar button uses (it takes that button's place)
		if (k === 'key' && p.kind !== 'slot' && p.kind !== 'xslot') return !!keyPlace(cur(), Lay.withMods(layerMods(), t.getAttribute('data-key')));
		if (k === 'mspell' || k === 'mspell2') return p.kind === 'spell';
		return true;
	}
	function onPointerUp(e) {
		if (screenUp(e)) return;
		if (!drag) return;
		var d = drag;
		drag = null;
		if (!d.started) return;
		justDragged = true;
		setTimeout(function () { justDragged = false; }, 0);
		if (d.row) {
			rowLine(null);
			d.el.classList.remove('rowsrc');
			document.body.classList.remove('rowdragging');
			var k = rowGapAt(e.clientX, e.clientY);
			if (k !== null) reorderRows(d.row, k);
			return;
		}
		if (d.ghost) d.ghost.remove();
		if (d.over) d.over.classList.remove('drop');
		st.hot = null;
		if (st.move && d.p.kind === 'slot') {   // 0.6.3: Move - into the gap, or (off the bars) nothing at all
			moveLines(null);
			var g = moveGapAt(e.clientX, e.clientY);
			if (g !== null) moveTo(g);
			return;
		}
		var t = dropTargetAt(e.clientX, e.clientY);
		if (t && !acceptable(d.p, t)) return;
		drop(d.p, t);
	}

	function onClick(e) {
		if (justDragged) return;
		var t = e.target;
		var el;
		if ((el = t.closest('.sgrid [data-side]'))) return teachStart(+el.getAttribute('data-side'));
		if ((el = t.closest('[data-mouse]'))) return pickMouse(el.getAttribute('data-mouse'));
		if ((el = t.closest('[data-race]'))) return setRace(el.getAttribute('data-race'));
		if ((el = t.closest('[data-lset]'))) return toggleSetting(el.getAttribute('data-lset'));
		if (t.closest('[data-sbar]')) return;
		if ((el = t.closest('[data-unlink]'))) return unlinkBar(+el.getAttribute('data-unlink'));
		if ((el = t.closest('[data-barmenu]'))) return barMenu(+el.getAttribute('data-barmenu'), el);
		if ((el = t.closest('[data-cls]'))) {
			st.cls = el.getAttribute('data-cls');
			st.sel = { bar: 1, i: 1 };
			st.capture = false;
			st.filter = 'All';
			st.maker = freshMaker('heal');
			st.importMsg = '';
			return changed();
		}
		if ((el = t.closest('[data-layout]'))) {
			if (e.detail === 2) { st.renaming = el.getAttribute('data-layout'); return render(); }
			st.cur[st.cls] = el.getAttribute('data-layout');
			st.sel = { bar: 1, i: 1 };
			st.maker = freshMaker('heal');
			return changed();
		}
		if ((el = t.closest('[data-tpl]'))) {
			var key = el.getAttribute('data-tpl'), m = st.maker;
			if (m.tpl === key) return;
			var keep = { scope: m.scope, editing: m.editing, name: m.name, icon: m.icon, iconTyped: m.iconTyped };
			st.maker = freshMaker(key);
			st.maker.scope = keep.scope;
			// 0.5.5: a macro being changed stays the one being changed (its name, and an icon dropped on it) in another template
			if (keep.editing) { st.maker.editing = keep.editing; st.maker.name = keep.name; st.maker.icon = keep.icon; st.maker.iconTyped = keep.iconTyped; }
			return renderPage();
		}
		if ((el = t.closest('[data-mark]'))) {
			rowChanged();
			st.maker.f.mark = +el.getAttribute('data-mark');
			return renderPage();
		}
		if ((el = t.closest('[data-tabpick]'))) {
			st.tab[st.cls] = +el.getAttribute('data-tabpick');
			return changed();
		}
		if ((el = t.closest('[data-drag="macro"]'))) return openMacro(el.getAttribute('data-key'));
		if ((el = t.closest('.k[data-drop="key"]') || (e.ctrlKey || e.altKey || e.shiftKey ? t.closest('.k[data-mkey]') : null))) {
			// 0.4.4: the layer and any modifier held while clicking (Ctrl + click T = Ctrl-T, which the browser never gives
			// a page as a key press); a Move key only so
			var ck = Lay.withMods(clickMods(e), el.getAttribute('data-key') || el.getAttribute('data-mkey'));
			// a button waiting for its key (Press a key, or Keybind mode): this is its key
			if (st.capture && st.sel) return bindSelected(ck);
			if (st.kbMode) {
				// 0.4.1: else the key is held for the next bar button clicked
				st.kbPick = st.kbPick === ck ? null : ck;
				return renderPage();
			}
			var cmd = Lay.commandOfKey(cur(), ck);
			var pl = cmd ? placeOf(cmd) : null;
			if (pl) { st.sel = pl; st.capture = false; changed(); }
			return;
		}
		if (st.move && (el = t.closest('.brow .slot[data-bar]')) && el.hasAttribute('data-drop')) {
			pick(+el.getAttribute('data-bar'), +el.getAttribute('data-i'));   // 0.6.3: Move - a click picks or unpicks
			return renderPage();
		}
		if ((el = t.closest('.slot[data-bar], .slot[data-xbar]'))) {
			var bar = el.getAttribute('data-bar');
			st.sel = { bar: bar ? +bar : el.getAttribute('data-xbar'), i: +el.getAttribute('data-i') };
			if (st.kbMode && st.kbPick) {
				Lay.bind(cur(), selCommand(), st.kbPick);
				st.kbPick = null;
				st.capture = false;
				return changed();
			}
			st.capture = !!st.kbMode;   // 0.4.1: in Keybind mode the click also waits for the key
			return changed();
		}
		if ((el = t.closest('.rstep'))) {
			var rs = t.closest('[data-step]');
			if (rs) onStep('rowrank', +rs.getAttribute('data-step'), el);
			return;
		}
		if ((el = t.closest('.sp[data-drag]')) && e.detail === 2) {
			// a double-click puts the spell in the chosen slot (at the row's chosen rank)
			if (st.sel && typeof st.sel.bar === 'number') {
				var pd = payloadOf(el), en = entryFrom(pd);
				if (en) { setSlot(slotN(st.sel.bar, st.sel.i), en); rowRankDone(pd); changed(); }
			}
			return;
		}
		var segEl = t.closest('.seg > span');
		if (segEl) return onSeg(segEl.parentNode.getAttribute('data-act'), segEl.getAttribute('data-v'), segEl.parentNode);
		var stepEl = t.closest('[data-step]');
		if (stepEl) return onStep(stepEl.parentNode.getAttribute('data-act'), +stepEl.getAttribute('data-step'), stepEl.parentNode);
		if ((el = t.closest('[data-act]'))) return onAct(el.getAttribute('data-act'), el, e);
	}
	function onSeg(act, v, el) {
		var L = cur(), m = st.maker;
		if (el.classList.contains('fixed')) return;
		if (act === 'tab') { st.tab[st.cls] = +v; return changed(); }
		if (act === 'layer') { st.layer = v; renderBand(); return renderPage(); }   // 0.4.5: every copy of the switch
		if (act === 'mon') { rowChanged(); m.f.on = v; return renderPage(); }
		if (act === 'mkind') { rowChanged(); m.f.kind = v; return renderPage(); }
		if (act === 'mslot') { rowChanged(); m.f.slot = v === 'other' ? 'other' : +v; return renderPage(); }
		if (act === 'mscope') { m.scope = v; return renderPage(); }
		return L;
	}
	function onStep(act, d, el) {
		if (el.classList.contains('off')) return;
		var L = cur();
		if (act === 'view') { st.view = st.view === 'screen' ? 'slots' : 'screen'; return changed(); }
		if (act === 'move') { st.move = !st.move; st.picked = {}; st.pickL = cur()._id; return renderPage(); }   // 0.6.3
		if (act && act.charAt(0) === 'b' && onBarStep(act, d)) return;
		if (act === 'sidemap') {
			// a quick fill: every side button sends its preset (a taught set, Your own, is left by stepping)
			var A = st.mouseAsk, o = SIDE_MAP_ORDER[A.type].map(function (x) { return x[0]; }), q = o.indexOf(A.map);
			A.map = q < 0 ? o[d > 0 ? 0 : o.length - 1] : o[(q + d + o.length) % o.length];
			A.sends = presetSends(A.type, A.map);
			delete A.teach;
			return renderAsk();
		}
		if (act === 'rowrank') {
			// the left chevron lowers the rank, the right one raises it; past the top is Highest, then round again
			var rsp = Sp.byName(CD(), el.getAttribute('data-n'));
			if (!rsp) return;
			var ch = Sp.rankChoices(rsp).concat([0]), at = ch.indexOf(rowRankOf(rsp));
			var nx = ch[(at + d + ch.length) % ch.length];
			if (nx) st.rowRank[st.cls + ':' + rsp.n] = nx; else delete st.rowRank[st.cls + ':' + rsp.n];
			return renderSpellList();
		}
		if (act === 'kffrom') {
			var kl = st.keysFile.list;
			st.keysFile.pick = (st.keysFile.pick + d + kl.length) % kl.length;
			return renderKeysFile();
		}
		if (act === 'startfrom') {
			var sl = startList();
			st.start.pick = (st.start.pick + d + sl.length) % sl.length;
			return renderStart();
		}
		if (act === 'compare' || act === 'cmprace' || act === 'cmpname') {
			stepCompare(act, d);
			return renderPage();
		}
		if (act === 'used') {
			st.used = USED[(USED.indexOf(st.used) + d + USED.length) % USED.length];
			saveUsed();
			return renderPage();
		}
		if (act === 'filter') {
			var list = Sp.schools(CD(), offeredList()), i = list.indexOf(st.filter);
			st.filter = list[(i + d + list.length) % list.length];
			return renderPage();
		}
		if (act === 'pinrank') {
			var e = selEntry(), s = e && spellOf(e.id);
			if (!s || s.general) return;
			var ranks = s.r.slice();
			var idx = 0;
			ranks.forEach(function (r, j) { if (r[0] === e.id) idx = j; });
			// past the top, or (0.5.3) left of Rank 1: Highest, i.e. Auto rank again - round both ways
			if (idx + d > ranks.length - 1 || idx + d < 0) {
				var hi = Sp.highest(s);
				e.auto = true;
				if (hi) { e.id = hi[0]; e.rank = hi[1]; }
				return changed();
			}
			var nr = ranks[Math.max(0, idx + d)];
			e.id = nr[0];
			e.rank = nr[1];
			return changed();
		}
		if (act === 'mrank' || act === 'mrank2') {   // 0.6.0: mrank2, the Or's
			var rf = act === 'mrank2' ? 'rank2' : 'rank';
			var items = rankItems(act === 'mrank2' ? 'spell2' : 'spell'), r = Number(st.maker.f[rf]) || 0;
			var k = 0;
			items.forEach(function (x, j) { if (x[0] === r) k = j; });
			rowChanged();
			st.maker.f[rf] = items[(k + d + items.length) % items.length][0];
			return paintMaker();
		}
	}
	function onAct(act, el, ev) {
		var L = cur(), m = st.maker, e;
		switch (act) {
			case 'keyboard': st.keys = !st.keys; return changed();
			case 'kbmode':
				if (st.kbMode) return kbModeOff();
				st.kbMode = true; st.kbPick = null; st.capture = false;
				return changed();
			case 'keyboardoff': st.keys = false; return changed();
			case 'close': window.close(); return;
			case 'newlayout': {
				// 0.4.0: where to start from, when there is any layout to start from
				if (otherLayouts(null).length) return openStart('new');
				var nl = Lay.newLayout(st.cls, uniqueName(st.cls, 'New'));
				addLayout(nl);
				st.renaming = nl._id;
				return changed();
			}
			case 'startclose': st.start = null; return renderStart();
			case 'startbars': st.start.bars = !st.start.bars; return renderStart();
			case 'startdo': return startDo();
			case 'cmpswap': st.cmpSwap = !st.cmpSwap; return renderPage();
			case 'autodefault': L.autoRankDefault = !L.autoRankDefault; return changed();
			// 0.6.12 (Harry, Oct 20: "pressing prowl bar and moonkin bar does nothing" - the tab came in last, bar 1 stayed
			// where it was): ticked, bar 1 shows the new page at once; unticked while on it, back to Cat / Caster
			case 'prowl': case 'moonkin': {
				var ok = act === 'prowl' ? 'prowlBar' : 'moonkinBar', pg = act === 'prowl' ? 8 : 10;
				L.options[ok] = !L.options[ok];
				if (L.options[ok]) st.tab[st.cls] = pg;
				else if (st.tab[st.cls] === pg) st.tab[st.cls] = act === 'prowl' ? 7 : 1;
				return changed();
			}
			case 'auto':
				e = selEntry();
				if (!e || e.t !== 'spell') return;
				e.auto = !isAuto(e);
				if (e.auto) { var s = spellOf(e.id), h = s && !s.general ? Sp.highest(s) : null; if (h) { e.id = h[0]; e.rank = h[1]; } }
				return changed();
			case 'capture': st.capture = !st.capture; return renderPage();
			case 'clearkey': Lay.unbind(L, selCommand()); st.capture = false; return changed();
			case 'retitle':
				if (ev.detail === 2 && st.renaming !== 'title') { st.renaming = 'title'; renderPage(); }
				return;
			case 'copy': return copyExport();
			case 'import': return importText($('imp') ? $('imp').value : '');
			case 'savetpl': return saveTemplate();
			case 'backup': return backup();
			case 'opentpl': return $('file').click();
			case 'savepre': return savePresets();
			case 'keysfile': return $('keysfile').click();
			case 'kfclose': st.keysFile = null; return renderKeysFile();
			case 'kfdo': return keysFileDo();
			case 'mousepick': st.mouseAsk = askFor(mouse()); return renderAsk();
			case 'mousedone': return finishMouse();
			case 'teach': return teachStart(0);
			case 'teachback': return teachMove(-1);
			case 'teachskip': return teachMove(1);
			case 'tour': closeTourAsk(); return T && T.start(1);
			case 'tourshow': closeTourAsk(); return T && T.start(1);
			case 'tourlater': return closeTourAsk();
			case 'benabled': case 'bempty': case 'bjoined': return onBarAct(act);
			case 'mnew': st.maker = freshMaker(m.tpl); return renderPage();
			case 'mtarget': rowChanged(); m.f.target = !m.f.target; return renderPage();
			case 'mme': if (m.f.on === 'enemy' || m.f.on === 'dead') return; rowChanged(); m.f.me = !m.f.me; return renderPage();
			case 'msound': rowChanged(); m.f.sound = !m.f.sound; return renderPage();
			case 'mexact': rowChanged(); m.f.exact = !m.f.exact; return renderPage();
			case 'make': return makeMacro();
			case 'mdelete': if (m.editing) deleteMacro(m.editing); return;   // 0.6.3: as Your macros' right-click Delete
			case 'momacro': return mouseoverMacro();
			case 'keyscancel': return closeKeysAsk();
			case 'keysset': { var ka = st.keysAsk; closeKeysAsk(); if (ka) copyKeys(ka.dst, ka.src, ka.mods); return; }
		}
	}

	function onInput(e) {
		var t = e.target, m = st.maker;
		if (t.id === 'search') { st.search = t.value; return renderSpellList(); }
		var map = { 'mk-spell': 'spell', 'mk-spell2': 'spell2', 'mk-npc': 'npc', 'mk-line': 'line', 'mk-sname': 'name', 'mk-item': 'item', 'mk-body': 'body' };
		if (map[t.id]) {
			if (map[t.id] === 'spell') setMakerSpell(t.value);   // 0.6.3: a resurrection puts On at Dead
			else {
				if (map[t.id] !== 'body') rowChanged();
				m.f[map[t.id]] = t.value;
			}
			if (map[t.id] === 'spell2') m.f.rank2 = 0;
			return paintMaker();
		}
		// 0.6.3: the code box typed in - the text made (and kept with the form)
		if (t.id === 'mk-edit') { Mac.SetTyped(m.tpl, m.f, t.value); return paintMaker(); }
		if (t.id === 'mk-name') { m.name = t.value; return paintMaker(); }
	}
	function onFocusOut(e) {
		var t = e.target;
		if (t.id === 'rename' || t.id === 'retitle') {
			if (st.renaming === null) return;
			var L = st.renaming === 'title' ? cur() : null;
			if (!L) st.layouts.forEach(function (l) { if (l._id === st.renaming) L = l; });
			st.renaming = null;
			if (L) {
				var name = Lay.cleanName(t.value);
				if (name) L.name = uniqueName(L.class, name, L);
			}
			setTimeout(render, 0);
		}
	}
	function onContextMenu(e) {
		var el;
		if ((el = e.target.closest('[data-layout]'))) { e.preventDefault(); return layoutMenu(el.getAttribute('data-layout'), e.clientX, e.clientY); }
		if ((el = e.target.closest('[data-drag="macro"]'))) {
			e.preventDefault();
			var key = el.getAttribute('data-key');
			return menu(e.clientX, e.clientY, [['Edit', function () { openMacro(key); }], ['Delete', function () { deleteMacro(key); }, 'pink']]);
		}
		if (st.capture) e.preventDefault();
	}
	function onWheel(e) {
		if (st.capture) {
			e.preventDefault();
			bindSelected(Lay.chord(clickMods(e), e.deltaY < 0 ? 'MOUSEWHEELUP' : 'MOUSEWHEELDOWN'));
			return;
		}
		// the wheel over a list row's rank steps it (up: a higher rank)
		var rr = e.target.closest('.rstep');
		if (rr) { e.preventDefault(); return onStep('rowrank', e.deltaY < 0 ? 1 : -1, rr); }
		// the wheel on a number of the Screen view's panel steps it
		var sp = e.target.closest('.step[data-act^="b"]');
		if (sp && !sp.classList.contains('off')) {
			e.preventDefault();
			onStep(sp.getAttribute('data-act'), e.deltaY < 0 ? 1 : -1, sp);
		}
	}
	// 0.4.0: a Compare inset's name and rank, in the soft text, beside it while hovered
	function onTip(e) {
		var el = e.target.closest && e.target.closest('[data-tip]'), tip = $('ctip');
		// 0.6.12: an ability (data-ab) shows its tooltip - unless the pointer is on a Compare inset (its own small tip);
		// a mouse side button's hint (the slot's data-tip) goes at the tooltip's foot
		var abEl = e.target.closest && e.target.closest('[data-ab]');
		if (abEl && !(el && el.classList.contains('cmp')) && !(drag && drag.started)) {
			if (tip) tip.remove();
			showAbilityTip(abEl, e, el === abEl ? el.getAttribute('data-tip') : '');
			return;
		}
		hideAbilityTip();
		if (!el) { if (tip) tip.remove(); return; }
		if (!tip) {
			tip = document.createElement('div');
			tip.id = 'ctip';
			tip.className = 'ctip';
			document.body.appendChild(tip);
		}
		tip.textContent = el.getAttribute('data-tip');
		var r = el.getBoundingClientRect();
		tip.style.left = Math.max(4, Math.min(r.right + 6, innerWidth - tip.offsetWidth - 4)) + 'px';
		tip.style.top = Math.max(4, Math.min(r.bottom + 4, innerHeight - tip.offsetHeight - 4)) + 'px';
	}
	// the ability tooltip: shown at once, beside the pointer (never under it), kept on screen - right and below the
	// pointer, else to its left / above it
	function showAbilityTip(el, e, extra) {
		var id = +el.getAttribute('data-ab'), tip = $('atip');
		if (!tip) {
			tip = document.createElement('div');
			tip.id = 'atip';
			tip.className = 'atip';
			document.body.appendChild(tip);
		}
		if (tip.getAttribute('data-for') !== id + '|' + (extra || '')) {
			var h = abilityTipHTML(id, extra);
			if (!h) return hideAbilityTip();
			tip.innerHTML = h;
			tip.setAttribute('data-for', id + '|' + (extra || ''));
		}
		placeAbilityTip(e);
	}
	function placeAbilityTip(e) {
		var tip = $('atip');
		if (!tip) return;
		var w = tip.offsetWidth, h = tip.offsetHeight, x = e.clientX + 16, y = e.clientY + 18;
		if (x + w > innerWidth - 4) x = e.clientX - w - 12;
		if (y + h > innerHeight - 4) y = e.clientY - h - 12;
		tip.style.left = Math.max(4, x) + 'px';
		tip.style.top = Math.max(4, y) + 'px';
	}
	function hideAbilityTip() { var t = $('atip'); if (t) t.remove(); }
	function onTipMove(e) {
		if (!$('atip')) return;
		if ((drag && drag.started) || !(e.target.closest && e.target.closest('[data-ab]'))) return hideAbilityTip();
		placeAbilityTip(e);
	}
	// 0.4.1: in Keybind mode the bar button under the pointer is lit
	function onKbHover(e) {
		var on = st.kbMode && e.target.closest ? e.target.closest('.slot[data-bar], .slot[data-xbar]') : null;
		var was = document.querySelector('.slot.hov');
		if (was && was !== on) was.classList.remove('hov');
		if (on) on.classList.add('hov');
	}
	function onDrop(e) {
		var t = e.target.closest('#imp');
		if (!t) return;
		e.preventDefault();
		var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
		if (f) f.text().then(importText);
	}

	// 0.2.0: the page fills the window (no scaling): the sizes follow the room (sizeToRoom)
	var scale = 1;

	// ------------------------------------------------------------------ start
	function demo(cb) {
		// #demo: the screenshot set (tests/demo.js), never kept
		var s = document.createElement('script');
		s.src = 'tests/demo.js';
		s.onload = function () { window.HUI_DEMO(st, { Lay: Lay, Mac: Mac, Sp: Sp, D: D, uid: uid }); cb(); };
		s.onerror = cb;
		document.head.appendChild(s);
	}
	function start() {
		var isDemo = /(^|[#&])demo\b/.test(location.hash);
		if (/(^|[#&])uitest\b/.test(location.hash)) st.demo = true;   // the UI test never keeps anything
		else if (!isDemo) load();
		st.maker = freshMaker('heal');
		if (!st.demo && !isDemo) { loadMouse(); loadUsed(); }
		// the first visit asks which mouse (Harry, Oct 18: "so asking people which mouse they will use is important")
		if (!st.mouse && !isDemo) st.mouseAsk = { type: '2', map: 'native', fresh: true };
		if (!st.demo && !isDemo && !tourAsked()) st.tourAsk = 'pending';
		T = window.HUITour ? window.HUITour({ st: st, render: render, cur: cur, slots: slots, slotN: slotN, tabs: tabs, bar1Page: bar1Page,
			statesWord: statesWord, CD: CD, canLocate: canLocate, PATH: PATH, show: show, barsModel: barsModel }) : null;
		addEventListener('resize', sizeToRoom);
		document.addEventListener('dblclick', function (e) { if (e.target.closest('[data-sbar]')) screenDouble(e); });
		document.addEventListener('pointerdown', onPointerDown, true);
		document.addEventListener('pointermove', onPointerMove);
		document.addEventListener('pointerup', onPointerUp);
		document.addEventListener('click', onClick);
		document.addEventListener('keydown', onKeyDown, true);
		document.addEventListener('keyup', blockKey, true);
		document.addEventListener('keypress', blockKey, true);
		document.addEventListener('input', onInput);
		document.addEventListener('focusout', onFocusOut);
		document.addEventListener('contextmenu', onContextMenu);
		document.addEventListener('wheel', onWheel, { passive: false });
		document.addEventListener('mouseover', onTip);
		document.addEventListener('mousemove', onTipMove);   // 0.6.12: the ability tooltip follows the pointer
		document.addEventListener('mouseover', onKbHover);
		document.addEventListener('dragstart', function (e) { e.preventDefault(); });   // our own drags only
		document.addEventListener('dragover', function (e) { if (e.target.closest('#imp')) e.preventDefault(); });
		document.addEventListener('drop', onDrop);
		['mousedown', 'mouseup', 'auxclick'].forEach(function (k) { document.addEventListener(k, blockMouse, true); });
		$('file').addEventListener('change', function () {
			// a race and class file (0.6.6: several picked at once, read as one), a Presets.lua / Layouts.lua, or a saved string
			var fs = Array.prototype.slice.call(this.files || []);
			if (fs.length) Promise.all(fs.map(function (f) { return f.text(); })).then(function (ts) {
				ts = ts.filter(function (t) { return String(t).trim(); });
				if (ts.length > 1 && ts.every(function (t) { return /HUIPresets_Add\s*\(|HUIPRESETS\s*=/.test(t); })) return importText(ts.join('\n'));
				ts.forEach(importText);
			});
			this.value = '';
		});
		$('keysfile').addEventListener('change', function () {
			var f = this.files && this.files[0];
			if (f) f.text().then(keysFromText);
			this.value = '';
		});
		if (isDemo) demo(function () {
			render();
			// #demo&startfrom=1: the Start from panel on the demo's shaman (the screenshot)
			if (st.start) { if (st.start.pickId) st.start.pick = Math.max(0, startList().indexOf(layoutById(st.start.pickId))); renderStart(); }
			// #demo&tour=N: the tutorial open at step N (the screenshots)
			var tm = /tour=(\d+)/.exec(location.hash);
			if (tm && T) T.start(+tm[1]);
			if (/tourask=1/.test(location.hash)) showTourAsk();
			// 0.5.5: #demo&editmacro=m2 - that macro open in the maker (Save)
			var em = /editmacro=(m\d+)/.exec(location.hash);
			if (em) openMacro(em[1]);
			// 0.5.1: #demo&barmenu=2 - bar 2's menu open at Modify > Shift (&keysask=1: the quiet ask after Bar 1)
			var bm = /barmenu=(\d)/.exec(location.hash), bml = bm && document.querySelector('.bl[data-barmenu="' + bm[1] + '"]');
			if (bml) {
				if (/keysask=1/.test(location.hash)) askCopyKeys(+bm[1], 1, MODS[0]);
				else {
					barMenu(+bm[1], bml);
					var mo = document.querySelector('#menu [data-more="Modify"]');
					if (mo) mo.click();
					var sh = document.querySelector('#menu [data-more="Shift"]');
					if (sh) sh.click();
				}
			}
			// #demo&saved=1: Save into the in-memory folder of the tests, HUIPresets installed (the screenshot of the foot)
			if (st.demoSave) {
				var fx = document.createElement('script');
				fx.src = 'tests/fakefs.js';
				fx.onload = function () {
					var tree = window.HUIFakeFS.sampleTree();
					tree._classic_beta_.Interface.AddOns.HUIPresets = {};
					var f = window.HUIFakeFS.fakeFolder(tree);
					window.showDirectoryPicker = function () { return Promise.resolve(f); };
					savePresets();
				};
				document.head.appendChild(fx);
			}
		});
		else {
			render();
			if (st.tourAsk === 'pending' && !st.mouseAsk) showTourAsk();
		}
		// a handle for tests/ui.js (#uitest: the page driven by synthetic clicks, drags and keys)
		window.HUIEditor = { importText: importText, backupText: backupText, st: st, cur: cur, render: render, slotN: slotN, refreshExport: refreshExport, barsModel: barsModel,
			tour: T, showTourAsk: showTourAsk, renderStart: renderStart };
		if (/(^|[#&])uitest\b/.test(location.hash)) {
			var u = document.createElement('script');
			u.src = 'tests/ui.js';
			document.head.appendChild(u);
		}
	}
	start();
})();
