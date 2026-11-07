# Offline

The interactive pages work with no connection after one visit, and with a connection they always run the latest files. One service worker, `/sw.js`, does both. This page explains what it saves, how it answers each request, how it keeps itself up to date, how the old game worker is retired, and how it's tested.

## The pages

| Page | Address | Kept offline |
| --- | --- | --- |
| Points Guide | `/hong-kong-mahjong-scoring/` | Yes |
| Play Mahjong, the options page | `/play-mahjong/` | Yes |
| Playing Mahjong, the game | `/playing-mahjong/` | Yes |
| Everything else (home, events, community, the tile quiz, photos) | | No |

The options page and the game are separate pages. The options page holds the game mode, Start game, Resume game and Learn to play (`js/play-options.js`). It sends you to the game:

- `?new=1` starts a new game in the mode you picked;
- `?learn=1` opens the lesson;
- no query resumes the saved game, or starts one when there is none.

The game drops `?new=1` from the address once the game starts, so a refresh resumes it. Playback is a view inside the game page (`?playback=1`), so it needs no page load. Quit goes back to the options page.

## The files

| File | What it does |
| --- | --- |
| `sw.js` | The service worker, at the site's root so its scope can be the whole site |
| `js/offline-cache.js` | The list of saved files (`ASSETS`), the version (`VERSION`), and the cache logic. The worker loads it with `importScripts`, the pages load it, and the tests read it |
| `js/offline.js` | On each of the three pages: registers the worker, checks it for updates, tops up missing files, and reloads a page running older code |
| `play-mahjong/sw.js` | The retired worker from 0.45 and 0.46. [Never delete it](#retiring-the-old-game-worker) |

Only the three interactive pages load `js/offline-cache.js` and `js/offline.js`. A test checks that no other page does.

## What it saves

When the worker installs, it saves the three pages and every file they need, about 100 files:

- the pages' styles, scripts, fonts, logo and icons;
- the header's links (`/data/nav.json`);
- the game's code, including the model weights it loads later (Neural Cat, Lucky Cat, Only Orphans);
- the tiles, sounds and music.

`ASSETS` in `js/offline-cache.js` lists them all. Tests check it against every file the three pages load and every file the game loads later, so a new file can't be missed.

## How it answers a request

The worker answers only for the saved files (`isSaved`). Every other request goes to the network as if there were no service worker, and is never saved. That keeps the rest of the site out of its hands entirely.

For a saved file, the network always comes first:

1. **Online**, it fetches the file from the network with `cache: 'no-cache'`. That revalidates with the server, so the browser's HTTP cache can't hand back an old copy either. An unchanged file is a quick "not modified" reply, so this costs little.
2. The answer is saved, replacing the old copy, and returned.
3. **There is no timeout.** A slow connection waits for the latest file rather than getting an old one.
4. **The saved copy is used only when the network fails**: offline, or a server error (5xx). A 404 stays a 404.

Audio asks for byte ranges. Online the network answers them; offline a range is cut from the saved file, which Safari needs to play music from the cache.

## Staying up to date

Users must never be stuck on an old version while online. Five things make sure of that:

- **Files.** Every saved file goes to the network first, revalidated, with no timeout (above). An online visit always gets the latest files the server has.
- **The worker.** Pages register it with `updateViaCache: 'none'`, so the browser compares `/sw.js` and its import, `js/offline-cache.js`, with the server and never with its HTTP cache. They call `update()` on every load and again when the connection comes back.
- **A new version takes over at once.**
  - Each `GAME_VERSION` gets its own cache (`lcm-play-v<version>`), and the worker reads its version from `js/offline-cache.js`. Bumping the version changes that file, which the update check sees.
  - The new worker installs and saves everything, then takes over immediately (`skipWaiting`, `clients.claim`) and deletes the older caches.
  - If an update can't save everything (offline, say), the old version stays in charge. It is network first too, so online it still serves the latest files.
- **Open pages reload onto the new code.** The new worker tells every open page its version. A page running older code reloads, at most once per version (`sessionStorage`), so it can never loop. The game autosaves after each move, so a reload resumes the game; the lesson starts over.
- **Back online.** The page asks the worker to fetch every saved file again (a `refresh` message) and saves anything still missing. Nothing saved while offline stays stale.

### What the worker can't control

GitHub Pages' CDN can serve the previous copy of a file for up to about 10 minutes after a deploy. No service worker can get around that: once the CDN has the new file, the next request gets it.

## Releasing a new version

1. Bump `GAME_VERSION` in `js/mahjong-engine.js` and `VERSION` in `js/offline-cache.js` to the same value. A test fails if they differ.
2. Add any new file a kept page loads to `ASSETS`. The tests name any that are missing.
3. Deploy. Visitors' browsers find the new worker on their next load, and it takes over as described above.

## Retiring the old game worker

Versions 0.45 and 0.46 registered the game's own worker at `/play-mahjong/sw.js`, scoped to `/play-mahjong/`, and real visitors have it installed. Two traps make it hard to remove:

- **A deleted script keeps the worker.** If the file were simply deleted, the browser's update check would get a 404, and a failed update keeps the old worker installed forever.
- **Unregistering doesn't free the open tab.** Unregistering it from the page leaves it in control of every open tab, reloads included, until those tabs close.

So `play-mahjong/sw.js` is now a retired worker:

- it takes over at once (`skipWaiting`);
- it has no fetch handler, so every request goes straight to the network;
- it unregisters itself and reloads its open pages.

It doesn't delete caches; `/sw.js` deletes the stale ones when it takes over.

The new pages hand over to it in `js/offline.js`. They ask the old registration to update rather than unregistering it, which pulls in the retired script. Only if that update fails (offline) do they unregister it.

**Never delete `play-mahjong/sw.js`.** A browser that hasn't visited since 0.46 still needs it to clean up.

## Testing

`npm test` runs `js/offline-cache.test.js`. It checks the list and runs the real `sw.js` on a fake worker:

- **The list:** only the three pages are kept, every file each of them loads is listed, the game's lazily loaded files are listed, and `VERSION` matches `GAME_VERSION`.
- **Online:** a changed file is served fresh, never the saved copy, and every request is revalidated (`no-cache`). A slow network is waited for, not replaced by an old copy.
- **Offline:** the saved copy answers. A server error falls back to it; a 404 stays a 404. Audio ranges are cut from the saved file.
- **The rest of the site:** requests outside the list aren't answered or saved.
- **Back online:** a refresh fetches every saved file again.
- **A new version:** it takes over, deletes older caches, and tells open pages its version.
- **The retired worker:** it removes itself and has no fetch handler.

`js/mahjong-playback-view.test.js` checks the two pages:

- Start game opens a new game and drops `?new=1`;
- no query resumes the save, and `?learn=1` opens the lesson;
- Quit returns to the options page;
- playback opens in place, and Back returns to the game.

### By hand

Check offline behaviour in a real browser, not just the tests. Chrome's DevTools, Application tab, shows the worker and the saved files (Cache Storage). To test offline:

- stop the server, or tick Offline in the Network tab;
- load each page, and play a hand;
- start the server again, change a file, reload, and check that the change shows.

On a dev host (`localhost`) the same rules apply: network first, so a saved copy never hides a change while the server is running.
