// HUI Bar Editor: the tutorial (0.3.0). Harry, Oct 18: "create a HUI style purple button in the top and call it
// 'Tutorial' where if you click on it, it greys out the page and creates some sequential text boxes which point to
// different parts of the app that are relevant, explaining how to do the process from start to finish. how to
// save/load/import/export. how skills replace each other in rankings as you level etc".
//
// Each step lifts ONE real part of the page (a soft purple glow round it, the rest dimmed) and puts a box beside it
// with a small arrow pointing at it; the box never covers that part and always stays on screen. 0.4.2 (Harry, Oct 18: "make
// sure to light up the corresponding button that you're referring to and maybe have a line to it"): every control a
// step's text names is lit too (a brighter ring when it sits inside the part), its word in the box is purple, and a thin
// purple line runs from the box to it with a dot at its end. A step that needs a view
// that is not open (the keyboard, the Screen view) opens it for that step. The tutorial works on a
// temporary COPY of the player's layouts (filled with a few spells when the bar is empty), and on closing puts every
// part of the page back exactly as it was: the layouts are never touched, nothing is kept in localStorage meanwhile.
(function (root) {
	'use strict';

	var Sp = root.HUISpells, Mac = root.HUIMacro, D = root.HUI_DATA;
	// the fields of the page's state the tutorial changes, put back on closing (the objects themselves, never copies)
	var KEEP = ['layouts', 'cur', 'cls', 'tab', 'sel', 'filter', 'search', 'keys', 'layer', 'capture', 'kbMode', 'kbPick', 'maker', 'view', 'selBar',
		'saveMsg', 'savePink', 'renaming', 'hot', 'forms', 'demo', 'importMsg', 'importPink', 'exportStr'];
	var SCROLLERS = ['splist', 'rcol', 'maincol', 'barscroll'];
	var HEALS = { PRIEST: 'Flash Heal', DRUID: 'Rejuvenation', PALADIN: 'Flash of Light', SHAMAN: 'Lesser Healing Wave' };

	root.HUITour = function (A) {
		var st = A.st, T = { open: false, i: 0, steps: [] };
		var saved = null, scrolls = null, demoPin = null, el = null;
		function $(id) { return document.getElementById(id); }
		function q(sel) { return document.querySelector(sel); }
		function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
		function copy(o) { return JSON.parse(JSON.stringify(o)); }

		// ------------------------------------------------------------ the demo copy
		function spellEntry(s, rank) {
			var h = Sp.highest(s);
			if (rank) s.r.forEach(function (r) { if (r[1] === rank) h = r; });
			return { t: 'spell', id: h[0], name: s.n, rank: h[1] || 0, auto: !rank };
		}
		function demoSpells() {
			return Sp.offered(A.CD()).filter(function (s) { return !s.t && s.st === undefined && !s.f && Sp.highest(s); });
		}
		// the copy of the current layout: a few spells on bar 1 when it is nearly empty, one held at a lower rank (the
		// Ranks step), one macro when it has none (the Macros step)
		function prepareDemo() {
			var L = A.cur(), sl = L.specs[0].slots, n1 = [], filled = 0;
			for (var i = 1; i <= 12; i++) {
				var n = A.slotN(1, i);
				n1.push(n);
				if (sl[n] && sl[n].t !== 'empty') filled++;
			}
			var list = demoSpells();
			if (filled < 3) {
				list.slice(0, 8).forEach(function (s, k) { sl[n1[k]] = spellEntry(s); });
				var b2 = list.slice(8, 14);
				b2.forEach(function (s, k) { sl[A.slotN(2, k + 1)] = spellEntry(s); });
			}
			// the held rank: a slot already held, else the first bar 1 spell with four ranks or more held at rank 3
			demoPin = null;
			n1.forEach(function (n) {
				var e = sl[n];
				if (!demoPin && e && e.t === 'spell' && e.auto === false && e.rank) demoPin = n;
			});
			if (!demoPin) {
				n1.forEach(function (n) {
					var e = sl[n], s = e && e.t === 'spell' ? Sp.byId(A.CD(), e.id) : null, h = s && Sp.highest(s);
					if (!demoPin && h && h[1] >= 4) { sl[n] = spellEntry(s, 3); demoPin = n; }
				});
			}
			if (!demoPin) {
				var s4 = list.filter(function (s) { var h = Sp.highest(s); return h && h[1] >= 4; })[0];
				var at = n1.filter(function (n) { return !sl[n] || sl[n].t === 'empty'; })[0] || n1[11];
				if (s4) { sl[at] = spellEntry(s4, 3); demoPin = at; }
			}
			if (!L.macros.length) {
				var heal = HEALS[st.cls] && Sp.byName(A.CD(), HEALS[st.cls]);
				var s0 = heal || list[0];
				if (s0) {
					var tpl = heal ? 'heal' : 'cast';
					var f = heal ? { on: 'friendly', spell: s0.n, rank: 0, target: true, me: true }
						: { kind: 'stop', spell: s0.n, rank: 0, slot: 13, item: '' };
					L.macros.push({ key: 'm1', name: '', icon: Sp.iconOf(s0, Sp.highest(s0)[0]),
						body: Mac.Text(tpl, f), scope: 'account' });
				}
			}
		}
		function pinPlace() {
			if (!demoPin) return { bar: 1, i: 1 };
			for (var i = 1; i <= 12; i++) if (A.slotN(1, i) === demoPin) return { bar: 1, i: i };
			return { bar: 1, i: 1 };
		}

		// ------------------------------------------------------------ the steps
		// { t: title, b: body (html), at: [elements] (none: the box in the middle), view: what the step opens }
		// 0.6.15 (Harry, Oct 25, the site going to his guild: "whittle them down so they just explain the things people might
		// miss like setting key mappings for mouse bindings (even if only a 2 side button mouse). how to quickly change
		// something into a mouseover macro. only things that really make sense to put into tutorial. ie keybind mode too"):
		// six steps, from 0.6.14's fourteen - what the page shows by itself (classes, races, the spells list, dragging, the
		// Screen, the macro maker, Export) is left to the page. 0.6.16 (Harry, Oct 25: "you don't need the 6th tutorial tab";
		// "in the macro info tutorial - explain that Account and Character tabs are there to be use, and the macros will be
		// created by the addon"): five, the last one's Next says Done
		function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
		// 0.4.2: a control the text names: its word in the lines' purple, tied by key to the step's c (the control itself)
		function w(k, t) { return '<b class="c" data-c="' + k + '">' + t + '</b>'; }
		function act(a, within) { return q((within ? within + ' ' : '') + '[data-act="' + a + '"]'); }
		function build() {
			var path = '<b>' + esc(A.PATH) + '</b>';
			return [
				// 0.6.17 (Harry, Oct 25: "i want all of the tutorial writing to be quick and informative like this. you are over
				// explaining a lot"): his own words for Mouseover macro and Keybind mode, the rest in the same few lines
				{ t: 'Mouse buttons', at: function () { return [q('.kpane')]; }, view: { keys: true },
					c: { keyboard: function () { return act('keyboard', '.band'); }, mouse: function () { return act('mousepick', '.kpane'); } },
					b: 'Mouse side buttons work like keys, even on a mouse with only two. Open ' + w('keyboard', 'Keyboard') + ', then '
						+ w('mouse', 'Mouse') + ' › Set buttons, and press each side button once.' },
				{ t: 'Keybind mode', at: function () { return [act('kbmode', '.band'), $('keyrow')].filter(Boolean); }, view: { sel: pinPlace() },
					c: { kbmode: function () { return act('kbmode', '.band'); }, layer: function () { return act('layer', '#keyrow'); } },
					b: 'Turn on ' + w('kbmode', 'Keybind mode') + ', click a button, then press its key. Escape stops. '
						+ 'Due to browsers having their own shortcuts (Ctrl + W, for example), the ' + w('layer', 'modifier') + ' must be selected from below the grid first.' },
				{ t: 'Mouseover macro', at: function () { return [$('slothead'), $('macrorow')].filter(Boolean); }, view: { sel: pinPlace() },
					c: { mo: function () { return act('momacro', '#macrorow'); } },
					b: 'Mouseover macros can be created easily by taking an ability from the left side rail and slotting it onto the grid, '
						+ 'and then clicking on the ability and pressing ' + w('mo', 'Mouseover') + '. Be sure to select <b>Account</b> or <b>Character</b> '
						+ 'from the bottom of the macro palette first.' },
				{ t: 'Ranks', at: function () { return [$('autorow'), $('rankrow')]; }, view: { sel: pinPlace() },
					c: { auto: function () { return act('auto', '#autorow'); }, pinrank: function () { return act('pinrank', '#rankrow') || q('#rankrow .rc > *'); } },
					b: 'Buttons use your highest rank and update when you train. To keep a lower rank, untick ' + w('auto', 'Auto rank')
						+ ' and pick the ' + w('pinrank', 'Rank') + '.' },
				{ t: 'Into the game', at: function () { var s = q('.foot .saves'); return [s && s.parentElement]; },
					c: { get: function () { return q('.foot .getaddon'); }, save: function () { return act('savepre', '.foot'); } },
					b: 'Unzip ' + w('get', 'HUIPresets.zip') + ' into Interface\\AddOns. Pick your race, press ' + w('save', 'Download')
						+ ', and put the file in ' + path + ', replacing the empty one. Then <b>/reload</b> in game.' },
			];
		}

		// ------------------------------------------------------------ geometry
		// what of an element can be seen: its box cut by every scrolling parent and the window
		function seen(e) {
			var r = e.getBoundingClientRect(), a = { l: r.left, t: r.top, r: r.right, b: r.bottom };
			for (var p = e.parentElement; p && p !== document.body; p = p.parentElement) {
				var cs = getComputedStyle(p);
				if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
					var pr = p.getBoundingClientRect();
					a = { l: Math.max(a.l, pr.left), t: Math.max(a.t, pr.top), r: Math.min(a.r, pr.right), b: Math.min(a.b, pr.bottom) };
				}
			}
			a = { l: Math.max(a.l, 0), t: Math.max(a.t, 0), r: Math.min(a.r, innerWidth), b: Math.min(a.b, innerHeight) };
			if (a.r <= a.l || a.b <= a.t) return null;
			return a;
		}
		function targets() {
			var s = T.steps[T.i - 1];
			if (!s || !s.at) return [];
			return s.at().filter(Boolean);
		}
		// 0.4.2: the controls the step's text names (its words marked w(...)), in the text's order
		function controls() {
			var s = T.steps[T.i - 1], out = [], had = {};
			if (!s || !s.c) return out;
			var re = /data-c="([a-z]+)"/g, m;
			while ((m = re.exec(s.b))) {
				if (had[m[1]] || !s.c[m[1]]) continue;
				had[m[1]] = 1;
				var e = s.c[m[1]]();
				if (e) out.push({ k: m[1], el: e });
			}
			return out;
		}
		// an element scrolled into sight within its own scroller when it is cut
		function bring(e) {
			var v = seen(e), r = e.getBoundingClientRect();
			if (!v || v.t > r.top + 1 || v.b < r.bottom - 1) e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		}
		// the lifted part: every target scrolled into sight within its own scroller, then their seen boxes together
		function holeRect() {
			var els = targets();
			if (!els.length) return null;
			els.forEach(bring);
			var u = null;
			els.forEach(function (e) {
				var v = seen(e);
				if (!v) return;
				u = u ? { l: Math.min(u.l, v.l), t: Math.min(u.t, v.t), r: Math.max(u.r, v.r), b: Math.max(u.b, v.b) } : v;
			});
			if (!u) return null;
			var P = 6;
			return { l: Math.max(2, u.l - P), t: Math.max(2, u.t - P), r: Math.min(innerWidth - 2, u.r + P), b: Math.min(innerHeight - 2, u.b + P) };
		}
		function apart(a, b) { return a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t; }
		function grow(a, d) { return { l: a.l - d, t: a.t - d, r: a.r + d, b: a.b + d }; }
		function inside(a, b) { return a.l >= b.l - .5 && a.r <= b.r + .5 && a.t >= b.t - .5 && a.b <= b.b + .5; }
		function clampN(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
		// an axis-aligned segment as a rect (its ends), grown by d
		function segRect(p, q2, d) {
			return { l: Math.min(p[0], q2[0]) - d, t: Math.min(p[1], q2[1]) - d, r: Math.max(p[0], q2[0]) + d, b: Math.max(p[1], q2[1]) + d };
		}
		function segHits(p, q2, r) { return !apart(segRect(p, q2, 0), r); }
		function pathHits(pts, r) {
			for (var i = 1; i < pts.length; i++) if (segHits(pts[i - 1], pts[i], r)) return true;
			return false;
		}
		// two lines apart: no segment of one within LGAP of a segment of the other
		var LGAP = 5;
		function linesClash(a, b) {
			for (var i = 1; i < a.length; i++) for (var j = 1; j < b.length; j++) {
				if (!apart(segRect(a[i - 1], a[i], LGAP), segRect(b[j - 1], b[j], 0))) return true;
			}
			return false;
		}
		// a segment within 8px of a rect's side, beside it for more than 16px
		function hugs(p, q2, r) {
			if (Math.abs(p[1] - q2[1]) < .5) {
				var o = Math.min(Math.max(p[0], q2[0]), r.r) - Math.max(Math.min(p[0], q2[0]), r.l);
				return o > 16 && (Math.abs(p[1] - r.t) < 8 || Math.abs(p[1] - r.b) < 8);
			}
			var o2 = Math.min(Math.max(p[1], q2[1]), r.b) - Math.max(Math.min(p[1], q2[1]), r.t);
			return o2 > 16 && (Math.abs(p[0] - r.l) < 8 || Math.abs(p[0] - r.r) < 8);
		}
		function pathLen(pts) {
			var n = 0;
			for (var i = 1; i < pts.length; i++) n += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
			return n;
		}

		// ------------------------------------------------------------ the lines
		// From the box's nearest edge to the control's: straight, or one elbow. Each start leaves the box square to its edge
		// and every segment stays outside it, so no line crosses the box's text. A line never runs through another lit
		// control or the arrow, and costs more for each other control of the page it crosses (and for crossing the lifted
		// part to reach a control outside it).
		var RING = 3, END = 1.5, EDGE = 12;
		function edgeSpots(lo, hi, extra) {
			var out = [], n = 9;
			if (hi < lo) return out;
			for (var i = 0; i < n; i++) out.push(lo + (hi - lo) * i / (n - 1));
			extra.forEach(function (v) { if (v >= lo && v <= hi) out.push(v); });
			return out;
		}
		function routes(b, c, env) {
			var e = grow(c.r, END), cx = (e.l + e.r) / 2, cy = (e.t + e.b) / 2, out = [];
			var yl = b.t + EDGE, yh = b.b - EDGE, xl = b.l + EDGE, xh = b.r - EDGE;
			// straight across: the control beside the box, their heights overlapping
			var y0 = Math.max(yl, e.t + 3), y1 = Math.min(yh, e.b - 3);
			if (y0 <= y1) {
				var ys = clampN(cy, y0, y1);
				[ys, y0, y1, (y0 + y1) / 2].forEach(function (y) {
					if (e.r <= b.l - 4) out.push([[b.l, y], [e.r, y]]);
					if (e.l >= b.r + 4) out.push([[b.r, y], [e.l, y]]);
				});
			}
			var x0 = Math.max(xl, e.l + 3), x1 = Math.min(xh, e.r - 3);
			if (x0 <= x1) {
				var xs = clampN(cx, x0, x1);
				[xs, x0, x1, (x0 + x1) / 2].forEach(function (x) {
					if (e.b <= b.t - 4) out.push([[x, b.t], [x, e.b]]);
					if (e.t >= b.b + 4) out.push([[x, b.b], [x, e.t]]);
				});
			}
			// out of a side, then up or down into the control's top or bottom
			var ex = [clampN(cx, e.l + 3, e.r - 3)];
			if (e.r - e.l > 40) ex.push(e.l + 12, e.r - 12);
			[['l', cx <= b.l - 10], ['r', cx >= b.r + 10]].forEach(function (sd) {
				if (!sd[1]) return;
				var sx = sd[0] === 'l' ? b.l : b.r;
				edgeSpots(yl, yh, [e.t - 14, e.b + 14, e.t - 30, e.b + 30]).forEach(function (y) {
					if (y > e.t - 8 && y < e.b + 8) return;
					ex.forEach(function (x) {
						if (sd[0] === 'l' ? x > b.l - 6 : x < b.r + 6) return;
						out.push([[sx, y], [x, y], [x, y < e.t ? e.t : e.b]]);
					});
				});
			});
			// out of the top or bottom, then across into the control's side
			var ey = [clampN(cy, e.t + 3, e.b - 3)];
			[['t', cy <= b.t - 10], ['b', cy >= b.b + 10]].forEach(function (sd) {
				if (!sd[1]) return;
				var sy = sd[0] === 't' ? b.t : b.b;
				edgeSpots(xl, xh, [e.l - 14, e.r + 14, e.l - 30, e.r + 30]).forEach(function (x) {
					if (x > e.l - 8 && x < e.r + 8) return;
					ey.forEach(function (y) {
						if (sd[0] === 't' ? y > b.t - 6 : y < b.b + 6) return;
						out.push([[x, sy], [x, y], [x < e.l ? e.l : e.r, y]]);
					});
				});
			});
			// scored; the ones that cannot be drawn dropped
			var W = innerWidth, H = innerHeight, scored = [];
			out.forEach(function (pts) {
				for (var i = 0; i < pts.length; i++) if (pts[i][0] < 1 || pts[i][1] < 1 || pts[i][0] > W - 1 || pts[i][1] > H - 1) return;
				if (env.arw && Math.abs(pts[0][0] - env.arw[0]) + Math.abs(pts[0][1] - env.arw[1]) < 16) return;
				var bad = false;
				env.ctls.forEach(function (o) { if (o !== c && !bad && pathHits(pts, grow(o.r, RING + 2))) bad = true; });
				if (bad) return;
				var cost = pathLen(pts) + (pts.length - 2) * 40;
				var last = pts.length - 1;
				env.obst.forEach(function (o) {
					if (o.el === c.el || o.el.contains(c.el) || c.el.contains(o.el)) return;
					// the last stretch may run into the control through what holds it
					if (pathHits(pts, o.r)) cost += o.wt;
				});
				if (env.hole && !c.inHole && pathHits(pts, env.hole)) cost += 600;
				// a stretch running along the lifted part's edge reads as part of its ring
				if (env.hole) for (var s2 = 1; s2 < pts.length; s2++) if (hugs(pts[s2 - 1], pts[s2], env.hole)) cost += 160;
				// a line that ends on a control's short side reads better than one that grazes its long edge
				if (Math.abs(pts[last][1] - pts[last - 1][1]) < .5 && (e.b - e.t) > 60) cost += 30;
				scored.push({ pts: pts, cost: cost });
			});
			scored.sort(function (a, b2) { return a.cost - b2.cost; });
			return scored.slice(0, 30);
		}
		// one line for each control, no two too close: the cheapest set found
		function routeAll(b, env) {
			var C = env.ctls;
			if (!C.length) return { cost: 0, paths: [] };
			var opts = C.map(function (c) { return routes(b, c, env); });
			if (opts.some(function (o) { return !o.length; })) return null;
			var order = C.map(function (c, i) { return i; }).sort(function (i, j) { return opts[i].length - opts[j].length; });
			var mins = order.map(function (i) { return opts[i][0].cost; }), rest = [];
			for (var k = order.length - 1, acc = 0; k >= 0; k--) { rest[k] = acc; acc += mins[k]; }
			var best = null, pick = [], budget = 30000;
			(function dfs(k, cost) {
				if (budget-- <= 0 || (best && cost + rest[k] >= best.cost)) return;
				if (k === order.length) { best = { cost: cost, paths: pick.slice() }; return; }
				var list = opts[order[k]];
				for (var n = 0; n < list.length; n++) {
					var o = list[n];
					if (best && cost + o.cost + rest[k] >= best.cost) break;
					var ok = true;
					for (var m = 0; m < k && ok; m++) if (linesClash(o.pts, pick[m].pts)) ok = false;
					if (!ok) continue;
					pick[k] = { i: order[k], pts: o.pts };
					dfs(k + 1, cost + o.cost);
				}
				pick.length = k;
			})(0, 0);
			if (!best) return null;
			var paths = [];
			best.paths.forEach(function (p) { paths[p.i] = p.pts; });
			return { cost: best.cost, paths: paths };
		}

		// ------------------------------------------------------------ the box's place
		// beside the lifted part (right, left, below, above; narrower at the sides if that is what fits), moved along that
		// side to make room for the lines, else the free spot nearest it; in the middle when the step points at nothing.
		// The box never covers the part or a lit control; of the places it may go, the one whose lines cost least.
		var M = 12, GAP = 16, A2 = 9;
		function arrowAt(p, hole) {
			if (!hole || !p.side) return null;
			if (p.side === 'right' || p.side === 'left') {
				var ay = clampN((hole.t + hole.b) / 2 - p.y, 14, p.h - 14);
				return [p.side === 'right' ? p.x : p.x + p.w, p.y + ay];
			}
			var ax = clampN((hole.l + hole.r) / 2 - p.x, 14, p.w - 14);
			return [p.x + ax, p.side === 'below' ? p.y : p.y + p.h];
		}
		function place(box, hole, ts, ctls, obst) {
			var W = innerWidth, H = innerHeight, w0 = Math.round(372 * ts), wmin = Math.round(290 * ts);
			var hs = {};
			var measure = function (w) {
				if (hs[w] === undefined) { box.style.width = w + 'px'; hs[w] = box.offsetHeight; }
				return hs[w];
			};
			if (!hole) {
				var hc = measure(w0);
				return { x: Math.round((W - w0) / 2), y: Math.round((H - hc) / 2), w: w0, h: hc, side: null, paths: [] };
			}
			var cy = (hole.t + hole.b) / 2, cx = (hole.l + hole.r) / 2, cands = [];
			var keepOff = [grow(hole, 4)].concat(ctls.map(function (c) { return grow(c.r, RING + 4); }));
			var free = function (p) {
				var r = { l: p.x, t: p.y, r: p.x + p.w, b: p.y + p.h };
				if (r.l < M - .5 || r.t < M - .5 || r.r > W - M + .5 || r.b > H - M + .5) return false;
				return keepOff.every(function (k) { return apart(r, k); });
			};
			var add = function (p, base) { if (free(p)) { p.base = base; cands.push(p); } };
			// along a side: its usual place, then moved by steps and to where a control's middle meets the box's edge
			var room = { right: W - M - hole.r - GAP, left: hole.l - GAP - M };
			['right', 'left'].forEach(function (sd, si) {
				var w = Math.min(w0, Math.floor(room[sd]));
				if (w < wmin) return;
				var h = measure(w);
				if (h > H - 2 * M) return;
				var lo = Math.max(M, hole.t + 20 - h), hi = Math.min(H - M - h, hole.b - 20);
				if (hi < lo) return;
				var y0 = clampN(Math.round(cy - h / 2), lo, hi), ys = [y0];
				for (var d = 24; d < H; d += 24) ys.push(y0 - d, y0 + d);
				ctls.forEach(function (c) { var m = (c.r.t + c.r.b) / 2; ys.push(m - h + 26, m - 26, c.r.b + 30 - h, c.r.t - 30); });
				var x = sd === 'right' ? Math.round(hole.r + GAP) : Math.round(hole.l - GAP - w);
				ys.forEach(function (y) {
					y = Math.round(clampN(y, lo, hi));
					add({ x: x, y: y, w: w, h: h, side: sd }, si * 40 + Math.abs(y - y0) * .35);
				});
			});
			var hb = measure(w0);
			[['below', hole.b + GAP <= H - M - hb, Math.round(hole.b + GAP)], ['above', hole.t - GAP - hb >= M, Math.round(hole.t - GAP - hb)]].forEach(function (v, vi) {
				if (!v[1]) return;
				var lo = Math.max(M, hole.l + 20 - w0), hi = Math.min(W - M - w0, hole.r - 20);
				if (hi < lo) return;
				var x0 = clampN(Math.round(cx - w0 / 2), lo, hi), xs = [x0];
				for (var d = 32; d < W; d += 32) xs.push(x0 - d, x0 + d);
				xs.forEach(function (x) {
					x = Math.round(clampN(x, lo, hi));
					add({ x: x, y: v[2], w: w0, h: hb, side: v[0] }, 80 + vi * 40 + Math.abs(x - x0) * .35);
				});
			});
			// the free spots nearest the hole: when nothing beside it is free, or nothing beside it lets every line be drawn
			var grid = function () {
				var wf = Math.min(w0, W - 2 * M), hf = measure(wf), spots = [], out = [];
				for (var y = M; y <= H - M - hf; y += 16) {
					for (var x = M; x <= W - M - wf; x += 16) {
						var p = { x: x, y: y, w: wf, h: hf, side: null };
						if (free(p)) spots.push({ p: p, d: Math.abs(x + wf / 2 - cx) + Math.abs(y + hf / 2 - cy) });
					}
				}
				spots.sort(function (a, b) { return a.d - b.d; });
				spots.slice(0, 80).forEach(function (s2) { s2.p.base = 300 + s2.d * .5; out.push(s2.p); });
				return out;
			};
			var tried = {};
			var pick = function (list) {
				list.sort(function (a, b) { return a.base - b.base; });
				var best = null;
				for (var i = 0; i < list.length; i++) {
					var c = list[i], key = c.x + ',' + c.y + ',' + c.w;
					if (tried[key]) continue;
					tried[key] = 1;
					if (best && c.base >= best.total) break;
					var b = { l: c.x, t: c.y, r: c.x + c.w, b: c.y + c.h };
					var R = routeAll(b, { ctls: ctls, obst: obst, hole: hole, arw: arrowAt(c, hole) });
					if (!R) continue;
					var total = c.base + R.cost;
					if (!best || total < best.total) { best = c; best.total = total; best.paths = R.paths; }
				}
				return best;
			};
			var best = pick(cands.slice());
			if (!best) { var g = grid(); best = pick(g); if (!cands.length) cands = g; }
			if (best) return best;
			// no place lets every line be drawn: the usual place, without lines
			var f = cands[0] || { x: M, y: M, w: Math.min(w0, W - 2 * M), h: measure(Math.min(w0, W - 2 * M)), side: null };
			f.paths = [];
			return f;
		}

		// ------------------------------------------------------------ drawing
		var SVGNS = 'http://www.w3.org/2000/svg';
		function make() {
			el = document.createElement('div');
			el.id = 'tour';
			el.innerHTML = '<div class="tour-veil"></div>'
				+ '<svg class="tour-dim" xmlns="' + SVGNS + '"><defs><mask id="tour-mask" maskUnits="userSpaceOnUse"></mask></defs>'
				+ '<rect class="tour-shade" x="0" y="0" width="100%" height="100%" mask="url(#tour-mask)"></rect></svg>'
				+ '<div class="tour-hole"></div><div class="tour-rings"></div><svg class="tour-lines" xmlns="' + SVGNS + '"></svg>'
				+ '<div class="tour-box" role="dialog"><i class="tour-arw"></i><div class="tour-top"><span class="tour-n"></span><span class="x" data-tour="close">&times;</span></div>'
				+ '<div class="tour-t"></div><div class="tour-b"></div>'
				+ '<div class="tour-f"><span class="gb s" data-tour="back">Back</span><span class="gb s p" data-tour="next">Next</span></div></div>';
			document.body.appendChild(el);
			el.addEventListener('click', function (e) {
				var b = e.target.closest('[data-tour]');
				e.stopPropagation();
				if (!b) return;
				var a = b.getAttribute('data-tour');
				if (a === 'close') T.close();
				else if (a === 'back') T.back();
				else if (a === 'next') T.next();
			});
			// nothing under the dim is clicked, dragged or scrolled while it is open
			['pointerdown', 'pointerup', 'mousedown', 'dblclick', 'contextmenu'].forEach(function (k) {
				el.addEventListener(k, function (e) { e.stopPropagation(); if (k === 'contextmenu') e.preventDefault(); });
			});
			el.addEventListener('wheel', function (e) { e.preventDefault(); e.stopPropagation(); }, { passive: false });
		}
		function rr(r, rad) {
			return '<rect x="' + r.l.toFixed(1) + '" y="' + r.t.toFixed(1) + '" width="' + (r.r - r.l).toFixed(1) + '" height="' + (r.b - r.t).toFixed(1)
				+ '" rx="' + rad + '" fill="#000"></rect>';
		}
		// a line's path, its elbow rounded a little
		function lineD(pts) {
			var f = function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); };
			if (pts.length === 2) return 'M' + f(pts[0]) + ' L' + f(pts[1]);
			var a = pts[0], c = pts[1], b = pts[2];
			var la = Math.abs(c[0] - a[0]) + Math.abs(c[1] - a[1]), lb = Math.abs(b[0] - c[0]) + Math.abs(b[1] - c[1]);
			var k = Math.min(5, la / 2, lb / 2);
			var p1 = [c[0] - Math.sign(c[0] - a[0]) * k, c[1] - Math.sign(c[1] - a[1]) * k];
			var p2 = [c[0] + Math.sign(b[0] - c[0]) * k, c[1] + Math.sign(b[1] - c[1]) * k];
			return 'M' + f(a) + ' L' + f(p1) + ' Q' + f(c) + ' ' + f(p2) + ' L' + f(b);
		}
		// what a line had better not cross: the page's other controls, and (a little less) its words, text boxes and buttons
		var OBST = [['#stage [data-act], #stage .gb, #stage input, #stage textarea', 220],
			['#stage .ch > span:first-child, #stage .rl, #stage .str, #stage .paste, #stage .code, #stage .slot, #stage .nm, #stage .ask .ri', 110]];
		function obstacles(ctls) {
			var W = innerWidth, H = innerHeight, out = [], had = new Set();
			ctls.forEach(function (c) { had.add(c.el); });
			OBST.forEach(function (o) {
				all(o[0]).forEach(function (e) {
					if (had.has(e)) return;
					had.add(e);
					var v = seen(e);
					if (!v || (v.r - v.l) * (v.b - v.t) > W * H / 12) return;
					// a heading's or a row's word: a little for the rest of its row's height too, so a line passes under or
					// over it rather than through it, and better still not along its row at all
					if (o[1] < 200 && (e.classList.contains('rl') || e.parentElement.classList.contains('ch'))) {
						var pr = e.parentElement.getBoundingClientRect();
						out.push({ el: e, r: { l: v.l, t: Math.min(v.t, pr.top), r: v.r, b: Math.max(v.b, pr.bottom) }, wt: 50 });
					}
					out.push({ el: e, r: v, wt: o[1] });
				});
			});
			return out;
		}
		var drawn = null;
		function paint() {
			if (!el) return;
			var s = T.steps[T.i - 1], n = T.steps.length;
			var ts = parseFloat(getComputedStyle($('page')).getPropertyValue('--ts')) || 1;
			var box = el.querySelector('.tour-box'), hole = el.querySelector('.tour-hole'), arw = el.querySelector('.tour-arw');
			box.style.setProperty('--tts', ts.toFixed(3));
			el.querySelector('.tour-n').textContent = T.i + ' / ' + n;
			el.querySelector('.tour-t').textContent = s.t;
			el.querySelector('.tour-b').innerHTML = s.b;
			el.querySelector('[data-tour="back"]').classList.toggle('grey', T.i === 1);
			el.querySelector('[data-tour="next"]').textContent = T.i === n ? 'Done' : 'Next';
			var tg = targets(), C = controls();
			C.forEach(function (c) { bring(c.el); });
			var r = holeRect();
			el.classList.toggle('nohole', !r);
			if (r) {
				hole.style.left = r.l + 'px'; hole.style.top = r.t + 'px';
				hole.style.width = (r.r - r.l) + 'px'; hole.style.height = (r.b - r.t) + 'px';
			}
			// the controls as they are seen now; a control that is the lifted part itself is lit by it
			var ctls = [];
			C.forEach(function (c) {
				var v = seen(c.el);
				if (!v) return;
				var self = tg.indexOf(c.el) >= 0;
				ctls.push({ k: c.k, el: c.el, r: v, self: self, inHole: !!r && inside(v, r) });
			});
			var t0 = performance.now();
			var p = place(box, r, ts, ctls, obstacles(ctls));
			T.ms = performance.now() - t0;
			box.style.width = p.w + 'px';
			box.style.left = p.x + 'px';
			box.style.top = p.y + 'px';
			box.setAttribute('data-side', p.side || '');
			// the arrow on the edge facing the part, as near its middle as the box's corners allow
			var at = arrowAt(p, r);
			if (at) {
				if (p.side === 'right' || p.side === 'left') {
					arw.style.top = (at[1] - p.y - A2 / 2 - 1) + 'px';
					arw.style.left = p.side === 'right' ? (-A2 / 2 - 1) + 'px' : (p.w - A2 / 2 - 1) + 'px';
				} else {
					arw.style.left = (at[0] - p.x - A2 / 2 - 1) + 'px';
					arw.style.top = p.side === 'below' ? (-A2 / 2 - 1) + 'px' : (p.h - A2 / 2 - 1) + 'px';
				}
			}
			// the dim, open over the part and each control; the rings; the lines with their dots
			var W = innerWidth, H = innerHeight, mask = '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fff"></rect>';
			if (r) mask += rr(r, 5);
			var rings = '';
			drawn = [];
			ctls.forEach(function (c, i) {
				var ring = grow(c.r, RING);
				if (!c.self) {
					if (!c.inHole) mask += rr(ring, 4);
					rings += '<div class="tour-lit' + (c.inHole ? ' in' : '') + '" data-c="' + c.k + '" style="left:' + ring.l + 'px;top:' + ring.t + 'px;width:'
						+ (ring.r - ring.l) + 'px;height:' + (ring.b - ring.t) + 'px"></div>';
				}
				drawn.push({ k: c.k, el: c.el, ring: c.self ? r : ring, pts: p.paths[i] || null });
			});
			el.querySelector('#tour-mask').innerHTML = mask;
			el.querySelector('.tour-rings').innerHTML = rings;
			var lines = '';
			drawn.forEach(function (d) {
				if (!d.pts) return;
				var e2 = d.pts[d.pts.length - 1];
				lines += '<path d="' + lineD(d.pts) + '" data-c="' + d.k + '"></path><circle cx="' + e2[0].toFixed(1) + '" cy="' + e2[1].toFixed(1) + '" r="2.6"></circle>';
			});
			el.querySelector('.tour-lines').innerHTML = lines;
		}

		// ------------------------------------------------------------ the page's state for a step
		function base() {
			return { keys: false, view: 'slots', filter: saved.filter, search: '', sel: copy(saved.sel || null), capture: false,
				kbMode: false, kbPick: null, renaming: null, hot: null, saveMsg: '', savePink: false };
		}
		function enter() {
			var s = T.steps[T.i - 1], b = base(), v = s.view || {};
			Object.keys(v).forEach(function (k) { b[k] = v[k]; });
			Object.keys(b).forEach(function (k) { st[k] = b[k]; });
			A.render();
			paint();
		}

		// ------------------------------------------------------------ open, step, close
		T.start = function (at) {
			if (T.open) { T.go(at || 1); return; }
			var m = $('menu');
			if (m) m.remove();
			saved = {};
			KEEP.forEach(function (k) { saved[k] = st[k]; });
			scrolls = {};
			SCROLLERS.forEach(function (id) { var e = $(id); scrolls[id] = e ? e.scrollTop : 0; });
			// the copy: the same layouts, ids and macro forms, never saved (demo) and dropped on closing
			st.demo = true;
			st.layouts = copy(saved.layouts);
			st.cur = copy(saved.cur);
			st.tab = copy(saved.tab || {});
			st.forms = copy(saved.forms || {});
			st.maker = saved.maker ? copy(saved.maker) : null;
			st.capture = false;
			st.renaming = null;
			A.cur();
			prepareDemo();
			T.steps = build();
			T.open = true;
			document.body.classList.add('touring');
			make();
			addEventListener('keydown', onKey, true);
			addEventListener('resize', onResize);
			addEventListener('scroll', onResize, true);
			T.go(at || 1);
		};
		T.go = function (i) {
			if (!T.open) return;
			T.i = Math.max(1, Math.min(T.steps.length, i | 0));
			enter();
			if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (T.open) paint(); });
		};
		T.next = function () { if (T.i >= T.steps.length) return T.close(); T.go(T.i + 1); };
		T.back = function () { if (T.i > 1) T.go(T.i - 1); };
		T.close = function () {
			if (!T.open) return;
			T.open = false;
			removeEventListener('keydown', onKey, true);
			removeEventListener('resize', onResize);
			removeEventListener('scroll', onResize, true);
			if (el) el.remove();
			drawn = null;
			el = null;
			document.body.classList.remove('touring');
			KEEP.forEach(function (k) { st[k] = saved[k]; });
			A.render();
			SCROLLERS.forEach(function (id) { var e = $(id); if (e) e.scrollTop = scrolls[id] || 0; });
			saved = null;
		};
		// the step's parts (for the UI test) and its box and hole
		T.targets = targets;
		T.rects = function () {
			if (!el) return null;
			var b = el.querySelector('.tour-box').getBoundingClientRect(), h = el.querySelector('.tour-hole').getBoundingClientRect();
			return { box: { l: b.left, t: b.top, r: b.right, b: b.bottom }, hole: el.classList.contains('nohole') ? null : { l: h.left, t: h.top, r: h.right, b: h.bottom } };
		};
		T.seen = seen;
		// 0.4.2: each named control with its ring (the lifted part's, when it is that part) and its line's points
		T.lines = function () { return drawn; };
		T.controls = controls;
		function onKey(e) {
			if (!T.open) return;
			e.stopPropagation();
			if (e.key === 'Escape') { e.preventDefault(); T.close(); }
			else if (e.key === 'ArrowRight') { e.preventDefault(); if (T.i < T.steps.length) T.next(); }
			else if (e.key === 'ArrowLeft') { e.preventDefault(); T.back(); }
		}
		var rz = 0;
		function onResize() {
			cancelAnimationFrame(rz);
			rz = requestAnimationFrame(function () { if (T.open) paint(); });
		}
		return T;
	};
})(this);
