# QlooQuest

An agentic cultural mystery and taste-detective game. You interrogate witnesses, collect clues about what a hidden person loves across artists, movies, places, books and brands, and a three-agent detective crew weighs the suspects while you decide whom to accuse and in which city they live.

Live demo: https://aariv.me/qloo-quest/

This is a second entry for the Qloo Agentic Hackathon. It targets the idea that taste is a cross-domain signal: someone who loves a minimalist Berlin club and a modular synth brand probably also reads a certain kind of book.

## How to play

1. Pick a case (six handwritten ones, plus a seeded generator).
2. You have 6 inquiries. Each witness question spends one. Spend them where the crew says you will learn the most.
3. Watch the suspect probability matrix move and the taste network grow on the canvas.
4. Press "Make an accusation", choose the persona and their home city.

Judge shortcuts in the header: "Auto-Step Agent Deduction" runs the crew and asks its recommended question, "Solve Full Case" lets the crew finish and accuse, "Load Sample API Trace" replays a synthetic Qloo-shaped response into the trace.

## Architecture

Everything that matters is in `engine.js`, a dependency-free UMD module (Node `require` or `window.QlooQuest`).

| Piece | What it does |
| --- | --- |
| Taste graph | 50 invented entities, one per domain (`urn:entity:artist`, `movie`, `place`, `book`, `brand`) for each of 10 hubs, each with weights over 12 taste tags |
| Affinity | 70 percent cosine on tag vectors plus 30 percent Jaccard on strong-tag sets, deterministic and symmetric |
| Cases | 6 handwritten cases plus `generateCase(seed)`, which retries deterministically until the culprit is identifiable |
| Clue Extractor (agent 1) | Finds entity names in clue text, reads like or avoid polarity from cue words, and detects residence cues for the home city |
| Qloo Cross-Domain Correlator (agent 2) | Scores each suspect profile against extracted entities and finds cross-domain bridges between them |
| Alibi Verifier (agent 3) | Clears a suspect only when a proof clue has been found and the alibi city differs from the crime city, then updates the Bayesian posterior and recommends the next question by expected information gain |
| Qloo connector | `buildQlooInsightsRequest` and `fetchQlooAffinities` target `https://hackathon.api.qloo.com/v2/insights` when a key is pasted in the UI |

The posterior multiplies a likelihood per clue: `0.03 + 0.97 * affinity^3` for a like, the mirrored value for an avoid, 0.9 or 0.1 for a city match, and 0.02 for a cleared alibi. The next-question recommendation treats each candidate clue as a yes or no test and picks the one with the highest expected entropy reduction in bits.

`app.js` is only a renderer and event binder: `createController(engine, document)` takes any document-like object, which is how the test suite drives it without a browser.

## Qloo usage, stated plainly

- The default game runs entirely on the local taste graph. No network request is made unless you paste a key.
- The 50 entities and all case text are invented. They are not Qloo data.
- Live mode builds a request for the Insights endpoint and shows the parsed response in the trace. It does not change scoring, so games stay reproducible.
- The query parameter names (`filter.type`, `signal.interests.entities`, `take`, header `X-Api-Key`) and the response shape follow the public documentation as the author understood it. They are not verified against the live service: no live call has been made during development. The request builder and response parser are covered only by mocked tests.
- The "sample API trace" is a synthetic fixture, not a recording.
- Because the invented entity ids are not real Qloo ids, a live call with this graph's ids is a demonstration of the connector plumbing, not a meaningful lookup.

## Tests

```
npm test
```

This runs `node --test` with no installs. `tests/engine.test.js` covers the graph, extraction, Bayesian model, crew, scoring, generator and connector. `tests/dom-smoke.test.js` checks the markup and drives the controller on a small fake DOM, and also scans every file for dashes, emoji, uppercase kickers and private details.

## AI disclosure

This project was designed and written with an AI coding assistant (Claude), then run and tested locally. The cases, entity names and clue text were written by the assistant. Aariv Patel directed the project and owns the repository. Nothing here claims human playtesting; the only "players" in the tests are the scripted crew and the generator checks.

## License

MIT, see `LICENSE`.
