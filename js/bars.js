// HUI Bar Editor: HUI Bars' bar layout, ported line for line so the Screen view draws every bar where the game puts it
// (LAYOUT-FORMAT "Bars"). Each function names the Lua it mirrors in HUI/ForeverBars:
//   Core.lua       ns.BAR_FIELDS, ns.LIMITS / ns.CHOICES (the per-bar fields and the template parameters), ns.AutoDown
//   Templates.lua  the six templates (Compute), Apply, Relayout, CountFromBars, Freeze
//   Bars.lua       Geometry, PlacedRect, HitsChat, ChatShift (the chat strip), Layout's order
//   Join.lua       the joined groups: Root, Members, Sanitize, Unify, PlaceBy, Store, Rects, Reroot, Attach, Touching,
//                  Rejoin, Separate, OptionChanged
//   Unlock.lua     a drag: StartDrag, Update (Clamp, BarClamp; no snap grid), StopDrag
// tests/run.js runs the Lua files themselves (fengari) next to this and compares every number.
//
// THE BARS (B): { template, count, size, gap, showEmpty, moved, bar: [null, L1 .. L8] }, each L exactly the fields of
// ns.BAR_FIELDS. `moved` is the editor's copy of HUI Bars' db.layoutMoved (not in the format: read back from the places,
// isMoved below). The screen is HUI Bars' UIParent in UI units: 1920 x 1080 unless given.
(function (root) {
	'use strict';

	var NUM_BARS = 8, NUM_BUTTONS = 12;
	var SCREEN = { w: 1920, h: 1080 };
	var BAR_FIELDS = ['enabled', 'cols', 'size', 'across', 'down', 'downOwn', 'scale', 'anchor', 'x', 'y', 'vis', 'fade',
		'joinTo', 'joinSide', 'joinAlign', 'grow'];
	var LIMITS = { size: [12, 64], across: [0, 24], down: [0, 24], joinTo: [0, NUM_BARS], scale: [50, 200], fade: [0, 100],
		x: [-5000, 5000], y: [-5000, 5000] };
	var CHOICES = { cols: [12, 6, 4, 3, 2, 1], anchor: ['BOTTOM', 'RIGHT'], vis: ['always', 'combat', 'mouseover', 'hidden'],
		joinSide: ['above', 'below', 'left', 'right'], joinAlign: ['left', 'center', 'right', 'top', 'middle', 'bottom'],
		grow: ['down', 'up'] };
	var PARAM_LIMITS = { count: [1, 4], size: [28, 56], gap: [0, 12] };
	var TEMPLATE_ORDER = ['stack', 'twohalf', 'wings', 'split', 'classic', 'levelling'];
	var TEMPLATE_NAMES = { stack: 'Stack', twohalf: 'Two and a half', wings: 'Wings', split: 'Split', classic: 'Classic',
		levelling: 'Levelling' };

	// ------------------------------------------------------------------ Core.lua
	var SKIN_ROOM = { thinring: 3, raisedring: 3 };
	var DEFAULT_SKIN = 'inward';
	function autoDown(across, skin) { return Math.min(24, (across || 0) + (SKIN_ROOM[skin || DEFAULT_SKIN] || 0)); }

	// ------------------------------------------------------------------ Templates.lua
	var BASE_Y = 14, WING_GAP = 12, FEET = 260, SPLIT_RAISE = 8, EDGE = 8;
	function width(cols, size, gap) { return cols * size + (cols - 1) * gap; }
	function round(v, places) {
		var m = Math.pow(10, places === undefined ? 2 : places);
		return Math.floor(v * m + 0.5) / m;
	}
	function entry(enabled, cols, size, across, down, x, y, anchor) {
		return { enabled: !!enabled, cols: cols, size: round(size), across: round(across), down: round(down), downOwn: false,
			scale: 100, anchor: anchor || 'BOTTOM', x: round(x), y: round(y), joinTo: 0, joinSide: 'above', joinAlign: 'center' };
	}
	function joined(out, n, to, side, align) {
		if (out[n] && out[to] && out[n].enabled && out[to].enabled) {
			out[n].joinTo = to; out[n].joinSide = side; out[n].joinAlign = align;
		}
	}
	var BUILD = {
		stack: function (out, count, s, g, d, baseY) {
			for (var n = 1; n <= 4; n++) out[n] = entry(n === 1 || n <= count, 12, s, g, d, 0, baseY + (n - 1) * (s + d));
			for (n = 2; n <= 4; n++) joined(out, n, n - 1, 'above', 'center');
			return baseY + 4 * (s + d) - d;
		},
		twohalf: function (out, count, s, g, d, baseY) {
			out[1] = entry(true, 12, s, g, d, 0, baseY);
			out[2] = entry(true, 12, s, g, d, 0, baseY + s + d);
			joined(out, 2, 1, 'above', 'center');
			var full = width(12, s, g), hg = g / 2, hs = (full - 23 * hg) / 24, hw = width(12, hs, hg);
			var y = baseY + 2 * (s + d);
			out[3] = entry(true, 12, hs, hg, hg + d - g, -full / 2 + hw / 2, y);
			out[4] = entry(true, 12, hs, hg, hg + d - g, full / 2 - hw / 2, y);
			return y + hs;
		},
		wings: function (out, count, s, g, d, baseY) {
			for (var n = 1; n <= 3; n++) out[n] = entry(true, 12, s, g, d, 0, baseY + (n - 1) * (s + d));
			joined(out, 2, 1, 'above', 'center');
			joined(out, 3, 2, 'above', 'center');
			var full = width(12, s, g), wing = width(4, s, g), x = full / 2 + WING_GAP + wing / 2;
			out[4] = entry(true, 4, s, g, d, -x, baseY);
			out[5] = entry(true, 4, s, g, d, x, baseY);
			return baseY + 3 * (s + d) - d;
		},
		split: function (out, count, s, g, d, baseY) {
			var block = width(6, s, g), x = FEET / 2 + block / 2, high = 2 * s + d, y2 = baseY + high + d + SPLIT_RAISE;
			out[1] = entry(true, 6, s, g, d, -x, baseY);
			out[2] = entry(true, 6, s, g, d, x, baseY);
			out[3] = entry(count >= 3, 6, s, g, d, -x, y2);
			out[4] = entry(count >= 4, 6, s, g, d, x, y2);
			return y2 + high;
		},
		classic: function (out, count, s, g, d, baseY) {
			out[1] = entry(true, 12, s, g, d, 0, baseY);
			out[2] = entry(true, 12, s, g, d, 0, baseY + s + d);
			joined(out, 2, 1, 'above', 'center');
			out[3] = entry(true, 1, s, g, d, -EDGE, 0, 'RIGHT');
			out[4] = entry(count >= 4, 1, s, g, d, -(EDGE + s + g), 0, 'RIGHT');
			joined(out, 4, 3, 'left', 'middle');
			return baseY + 2 * (s + d) - d;
		},
		levelling: function (out, count, s, g, d, baseY) {
			out[1] = entry(true, 12, s, g, d, 0, baseY);
			var us = round(s * 0.6, 0), ug = Math.max(1, round(g * 0.6, 0));
			out[2] = entry(true, 12, us, ug, ug + d - g, 0, baseY + s + d);
			return baseY + s + d + us;
		},
	};
	// Templates.Compute: the eight bars' geometry for a template (reserve: the XP room, 0 on Forever's XP.Reserve)
	function compute(name, count, size, gap, reserve, skin) {
		var baseY = BASE_Y + (reserve || 0);
		var build = BUILD[name] || BUILD.stack;
		var out = [null];
		var g = gap === undefined || gap === null ? 5 : gap, s = size || 40;
		var d = autoDown(g, skin);
		var top = build(out, count || 2, s, g, d, baseY);
		var y = top + d;
		for (var n = 1; n <= NUM_BARS; n++) {
			if (!out[n]) {
				out[n] = entry(false, 12, s, g, d, 0, y);
				y = y + s + d;
			}
		}
		return out;
	}
	var GEOMETRY = ['enabled', 'cols', 'size', 'across', 'down', 'downOwn', 'scale', 'anchor', 'x', 'y', 'joinTo', 'joinSide', 'joinAlign'];
	var PLACES = ['anchor', 'x', 'y', 'joinTo', 'joinSide', 'joinAlign'];

	// HUI Bars' defaults: Stack, 2 bars, 40, 5 - vis "always", fade 0, grow "down" (Templates.lua's last block)
	function defaults() {
		var t = compute('stack', 2, 40, 5, 0);
		var B = { template: 'stack', count: 2, size: 40, gap: 5, showEmpty: true, moved: false, bar: [null] };
		for (var n = 1; n <= NUM_BARS; n++) { t[n].vis = 'always'; t[n].fade = 0; t[n].grow = 'down'; B.bar[n] = t[n]; }
		return B;
	}
	// Templates.Apply: the template's geometry into every bar; vis, fade and grow stay
	function apply(B, name) {
		if (name && TEMPLATE_NAMES[name]) B.template = name;
		B.moved = false;
		var t = compute(B.template, B.count, B.size, B.gap, 0);
		for (var n = 1; n <= NUM_BARS; n++) GEOMETRY.forEach(function (f) { B.bar[n][f] = t[n][f]; });
		return B;
	}
	var COUNTED = { stack: true, split: true, classic: true };
	// Templates.Relayout: Count, Size or Gap changed
	function relayout(B, path) {
		if (!B.moved) return apply(B, B.template);
		var t = compute(B.template, B.count, B.size, B.gap, 0);
		for (var n = 1; n <= NUM_BARS; n++) {
			var L = B.bar[n];
			if (path === 'count') {
				if (COUNTED[B.template] && n >= 2 && n <= 4 && L.enabled !== t[n].enabled) L.enabled = t[n].enabled;
			} else {
				L.size = t[n].size; L.across = t[n].across; L.down = t[n].down; L.downOwn = false;
			}
		}
		return B;
	}
	// Templates.CountFromBars: Shown on bar 2, 3 or 4 - the count follows where the template can say it
	function countFromBars(B) {
		var on = {};
		for (var n = 2; n <= 4; n++) on[n] = !!B.bar[n].enabled;
		var count = B.count, want = null;
		if (B.template === 'stack') {
			var top = 1;
			while (top < 4 && on[top + 1]) top++;
			var gap = false;
			for (n = top + 1; n <= 4; n++) if (on[n]) gap = true;
			if (!gap) want = top;
		} else if (B.template === 'split') {
			if (on[3] && on[4]) want = 4;
			else if (on[3]) want = 3;
			else if (!on[4]) want = Math.min(count, 2);
		} else if (B.template === 'classic') {
			want = on[4] ? 4 : Math.min(count, 3);
		}
		if (want !== null && want !== count) { B.count = want; return true; }
		return false;
	}
	// Templates.Freeze: the first move bakes the chat shift into every bottom-anchored bar; nothing follows the template
	function freeze(B, scr) {
		if (B.moved) return false;
		var dx = chatShift(B, scr);
		if (dx !== 0) for (var n = 1; n <= NUM_BARS; n++) if (B.bar[n].anchor !== 'RIGHT') B.bar[n].x = B.bar[n].x + dx;
		B.moved = true;
		return true;
	}
	// read back: a layout's bars follow their template while the roots' places and the joins are the template's own
	function isMoved(B) {
		var t = compute(B.template, B.count, B.size, B.gap, 0);
		for (var n = 1; n <= NUM_BARS; n++) {
			var L = B.bar[n], T = t[n];
			if ((L.joinTo || 0) !== (T.joinTo || 0)) return true;
			if (L.joinTo && (L.joinSide !== T.joinSide || L.joinAlign !== T.joinAlign)) return true;
			if (!L.joinTo && L.enabled && (L.anchor !== T.anchor || Math.abs(L.x - T.x) > 0.01 || Math.abs(L.y - T.y) > 0.01)) return true;
		}
		return false;
	}

	// ------------------------------------------------------------------ Bars.lua
	var CHAT_W = 420, CHAT_H = 260, CHAT_PAD = 8;
	// Bars.Geometry: cols, rows, size, across, scale (factor), width, height (unscaled), down
	function geometry(L) {
		var cols = L.cols, rows = Math.ceil(NUM_BUTTONS / cols);
		return { cols: cols, rows: rows, size: L.size, across: L.across, scale: L.scale / 100,
			w: cols * L.size + (cols - 1) * L.across, h: rows * L.size + (rows - 1) * L.down, down: L.down };
	}
	// Bars.Layout's button place: button i's column and row from the bar's top (0-based). HUI Bars 0.16.4, Grow Up: row 1 at
	// the bottom, the later rows over it
	function buttonCell(L, i) {
		var g = geometry(L), col = (i - 1) % g.cols, row = Math.floor((i - 1) / g.cols);
		if (L.grow === 'up') row = g.rows - 1 - row;
		return { col: col, row: row };
	}
	// Bars.PlacedRect: [left, bottom, w, h] in UI units at its stored place, with the chat shift dx
	function placedRect(L, dx, scr) {
		scr = scr || SCREEN;
		var g = geometry(L), w = g.w * g.scale, h = g.h * g.scale;
		if (L.anchor === 'RIGHT') return [scr.w + L.x - w, scr.h / 2 + L.y - h / 2, w, h];
		return [scr.w / 2 + L.x + (dx || 0) - w / 2, L.y, w, h];
	}
	function hitsChat(left, bottom, w, h) {
		return left < CHAT_W + CHAT_PAD && bottom < CHAT_H + CHAT_PAD && left + w > 0 && bottom + h > 0;
	}
	function chatShift(B, scr) {
		if (B.moved) return 0;
		var dx = 0;
		for (var n = 1; n <= NUM_BARS; n++) {
			var L = B.bar[n];
			if (L.enabled && L.anchor !== 'RIGHT') {
				var r = placedRect(L, 0, scr);
				if (hitsChat(r[0], r[1], r[2], r[3])) {
					var need = CHAT_W + CHAT_PAD - r[0];
					if (need > dx) dx = need;
				}
			}
		}
		return dx;
	}
	// Bars.Layout's order: the joins kept sound, the chat shift measured, then every bar's rectangle (members' places
	// written down as drawn). Returns { dx, rects }.
	function layout(B, scr) {
		sanitize(B);
		var dx = chatShift(B, scr);
		return { dx: dx, rects: rects(B, dx, true, scr) };
	}

	// ------------------------------------------------------------------ Join.lua
	var TOUCH = 0.6;
	var OPPOSITE = { above: 'below', below: 'above', left: 'right', right: 'left' };
	var ALIGNS = { above: { left: 1, center: 1, right: 1 }, below: { left: 1, center: 1, right: 1 },
		left: { top: 1, middle: 1, bottom: 1 }, right: { top: 1, middle: 1, bottom: 1 } };
	// Lua's pairs() order over ALIGN_ORDER is not fixed; Touching takes the first side that fits, and two sides never
	// both fit one pair of rectangles, so this order is as good as any
	var ALIGN_ORDER = { above: ['left', 'center', 'right'], below: ['left', 'center', 'right'],
		left: ['top', 'middle', 'bottom'], right: ['top', 'middle', 'bottom'] };
	function gapOf(L, side) { return side === 'above' || side === 'below' ? L.down : L.across; }
	function rootOf(B, n) {
		var seen = 0, cur = n;
		for (;;) {
			var to = B.bar[cur].joinTo;
			if (!to) return cur;
			cur = to;
			if (++seen > NUM_BARS) return null;
		}
	}
	function children(B, n) {
		var out = [];
		for (var m = 1; m <= NUM_BARS; m++) if (m !== n && B.bar[m].joinTo === n) out.push(m);
		return out;
	}
	function members(B, n) {
		var r = rootOf(B, n) || n, out = [r], i = 0;
		while (out[i] !== undefined) {
			children(B, out[i]).forEach(function (k) { out.push(k); });
			i++;
			if (i > NUM_BARS) break;
		}
		return out;
	}
	function isJoined(B, n) {
		if (B.bar[n].joinTo) return true;
		for (var m = 1; m <= NUM_BARS; m++) if (m !== n && B.bar[m].joinTo === n) return true;
		return false;
	}
	function sanitize(B) {
		var changed = false;
		for (var n = 1; n <= NUM_BARS; n++) {
			var L = B.bar[n], to = L.joinTo;
			if (to) {
				var P = B.bar[to];
				if (typeof to !== 'number' || to === n || !P || !L.enabled || !P.enabled || !ALIGNS[L.joinSide] || !ALIGNS[L.joinSide][L.joinAlign]) {
					L.joinTo = 0;
					changed = true;
				}
			}
		}
		for (n = 1; n <= NUM_BARS; n++) if (!rootOf(B, n)) { B.bar[n].joinTo = 0; changed = true; }
		unify(B);
		return changed;
	}
	function unify(B) {
		for (var n = 1; n <= NUM_BARS; n++) { var L = B.bar[n]; if (!L.downOwn) L.down = autoDown(L.across); }
		for (n = 1; n <= NUM_BARS; n++) {
			L = B.bar[n];
			if (L.joinTo) {
				var R = B.bar[rootOf(B, n) || n];
				L.across = R.across; L.down = R.down; L.downOwn = R.downOwn;
			}
		}
	}
	function placeBy(pl, pb, pw, ph, w, h, side, align, gap) {
		if (side === 'above' || side === 'below') {
			var left = align === 'left' ? pl : align === 'right' ? pl + pw - w : pl + pw / 2 - w / 2;
			var bottom = side === 'above' ? pb + ph + gap : pb - gap - h;
			return [left, bottom];
		}
		var b2 = align === 'bottom' ? pb : align === 'top' ? pb + ph - h : pb + ph / 2 - h / 2;
		var l2 = side === 'right' ? pl + pw + gap : pl - gap - w;
		return [l2, b2];
	}
	function store(B, n, left, bottom, w, h, anchor, dx, scr) {
		scr = scr || SCREEN;
		var L = B.bar[n];
		if (anchor === 'RIGHT') { L.anchor = 'RIGHT'; L.x = left + w - scr.w; L.y = bottom + h / 2 - scr.h / 2; }
		else { L.anchor = 'BOTTOM'; L.x = left + w / 2 - scr.w / 2 - (dx || 0); L.y = bottom; }
	}
	function rects(B, dx, doStore, scr) {
		var out = [null];
		for (var n = 1; n <= NUM_BARS; n++) if (!B.bar[n].joinTo) out[n] = placedRect(B.bar[n], dx, scr);
		for (var pass = 0; pass < NUM_BARS; pass++) {
			var missing = false;
			for (n = 1; n <= NUM_BARS; n++) {
				if (out[n]) continue;
				var L = B.bar[n], p = out[L.joinTo];
				if (p) {
					var g = geometry(L), w = g.w * g.scale, h = g.h * g.scale;
					var lb = placeBy(p[0], p[1], p[2], p[3], w, h, L.joinSide, L.joinAlign, gapOf(L, L.joinSide) * g.scale);
					out[n] = [lb[0], lb[1], w, h];
					if (doStore) store(B, n, lb[0], lb[1], w, h, B.bar[rootOf(B, n) || n].anchor, dx, scr);
				} else missing = true;
			}
			if (!missing) break;
		}
		return out;
	}
	function reroot(B, a) {
		var path = [a], cur = a;
		while (B.bar[cur].joinTo && path.length <= NUM_BARS) { cur = B.bar[cur].joinTo; path.push(cur); }
		for (var i = path.length - 1; i >= 1; i--) {
			var child = B.bar[path[i - 1]], parent = B.bar[path[i]];
			parent.joinTo = path[i - 1]; parent.joinSide = OPPOSITE[child.joinSide]; parent.joinAlign = child.joinAlign;
		}
		B.bar[a].joinTo = 0;
	}
	function attach(B, a, t, side, align) {
		if (a === t || !ALIGNS[side] || !ALIGNS[side][align]) return false;
		if (!(B.bar[a].enabled && B.bar[t].enabled)) return false;
		if (rootOf(B, a) === rootOf(B, t)) return false;
		var R = B.bar[rootOf(B, t) || t];
		members(B, a).forEach(function (m) { var L = B.bar[m]; L.across = R.across; L.down = R.down; L.downOwn = R.downOwn; });
		reroot(B, a);
		var L = B.bar[a];
		L.joinTo = t; L.joinSide = side; L.joinAlign = align;
		return true;
	}
	function touching(a, b, gapAcross, gapDown) {
		for (var side in ALIGN_ORDER) {
			var gap = side === 'above' || side === 'below' ? gapDown : gapAcross;
			for (var i = 0; i < 3; i++) {
				var lb = placeBy(b[0], b[1], b[2], b[3], a[2], a[3], side, ALIGN_ORDER[side][i], gap);
				if (Math.abs(lb[0] - a[0]) <= TOUCH && Math.abs(lb[1] - a[1]) <= TOUCH) return [side, ALIGN_ORDER[side][i]];
			}
		}
		return null;
	}
	function rejoin(B, list, rs, dx, scr) {
		list.forEach(function (n) {
			var r = rs[n];
			store(B, n, r[0], r[1], r[2], r[3], 'BOTTOM', dx, scr);
			B.bar[n].joinTo = 0;
		});
		var done = {};
		list.forEach(function (start) {
			if (done[start]) return;
			done[start] = true;
			var queue = [start], i = 0;
			while (queue[i] !== undefined) {
				var p = queue[i];
				list.forEach(function (m) {
					if (done[m]) return;
					var L = B.bar[m], scale = L.scale / 100;
					var t = touching(rs[m], rs[p], L.across * scale, L.down * scale);
					if (t) { L.joinTo = p; L.joinSide = t[0]; L.joinAlign = t[1]; done[m] = true; queue.push(m); }
				});
				i++;
			}
		});
	}
	// Join.Separate + Unlock.Separate: bar n leaves its group where it is; the layout is moved by hand from then on
	function separate(B, n, scr) {
		if (!isJoined(B, n)) return false;
		var dx = chatShift(B, scr);
		var rs = rects(B, dx, false, scr);
		var rest = members(B, n).filter(function (m) { return m !== n; });
		var r = rs[n];
		store(B, n, r[0], r[1], r[2], r[3], 'BOTTOM', dx, scr);
		B.bar[n].joinTo = 0;
		rejoin(B, rest, rs, dx, scr);
		freeze(B, scr);
		return true;
	}
	// Join.OptionChanged: Across or Down on any member is the whole group's; Down set by hand is the player's (downOwn)
	function optionChanged(B, n, field) {
		if (field !== 'across' && field !== 'down') return;
		if (field === 'down') B.bar[n].downOwn = true;
		var value = B.bar[n][field], own = B.bar[n].downOwn;
		members(B, n).forEach(function (m) { B.bar[m][field] = value; B.bar[m].downOwn = own; });
	}

	// ------------------------------------------------------------------ the editor's Joined tick (0.4.3)
	// Harry, Oct 18: "let me detach the bars in the screen version". Not HUI Bars' own code: the moves it is made of are
	// (Unlock.Separate = Join.Separate + Freeze; a drop joined = Freeze + Join.Attach + Layout, Unlock.StopDrag), so what
	// the layout writes is what HUI Bars would. B.unjoined[n] = [to, side, align]: the join bar n left (editor-only, never
	// written), so ticking Joined again puts it back where it was joined.
	// the join that holds bar n in its group, as seen from n (a root: as its first child sees it, reversed - Join.Reroot)
	function joinOf(B, n) {
		var L = B.bar[n];
		if (L.joinTo) return [L.joinTo, L.joinSide, L.joinAlign];
		var kids = children(B, n);
		if (!kids.length) return null;
		var C = B.bar[kids[0]];
		return [kids[0], OPPOSITE[C.joinSide], C.joinAlign];
	}
	// Unlock.Separate: bar n leaves its group where it is (the double-click, the Joined tick, a Shift+drag's start)
	function detach(B, n, scr) {
		var j = joinOf(B, n);
		if (!j || !separate(B, n, scr)) return false;
		B.unjoined = B.unjoined || {};
		B.unjoined[n] = j;
		layout(B, scr);
		return true;
	}
	function groupOverlaps(B, n, scr) {
		var rs = layout(B, scr).rects, g = members(B, n), inG = {};
		g.forEach(function (m) { inG[m] = true; });
		for (var a = 0; a < g.length; a++) for (var m = 1; m <= NUM_BARS; m++) {
			if (inG[m] || !B.bar[m].enabled) continue;
			var A = rs[g[a]], O = rs[m];
			if (A[0] < O[0] + O[2] - 0.5 && A[0] + A[2] > O[0] + 0.5 && A[1] < O[1] + O[3] - 0.5 && A[1] + A[3] > O[1] + 0.5) return true;
		}
		return false;
	}
	// back to the bar it left, if that still can be: both shown, not one group already, nothing in the way there
	function rejoinBar(B, n, scr, dry) {
		var j = B.unjoined && B.unjoined[n];
		if (!j || B.bar[n].joinTo || isJoined(B, n)) return false;
		var C = dry ? B : JSON.parse(JSON.stringify(B));
		freeze(C, scr);
		if (!attach(C, n, j[0], j[1], j[2])) return false;
		if (groupOverlaps(C, n, scr)) return false;
		if (dry) return true;
		freeze(B, scr);
		attach(B, n, j[0], j[1], j[2]);
		delete B.unjoined[n];
		layout(B, scr);
		return true;
	}
	function canRejoin(B, n, scr) { return rejoinBar(JSON.parse(JSON.stringify(B)), n, scr, true); }

	// ------------------------------------------------------------------ the options (ns.SetOption's limits)
	function validField(field, v) {
		var def = defaults().bar[1][field];
		if (typeof v !== typeof def) return false;
		if (LIMITS[field]) return v >= LIMITS[field][0] && v <= LIMITS[field][1];
		if (CHOICES[field]) return CHOICES[field].indexOf(v) >= 0;
		return true;
	}
	function clampTo(lim, v) { return Math.max(lim[0], Math.min(lim[1], v)); }
	// a per-bar setting, as HUI Bars' options write it, then laid out
	function setBar(B, n, field, value, scr) {
		var L = B.bar[n];
		if (LIMITS[field]) value = clampTo(LIMITS[field], value);
		if (!validField(field, value)) return false;
		L[field] = value;
		optionChanged(B, n, field);
		if (field === 'enabled' && n >= 2 && n <= 4) countFromBars(B);
		layout(B, scr);
		return true;
	}
	// a template parameter (Count, Size, Gap): Relayout
	function setParam(B, field, value, scr) {
		value = clampTo(PARAM_LIMITS[field], Math.round(value));
		if (B[field] === value) return false;
		B[field] = value;
		relayout(B, field);
		layout(B, scr);
		return true;
	}
	function setTemplate(B, name, scr) {
		apply(B, name);
		layout(B, scr);
	}

	// ------------------------------------------------------------------ Unlock.lua: a drag (no snap grid in the editor)
	var CLAMP_REACH = 14, SNAP = 8;
	function lround(v) { return Math.floor(v + 0.5); }
	// Unlock.StartDrag: the group of bar n, its box, the bars it may clamp to. cursor = [x, y] in UI units.
	function startDrag(B, n, cursor, scr) {
		scr = scr || SCREEN;
		var dx = chatShift(B, scr), rs = rects(B, dx, false, scr), group = members(B, n);
		var D = { n: n, root: group[0], list: [], ox: [], oy: [], ow: [], oh: [], targets: [], scr: scr, lastX: null, lastY: null,
			joinA: null };
		var bl = Infinity, bb = Infinity, br = -Infinity, bt = -Infinity, inGroup = {};
		group.forEach(function (m) {
			var r = rs[m];
			bl = Math.min(bl, r[0]); bb = Math.min(bb, r[1]); br = Math.max(br, r[0] + r[2]); bt = Math.max(bt, r[1] + r[3]);
		});
		group.forEach(function (m, i) {
			var r = rs[m];
			D.list.push(m); D.ox.push(r[0] - bl); D.oy.push(r[1] - bb); D.ow.push(r[2]); D.oh.push(r[3]);
			inGroup[m] = true;
			if (m === n) D.dragI = i;
			if (m === D.root) D.rootI = i;
		});
		for (var m = 1; m <= NUM_BARS; m++) if (!inGroup[m] && B.bar[m].enabled) D.targets.push([m, rs[m]]);
		D.width = br - bl; D.height = bt - bb;
		D.grabX = cursor[0] - bl; D.grabY = cursor[1] - bb;
		return D;
	}
	function clamp(D, left, bottom, noCentre) {
		var uw = D.scr.w, uh = D.scr.h, cx = false, cy = false, w = D.width, h = D.height;
		var maxLeft = Math.max(0, uw - w), maxBottom = Math.max(0, uh - h);
		if (left < 0) { left = 0; cx = true; } else if (left > maxLeft) { left = maxLeft; cx = true; }
		if (bottom < 0) { bottom = 0; cy = true; } else if (bottom > maxBottom) { bottom = maxBottom; cy = true; }
		if (hitsChat(left, bottom, w, h)) {
			var pushX = CHAT_W + CHAT_PAD - left, pushY = CHAT_H + CHAT_PAD - bottom;
			if (pushX <= pushY) { left += pushX; cx = true; } else { bottom += pushY; cy = true; }
		}
		var x = left + w / 2 - uw / 2;
		if (!cx && !noCentre && x > -SNAP && x < SNAP && !hitsChat(uw / 2 - w / 2, bottom, w, h)) left = uw / 2 - w / 2;
		return [left, bottom, cx, cy];
	}
	function barClamp(B, D, left, bottom) {
		var best = null, bestShift = null, shift = null, join = null;
		function overlaps(sx, sy) {
			for (var i = 0; i < D.list.length; i++) {
				var l = left + D.ox[i] + sx, b = bottom + D.oy[i] + sy, r = l + D.ow[i], t = b + D.oh[i];
				for (var j = 0; j < D.targets.length; j++) {
					var T = D.targets[j][1];
					if (l < T[0] + T[2] - 0.5 && r > T[0] + 0.5 && b < T[1] + T[3] - 0.5 && t > T[1] + 0.5) return true;
				}
			}
			return false;
		}
		function consider(d, e, vertical, a, t, side, align) {
			var ad = Math.abs(d), ae = Math.abs(e);
			if (ad > CLAMP_REACH) return;
			if (best !== null && (ad > best || (ad === best && ae >= bestShift))) return;
			if (vertical ? overlaps(e, d) : overlaps(d, e)) return;
			best = ad; bestShift = ae;
			shift = vertical ? [e, d] : [d, e];
			join = [a, t, side, align];
		}
		for (var i = 0; i < D.list.length; i++) {
			var a = D.list[i], scale = B.bar[a].scale / 100;
			var al = left + D.ox[i], ab = bottom + D.oy[i], aw = D.ow[i], ah = D.oh[i];
			for (var j = 0; j < D.targets.length; j++) {
				var t = D.targets[j][0], T = B.bar[t], R = D.targets[j][1];
				var gd = T.down * scale, ga = T.across * scale, ll = R[0], lb = R[1], lw = R[2], lh = R[3];
				if (al < ll + lw && al + aw > ll) {
					var e1 = ll - al, e2 = (ll + lw / 2) - (al + aw / 2), e3 = (ll + lw) - (al + aw);
					var align = 'left', e = e1;
					if (Math.abs(e2) < Math.abs(e)) { align = 'center'; e = e2; }
					if (Math.abs(e3) < Math.abs(e)) { align = 'right'; e = e3; }
					consider(lb + lh + gd - ab, e, true, a, t, 'above', align);
					consider(lb - gd - ah - ab, e, true, a, t, 'below', align);
				}
				if (ab < lb + lh && ab + ah > lb) {
					var f1 = lb - ab, f2 = (lb + lh / 2) - (ab + ah / 2), f3 = (lb + lh) - (ab + ah);
					var al2 = 'bottom', f = f1;
					if (Math.abs(f2) < Math.abs(f)) { al2 = 'middle'; f = f2; }
					if (Math.abs(f3) < Math.abs(f)) { al2 = 'top'; f = f3; }
					consider(ll + lw + ga - al, f, false, a, t, 'right', al2);
					consider(ll - ga - aw - al, f, false, a, t, 'left', al2);
				}
			}
		}
		return join ? { shift: shift, join: join } : null;
	}
	// Unlock.Update: the cursor at [x, y] (UI units); free = Shift held (no clamp to bars). Returns the root's place.
	function dragTo(B, D, cursor, free) {
		var left = cursor[0] - D.grabX, bottom = cursor[1] - D.grabY;
		var bc = free ? null : barClamp(B, D, left, bottom), c;
		D.joinA = null;
		if (bc) {
			c = clamp(D, left + bc.shift[0], bottom + bc.shift[1], true);
			if (Math.abs(c[0] - left - bc.shift[0]) > 0.01 || Math.abs(c[1] - bottom - bc.shift[1]) > 0.01) bc = null;
			else D.joinA = bc.join;
		}
		if (!bc) c = clamp(D, left, bottom);
		left = c[0]; bottom = c[1];
		if (c[2]) D.grabX = cursor[0] - left;
		if (c[3]) D.grabY = cursor[1] - bottom;
		var x = left + D.ox[D.rootI] + D.ow[D.rootI] / 2 - D.scr.w / 2, y = bottom + D.oy[D.rootI];
		if (!D.joinA) { x = lround(x); y = lround(y); }
		D.lastX = x; D.lastY = y;
		D.left = left; D.bottom = bottom;
		return [x, y];
	}
	// Unlock.StopDrag: frozen, the root's new place (anchor BOTTOM), joined where it was let go clamped to a bar
	function stopDrag(B, D) {
		if (D.lastX === null) return false;
		freeze(B, D.scr);
		var L = B.bar[D.root];
		L.anchor = 'BOTTOM'; L.x = D.lastX; L.y = D.lastY;
		if (D.joinA) attach(B, D.joinA[0], D.joinA[1], D.joinA[2], D.joinA[3]);
		layout(B, D.scr);
		return true;
	}

	// ------------------------------------------------------------------ the format's `bars` (LAYOUT-FORMAT "Bars")
	// dev/fixtures/README.md: whole numbers only, each held within its limits; a word not in its list is
	// left out; the group's template, size, gap, showEmpty and bars [1]-[8], each with any of ns.BAR_FIELDS (no `count`:
	// the count is read back from the bars that are on, Templates.CountFromBars)
	function whole(v) { return Math.floor(v + 0.5); }
	function cleanValue(field, v, limits, choices) {
		if (typeof v === 'number' && isFinite(v) && limits[field]) return clampTo(limits[field], whole(v));
		if (choices[field]) return choices[field].indexOf(v) >= 0 ? v : undefined;
		if (field === 'enabled' || field === 'downOwn' || field === 'showEmpty') return typeof v === 'boolean' ? v : undefined;
		return undefined;
	}
	// a `bars` table as read (from a string, a file): only what the README keeps, in the same shape
	function normalize(t) {
		if (!t || typeof t !== 'object') return null;
		var out = {}, get = function (k) { return Array.isArray(t) ? t[Number(k) - 1] : t[k]; };
		if (TEMPLATE_NAMES[t.template]) out.template = t.template;
		['size', 'gap'].forEach(function (f) { var v = cleanValue(f, t[f], PARAM_LIMITS, {}); if (v !== undefined) out[f] = v; });
		if (typeof t.showEmpty === 'boolean') out.showEmpty = t.showEmpty;
		for (var n = 1; n <= NUM_BARS; n++) {
			var e = get(String(n));
			if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
			var o = {};
			BAR_FIELDS.forEach(function (f) {
				var v = cleanValue(f, e[f], LIMITS, CHOICES);
				if (f === 'joinTo' && v === n) v = 0;
				if (v !== undefined) o[f] = v;
			});
			out[String(n)] = o;
		}
		return out;
	}
	function toLua(B) {
		var t = { template: B.template, size: whole(B.size), gap: whole(B.gap), showEmpty: !!B.showEmpty };
		for (var n = 1; n <= NUM_BARS; n++) {
			var L = B.bar[n], o = {};
			BAR_FIELDS.forEach(function (f) {
				var v = L[f];
				o[f] = typeof v === 'number' ? (LIMITS[f] ? clampTo(LIMITS[f], whole(v)) : whole(v)) : v;
			});
			t[String(n)] = o;
		}
		return t;
	}
	// a format table -> the editor's bars (HUI Bars' defaults under it: a bar or a field it does not give is Stack's)
	function fromLua(t) {
		var c = normalize(t);
		if (!c) return null;
		var B = defaults();
		if (c.template) B.template = c.template;
		if (c.size !== undefined) B.size = c.size;
		if (c.gap !== undefined) B.gap = c.gap;
		if (c.showEmpty !== undefined) B.showEmpty = c.showEmpty;
		for (var n = 1; n <= NUM_BARS; n++) {
			var e = c[String(n)];
			if (e) Object.keys(e).forEach(function (f) { B.bar[n][f] = e[f]; });
		}
		B.count = 2;
		countFromBars(B);
		B.moved = isMoved(B);
		layout(B);
		return B;
	}

	var api = {
		NUM_BARS: NUM_BARS, SCREEN: SCREEN, BAR_FIELDS: BAR_FIELDS, LIMITS: LIMITS, CHOICES: CHOICES, PARAM_LIMITS: PARAM_LIMITS,
		TEMPLATE_ORDER: TEMPLATE_ORDER, TEMPLATE_NAMES: TEMPLATE_NAMES, CHAT: { w: CHAT_W, h: CHAT_H, pad: CHAT_PAD },
		autoDown: autoDown, round: round, compute: compute, defaults: defaults, apply: apply, relayout: relayout,
		countFromBars: countFromBars, freeze: freeze, isMoved: isMoved, geometry: geometry, placedRect: placedRect,
		hitsChat: hitsChat, chatShift: chatShift, buttonCell: buttonCell, layout: layout, rootOf: rootOf, members: members, isJoined: isJoined,
		sanitize: sanitize, placeBy: placeBy, rects: rects, attach: attach, touching: touching, separate: separate,
		optionChanged: optionChanged, setBar: setBar, setParam: setParam, setTemplate: setTemplate, validField: validField,
		startDrag: startDrag, dragTo: dragTo, stopDrag: stopDrag, toLua: toLua, fromLua: fromLua, normalize: normalize,
		joinOf: joinOf, detach: detach, rejoinBar: rejoinBar, canRejoin: canRejoin,
	};
	if (typeof module !== 'undefined' && module.exports) module.exports = api;
	else root.HUIBars = api;
})(this);
