// HUI Bar Editor: what a class learns (data.js: Forever's trainer captures + client tables). A layout is planned at
// level 60 (LAYOUT-FORMAT "Ranks and levels"), so every function's level is 60 unless a test asks another.
// A spell row: { n: name, g: school, i: icon, r: [[spellID, rank, level, talent?], ...] (rank order), t: talent,
// st: stance bar order, f: 'Cat' | 'Bear' (a druid ability that needs the form), ri: { spellID: icon },
// rc: [race keys] (0.3.1: a race-only spell, a priest's Desperate Prayer: D.races' keys) }.
(function (root) {
	'use strict';

	var MAX_LEVEL = 60;
	function lv(level) { return typeof level === 'number' ? level : MAX_LEVEL; }

	// the ranks learnt by the level (a talent's own rank counts from its level: a point spent then)
	function learnt(spell, level) { level = lv(level); return spell.r.filter(function (r) { return r[2] <= level; }); }
	function highest(spell, level) {
		var l = learnt(spell, level);
		return l.length ? l[l.length - 1] : null;
	}
	function rankEntry(spell, id) {
		for (var i = 0; i < spell.r.length; i++) if (spell.r[i][0] === id) return spell.r[i];
		return null;
	}
	function iconOf(spell, id) { return (spell.ri && spell.ri[String(id)]) || spell.i; }

	// 0.3.1: a race-only spell is the layout's race's only; with no race picked every race's is offered
	function forRace(spell, race) { return !race || !spell.rc || spell.rc.indexOf(race) >= 0; }
	// every spell offered by the level (and the race, when one is picked), with its highest rank there
	function offered(cls, level, race) {
		return cls.spells.filter(function (s) { return highest(s, level) && forRace(s, race); });
	}
	// 0.3.1: the ranks a list row can place (Harry, Oct 18: "people should be able to choose the rank"): the learnt
	// ranks' numbers, lowest first ([] for a spell with one rank or none)
	function rankChoices(spell, level) {
		var seen = {}, out = [];
		learnt(spell, level).forEach(function (r) { if (r[1] > 0 && !seen[r[1]]) { seen[r[1]] = true; out.push(r[1]); } });
		return out.length > 1 ? out : [];
	}
	// a rank by its number (the learnt one)
	function rankNumbered(spell, n, level) {
		var l = learnt(spell, level);
		for (var i = l.length - 1; i >= 0; i--) if (l[i][1] === n) return l[i];
		return null;
	}

	// a class's spell by any rank's ID, or by name
	function index(cls) {
		if (cls._byId) return cls;
		cls._byId = {};
		cls._byName = {};
		cls.spells.forEach(function (s) {
			s.r.forEach(function (r) { cls._byId[r[0]] = s; });
			cls._byName[s.n.toLowerCase()] = s;
		});
		return cls;
	}
	function byId(cls, id) { return index(cls)._byId[id] || null; }
	function byName(cls, name) { return index(cls)._byName[String(name || '').toLowerCase()] || null; }

	// the stance bar by the level, in the game's order; a later form in the same place takes it (Bear -> Dire Bear)
	function stanceBar(cls, level) {
		var places = {};
		cls.spells.forEach(function (s) {
			if (s.st === undefined) return;
			var h = highest(s, level);
			if (!h) return;
			var had = places[s.st];
			if (!had || had.r[0][2] < s.r[0][2]) places[s.st] = s;
		});
		return Object.keys(places).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return places[k]; });
	}

	// General: Attack and the class's ranged attack, Hearthstone and the items by required level (the best tier now)
	function general(data, token, level) {
		return data.general.filter(function (g) { return !g.only || g.only.indexOf(token) >= 0; }).map(function (g) {
			if (!g.item) return { n: g.n, g: 'General', i: g.i, r: g.r, general: true };
			var tiers = g.tiers.filter(function (t) { return t[1] <= lv(level); });
			if (!tiers.length) return null;
			return { n: g.n, g: 'General', item: true, tiers: tiers, i: tiers[tiers.length - 1][3], general: true };
		}).filter(Boolean);
	}

	// the school list for the filter: All, the class's schools that have a spell now, Racial, General, then Utility
	function schools(cls, list) {
		var seen = {}, out = ['All'];
		list.forEach(function (s) { seen[s.g] = true; });
		cls.schools.forEach(function (g) { if (seen[g]) out.push(g); });
		Object.keys(seen).forEach(function (g) { if (out.indexOf(g) < 0 && g !== 'General' && g !== 'Utility') out.push(g); });
		out.push('General');
		if (seen.Utility) out.push('Utility');   // 0.2.0: under the class's own schools, every class's
		return out;
	}

	var api = { MAX_LEVEL: MAX_LEVEL, learnt: learnt, highest: highest, rankEntry: rankEntry, iconOf: iconOf, offered: offered,
		forRace: forRace, rankChoices: rankChoices, rankNumbered: rankNumbered, byId: byId, byName: byName, stanceBar: stanceBar, general: general, schools: schools };
	if (typeof module !== 'undefined' && module.exports) module.exports = api;
	else root.HUISpells = api;
})(this);
