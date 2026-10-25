// HUI Bar Editor: THE SERIALISATION RULES, in one place (dev/docs/actionbars/LAYOUT-FORMAT.md, v1). Everything that decides the
// bytes of an export string or of Layouts.lua is here, so it can be matched to the game's own writer and reader.
//
// VALUES. A Lua table is a JS array (a pure sequence 1..n) or a JS object (any other table; an integer key is written
// as its decimal string, "73"). Strings, finite numbers and booleans as themselves. nil is never written.
//
// THE WRITER (compact: the export string; pretty: Layouts.lua - the same order, only spaces and line breaks added):
//   * a table opens "{" and closes "}"; entries are separated by "," (compact: no spaces, no trailing comma;
//     pretty: one entry per line, a tab per level, a comma after every entry; a table holding no table is one line,
//     "{ "spell", 2050, auto = true }", when that line stays within 100 letters)
//   * KEY ORDER: first the sequence part - the values of keys 1, 2, 3 ... up to the first missing one, positionally
//     ("spell",2050); then every other integer key ascending as [n]=v; then the string keys in code-unit order (byte
//     order for the ASCII keys a layout has) - as name=v when the key is a Lua name that is not a reserved word,
//     else as ["key"]=v
//   * NUMBERS: an integer as plain decimal digits ("-5", "134400"); any other finite number as JS writes it at its
//     shortest ("0.5") - a layout holds integers only; NaN / infinities are refused
//   * BOOLEANS: true / false
//   * STRINGS: in double quotes; \ -> \\, " -> \", newline -> \n, carriage return -> \r, tab -> \t, any other byte
//     below 32 and 127 -> \ddd (three decimal digits); everything else as is (UTF-8 bytes, never escaped)
// THE READER takes any Lua table constructor of plain values: "--" and "--[[ ]]" comments, "," or ";" between
// entries, [expr]=, name=, positional values, '...' "..." and [[long]] strings with every Lua 5.1 escape (\ddd as a
// byte, \xhh, \z, \u{...}), decimal / hex / exponent numbers, unary minus, true / false / nil.
//
// THE EXPORT STRING: "HUI1!" + base64( raw deflate (RFC 1951; the game's C_EncodingUtil.CompressString with
// Enum.CompressionMethod.Deflate) of the UTF-8 bytes of the compact text ). Base64 is RFC 4648's standard alphabet
// with "=" padding (C_EncodingUtil.EncodeBase64's Standard variant). Reading also takes "HUI0!" + base64(text) (no
// compression) and a zlib-wrapped stream, and ignores spaces and line breaks pasted into the string. The deflate
// bytes themselves may differ between two compressors at equal input; the text inside never does.
//
// LAYOUTS.LUA: "HUI_LAYOUTS = " + the pretty list of layouts + "\n", after one comment line naming the editor.
// PRESETS (Interface\AddOns\HUIPresets\Presets\<Race><Class>.lua, 0.6.6): "HUIPresets_Add(" + the pretty list + ")",
// after its own comment line. (Before 0.6.6, one Presets.lua: "HUIPRESETS = " + the list; still read.)
(function (root) {
	'use strict';

	var PREFIX = 'HUI1!', PREFIX_PLAIN = 'HUI0!';
	var RESERVED = {};
	('and break do else elseif end false for function goto if in local nil not or repeat return then true until while')
		.split(' ').forEach(function (w) { RESERVED[w] = true; });
	var INLINE_WIDTH = 100;

	function isIntKey(k) { return /^(0|-?[1-9][0-9]*)$/.test(k) && Math.abs(Number(k)) <= 9007199254740991; }
	function isName(k) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && !RESERVED[k]; }

	function writeNumber(n) {
		if (typeof n !== 'number' || !isFinite(n)) throw new Error('not a finite number: ' + n);
		if (Object.is(n, -0)) return '0';
		if (Number.isInteger(n)) {
			// plain digits even past 1e21 (never in a layout, kept exact anyway)
			return Math.abs(n) < 1e21 ? String(n) : BigInt(n).toString();
		}
		return String(n);
	}

	function writeString(s) {
		var out = '"';
		for (var i = 0; i < s.length; i++) {
			var c = s.charAt(i), code = s.charCodeAt(i);
			if (c === '\\') out += '\\\\';
			else if (c === '"') out += '\\"';
			else if (c === '\n') out += '\\n';
			else if (c === '\r') out += '\\r';
			else if (c === '\t') out += '\\t';
			else if (code < 32 || code === 127) out += '\\' + ('00' + code).slice(-3);
			else out += c;
		}
		return out + '"';
	}

	// a table's entries in the writing order: [[keyText or null (positional), value], ...]
	function entries(t) {
		var list = [];
		if (Array.isArray(t)) {
			for (var i = 0; i < t.length; i++) {
				if (t[i] === undefined || t[i] === null) throw new Error('a hole in a sequence at ' + (i + 1));
				list.push([null, t[i]]);
			}
			return list;
		}
		var ints = [], strs = [];
		Object.keys(t).forEach(function (k) {
			if (t[k] === undefined || t[k] === null) return;
			if (isIntKey(k)) ints.push(Number(k)); else strs.push(k);
		});
		ints.sort(function (a, b) { return a - b; });
		var n = 0;
		while (t[String(n + 1)] !== undefined && t[String(n + 1)] !== null) n++;
		for (var p = 1; p <= n; p++) list.push([null, t[String(p)]]);
		ints.forEach(function (k) { if (k < 1 || k > n) list.push(['[' + writeNumber(k) + ']', t[String(k)]]); });
		strs.sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
		strs.forEach(function (k) { list.push([isName(k) ? k : '[' + writeString(k) + ']', t[k]]); });
		return list;
	}

	function isTable(v) { return v !== null && typeof v === 'object'; }

	function writeScalar(v) {
		if (typeof v === 'string') return writeString(v);
		if (typeof v === 'number') return writeNumber(v);
		if (typeof v === 'boolean') return v ? 'true' : 'false';
		throw new Error('cannot write a ' + (v === null ? 'null' : typeof v));
	}

	function writeCompact(v) {
		if (!isTable(v)) return writeScalar(v);
		return '{' + entries(v).map(function (e) {
			return (e[0] === null ? '' : e[0] + '=') + writeCompact(e[1]);
		}).join(',') + '}';
	}

	function writePretty(v, depth) {
		if (!isTable(v)) return writeScalar(v);
		var list = entries(v);
		if (!list.length) return '{}';
		var flat = list.every(function (e) { return !isTable(e[1]); });
		if (flat) {
			var line = '{ ' + list.map(function (e) {
				return (e[0] === null ? '' : e[0] + ' = ') + writeScalar(e[1]);
			}).join(', ') + ' }';
			if (line.length + depth * 4 <= INLINE_WIDTH) return line;
		}
		var pad = new Array(depth + 2).join('\t');
		return '{\n' + list.map(function (e) {
			return pad + (e[0] === null ? '' : e[0] + ' = ') + writePretty(e[1], depth + 1) + ',\n';
		}).join('') + new Array(depth + 1).join('\t') + '}';
	}

	function write(v, opts) { return opts && opts.pretty ? writePretty(v, 0) : writeCompact(v); }

	// ------------------------------------------------------------------ the reader
	function utf8Bytes(s) { return Array.from(new TextEncoder().encode(s)); }
	function utf8Text(bytes) { return new TextDecoder('utf-8').decode(new Uint8Array(bytes)); }

	function Reader(text) { this.s = text; this.i = 0; }
	Reader.prototype.fail = function (what) {
		var line = this.s.slice(0, this.i).split('\n').length;
		throw new Error(what + ' (line ' + line + ')');
	};
	Reader.prototype.skip = function () {
		var s = this.s;
		for (;;) {
			var c = s.charAt(this.i);
			if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v' || c === '﻿') {
				this.i++;
			} else if (c === '-' && s.charAt(this.i + 1) === '-') {
				this.i += 2;
				var lvl = this.longOpen();
				if (lvl >= 0) {
					this.longBody(lvl);
				} else {
					while (this.i < s.length && s.charAt(this.i) !== '\n') this.i++;
				}
			} else {
				return;
			}
		}
	};
	// at "[" "="* "[": its level, moved past it; else -1, not moved
	Reader.prototype.longOpen = function () {
		var s = this.s, j = this.i;
		if (s.charAt(j) !== '[') return -1;
		j++;
		var lvl = 0;
		while (s.charAt(j) === '=') { lvl++; j++; }
		if (s.charAt(j) !== '[') return -1;
		this.i = j + 1;
		return lvl;
	};
	Reader.prototype.longBody = function (lvl) {
		var close = ']' + new Array(lvl + 1).join('=') + ']';
		var end = this.s.indexOf(close, this.i);
		if (end < 0) this.fail('unfinished long string or comment');
		var body = this.s.slice(this.i, end);
		this.i = end + close.length;
		if (body.charAt(0) === '\r' && body.charAt(1) === '\n') body = body.slice(2);
		else if (body.charAt(0) === '\n' || body.charAt(0) === '\r') body = body.slice(1);
		return body;
	};
	Reader.prototype.peek = function () { this.skip(); return this.s.charAt(this.i); };
	Reader.prototype.expect = function (c) {
		if (this.peek() !== c) this.fail('expected "' + c + '"');
		this.i++;
	};
	Reader.prototype.name = function () {
		var m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.s.slice(this.i, this.i + 256));
		return m ? m[0] : null;
	};
	Reader.prototype.string = function () {
		var s = this.s, q = s.charAt(this.i++), bytes = [];
		var push = function (str) { Array.prototype.push.apply(bytes, utf8Bytes(str)); };
		for (;;) {
			if (this.i >= s.length) this.fail('unfinished string');
			var c = s.charAt(this.i++);
			if (c === q) break;
			if (c === '\n') this.fail('line break in a string');
			if (c !== '\\') { push(c); continue; }
			var e = s.charAt(this.i++);
			var simple = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '\\': 92, '"': 34, "'": 39, '\n': 10 };
			if (simple.hasOwnProperty(e)) {
				bytes.push(simple[e]);
				if (e === '\n' && s.charAt(this.i) === '\r') this.i++;
			} else if (e === '\r') {
				bytes.push(10);
				if (s.charAt(this.i) === '\n') this.i++;
			} else if (/[0-9]/.test(e)) {
				var d = e;
				while (d.length < 3 && /[0-9]/.test(s.charAt(this.i))) d += s.charAt(this.i++);
				if (Number(d) > 255) this.fail('escape too large');
				bytes.push(Number(d));
			} else if (e === 'x') {
				var h = s.slice(this.i, this.i + 2);
				if (!/^[0-9A-Fa-f]{2}$/.test(h)) this.fail('bad \\x escape');
				bytes.push(parseInt(h, 16));
				this.i += 2;
			} else if (e === 'z') {
				while (/[ \t\n\r\f\v]/.test(s.charAt(this.i))) this.i++;
			} else if (e === 'u') {
				var m = /^\{([0-9A-Fa-f]+)\}/.exec(s.slice(this.i, this.i + 12));
				if (!m) this.fail('bad \\u escape');
				push(String.fromCodePoint(parseInt(m[1], 16)));
				this.i += m[0].length;
			} else {
				this.fail('bad escape \\' + e);
			}
		}
		return utf8Text(bytes);
	};
	Reader.prototype.number = function () {
		var rest = this.s.slice(this.i, this.i + 64);
		var m = /^0[xX][0-9A-Fa-f]+/.exec(rest) || /^([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?/.exec(rest);
		if (!m) this.fail('bad number');
		this.i += m[0].length;
		return /^0[xX]/.test(m[0]) ? parseInt(m[0], 16) : Number(m[0]);
	};
	Reader.prototype.value = function () {
		var c = this.peek();
		if (c === '{') return this.table();
		if (c === '"' || c === "'") return this.string();
		if (c === '[') {
			var lvl = this.longOpen();
			if (lvl < 0) this.fail('unexpected "["');
			return this.longBody(lvl);
		}
		if (c === '-') {
			this.i++;
			var v = this.value();
			if (typeof v !== 'number') this.fail('minus before a non-number');
			return -v;
		}
		if (/[0-9.]/.test(c)) return this.number();
		var w = this.name();
		if (w === 'true') { this.i += 4; return true; }
		if (w === 'false') { this.i += 5; return false; }
		if (w === 'nil') { this.i += 3; return null; }
		this.fail('unexpected ' + (c ? '"' + c + '"' : 'end'));
	};
	Reader.prototype.table = function () {
		this.expect('{');
		var t = {}, n = 0;
		for (;;) {
			var c = this.peek();
			if (c === '}') { this.i++; break; }
			var key = undefined, val = undefined;
			if (c === '[' && this.s.charAt(this.i + 1) !== '[' && this.s.charAt(this.i + 1) !== '=') {
				this.i++;
				key = this.value();
				this.expect(']');
				this.expect('=');
				val = this.value();
				if (key === null || key === undefined) this.fail('nil key');
				if (typeof key === 'number' && !Number.isInteger(key)) key = String(key);
				key = String(key);
			} else {
				var w = this.name();
				var save = this.i;
				if (w && !RESERVED[w]) {
					this.i += w.length;
					if (this.peek() === '=' && this.s.charAt(this.i + 1) !== '=') {
						this.i++;
						key = w;
						val = this.value();
					} else {
						this.i = save;
					}
				}
				if (key === undefined) {
					n++;
					key = String(n);
					val = this.value();
				}
			}
			if (val !== null) t[key] = val; else delete t[key];
			var sep = this.peek();
			if (sep === ',' || sep === ';') { this.i++; continue; }
			if (sep === '}') continue;
			this.fail('expected "," or "}"');
		}
		return seqOrMap(t);
	};

	// a table whose keys are exactly 1..n becomes an array; anything else stays an object
	function seqOrMap(t) {
		var keys = Object.keys(t);
		if (!keys.length) return {};
		for (var i = 0; i < keys.length; i++) {
			if (!isIntKey(keys[i])) return t;
		}
		var nums = keys.map(Number).sort(function (a, b) { return a - b; });
		for (var j = 0; j < nums.length; j++) if (nums[j] !== j + 1) return t;
		return nums.map(function (k) { return t[String(k)]; });
	}

	function read(text) {
		var r = new Reader(String(text));
		r.skip();
		if (r.name() === 'return') r.i += 6;
		var v = r.value();
		if (r.peek() !== '') r.fail('text after the value');
		return v;
	}

	// ------------------------------------------------------------------ Layouts.lua and Presets.lua
	var FILE_HEAD = '-- HUI layouts, written by the HUI Bar Editor (dev/docs/actionbars/LAYOUT-FORMAT.md v1). Read by HUI Bars.\n';
	var NAMES = { HUI_LAYOUTS: true, HUI_LAYOUTS_SEND: true, HUIPRESETS: true };   // HUI_LAYOUTS_SEND: an old file's, read past
	var ADD = 'HUIPresets_Add';

	function layoutsFile(list) {
		return FILE_HEAD + 'HUI_LAYOUTS = ' + writePretty(list.length ? list : {}, 0) + '\n';
	}
	// Interface\AddOns\HUIPresets\Presets\<Race><Class>.lua (Harry, Oct 19: "surely we just save it as a 'human priest'
	// layout, and the addon should recognise that and load it itself"; 0.6.6: "the solution is to just make Human
	// Priest.lua, Dwarf Rogue.lua") - ONE file per race and class, holding every saved preset of it, so a download never
	// touches another character's file. A call, never a global (HUIPresets' Core.lua defines it), so the files never
	// overwrite each other's presets: HUIPresets_Add({ <layout>, ... }). In game a new character gets the one of its class
	// (its race's first). The name: the race's and the class's words with no spaces ("NightElfDruid.lua" - no .toc of
	// the game's or of any addon installed lists a file with a space, so the safe form; website/tools/make_preset_files.py
	// ships the same names).
	function presetFileName(raceWord, classWord) {
		return String(raceWord).replace(/\s+/g, '') + String(classWord).replace(/\s+/g, '') + '.lua';
	}
	function presetsFile(list, raceWord, classWord) {
		return '-- HUI presets' + (raceWord ? ' for ' + raceWord + ' ' + classWord : '')
			+ ', written by the HUI Bar Editor (dev/docs/actionbars/LAYOUT-FORMAT.md v1). Read by HUIPresets.\n'
			+ ADD + '(' + writePretty(list.length ? list : {}, 0) + ')\n';
	}

	// the file's assignments: { HUI_LAYOUTS: v, HUIPRESETS: v, ... } (each NAME = table, in any order); every
	// HUIPresets_Add(table) call's list joined under HUIPresets_Add
	function readAssignments(text) {
		var r = new Reader(String(text)), out = {};
		for (;;) {
			if (r.peek() === '') break;
			var n = r.name();
			if (n === ADD) {
				r.i += n.length;
				r.expect('(');
				var v = r.value();
				r.expect(')');
				out[ADD] = (out[ADD] || []).concat(asList(v));
			} else {
				if (!n || !NAMES.hasOwnProperty(n)) r.fail('not a layouts file');
				r.i += n.length;
				r.expect('=');
				out[n] = r.value();
			}
			r.skip();
			if (r.s.charAt(r.i) === ';') r.i++;
		}
		return out;
	}
	// a read table as a list: a sequence as it is, {} none, one layout alone itself, else its integer keys in order
	function asList(v) {
		if (Array.isArray(v)) return v;
		if (!v || typeof v !== 'object' || !Object.keys(v).length) return [];
		if (v.v !== undefined || v.name !== undefined) return [v];
		return Object.keys(v).filter(isIntKey).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; });
	}

	// Open reads a Layouts.lua, the editor's own file (<name>.hui-layouts.lua), a race and class file or an old Presets.lua
	function readLayoutsFile(text) {
		var all = readAssignments(text);
		if (all.HUI_LAYOUTS !== undefined) return asList(all.HUI_LAYOUTS);
		if (all.HUIPRESETS === undefined && all[ADD] === undefined) throw new Error('no HUI_LAYOUTS');
		return (all[ADD] || []).concat(asList(all.HUIPRESETS));
	}
	// a presets file's list (a race and class file, or an old Presets.lua): a file holding nothing (or only comments) has
	// none yet; anything but HUIPresets_Add({ <table>, ... }) / HUIPRESETS = { <table>, ... } throws
	function readPresetsFile(text) {
		var all = readAssignments(text);
		if (!Object.keys(all).length) return [];
		if (all.HUIPRESETS === undefined && all[ADD] === undefined) throw new Error('no HUIPRESETS');
		var v = all.HUIPRESETS;
		if (v !== undefined && !(v && typeof v === 'object')) throw new Error('HUIPRESETS is not a list');
		if (v !== undefined && !Array.isArray(v) && Object.keys(v).length) throw new Error('HUIPRESETS is not a list');
		var list = (all[ADD] || []).concat(v === undefined ? [] : asList(v));
		if (!list.every(function (x) { return x !== null && typeof x === 'object' && !Array.isArray(x); })) throw new Error('not a list of presets');
		return list;
	}
	// a preset into the list: the one of the same class AND name replaced where it stands, else added at the end; every
	// other one kept as it was (a new list; the given one is not changed)
	function mergePresets(list, preset) {
		var out = list.slice(), at = -1;
		out.forEach(function (p, i) { if (at < 0 && p.class === preset.class && p.name === preset.name) at = i; });
		if (at >= 0) out[at] = preset; else out.push(preset);
		return out;
	}

	// ------------------------------------------------------------------ the export string
	function toBase64(bytes) {
		var bin = '';
		for (var i = 0; i < bytes.length; i += 0x8000) {
			bin += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, i, i + 0x8000));
		}
		return btoa(bin);
	}
	function fromBase64(s) {
		var bin = atob(s);
		var out = new Uint8Array(bin.length);
		for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out;
	}
	function pipe(bytes, stream) {
		var src = new Blob([bytes]).stream().pipeThrough(stream);
		return new Response(src).arrayBuffer().then(function (b) { return new Uint8Array(b); });
	}
	function deflate(bytes) { return pipe(bytes, new CompressionStream('deflate-raw')); }
	function inflate(bytes) {
		return pipe(bytes, new DecompressionStream('deflate-raw')).catch(function () {
			return pipe(bytes, new DecompressionStream('deflate'));   // a zlib-wrapped stream, read too
		});
	}

	function encode(value) {
		var text = writeCompact(value);
		return deflate(new TextEncoder().encode(text)).then(function (z) { return PREFIX + toBase64(z); });
	}
	function encodePlain(value) {
		return PREFIX_PLAIN + toBase64(new TextEncoder().encode(writeCompact(value)));
	}

	// the text inside an export string (a Promise)
	function decodeText(str) {
		var s = String(str || '').replace(/\s+/g, '');
		var plain = s.indexOf(PREFIX_PLAIN) === 0;
		if (!plain && s.indexOf(PREFIX) !== 0) return Promise.reject(new Error('Not valid'));
		var bytes;
		try { bytes = fromBase64(s.slice(PREFIX.length)); } catch (e) { return Promise.reject(new Error('Not valid')); }
		var p = plain ? Promise.resolve(bytes) : inflate(bytes);
		return p.then(function (b) { return new TextDecoder('utf-8', { fatal: true }).decode(b); });
	}
	function decode(str) { return decodeText(str).then(read); }

	var api = {
		PREFIX: PREFIX, PREFIX_PLAIN: PREFIX_PLAIN,
		write: write, read: read, writeString: writeString, writeNumber: writeNumber,
		layoutsFile: layoutsFile, readLayoutsFile: readLayoutsFile,
		presetsFile: presetsFile, presetFileName: presetFileName, readPresetsFile: readPresetsFile, mergePresets: mergePresets,
		encode: encode, encodePlain: encodePlain, decode: decode, decodeText: decodeText,
		toBase64: toBase64, fromBase64: fromBase64, deflate: deflate, inflate: inflate,
	};
	if (typeof module !== 'undefined' && module.exports) module.exports = api;
	else root.HUISerialise = api;
})(this);
