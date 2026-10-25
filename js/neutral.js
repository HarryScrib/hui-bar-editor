// HUI Bar Editor 0.4.0: the class-neutral slots one layout can give another, and the same place in another layout.
//
// Harry, Oct 18: "if the user saves a shaman template, for example, and then makes a warrior build - they should be given
// the option to keep consumables/mount/neutrals etc in the same slots". Neutral: the Utility kinds (an equipped slot, a
// best-carried family, Mount up), items (the Hearthstone, engineering and the rest), General (Attack, and Shoot / Throw
// when the new class has it), professions and mounts (0.6.4), account macros; a racial only when both layouts are the same race. Not: class spells,
// another race's racials, character macros. Each goes to the same button (targets()), and the keys bound to it come too.
//
// Harry, Oct 18: "being able to press a button to 'view from' a different set of keybinds could be really good":
// placeIn() finds the same button in another layout (a druid's form tab to the same tab where both have it).
(function (root) {
	'use strict';

	var node = typeof module !== 'undefined' && module.exports;
	var Lay = node ? require('./layout.js') : root.HUILayout;

	function copy(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }

	// the pages a layout shows: bar 1's (its form tabs, or page 1) and bars 2-8's
	function pages(L) {
		var t = Lay.formTabs(L.class, L.options), out = {};
		(t.length ? t.map(function (x) { return x[1]; }) : [1]).forEach(function (p) { out[p] = 1; });
		Lay.BAR_PAGES.slice(1).forEach(function (p) { out[p] = 1; });
		return out;
	}
	// a slot number -> its button's binding command in that layout (bar 1's for its form pages)
	function commandOf(L, n) {
		var pl = Lay.slotPlace(n), b = Lay.BAR_PAGES.indexOf(pl.page);
		return Lay.command(b > 0 ? b + 1 : 1, pl.i);
	}
	// Mount up for a layout. 0.6.4 (Harry, Oct 19: "how is it going to know which mount the player is using? ... it needs to
	// also know all of the mount names - including the sky elves"): every mount of Forever's (data.js "mounts") this
	// class and race can own, fastest first; among the same speed the class's own (paladin, warlock), then the race's
	// family (rc: its riding skill - the Skyborne's Galestriders), then the rest. Never an Ahn'Qiraj-only one. The game places the fastest
	// the character owns. (Without data.js mounts: the class's then the race's line, as before.)
	function mountSpells(D, L) {
		if (D.mounts && D.mounts.length) {
			var list = [];
			D.mounts.forEach(function (m, i) {
				if (m.m || (m.c && m.c.indexOf(L.class) < 0) || (m.cr && L.race && m.cr.indexOf(L.race) < 0)) return;
				var mine = m.c ? 2 : (L.race && m.rc && m.rc.indexOf(L.race) >= 0) ? 1 : 0;   // the class's, then the race's
				list.push({ s: m.s, v: m.v, mine: mine, i: i });
			});
			list.sort(function (a, b) { return b.v - a.v || b.mine - a.mine || a.i - b.i; });
			return list.map(function (x) { return x.s; });
		}
		var spells = [];
		((D.classMounts || {})[L.class] || []).forEach(function (m) { spells.push(m[0]); });
		var R = D.races && L.race ? D.races[L.race] : null;
		return R ? spells.concat(R.mounts) : spells;
	}
	// a General spell by ID, and whether a class has it
	function general(D, id) {
		for (var i = 0; i < D.general.length; i++) if (!D.general[i].item && D.general[i].r[0][0] === id) return D.general[i];
		return null;
	}
	// 0.6.4: a mount of data.js "mounts" by its spell (a mount on a button is a spell slot: every class's that can own it)
	function mount(D, id) {
		var ms = D.mounts || [];
		for (var i = 0; i < ms.length; i++) if (ms[i].s === id) return ms[i];
		return null;
	}
	// 0.6.4: a profession by any of its ranks' IDs
	function profession(D, id) {
		return (D.professions || []).some(function (p) { return p.r.some(function (r) { return r[0] === id; }); });
	}
	// a racial by any of its IDs: { race, row }
	function racial(D, id) {
		var hit = null;
		Object.keys(D.races || {}).forEach(function (k) {
			D.races[k].racials.forEach(function (r) {
				if (hit) return;
				var ids = [r.s].concat(Object.keys(r.byClass || {}).map(function (c) { return r.byClass[c]; }));
				if (ids.indexOf(id) >= 0) hit = { race: k, row: r };
			});
		});
		return hit;
	}

	// what a slot entry of src becomes in dst: a copy, or null (not neutral). Macros come back as { t: 'macro', from: m }.
	function neutralEntry(D, src, dst, e) {
		if (!e) return null;
		if (e.t === 'slot' || e.t === 'family' || e.t === 'item') return copy(e);
		if (e.t === 'mount') return { t: 'mount', items: [], spells: mountSpells(D, dst) };
		if (e.t === 'spell') {
			var g = general(D, e.id);
			if (g) return !g.only || g.only.indexOf(dst.class) >= 0 ? copy(e) : null;
			if (profession(D, e.id)) return copy(e);   // 0.6.4: a profession is every class's
			var mt = mount(D, e.id);   // 0.6.4: a mount, when the new class (and race) can own it
			if (mt) return (!mt.c || mt.c.indexOf(dst.class) >= 0) && (!mt.cr || !dst.race || mt.cr.indexOf(dst.race) >= 0) ? copy(e) : null;
			var rc = racial(D, e.id);
			if (rc && dst.race && rc.race === dst.race) {
				var id = (rc.row.byClass && rc.row.byClass[dst.class]) || rc.row.s;
				return id ? { t: 'spell', id: id, name: rc.row.n, rank: 0 } : null;
			}
			return null;
		}
		if (e.t === 'macro') {
			var m = null;
			src.macros.forEach(function (x) { if (x.key === e.key) m = x; });
			return m && m.scope !== 'character' ? { t: 'macro', from: m } : null;
		}
		return null;
	}

	// where a src slot goes in dst: bars 2-8 the same slot number; bar 1 the same button - on the same form tab where both
	// have it (a druid's Cat to a druid's Cat), and src's main bar 1 (no forms, or its first: Caster, Battle, Normal) to
	// every bar-1 page dst has (a warrior's three stances), so the button is there whatever the form
	function targets(src, dst, n) {
		var pl = Lay.slotPlace(n);
		if (Lay.BAR_PAGES.indexOf(pl.page) > 0) return [n];
		var st = Lay.formTabs(src.class, src.options), dt = Lay.formTabs(dst.class, dst.options), word = null, main = st.length ? st[0][1] : 1;
		var srcPages = st.length ? st.map(function (x) { return x[1]; }) : [1];
		if (srcPages.indexOf(pl.page) < 0) return [];               // a page src never shows
		st.forEach(function (x) { if (x[1] === pl.page) word = x[0]; });
		for (var k = 0; k < dt.length; k++) if (word && dt[k][0] === word) return [(dt[k][1] - 1) * 12 + pl.i];
		if (pl.page !== main) return [];
		return (dt.length ? dt.map(function (x) { return x[1]; }) : [1]).map(function (p) { return (p - 1) * 12 + pl.i; });
	}

	// src's neutral slots into dst, in the same places (targets). o.fill 'empty' (an existing layout): only its empty
	// places; o.bars: the Screen view's bars too. Returns { slots, keys, macros, skipped, bars, keyMap: { srcKey: dstKey } }.
	function takeNeutrals(D, dst, src, o) {
		o = o || {};
		var out = { slots: 0, keys: 0, macros: 0, skipped: 0, bars: false, keyMap: {} };
		var sl = src.specs[0].slots, dl = dst.specs[0].slots;
		Object.keys(sl).map(Number).sort(function (a, b) { return a - b; }).forEach(function (n) {
			var ne = neutralEntry(D, src, dst, sl[n]);
			if (!ne) return;
			var to = targets(src, dst, n).filter(function (m) { return !(o.fill === 'empty' && dl[m] && dl[m].t !== 'empty'); });
			if (!to.length) { out.skipped++; return; }
			if (ne.t === 'macro') {
				var m = ne.from, key = null;
				dst.macros.forEach(function (x) { if (!key && x.scope === m.scope && x.name === m.name && x.body === m.body) key = x.key; });
				if (!key) {
					// (Harry, Oct 20: "a cap of 30 macros on the character specific macro slots") no room in its set: the
					// slot is not taken
					var c = Lay.macroCounts(dst);
					if (m.scope === 'character' ? c.character >= Lay.MAX_CHARACTER : c.account >= Lay.MAX_ACCOUNT) { out.skipped++; return; }
					key = Lay.nextMacroKey(dst);
					dst.macros.push({ key: key, name: m.name, icon: m.icon, body: m.body, scope: m.scope });
					out.macros++;
				}
				out.keyMap[m.key] = key;
				ne = { t: 'macro', key: key };
			}
			to.forEach(function (m) { dl[m] = copy(ne); });
			out.slots++;
			var cmd = commandOf(dst, to[0]), keys = (src.specs[0].keys[commandOf(src, n)] || []).slice();
			keys.forEach(function (k) {
				if ((dst.specs[0].keys[cmd] || []).indexOf(k) >= 0) return;
				Lay.bind(dst, cmd, k);
				out.keys++;
			});
		});
		if (o.bars && (src.bars || src.barsIn)) {
			dst.bars = copy(src.bars);
			dst.barsIn = copy(src.barsIn);
			dst.barsChanged = !!src.barsChanged;
			out.bars = true;
		}
		return out;
	}

	// the same button in another layout: { bar, i } -> its slot number there (bar 1 by its form tab: the same tab where
	// both have it - a druid's Cat to a druid's Cat - else that layout's first, its caster / normal bar)
	function placeIn(L, O, bar, i, page) {
		if (bar !== 1) return Lay.slotNumber(bar, i, 1);
		var mine = Lay.formTabs(L.class, L.options), theirs = Lay.formTabs(O.class, O.options), word = null, p = null;
		mine.forEach(function (t) { if (t[1] === page) word = t[0]; });
		theirs.forEach(function (t) { if (word && t[0] === word) p = t[1]; });
		if (p === null) p = theirs.length ? theirs[0][1] : 1;
		return Lay.slotNumber(1, i, p);
	}

	// 0.6.4 (Harry, Oct 19: "we will need to have 'load keybinds from file' which would open up the lua of a file and extract
	// just the keybind settings - ie the mapping, that way they don't need to re-map when they make a new class"): src's
	// whole key mapping (command -> keys: the keys follow the button places) into dst; dst's buttons, macros and bars are
	// not touched. Bars 1-8 take src's exactly (bar 1's keys are its form pages' too). The stance and pet bars, and the
	// extra button, take src's when src binds any key there; else dst keeps its own, less any key src binds elsewhere (a
	// priest's file leaves a warrior's stance keys). Returns the number of keys dst has now.
	function keyGroup(cmd) {
		var m = /^(SHAPESHIFTBUTTON|BONUSACTIONBUTTON|EXTRAACTIONBUTTON)\d+$/.exec(cmd);
		return m ? m[1] : 'BARS';
	}
	function takeKeys(dst, src) {
		var sk = src.specs[0].keys, dk = dst.specs[0].keys, out = {}, used = {}, srcHas = {}, n = 0;
		Object.keys(sk).forEach(function (cmd) {
			if (keyGroup(cmd) === 'SHAPESHIFTBUTTON' && !Lay.hasStanceBar(dst.class)) return;   // 0.6.11: a shaman takes no stance keys
			out[cmd] = (sk[cmd] || []).slice();
			out[cmd].forEach(function (k) { used[k] = true; });
			if (out[cmd].length) srcHas[keyGroup(cmd)] = true;
		});
		Object.keys(dk).forEach(function (cmd) {
			var g = keyGroup(cmd);
			if (g === 'BARS' || srcHas[g] || out[cmd]) return;
			var keep = (dk[cmd] || []).filter(function (k) { return !used[k]; });
			if (keep.length) out[cmd] = keep;
		});
		dst.specs[0].keys = out;
		Object.keys(out).forEach(function (cmd) { n += out[cmd].length; });
		return n;
	}

	var api = { pages: pages, targets: targets, commandOf: commandOf, mountSpells: mountSpells, neutralEntry: neutralEntry, takeNeutrals: takeNeutrals,
		placeIn: placeIn, takeKeys: takeKeys, mount: mount };
	if (node) module.exports = api;
	else root.HUINeutral = api;
})(this);
