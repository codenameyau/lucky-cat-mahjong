# Lucky Cat Mahjong

Lucky Cat Mahjong is a New York City mahjong community. We host events, lessons, corporate workshops, brand collaborations and tournaments, and we build free online tools to help people learn the game.

**Our mission** is to use mahjong as a powerful way to connect with people and culture across generations. A game that parents and grandparents grew up with, and that friends are picking up today, gives people a table to share stories, traditions and a good time. We make it fun, easy and welcoming for first-timers and lifelong players alike.

Here at Lucky Cat Mahjong we believe some of the strongest connections are built one tile at a time.

This repository is the club's site at [luckycatmahjong.com](https://luckycatmahjong.com): a static website, with its content managed through [Pages CMS](https://pagescms.org), plus a Hong Kong mahjong game with a coach and bots to practice against.

The learned bot, Neural Cat, is on Hugging Face:

- **Model**: [huggingface.co/codenameyau/lucky-cat-mahjong](https://huggingface.co/codenameyau/lucky-cat-mahjong)
- **Training data**: [huggingface.co/datasets/codenameyau/lucky-cat-mahjong-games](https://huggingface.co/datasets/codenameyau/lucky-cat-mahjong-games)
- **How it works**: [docs/machine-learning](docs/machine-learning/README.md)

## Contents

**Site pages**

- [Homepage](#homepage)
- [Points Guide](#hong-kong-mahjong-points-guide-hong-kong-mahjong-scoring)
- [Community](#community-page-community)
- [Events](#events-page-events)
- [Personality quiz](#which-mahjong-tile-are-you-quiz-which-mahjong-tiles-are-you)
- [Play Mahjong](#play-hong-kong-mahjong-play-mahjong)
  - Playing: [Game modes](#game-modes) · [Rules and scoring](#rules-and-scoring) · [Saving and resuming](#saving-and-resuming) · [Hand seeds](#hand-seeds) · [Playback](#playback) · [Auto-play](#auto-play-development-only)
  - Bots and coach: [Strategies](#strategies) · [Bots](#bots) · [Coach](#coach) · [Bot competition](#bot-competition) · [Training the models](#training-the-models) · [The frontier plan](#the-frontier-plan)
  - Table: [Table and layouts](#table-and-layouts) · [Sound and music](#sound-and-music)
  - For developers: [Machine learning](docs/machine-learning/README.md) · [Analytics](docs/analytics/README.md) · [Testing tip](#testing-tip)
- [Other pages](#other)

**Working on the site**

- [Local preview](#local-preview)
- [Tests](#tests)
- [Other scripts](#other-scripts): [Media formatting](#media-formatting) · [Print and PDF](#print-and-pdf)
- [Editing content with Pages CMS](#editing-content-with-pages-cms)
- [Deploy to GitHub Pages](#deploy-to-github-pages)
- [Project structure](#project-structure)
- [Documentation](docs/README.md): [Machine learning](docs/machine-learning/README.md) · [Analytics](docs/analytics/README.md) · [Strategies](docs/strategies/README.md) · [Offline](docs/offline/README.md)

**[Credits](#credits)**

## Features

### Homepage

- **Logo & branding** — Uses `logo.png` / `logo.webp` with a red-forward color palette matching the Lucky Cat brand
- **Shared site navigation** — Sticky header across all pages (Home, Community, Events, Points Guide, Personality Quiz, Play Mahjong) with a mobile hamburger menu; links load from `data/nav.json`
- **Conversion-focused CTAs** — Hero and closing calls-to-action drive emails and Instagram messages
- **"Book a session" form** — Static lead form that builds a pre-filled email (no backend needed); a direct email/Instagram link sits beneath it
- **Direct Instagram message links** — "Message us" buttons open straight into a DM via `ig.me/m/<handle>`
- **Pre-filled email** — `mailto:` links open with a subject and a short template so leads arrive qualified
- **Multi-paragraph copy** — About and CTA body text support paragraphs (leave a blank line in the CMS to start a new paragraph)
- **Social proof** — Editable testimonials section and hero "stats" band to build trust
- **Floating mobile contact bar** — "Email Us" + "Message Us" buttons pinned to the bottom on phones
- **Services** — Private lessons, workshops, and business collaborations
- **Editable rates** — Pricing table managed via Pages CMS
- **Instagram** — Links to [@luckycat.mahjong](https://www.instagram.com/luckycat.mahjong/)

### Hong Kong Mahjong Points Guide (`/hong-kong-mahjong-scoring/`)

- **Interactive faan calculator** — Build a winning hand tile-by-tile from a full 42-tile palette; situational bonuses (self-draw, concealed, seat/round wind, robbing the kong, and more)
- **Automatic scoring** — Detects patterns, counts faan, and converts to chip payouts with **full spicy** or **half spicy** tables
- **Example hands** — One-click presets from chicken hands through limit hands (Thirteen Orphans, Four Winds, Nine Gates, etc.)
- **Shareable hands** — "Share Hand" encodes the current hand and options into the URL so you can send a scored hand to friends
- **Hand seeds from the game** — Paste a playback file, or a hand seed such as `919942249-NE` (Cmd/Ctrl+V anywhere on the page, or tap the empty hand's text where the browser allows reading the clipboard) to see the starting hand dealt to you, with your flowers, seat wind and round wind
- **Scoring reference** — Beginner-friendly guide sections covering how scoring works, every way to score, special/limit hands, and tile basics
- **SEO** — Structured data (Article, FAQ, Breadcrumb) and keyword-rich meta tags for discoverability

### Community page (`/community/`)

- **CMS-managed event recaps** — Heading, subheading, and a list of past events (name, date, description, photos) editable in Pages CMS
- **Photo galleries** — Each event renders a responsive photo grid; events sort newest-first by date regardless of CMS list order
- **Infinite scroll** — Events load in batches as you scroll for fast initial page load
- **Desktop lightbox** — Click any photo on larger screens to browse full-size in a keyboard-navigable viewer
- **Image pipeline** — `npm run format-media` converts uploaded JPG/PNG to WebP, resizes for the web, and syncs paths back into `data/community.json`

### Events page (`/events/`)

- **Upcoming events and tickets** — A Ticket Tailor widget lists upcoming events and tournaments and sells tickets, so this page isn't edited through the CMS

### "Which Mahjong Tile Are You?" quiz (`/which-mahjong-tiles-are-you/`)

**The quiz**

- **Personality quiz** — 12 questions match players to one of 22 tiles: the 13 orphans, the 8 flowers & seasons, and the blank tile. Copy and scoring live in `js/tile-quiz.js`
- **Besties and enemies** — Every result names the tile's mahjong bestie and enemy
- **Chibi tile art** — Each tile is a hand-built inline SVG character (`js/tile-quiz-art.js`), no image files needed
- **Progress survives a refresh** — Answers and the current question are saved to `localStorage`, so reloading returns to the same question (or the info form if every question is answered). Progress clears once the result is revealed

**Lead capture**

- First-time players enter name, Instagram, zip code and skill level before the result is revealed. It posts straight to the "Which mahjong tile are you?" Google Form, including the tile they got (`FORM_FIELDS` in `js/tile-quiz.js` holds the entry IDs)
- The form's "Result" dropdown options must match each tile's `name` exactly, or Google rejects the submission
- The submission and latest result are kept in `localStorage`, so retakes skip the form and never re-submit

**Sharing**

- Every tile has its own link (`/which-mahjong-tiles-are-you/red-dragon/`) whose link preview uses that tile's image instead of the Lucky Cat logo
- That link is a small page with the tile's preview tags that redirects to the quiz (`?tile=red-dragon`). The quiz then puts the tile link back in the address bar, so sharing from the browser gets the tile preview too. Old `?tile=` links still work
- Results have a share-link button (native share sheet, or copies the link) and a "Download image" button that renders a 1080×1350 (4:5) card with the tile's description

**Generated tile pages**

- `npm run generate-tile-pages` generates the per-tile redirect pages and their 1200×630 preview images. It uses Puppeteer, falling back to your installed Chrome; `--pages` skips the images
- Re-run it after changing a tile's name, title, tagline or art. `npm test` fails if a page is out of date. Edits to the quiz page itself don't need a re-run

**Tile details unlock after the quiz**

- The "Meet the whole set" gallery shows and links every tile, but a tile's full reading only opens for visitors who have finished the quiz. Anyone else who opens a tile link is sent to the quiz with a note naming that tile. Link previews are unaffected
- Completion is a signed record in `localStorage` (the answers, the tile they score to, and a signature over both), so hand-adding a value doesn't unlock it. It's a deterrent only: anyone who reads the code can forge one
- Changing the questions invalidates old records, so players retake the quiz to unlock again

### Play Hong Kong mahjong (`/play-mahjong/`)

A free game against three bots, with a coach. The game's current version is `GAME_VERSION` in `js/mahjong-engine.js` (semver), shown in the in-game menu.

It is two pages:

- **`/play-mahjong/`, the options page** — The game mode, Start game, Resume game and Learn to play, the table rules and the credits (`js/play-options.js`). It always shows these options.
- **`/playing-mahjong/`, the game** — The table itself (`js/mahjong-game.js`), with the playback view inside it. The options page sends you here: `?new=1` starts a new game in the mode you picked, `?learn=1` the lesson, and no query resumes the saved game (or starts one when there is none). Quit returns to the options page.

#### Offline

How the service worker works, in full: [docs/offline](docs/offline/README.md).

The interactive pages work offline after one visit: the Points Guide (`/hong-kong-mahjong-scoring/`), the options page (`/play-mahjong/`) and the game (`/playing-mahjong/`). The rest of the site isn't kept. Those three pages register one service worker (`/sw.js`, from `js/offline.js`; the file list and cache logic are in `js/offline-cache.js`). There is no button to press.

- **Installing** saves those three pages and every file they need: styles, scripts, fonts, images, and the game's code, model weights, tiles, sounds and music.
- **The rest of the site is left alone.** The worker answers only for the saved files. Every other request goes to the network untouched and is never saved.
- **Online, the latest file always wins.** Every saved file is fetched from the network first, revalidated with the server, so the browser's HTTP cache can't hand back an old one either. The saved copy is used only when the network fails. There is no timeout: a slow connection waits for the latest file rather than getting an old one.
- **The worker can't go stale.** Pages register it with `updateViaCache: 'none'` and check for a new one on every load and when they come back online, so the browser compares `/sw.js` and `js/offline-cache.js` with the server each time. A new version installs, takes over at once, deletes the older caches, and tells open pages, which reload if they run older code (once per version).
- **Back online**, the pages ask the worker to fetch every saved file again and save anything still missing.
- **Versions.** Each `GAME_VERSION` gets its own cache. `VERSION` in `js/offline-cache.js` must match it, and a test checks. A new version takes over only once it has saved everything.
- **The old worker.** 0.45 and 0.46 registered the game's own worker at `/play-mahjong/sw.js`. That file is now a retired worker that answers nothing, removes itself and reloads its pages. Don't delete it: a browser that hasn't visited since still needs it.
- **Tests** run the real `sw.js` on a fake worker (`js/offline-cache.test.js`): latest file online, saved copy offline, no timeout, revalidation, the rest of the site untouched, and a refresh when back online.

#### Game modes

- **Learn to play** — The button beside Start game. It stays hidden while a game is saved. One fixed East hand. The coach names each move, and only that move plays: your flower, a Bamboo chow, a Bamboo pung, a kong on that pung, concealed tiles against exposed ones, then a win by taking East Wind for a Half Flush
- **Practice** (the default) — No points or payouts, only each hand's faan. It runs on without end
- **Full game** — Everyone starts with 2,000 points and plays 4 rounds and 16 dealer rotations, so at least 16 hands. Points can go negative without ending the game, and it closes with the final standings
- **The deal** — In both modes, a dealer who wins deals again, and anything else, a drawn hand too, passes the deal on
- **Payouts** always use the **full spicy** table
- **The in-game menu** has Resume, Theme (red, green or blue; see the colour themes below), Coach settings (how much the coach says), View playback (once the hand has a move to look at), Restart game (a second tap confirms) and Quit game.
- **Game over** — The end-of-game window (Game over) is in the Results window's look: the green sheet with a gold edge, a gold title and Close at the top. It lists the four standings, each with the player's avatar (a person for you, a robot for the computer players), their name, the strategy they played (yours is the coach's, shown as *Coach · Neural Cat*) and their points, with yours highlighted, then your game's stats: hands played, your biggest hand, your fastest win (the fewest moves in a hand you won: your own discards plus the winning move, so a win on your 6th turn is *6 moves*; a dash if you won no hand), hands you won, your longest winning streak (the most hands you won in a row; a drawn hand ends it), the times you discarded the winning tile (another player won on your discard) and the times you stayed dealer (you won as dealer and the deal stayed with you). Play again is the large red button on top, with Results and Quit side by side below it. Pressing See results after the last hand (or on the table, after Close) shows only this window; its Results button opens the Results table. Close, or a click outside, steps aside to the table with every hand face up. Closing it makes no sound. On a development address, [auto-play](#auto-play-development-only) plays through to this window quickly

#### Rules and scoring

Hands are scored by `HKScoring.scoreHand` in `js/points.js`, the calculator's own pattern detection, faan counting and payout tables, so the game and the calculator always agree.

- 3 faan minimum to win
- On a self-draw every opponent pays the base points. On a discard (or robbed kong) only the discarder pays
- Handled: Heavenly and Earthly hands, robbing the kong, win by kong/double kong, last tile, flowers and seasons (including Seven Robbing One and Eight Immortals)
- The round wind moves on once everyone has dealt
- A **Rules** button in the top bar opens a one-page sheet listing every hand and its faan, with an example (`js/mahjong-rules.js`, faan read from `points.js`)

#### Saving and resuming

- **Autosave** — After each move the game is stored in this browser. A finished hand stays saved as that hand until Next hand; the next hand is saved only once Next hand is pressed. **Resume game** continues it and is the main button while a save is there, and the other button says **Start new game**. Resume stays hidden when nothing is saved, and **Start game** is the main button then
- **Switching modes** — When the selected mode isn't the saved game's, **Start new game** moves first and turns red, and **Resume game** moves second
- **Refreshing** — Refreshing the game page resumes the saved game. On a finished hand's results, it stays on that hand until Next hand. A refresh during the lesson starts the lesson again, since a lesson isn't saved
- **Back** — The game is its own page, so the browser's Back button returns to the options page, and the game stays saved
- **No hidden tiles in a save** — It holds the game as the current hand began, that hand's seed and your own moves. Resuming deals the hand from the seed and replays it. The coach's notes are not stored. Resuming works them out again, and a new hand starts with an empty coach panel
- **Signed** — The save is signed (HMAC-SHA256). A changed or damaged save is discarded and a new game starts
- **Compatible across versions** — Saves load into any version with the same major number
- **Quit leaves the save** — Start new game replaces it. A lesson does not

#### Hand seeds

Tap your wind badge to copy the hand seed, such as `919942249-NE` (the shuffle number, your seat wind, the round wind). The badge flashes once the copy is done. The Points Guide reads a seed (or a whole playback file) as that starting hand.

#### Playback

Playback replays a hand move by move. It is a view of the game page, `/playing-mahjong/?playback=1`, so it opens in place with no page load or network fetch, and the game waits under it as it was.

**Opening one**

- **View playback** is on each hand's summary and in the Menu, and opens the hand being played or just finished.
- **Saved playbacks**, on the playback bar (a list icon when its words would crowd the bar), opens a sheet of your three most recent finished hands, newest first, and the last playback you uploaded (one at most). With no hand loaded, a Saved playbacks button sits in the center of the table.
  - Each row says who won with which hand and faan (only the most important pattern, the one worth the most faan, with the hand's total), such as *Katie won with Half Flush · 6 faan*. Below that is the hand number and when the hand finished, as a plain readable time: *Hand 3 · Today, 2:30 PM*. The finish time is inside the signed file; an older file without one shows when it was saved.
  - Three rounded-square icon buttons, each with a tooltip: **Play**, **Copy hand seed** (shows a check and "Copied" for a moment) and **Download**. The playback on screen has a white ring round its Play button.
  - **Upload playback**, at the bottom, closes the sheet and opens a file picker. The file plays and replaces the last upload. Command+V or Ctrl+V pastes a playback too.
- **Download** saves that hand as JSON named with the time it was saved, such as `lucky-cat-mahjong-playback-2026-11-05-1430.json`. The playback bar has no Download button of its own.
- **Upload failed.** A file that can't be uploaded opens a popup headed *Upload failed*, and nothing from it is kept; the playback on screen stays. The message says why: the signature doesn't match (the file was changed or damaged), its contents are damaged, it isn't a playback, or its version is incompatible (it names the file's version and this game's, and says to reload when the file is newer).

**What is kept**

- The recent hands are in `lcm-play-recent` and the upload in `lcm-play-upload`, so an upload never replaces the game's own playback: View playback always shows the game. Each hand joins the list when it finishes, in either mode (a lesson's hand is not kept).
- A hand still being played is never written to storage, because its file holds the whole deal. A refresh of its playback brings the hand back from the game's save and opens the playback again. A refresh while an upload shows keeps showing it.
- The file is signed (HMAC-SHA256). It holds the hand seed (`handSeed`), every draw, discard and claim so far, each player's hand at that moment, and when the hand finished (`endedAt`).

**Watching**

- It opens on the deal and plays by itself. The bar's icon buttons are previous, play or pause, and next, with previous and next dimmed at the ends. The speed buttons play at 0.5x, 1x or 2x (kept as `speed` in `lcm-play-prefs`).
- A move is one discard, by any player, so *Move 4 of 49* counts discards only; draws, flowers and claims come with the move they lead to. Each move plays action by action, and previous plays it in reverse. Move lines are in the past tense (*You discarded Four Circle.*).
- The progress bar has a dot for each move: a larger one for your own discards, a red dot for each chow, pung or kong you made, and a yellow circle where you exposed a meld. Hover it to see what happened there; click or drag it to jump.
- **Opponents' tiles.** In a finished hand's playback every hand is face up. Double-clicking (or double-tapping) an opponent's hand hides all their concealed tiles, and doing it again shows them. The choice is kept as `showOpponents` in `lcm-play-prefs`. An unfinished hand's playback always keeps their tiles concealed, and the double-click does nothing there.
- **The end.** At the last move the hand's results show, the same card the game showed (who won, the hand, its patterns and faan, without the payout), with **Watch again** (from the deal) and **Close** (back to the table at the last move; Enter or Escape too). The result is scored again from the file (`E.playbackResult`) with the flags the game used, such as Win on Last Tile.
- The top bar shows the title, Playback Analysis, centered between Back and the buttons on the right, at every screen size.

**The coach column**

- A panel headed Strategies (no heading on a phone), as tall as your hand, shows the tile each strategy would discard, or what it would chow, pung, kong or pass. Click one to make it the coach; the side panel is titled Coach and that strategy. The same panel sits beside your hand in the game while the coach is on; in Feedback mode it shows what each strategy would have discarded after you throw.
- The coach's notes carry a read from `js/mahjong-analysis.js`, written with every hand face up: how many of the tiles that help you are really left in the wall and how many sit in other hands, a discard that was a step slower or left fewer outs, a discard that dealt in (and whether a safe tile existed), who is ready and on what, a win you passed on, a call that would have made you ready, what each call did to the hand, and how the hand ended. Click a note to jump to its move. The panel and the notes hide when the coach is off.

**Back**

Stepping through moves adds no browser history, so Back (the bar's button, or the browser's or phone's back) always returns to the game as it was. After a refresh on the playback, Back opens the saved game on that hand's results.

#### Auto-play (development only)

On a development address (`localhost`, `127.x.x.x`, `192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`, or a `.local`, `.localhost` or `.test` name, the same set the analytics skip), with the coach on or in Feedback mode, clicking your wind badge has the coach's strategy play your moves, each through the same buttons as a click, hand after hand, until you click the badge again, turn the coach off, or the game ends (it stops at the Game over window). While it runs, the flights and pauses are skipped (tiles move at once, and the bots don't take their thinking time; whatever was mid-flight lands at once), so a hand takes a fraction of a second. The declaration banners (Pung, Flower and the other callouts) and the win confetti are skipped too, and any on screen when it starts are cleared. It also plays none of the tile sounds (draws, discards, flowers, claims, the knock for your turn, the reveal); the win, wall-ran-out and next-hand sounds, the button click and the music still play. A gold ring round the badge shows it's on. Auto-play is never kept: it is off whenever the game page loads, and a page the browser restores from its back/forward cache, or leaves, is switched off too. On a real host, with the coach off, in a lesson, and in a playback, the badge copies the hand seed as before. Phones on the local wifi count (`isLocalHost` in `js/mahjong-game.js`).

#### Strategies

Every bot plays a named strategy. The rule-based ones are built on the shared foundation in `js/mahjong-bot.js` with `MahjongBot.createStrategy({ id, hooks, tuning })`; the learned ones decide with a neural network.

| Strategy | File | Style | Playbook |
| --- | --- | --- | --- |
| **lucky-cat** | `js/mahjong-lucky-cat-ml.js` | A neural network that taught itself from random play and makes every move itself: wins often and fast, mostly with small hands of 4 to 5 faan | [lucky-cat.md](docs/strategies/lucky-cat.md) |
| **jorge-yau** | `js/mahjong-jorge-yau.js` | Reads the opening hand and builds toward one target hand, attacks with no defense until it's slow late, and locks onto a hand worth 7 faan or more | [jorge-yau.md](docs/strategies/jorge-yau.md) |
| **only-orphans** | `js/mahjong-only-orphans.js` | Big hands built on 1s, 9s and honors (Thirteen Orphans, their triplets or pairs, Concealed Triplets, Seven Pairs), the target picked by expected points; a model trained by self-play decides how (`npm run ml:orphans`) | [only-orphans.md](docs/strategies/only-orphans.md) |
| **frontier-cat** | `js/mahjong-ml.js` (`js/mahjong-frontier-weights.js`) | Neural Cat's way of choosing with a stacked model: a reading network reads the table and the hand first, and the network that scores each option reads what it saw | [frontier-cat.md](docs/strategies/frontier-cat.md) |
| **neural-cat** | `js/mahjong-ml.js` | Plays Jorge Yau's hands, and a neural network trained on simulated games picks the discard, claim or kong worth the most points on average | [neural-cat.md](docs/strategies/neural-cat.md) |

Lucky Cat's original rules are still in the code as **lucky-cat-classic** (`js/mahjong-lucky-cat.js`): tracks every discard and plays the odds to the fastest 3-faan win. It's a lab strategy, not on the Strategies sheet, but `npm run compete` can play it.

- The **Strategies** button in the top bar (`js/mahjong-strategies.js`) describes each one and shows who plays which
- The coach's pick is saved in `localStorage` (`lcm-play-strategies`), and the coach defaults to lucky-cat. The computer players are never saved: each plays a random strategy every game
- Every strategy keeps its own list of hints as a game goes on, saved in `localStorage` (`lcm-play-hints`). Clicking a recommendation only switches which list the coach panel shows, so the move count doesn't change. A new game overwrites the saved hints
- The table shows only the player's name. On desktop, hovering over a computer player's name shows their strategy
- How to add a strategy, and the rules they all share, are in [docs/strategies/README.md](docs/strategies/README.md)

#### Bots

Every decision is an expected-value estimate from information the seat could legally see. Jorge Yau plays for the most points. Lucky Cat tracks every discard by who threw it and plays the odds to the fastest 3-faan win. The full playbook is in [docs/strategies/lucky-cat.md](docs/strategies/lucky-cat.md).

**Offense**

- Weighs shanten and live improving tiles for each plan (plain hand, half/full flush, all triplets, seven pairs, thirteen orphans) against the faan that plan is likely to reach
- Ready hands are valued exactly by scoring every wait with `points.js`, so bots know which waits can actually clear 3 faan. Dead waits (3+ copies visible) count for little
- Bigger hands are worth more early, and speed matters more late or against a big hand
- A hand is valued at its real payout (each faan doubles it), except on Lucky Cat, where a win at the minimum comes first. A slow hand late in the wall folds
- A big hand of only certain tiles (10 faan or more, like All Terminals) becomes the hand's target from up to three steps away, while the wall and its live tiles can still finish it. Tiles it can't use go first, and its own tiles stay unless no copy is left to finish them

**Defense**

- Each opponent gets a Low/Medium/High/Extreme threat level from melds, one-suit signals and turn count
- Defense takes over when someone is High or Extreme and the hand is slow, or when under 16 tiles remain
- Tile safety follows tiles thrown since the opponent's last meld, dead honors, suji and kabe. A punged honor is dead, but a punged number tile can still finish a chow
- Deal-in risk is weighed 1.5 times as heavily as the payout alone would suggest

**Claims**

- Claims compare the hand's value with and without the meld
- Dragons and own/round winds are always punged, unless that breaks a ready hand worth more or the hand's target can't use them. A kong is fine at any point
- Chows only when they are necessary or help a lot: they make a winning hand ready, build the flush the hand is already going for, or save a step late in the hand. Early chows need a ready hand or a flush one tile from ready

**Discards**

- Once a chow is exposed (or 7 or more tiles are in one suit), every tile of another suit is thrown first, even while folding, since a mixed-suit hand can no longer reach 3 faan. The exception: when flowers and seasons already give all but one faan, an open All Sequences or a quick self-draw wins, and the bots play for speed
- A Concealed Straights hand throws its honors first, all but one honor pair and any dragon nobody has shown (unless throwing it leaves the hand ready)
- A flush stays out of the suit the player on your left is collecting when another suit is about even, and between close suits takes the one they're throwing
- Keeping pairs and dragons never costs a step toward ready, and while folding, safety decides. The exception is a lone dragon with the other three copies unseen, which stays even at a step's cost, unless throwing it leaves the hand ready
- No strategy aims for a chicken hand unless it already has 3 faan from flowers, sets and the like

Over thousands of paired simulated hands, valuing hands at their real payout scored about 13 points a hand more than a compressed scale, with fewer wins and 14% fewer deal-ins.

#### Coach

`js/mahjong-coach.js` thinks like an experienced Hong Kong player and explains itself in plain words. Moves are checked against the bots' tuned hand values. Over 4,000 simulated hands, following the coach played about as well as the bots (within the noise of the test).

**It never contradicts itself.** Every hint passes the same contradiction check as every bot's moves: a discard, call or kong that goes against the hand it names ("Go for Half Flush in Characters" and then a Character thrown while a Bamboo is in hand) gives way to the strategy's next choice that doesn't. See [the contradiction check](docs/strategies/README.md#the-contradiction-check).

The Coach button in the top bar cycles three modes, and all of them work in every layout:

- **Coach on** — Says what to do and why
- **Feedback on** — A training mode. After you move, it reviews your previous move (a great, good, slowing or risky discard, or a good or missed claim) against what it would have done, and says why
- **Coach off** — The box stays, in gray, with a prompt to turn the coach on. On an upright phone the bar is hidden and the table gets the room

**Coach settings** (Menu, Coach settings) set how much the coach says, with three choices, kept as `coachDetail` in `lcm-play-prefs` and applied at once to the hint on screen:

- **Simple** (the default) — What to do, then one sentence on the hand to go for and its faan, from the strategy's own plan (*Discard Two Bamboo. Go for Half Flush in Circles, about 5 faan.*, or *Go for a chicken hand, about 1 faan, short of the 3 faan minimum.*). No reason and never a score. A hand with no plan to name keeps its first tip: a ready hand says what its wait wins for
- **Detailed** — Adds the hand you are going for, the threats, and my reasons in plain words (*It keeps a bigger hand in reach.*), still with no numbers
- **Complex** — Everything, with each strategy's own numbers. The networks (Neural Cat, Lucky Cat, Only Orphans) give theirs: the expected score, the chance to win and what a win pays, and the next best choice; it is the only level that says "the model" (Simple and Detailed speak as "I"). The rule strategies (Jorge Yau, Lucky Cat Classic) give the odds their rules work out: *Odds to finish Half Flush in Circles before the wall runs out: about 23%, with 12 tiles that help. Next best discard is Six Bamboo: about 20%.*

Every strategy says the same situation the same way at every level (the same plan, pivot, claim, fold or win); only these numbers differ. Each strategy works out its hint for every move and keeps its own notes for the hand at all three levels, so switching the coach's strategy or level shows that strategy's hint and notes at once. The side panel is the current hand only.

The same setting applies to everything the coach says: the hint before your move, **Feedback on** after it, and a playback's coach notes and table read. The coach always speaks as "I" (*I pick Eight Character.*, *I would have passed.*); only Complex adds what the model expects, in numbers.

- **Simple** — Feedback is the verdict, the pick (*That discard slows your hand. I pick Eight Character.*) and the same sentence on the hand to go for (*Go for Thirteen Orphans, the 13 faan limit.*), with no reasons. The playback's table read keeps its first sentence
- **Detailed** — Feedback adds the coach's reasons in plain words (*It keeps a bigger hand in reach.*); the table read keeps its first few sentences
- **Complex** — Feedback adds the model's numbers (*The model expects +663 score on average from Eight Character, and +6 score from Red Dragon.*); the table read is whole

`shapeFeedback(feedback, hint, detail)` and `shapeNote(note, detail)` in `js/mahjong-coach.js` do this; the hand and its faan travel on each hint as `hint.aim` (`{ name, faan, min }`) and `aimSentence(aim)` says it, so other notes can reuse it; the game applies them wherever feedback or a table-read note is shown, and redoes a playback's notes when the setting changes.

The plain reasons come from the feature groups that put the model's pick furthest ahead (`speed`, `value`, `safety`, `table`, `hand`, `discard`, `context`; `GROUP_PLAIN` in `js/mahjong-coach.js`). Simple leaves out the three vague ones (the tile itself, the tiles you keep, the stage of the game). The setting is applied by `Coach.forStrategy(bot, { detail })`; with no detail the coach says everything, so other callers and the tests are unchanged. A win declaration reads the same at every level. The playback analysis table keeps its own wording.

What it plays for:

- Picks a route to 3 faan: Concealed Straights for hands spread across suits, a Half or Full Flush, All Triplets, Seven Pairs, or sets of dragons and winds
- Names a bigger hand in reach, such as All Terminals, and says to aim for it
- Throws what the route doesn't use. Keeps a lone honor while it can still become a set, and lets it go once two are out (Concealed Straights throws honors first instead, but keeps a dragon nobody has shown)
- Plays tiles a threatening opponent already threw
- Pungs dragons and its own or the round's wind, unless the hand's target can't use them, and won't break a concealed runs hand for a claim

How each tip reads, always in this order:

1. What to do and why, in a few words
2. Where the hand stands: tiles from ready and the target hand with its faan, and when you aim for Seven Pairs, All Triplets or Concealed Triplets, the tiles in your hand that are dead for it because every copy that could finish them is out (a single with no copy left to pair, a pair that can't become a pung)
3. The players worth watching, as a deduction, and only once it is close to certain (three melds in one suit with none of that suit thrown, or four pungs: each held in 95% or more of simulated hands), such as "Grace is almost certainly going for a Bamboo flush, so any Bamboo you throw is a likely deal-in." It never restates what you can see or how many melds they have or the bots' internal threat level, and how safe the discard is

It doesn't say which tile to drop after this one. Hand names are drawn in red, without their faan. Long tips grow the tip bar instead of being cut off.

#### Table and layouts

The whole table is one `<canvas>` (`js/mahjong-game.js`) that only redraws while something changes or animates, with tile faces pre-rendered per size from the `tiles/` SVGs. Headings use the site's heading font (KN Yuanmo SC), and the game's own text is in English.

Like a real table, each opponent's hand, melds and discards face that player, and every player's flowers and then melds run from their own left. Each layout keeps the table as close to square as the screen allows, giving the spare room to the coach.

| Layout | Board | Coach |
| --- | --- | --- |
| **Desktop** | Table and your hand | A column down the right. Its top lists each finished hand's faan, and points in a full game. The total starts each player at 2,000 and adds each hand. Below that, the coach, and a bar above your hand that keeps its space when the coach is off, so toggling never moves the table |
| **Phone sideways** | The left two thirds (short screens are laid out at 520px tall and scaled to fit) | A column on the right third, from the top bar to the bottom, which stays when the coach is off |
| **Phone upright** | Your hand is two rows, split in half | A bar between the table and your hand, hidden when the coach is off |

On phones:

- Names are left out, and your seat keeps its wind badge. In a full game, each player's avatar, name and points sit in a corner of the discard table: the player across at top left, on your left at bottom left, on your right at top right, and you at bottom right. The current player's are yellow and the rest white
- Each opponent's tiles (hidden hand, melds and flowers) are one row, so they can be larger
- Upright, the player across spans the whole table above the side seats. Sideways, the side seats run the full height beside the player across and your section
- Every discard is the same size, and each pond is planned for 8 discards so they draw large
- Sideways, a Full screen button beside Menu (and the first tap) goes fullscreen and tucks the browser's toolbar away where the browser allows it. iPhone Safari doesn't, though the page opens fullscreen from the home screen. Turning upright leaves fullscreen

Playing at the table:

- Bots visibly take turns: the drawn tile set apart, a few tiles lifted while deciding, and the discard flipping face up as it flies to the pond
- Drawn tiles fly out of the center box, which shows the round wind and how many tiles are left
- Action buttons sit in your meld row, only as wide as their labels, and your name steps aside if they need the room
- When your hand re-sorts, every tile slides from its old place to its new one
- Computer players have a small robot icon and the human player a person icon
- Hovering a face-up tile with a mouse (or your own concealed kong) shows its English name and how many are left unseen. On a touch screen the tile you've selected shows the same
- Keyboard play works (arrows, Enter, Esc)
- The end-of-hand summary shows the winning hand, every pattern with its faan, the total, base points, and each player's payout

#### Sound and music

The Sound button toggles Sound on (effects and music) and Sound off, and remembers the choice.

Whose turn it is shows on that player's box as a gold tint and a gold outline with a soft glow that slowly pulses, clear enough to find at a glance without pulling the eye from the table. The wind plaque's arrow points the same way.

The table has three colour themes: red (the default), green and blue. The Menu's **Theme** button cycles through them (Theme: Red, Theme: Green, Theme: Blue) and the choice is kept as `theme` in `lcm-play-prefs`; with none saved the table is red. A script in the page head sets `data-theme` on `<html>` before the first paint, so there is no flash of another colour. The colours are CSS variables in `css/play.css` (`--theme-felt`, `--theme-primary`, `--theme-accent`, `--theme-back-light` and the rest, red in `:root` and green and blue in `:root[data-theme]`), and `applyTheme` in `js/mahjong-game.js` reads them for the canvas and the browser's address bar, so a theme's colours are written once.

Sound effects are short CC0 clips from Kenney's packs, played with WebAudio (`assets/sounds/`, credits in its README). All are physical table sounds except the flower's soft chime.

| Moment | Sound |
| --- | --- |
| Discard | A dull chip thump |
| Chow, pung, kong | A different heavy mining-pick hit for each (the kong struck twice), under a chip stack |
| Show hands | A heavy mining-pick hit |
| Next hand | A heavy mining-pick hit |
| Flower | A soft glass chime |
| Your turn | A light knock on wood |
| Win, whoever takes it | A heavy mining-pick hit, struck again, then the pot's chips |
| Drawn hand | A bell |
| Draw a tile | A light chip clack |
| Playback: previous, next | The draw's chips, played backward and forward |
| Playback: hide or show opponents' tiles | The show-hands hit |
| Buttons | A soft chip click |

Background music is three CC BY 4.0 tracks by Kevin MacLeod (Guzheng City, Shenyang, Ripples, in `assets/music/`, credited on the play page), shuffled and looped while the game is open.

#### Bot competition

`npm run compete -- --deals 1000` plays strategies against each other, each deal once per seat rotation, split across worker threads.

- `--lineup a,b,c,d` sets the seats, and `--json file` saves the full report
- It prints each strategy's points per hand, wins, self-draws, deal-ins, points paid, average faan, limit hands, concealed wins, claims per hand, the patterns in its wins and its net points against each other strategy
- Code: `js/mahjong-competition.js`, `scripts/competition.js`. More in [docs/strategies/README.md](docs/strategies/README.md#competition)

#### Training the models

Neural Cat's, Lucky Cat's and Only Orphans' networks are trained on simulated hands. How the whole AI layer works (features, model, decisions, training, the league, fair play, Hugging Face) is in [docs/machine-learning](docs/machine-learning/README.md), and the strategy's playbook, with every result, is [docs/strategies/neural-cat.md](docs/strategies/neural-cat.md).

- **Models**: [huggingface.co/codenameyau/lucky-cat-mahjong](https://huggingface.co/codenameyau/lucky-cat-mahjong). `neural-cat/neural-cat.json` is the model the game ships (the same file as `js/mahjong-ml-weights.js`), and `neural-cat/models/` holds every model that became the best, with a model card of the results
- **Training data**: [huggingface.co/datasets/codenameyau/lucky-cat-mahjong-games](https://huggingface.co/datasets/codenameyau/lucky-cat-mahjong-games). **Training data is not published unless the maintainer explicitly asks for it**: it runs to gigabytes a round, and every set can be played again from its manifest. Models are published as they ship. What's there now: the sets the shipped model trained on and the league's rounds at the time, in the format `npm run ml:generate` writes, with a dataset card that explains it. Older sets keep only their manifest, which says how to play them again
- **Fair play**: the models see only what their seat can see, never the wall or another hand. `js/mahjong-fair-play.test.js` checks it for every strategy

| Command | What it does |
| --- | --- |
| `npm run ml:generate` | Plays simulated hands across worker threads and writes training data to `ml/data/<name>/` |
| `npm run ml:train` | Trains a model on that data with PyTorch (`ml/train.py`; set up with `python3 -m venv ml/.venv && ml/.venv/bin/pip install -r ml/requirements.txt`; on Windows with an NVIDIA GPU, run `ml\setup-windows.ps1`, see [training](docs/machine-learning/training.md#windows-with-an-nvidia-gpu)) and checks the JS model gives the same outputs. `--ship` writes `js/mahjong-ml-weights.js` |
| `npm run ml:lab` | The lab, how Neural Cat is trained now: each round plays 50,000 deals against varied opponents, tries several experiments (retraining, wider networks, how the model plays), keeps one only on a clear gain on 20,000 fresh deals, and learns which experiments pay. State in `ml/lab/` |
| `npm run ml:lab -- --strategy lucky-cat` | Trains Lucky Cat's network at the game's table (one seat against Neural Cat, Jorge Yau and Neural Cat), aiming to keep its win rate and score more points. Each move it is unsure of is replayed with its next-best moves on 4 reshuffled futures of the wall, and it learns from the points each move scored on average. Kept only if its points a hand beat the champion's by about two standard errors on 40,000 deals. State in `ml/lab-lucky-cat/`. |
| `npm run ml:lab -- --strategy lucky-cat-suphx` | Trains Lucky Cat the way Suphx was trained: the hidden tiles (the other hands, the wall, what each discard would pay right now) are recorded for training only, and an oracle teacher pushes down each discard that would deal in. The network, reading only its own seat, learns from it. Kept only if its points beat the champion's at the table and its hands won hold. State in `ml/lab-lucky-cat-suphx/` |
| `npm run ml:suphx -- --lineage lucky-cat` | The frontier plan's phase 1: rounds on features v2 (who threw what, and shanten and live waits per discard), with the hidden tiles as targets the network learns to predict, never as inputs. Each round's best arm becomes the next generation only by passing the benchmark's bar (`npm run ml:bench`). `--lineage sphinx` trains Sphinx from random weights. [Frontier training](docs/machine-learning/frontier-training.md) |
| `npm run native:build` | Builds the native simulator (`native/`, C++): the engine and the benchmark table's players, which `bench.js` and `lucky.js generate` then use on their own. Two builds: `lcm-sim` (fast: training data and screens) and `lcm-sim-exact` (every hand as the JS plays it: judgments and Table Scores). `make -C native pgo` rebuilds the fast one profile-guided. [Native simulator](docs/machine-learning/native.md) |
| `npm run native:parity -- --agents neural-cat,jorge-yau,neural-cat,neural-cat --deals 1000` | Plays the same seeded hands in the JS and on the exact build and compares every action; the first difference fails it |
| `npm run ml:league` | The league that came before the lab (it plateaued after L7). State in `ml/league/` |
| `npm run ml:orphans` | Trains the learned Only Orphans in rounds of 50,000 games, ranked each round against the best model and the rule-based Only Orphans; milestones ship to `js/mahjong-only-orphans-weights.js`. Progress in [only-orphans-training.md](docs/strategies/only-orphans-training.md), state in `ml/orphans/` |
| `npm run ml:hf -- --repo codenameyau/lucky-cat-mahjong` | Uploads each new best model and the model card to Hugging Face. `--watch` keeps going until the league is done |
| `npm run ml:hf-data -- --repo codenameyau/lucky-cat-mahjong-games --publish` | Only when the maintainer explicitly asks: uploads the training data in use to the Hugging Face dataset and drops what no model uses. Without `--publish` it uploads nothing |
| `node scripts/ml/prune-data.js --apply` | Moves training data no model uses from `ml/data/` to the Trash (the league does this after every round) |

Uploads go over git and SSH, so your SSH key must be on your Hugging Face account, the repos must already exist, and the data needs [Git LFS](https://git-lfs.com) (`brew install git-lfs`). Local data, models and upload copies (`ml/data/`, `ml/models/`, `ml/hf/`) aren't committed.

#### The frontier plan

**Cancelled on 2026-11-09 as a failed experiment** ([why, with the evidence](docs/machine-learning/suphx-plan.md#the-suphx-line-is-cancelled-2026-11-09)). The new frontier model is one network with three heads (the table, the hand, the move), grown from Neural Cat: [the frontier plan](docs/machine-learning/frontier-plan.md). The benchmark, its bar and the native simulator below carry over. The rest of this section is the record.

[The Suphx plan](docs/machine-learning/suphx-plan.md) was how Lucky Cat was meant to become the strongest Hong Kong mahjong player. It takes Suphx, Microsoft's mahjong AI for Japanese riichi, apart against Hong Kong rules (no riichi, no placement bonus, payouts that double with each faan, only the discarder pays), argues the design through four rounds of critique, and lays out the phases:

| Phase | What | Bar to pass |
| --- | --- | --- |
| 0 | Suphx teacher: the hidden tiles show which discards would deal in, and the network learns from that teacher (built: `--strategy lucky-cat-suphx`) | +10 points a hand over lc32 |
| 1 | New inputs (who threw what, in order; engine facts such as shanten and live waits) on the current network, with the hidden tiles as prediction targets (built: `npm run ml:suphx`) | +25 more; deal-ins at the table ≤ 11% |
| 2 | A tile-structured network (tokens per tile kind) with a policy and a value per tile | +20 more, within 10 ms a move in the browser |
| 3 | A value over how the hand ends and at what faan, regularized policy iteration, value-guided exploration, a league | +40 more; points a hand at the game's table ≥ 0 |
| 3b, 4 | Search: offline as a teacher, then optionally at play. **both deferred**: a small Monte Carlo search that knew every hidden hand measured no gain (+7.8 ± 8.4 points a choice), too noisy a test to rule out a real gain at the choices that matter. Both are measured again after phase 3; search at play would only ever be an opt-in setting | +15, then +20 |

- **The benchmark** (built: [benchmark](docs/machine-learning/benchmark.md)): two Neural Cat NC8 and Jorge Yau, frozen; a fixed deck of 40,000 deals; one number per model, its **Table Score** (points a hand at that table). `node scripts/ml/bench.js score <model>` scores one, and `node scripts/ml/bench.js judge <model> --lineage lucky-cat` runs the bar below.
- **The bar for a next generation**: two standard errors better on 40,000 fresh paired deals, **replicated** on another 40,000, with the win rate held and no loss to any earlier generation or league opponent.
- **Two lineages** on the same benchmark: **Lucky Cat**, carrying on from lc32 with its own methods, and **Sphinx**, trained from random weights on the new architecture.
- **Where it stands** (2026-11-09): lc32 is still Lucky Cat's generation 1. Phase 1's 9 arms and 3 policy-gradient probes learned to read the table (deal-in AUC 0.92, waits 0.61) but none passed the bar: training on what each hand scored is mostly luck until phase 3's per-move value exists. Sphinx is paused: its recipe (imitating its own wins from random self-play) lost about 43 points a hand to random play.
- **The native simulator** (built: [native simulator](docs/machine-learning/native.md)): the engine and the benchmark table's players in C++. A round's data takes 13 s instead of 330 s, and a 2,000-deal compare 10 s instead of about 200. It runs as a **hybrid**: training data and screens on a fast build, judgments and Table Scores on an exact build that plays every hand as the JS does. The fast build isn't bit-exact (a move tied to the last bit can go the other way), an accepted trade-off for training data, flagged as an important potential issue in the plan.
- **History and decisions:** every choice so far, with why and the evidence, is in [frontier history](docs/machine-learning/frontier-history.md).
- **Fair play**: training may use the hidden tiles as labels and as a teacher, never as the shipped model's inputs. `ship.js` refuses a model that reads them, and the fair-play test catches one that plays through the training hook ([fair play](docs/machine-learning/fair-play.md)).

#### Testing tip

Animations are always on for players. Add `?instant=1` to the page URL to skip them for that visit, which makes testing much faster. Add `sound=0` to turn sound and music off for that visit, or `sound=1` to turn them on. With no `sound` parameter, the Sound button's saved choice is used. Always set `sound=0` while testing programmatically, so the run stays quiet.

### Other

- **Custom 404 page** — On-brand "page not found" screen with mahjong tile artwork
- **Sitemap & robots** — `sitemap.xml` and `robots.txt` for search engines

## Local preview

Serve the site locally (requires a local server for JSON data loading):

```bash
python3 scripts/serve.py 8080
```

Then open [localhost:8080](http://localhost:8080). This is `python3 -m http.server` that tells the browser not to cache anything, so a reload always picks up every changed script together.

Find your host machine's ip address to preview on your mobile device on the same network.
```
ipconfig getifaddr en0
```

Then for example, go to your phone and type the ip address plus port into your browser.

For example [192.168.1.155:8080](http://192.168.1.155:8080).


## Tests

Unit tests use Node's built-in test runner and require **Node.js 18+**. GitHub Actions runs them on pushes and pull requests to `master`.

```bash
npm test
```

This runs `node --test` over the test files listed in `package.json`:

- **Scoring calculator** — `js/points.js`
- **Play game** — the engine, bots, strategies, coach and rule sheet. These check that `scoreHand` matches the calculator, cover legal claims, payouts and dealer rotation and play full bot hands to check that every tile is accounted for
- **Site** — the homepage renderer, community page, tile quiz and generated tile pages
- **Scripts** — the media formatter
- **Native simulator** — once it's built (`npm run native:build`): the exact build plays the same hands as the JS action for action, the fast build plays the exact build's hands, and weights round-trip through `.lcmw` (skipped when it isn't built, as on CI)

Harnesses in `js/points.harness.js` and `js/main.harness.js` load each script in a mocked browser environment, so scoring logic and CMS rendering can be tested without opening the page.

## Other scripts

### Media formatting

After uploading event photos through Pages CMS into `media/`, run:

```bash
npm run format-media
```

This optimizes images to WebP (max 2000px wide, 2:3 aspect crop) and updates photo paths in `data/community.json` when new dated folders are processed. Requires `npm install` once for the `sharp` dependency.

### Print and PDF

- `npm run generate-guide` renders the printable rules booklet to PDF (`scripts/generate-guide.js`)
- `npm run licensing-agreement` renders the licensing agreement to PDF (`scripts/licensing-agreement.js`)

## Editing content with Pages CMS

1. Go to [app.pagescms.org](https://app.pagescms.org) and sign in with GitHub
2. Install the Pages CMS GitHub App on this repository
3. Open the repo — the `.pages.yml` config defines all editable content:
   - **Site Settings** — Title, hero text, about section, contact email, Instagram, and hero stats (About and CTA body text support multiple paragraphs — leave a blank line between them)
   - **Services** — Add, edit, or reorder service offerings
   - **Rates** — Set and update pricing for each service
   - **Testimonials** — Add reviews/social proof (leave empty to hide the section)
   - **FAQ** — Questions and answers
   - **Community** — Page heading/subheading and past events with date, description, and photo uploads

Changes save directly to the JSON files in `data/` and deploy with your next push.

Navigation links (`data/nav.json`), site styles (`css/`) and the Events page are edited directly in the repo.

## Deploy to GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Set **Source** to **Deploy from a branch**
4. Choose the `master` branch and `/ (root)` folder
5. Save. The `CNAME` file serves the site at `luckycatmahjong.com`

## Project structure

```
├── .pages.yml                           # Pages CMS configuration
├── CNAME                                # Custom domain
├── index.html                           # Homepage
├── community/                           # Community event recaps
├── events/                              # Upcoming events and tickets
├── hong-kong-mahjong-scoring/           # Scoring guide + interactive Points Guide
├── which-mahjong-tiles-are-you/         # Tile quiz + a generated page per tile
├── play-mahjong/                        # Play page: the game's options (mode, Start, Resume, Learn to play)
├── playing-mahjong/                     # The game: canvas table and its playback view
├── sw.js                                # Service worker: the Points Guide, the options page and the game offline
├── 404.html                             # Custom not-found page
├── logo.png / logo.webp                 # Club logo
├── css/
│   ├── styles.css                       # Shared styles and design tokens
│   ├── community.css                    # Community page styles
│   ├── events.css                       # Events page styles
│   ├── points.css                       # Points Guide styles
│   ├── tile-quiz.css                    # Tile quiz styles
│   ├── play.css                         # Play page styles
│   ├── 404.css                          # 404 page styles
│   └── fonts.css                        # Web font (KN Yuanmo SC)
├── js/                                  # Each has a *.test.js beside it where noted below
│   ├── main.js                          # Loads CMS data and renders the home page (tested)
│   ├── main.harness.js                  # Test harness for the homepage renderer
│   ├── nav.js                           # Shared header nav (loads data/nav.json)
│   ├── canonical-redirect.js            # Sends /path/index.html to /path/
│   ├── community.js                     # Community page renderer (tested)
│   ├── points.js                        # Tile data, reference, and the faan calculator (tested)
│   ├── points.harness.js                # Test harness for the scoring calculator
│   ├── tile-quiz.js                     # Quiz copy, scoring and page (tested)
│   ├── tile-quiz-art.js                 # Quiz tile characters as inline SVG
│   ├── mahjong-engine.js                # Play: rules engine, shanten, claims, settlement (tested)
│   ├── mahjong-bot.js                   # Play: bot engine and the rules every strategy shares
│   ├── mahjong-lucky-cat.js             # Play: the lucky-cat strategy (tested)
│   ├── mahjong-lucky-cat-ml.js          # Play: Lucky Cat's learned discards
│   ├── mahjong-lucky-cat-net.js         # Play: Lucky Cat's network, in plain JS
│   ├── mahjong-lucky-cat-weights.js     # Play: its shipped model (generated)
│   ├── mahjong-jorge-yau.js             # Play: the jorge-yau strategy
│   ├── mahjong-only-orphans.js          # Play: the only-orphans strategy (learned)
│   ├── mahjong-only-orphans-weights.js  # Play: its shipped model (generated)
│   ├── mahjong-ml.js                    # Play: Neural Cat, the learned strategy (tested)
│   ├── mahjong-ml-features.js           # Play: what the model sees of a position
│   ├── mahjong-ml-model.js              # Play: the neural network, in plain JS
│   ├── mahjong-ml-weights.js            # Play: the shipped model (generated)
│   ├── mahjong-analysis.js              # Playback: the face-up table read (tested)
│   ├── mahjong-strategies.js            # Play: strategy list and the Strategies sheet (tested)
│   ├── mahjong-competition.js           # Play: strategies against each other
│   ├── mahjong-coach.js                 # Play: the coach (tested)
│   ├── mahjong-rules.js                 # Play: the Rules sheet (tested)
│   ├── mahjong-lesson.js                # Play: Learn to play, the scripted lesson
│   ├── play-options.js                  # Options page: mode, Start, Resume, Learn to play
│   ├── offline-cache.js                 # Offline: the saved file list, version and cache logic (tested)
│   ├── offline.js                       # Offline: registers the service worker on the three pages
│   └── mahjong-game.js                  # Play: canvas table, animation, sound
├── scripts/
│   ├── serve.py                         # Local dev server that turns off caching
│   ├── format-media.js                  # CLI: optimize media/ images and sync community.json
│   ├── format-media-lib.js              # Shared image-formatting logic (tested)
│   ├── generate-tile-pages.js           # Quiz: per-tile pages and preview images
│   ├── tile-pages-lib.js                # Shared tile-page logic (tested)
│   ├── competition.js                   # CLI: npm run compete
│   ├── ml/                              # Neural Cat: data, self-play, the league, Hugging Face uploads
│   ├── generate-guide.js                # Printable rules booklet PDF
│   └── licensing-agreement.js           # Licensing agreement PDF
├── ml/                                  # train.py and requirements.txt (local data, models and the venv are gitignored)
├── native/                              # The native simulator (C++): the engine and the benchmark table's players; build/ is gitignored
├── bench/                               # The frozen benchmark, the lineages' generations and their Table Scores
├── docs/
│   ├── README.md                        # Index of the docs
│   ├── analytics/                       # Google Analytics setup, privacy and every event
│   ├── offline/                         # The service worker and what works offline
│   ├── machine-learning/                # Neural Cat and the frontier plan: features, model, training, fair play, the benchmark, the native simulator, history
│   └── strategies/                      # Bot and coach playbooks
├── assets/                              # Music, sounds, PDFs and images
├── package.json                         # npm scripts
├── tiles/                               # Hong Kong mahjong tile SVGs (CC0, see credit below)
├── data/
│   ├── site.json                        # Site settings, copy & hero stats
│   ├── nav.json                         # Header navigation links
│   ├── services.json                    # Service offerings
│   ├── rates.json                       # Pricing table
│   ├── testimonials.json                # Social proof / reviews
│   ├── faq.json                         # Frequently asked questions
│   └── community.json                   # Community page events & photos
├── media/                               # Uploaded event photos (via Pages CMS)
├── sitemap.xml
└── robots.txt
```

## Credits

Built by Jorge Yau, developer, mahjong instructor. [Source code on GitHub](https://github.com/codenameyau/lucky-cat-mahjong).

Music: "Guzheng City", "Shenyang" and "Ripples" by Kevin MacLeod ([incompetech.com](https://incompetech.com)), licensed under [Creative Commons: By Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). The tracks in `assets/music/` were re-encoded to AAC and are otherwise unchanged. Details in [assets/music/README.md](assets/music/README.md).

Sound effects by [Kenney](https://kenney.nl), from the [Casino Audio](https://kenney.nl/assets/casino-audio), [Impact Sounds](https://kenney.nl/assets/impact-sounds) and [Interface Sounds](https://kenney.nl/assets/interface-sounds) packs, released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The clips in `assets/sounds/` were trimmed and converted to WAV. Which clip each file comes from is listed in [assets/sounds/README.md](assets/sounds/README.md).

Tile artwork in `tiles/` from [samoheen/mahjong-tiles](https://github.com/samoheen/mahjong-tiles), released under [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
