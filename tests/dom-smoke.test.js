'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Q = require('../engine.js');
const App = require('../app.js');
const { createFakeDocument, fakeTarget } = require('./helpers/fake-dom.js');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

function mount(opts) {
  const doc = createFakeDocument();
  const ctl = App.createController(Q, doc, opts).init();
  return { doc, ctl, el: (id) => doc.els[id] };
}

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    if (d.name === '.git' || d.name === 'node_modules') return;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out); else out.push(p);
  });
  return out;
}

/* ---------- static markup ---------- */

test('DOM 01: document starts with the HTML5 doctype and lang=en', () => {
  assert.match(html.trimStart(), /^<!DOCTYPE html>/i);
  assert.match(html, /<html lang="en">/);
});

test('DOM 02: charset and responsive viewport are declared', () => {
  assert.match(html, /<meta charset="utf-8">/i);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
});

test('DOM 03: title and description meta are present and descriptive', () => {
  assert.match(html, /<title>QlooQuest[^<]{20,}<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]{60,}">/);
});

test('DOM 04: OpenGraph and Twitter tags are complete', () => {
  assert.match(html, /property="og:title"/);
  assert.match(html, /property="og:description"/);
  assert.match(html, /property="og:url" content="https:\/\/aariv\.me\/qloo-quest\/"/);
  assert.match(html, /name="twitter:card"/);
});

test('DOM 05: exactly one h1 and heading levels never skip', () => {
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  const levels = [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
  for (let i = 1; i < levels.length; i += 1) assert.ok(levels[i] <= levels[i - 1] + 1);
});

test('DOM 06: the three judge shortcuts exist with their exact labels', () => {
  assert.match(html, /id="btn-auto"[^>]*>Auto-Step Agent Deduction</);
  assert.match(html, /id="btn-solve"[^>]*>Solve Full Case</);
  assert.match(html, /id="btn-sample"[^>]*>Load Sample API Trace</);
});

test('DOM 07: core game regions have ids the controller needs', () => {
  ['taste-canvas', 'witness-deck', 'trace-log', 'suspect-matrix', 'clue-board', 'accuse-dialog', 'verdict-banner', 'api-key', 'case-select', 'budget-pips'].forEach((id) => {
    assert.ok(html.includes('id="' + id + '"'), id);
  });
});

test('DOM 08: the canvas has a text alternative and live regions announce changes', () => {
  assert.match(html, /<canvas id="taste-canvas"[^>]*role="img"[^>]*aria-label="[^"]+"/);
  assert.ok((html.match(/aria-live="polite"/g) || []).length >= 4);
});

test('DOM 09: every form control is labelled', () => {
  ['case-select', 'seed-input', 'api-key', 'accuse-city'].forEach((id) => {
    assert.match(html, new RegExp('<label[^>]*for="' + id + '"'), id);
  });
});

test('DOM 10: the page is zero-dependency, with only local scripts and no CDN', () => {
  const srcs = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(srcs, ['engine.js', 'app.js']);
  assert.ok(!/https?:\/\/[^"' ]*(cdn|unpkg|jsdelivr|googleapis)/i.test(html + css));
});

test('DOM 11: engine loads before the app, and the stylesheet is linked', () => {
  assert.ok(html.indexOf('engine.js') < html.indexOf('app.js'));
  assert.match(html, /<link rel="stylesheet" href="styles.css">/);
});

test('DOM 12: stylesheet honours reduced motion and focus visibility', () => {
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /:focus-visible/);
});

test('DOM 13: interactive controls are at least 44px tall', () => {
  assert.match(css, /\.btn\s*\{[^}]*min-height: 44px/);
  assert.match(css, /\.topic\s*\{[^}]*min-height: 44px/);
});

/* ---------- anti-slop and privacy scan of every file ---------- */

const textFiles = () => walk(root, []).filter((f) => !/\.(png|jpg|jpeg|gif|ico|woff2?)$/i.test(f));

test('DOM 14: no em dashes or en dashes anywhere in the repository', () => {
  textFiles().forEach((f) => {
    const t = fs.readFileSync(f, 'utf8');
    assert.ok(!new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']').test(t), path.relative(root, f));
  });
});

test('DOM 15: no emoji or pictographs anywhere in the repository', () => {
  textFiles().forEach((f) => {
    const t = fs.readFileSync(f, 'utf8');
    assert.ok(!/\p{Extended_Pictographic}/u.test(t), path.relative(root, f));
  });
});

test('DOM 16: no personal contact details, school names or city locators', () => {
  // Patterns are assembled from fragments so this file never contains the words it forbids.
  const banned = [['draarivpatel', '@gm', 'ail'], ['pro', 'roblox'], ['Dul', 'les'], ['Fort Set', 'tlement'], ['Sugar', ' Land'], ['Tany', 'ard'], ['@ya', 'hoo\\.']]
    .map((parts) => new RegExp(parts.join(''), 'i'));
  textFiles().forEach((f) => {
    const t = fs.readFileSync(f, 'utf8');
    banned.forEach((re) => assert.ok(!re.test(t), re + ' in ' + path.relative(root, f)));
  });
});

test('DOM 17: no uppercase eyebrow kickers in CSS or markup', () => {
  assert.ok(!/text-transform:\s*uppercase/i.test(css));
  assert.ok(!/class="[^"]*(eyebrow|kicker)[^"]*"/i.test(html));
});

test('DOM 18: required repository documents exist', () => {
  ['LICENSE', 'README.md', 'NOTES.md', 'package.json', '.nojekyll'].forEach((f) => assert.ok(fs.existsSync(path.join(root, f)), f));
  assert.match(fs.readFileSync(path.join(root, 'LICENSE'), 'utf8'), /^MIT License/);
});

test('DOM 19: package.json declares the bare node --test script', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.test, 'node --test');
  assert.deepEqual(pkg.dependencies || {}, {});
});

