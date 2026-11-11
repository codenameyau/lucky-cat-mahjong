# Neural Cat overnight report

## Status

- **Champion:** NC9 (the shipped model, the lab's N14c; `ml/models/pool/NC9.json`, from `js/mahjong-ml-weights.js` at 2d0cb33).
- **Rounds done:** 0.
- **Last result:** none yet.
- **Now:** docs and code read; building the native loop (`scripts/ml/nc-overnight.js`) and measuring the lab's current speed for the before/after.
- **Blockers:** none.

## Setup

- Pool of past Neural Cat generations (`ml/models/pool/`, from git history of `js/mahjong-ml-weights.js`):
  NC9 (512-256, topK 6, winBonus 300), NC8 (256-128, topK 4, winBonus 300), NC7 (NC5's weights, topK 4, winBonus 300), NC5 (topK 3, winBonus 150), NC3 (topK 3, winBonus 0).
- Evaluation table: the candidate in one seat, NC9, NC8 and NC5 in the other three; candidate and champion each play every seat of the same deals (paired).
- Data: the learner (champion, exploring) against a mix of the pool, every seat recorded, on the native fast build.
