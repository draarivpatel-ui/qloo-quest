'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../engine.js');

const allClueIds = (c) => c.clues.map((k) => k.id);

test('Engine 01: twelve taste dimensions are defined', () => {
  assert.equal(Q.TAGS.length, 12);
  assert.equal(new Set(Q.TAGS).size, 12);
});

test('Engine 02: graph holds 50 entities, 10 in each of 5 domains', () => {
  assert.equal(Q.ENTITIES.length, 50);
  Q.DOMAIN_KEYS.forEach((d) => assert.equal(Q.entitiesByDomain(d).length, 10));
});

test('Engine 03: entity ids are unique and types are Qloo urn types', () => {
  assert.equal(new Set(Q.ENTITIES.map((e) => e.id)).size, 50);
  Q.ENTITIES.forEach((e) => assert.equal(e.type, Q.DOMAINS[e.domain]));
  assert.deepEqual(Object.values(Q.DOMAINS).sort(), [
    'urn:entity:artist', 'urn:entity:book', 'urn:entity:brand', 'urn:entity:movie', 'urn:entity:place'
  ]);
});

test('Engine 04: each of the 10 hubs owns exactly one entity per domain', () => {
  assert.equal(Q.HUBS.length, 10);
  Q.HUBS.forEach((h) => {
    const mine = Q.ENTITIES.filter((e) => e.hub === h.id);
    assert.equal(mine.length, 5, h.id);
    assert.equal(new Set(mine.map((e) => e.domain)).size, 5, h.id);
  });
});

test('Engine 05: hashString is deterministic and spreads inputs', () => {
  assert.equal(Q.hashString('qloo'), Q.hashString('qloo'));
  assert.notEqual(Q.hashString('qloo'), Q.hashString('qlo0'));
});

test('Engine 06: mulberry32 repeats for a seed and stays in [0,1)', () => {
  const a = Q.mulberry32(42), b = Q.mulberry32(42);
  for (let i = 0; i < 50; i += 1) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(Q.mulberry32(1)(), Q.mulberry32(2)());
});

test('Engine 07: cosine of a vector with itself is 1, orthogonal is 0', () => {
  assert.ok(Math.abs(Q.cosine([1, 2, 3], [1, 2, 3]) - 1) < 1e-12);
  assert.equal(Q.cosine([1, 0], [0, 1]), 0);
});

test('Engine 08: cosine with a zero vector is 0 rather than NaN', () => {
  assert.equal(Q.cosine([0, 0, 0], [1, 2, 3]), 0);
});

test('Engine 09: jaccard is 1 for identical strong-tag sets and 0 for disjoint ones', () => {
  assert.equal(Q.jaccard([1, 1, 0, 0], [1, 1, 0, 0]), 1);
  assert.equal(Q.jaccard([1, 0, 0, 0], [0, 0, 0, 1]), 0);
  assert.equal(Q.jaccard([0, 0], [0, 0]), 0);
});

test('Engine 10: affinity is symmetric and bounded to [0,1]', () => {
  Q.ENTITIES.slice(0, 20).forEach((a) => Q.ENTITIES.slice(20, 30).forEach((b) => {
    const x = Q.affinity(a, b);
    assert.equal(x, Q.affinity(b, a));
    assert.ok(x >= 0 && x <= 1);
  }));
});

test('Engine 11: an entity is its own nearest neighbour with affinity 1', () => {
  const e = Q.entityById('p-berlin');
  assert.equal(Q.affinity(e, e), 1);
  const near = Q.nearestEntities(e, 3);
  assert.equal(near[0].entity.id, 'p-berlin');
});

test('Engine 12: profileOf averages tag vectors and handles empty input', () => {
  const p = Q.profileOf(['a-berlin', 'p-berlin']);
  const a = Q.entityById('a-berlin'), b = Q.entityById('p-berlin');
  assert.equal(p.size, 2);
  p.vec.forEach((v, i) => assert.ok(Math.abs(v - (a.vec[i] + b.vec[i]) / 2) < 1e-5));
  assert.ok(Q.profileOf([]).vec.every((v) => v === 0));
});

test('Engine 13: nearestEntities is sorted and honours the exclude list', () => {
  const prof = Q.profileOf(['a-seattle', 'p-seattle']);
  const near = Q.nearestEntities(prof, 6, ['a-seattle', 'p-seattle']);
  assert.equal(near.length, 6);
  for (let i = 1; i < near.length; i += 1) assert.ok(near[i - 1].affinity >= near[i].affinity);
  assert.ok(near.every((n) => n.entity.id !== 'a-seattle' && n.entity.id !== 'p-seattle'));
});

