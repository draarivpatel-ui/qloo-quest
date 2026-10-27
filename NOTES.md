# Build notes

Written 2026-10-26 (local clock, checked with `date`).

## Decisions

- Zero dependencies and a UMD engine so judges can open `index.html` from disk or from Pages with no build step.
- Entities are fictional on purpose, so the game never asserts anything about real artists, films, venues, books or companies.
- Likelihoods use a sharpness exponent of 3. With exponent 1 a clue about a nearby city barely separated suspects.
- A single decisive-looking clue can be a red herring, so Solve Full Case never accuses before four inquiries. Before that rule, one case (the fog signal one) was accused wrongly after three.
- The recommender is greedy expected information gain. It does not know which clues are red herrings, and in one case it picks a decoy clue first. This is a known limitation, not hidden.
- Auto-Step costs inquiries like a manual question, so the shortcut is not a cheat.

## What was verified

- All 6 curated cases and 30 generated seeds are solved correctly by the crew within the budget (tests 42 and 50).
- Curated clues are classified by the extractor exactly as the author declared them (test 21).
- No browser pixel check beyond the structural tests was run in this build pass; visual layout is unverified until opened in a real browser.

## What is not verified

- The Qloo Insights parameter names and response shape, see the README section on Qloo usage.
- Any behaviour on browsers older than those with `<dialog>` support, where a fallback attribute is used.

## Ideas not built

- Weighting live affinities into the posterior.
- A daily seeded case.
