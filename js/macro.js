// HUI Bar Editor: the macro maker's text, a line-for-line port of the in-game one (HUI/ForeverMenus/Macros/Data.lua:
// M.TEMPLATES, M.DefaultFields, M.SpellWord, M.Ready, M.Text, M.RowsText, M.SetTyped, M.IsRes, M.DefaultName, M.CleanName,
// M.Letters, M.TooltipLines, M.NamedBody). Same inputs ->
// the same text; tests/run.js runs Data.lua itself (fengari) against this for every template.
// Lua's truth is kept where it differs from JS's: only nil and false are false (0 and "" are true).
(function (root) {
	'use strict';

	var MAX_LETTERS = 255, NAME_LETTERS = 16, QUESTION_ID = 134400, SOUND = 8959;

	var TEMPLATES = [
		{ key: 'blank', label: 'Blank' },
		{ key: 'heal', label: 'Mouseover' },   // 0.6.1 (HUI Menus 0.19.41): 0.6.0's Either is its Or now
		{ key: 'talk', label: 'Talk to NPC' },
		{ key: 'spawn', label: 'Target a spawn' },
		{ key: 'cast', label: 'Cast helper' },
	];
	var BY_KEY = {};
	TEMPLATES.forEach(function (t) { BY_KEY[t.key] = t; });
	var KINDS = [['me', 'On me'], ['cursor', 'At cursor'], ['stop', 'Stop & cast'], ['trinket', 'Trinket']];
	var SLOTS = [[13, 'Top  13'], [14, 'Bottom  14'], ['other', 'Other item']];
	// 0.6.3 (HUI Menus 0.20.1; Harry, Oct 19: "if i want to make a resurrection macro i can't because 'nodead' is
	// engrained"): Dead - [help,dead] on the mouseover and the target, never Me
	var ON = [['friendly', 'Friendly'], ['enemy', 'Enemy'], ['dead', 'Dead']];
	// 0.6.3: the spells that raise the dead, every rank (Data.lua M.RES_SPELLS: Forever's SpellEffect, the resurrect
	// effect) - Resurrection, Redemption, Ancestral Spirit, Revive, Rebirth
	var RES_SPELLS = [2006, 2010, 10880, 10881, 20770, 7328, 10322, 10324, 20772, 20773, 2008, 20609, 20610, 20776, 20777,
		437138, 1237948, 1237949, 1237950, 1237951, 20484, 20739, 20742, 20747, 20748];
	// 0.6.1: Mouseover's Kind, in Cast helper's words
	var MO_KINDS = [['plain', 'Plain'], ['stop', 'Stop & cast'], ['trinket', 'Trinket']];
	// the fields' hints, as the in-game popup writes them (New.lua SetHint)
	var HINTS = { heal: { spell: 'Prayer of Mending', spell2: 'Power Infusion', item: 'Healthstone' }, talk: { npc: 'Defias Traitor' },
		spawn: { name: 'Mother Fang', spell: 'Shadow Word: Pain' }, cast: { item: 'Healthstone' } };

	function truthy(v) { return v !== undefined && v !== null && v !== false; }

	// Lua's %s: space, \t, \n, \v, \f, \r
	function Trim(s) {
		if (typeof s !== 'string') s = '';
		return s.replace(/^[ \t\n\v\f\r]+/, '').replace(/[ \t\n\v\f\r]+$/, '');
	}
	function Str(v) { return typeof v === 'string' ? v : null; }

	// tonumber: a number, or a string Lua reads as one; else null
	function toNumber(v) {
		if (typeof v === 'number') return v;
		if (typeof v !== 'string') return null;
		var s = Trim(v);
		if (/^-?0[xX][0-9A-Fa-f]+$/.test(s)) return parseInt(s, 16);
		if (/^-?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?$/.test(s)) return Number(s);
		return null;
	}
	function luaStr(v) { return typeof v === 'number' ? String(v) : String(v); }

	// letters, not bytes (the client counts code points)
	function Letters(text) { return typeof text === 'string' ? Array.from(text).length : 0; }

	function CleanName(text) {
		text = Str(text) || '';
		text = text.replace(/"/g, '');
		text = Trim(text);
		var chars = Array.from(text);
		if (chars.length > NAME_LETTERS) text = chars.slice(0, NAME_LETTERS).join('');
		return text;
	}

	function DefaultFields(key) {
		if (key === 'heal') return { on: 'friendly', spell: '', rank: 0, spell2: '', rank2: 0, kind: 'plain', slot: 13, item: '', target: true, me: true };
		if (key === 'blank') return { body: '' };
		if (key === 'talk') return { npc: '', line: '' };
		if (key === 'spawn') return { name: '', mark: 8, sound: true, exact: true, spell: '', rank: 1 };
		if (key === 'cast') return { kind: 'me', spell: '', rank: 0, slot: 13, item: '' };
		return {};
	}

	// 0.6.1 (Data.lua's Filled and M.FoldEither): a form's fields over its template's start, so one kept from before a field
	// was added opens with it; a form kept as Either (0.6.0) is Mouseover with its two spells (the Or), Kind Plain - the
	// same text. FoldForm(form) changes the editor's { tpl, f } in place; true when it moved one
	function Filled(key, f) {
		var out = DefaultFields(key);
		if (f && typeof f === 'object') Object.keys(f).forEach(function (k) { out[k] = f[k]; });
		return out;
	}
	function FoldForm(form) {
		if (!form || typeof form !== 'object' || form.tpl !== 'either') return false;
		form.tpl = 'heal';
		form.f = Filled('heal', form.f);
		form.f.kind = 'plain';
		return true;
	}

	function SpellWord(f) {
		var spell = Trim(f.spell);
		var rank = toNumber(f.rank);
		if (rank === null) rank = 0;
		if (spell !== '' && rank > 0) return spell + '(Rank ' + luaStr(rank) + ')';
		return spell;
	}

	// 0.6.3 (Data.lua M.IsRes): a Spell that raises the dead - nameOf(id) gives a spell's name (the editor: data.js; in
	// game the client's C_Spell.GetSpellName); idOf(name), when given, the spell a name resolves to
	function IsRes(name, nameOf, idOf) {
		var plain = Trim(name);
		name = plain.toLowerCase();
		if (name === '') return false;
		for (var i = 0; i < RES_SPELLS.length; i++) {
			var n = nameOf ? Str(nameOf(RES_SPELLS[i])) : null;
			if (n && n.toLowerCase() === name) return true;
		}
		var id = idOf ? idOf(plain) : null;
		return typeof id === 'number' && RES_SPELLS.indexOf(id) >= 0;
	}

	function Ready(key, f) {
		f = f || {};
		// 0.6.3: a text typed over the made one - ready while it holds anything
		if (key !== 'blank' && BY_KEY[key] && Str(f.typed) !== null) return Trim(f.typed) !== '';
		if ((key === 'cast' || key === 'heal') && f.kind === 'trinket' && f.slot === 'other' && Trim(f.item) === '') return false;
		if (key === 'heal') return Trim(f.spell) !== '' || Trim(f.spell2) !== '';
		if (key === 'cast') return Trim(f.spell) !== '';
		if (key === 'talk') return Trim(f.npc) !== '';
		if (key === 'spawn') return Trim(f.name) !== '';
		return true;
	}

	// 0.6.3 (HUI Menus 0.20.1; Harry, Oct 19: "something like penance i'd want to make as a mouseover macro if it's help, but
	// if it's not help then it just goes with target ... i should at least be able to edit it"): the code box takes typing
	// on every template - what is typed is the text made (f.typed, kept with the form); a row changed after writes the
	// text fresh (the maker drops f.typed). Text gives the typed text when there is one, RowsText the rows' own
	function Text(key, f) {
		f = f || {};
		if (key !== 'blank' && BY_KEY[key] && Str(f.typed) !== null) return f.typed;
		return RowsText(key, f);
	}
	// the text typed kept in f.typed; the very text the rows make is no hand edit
	function SetTyped(key, f, text) {
		text = Str(text);
		delete f.typed;
		if (text !== null && text !== RowsText(key, f)) f.typed = text;
		return f.typed === undefined ? null : f.typed;
	}

	function RowsText(key, f) {
		f = f || {};
		if (key === 'blank') return Str(f.body) || '';
		var lines = [];
		var add = function (s) { lines.push(s); };
		if (key === 'heal') {
			var enemy = f.on === 'enemy', dead = f.on === 'dead';   // 0.6.3: the dead - help and dead, never Me
			var tag = enemy ? 'harm' : 'help', life = dead ? 'dead' : 'nodead';
			var me = truthy(f.me) && !enemy && !dead;
			add('#showtooltip');   // 0.6.8: named below (TooltipLines)
			// 0.6.1: Kind - Stop & cast stops the cast first; Trinket uses its slot (or the item named) first, as Cast helper
			if (f.kind === 'stop') {
				add('/stopcasting');
			} else if (f.kind === 'trinket') {
				add('/use ' + ((f.slot === 'other') ? Trim(f.item) : ((f.slot === 14) ? 14 : 13)));
			}
			var second = { spell: f.spell2, rank: f.rank2 };
			if (Trim(f.spell) !== '' && Trim(f.spell2) !== '') {
				// 0.6.0 Either, 0.6.1 Mouseover's Or: the Spell where the spell book knows it (known: takes the bare name), else the Or
				var conds = function (known) {
					var k = known ? 'known:' + Trim(f.spell) + ',' : '';
					return '[' + k + '@mouseover,' + tag + ',' + life + ']' + (truthy(f.target) ? '[' + k + tag + ',' + life + ']' : '')
						+ (me ? '[' + k + '@player]' : '');
				};
				add('/cast ' + conds(true) + ' ' + SpellWord(f) + '; ' + conds(false) + ' ' + SpellWord(second));
			} else {
				// one spell named (the Spell, else the Or): the mouseover line for it
				var one = Trim(f.spell) !== '' ? f : second;
				add('/cast [@mouseover,' + tag + ',' + life + ']' + (truthy(f.target) ? '[@target,' + tag + ',' + life + ']' : '')
					+ (me ? '[@player]' : '') + ' ' + SpellWord(one));
			}
		} else if (key === 'talk') {
			add('/target ' + Trim(f.npc));
			var line = Trim(f.line);
			if (line !== '') add('/hui talk ' + line);
		} else if (key === 'spawn') {
			add('/cleartarget');
			add((truthy(f.exact) ? '/targetexact ' : '/target ') + Trim(f.name));
			if (typeof f.mark === 'number' && f.mark >= 1 && f.mark <= 8) add('/tm [exists,nodead] ' + luaStr(f.mark));
			if (Trim(f.spell) !== '') add('/cast [@target,harm,nodead] ' + SpellWord(f));
			if (truthy(f.sound)) add('/run if UnitExists("target") then PlaySound(' + SOUND + ') end');
		} else if (key === 'cast') {
			var spell = SpellWord(f);
			if (f.kind === 'cursor') {
				add('/cast [@cursor] ' + spell);
			} else if (f.kind === 'stop') {
				add('/stopcasting');
				add('/cast ' + spell);
			} else if (f.kind === 'trinket') {
				add('#showtooltip');   // 0.6.8: named below
				add('/use ' + ((f.slot === 'other') ? Trim(f.item) : ((f.slot === 14) ? 14 : 13)));
				add('/cast ' + spell);
			} else {
				add('/cast [@player] ' + spell);
			}
		}
		// 0.6.8: the #showtooltip line named - the fullest that keeps the text within the game's 255 letters
		if (lines[0] === '#showtooltip') {
			var tail = lines.join('\n').slice(lines[0].length), tips = TooltipLines(key, f);
			for (var i = 0; i < tips.length; i++) {
				if (i === tips.length - 1 || Letters(tips[i] + tail) <= MAX_LETTERS) { lines[0] = tips[i]; break; }
			}
		}
		return lines.join('\n');
	}

	// 0.6.8 (HUI Menus 0.20.7; Harry, Oct 19: "resurrection and penance macros both just show a question mark"): a bare
	// #showtooltip shows what the macro would cast right now - the question mark when no [conditions] hold (Resurrection
	// with no dead friend under the mouse or targeted). Named, the button is always the spell's: one spell by its cast
	// words (its rank too), the Spell + an Or by the cast line's known: rule ("#showtooltip [known:A] A; B"), Trinket with
	// no spell its slot or item. When the named line would take the text past 255 the next that fits is written (an Or's
	// line the Spell alone, then bare). Data.lua M.TooltipLines: the fullest first, the bare one last
	function UseWord(f) { return f.slot === 'other' ? Trim(f.item) : String(f.slot === 14 ? 14 : 13); }
	function TooltipLines(key, f) {
		f = f || {};
		var out = [];
		var add = function (word) { if (word !== '') out.push('#showtooltip ' + word); };
		if (key === 'heal' && Trim(f.spell) !== '' && Trim(f.spell2) !== '')
			add('[known:' + Trim(f.spell) + '] ' + SpellWord(f) + '; ' + SpellWord({ spell: f.spell2, rank: f.rank2 }));
		add(SpellWord((key === 'heal' && Trim(f.spell) === '') ? { spell: f.spell2, rank: f.rank2 } : f));
		if (out.length === 0 && f.kind === 'trinket') add(UseWord(f));
		out.push('#showtooltip');
		return out;
	}
	// 0.6.8 (Data.lua M.NamedBody): a macro made before from a form, its text never edited (no f.typed, the body the form's
	// own text with the bare line): that body with the line named, the rest kept exactly; else null. Line ends and a
	// trailing newline never count as an edit
	function Flat(s) { return s.replace(/\r\n/g, '\n').replace(/[ \t\n\v\f\r]+$/, ''); }
	function NamedBody(key, f, body) {
		body = Str(body);
		if (body === null || !f || typeof f !== 'object' || key === 'blank' || !BY_KEY[key] || Str(f.typed) !== null) return null;
		var made = RowsText(key, f), nl = made.indexOf('\n');
		var line = nl < 0 ? made : made.slice(0, nl), rest = nl < 0 ? '' : made.slice(nl);
		if (line.indexOf('#showtooltip') !== 0 || line === '#showtooltip') return null;
		if (!/^#showtooltip\r?\n/.test(body)) return null;
		if (Flat(body) !== Flat('#showtooltip' + rest)) return null;
		return line + body.slice('#showtooltip'.length);
	}

	function LastWord(s) {
		s = Trim(s);
		var m = /([^ \t\n\v\f\r]+)$/.exec(s);
		return m ? m[1] : s;
	}
	function FirstWord(s) {
		s = Trim(s);
		var m = /^([^ \t\n\v\f\r]+)/.exec(s);
		return m ? m[1] : s;
	}

	// 0.5.0: the in-game window no longer fills its Name from this (HUI Menus 0.19.35), nor does the editor's maker: kept
	// line for line with Data.lua's for the parity test only
	function DefaultName(key, f) {
		f = f || {};
		var name = '';
		if (key === 'heal') {
			if (Trim(f.spell) !== '') name = LastWord(f.spell) + ' MO';
		} else if (key === 'talk') {
			name = FirstWord(f.npc);
		} else if (key === 'spawn') {
			name = Trim(f.name);
		} else if (key === 'cast') {
			if (Trim(f.spell) !== '') {
				var lead = ({ me: 'Self', cursor: 'Cursor', stop: 'Stop', trinket: 'Trinket' })[f.kind] || 'Self';
				name = lead + ' ' + LastWord(f.spell);
			}
		}
		return CleanName(name);
	}

	// the text in parts for colouring (Data.lua M.Coloured's rule): [[kind, text], ...] per line; kinds meta / command
	// / condition / rest
	function Parts(text) {
		return String(text || '').split('\n').map(function (line) {
			if (line.charAt(0) === '#') return [['meta', line]];
			var m = /^(\S+\s?)([\s\S]*)$/.exec(line);
			if (!m) return [['rest', line]];
			var out = [['command', m[1]]], rest = m[2], i = 0;
			while (i < rest.length) {
				var open = rest.indexOf('[', i);
				if (open < 0) { out.push(['rest', rest.slice(i)]); break; }
				if (open > i) out.push(['rest', rest.slice(i, open)]);
				var close = rest.indexOf(']', open);
				if (close < 0) close = rest.length - 1;
				out.push(['condition', rest.slice(open, close + 1)]);
				i = close + 1;
			}
			return out;
		});
	}

	var api = {
		MAX_LETTERS: MAX_LETTERS, NAME_LETTERS: NAME_LETTERS, QUESTION_ID: QUESTION_ID, SOUND: SOUND,
		TEMPLATES: TEMPLATES, BY_KEY: BY_KEY, KINDS: KINDS, SLOTS: SLOTS, ON: ON, MO_KINDS: MO_KINDS, HINTS: HINTS, RES_SPELLS: RES_SPELLS,
		Trim: Trim, Letters: Letters, CleanName: CleanName, DefaultFields: DefaultFields, Filled: Filled, FoldForm: FoldForm, SpellWord: SpellWord,
		Ready: Ready, Text: Text, RowsText: RowsText, SetTyped: SetTyped, IsRes: IsRes, DefaultName: DefaultName, Parts: Parts,
		TooltipLines: TooltipLines, NamedBody: NamedBody,
	};
	if (typeof module !== 'undefined' && module.exports) module.exports = api;
	else root.HUIMacro = api;
})(this);
