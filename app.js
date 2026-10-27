/*
 * QlooQuest UI controller. All game logic lives in engine.js; this file only
 * renders state and forwards user actions. createController takes any document-like
 * object so the same code runs under Node with a small fake DOM in the tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QlooQuestApp = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DOMAIN_COLOR = { artist: '#9a9bff', movie: '#ff6b9a', place: '#3de0c5', book: '#ffb454', brand: '#b9e35f' };
  var AGENT_CLASS = { 'Clue Extractor': 'extractor', 'Qloo Cross-Domain Correlator': 'correlator', 'Alibi Verifier': 'verifier' };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function pct(p) { return Math.round(p * 100) + '%'; }

  /* ---------- pure canvas drawing ---------- */

  function layoutNetwork(model, w, h) {
    var cx = w / 2, cy = h / 2;
    var ring = Math.min(w, h) * 0.38;
    var inner = Math.min(w, h) * 0.16;
    var pos = {};
    model.suspects.forEach(function (s, i) {
      var a = -Math.PI / 2 + (i / model.suspects.length) * Math.PI * 2;
      pos[s.id] = { x: cx + Math.cos(a) * ring, y: cy + Math.sin(a) * ring, r: 12 + s.probability * 22 };
    });
    model.entities.forEach(function (e, i) {
      var n = Math.max(1, model.entities.length);
      var a = -Math.PI / 2 + (i / n) * Math.PI * 2 + 0.3;
      var rr = n === 1 ? 0 : inner + (i % 2) * 22;
      pos[e.id] = { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, r: 9 };
    });
    return pos;
  }

  function drawNetwork(ctx, model, w, h) {
    ctx.clearRect(0, 0, w, h);
    var pos = layoutNetwork(model, w, h);
    model.links.forEach(function (l) {
      var a = pos[l.from], b = pos[l.to];
      if (!a || !b) return;
      ctx.beginPath();
      if (l.kind === 'bridge') {
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = 'rgba(149, 163, 189, 0.75)';
        ctx.lineWidth = 1.5;
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(61, 224, 197, ' + (0.08 + Math.pow(l.weight, 3) * 0.7).toFixed(3) + ')';
        ctx.lineWidth = 0.6 + l.weight * 3;
      }
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    model.suspects.forEach(function (s) {
      var p = pos[s.id];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 180, 84, ' + (0.25 + s.probability * 0.7).toFixed(3) + ')';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffb454';
      ctx.stroke();
      ctx.fillStyle = '#e8edf7';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.name.split(' ')[0] + ' ' + pct(s.probability), p.x, p.y + p.r + 16);
    });
    model.entities.forEach(function (e) {
      var p = pos[e.id];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = DOMAIN_COLOR[e.domain];
      ctx.fill();
      if (e.polarity === 'avoid') {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ff5d6c';
        ctx.stroke();
      }
      ctx.fillStyle = '#c5d0e4';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(e.name, p.x, p.y - p.r - 5);
    });
    if (!model.entities.length) {
      ctx.fillStyle = '#95a3bd';
      ctx.font = '15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Ask a witness to place the first clue on the network', w / 2, h - 22);
    }
  }

  /* ---------- controller ---------- */

  function createController(engine, doc, opts) {
    var options = opts || {};
    var els = {};
    function $(id) {
      if (!els[id]) els[id] = doc.getElementById(id);
      return els[id];
    }
    function setHTML(id, html) { var e = $(id); if (e) e.innerHTML = html; }
    function setText(id, text) { var e = $(id); if (e) e.textContent = text; }

    var ctl = {
      engine: engine,
      state: null,
      apiKey: '',
      lastCrew: null,
      selectedSuspect: null
    };

    function currentFacts() {
      return ctl.state.discovered.map(function (cid) {
        var clue = ctl.state.caseObj.clueIndex[cid];
        return clue._facts || engine.extractClue(clue);
      });
    }

    ctl.loadCase = function (id) {
      var c = engine.getCase(id);
      if (!c) return false;
      ctl.state = engine.newGame(c);
      ctl.lastCrew = null;
      ctl.selectedSuspect = null;
      ctl._cityTouched = false;
      ctl.render();
      return true;
    };

    ctl.loadGenerated = function (seed) {
      var n = Math.max(1, Math.min(999999, parseInt(seed, 10) || 1));
      ctl.state = engine.newGame(engine.generateCase(n));
      ctl.lastCrew = null;
      ctl.selectedSuspect = null;
      ctl._cityTouched = false;
      ctl.render();
      return ctl.state.caseObj.id;
    };

    ctl.askTopic = function (witnessId, topicId) {
      var res = engine.ask(ctl.state, witnessId, topicId);
      if (res.ok) ctl.lastCrew = engine.runCrew(ctl.state);
      ctl.render();
      return res;
    };

    ctl.autoStep = function () {
      var step = engine.autoStep(ctl.state);
      ctl.lastCrew = step.crew;
      ctl.render();
      return step;
    };

    ctl.solveFull = function () {
      var v = engine.solveFull(ctl.state);
      ctl.lastCrew = engine.runCrew(ctl.state);
      ctl.render();
      return v;
    };

    ctl.loadSample = function () {
      var items = engine.loadSampleTrace(ctl.state);
      ctl.render();
      return items;
    };

    ctl.setApiKey = function (key) {
      ctl.apiKey = String(key || '').trim();
      ctl.state.apiMode = ctl.apiKey ? 'live-armed' : 'local';
      ctl.render();
    };

    ctl.fetchLive = function () {
      if (!ctl.apiKey) return Promise.resolve({ ok: false, reason: 'no-api-key' });
      var ids = currentFacts().reduce(function (a, f) { return a.concat(f.entities); }, []);
      return engine.fetchQlooAffinities({ apiKey: ctl.apiKey, signalIds: ids, filterType: engine.DOMAINS.place, take: 5, fetchImpl: options.fetchImpl })
        .then(function (res) {
          if (res.ok) {
            ctl.state.apiAffinities = res.items;
            ctl.state.apiMode = 'live';
          } else {
            ctl.state.apiMode = 'live-error: ' + res.reason;
          }
          ctl.render();
          return res;
        });
    };

    ctl.openAccuse = function () {
      if (ctl.state.over) return false;
      var dlg = $('accuse-dialog');
      ctl.selectedSuspect = ctl.selectedSuspect || ctl.state.caseObj.suspects[0].id;
      ctl.renderAccuse();
      if (dlg) {
        if (typeof dlg.showModal === 'function') dlg.showModal();
        else if (dlg.setAttribute) dlg.setAttribute('open', '');
      }
      return true;
    };

    ctl.closeAccuse = function () {
      var dlg = $('accuse-dialog');
      if (!dlg) return;
      if (typeof dlg.close === 'function') dlg.close();
      else if (dlg.removeAttribute) dlg.removeAttribute('open');
    };

    ctl.pickSuspect = function (id) {
      ctl.selectedSuspect = id;
      ctl.renderAccuse();
    };

    ctl.confirmAccuse = function () {
      var city = $('accuse-city');
      var hub = city && city.value ? city.value : ctl.state.caseObj.suspects[0].hub;
      var v = engine.accuse(ctl.state, ctl.selectedSuspect || ctl.state.caseObj.suspects[0].id, hub);
      ctl.closeAccuse();
      ctl.render();
      return v;
    };

    ctl.act = function (name, arg1, arg2) {
      switch (name) {
        case 'ask': return ctl.askTopic(arg1, arg2);
        case 'pick': return ctl.pickSuspect(arg1);
        default: return null;
      }
    };

    /* ----- rendering ----- */

    ctl.renderHeader = function () {
      var st = ctl.state, c = st.caseObj;
      setText('case-title', c.title + ' (' + engine.hubById(c.crimeHub).name + ', hour ' + c.crimeHour + ')');
      setText('case-brief', c.brief);
      setText('budget-text', 'Inquiry budget: ' + (st.budget - st.spent) + ' of ' + st.budget + ' left');
      var pips = '';
      for (var i = 0; i < st.budget; i += 1) pips += '<span class="pip' + (i < st.spent ? ' spent' : '') + '"></span>';
      setHTML('budget-pips', pips);
      setText('score-line', st.over && st.verdict ? 'Final score ' + st.verdict.score + ', rank ' + st.verdict.rank : 'Clues found: ' + st.discovered.length + '. Accuse when you are sure.');
      var accuse = $('btn-accuse');
      if (accuse) accuse.disabled = !!st.over;
      ['btn-auto', 'btn-solve'].forEach(function (id) { var b = $(id); if (b) b.disabled = !!st.over; });
    };

    ctl.renderWitnesses = function () {
      var st = ctl.state, c = st.caseObj;
      var rec = ctl.lastCrew && ctl.lastCrew.recommendation ? ctl.lastCrew.recommendation : engine.recommendNext(st);
      var html = c.witnesses.map(function (w) {
        var body = w.topics.map(function (t) {
          var asked = st.asked.indexOf(w.id + ':' + t.id) !== -1;
          var clue = c.clueIndex[t.clueId];
          var suggested = rec && rec.witness.id === w.id && rec.topic.id === t.id && !asked;
          var disabled = asked || st.over || st.spent >= st.budget;
          return '<button type="button" class="topic' + (suggested ? ' suggested' : '') + '" data-act="ask" data-w="' + esc(w.id) + '" data-t="' + esc(t.id) + '"' + (disabled ? ' disabled' : '') + '>' + esc(t.question) + (suggested ? ' (crew pick)' : '') + '</button>' +
            (asked ? '<p class="answer">' + esc(clue.text) + '</p>' : '');
        }).join('');
        return '<article class="wcard"><div class="wname">' + esc(w.name) + '</div><div class="wrole">' + esc(w.role) + '</div>' + body + '</article>';
      }).join('');
      setHTML('witness-deck', html);
    };

    ctl.renderClues = function () {
      var st = ctl.state, c = st.caseObj;
      if (!st.discovered.length) { setHTML('clue-board', '<li class="empty">No evidence pinned yet.</li>'); return; }
      setHTML('clue-board', st.discovered.map(function (cid) {
        var clue = c.clueIndex[cid];
        var f = clue._facts || engine.extractClue(clue);
        return '<li class="clue">' + esc(clue.text) + '<small>Extracted as ' + esc(f.kind) + (f.entities.length ? ': ' + esc(f.entities.map(function (id) { return engine.entityById(id).name; }).join(', ')) : '') + '</small></li>';
      }).join(''));
    };

    ctl.renderMatrix = function () {
      var st = ctl.state, c = st.caseObj;
      var post = engine.posterior(st);
      var crew = ctl.lastCrew;
      var cleared = crew ? crew.cleared : [];
      var best = 0;
      post.forEach(function (p, i) { if (p > post[best]) best = i; });
      setHTML('suspect-matrix', c.suspects.map(function (s, i) {
        var badge = '';
        if (cleared.indexOf(s.id) !== -1) badge = '<span class="badge ok">alibi verified</span>';
        else if (s.alibi) badge = '<span class="badge warn">alibi unverified</span>';
        return '<div class="mrow' + (cleared.indexOf(s.id) !== -1 ? ' cleared' : '') + (i === best && st.discovered.length ? ' leader' : '') + '">' +
          '<div><div class="mname">' + esc(s.name) + badge + '</div><div class="msub">' + esc(s.job) + ', ' + esc(engine.hubById(s.hub).name) + '</div></div>' +
          '<div class="bar" role="img" aria-label="' + esc(s.name) + ' probability ' + pct(post[i]) + '"><span style="width:' + (post[i] * 100).toFixed(1) + '%"></span></div>' +
          '<div class="pct">' + pct(post[i]) + '</div></div>';
      }).join(''));
    };

    ctl.renderTrace = function () {
      var st = ctl.state;
      var rec = ctl.lastCrew && ctl.lastCrew.recommendation;
      setHTML('recommendation', rec && !st.over
        ? 'Crew recommends asking ' + esc(rec.witness.name) + ': "' + esc(rec.topic.question) + '" (expected information gain ' + rec.gain.toFixed(3) + ' bits).'
        : (st.over ? 'Case closed.' : 'Run the crew or ask a question to get a recommendation.'));
      var items = st.trace.slice(-14).reverse();
      if (!items.length) { setHTML('trace-log', '<li class="empty">The crew is idle. Ask a witness or press Auto-Step.</li>'); return; }
      setHTML('trace-log', items.map(function (t) {
        return '<li class="tr"><div class="tr-head"><span class="tr-agent ' + (AGENT_CLASS[t.agent] || '') + '">' + esc(t.agent) + '</span><span class="tr-tool">#' + t.seq + ' ' + esc(t.tool) + '</span></div><pre>' + esc(JSON.stringify(t.output, null, 1).slice(0, 520)) + '</pre></li>';
      }).join(''));
    };

    ctl.renderNetwork = function () {
      var canvas = $('taste-canvas');
      var facts = currentFacts();
      var model = engine.networkModel(ctl.state, facts);
      ctl.model = model;
      if (canvas && typeof canvas.getContext === 'function') {
        var ctx = canvas.getContext('2d');
        if (ctx) drawNetwork(ctx, model, canvas.width, canvas.height);
        if (canvas.setAttribute) canvas.setAttribute('aria-label', 'Taste network with ' + model.entities.length + ' entities and ' + model.links.filter(function (l) { return l.kind === 'bridge'; }).length + ' cross-domain bridges. Leading suspect ' + engine.topSuspect(ctl.state).suspect.name + '.');
      }
    };

    ctl.renderApi = function () {
      var mode = ctl.state.apiMode;
      var text = 'Mode: ' + (mode === 'local' ? 'local taste graph' : mode);
      if (ctl.state.apiAffinities && ctl.state.apiAffinities.length) text += '. Last response: ' + ctl.state.apiAffinities.length + ' entities.';
      setText('api-status', text);
    };

    ctl.renderAccuse = function () {
      var c = ctl.state.caseObj;
      setHTML('accuse-suspects', c.suspects.map(function (s) {
        return '<button type="button" class="choice" data-act="pick" data-w="' + esc(s.id) + '" aria-pressed="' + (ctl.selectedSuspect === s.id ? 'true' : 'false') + '">' + esc(s.name) + ', ' + esc(s.job) + '</button>';
      }).join(''));
      var sel = $('accuse-city');
      if (sel && !sel.innerHTML) {
        sel.innerHTML = engine.HUBS.map(function (h) { return '<option value="' + h.id + '">' + esc(h.name) + '</option>'; }).join('');
      }
      var chosen = c.suspects.filter(function (s) { return s.id === ctl.selectedSuspect; })[0];
      if (sel && chosen && !ctl._cityTouched) sel.value = chosen.hub;
    };

    ctl.renderVerdict = function () {
      var st = ctl.state, b = $('verdict-banner');
      if (!b) return;
      if (!st.over || !st.verdict) { b.hidden = true; b.innerHTML = ''; b.className = 'verdict'; return; }
      var v = st.verdict;
      b.hidden = false;
      b.className = 'verdict' + (v.personaOk ? '' : ' lost');
      b.innerHTML = (v.personaOk
        ? '<strong>Case solved.</strong> ' + esc(v.culpritName) + ' of ' + esc(engine.hubById(v.culpritHub).name) + (v.cityOk ? ' is the target and the city is right.' : ' is the target, but you named the wrong city.')
        : '<strong>Wrong persona.</strong> The target was ' + esc(v.culpritName) + ' of ' + esc(engine.hubById(v.culpritHub).name) + '.') +
        ' Score ' + v.score + ', rank ' + esc(v.rank) + '. Taste signature: ' + esc(v.signature.join(', ')) + '.';
    };

    ctl.renderCaseOptions = function () {
      var sel = $('case-select');
      if (!sel) return;
      var html = engine.CASES.map(function (c) { return '<option value="' + c.id + '">' + esc(c.title) + '</option>'; }).join('');
      if (ctl.state && ctl.state.caseObj.generated) html += '<option value="' + ctl.state.caseObj.id + '">' + esc(ctl.state.caseObj.title) + '</option>';
      sel.innerHTML = html;
      if (ctl.state) sel.value = ctl.state.caseObj.id;
    };

    ctl.render = function () {
      if (!ctl.state) return;
      ctl.renderCaseOptions();
      ctl.renderHeader();
      ctl.renderWitnesses();
      ctl.renderClues();
      ctl.renderMatrix();
      ctl.renderTrace();
      ctl.renderNetwork();
      ctl.renderApi();
      ctl.renderVerdict();
    };

    ctl.bind = function () {
      function on(id, type, fn) { var e = $(id); if (e && e.addEventListener) e.addEventListener(type, fn); }
      on('case-select', 'change', function (e) {
        var v = e.target.value;
        if (v.indexOf('gen-') === 0) ctl.loadGenerated(v.slice(4));
        else ctl.loadCase(v);
      });
      on('btn-generate', 'click', function () { var s = $('seed-input'); ctl.loadGenerated(s ? s.value : 1); });
      on('btn-auto', 'click', function () { ctl.autoStep(); });
      on('btn-solve', 'click', function () { ctl.solveFull(); });
      on('btn-sample', 'click', function () { ctl.loadSample(); });
      on('btn-accuse', 'click', function () { ctl.openAccuse(); });
      on('accuse-cancel', 'click', function () { ctl.closeAccuse(); });
      on('accuse-confirm', 'click', function () { ctl.confirmAccuse(); });
      on('accuse-city', 'change', function () { ctl._cityTouched = true; });
      on('api-key', 'input', function (e) { ctl.setApiKey(e.target.value); });
      ['witness-deck', 'accuse-suspects'].forEach(function (id) {
        on(id, 'click', function (e) {
          var t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
          if (!t || t.disabled) return;
          var d = t.dataset || {};
          ctl.act(d.act, d.w, d.t);
        });
      });
    };

    ctl.init = function () {
      ctl.bind();
      ctl.loadCase(engine.CASES[0].id);
      return ctl;
    };

    return ctl;
  }

  var api = { createController: createController, drawNetwork: drawNetwork, layoutNetwork: layoutNetwork, esc: esc, DOMAIN_COLOR: DOMAIN_COLOR };

  if (typeof document !== 'undefined' && typeof window !== 'undefined' && window.QlooQuest) {
    api.app = createController(window.QlooQuest, document).init();
  }
  return api;
}));
