// HUI Bar Editor: a layout (dev/docs/actionbars/LAYOUT-FORMAT.md v1) - the editor's own shape, its conversion to and from the
// format's Lua table, the game's slot numbers per bar / page / form, the binding commands and keys.
//
// The editor's layout:
//   { v: 1, name, class, race, firstLogin, autoRankDefault, options: { prowlBar, moonkinBar }, settings: { autoLoot: true, ... },
//     macros: [ { key, name, icon, body, scope } ],
//     specs: [ { slots: { <slot>: { t: 'spell', id, name, rank, auto? } | { t: 'macro', key } | { t: 'item', id }
//                                  | { t: 'slot', slot } | { t: 'family', id, items } | { t: 'mount', items, spells }
//                                  | { t: 'empty' } },
//                keys: { <COMMAND>: [ 'SHIFT-1', ... ] } } ],
//     bars (the Screen view's, js/bars.js) / barsIn (as read) / barsChanged, spec2 (the reserved second spec, as read) }
(function (root) {
	'use strict';

	var VERSION = 1;
	var HB = typeof module !== 'undefined' && module.exports ? require('./bars.js') : root.HUIBars;
	var CLASSES = ['WARRIOR', 'PALADIN', 'HUNTER', 'ROGUE', 'PRIEST', 'SHAMAN', 'MAGE', 'WARLOCK', 'DRUID'];
	// HUI Bars' bar N -> the game's action page (HUI/ForeverBars/Buttons.lua PAGES) and binding command
	var BAR_PAGES = [1, 6, 5, 3, 4, 13, 14, 15];
	var BAR_COMMANDS = ['ACTIONBUTTON', 'MULTIACTIONBAR1BUTTON', 'MULTIACTIONBAR2BUTTON', 'MULTIACTIONBAR3BUTTON',
		'MULTIACTIONBAR4BUTTON', 'MULTIACTIONBAR5BUTTON', 'MULTIACTIONBAR6BUTTON', 'MULTIACTIONBAR7BUTTON'];
	var STANCE_COMMAND = 'SHAPESHIFTBUTTON', PET_COMMAND = 'BONUSACTIONBUTTON';
	var MAX_SLOT = 180, MAX_ACCOUNT = 120, MAX_CHARACTER = 30, NAME_LETTERS = 24;
	var DEFAULT_BAR1_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

	// Bar 1's form states: [word, page] (LAYOUT-FORMAT "Bar pages")
	function formTabs(cls, options) {
		options = options || {};
		if (cls === 'DRUID') {
			// 0.6.12 (Harry, Oct 20: "on the website pressing prowl bar and moonkin bar does nothing"): Prowl right after Cat
			var t = [['Caster', 1], ['Cat', 7]];
			if (options.prowlBar) t.push(['Prowl', 8]);
			t.push(['Bear', 9]);
			if (options.moonkinBar) t.push(['Moonkin', 10]);
			return t;
		}
		if (cls === 'WARRIOR') return [['Battle', 7], ['Defensive', 8], ['Berserker', 9]];
		if (cls === 'ROGUE') return [['Normal', 1], ['Stealth', 7]];
		return [];
	}
	// 0.6.11 (Harry, Oct 20: "shaman stance doesn't have a ghost wolf"): on Forever the shaman has no stance bar - no
	// Stance row, and a shaman layout's stance keys (SHAPESHIFTBUTTON) are dropped on read
	function hasStanceBar(cls) { return cls !== 'SHAMAN'; }
	function defaultPage(cls) {
		var t = formTabs(cls);
		return t.length ? t[0][1] : 1;
	}
	// bar 1..8, button 1..12; bar 1's page is the form tab's (1 when none)
	function barPage(bar, bar1Page) { return bar === 1 ? (bar1Page || 1) : BAR_PAGES[bar - 1]; }
	function slotNumber(bar, i, bar1Page) { return (barPage(bar, bar1Page) - 1) * 12 + i; }
	// slot -> { page, i } (which bar shows it depends on the page)
	function slotPlace(slot) { return { page: Math.floor((slot - 1) / 12) + 1, i: ((slot - 1) % 12) + 1 }; }
	function command(bar, i) {
		if (bar === 'stance') return STANCE_COMMAND + i;
		if (bar === 'pet') return PET_COMMAND + i;
		return BAR_COMMANDS[bar - 1] + i;
	}

	// ------------------------------------------------------------------ keys
	// the game's chord: ALT-CTRL-SHIFT- in that order (BindingUtil), then the key
	function chord(mods, key) {
		return (mods.alt ? 'ALT-' : '') + (mods.ctrl ? 'CTRL-' : '') + (mods.shift ? 'SHIFT-' : '') + key;
	}
	function splitChord(k) {
		var mods = { alt: false, ctrl: false, shift: false }, rest = k;
		for (;;) {
			var m = /^(ALT|CTRL|SHIFT|META)-(.+)$/.exec(rest);
			if (!m) break;
			mods[m[1].toLowerCase()] = true;
			rest = m[2];
		}
		return { mods: mods, key: rest };
	}
	// 0.4.4: a chord with more modifiers held (the layer, or Ctrl held while a key is clicked), kept in the game's
	// ALT-CTRL-SHIFT order: withMods({ shift: true }, 'CTRL-NUMPAD1') = 'CTRL-SHIFT-NUMPAD1'
	function withMods(mods, k) {
		var s = splitChord(k);
		mods = mods || {};
		return chord({ alt: s.mods.alt || !!mods.alt, ctrl: s.mods.ctrl || !!mods.ctrl, shift: s.mods.shift || !!mods.shift }, s.key);
	}
	// 0.4.4 (Harry, Oct 18: "people who have mouse keybinds have like icue or whatever and have mouse inputs for those"):
	// the mouse side button a chord is pressed with. sends[i] is what side button i sends (its software's key, e.g.
	// 'CTRL-NUMPAD1'); a chord is that button's when it is the same key with at least the button's own modifiers (the rest
	// held on the keyboard). -> { i, extra: { alt, ctrl, shift } } (the button that sends the most of them), or null
	function sideOf(sends, k) {
		if (!sends || typeof k !== 'string' || !k) return null;
		var c = splitChord(k), best = null;
		sends.forEach(function (x, i) {
			if (typeof x !== 'string' || !x) return;
			var s = splitChord(x);
			if (s.key !== c.key || (s.mods.alt && !c.mods.alt) || (s.mods.ctrl && !c.mods.ctrl) || (s.mods.shift && !c.mods.shift)) return;
			var own = (s.mods.alt ? 1 : 0) + (s.mods.ctrl ? 1 : 0) + (s.mods.shift ? 1 : 0);
			if (best && own <= best.own) return;
			best = { i: i, own: own, extra: { alt: c.mods.alt && !s.mods.alt, ctrl: c.mods.ctrl && !s.mods.ctrl, shift: c.mods.shift && !s.mods.shift } };
		});
		return best ? { i: best.i, extra: best.extra } : null;
	}
	// a chord in words for hover text: 'CTRL-NUMPAD1' -> 'Ctrl-Numpad1', 'SHIFT-BUTTON12' -> 'Shift-Button12'
	var KEY_NAMES = { NUMPADPLUS: 'Numpad+', NUMPADMINUS: 'Numpad-', NUMPADMULTIPLY: 'Numpad*', NUMPADDIVIDE: 'Numpad/',
		NUMPADDECIMAL: 'Numpad.', MOUSEWHEELUP: 'Wheel up', MOUSEWHEELDOWN: 'Wheel down', PAGEUP: 'Page Up', PAGEDOWN: 'Page Down',
		CAPSLOCK: 'Caps Lock', NUMLOCK: 'Num Lock', PRINTSCREEN: 'Print Screen' };
	function chordWords(k) {
		var s = splitChord(k), key = s.key, word = KEY_NAMES[key], m;
		if (!word && (m = /^NUMPAD(\d)$/.exec(key))) word = 'Numpad' + m[1];
		if (!word && (m = /^BUTTON(\d+)$/.exec(key))) word = 'Button' + m[1];
		if (!word) word = key.length > 1 ? key.charAt(0) + key.slice(1).toLowerCase() : key;
		if (/^F\d+$/.test(key)) word = key;
		return (s.mods.alt ? 'Alt-' : '') + (s.mods.ctrl ? 'Ctrl-' : '') + (s.mods.shift ? 'Shift-' : '') + word;
	}
	// the binding commands a layout may set: exactly what HUI Bars routes (LayoutCodec.lua C.IsCommand)
	function isCommand(cmd) {
		var m;
		if (typeof cmd !== 'string') return false;
		if ((m = /^ACTIONBUTTON(\d+)$/.exec(cmd))) return +m[1] >= 1 && +m[1] <= 12;
		if ((m = /^MULTIACTIONBAR(\d)BUTTON(\d+)$/.exec(cmd))) return +m[1] >= 1 && +m[1] <= 7 && +m[2] >= 1 && +m[2] <= 12;
		if ((m = /^(SHAPESHIFTBUTTON|BONUSACTIONBUTTON)(\d+)$/.exec(cmd))) return +m[2] >= 1 && +m[2] <= 10;
		return cmd === 'EXTRAACTIONBUTTON1';
	}
	// HUI Bars' hotkey text (Bindings.lua Abbreviate)
	var KEY_WORDS = {
		MOUSEWHEELUP: 'WU', MOUSEWHEELDOWN: 'WD', BUTTON3: 'M3', BUTTON4: 'M4', BUTTON5: 'M5',
		MIDDLEMOUSE: 'M3', SPACE: 'Sp', ESCAPE: 'Esc', BACKSPACE: 'Bs', TAB: 'Tab', ENTER: 'Ent',
		CAPSLOCK: 'Cap', DELETE: 'Del', INSERT: 'Ins', HOME: 'Hm', END: 'End', PAGEUP: 'PU', PAGEDOWN: 'PD',
		UP: 'Up', DOWN: 'Dn', LEFT: 'Lt', RIGHT: 'Rt', NUMLOCK: 'NL', PRINTSCREEN: 'PS',
		NUMPADPLUS: 'N+', NUMPADMINUS: 'N-', NUMPADMULTIPLY: 'N*', NUMPADDIVIDE: 'N/', NUMPADDECIMAL: 'N.',
	};
	function abbreviate(key) {
		if (typeof key !== 'string' || key === '') return '';
		var mods = '', rest = key;
		for (;;) {
			var m = /^([A-Z]+)-(.+)$/.exec(rest);
			if (!m || !(m[1] === 'ALT' || m[1] === 'CTRL' || m[1] === 'SHIFT' || m[1] === 'META')) break;
			mods += m[1] === 'ALT' ? 'A' : m[1] === 'CTRL' ? 'C' : m[1] === 'SHIFT' ? 'S' : 'M';
			rest = m[2];
		}
		var word = KEY_WORDS[rest];
		if (!word) { var n = /^NUMPAD(\d)$/.exec(rest); if (n) word = 'N' + n[1]; }
		if (!word) { var b = /^BUTTON(\d+)$/.exec(rest); if (b) word = 'M' + b[1]; }
		return mods + (word || rest);
	}
	// a browser key event's code -> the game's key name (null: not a key the game binds, or a modifier alone)
	var CODE_KEYS = {
		Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
		Quote: "'", Comma: ',', Period: '.', Slash: '/', Space: 'SPACE', Tab: 'TAB', Enter: 'ENTER',
		Backspace: 'BACKSPACE', Delete: 'DELETE', Insert: 'INSERT', Home: 'HOME', End: 'END', PageUp: 'PAGEUP',
		PageDown: 'PAGEDOWN', ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
		CapsLock: 'CAPSLOCK', Escape: 'ESCAPE', NumLock: 'NUMLOCK', PrintScreen: 'PRINTSCREEN',
		NumpadAdd: 'NUMPADPLUS', NumpadSubtract: 'NUMPADMINUS', NumpadMultiply: 'NUMPADMULTIPLY',
		NumpadDivide: 'NUMPADDIVIDE', NumpadDecimal: 'NUMPADDECIMAL', NumpadEnter: 'ENTER', IntlBackslash: '\\',
	};
	function keyFromCode(code) {
		if (!code) return null;
		if (CODE_KEYS[code]) return CODE_KEYS[code];
		var m = /^Key([A-Z])$/.exec(code) || /^Digit([0-9])$/.exec(code);
		if (m) return m[1];
		m = /^F([0-9]{1,2})$/.exec(code);
		if (m) return 'F' + m[1];
		m = /^Numpad([0-9])$/.exec(code);
		if (m) return 'NUMPAD' + m[1];
		return null;
	}
	// a mouse button (MouseEvent.button) -> the game's key: middle 3, back 4, forward 5
	function keyFromMouse(button) { return ({ 1: 'BUTTON3', 3: 'BUTTON4', 4: 'BUTTON5' })[button] || null; }

	// ------------------------------------------------------------------ the layout's game settings
	// Harry, Oct 19: "we can also give it some other stuff like automatically turn on auto loot if disabled, automatically
	// turn on dps meter if disabled, etc": settings = { autoLoot = true, ... } - only true is ever written, a key left out
	// leaves that game setting alone (nothing is ever turned off). Exactly the keys HUI's codec keeps (dev/kit/LayoutCodec.lua);
	// any other is dropped. actionBars: the game's own bars 2-8 the preset uses (never under another bar addon).
	// (Harry, Oct 19: "remove cooldown numbers, target's target, mouse loot, self cast, key down, all bars. i never asked
	// for those") only the two he named
	var SETTINGS = [['autoLoot', 'Auto loot'], ['damageMeter', 'Damage meter']];
	// the known keys that are true, or null when none is
	function settingsOf(o) {
		if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
		var out = null;
		SETTINGS.forEach(function (s) { if (o[s[0]] === true) (out = out || {})[s[0]] = true; });
		return out;
	}

	// ------------------------------------------------------------------ the layout
	// planned at level 60 (LAYOUT-FORMAT "Ranks and levels"): a layout has no level
	function newLayout(cls, name) {
		var keys = {};
		DEFAULT_BAR1_KEYS.forEach(function (k, i) { keys['ACTIONBUTTON' + (i + 1)] = [k]; });
		return {
			v: VERSION, name: cleanName(name) || 'Main', class: cls, firstLogin: false,
			autoRankDefault: true, options: { prowlBar: false, moonkinBar: false }, settings: {}, macros: [],
			specs: [{ slots: {}, keys: keys }],
		};
	}
	function cleanName(s) {
		s = String(s || '').replace(/^\s+|\s+$/g, '');
		var chars = Array.from(s);
		return chars.length > NAME_LETTERS ? chars.slice(0, NAME_LETTERS).join('') : s;
	}

	// the layout as the format's Lua table (a value for HUISerialise.write)
	function toLua(L) {
		var spec = L.specs[0] || { slots: {}, keys: {} };
		var slots = {};
		Object.keys(spec.slots).map(Number).sort(function (a, b) { return a - b; }).forEach(function (n) {
			var e = spec.slots[n];
			if (!e) return;
			var v;
			if (e.t === 'spell') {
				v = { 1: 'spell', 2: e.id };
				if (e.name) v.name = e.name;
				if (e.rank) v.rank = e.rank;
				if (typeof e.auto === 'boolean') v.auto = e.auto;   // none: the layout's autoRankDefault
			} else if (e.t === 'macro') {
				v = ['macro', e.key];
			} else if (e.t === 'item') {
				v = ['item', e.id];
			} else if (e.t === 'slot') {
				v = ['slot', e.slot];                       // LAYOUT-FORMAT "Utility buttons"
			} else if (e.t === 'family') {
				v = { 1: 'family', 2: e.id, items: (e.items || []).slice() };
			} else if (e.t === 'mount') {
				v = { 1: 'mount' };
				if (e.items && e.items.length) v.items = e.items.slice();
				if (e.spells && e.spells.length) v.spells = e.spells.slice();
			} else {
				v = ['empty'];
			}
			slots[String(n)] = v;
		});
		var keys = {};
		Object.keys(spec.keys).forEach(function (cmd) {
			// an empty list is kept: it clears that command's keys on apply (dev/fixtures/README.md)
			keys[cmd] = (spec.keys[cmd] || []).filter(Boolean);
		});
		var t = {
			v: VERSION, name: L.name, class: L.class, firstLogin: !!L.firstLogin,
			autoRankDefault: !!L.autoRankDefault,
			macros: L.macros.map(function (m) {
				return { key: m.key, name: m.name, icon: m.icon || 134400, body: m.body, scope: m.scope };
			}),
			specs: [{ slots: slots, keys: keys }],
		};
		if (L.spec2 !== undefined) t.specs.push(L.spec2);   // the reserved second spec, kept as it came
		// no bars: the Screen view is for looking only (Harry, Oct 19) - nothing written here moves a bar in game
		if (typeof L.race === 'string' && L.race) t.race = L.race;   // the ChrRaces file string ("Human")
		if (L.class === 'DRUID') t.options = { prowlBar: !!(L.options && L.options.prowlBar),
			moonkinBar: !!(L.options && L.options.moonkinBar) };
		var set = settingsOf(L.settings);
		if (set) t.settings = set;
		return t;
	}

	function at(t, n) { return Array.isArray(t) ? t[n - 1] : t ? t[String(n)] : undefined; }
	function asList(t) {
		if (Array.isArray(t)) return t;
		if (!t || typeof t !== 'object') return [];
		return Object.keys(t).filter(function (k) { return /^[1-9][0-9]*$/.test(k); })
			.sort(function (a, b) { return a - b; }).map(function (k) { return t[k]; });
	}
	function numbers(t) { return asList(t).filter(function (x) { return typeof x === 'number' && x > 0; }); }
	function asMap(t) {
		if (Array.isArray(t)) {
			var m = {};
			t.forEach(function (v, i) { m[String(i + 1)] = v; });
			return m;
		}
		return t && typeof t === 'object' ? t : {};
	}

	// a format table (from a string or Layouts.lua) -> the editor's layout; throws a plain word when it is not one
	function fromLua(t) {
		if (!t || typeof t !== 'object' || Array.isArray(t)) throw new Error('Not valid');
		var v = t.v;
		if (typeof v !== 'number' || v < 1) throw new Error('Not valid');
		if (v > VERSION) throw new Error('Newer');
		if (CLASSES.indexOf(t.class) < 0) throw new Error('Not valid');
		// an older table's `level` is read past: every layout is planned at 60
		var L = newLayout(t.class, typeof t.name === 'string' ? t.name : 'Imported');
		L.firstLogin = t.firstLogin === true;
		if (typeof t.race === 'string' && /^[A-Za-z]+$/.test(t.race)) L.race = t.race;
		L.autoRankDefault = t.autoRankDefault !== false;
		var o = t.options && typeof t.options === 'object' ? t.options : {};
		L.options = { prowlBar: o.prowlBar === true, moonkinBar: o.moonkinBar === true };
		L.settings = settingsOf(t.settings) || {};
		L.macros = asList(t.macros).filter(function (m) { return m && typeof m === 'object'; }).map(function (m, i) {
			return {
				key: typeof m.key === 'string' ? m.key : 'm' + (i + 1), name: String(m.name || ''),
				icon: typeof m.icon === 'number' ? m.icon : 134400, body: String(m.body || ''),
				scope: m.scope === 'character' ? 'character' : 'account',
			};
		});
		// (Harry, Oct 20: "a cap of 30 macros on the character specific macro slots") a file with more: the ones past
		// the 30th kept as Account macros (their buttons still work; the game holds 30 per character)
		var chr = 0;
		L.macros.forEach(function (m) { if (m.scope === 'character' && ++chr > MAX_CHARACTER) m.scope = 'account'; });
		var spec = at(t.specs, 1) || {};
		var slots = {}, rawSlots = asMap(spec.slots);
		Object.keys(rawSlots).forEach(function (k) {
			var n = Number(k);
			if (!(n >= 1 && n <= MAX_SLOT && n === Math.floor(n))) return;
			var e = rawSlots[k], kind = at(e, 1);
			if (kind === 'spell' && typeof at(e, 2) === 'number') {
				slots[n] = { t: 'spell', id: at(e, 2), name: typeof e.name === 'string' ? e.name : '',
					rank: typeof e.rank === 'number' ? e.rank : 0 };
				if (typeof e.auto === 'boolean') slots[n].auto = e.auto;
			} else if (kind === 'macro' && typeof at(e, 2) === 'string') {
				slots[n] = { t: 'macro', key: at(e, 2) };
			} else if (kind === 'item' && typeof at(e, 2) === 'number') {
				slots[n] = { t: 'item', id: at(e, 2) };
			} else if (kind === 'empty') {
				slots[n] = { t: 'empty' };
			} else if (kind === 'slot' && typeof at(e, 2) === 'number' && at(e, 2) >= 1 && at(e, 2) <= 19) {
				slots[n] = { t: 'slot', slot: at(e, 2) };
			} else if (kind === 'family' && typeof at(e, 2) === 'string') {
				slots[n] = { t: 'family', id: at(e, 2), items: numbers(e.items) };
			} else if (kind === 'mount') {
				slots[n] = { t: 'mount', items: numbers(e.items), spells: numbers(e.spells) };
			}   // a kind this reader does not know: that slot is left alone (not kept)
		});
		var keys = {}, rawKeys = asMap(spec.keys), late = [];
		Object.keys(rawKeys).forEach(function (cmd) {
			if (!rawKeys[cmd] || typeof rawKeys[cmd] !== 'object') return;
			var list = asList(rawKeys[cmd]).filter(function (k) { return typeof k === 'string' && k; });
			// 0.4.4 (Harry, Oct 18: druids "will use the main bar (bar 1) for the same keybinds even though they're assigned
			// to like bar 7"): a form / stance page's button is bar 1's in game (ACTIONBUTTON1-12), so a key written for its
			// slot number (ACTIONBUTTON75, the Cat bar's button 3) is ACTIONBUTTON3's - taken after the real ones, never over them
			var n = /^ACTIONBUTTON(\d+)$/.exec(cmd);
			if (n && +n[1] > 12 && +n[1] <= MAX_SLOT) { late.push(['ACTIONBUTTON' + (((+n[1] - 1) % 12) + 1), list]); return; }
			// 0.6.10: only a bar button's command - a game command's keys (TOGGLECHARACTER0 = { "SHIFT-C" }, written by
			// 0.6.9's Game keys page, now gone) are dropped on read: the importers never touch the player's own keys
			if (!isCommand(cmd)) return;
			if (!hasStanceBar(t.class) && cmd.indexOf(STANCE_COMMAND) === 0) return;   // 0.6.11: a shaman's stance keys
			keys[cmd] = list;
		});
		late.forEach(function (x) {
			var taken = {};
			Object.keys(keys).forEach(function (c) { keys[c].forEach(function (k) { taken[k] = true; }); });
			var add = x[1].filter(function (k) { return !taken[k]; });
			if (!keys[x[0]] || !keys[x[0]].length) { if (add.length) keys[x[0]] = add.slice(0, 1); }
		});
		L.specs = [{ slots: slots, keys: keys }];
		var spec2 = at(t.specs, 2);
		if (spec2 && typeof spec2 === 'object') L.spec2 = spec2;
		// `bars`: kept as read (README's rules) until the Screen view changes them (then the editor's whole set)
		if (t.bars && typeof t.bars === 'object') { L.barsIn = HB.normalize(t.bars); L.bars = HB.fromLua(t.bars); }
		return L;
	}

	// a spell slot's Auto rank: its own, or (none written) the layout's default
	function autoOf(L, e) { return typeof e.auto === 'boolean' ? e.auto : L.autoRankDefault !== false; }

	// ------------------------------------------------------------------ keys of a layout
	function keysOf(L, cmd) { return (L.specs[0].keys[cmd] || []).slice(); }
	// the command a key is on, or null
	function commandOfKey(L, key) {
		var keys = L.specs[0].keys;
		for (var cmd in keys) if (keys[cmd].indexOf(key) >= 0) return cmd;
		return null;
	}
	// bind a key to a command: the key leaves any other command (a key does one thing), the command keeps one key
	function bind(L, cmd, key) {
		var keys = L.specs[0].keys;
		Object.keys(keys).forEach(function (c) {
			keys[c] = keys[c].filter(function (k) { return k !== key; });
			if (!keys[c].length) delete keys[c];
		});
		keys[cmd] = [key];
	}
	function unbind(L, cmd) { delete L.specs[0].keys[cmd]; }

	// ------------------------------------------------------------------ macros
	function macroCounts(L) {
		var a = 0, c = 0;
		L.macros.forEach(function (m) { if (m.scope === 'character') c++; else a++; });
		return { account: a, character: c };
	}
	function nextMacroKey(L) {
		var n = 1, used = {};
		L.macros.forEach(function (m) { used[m.key] = true; });
		while (used['m' + n]) n++;
		return 'm' + n;
	}

	var api = {
		VERSION: VERSION, CLASSES: CLASSES, BAR_PAGES: BAR_PAGES, BAR_COMMANDS: BAR_COMMANDS,
		MAX_SLOT: MAX_SLOT, MAX_ACCOUNT: MAX_ACCOUNT, MAX_CHARACTER: MAX_CHARACTER, NAME_LETTERS: NAME_LETTERS,
		formTabs: formTabs, hasStanceBar: hasStanceBar, defaultPage: defaultPage, barPage: barPage, slotNumber: slotNumber, slotPlace: slotPlace,
		command: command, chord: chord, splitChord: splitChord, abbreviate: abbreviate, keyFromCode: keyFromCode,
		withMods: withMods, sideOf: sideOf, chordWords: chordWords, isCommand: isCommand,
		keyFromMouse: keyFromMouse, newLayout: newLayout, cleanName: cleanName, toLua: toLua, fromLua: fromLua,
		keysOf: keysOf, commandOfKey: commandOfKey, bind: bind, unbind: unbind, macroCounts: macroCounts,
		nextMacroKey: nextMacroKey, autoOf: autoOf, SETTINGS: SETTINGS, settingsOf: settingsOf,
	};
	if (typeof module !== 'undefined' && module.exports) module.exports = api;
	else root.HUILayout = api;
})(this);
