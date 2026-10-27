/*
 * QlooQuest engine: a zero-dependency taste graph, three detective agents,
 * a Bayesian suspect model and an optional Qloo Insights connector.
 * UMD: works with require() in Node and as window.QlooQuest in a browser.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QlooQuest = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- deterministic helpers ---------- */

  function hashString(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function round(n, d) {
    var p = Math.pow(10, d === undefined ? 4 : d);
    return Math.round(n * p) / p;
  }

  /* ---------- taste graph ---------- */

  var TAGS = ['nocturnal', 'analog', 'spicy', 'minimal', 'communal', 'experimental',
    'nostalgic', 'luxe', 'rhythmic', 'literary', 'outdoor', 'digital'];

  var DOMAINS = {
    artist: 'urn:entity:artist',
    movie: 'urn:entity:movie',
    place: 'urn:entity:place',
    book: 'urn:entity:book',
    brand: 'urn:entity:brand'
  };
  var DOMAIN_KEYS = Object.keys(DOMAINS);
  var DOMAIN_PREFIX = { artist: 'a', movie: 'm', place: 'p', book: 'b', brand: 'r' };

  var HUBS = [
    { id: 'tokyo', name: 'Tokyo', region: 'East Asia' },
    { id: 'lagos', name: 'Lagos', region: 'West Africa' },
    { id: 'saopaulo', name: 'Sao Paulo', region: 'South America' },
    { id: 'seoul', name: 'Seoul', region: 'East Asia' },
    { id: 'mumbai', name: 'Mumbai', region: 'South Asia' },
    { id: 'mexicocity', name: 'Mexico City', region: 'North America' },
    { id: 'berlin', name: 'Berlin', region: 'Europe' },
    { id: 'cairo', name: 'Cairo', region: 'North Africa' },
    { id: 'seattle', name: 'Seattle', region: 'North America' },
    { id: 'istanbul', name: 'Istanbul', region: 'Europe and Asia' }
  ];

  // One fictional entity per domain per hub (50 total). Names are invented so the
  // game never makes claims about real artists, films, venues, books or companies.
  var RAW = {
    artist: [
      ['tokyo', 'Velvet Kintsugi', { nocturnal: 0.9, minimal: 0.7, analog: 0.6, nostalgic: 0.5 }],
      ['lagos', 'Okoro Highlife Ensemble', { rhythmic: 0.9, communal: 0.8, nostalgic: 0.6, outdoor: 0.3 }],
      ['saopaulo', 'Marisol Tambor', { rhythmic: 0.8, communal: 0.7, spicy: 0.5, outdoor: 0.4 }],
      ['seoul', 'Hanbit Static', { digital: 0.9, experimental: 0.8, nocturnal: 0.6, luxe: 0.4 }],
      ['mumbai', 'Raga Circuitry', { experimental: 0.7, rhythmic: 0.6, digital: 0.6, nostalgic: 0.4 }],
      ['mexicocity', 'Los Ceniza', { spicy: 0.8, nostalgic: 0.7, communal: 0.6, analog: 0.5 }],
      ['berlin', 'Kessel Fugue', { experimental: 0.9, nocturnal: 0.8, minimal: 0.8, digital: 0.5 }],
      ['cairo', 'Nile Lantern Orchestra', { nostalgic: 0.9, communal: 0.6, analog: 0.6, literary: 0.5 }],
      ['seattle', 'Pike Rain Quartet', { outdoor: 0.8, analog: 0.7, minimal: 0.5, literary: 0.5 }],
      ['istanbul', 'Bosphorus Drift', { nostalgic: 0.6, rhythmic: 0.6, luxe: 0.5, nocturnal: 0.5 }]
    ],
    movie: [
      ['tokyo', 'Rain Platform Nine', { nocturnal: 0.8, minimal: 0.7, literary: 0.5, analog: 0.4 }],
      ['lagos', 'Third Mainland Dawn', { communal: 0.8, rhythmic: 0.6, spicy: 0.5, outdoor: 0.4 }],
      ['saopaulo', 'Concrete Samba', { rhythmic: 0.7, communal: 0.6, experimental: 0.5, nocturnal: 0.5 }],
      ['seoul', 'Neon Hanbok', { digital: 0.8, nocturnal: 0.7, luxe: 0.6, experimental: 0.4 }],
      ['mumbai', 'Monsoon Ledger', { literary: 0.7, spicy: 0.6, nostalgic: 0.6, communal: 0.5 }],
      ['mexicocity', 'Hour of the Marigold', { nostalgic: 0.8, literary: 0.6, spicy: 0.5, communal: 0.5 }],
      ['berlin', 'Spree Silence', { minimal: 0.9, nocturnal: 0.6, experimental: 0.6, analog: 0.5 }],
      ['cairo', 'The Last Papyrus Clerk', { literary: 0.9, nostalgic: 0.8, analog: 0.6, minimal: 0.3 }],
      ['seattle', 'Fog Signal', { outdoor: 0.8, minimal: 0.6, literary: 0.5, analog: 0.5 }],
      ['istanbul', 'Ferry Between Continents', { nostalgic: 0.6, communal: 0.6, luxe: 0.5, outdoor: 0.5 }]
    ],
    place: [
      ['tokyo', 'Midnight Kissaten Annex', { nocturnal: 0.8, analog: 0.7, minimal: 0.6, nostalgic: 0.5 }],
      ['lagos', 'Lekki Rooftop Market', { communal: 0.9, spicy: 0.6, outdoor: 0.6, rhythmic: 0.5 }],
      ['saopaulo', 'Vila Courtyard Stage', { communal: 0.7, outdoor: 0.6, rhythmic: 0.6, experimental: 0.4 }],
      ['seoul', 'Seongsu Arcade Loft', { digital: 0.8, nocturnal: 0.7, luxe: 0.5, experimental: 0.5 }],
      ['mumbai', 'Marine Drive Chai Stand', { communal: 0.8, spicy: 0.6, outdoor: 0.6, nostalgic: 0.5 }],
      ['mexicocity', 'Roma Norte Mezcaleria', { spicy: 0.8, nocturnal: 0.6, nostalgic: 0.6, communal: 0.5 }],
      ['berlin', 'Kreuzberg Concrete Club', { nocturnal: 0.9, experimental: 0.8, minimal: 0.7, digital: 0.4 }],
      ['cairo', 'Khan Reading Room', { literary: 0.8, nostalgic: 0.7, analog: 0.6, minimal: 0.4 }],
      ['seattle', 'Ballard Locks Trail', { outdoor: 0.9, minimal: 0.5, analog: 0.5, literary: 0.3 }],
      ['istanbul', 'Galata Terrace Hammam', { luxe: 0.8, nostalgic: 0.6, communal: 0.5, nocturnal: 0.4 }]
    ],
    book: [
      ['tokyo', 'Sixteen Quiet Trains', { literary: 0.8, minimal: 0.8, nocturnal: 0.5, nostalgic: 0.4 }],
      ['lagos', 'Market Women of the Lagoon', { communal: 0.8, literary: 0.6, rhythmic: 0.5, spicy: 0.4 }],
      ['saopaulo', 'Atlas of Loud Rooftops', { experimental: 0.6, communal: 0.6, rhythmic: 0.5, literary: 0.5 }],
      ['seoul', 'Source Code for a Ghost', { digital: 0.8, experimental: 0.7, literary: 0.6, nocturnal: 0.5 }],
      ['mumbai', 'A Thousand Receipts', { literary: 0.7, nostalgic: 0.7, communal: 0.5, spicy: 0.4 }],
      ['mexicocity', 'Salt and Marigold', { nostalgic: 0.8, literary: 0.7, spicy: 0.6, analog: 0.4 }],
      ['berlin', 'The Concrete Archivist', { minimal: 0.7, experimental: 0.7, literary: 0.6, nocturnal: 0.5 }],
      ['cairo', 'Ink for the Nile Scribes', { literary: 0.9, nostalgic: 0.7, analog: 0.7, luxe: 0.3 }],
      ['seattle', 'Field Notes from Rain', { outdoor: 0.8, literary: 0.7, analog: 0.6, minimal: 0.5 }],
      ['istanbul', 'Tea Glass Chronicles', { nostalgic: 0.7, communal: 0.6, literary: 0.6, luxe: 0.4 }]
    ],
    brand: [
      ['tokyo', 'Shirogane Stationers', { analog: 0.8, minimal: 0.8, nostalgic: 0.5, luxe: 0.4 }],
      ['lagos', 'Adire Loom Collective', { communal: 0.7, luxe: 0.5, nostalgic: 0.5, outdoor: 0.3 }],
      ['saopaulo', 'Praia Brasa Sandals', { outdoor: 0.7, rhythmic: 0.5, communal: 0.5, spicy: 0.4 }],
      ['seoul', 'Hanrim Skin Lab', { luxe: 0.8, digital: 0.6, minimal: 0.6, nocturnal: 0.3 }],
      ['mumbai', 'Chowk Spice Co', { spicy: 0.9, communal: 0.6, nostalgic: 0.6, outdoor: 0.3 }],
      ['mexicocity', 'Talavera Ember Candles', { nostalgic: 0.7, analog: 0.6, spicy: 0.5, luxe: 0.5 }],
      ['berlin', 'Oderberg Modular Audio', { experimental: 0.8, digital: 0.7, minimal: 0.7, analog: 0.5 }],
      ['cairo', 'Fayoum Linen House', { luxe: 0.7, nostalgic: 0.6, analog: 0.6, minimal: 0.5 }],
      ['seattle', 'Cascade Trail Outfitters', { outdoor: 0.9, minimal: 0.6, analog: 0.5, communal: 0.3 }],
      ['istanbul', 'Kapali Carpet Atelier', { luxe: 0.8, nostalgic: 0.8, analog: 0.6, communal: 0.4 }]
    ]
  };

  function vecOf(tags) {
    return TAGS.map(function (t) { return tags[t] || 0; });
  }

  var ENTITIES = [];
  var ENTITY_INDEX = {};
  DOMAIN_KEYS.forEach(function (dk) {
    RAW[dk].forEach(function (row) {
      var e = {
        id: DOMAIN_PREFIX[dk] + '-' + row[0],
        domain: dk,
        type: DOMAINS[dk],
        hub: row[0],
        name: row[1],
        tags: row[2],
        vec: vecOf(row[2])
      };
      ENTITIES.push(e);
      ENTITY_INDEX[e.id] = e;
    });
  });

  var HUB_INDEX = {};
  HUBS.forEach(function (h) { HUB_INDEX[h.id] = h; });

  function entityById(id) { return ENTITY_INDEX[id] || null; }
  function hubById(id) { return HUB_INDEX[id] || null; }

  function cosine(a, b) {
    var dot = 0, na = 0, nb = 0;
    for (var i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (!na || !nb) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  function tagSet(vec, threshold) {
    var out = [];
    for (var i = 0; i < vec.length; i += 1) if (vec[i] >= threshold) out.push(i);
    return out;
  }

  function jaccard(a, b, threshold) {
    var t = threshold === undefined ? 0.3 : threshold;
    var sa = tagSet(a, t), sb = tagSet(b, t);
    if (!sa.length && !sb.length) return 0;
    var inter = sa.filter(function (x) { return sb.indexOf(x) !== -1; }).length;
    var union = sa.length + sb.length - inter;
    return union ? inter / union : 0;
  }

  // Blend of the two measures: 70 percent cosine on weighted tag vectors, 30 percent
  // Jaccard on the strong-tag sets. Both inputs are objects with a `vec` array.
  function affinity(a, b) {
    return round(0.7 * cosine(a.vec, b.vec) + 0.3 * jaccard(a.vec, b.vec), 6);
  }

  function profileOf(likeIds) {
    var vec = new Array(TAGS.length).fill(0);
    var n = 0;
    likeIds.forEach(function (id) {
      var e = ENTITY_INDEX[id];
      if (!e) return;
      n += 1;
      for (var i = 0; i < vec.length; i += 1) vec[i] += e.vec[i];
    });
    if (n) for (var j = 0; j < vec.length; j += 1) vec[j] = round(vec[j] / n, 6);
    return { vec: vec, size: n };
  }

  function entitiesByDomain(domain) {
    return ENTITIES.filter(function (e) { return e.domain === domain; });
  }

  function nearestEntities(profile, take, excludeIds) {
    var skip = excludeIds || [];
    return ENTITIES
      .filter(function (e) { return skip.indexOf(e.id) === -1; })
      .map(function (e) { return { entity: e, affinity: affinity(profile, e) }; })
      .sort(function (x, y) { return y.affinity - x.affinity || (x.entity.id < y.entity.id ? -1 : 1); })
      .slice(0, take || 5);
  }

  /* ---------- Agent 1 helpers: clue extraction ---------- */

  var NAME_INDEX = ENTITIES.map(function (e) { return { id: e.id, lower: e.name.toLowerCase() }; })
    .sort(function (a, b) { return b.lower.length - a.lower.length; });

  var AVOID_CUE = /\b(never|refused|refuses|walked out|hates?|hated|avoids?|scoffed|can't stand|turned down)\b/i;

  function hubCityFrom(text) {
    for (var i = 0; i < HUBS.length; i += 1) {
      var re = new RegExp('\\b(lives in|lived in|based in|moved to|home is in|flat in|resident of)\\s+' + HUBS[i].name + '\\b', 'i');
      if (re.test(text)) return HUBS[i].id;
    }
    return null;
  }

  function findEntitiesInText(text) {
    var lower = String(text).toLowerCase();
    var found = [];
    NAME_INDEX.forEach(function (n) {
      var at = lower.indexOf(n.lower);
      if (at !== -1 && found.every(function (f) { return f.id !== n.id; })) found.push({ id: n.id, at: at });
    });
    return found.sort(function (a, b) { return a.at - b.at; }).map(function (f) { return f.id; });
  }

  function extractClue(clue) {
    var text = clue.text || '';
    var entities = findEntitiesInText(text);
    var city = hubCityFrom(text);
    var polarity = AVOID_CUE.test(text) ? 'avoid' : 'like';
    var kind = city ? 'city' : (clue.alibiFor ? 'alibi' : (entities.length ? polarity : 'none'));
    return {
      clueId: clue.id,
      kind: kind,
      entities: entities,
      domains: entities.map(function (id) { return ENTITY_INDEX[id].domain; }),
      city: city,
      alibiFor: clue.alibiFor || null
    };
  }

  /* ---------- Bayesian model ---------- */

  var SHARPNESS = 3;   // exponent that turns affinity into a likelihood with real contrast
  var FLOOR = 0.03;    // no suspect is ever fully excluded by a single taste clue
  var CITY_MATCH = 0.9;
  var CITY_MISS = 0.1;
  var ALIBI_CLEARED = 0.02;

  function suspectProfile(suspect) {
    if (!suspect._profile) suspect._profile = profileOf(suspect.likes);
    return suspect._profile;
  }

  function likeLikelihood(suspect, entityId, polarity) {
    var a = affinity(suspectProfile(suspect), ENTITY_INDEX[entityId]);
    var base = polarity === 'avoid' ? 1 - a : a;
    return FLOOR + (1 - FLOOR) * Math.pow(base, SHARPNESS);
  }

  function clueVector(caseObj, clue) {
    var f = clue._facts || (clue._facts = extractClue(clue));
    return caseObj.suspects.map(function (s) {
      var l = 1;
      if (f.kind === 'like' || f.kind === 'avoid') {
        f.entities.forEach(function (id) { l *= likeLikelihood(s, id, f.kind); });
      } else if (f.kind === 'city') {
        l *= s.hub === f.city ? CITY_MATCH : CITY_MISS;
      } else if (f.kind === 'alibi') {
        if (f.alibiFor === s.id && s.alibi && s.alibi.hub !== caseObj.crimeHub) l *= ALIBI_CLEARED;
      }
      return l;
    });
  }

  function normalize(arr) {
    var sum = arr.reduce(function (a, b) { return a + b; }, 0);
    if (!sum) return arr.map(function () { return 1 / arr.length; });
    return arr.map(function (x) { return x / sum; });
  }

  function entropy(p) {
    var h = 0;
    p.forEach(function (x) { if (x > 0) h -= x * Math.log2(x); });
    return h;
  }

  function posteriorFor(caseObj, clueIds) {
    var post = caseObj.suspects.map(function () { return 1 / caseObj.suspects.length; });
    clueIds.forEach(function (cid) {
      var clue = caseObj.clueIndex[cid];
      if (!clue) return;
      var v = clueVector(caseObj, clue);
      post = normalize(post.map(function (p, i) { return p * v[i]; }));
    });
    return post;
  }

  function posterior(state) { return posteriorFor(state.caseObj, state.discovered); }

  function expectedInfoGain(post, vec) {
    var p = 0;
    for (var i = 0; i < post.length; i += 1) p += post[i] * vec[i];
    var pos = normalize(post.map(function (x, i) { return x * vec[i]; }));
    var neg = normalize(post.map(function (x, i) { return x * (1 - vec[i]); }));
    var hNeg = p >= 1 ? 0 : entropy(neg);
    return entropy(post) - (p * entropy(pos) + (1 - p) * hNeg);
  }

  /* ---------- cases ---------- */

  function N(id) { return ENTITY_INDEX[id].name; }

  function buildCase(def) {
    var suspects = def.suspects.map(function (s) {
      return { id: s.id, name: s.name, hub: s.hub, job: s.job, likes: s.likes, alibi: s.alibi || null };
    });
    var clues = [];
    var witnesses = def.witnesses.map(function (w, wi) {
      return {
        id: w.id,
        name: w.name,
        role: w.role,
        topics: w.topics.map(function (t, ti) {
          var clue = {
            id: def.id + '-k' + (wi * 3 + ti + 1),
            witness: w.id,
            question: t[0],
            kind: t[1],
            text: t[2],
            alibiFor: t[3] || null
          };
          clues.push(clue);
          return { id: 't' + (ti + 1), question: t[0], clueId: clue.id };
        })
      };
    });
    var clueIndex = {};
    clues.forEach(function (c) { clueIndex[c.id] = c; });
    return {
      id: def.id,
      title: def.title,
      brief: def.brief,
      crimeHub: def.crimeHub,
      crimeHour: def.crimeHour,
      budget: def.budget,
      culprit: def.culprit,
      suspects: suspects,
      witnesses: witnesses,
      clues: clues,
      clueIndex: clueIndex,
      generated: !!def.generated
    };
  }

  var CASE_DEFS = [
    {
      id: 'last-train-cipher', title: 'The Last Train Cipher', crimeHub: 'tokyo', crimeHour: 23, budget: 6, culprit: 's2',
      brief: 'A rare notebook of timetable ciphers vanished from the Shibuya line office at 23:00. Four people had access. Their cities and their taste fingerprints do not all agree.',
      suspects: [
        { id: 's1', name: 'Rei Tachibana', hub: 'tokyo', job: 'Station archivist', likes: ['a-tokyo', 'p-tokyo', 'b-tokyo', 'r-tokyo', 'm-tokyo'] },
        { id: 's2', name: 'Jonas Aigner', hub: 'berlin', job: 'Visiting signal engineer', likes: ['a-berlin', 'p-berlin', 'm-berlin', 'r-berlin', 'b-tokyo'], alibi: { hub: 'istanbul', claim: 'Claims a hotel stay in Istanbul, no proof on file' } },
        { id: 's3', name: 'Dahye Seo', hub: 'seoul', job: 'Rail data analyst', likes: ['a-seoul', 'p-seoul', 'm-seoul', 'b-seoul', 'r-tokyo'], alibi: { hub: 'seoul', claim: 'Says she was at a Seoul gym' } },
        { id: 's4', name: 'Anneke Visser', hub: 'seattle', job: 'Exchange student', likes: ['a-seattle', 'p-seattle', 'b-seattle', 'r-seattle', 'm-tokyo'], alibi: { hub: 'seattle', claim: 'Says she was on a Seattle ferry' } }
      ],
      witnesses: [
        { id: 'w1', name: 'Aoi', role: 'Ticket clerk', topics: [
          ['What did they read while waiting?', 'like', 'On the platform they kept ' + N('b-tokyo') + ' open and read the same page twice.'],
          ['Any music leaking from their headphones?', 'like', 'A tinny drone leaked out, I recognised ' + N('a-berlin') + ' from a club night my cousin dragged me to.'],
          ['How did they pay?', 'city', 'The card reader flagged a foreign billing address. They said they were based in Berlin for work.']
        ] },
        { id: 'w2', name: 'Mrs. Kubo', role: 'Kissaten owner', topics: [
          ['Did they leave anything behind?', 'like', 'A festival wristband for ' + N('p-berlin') + ', still on their arm from the weekend.'],
          ['What did they carry?', 'like', 'A tote stamped ' + N('r-berlin') + ', heavy with modular gear.'],
          ['Can anyone be ruled out?', 'alibi', 'The ferry log shows Anneke Visser boarding in Seattle at 22:10 and docking at 01:00, so she was on the water.', 's4']
        ] },
        { id: 'w3', name: 'Hideo', role: 'Cinema usher', topics: [
          ['Which screening did they ask about?', 'like', 'They asked if ' + N('m-berlin') + ' was still showing and looked crushed when it was not.'],
          ['Did anything put them off?', 'avoid', 'They walked out of ' + N('m-seoul') + ' ten minutes in and called it too glossy.'],
          ['Any other alibi on file?', 'alibi', 'A gym turnstile in Seoul stamped Dahye Seo at 23:05, which is impossible to fake from Tokyo.', 's3']
        ] }
      ]
    },
    {
      id: 'rooftop-market-fraud', title: 'The Rooftop Market Fraud', crimeHub: 'lagos', crimeHour: 14, budget: 6, culprit: 's3',
      brief: 'Forged vendor passes flooded a Lekki rooftop market at midday. The forger signed nothing, but left taste fingerprints behind.',
      suspects: [
        { id: 's1', name: 'Chidi Eze', hub: 'lagos', job: 'Market warden', likes: ['a-lagos', 'p-lagos', 'm-lagos', 'b-lagos', 'r-lagos'] },
        { id: 's2', name: 'Priya Raman', hub: 'mumbai', job: 'Spice wholesaler', likes: ['a-mumbai', 'p-mumbai', 'r-mumbai', 'b-mumbai', 'm-lagos'] },
        { id: 's3', name: 'Camila Duarte', hub: 'saopaulo', job: 'Print shop designer', likes: ['a-saopaulo', 'p-saopaulo', 'm-saopaulo', 'r-saopaulo', 'b-lagos'] },
        { id: 's4', name: 'Sofia Reyes', hub: 'mexicocity', job: 'Textile buyer', likes: ['a-mexicocity', 'p-mexicocity', 'b-mexicocity', 'r-mexicocity', 'm-mumbai'], alibi: { hub: 'mexicocity', claim: 'Says she was at a trade fair in Mexico City' } }
      ],
      witnesses: [
        { id: 'w1', name: 'Bisi', role: 'Pass booth attendant', topics: [
          ['What was playing when the forger visited?', 'like', 'Someone hummed along to ' + N('a-saopaulo') + ' the whole time they waited.'],
          ['Where did they say they hang out?', 'like', 'They bragged about an evening at ' + N('p-saopaulo') + ' and invited me along.'],
          ['What was their paper stock?', 'like', 'The ink came in a tin from ' + N('r-saopaulo') + ', not sold anywhere near here.']
        ] },
        { id: 'w2', name: 'Uncle Tayo', role: 'Fabric stallholder', topics: [
          ['What did they talk about?', 'like', 'They quoted ' + N('m-saopaulo') + ' for ten minutes, every scene.'],
          ['Anything left on the stall?', 'like', 'A flyer for ' + N('m-lagos') + ', but they said they only picked it up for the ink colour.'],
          ['Did anything offend them?', 'avoid', 'They refused a sample of ' + N('r-mumbai') + ' and said the smell gave them a headache.']
        ] },
        { id: 'w3', name: 'Ngozi', role: 'Bookseller', topics: [
          ['What did they browse?', 'like', 'They paged through ' + N('b-lagos') + ' and bought two copies.'],
          ['Where were they staying?', 'city', 'Their invoice listed an address where they said they lived in Sao Paulo and were flying home soon.'],
          ['Can anyone be ruled out?', 'alibi', 'Fair records show Sofia Reyes badge-scanned at a trade fair in Mexico City at 14:05.', 's4']
        ] }
      ]
    },
    {
      id: 'neon-hanbok-heist', title: 'The Neon Hanbok Heist', crimeHub: 'seoul', crimeHour: 2, budget: 6, culprit: 's4',
      brief: 'A runway archive of light-up garments disappeared from a Seongsu loft at 02:00. The thief blended in, but cannot hide what they love.',
      suspects: [
        { id: 's1', name: 'Min-jae Park', hub: 'seoul', job: 'Loft curator', likes: ['a-seoul', 'm-seoul', 'p-seoul', 'b-seoul', 'r-seoul'] },
        { id: 's2', name: 'Lukas Brandt', hub: 'berlin', job: 'Sound designer', likes: ['a-berlin', 'p-berlin', 'm-berlin', 'b-berlin', 'r-seoul'] },
        { id: 's3', name: 'Selin Aksoy', hub: 'istanbul', job: 'Fashion buyer', likes: ['a-istanbul', 'p-istanbul', 'm-istanbul', 'b-istanbul', 'r-istanbul'], alibi: { hub: 'istanbul', claim: 'Says she was at a late dinner in Istanbul' } },
        { id: 's4', name: 'Haruka Mori', hub: 'tokyo', job: 'Stationery maker', likes: ['a-tokyo', 'p-tokyo', 'r-tokyo', 'b-seoul', 'm-berlin'] }
      ],
      witnesses: [
        { id: 'w1', name: 'Gyu', role: 'Loft security', topics: [
          ['What did they hum on the stairs?', 'like', 'They hummed ' + N('a-tokyo') + ', very softly, like a lullaby.'],
          ['What did they ask the front desk?', 'like', 'They wanted directions to ' + N('p-tokyo') + ' for a post-midnight coffee.'],
          ['What did they carry in?', 'like', 'A neat satchel with a ' + N('r-tokyo') + ' notebook sticking out.']
        ] },
        { id: 'w2', name: 'Yerin', role: 'Runway model', topics: [
          ['What did they read in the green room?', 'like', 'They had ' + N('b-seoul') + ' folded in half, highlighting lines.'],
          ['Anything left in the green room?', 'like', 'A ' + N('r-seoul') + ' sample jar, which could have been planted.'],
          ['Did anything annoy them?', 'avoid', 'They scoffed at the ' + N('r-istanbul') + ' rug display, said it was all show.']
        ] },
        { id: 'w3', name: 'Doyun', role: 'Ticket scanner', topics: [
          ['Which film did they mention?', 'like', 'They cited ' + N('m-berlin') + ' as their all-time favourite.'],
          ['Where was their registered address?', 'city', 'Their guest form said they lived in Tokyo and had flown in that morning.'],
          ['Can anyone be ruled out?', 'alibi', 'A dinner receipt in Istanbul timestamped 01:50 belongs to Selin Aksoy, with her signature.', 's3']
        ] }
      ]
    },
    {
      id: 'papyrus-clerk-forgery', title: 'The Papyrus Clerk Forgery', crimeHub: 'cairo', crimeHour: 10, budget: 6, culprit: 's3',
      brief: 'A century-old ledger was swapped for a flawless fake in a Khan reading room. The forger loves old things, which narrows nothing at first.',
      suspects: [
        { id: 's1', name: 'Layla Mansour', hub: 'cairo', job: 'Reading room curator', likes: ['a-cairo', 'p-cairo', 'm-cairo', 'b-cairo', 'r-cairo'] },
        { id: 's2', name: 'Mateo Ortiz', hub: 'mexicocity', job: 'Conservator', likes: ['a-mexicocity', 'p-mexicocity', 'm-mexicocity', 'b-mexicocity', 'r-mexicocity'] },
        { id: 's3', name: 'Ece Yildiz', hub: 'istanbul', job: 'Rare book dealer', likes: ['a-istanbul', 'p-istanbul', 'b-istanbul', 'r-istanbul', 'm-cairo'] },
        { id: 's4', name: 'Ingrid Solheim', hub: 'seattle', job: 'Paper historian', likes: ['a-seattle', 'p-seattle', 'b-seattle', 'r-seattle', 'm-cairo'], alibi: { hub: 'seattle', claim: 'Says she was giving a lecture in Seattle' } }
      ],
      witnesses: [
        { id: 'w1', name: 'Hassan', role: 'Reading room guard', topics: [
          ['What music did the visitor play?', 'like', 'Their phone chimed ' + N('a-istanbul') + ' when they forgot to silence it.'],
          ['Where did they say they spent the evening before?', 'like', 'They mentioned soaking at ' + N('p-istanbul') + ' with a glass of tea.'],
          ['What was in their bag?', 'like', 'A folded ' + N('r-istanbul') + ' runner, wrapped like a gift.']
        ] },
        { id: 'w2', name: 'Mona', role: 'Tea seller', topics: [
          ['What did they read?', 'like', 'They kept ' + N('b-istanbul') + ' in one hand, even while paying.'],
          ['What film did they quote?', 'like', 'They kept quoting ' + N('m-cairo') + ', which is a local favourite so no one noticed.'],
          ['Anything they refused?', 'avoid', 'They refused the ' + N('r-seattle') + ' fleece raffle prize, said they hated synthetic fabric.']
        ] },
        { id: 'w3', name: 'Dr. Fahmy', role: 'Archive director', topics: [
          ['Did anyone leave a note about the swap?', 'like', 'A note in the ledger slot cited ' + N('b-cairo') + ', which looks like a deliberate decoy.'],
          ['Where does the visitor live?', 'city', 'Their reader card says they lived in Istanbul and visited twice a year.'],
          ['Can anyone be ruled out?', 'alibi', 'A lecture hall roster in Seattle lists Ingrid Solheim as speaker at 10:00 local noon, three time zones away.', 's4']
        ] }
      ]
    },
    {
      id: 'fog-signal-blackout', title: 'The Fog Signal Blackout', crimeHub: 'seattle', crimeHour: 4, budget: 6, culprit: 's2',
      brief: 'The harbour lights near the locks went dark at 04:00 and a lock-gate log was wiped. Someone local-looking was not local.',
      suspects: [
        { id: 's1', name: 'Wren Calloway', hub: 'seattle', job: 'Lock keeper', likes: ['a-seattle', 'p-seattle', 'm-seattle', 'b-seattle', 'r-seattle'] },
        { id: 's2', name: 'Kenji Arai', hub: 'tokyo', job: 'Marine electrician', likes: ['a-tokyo', 'p-tokyo', 'b-tokyo', 'r-tokyo', 'm-seattle'] },
        { id: 's3', name: 'Tunde Bakare', hub: 'lagos', job: 'Port inspector', likes: ['a-lagos', 'p-lagos', 'm-lagos', 'b-lagos', 'r-seattle'], alibi: { hub: 'lagos', claim: 'Says he was on a video call from Lagos' } },
        { id: 's4', name: 'Aylin Demir', hub: 'istanbul', job: 'Harbour pilot', likes: ['a-istanbul', 'p-istanbul', 'm-istanbul', 'b-seattle', 'r-istanbul'] }
      ],
      witnesses: [
        { id: 'w1', name: 'Marta', role: 'Night ferry deckhand', topics: [
          ['What was the stranger listening to?', 'like', 'Earbuds leaking ' + N('a-tokyo') + ', slow and nocturnal.'],
          ['Where were they headed?', 'like', 'They asked how to find ' + N('p-tokyo') + ' style places in this town, kissaten vibes.'],
          ['What was on their keychain?', 'like', 'A tiny ' + N('r-tokyo') + ' pencil, the kind you only buy in one country.']
        ] },
        { id: 'w2', name: 'Gus', role: 'Lockside cafe owner', topics: [
          ['What did they read over coffee?', 'like', 'They had ' + N('b-tokyo') + ' dog-eared to the last chapter.'],
          ['What did they say about the trail?', 'like', 'They had walked ' + N('p-seattle') + ' that day, said it felt like a decoy visit.'],
          ['Did anything put them off?', 'avoid', 'They walked out of ' + N('m-lagos') + ' on the cafe projector, said it was too loud.']
        ] },
        { id: 'w3', name: 'Officer Pham', role: 'Harbour patrol', topics: [
          ['What film did they quote?', 'like', 'They quoted ' + N('m-seattle') + ', which suits a place with fog.'],
          ['What does their registration say?', 'city', 'Their boat visitor slip says they were based in Tokyo and arrived last week.'],
          ['Can anyone be ruled out?', 'alibi', 'A conference platform log in Lagos shows Tunde Bakare speaking at 12:05 UTC, matching 04:00 Seattle.', 's3']
        ] }
      ]
    },
    {
      id: 'concrete-samba-sabotage', title: 'The Concrete Samba Sabotage', crimeHub: 'saopaulo', crimeHour: 20, budget: 6, culprit: 's2',
      brief: 'The sound rig of a rooftop samba festival was sabotaged at 20:00 minutes before the headliner. Everyone has a reason to love loud music.',
      suspects: [
        { id: 's1', name: 'Bruna Lima', hub: 'saopaulo', job: 'Festival producer', likes: ['a-saopaulo', 'p-saopaulo', 'm-saopaulo', 'b-saopaulo', 'r-saopaulo'] },
        { id: 's2', name: 'Arjun Mehta', hub: 'mumbai', job: 'Audio rigger', likes: ['a-mumbai', 'p-mumbai', 'm-mumbai', 'b-mumbai', 'r-mumbai'] },
        { id: 's3', name: 'Femi Adeyemi', hub: 'lagos', job: 'Drum technician', likes: ['a-lagos', 'p-lagos', 'm-lagos', 'b-lagos', 'r-saopaulo'], alibi: { hub: 'lagos', claim: 'Says he was teaching a class in Lagos' } },
        { id: 's4', name: 'Karl Neumann', hub: 'berlin', job: 'Club promoter', likes: ['a-berlin', 'p-berlin', 'm-berlin', 'b-berlin', 'r-berlin'] }
      ],
      witnesses: [
        { id: 'w1', name: 'Tati', role: 'Stagehand', topics: [
          ['What did the rigger hum?', 'like', 'They hummed ' + N('a-mumbai') + ' while coiling cable.'],
          ['What did they drink?', 'like', 'They kept asking for chai like the one at ' + N('p-mumbai') + ', not what we serve.'],
          ['What was in their toolbox?', 'like', 'A tin of ' + N('r-mumbai') + ' masala, for lunch.']
        ] },
        { id: 'w2', name: 'Rafa', role: 'Bartender', topics: [
          ['What did they talk about?', 'like', 'They talked about ' + N('m-mumbai') + ' like it was a family story.'],
          ['What did they read on break?', 'like', 'A paperback of ' + N('b-mumbai') + ' with bus tickets as bookmarks.'],
          ['Anything they would not touch?', 'avoid', 'They refused to listen to ' + N('a-berlin') + ' at the soundcheck, said it gave them a migraine.']
        ] },
        { id: 'w3', name: 'Inspector Souza', role: 'Festival safety officer', topics: [
          ['What does their contractor file say?', 'city', 'Their contractor file says they lived in Mumbai and invoiced for travel.'],
          ['Anything left at the scene?', 'like', 'A drum stick with the tag of ' + N('p-lagos') + ', probably left to throw suspicion.'],
          ['Can anyone be ruled out?', 'alibi', 'A classroom attendance sheet in Lagos shows Femi Adeyemi signed in at 16:05 UTC, matching 20:00 here.', 's3']
        ] }
      ]
    }
  ];

  var CASES = CASE_DEFS.map(buildCase);

  function getCase(id) {
    for (var i = 0; i < CASES.length; i += 1) if (CASES[i].id === id) return CASES[i];
    return null;
  }

  /* ---------- deterministic seeded case generator ---------- */

  var FIRST = ['Amara', 'Bastien', 'Chiara', 'Dev', 'Elif', 'Farid', 'Gita', 'Hugo', 'Isla', 'Jun', 'Kofi', 'Lena', 'Mateus', 'Nadia', 'Omar', 'Paz'];
  var LAST = ['Okafor', 'Lindqvist', 'Bianchi', 'Nair', 'Demir', 'Haddad', 'Sato', 'Ferreira', 'Moreau', 'Kim', 'Mensah', 'Vega', 'Roy', 'Hassan', 'Weber', 'Ito'];
  var JOBS = ['Gallery registrar', 'Sound engineer', 'Spice importer', 'Translator', 'Night-bus driver', 'Archivist', 'Tour guide', 'Print maker'];
  var QUESTIONS = {
    like: ['What were they listening to?', 'What did they talk about?', 'What did they carry?', 'What were they reading?', 'Where did they say they spend weekends?'],
    avoid: ['Did anything put them off?'],
    city: ['Where do they live?'],
    alibi: ['Can anyone be ruled out?']
  };
  var LIKE_LINES = {
    artist: 'They kept replaying %N on a shared speaker.',
    movie: 'They quoted %N line for line.',
    place: 'They asked about the best way to reach %N.',
    book: 'They had %N under one arm.',
    brand: 'Their bag carried a tag from %N.'
  };

  function pickN(rng, arr, n) {
    var pool = arr.slice();
    var out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out;
  }

  function attemptGenerate(seed, tries) {
    var rng = mulberry32(seed * 7919 + tries * 104729 + 17);
    var hubIds = pickN(rng, HUBS.map(function (h) { return h.id; }), 5);
    var crimeHub = hubIds[0];
    var homeHubs = hubIds.slice(1);
    var names = pickN(rng, FIRST, 4).map(function (f, i) { return f + ' ' + LAST[Math.floor(rng() * LAST.length)]; });
    var suspects = homeHubs.map(function (hub, i) {
      var tasteHub = pickN(rng, hubIds.filter(function (h) { return h !== hub; }), 1)[0];
      var likes = [];
      DOMAIN_KEYS.forEach(function (dk, di) {
        var src = di < 3 ? hub : (di === 3 ? tasteHub : hub);
        likes.push(DOMAIN_PREFIX[dk] + '-' + src);
      });
      var susp = { id: 's' + (i + 1), name: names[i], hub: hub, job: JOBS[Math.floor(rng() * JOBS.length)], likes: likes };
      return susp;
    });
    var culpritIdx = Math.floor(rng() * suspects.length);
    var culprit = suspects[culpritIdx];
    var decoys = suspects.filter(function (s, i) { return i !== culpritIdx; });
    decoys.forEach(function (d, i) {
      if (i === 0) d.alibi = { hub: d.hub, claim: 'Says they were home in ' + HUB_INDEX[d.hub].name };
    });
    var topics = [];
    pickN(rng, culprit.likes, 5).forEach(function (id) {
      var e = ENTITY_INDEX[id];
      topics.push([QUESTIONS.like[Math.floor(rng() * QUESTIONS.like.length)], 'like', LIKE_LINES[e.domain].replace('%N', e.name)]);
    });
    // avoid clue: an entity from a decoy that the culprit scores lowest on
    var cprof = profileOf(culprit.likes);
    var avoidPool = [];
    decoys.forEach(function (d) { d.likes.forEach(function (id) { if (culprit.likes.indexOf(id) === -1) avoidPool.push(id); }); });
    avoidPool.sort(function (a, b) { return affinity(cprof, ENTITY_INDEX[a]) - affinity(cprof, ENTITY_INDEX[b]) || (a < b ? -1 : 1); });
    topics.push([QUESTIONS.avoid[0], 'avoid', 'They refused anything to do with ' + N(avoidPool[0]) + ' and changed the subject.']);
    topics.push([QUESTIONS.city[0], 'city', 'Their paperwork says they lived in ' + HUB_INDEX[culprit.hub].name + ' and travelled here for the day.']);
    var alibiSuspect = decoys[0];
    topics.push([QUESTIONS.alibi[0], 'alibi', 'A local record in ' + HUB_INDEX[alibiSuspect.alibi.hub].name + ' timestamps ' + alibiSuspect.name + ' at the right hour, so they were elsewhere.', alibiSuspect.id]);
    topics.push(['Anything else odd?', 'like', LIKE_LINES.place.replace('%N', N('p-' + culprit.hub))]);
    // shuffle clue order, then split in three witnesses
    var shuffled = pickN(rng, topics, topics.length);
    var roles = [['Local clerk', 'Rin'], ['Cafe owner', 'Sasha'], ['Night guard', 'Tomas']];
    var witnesses = roles.map(function (r, i) {
      return { id: 'w' + (i + 1), name: r[1], role: r[0], topics: shuffled.slice(i * 3, i * 3 + 3) };
    });
    return {
      id: 'gen-' + seed,
      title: 'Generated Case #' + seed,
      brief: 'A procedurally generated incident in ' + HUB_INDEX[crimeHub].name + '. Four people were nearby and only one of them matches the taste trail.',
      crimeHub: crimeHub,
      crimeHour: Math.floor(rng() * 24),
      budget: 6,
      culprit: culprit.id,
      suspects: suspects,
      witnesses: witnesses,
      generated: true
    };
  }

  function generateCase(seed) {
    var s = (Number(seed) >>> 0) || 1;
    for (var tries = 0; tries < 60; tries += 1) {
      var c = buildCase(attemptGenerate(s, tries));
      var post = posteriorFor(c, c.clues.map(function (k) { return k.id; }));
      var best = 0;
      for (var i = 1; i < post.length; i += 1) if (post[i] > post[best]) best = i;
      var ranked = post.slice().sort(function (a, b) { return b - a; });
      if (c.suspects[best].id === c.culprit && ranked[0] >= 0.55 && ranked[0] - ranked[1] >= 0.15) {
        c.attempts = tries + 1;
        return c;
      }
    }
    return buildCase(attemptGenerate(s, 0));
  }

  /* ---------- game state ---------- */

  function newGame(caseObj) {
    return {
      caseObj: caseObj,
      budget: caseObj.budget,
      spent: 0,
      discovered: [],
      asked: [],
      trace: [],
      seq: 0,
      over: false,
      verdict: null,
      apiAffinities: null,
      apiMode: 'local'
    };
  }

  function findTopic(caseObj, witnessId, topicId) {
    for (var i = 0; i < caseObj.witnesses.length; i += 1) {
      var w = caseObj.witnesses[i];
      if (w.id !== witnessId) continue;
      for (var j = 0; j < w.topics.length; j += 1) if (w.topics[j].id === topicId) return { witness: w, topic: w.topics[j] };
    }
    return null;
  }

  function ask(state, witnessId, topicId) {
    if (state.over) return { ok: false, reason: 'case-closed' };
    var hit = findTopic(state.caseObj, witnessId, topicId);
    if (!hit) return { ok: false, reason: 'unknown-topic' };
    var key = witnessId + ':' + topicId;
    if (state.asked.indexOf(key) !== -1) return { ok: false, reason: 'already-asked' };
    if (state.spent >= state.budget) return { ok: false, reason: 'budget-exhausted' };
    state.spent += 1;
    state.asked.push(key);
    state.discovered.push(hit.topic.clueId);
    var clue = state.caseObj.clueIndex[hit.topic.clueId];
    return { ok: true, clue: clue, witness: hit.witness, question: hit.topic.question, remaining: state.budget - state.spent };
  }

  function remainingTopics(state) {
    var out = [];
    state.caseObj.witnesses.forEach(function (w) {
      w.topics.forEach(function (t) {
        if (state.asked.indexOf(w.id + ':' + t.id) === -1) out.push({ witness: w, topic: t });
      });
    });
    return out;
  }

  function recommendNext(state) {
    var post = posterior(state);
    var best = null;
    remainingTopics(state).forEach(function (r) {
      var clue = state.caseObj.clueIndex[r.topic.clueId];
      var ig = expectedInfoGain(post, clueVector(state.caseObj, clue));
      if (!best || ig > best.gain + 1e-12 || (Math.abs(ig - best.gain) <= 1e-12 && (r.witness.id + r.topic.id) < (best.witness.id + best.topic.id))) {
        best = { witness: r.witness, topic: r.topic, gain: ig };
      }
    });
    if (!best) return null;
    best.gain = round(best.gain, 4);
    return best;
  }

  /* ---------- the 3-agent crew ---------- */

  function logCall(state, agent, tool, input, output) {
    state.seq += 1;
    var entry = { seq: state.seq, agent: agent, tool: tool, input: input, output: output };
    state.trace.push(entry);
    return entry;
  }

  function networkModel(state, facts) {
    var c = state.caseObj;
    var post = posterior(state);
    var suspects = c.suspects.map(function (s, i) { return { id: s.id, name: s.name, hub: s.hub, probability: round(post[i], 4) }; });
    var ents = [];
    facts.forEach(function (f) { f.entities.forEach(function (id) { if (ents.indexOf(id) === -1) ents.push(id); }); });
    var entities = ents.map(function (id) {
      var e = ENTITY_INDEX[id];
      var polarity = 'like';
      facts.forEach(function (f) { if (f.entities.indexOf(id) !== -1 && f.kind === 'avoid') polarity = 'avoid'; });
      return { id: id, name: e.name, domain: e.domain, hub: e.hub, polarity: polarity };
    });
    var links = [];
    entities.forEach(function (e) {
      c.suspects.forEach(function (s) {
        links.push({ from: e.id, to: s.id, kind: 'suspect', weight: round(affinity(suspectProfile(s), ENTITY_INDEX[e.id]), 4) });
      });
    });
    for (var i = 0; i < entities.length; i += 1) {
      for (var j = i + 1; j < entities.length; j += 1) {
        if (entities[i].domain === entities[j].domain) continue;
        var w = affinity(ENTITY_INDEX[entities[i].id], ENTITY_INDEX[entities[j].id]);
        if (w >= 0.55) links.push({ from: entities[i].id, to: entities[j].id, kind: 'bridge', weight: round(w, 4) });
      }
    }
    return { suspects: suspects, entities: entities, links: links };
  }

  function runCrew(state) {
    var c = state.caseObj;
    var trace = [];
    function log(agent, tool, input, output) { trace.push(logCall(state, agent, tool, input, output)); }

    // Agent 1: Clue Extractor
    var facts = state.discovered.map(function (cid) {
      var clue = c.clueIndex[cid];
      var f = clue._facts || (clue._facts = extractClue(clue));
      log('Clue Extractor', 'extract_entities', { clue: cid }, {
        kind: f.kind, entities: f.entities, city: f.city, alibiFor: f.alibiFor
      });
      return f;
    });

    // Agent 2: Qloo Cross-Domain Correlator
    var req = buildQlooInsightsRequest({ signalIds: facts.reduce(function (a, f) { return a.concat(f.entities); }, []), filterType: DOMAINS.place, take: 3 });
    var net = networkModel(state, facts);
    var bridges = net.links.filter(function (l) { return l.kind === 'bridge'; });
    log('Qloo Cross-Domain Correlator', 'qloo.insights', { mode: state.apiMode, url: req.url, signals: req.signals }, {
      bridges: bridges.length,
      strongest: bridges.slice().sort(function (a, b) { return b.weight - a.weight; }).slice(0, 2)
    });
    var scores = c.suspects.map(function (s, i) {
      var total = 0, n = 0;
      facts.forEach(function (f) { f.entities.forEach(function (id) { total += affinity(suspectProfile(s), ENTITY_INDEX[id]); n += 1; }); });
      return { suspect: s.id, meanAffinity: n ? round(total / n, 4) : 0 };
    });
    log('Qloo Cross-Domain Correlator', 'score_suspects', { facts: facts.length }, { scores: scores });

    // Agent 3: Alibi Verifier
    var cleared = [];
    var unverified = [];
    c.suspects.forEach(function (s) {
      if (!s.alibi) return;
      var proof = facts.filter(function (f) { return f.kind === 'alibi' && f.alibiFor === s.id; });
      if (proof.length && s.alibi.hub !== c.crimeHub) cleared.push(s.id);
      else unverified.push(s.id);
    });
    log('Alibi Verifier', 'verify_alibis', { crimeHub: c.crimeHub, crimeHour: c.crimeHour }, { cleared: cleared, unverified: unverified });

    var post = posterior(state);
    var rec = recommendNext(state);
    log('Alibi Verifier', 'update_posterior', { clues: state.discovered.length }, {
      posterior: c.suspects.map(function (s, i) { return { suspect: s.id, p: round(post[i], 4) }; }),
      entropyBits: round(entropy(post), 4)
    });
    if (rec) log('Alibi Verifier', 'recommend_next_question', { remaining: remainingTopics(state).length }, {
      witness: rec.witness.id, topic: rec.topic.id, question: rec.topic.question, infoGainBits: rec.gain
    });
    return { trace: trace, facts: facts, network: net, posterior: post, cleared: cleared, unverified: unverified, recommendation: rec, request: req };
  }

  function topSuspect(state) {
    var post = posterior(state);
    var best = 0;
    for (var i = 1; i < post.length; i += 1) if (post[i] > post[best]) best = i;
    return { suspect: state.caseObj.suspects[best], probability: post[best], index: best };
  }

  function autoStep(state) {
    var crew = runCrew(state);
    if (state.over || state.spent >= state.budget || !crew.recommendation) {
      return { done: true, crew: crew, asked: null };
    }
    var rec = crew.recommendation;
    var res = ask(state, rec.witness.id, rec.topic.id);
    return { done: false, crew: crew, asked: res };
  }

  /* ---------- verdict and score ---------- */

  function rankFor(score) {
    if (score >= 2200) return 'Chief Inspector';
    if (score >= 1700) return 'Senior Detective';
    if (score >= 1200) return 'Detective';
    if (score >= 600) return 'Junior Sleuth';
    return 'Trainee';
  }

  function accuse(state, suspectId, hubId) {
    if (state.over) return { ok: false, reason: 'case-closed' };
    var c = state.caseObj;
    var culprit = c.suspects.filter(function (s) { return s.id === c.culprit; })[0];
    var personaOk = suspectId === c.culprit;
    var cityOk = hubId === culprit.hub;
    var score = 1000 + (state.budget - state.spent) * 120 + (personaOk ? 800 : 0) + (cityOk ? 400 : 0) - (personaOk ? 0 : 500);
    state.over = true;
    state.verdict = {
      personaOk: personaOk,
      cityOk: cityOk,
      culprit: culprit.id,
      culpritName: culprit.name,
      culpritHub: culprit.hub,
      score: Math.max(0, score),
      rank: rankFor(Math.max(0, score)),
      signature: nearestEntities(suspectProfile(culprit), 3, culprit.likes).map(function (n) { return n.entity.name; }),
      posterior: posterior(state).map(function (p) { return round(p, 4); })
    };
    return Object.assign({ ok: true }, state.verdict);
  }

  var MIN_CLUES_TO_ACCUSE = 4;   // one decisive-looking clue can be a red herring, so never stop earlier

  function solveFull(state) {
    var guard = 0;
    while (!state.over && state.spent < state.budget && guard < 50) {
      guard += 1;
      var top = topSuspect(state);
      if (top.probability >= 0.9 && state.spent >= MIN_CLUES_TO_ACCUSE) break;
      var step = autoStep(state);
      if (step.done) break;
    }
    runCrew(state);
    var t = topSuspect(state);
    return accuse(state, t.suspect.id, t.suspect.hub);
  }

  /* ---------- optional live Qloo connector ---------- */

  var QLOO_BASE = 'https://hackathon.api.qloo.com/v2/insights';

  function buildQlooInsightsRequest(opts) {
    var o = opts || {};
    var signals = (o.signalIds || []).filter(function (x, i, a) { return a.indexOf(x) === i; });
    var params = [
      ['filter.type', o.filterType || DOMAINS.place],
      ['take', String(o.take || 5)]
    ];
    if (signals.length) params.push(['signal.interests.entities', signals.join(',')]);
    var query = params.map(function (p) { return encodeURIComponent(p[0]) + '=' + encodeURIComponent(p[1]).replace(/%2C/g, ','); }).join('&');
    var headers = { accept: 'application/json' };
    if (o.apiKey) headers['X-Api-Key'] = o.apiKey;
    return { method: 'GET', url: QLOO_BASE + '?' + query, headers: headers, signals: signals, live: !!o.apiKey };
  }

  function parseQlooResponse(json) {
    var list = (json && json.results && json.results.entities) || [];
    return list.map(function (e) {
      var aff = e.query && typeof e.query.affinity === 'number' ? e.query.affinity : null;
      return { id: e.entity_id || e.id || null, name: e.name || '', affinity: aff, popularity: typeof e.popularity === 'number' ? e.popularity : null };
    });
  }

  function fetchQlooAffinities(opts) {
    var o = opts || {};
    if (!o.apiKey) return Promise.resolve({ ok: false, reason: 'no-api-key', items: [] });
    var impl = o.fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!impl) return Promise.resolve({ ok: false, reason: 'no-fetch', items: [] });
    var req = buildQlooInsightsRequest(o);
    return impl(req.url, { method: 'GET', headers: req.headers }).then(function (res) {
      if (!res.ok) return { ok: false, reason: 'http-' + res.status, items: [] };
      return res.json().then(function (j) { return { ok: true, items: parseQlooResponse(j), request: req }; });
    }).catch(function (err) {
      return { ok: false, reason: 'network: ' + (err && err.message ? err.message : 'failed'), items: [] };
    });
  }

  // A synthetic fixture shaped like an Insights response. It is NOT a recording of live output.
  var SAMPLE_API_TRACE = {
    note: 'Synthetic fixture for offline demos. Shaped like an Insights response; values are invented.',
    request: buildQlooInsightsRequest({ signalIds: ['p-berlin', 'a-berlin'], filterType: DOMAINS.place, take: 3 }),
    response: {
      results: {
        entities: [
          { entity_id: 'p-berlin', name: 'Kreuzberg Concrete Club', query: { affinity: 0.91 }, popularity: 0.62 },
          { entity_id: 'p-tokyo', name: 'Midnight Kissaten Annex', query: { affinity: 0.74 }, popularity: 0.41 },
          { entity_id: 'p-seoul', name: 'Seongsu Arcade Loft', query: { affinity: 0.69 }, popularity: 0.55 }
        ]
      }
    }
  };

  function loadSampleTrace(state) {
    var items = parseQlooResponse(SAMPLE_API_TRACE.response);
    state.apiAffinities = items;
    state.apiMode = 'sample-fixture';
    logCall(state, 'Qloo Cross-Domain Correlator', 'qloo.insights', { mode: 'sample-fixture', url: SAMPLE_API_TRACE.request.url }, { items: items });
    return items;
  }

  return {
    TAGS: TAGS, DOMAINS: DOMAINS, DOMAIN_KEYS: DOMAIN_KEYS, HUBS: HUBS, ENTITIES: ENTITIES, CASES: CASES,
    SAMPLE_API_TRACE: SAMPLE_API_TRACE, QLOO_BASE: QLOO_BASE,
    hashString: hashString, mulberry32: mulberry32, round: round,
    entityById: entityById, hubById: hubById, entitiesByDomain: entitiesByDomain,
    cosine: cosine, jaccard: jaccard, affinity: affinity, profileOf: profileOf, nearestEntities: nearestEntities,
    findEntitiesInText: findEntitiesInText, extractClue: extractClue,
    clueVector: clueVector, posterior: posterior, posteriorFor: posteriorFor, entropy: entropy, expectedInfoGain: expectedInfoGain,
    getCase: getCase, generateCase: generateCase, newGame: newGame, ask: ask, remainingTopics: remainingTopics,
    recommendNext: recommendNext, runCrew: runCrew, autoStep: autoStep, solveFull: solveFull, topSuspect: topSuspect,
    accuse: accuse, rankFor: rankFor, networkModel: networkModel,
    buildQlooInsightsRequest: buildQlooInsightsRequest, fetchQlooAffinities: fetchQlooAffinities,
    parseQlooResponse: parseQlooResponse, loadSampleTrace: loadSampleTrace
  };
}));