test('Engine 14: findEntitiesInText matches names case-insensitively in text order', () => {
  const ids = Q.findEntitiesInText('she loved FOG SIGNAL and then kessel fugue later');
  assert.deepEqual(ids, ['m-seattle', 'a-berlin']);
});

test('Engine 15: findEntitiesInText returns nothing for plain text', () => {
  assert.deepEqual(Q.findEntitiesInText('nothing cultural here'), []);
});

test('Engine 16: extractClue reads a like clue with its domain', () => {
  const f = Q.extractClue({ id: 'x', text: 'They carried Sixteen Quiet Trains everywhere.' });
  assert.equal(f.kind, 'like');
  assert.deepEqual(f.entities, ['b-tokyo']);
  assert.deepEqual(f.domains, ['book']);
});

test('Engine 17: extractClue reads avoidance cues as avoid polarity', () => {
  const f = Q.extractClue({ id: 'x', text: 'They refused to touch Fog Signal.' });
  assert.equal(f.kind, 'avoid');
});

test('Engine 18: extractClue detects a home city only with a residence cue', () => {
  assert.equal(Q.extractClue({ id: 'x', text: 'They said they lived in Mumbai.' }).city, 'mumbai');
  assert.equal(Q.extractClue({ id: 'x', text: 'They flew to Mumbai.' }).city, null);
});

test('Engine 19: extractClue marks alibi clues from structured data', () => {
  const f = Q.extractClue({ id: 'x', text: 'A receipt in Istanbul.', alibiFor: 's3' });
  assert.equal(f.kind, 'alibi');
  assert.equal(f.alibiFor, 's3');
});

test('Engine 20: six curated cases, each with 4 suspects, 3 witnesses, 9 clues', () => {
  assert.equal(Q.CASES.length, 6);
  Q.CASES.forEach((c) => {
    assert.equal(c.suspects.length, 4, c.id);
    assert.equal(c.witnesses.length, 3, c.id);
    assert.equal(c.clues.length, 9, c.id);
    assert.ok(c.budget < c.clues.length, 'budget must force choices');
  });
});

test('Engine 21: every curated clue has the kind its author declared', () => {
  Q.CASES.forEach((c) => c.clues.forEach((k) => assert.equal(Q.extractClue(k).kind, k.kind, k.id)));
});

test('Engine 22: curated case ids and titles are unique', () => {
  assert.equal(new Set(Q.CASES.map((c) => c.id)).size, 6);
  assert.equal(new Set(Q.CASES.map((c) => c.title)).size, 6);
});

test('Engine 23: culprits are suspects and every suspect like exists in the graph', () => {
  Q.CASES.forEach((c) => {
    assert.ok(c.suspects.some((s) => s.id === c.culprit));
    c.suspects.forEach((s) => s.likes.forEach((id) => assert.ok(Q.entityById(id), id)));
    assert.ok(Q.hubById(c.crimeHub));
  });
});

test('Engine 24: culprit alibis never exist, so only innocents can be cleared', () => {
  Q.CASES.forEach((c) => {
    c.clues.filter((k) => k.alibiFor).forEach((k) => assert.notEqual(k.alibiFor, c.culprit));
  });
});

test('Engine 25: initial posterior is uniform and sums to 1', () => {
  const g = Q.newGame(Q.CASES[0]);
  const p = Q.posterior(g);
  p.forEach((x) => assert.ok(Math.abs(x - 0.25) < 1e-12));
});

test('Engine 26: with every clue found the culprit leads in all six cases', () => {
  Q.CASES.forEach((c) => {
    const post = Q.posteriorFor(c, allClueIds(c));
    const best = post.indexOf(Math.max(...post));
    assert.equal(c.suspects[best].id, c.culprit, c.id);
    assert.ok(post[best] > 0.7, c.id);
  });
});

test('Engine 27: posterior always sums to 1 as clues arrive', () => {
  const c = Q.CASES[2];
  const ids = allClueIds(c);
  for (let n = 0; n <= ids.length; n += 1) {
    const sum = Q.posteriorFor(c, ids.slice(0, n)).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
  }
});

test('Engine 28: entropy of a uniform 4-way split is 2 bits, certainty is 0', () => {
  assert.ok(Math.abs(Q.entropy([0.25, 0.25, 0.25, 0.25]) - 2) < 1e-12);
  assert.equal(Q.entropy([1, 0, 0, 0]), 0);
});

