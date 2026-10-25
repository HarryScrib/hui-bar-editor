// HUI Bar Editor: the WoW folder. Harry, Oct 18: "the other save should be to 'pick a character that we have in our wow
// folder -> ie locate it'"; Oct 19: "do we need to 'Send' in that case. surely we just save it as a 'human priest' layout,
// and the addon should recognise that and load it itself" - Save writes the preset into HUIPresets' Presets.lua, no
// character picked.
//
// Works on directory handles of the File System Access API (Edge / Chrome's showDirectoryPicker) - or anything with the
// same few calls (tests/fakefs.js: a folder tree in memory): handle.kind / .name, dir.values() (async), dir.
// getDirectoryHandle(name, { create }), dir.getFileHandle(name, { create }), file.getFile() -> { text() },
// file.createWritable() -> { write(text), close() }.
//
// READS: _classic_beta_\WTF\Account\<account>\<realm>\<character>\ (the characters; each one's class from what HUI Bars
// saved, SavedVariables\ForeverBars.lua: ForeverBarsCharDB = { ["class"] = "PRIEST", ... }), and the account's and a
// character's macros-cache.txt (read-only helpers, unused by the page since Send went). WRITES only
// _classic_beta_\Interface\AddOns\HUIPresets\Presets.lua, and only when HUIPresets is installed (the folder is never
// made); never anything in WTF.
(function (root) {
	'use strict';

	// (0.6.15; Harry, Oct 21: the beta over, the stress test in _forever_) the game's folders for Forever, the newest first:
	// a WoW folder holding both is the stress test's
	var FLAVOURS = ['_forever_', '_classic_beta_'];
	var CLASSES = ['WARRIOR', 'PALADIN', 'HUNTER', 'ROGUE', 'PRIEST', 'SHAMAN', 'MAGE', 'WARLOCK', 'DRUID'];

	function dirOf(h, name) { return h.getDirectoryHandle(name).catch(function () { return null; }); }
	function fileOf(h, name) { return h.getFileHandle(name).catch(function () { return null; }); }
	async function list(h, kind) {
		var out = [];
		for await (var e of h.values()) if (!kind || e.kind === kind) out.push(e);
		out.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
		return out;
	}
	// a file's text along a path of names, or null
	async function readText(h, parts) {
		for (var i = 0; i < parts.length - 1; i++) {
			h = await dirOf(h, parts[i]);
			if (!h) return null;
		}
		var f = await fileOf(h, parts[parts.length - 1]);
		if (!f) return null;
		try { return await (await f.getFile()).text(); } catch (e) { return null; }
	}

	// the folder picked: the game's own (holding _forever_ or _classic_beta_), one of those itself, or null when it is neither
	async function flavourOf(h) {
		if (!h) return null;
		for (var i = 0; i < FLAVOURS.length; i++) {
			var f = await dirOf(h, FLAVOURS[i]);
			if (f) return f;
		}
		if ((await dirOf(h, 'WTF')) && (await dirOf(h, 'Interface'))) return h;
		return null;
	}

	// ForeverBarsCharDB's class, as the game writes saved variables (["class"] = "PRIEST")
	function parseClass(text) {
		if (typeof text !== 'string') return null;
		var m = /\[\s*"class"\s*\]\s*=\s*"([A-Z]+)"/.exec(text) || /\bclass\s*=\s*"([A-Z]+)"/.exec(text);
		return m && CLASSES.indexOf(m[1]) >= 0 ? m[1] : null;
	}
	// macros-cache.txt: MACRO <id> "<name>" <icon> / the body lines / END
	function parseMacros(text) {
		var out = [], cur = null;
		String(text || '').split(/\r?\n/).forEach(function (line) {
			var m = /^MACRO\s+\S+\s+"(.*)"\s+(\S+)\s*$/.exec(line);
			if (m) { cur = { name: m[1], icon: m[2], lines: [] }; return; }
			if (!cur) return;
			if (/^END\s*$/.test(line)) { out.push({ name: cur.name, icon: cur.icon, body: cur.lines.join('\n') }); cur = null; return; }
			cur.lines.push(line);
		});
		return out;
	}

	// every character: { account, realm, name, key: "<realm>/<name>", cls (saved by HUI, or null) }
	async function characters(flavour) {
		var acc = await dirOf(flavour, 'WTF');
		acc = acc && await dirOf(acc, 'Account');
		if (!acc) return [];
		var out = [];
		for (var a of await list(acc, 'directory')) {
			if (a.name === 'SavedVariables') continue;
			for (var r of await list(a, 'directory')) {
				if (r.name === 'SavedVariables') continue;
				for (var c of await list(r, 'directory')) {
					var text = await readText(c, ['SavedVariables', 'ForeverBars.lua']);
					out.push({ account: a.name, realm: r.name, name: c.name, key: r.name + '/' + c.name, cls: parseClass(text) });
				}
			}
		}
		return out;
	}
	// the macros already there for a character: { account: [...], character: [...] } (empty when the game wrote none)
	async function macros(flavour, ch) {
		var base = ['WTF', 'Account', ch.account];
		var a = await readText(flavour, base.concat(['macros-cache.txt']));
		var c = await readText(flavour, base.concat([ch.realm, ch.name, 'macros-cache.txt']));
		return { account: parseMacros(a), character: parseMacros(c) };
	}
	// how a layout's macros meet those: the same name and body is there already (the game uses it, never makes it twice)
	function macroSummary(layoutMacros, there) {
		var n = { there: 0, fresh: 0 };
		layoutMacros.forEach(function (m) {
			var pool = m.scope === 'character' ? there.character : there.account;
			if (pool.some(function (x) { return x.name === m.name && x.body.replace(/\s+$/, '') === m.body.replace(/\s+$/, ''); })) n.there++;
			else n.fresh++;
		});
		return n;
	}

	async function writeFile(h, name, text) {
		var f = await h.getFileHandle(name, { create: true });
		var w = await f.createWritable();
		await w.write(text);
		await w.close();
	}
	// Interface\AddOns\HUIPresets: the addon's folder, or null when it is not installed (never made here: its .toc and
	// code ship with HUI; the editor writes only Presets.lua in it)
	async function presetsDir(flavour) {
		var d = flavour;
		for (var p of ['Interface', 'AddOns', 'HUIPresets']) {
			d = await dirOf(d, p);
			if (!d) return null;
		}
		return d;
	}
	// { installed, text }: text null when HUIPresets has no Presets.lua yet
	async function readPresets(flavour) {
		var d = await presetsDir(flavour);
		if (!d) return { installed: false, text: null };
		return { installed: true, text: await readText(d, ['Presets.lua']) };
	}
	async function writePresets(flavour, text) {
		var d = await presetsDir(flavour);
		if (!d) throw new Error('HUIPresets not installed');
		await writeFile(d, 'Presets.lua', text);
	}

	var api = { FLAVOUR: FLAVOURS[0], FLAVOURS: FLAVOURS, flavourOf: flavourOf, parseClass: parseClass, parseMacros: parseMacros, characters: characters,
		macros: macros, macroSummary: macroSummary, readPresets: readPresets, writePresets: writePresets, readText: readText };
	if (typeof module !== 'undefined' && module.exports) module.exports = api;
	else root.HUIWow = api;
})(this);