test('DOM 20: README discloses AI assistance and simulated Qloo calls', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /AI disclosure/i);
  assert.match(readme, /simulated|local taste graph/i);
  assert.match(readme, /not verified against the live/i);
});

/* ---------- controller behaviour on the fake DOM ---------- */

test('DOM 21: init loads the first case and renders every panel', () => {
  const { el } = mount();
  assert.match(el('case-title').textContent, /Last Train Cipher/);
  assert.match(el('witness-deck').innerHTML, /data-act="ask"/);
  assert.match(el('suspect-matrix').innerHTML, /Jonas Aigner/);
  assert.match(el('clue-board').innerHTML, /No evidence pinned yet/);
  assert.match(el('budget-text').textContent, /6 of 6 left/);
  assert.equal((el('budget-pips').innerHTML.match(/class="pip/g) || []).length, 6);
});

test('DOM 22: the case selector lists all six curated cases', () => {
  const { el } = mount();
  assert.equal((el('case-select').innerHTML.match(/<option/g) || []).length, 6);
  assert.equal(el('case-select').value, 'last-train-cipher');
});

test('DOM 23: clicking a topic through event delegation reveals the witness answer', () => {
  const { el } = mount();
  el('witness-deck').dispatch('click', { target: fakeTarget({ act: 'ask', w: 'w1', t: 't1' }) });
  assert.match(el('witness-deck').innerHTML, /class="answer"/);
  assert.match(el('clue-board').innerHTML, /Sixteen Quiet Trains/);
  assert.match(el('budget-text').textContent, /5 of 6 left/);
});

test('DOM 24: disabled topic buttons ignore clicks', () => {
  const { ctl, el } = mount();
  el('witness-deck').dispatch('click', { target: fakeTarget({ act: 'ask', w: 'w1', t: 't1' }, true) });
  assert.equal(ctl.state.spent, 0);
});

test('DOM 25: asked topics render disabled and the crew pick is flagged', () => {
  const { el } = mount();
  assert.match(el('witness-deck').innerHTML, /\(crew pick\)/);
  el('witness-deck').dispatch('click', { target: fakeTarget({ act: 'ask', w: 'w1', t: 't1' }) });
  assert.match(el('witness-deck').innerHTML, /data-t="t1" disabled/);
});

test('DOM 26: asking updates the suspect probability bars and the trace log', () => {
  const { el } = mount();
  el('witness-deck').dispatch('click', { target: fakeTarget({ act: 'ask', w: 'w1', t: 't2' }) });
  assert.match(el('trace-log').innerHTML, /Clue Extractor/);
  assert.match(el('trace-log').innerHTML, /Alibi Verifier/);
  assert.match(el('recommendation').innerHTML, /Crew recommends asking/);
  assert.match(el('suspect-matrix').innerHTML, /class="bar"/);
});

test('DOM 27: the Auto-Step button spends exactly one inquiry per press', () => {
  const { ctl, el } = mount();
  el('btn-auto').dispatch('click');
  assert.equal(ctl.state.spent, 1);
  el('btn-auto').dispatch('click');
  assert.equal(ctl.state.spent, 2);
});

test('DOM 28: Solve Full Case closes the case and shows the verdict banner', () => {
  const { ctl, el } = mount();
  el('btn-solve').dispatch('click');
  assert.equal(ctl.state.over, true);
  assert.equal(el('verdict-banner').hidden, false);
  assert.match(el('verdict-banner').innerHTML, /Case solved/);
  assert.equal(el('btn-accuse').disabled, true);
  assert.equal(el('btn-auto').disabled, true);
  assert.match(el('score-line').textContent, /Final score/);
});

test('DOM 29: Load Sample API Trace switches the Qloo mode and adds a trace entry', () => {
  const { ctl, el } = mount();
  el('btn-sample').dispatch('click');
  assert.equal(ctl.state.apiMode, 'sample-fixture');
  assert.match(el('api-status').textContent, /sample-fixture/);
  assert.match(el('trace-log').innerHTML, /qloo\.insights/);
});

test('DOM 30: changing the case resets the game', () => {
  const { ctl, el } = mount();
  el('btn-auto').dispatch('click');
  el('case-select').dispatch('change', { target: { value: 'neon-hanbok-heist' } });
  assert.equal(ctl.state.caseObj.id, 'neon-hanbok-heist');
  assert.equal(ctl.state.spent, 0);
  assert.match(el('case-title').textContent, /Neon Hanbok Heist/);
});

test('DOM 31: Generate case loads a seeded case and adds it to the selector', () => {
  const { ctl, el } = mount();
  el('seed-input').value = '21';
  el('btn-generate').dispatch('click');
  assert.equal(ctl.state.caseObj.id, 'gen-21');
  assert.match(el('case-select').innerHTML, /gen-21/);
  assert.equal(el('case-select').value, 'gen-21');
});

test('DOM 32: the accusation dialog opens, takes a pick and confirms a verdict', () => {
  const { ctl, el } = mount();
  el('btn-accuse').dispatch('click');
  assert.equal(el('accuse-dialog').open, true);
  assert.match(el('accuse-suspects').innerHTML, /Jonas Aigner/);
  el('accuse-suspects').dispatch('click', { target: fakeTarget({ act: 'pick', w: 's2' }) });
  assert.match(el('accuse-suspects').innerHTML, /data-w="s2" aria-pressed="true"/);
  assert.equal(el('accuse-city').value, 'berlin');
  el('accuse-confirm').dispatch('click');
  assert.equal(el('accuse-dialog').open, false);
  assert.equal(ctl.state.verdict.personaOk, true);
  assert.match(el('verdict-banner').innerHTML, /Jonas Aigner/);
});

test('DOM 33: a wrong persona shows the lost banner style', () => {
  const { el } = mount();
  el('btn-accuse').dispatch('click');
  el('accuse-suspects').dispatch('click', { target: fakeTarget({ act: 'pick', w: 's1' }) });
  el('accuse-confirm').dispatch('click');
  assert.match(el('verdict-banner').className, /lost/);
  assert.match(el('verdict-banner').innerHTML, /Wrong persona/);
});

test('DOM 34: Keep investigating closes the dialog without ending the case', () => {
  const { ctl, el } = mount();
  el('btn-accuse').dispatch('click');
  el('accuse-cancel').dispatch('click');
  assert.equal(el('accuse-dialog').open, false);
  assert.equal(ctl.state.over, false);
});

test('DOM 35: typing an API key arms live mode and an empty key restores local mode', () => {
  const { ctl, el } = mount();
  el('api-key').dispatch('input', { target: { value: ' paste-your-qloo-key ' } });
  assert.equal(ctl.apiKey, 'paste-your-qloo-key');
  assert.match(el('api-status').textContent, /live-armed/);
  el('api-key').dispatch('input', { target: { value: '' } });
  assert.match(el('api-status').textContent, /local taste graph/);
});

test('DOM 36: fetchLive without a key makes no network call', async () => {
  let calls = 0;
  const { ctl } = mount({ fetchImpl: async () => { calls += 1; return { ok: true, json: async () => ({}) }; } });
  const res = await ctl.fetchLive();
  assert.equal(res.ok, false);
  assert.equal(calls, 0);
});

test('DOM 37: fetchLive with a key and a mock fetch records live affinities', async () => {
  const { ctl, el } = mount({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => Q.SAMPLE_API_TRACE.response }) });
  ctl.askTopic('w1', 't1');
  ctl.setApiKey('paste-your-qloo-key');
  const res = await ctl.fetchLive();
  assert.equal(res.ok, true);
  assert.equal(ctl.state.apiMode, 'live');
  assert.match(el('api-status').textContent, /live.*3 entities/);
});

test('DOM 38: a failing live call degrades to an error mode without breaking the game', async () => {
  const { ctl, el } = mount({ fetchImpl: async () => ({ ok: false, status: 403 }) });
  ctl.setApiKey('paste-your-qloo-key');
  await ctl.fetchLive();
  assert.match(el('api-status').textContent, /live-error: http-403/);
  assert.equal(ctl.askTopic('w1', 't1').ok, true);
});

test('DOM 39: the canvas is drawn with domain colours and gets a descriptive aria-label', () => {
  const { ctl, el } = mount();
  ctl.askTopic('w1', 't1');
  ctl.askTopic('w1', 't2');
  const calls = el('taste-canvas').ctx.calls;
  assert.ok(calls.some((c) => c[0] === 'arc'));
  assert.ok(calls.some((c) => c[0] === 'fillText'));
  assert.match(el('taste-canvas').attrs['aria-label'], /2 entities/);
});

test('DOM 40: an empty network draws the prompt text instead of nodes', () => {
  const { el } = mount();
  const texts = el('taste-canvas').ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  assert.ok(texts.some((t) => /Ask a witness/.test(t)));
});

test('DOM 41: layoutNetwork places every node inside the canvas', () => {
  const g = Q.newGame(Q.CASES[0]);
  Q.ask(g, 'w1', 't1'); Q.ask(g, 'w1', 't2'); Q.ask(g, 'w2', 't1');
  const crew = Q.runCrew(g);
  const pos = App.layoutNetwork(crew.network, 760, 500);
  Object.keys(pos).forEach((k) => {
    assert.ok(pos[k].x > 0 && pos[k].x < 760, k);
    assert.ok(pos[k].y > 0 && pos[k].y < 500, k);
  });
  assert.equal(Object.keys(pos).length, 4 + 3);
});

test('DOM 42: esc neutralises markup in witness text', () => {
  assert.equal(App.esc('<b>"x" & \'y\'</b>'), '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
});

test('DOM 43: alibi proof updates the matrix badge to verified', () => {
  const { el } = mount();
  assert.match(el('suspect-matrix').innerHTML, /alibi unverified/);
  el('witness-deck').dispatch('click', { target: fakeTarget({ act: 'ask', w: 'w2', t: 't3' }) });
  assert.match(el('suspect-matrix').innerHTML, /alibi verified/);
  assert.match(el('suspect-matrix').innerHTML, /class="mrow cleared"/);
});

test('DOM 44: when the budget runs out every remaining topic is disabled', () => {
  const { ctl, el } = mount();
  for (let i = 0; i < 6; i += 1) ctl.autoStep();
  const html2 = el('witness-deck').innerHTML;
  const buttons = html2.match(/<button type="button" class="topic[^>]*>/g);
  assert.ok(buttons.every((b) => /disabled/.test(b)));
  assert.match(el('budget-text').textContent, /0 of 6 left/);
});

test('DOM 45: opening the accusation dialog after the case closed is refused', () => {
  const { ctl } = mount();
  ctl.solveFull();
  assert.equal(ctl.openAccuse(), false);
});