test('Engine 29: a clue that treats every suspect alike has zero expected information gain', () => {
  const ig = Q.expectedInfoGain([0.4, 0.3, 0.2, 0.1], [0.5, 0.5, 0.5, 0.5]);
  assert.ok(Math.abs(ig) < 1e-12);
});

test('Engine 30: a discriminating clue has positive expected information gain', () => {
  assert.ok(Q.expectedInfoGain([0.25, 0.25, 0.25, 0.25], [0.9, 0.1, 0.1, 0.1]) > 0.1);
});

test('Engine 31: ask spends one inquiry and records the clue', () => {
  const g = Q.newGame(Q.CASES[0]);
  const r = Q.ask(g, 'w1', 't1');
  assert.equal(r.ok, true);
  assert.equal(g.spent, 1);
  assert.deepEqual(g.discovered, [r.clue.id]);
  assert.equal(r.remaining, g.budget - 1);
});

test('Engine 32: asking the same question twice is refused and costs nothing', () => {
  const g = Q.newGame(Q.CASES[0]);
  Q.ask(g, 'w1', 't1');
  const r = Q.ask(g, 'w1', 't1');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'already-asked');
  assert.equal(g.spent, 1);
});

test('Engine 33: unknown witnesses and topics are refused', () => {
  const g = Q.newGame(Q.CASES[0]);
  assert.equal(Q.ask(g, 'w9', 't1').reason, 'unknown-topic');
  assert.equal(Q.ask(g, 'w1', 't9').reason, 'unknown-topic');
});

test('Engine 34: the inquiry budget is a hard cap', () => {
  const g = Q.newGame(Q.CASES[0]);
  const keys = [['w1', 't1'], ['w1', 't2'], ['w1', 't3'], ['w2', 't1'], ['w2', 't2'], ['w2', 't3'], ['w3', 't1']];
  const results = keys.map((k) => Q.ask(g, k[0], k[1]));
  assert.equal(results.filter((r) => r.ok).length, g.budget);
  assert.equal(results[results.length - 1].reason, 'budget-exhausted');
});

test('Engine 35: recommendNext picks an unasked topic and is null when none remain', () => {
  const g = Q.newGame(Q.CASES[1]);
  const rec = Q.recommendNext(g);
  assert.ok(rec.gain > 0);
  Q.ask(g, rec.witness.id, rec.topic.id);
  const rec2 = Q.recommendNext(g);
  assert.notEqual(rec2.witness.id + rec2.topic.id, rec.witness.id + rec.topic.id);
  const all = Q.newGame(Q.CASES[1]);
  all.asked = ['w1:t1', 'w1:t2', 'w1:t3', 'w2:t1', 'w2:t2', 'w2:t3', 'w3:t1', 'w3:t2', 'w3:t3'];
  assert.equal(Q.recommendNext(all), null);
});

test('Engine 36: runCrew logs the three agents in a fixed order', () => {
  const g = Q.newGame(Q.CASES[0]);
  Q.ask(g, 'w1', 't1');
  const crew = Q.runCrew(g);
  const agents = crew.trace.map((t) => t.agent);
  assert.equal(agents[0], 'Clue Extractor');
  assert.ok(agents.includes('Qloo Cross-Domain Correlator'));
  assert.equal(agents[agents.length - 1], 'Alibi Verifier');
  assert.deepEqual(new Set(agents).size, 3);
});

test('Engine 37: trace sequence numbers increase by one across runs', () => {
  const g = Q.newGame(Q.CASES[0]);
  Q.ask(g, 'w1', 't1');
  Q.runCrew(g);
  Q.runCrew(g);
  g.trace.forEach((t, i) => assert.equal(t.seq, i + 1));
});

test('Engine 38: the correlator tool call targets the Qloo insights endpoint', () => {
  const g = Q.newGame(Q.CASES[0]);
  Q.ask(g, 'w1', 't2');
  const crew = Q.runCrew(g);
  const call = crew.trace.find((t) => t.tool === 'qloo.insights');
  assert.ok(call.input.url.startsWith('https://hackathon.api.qloo.com/v2/insights?'));
  assert.equal(call.input.mode, 'local');
});

