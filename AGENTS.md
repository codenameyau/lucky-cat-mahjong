# Working in this repository

Before you commit, run both and fix what they report:

```bash
npm test
npm run lint
```

- Strings use double quotes. An apostrophe is a plain `'`, never `\'`. ESLint and Ruff enforce it.
- Python must run on 3.10: a double-quoted f-string can't hold another double-quoted string. Ruff checks this.
- Don't add to `eslint-suppressions.json`. It lists old problems to fix; after fixing one, run `npx eslint . --prune-suppressions`.
- A change to the game raises `GAME_VERSION` in `js/mahjong-engine.js` and `VERSION` in `js/offline-cache.js` (`npm run check:game-version`).
- A change to a file pinned in `native/ported.json` needs the native check: see "Note to self: pinned files" in the README.