test('Engine 39: the alibi verifier clears a suspect only after the proof clue is found', () => {
  const c = Q.CASES[0];
  const g = Q.newGame(c);
  assert.deepEqual(Q.runCrew(g).cleared, []);
  Q.ask(g, 'w2', 't3');
  const crew = Q.runCrew(g);
  assert.deepEqual(crew.cleared, ['s4']);
  assert.ok(crew.unverified.includes('s2'));
  const post = Q.posterior(g);
  assert.ok(post[3] < 0.05);
});

test('Engine 40: autoStep asks the crew recommendation and spends one inquiry', () => {
  const g = Q.newGame(Q.CASES[3]);
  const step = Q.autoStep(g);
  assert.equal(step.done, false);
  assert.equal(g.spent, 1);
  assert.equal(step.asked.clue.id, g.discovered[0]);
});

test('Engine 41: autoStep reports done when the budget is gone', () => {
  const g = Q.newGame(Q.CASES[3]);
  for (let i = 0; i < g.budget; i += 1) Q.autoStep(g);
  assert.equal(Q.autoStep(g).done, true);
});

test('Engine 42: solveFull names the right persona and city in every curated case', () => {
  Q.CASES.forEach((c) => {
    const g = Q.newGame(c);
    const v = Q.solveFull(g);
    assert.equal(v.personaOk, true, c.id);
    assert.equal(v.cityOk, true, c.id);
    assert.ok(g.spent <= g.budget);
  });
});

test('Engine 43: solveFull never stops before four clues', () => {
  Q.CASES.forEach((c) => {
    const g = Q.newGame(c);
    Q.solveFull(g);
    assert.ok(g.spent >= 4, c.id);
  });
});

test('Engine 44: a correct accusation outscores a wrong one', () => {
  const c = Q.CASES[0];
  const good = Q.accuse(Q.newGame(c), 's2', 'berlin');
  const bad = Q.accuse(Q.newGame(c), 's1', 'tokyo');
  assert.ok(good.score > bad.score);
  assert.equal(good.personaOk, true);
  assert.equal(bad.personaOk, false);
});

test('Engine 45: naming the wrong city costs exactly 400 points', () => {
  const c = Q.CASES[0];
  const right = Q.accuse(Q.newGame(c), 's2', 'berlin');
  const wrong = Q.accuse(Q.newGame(c), 's2', 'cairo');
  assert.equal(right.score - wrong.score, 400);
  assert.equal(wrong.cityOk, false);
});

test('Engine 46: leftover inquiries add 120 points each', () => {
  const c = Q.CASES[0];
  const a = Q.newGame(c);
  const b = Q.newGame(c);
  Q.ask(b, 'w1', 't1');
  assert.equal(Q.accuse(a, 's2', 'berlin').score - Q.accuse(b, 's2', 'berlin').score, 120);
});

test('Engine 47: a closed case refuses further questions and accusations', () => {
  const g = Q.newGame(Q.CASES[0]);
  Q.accuse(g, 's2', 'berlin');
  assert.equal(Q.ask(g, 'w1', 't1').reason, 'case-closed');
  assert.equal(Q.accuse(g, 's1', 'tokyo').reason, 'case-closed');
});

test('Engine 48: rankFor maps score bands to titles', () => {
  assert.equal(Q.rankFor(2300), 'Chief Inspector');
  assert.equal(Q.rankFor(1700), 'Senior Detective');
  assert.equal(Q.rankFor(1200), 'Detective');
  assert.equal(Q.rankFor(600), 'Junior Sleuth');
  assert.equal(Q.rankFor(0), 'Trainee');
});

test('Engine 49: generateCase is deterministic per seed and differs across seeds', () => {
  const a = Q.generateCase(11), b = Q.generateCase(11), c = Q.generateCase(12);
  assert.equal(JSON.stringify(a.clues.map((k) => k.text)), JSON.stringify(b.clues.map((k) => k.text)));
  assert.equal(a.culprit, b.culprit);
  assert.notEqual(JSON.stringify(a.clues.map((k) => k.text)), JSON.stringify(c.clues.map((k) => k.text)));
  assert.equal(a.id, 'gen-11');
  assert.equal(a.generated, true);
});

test('Engine 50: 30 generated seeds are all solvable by the crew', () => {
  for (let s = 1; s <= 30; s += 1) {
    const c = Q.generateCase(s);
    assert.equal(c.suspects.length, 4);
    assert.equal(c.clues.length, 9);
    const g = Q.newGame(c);
    assert.equal(Q.solveFull(g).personaOk, true, 'seed ' + s);
  }
});

test('Engine 51: generated clues are classified as authored', () => {
  const c = Q.generateCase(5);
  c.clues.forEach((k) => assert.equal(Q.extractClue(k).kind, k.kind, k.text));
});

test('Engine 52: the Qloo request targets the hackathon insights endpoint with deduped signals', () => {
  const r = Q.buildQlooInsightsRequest({ apiKey: 'paste-your-qloo-key', signalIds: ['p-berlin', 'p-berlin', 'a-berlin'], filterType: 'urn:entity:place', take: 4 });
  assert.ok(r.url.startsWith('https://hackathon.api.qloo.com/v2/insights?'));
  assert.ok(r.url.includes('filter.type=urn%3Aentity%3Aplace'));
  assert.ok(r.url.includes('take=4'));
  assert.ok(r.url.includes('signal.interests.entities=p-berlin,a-berlin'));
  assert.deepEqual(r.signals, ['p-berlin', 'a-berlin']);
  assert.equal(r.headers['X-Api-Key'], 'paste-your-qloo-key');
  assert.equal(r.live, true);
});

test('Engine 53: without a key the request carries no key header', () => {
  const r = Q.buildQlooInsightsRequest({ signalIds: ['a-berlin'] });
  assert.equal(r.headers['X-Api-Key'], undefined);
  assert.equal(r.live, false);
});

test('Engine 54: fetchQlooAffinities refuses to run without a key', async () => {
  const res = await Q.fetchQlooAffinities({ signalIds: ['a-berlin'], fetchImpl: () => { throw new Error('must not be called'); } });
  assert.deepEqual(res, { ok: false, reason: 'no-api-key', items: [] });
});

test('Engine 55: fetchQlooAffinities parses a mocked successful response', async () => {
  let seen = null;
  const res = await Q.fetchQlooAffinities({
    apiKey: 'paste-your-qloo-key', signalIds: ['p-berlin'],
    fetchImpl: async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => Q.SAMPLE_API_TRACE.response }; }
  });
  assert.equal(res.ok, true);
  assert.equal(res.items.length, 3);
  assert.equal(res.items[0].affinity, 0.91);
  assert.equal(seen.init.headers['X-Api-Key'], 'paste-your-qloo-key');
});

test('Engine 56: fetchQlooAffinities reports HTTP and network failures', async () => {
  const http = await Q.fetchQlooAffinities({ apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 401 }) });
  assert.equal(http.reason, 'http-401');
  const net = await Q.fetchQlooAffinities({ apiKey: 'k', fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(net.ok, false);
  assert.ok(net.reason.includes('offline'));
});

test('Engine 57: parseQlooResponse tolerates empty and odd shapes', () => {
  assert.deepEqual(Q.parseQlooResponse(null), []);
  assert.deepEqual(Q.parseQlooResponse({ results: {} }), []);
  const odd = Q.parseQlooResponse({ results: { entities: [{ id: 'x', name: 'Y' }] } });
  assert.equal(odd[0].affinity, null);
});

test('Engine 58: loadSampleTrace stores the fixture and logs a correlator call', () => {
  const g = Q.newGame(Q.CASES[0]);
  const items = Q.loadSampleTrace(g);
  assert.equal(items.length, 3);
  assert.equal(g.apiMode, 'sample-fixture');
  assert.equal(g.trace[g.trace.length - 1].tool, 'qloo.insights');
  assert.ok(Q.SAMPLE_API_TRACE.note.includes('Synthetic'));
});

test('Engine 59: networkModel links suspects to every entity and bridges only cross domains', () => {
  const g = Q.newGame(Q.CASES[0]);
  Q.ask(g, 'w1', 't1');
  Q.ask(g, 'w1', 't2');
  Q.ask(g, 'w2', 't1');
  const crew = Q.runCrew(g);
  const net = crew.network;
  assert.equal(net.entities.length, 3);
  assert.equal(net.links.filter((l) => l.kind === 'suspect').length, 3 * 4);
  net.links.filter((l) => l.kind === 'bridge').forEach((l) => {
    assert.notEqual(Q.entityById(l.from).domain, Q.entityById(l.to).domain);
    assert.ok(l.weight >= 0.55);
  });
});

test('Engine 60: clue likelihood vectors stay inside (0,1]', () => {
  Q.CASES.forEach((c) => c.clues.forEach((k) => Q.clueVector(c, k).forEach((v) => assert.ok(v > 0 && v <= 1))));
});
