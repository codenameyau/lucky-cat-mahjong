# Lucky Cat Mahjong

A static website for the Lucky Cat Mahjong club at [luckycatmahjong.com](https://luckycatmahjong.com), with content managed through [Pages CMS](https://pagescms.org).

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
  - Playing: [Game modes](#game-modes) · [Rules and scoring](#rules-and-scoring) · [Saving and resuming](#saving-and-resuming) · [Hand seeds](#hand-seeds)
  - Bots and coach: [Strategies](#strategies) · [Bots](#bots) · [Coach](#coach) · [Bot competition](#bot-competition) · [Neural Cat training and models](#neural-cat-training-and-models) · [Hand review and feedback](#hand-review-and-feedback)
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
- **The in-game menu** has Resume, Restart game (a second tap confirms) and Quit game. The end-of-game screen offers Quit

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

Tap your wind badge to copy the hand seed, such as `919942249-NE` (the shuffle number, your seat wind, the round wind). The badge flashes once the copy is done. A finished hand's playback stays on this device, so the playback page opens it; a hand still being played is kept in memory only. The playback file is signed (HMAC-SHA256). It holds the hand seed (`handSeed`, such as `919942249-NE`: the shuffle number, your seat wind, the round wind), every draw, discard, and claim so far, and each player's hand at that moment. Playback is a view of the game page, `/playing-mahjong/?playback=1`: the game page already has all its code, so it opens in place with no page load or network fetch, and the game waits under it as it was. That saved hand opens on the deal and plays by itself (Pause stops it). When it reaches its last move, the hand's results show, the same card the game showed (who won, the winning hand, its patterns and faan, without the payout), with **Watch again** (from the deal) and **Close** (back to the table at the last move; Enter or Escape too). The result is scored again from the file (`E.playbackResult`), with the same flags the game used, such as Win on Last Tile. A refresh on `?playback=1` opens it again. An uploaded file is kept in a place of its own (`lcm-play-upload`), so it never replaces the game's playback: View playback always shows the game, and a refresh of View playback on a hand still being played brings that hand back from the game's save and opens its playback again. A refresh while an upload shows keeps showing the upload. Download saves whichever playback is on screen. The top bar always shows the title, Playback Analysis, centered between Back and the buttons on the right, on a phone, a tablet or a desktop; Download and Upload turn into icons when their words would crowd it. With none saved, Saved playbacks in the center opens the Saved playbacks sheet. Command+V or Ctrl+V pastes one too. A changed or damaged file won't play. The hand plays on the table, and the bar stops at the last move in the file. A move is one discard, by any player, so Move 4 of 49 counts discards only. Draws, flowers and claims come with the move they lead to. Download, on each row of the Saved playbacks sheet, saves that hand as a JSON file named with the time it was saved, such as `lucky-cat-mahjong-playback-2026-11-05-1430.json`; the playback bar has no Download button of its own. **Saved playbacks**, on the playback bar (a list icon on a phone), opens a sheet of your three most recent finished hands, newest first, and the last playback you uploaded (one at most). Each row says who won and with which hand and faan (such as *Katie won with Half Flush + Dragon Triplet · 6 faan*), which hand of the game it was, and when that hand finished, in words (*Finished today, 2:30 PM*); an upload also says when it was uploaded. The finish time is in the playback file, signed with the rest. Its two round icon buttons play the hand (a refresh keeps it on screen) and download its file. Upload playback, at the bottom, opens a downloaded file and plays it; it replaces the last upload. The recent hands are kept in `lcm-play-recent`, the upload in `lcm-play-upload`. The icon buttons (previous, play or pause, next) step through the moves, with previous and next dimmed at the ends. Each move plays action by action (draws, flowers, chow, pung and kong, discards), previous plays it in reverse, and a red dot on the progress bar marks every chow, pung and kong, the speed buttons beside them play at 0.5x, 1x or 2x (the choice is kept in `lcm-play-prefs`), and the progress bar shows a dot for each move (a larger one for your own discards, a yellow circle where you exposed a meld). Hover it to see what happened there, and click or drag it to jump. A panel under the coach column, as tall as your hand and headed Strategies (a phone has no heading), shows the tile each strategy would discard, and what it would chow, pung, kong, or pass. The same panel sits beside your hand while the coach is on. Feedback instead shows the tile each strategy would have discarded after you throw one. The coach's column also carries a table read from `js/mahjong-analysis.js`, written with every hand face up: how many of the tiles that help you are really left in the wall and how many sit in other hands, a discard that was a step slower or left fewer outs, a discard that dealt in (and whether a safe tile existed), who is ready and on what with which of your tiles would win for them, a win you passed on, a call that would have made you ready, what each call did to the hand, and how the hand ended. Click any coach note to jump the progress bar to the move it is about. Both that panel and the coach's notes hide when the coach is off. Click one to make it the coach. The side panel is titled Coach and that strategy. At the end of a full game, Results saves that playback. View playback is on each hand's summary, and opens that hand here. Stepping through moves adds no browser history, so Back (the button on the playback bar, or the browser's or phone's back) always returns to the game, exactly as it was. After a refresh on the playback, Back opens the saved game on that hand's results. The Points Guide still reads the file, or just the hand seed, as that starting hand.

#### Strategies

Every bot plays a named strategy, built on the shared foundation in `js/mahjong-bot.js` with `MahjongBot.createStrategy({ id, hooks, tuning })`.
| Strategy | File | Style | Playbook |

| --- | --- | --- | --- |
| **lucky-cat** | `js/mahjong-lucky-cat.js` | Tracks every discard and plays the odds to the fastest 3-faan win | [lucky-cat.md](docs/strategies/lucky-cat.md) |
| **jorge-yau** | `js/mahjong-jorge-yau.js` | Reads the opening hand and builds toward one target hand, attacks with no defense until it's slow late, and locks onto a hand worth 7 faan or more | [jorge-yau.md](docs/strategies/jorge-yau.md) |
| **only-orphans** | `js/mahjong-only-orphans.js` | Big hands built on 1s, 9s and honors (Thirteen Orphans, their triplets or pairs, Concealed Triplets, Seven Pairs), the target picked by expected points; a model trained by self-play decides how (`npm run ml:orphans`) | [only-orphans.md](docs/strategies/only-orphans.md) |
| **neural-cat** | `js/mahjong-ml.js` | Plays Jorge Yau's hands, and a neural network trained on simulated games picks the discard, claim or kong worth the most points on average | [neural-cat.md](docs/strategies/neural-cat.md) |

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

The Coach button in the top bar cycles three modes, and all of them work in every layout:

- **Coach on** — Says what to do and why
- **Feedback on** — A training mode. After you move, it reviews your previous move (a great, good, slowing or risky discard, or a good or missed claim) against what it would have done, and says why
- **Coach off** — The box stays, in gray, with a prompt to turn the coach on. On an upright phone the bar is hidden and the table gets the room

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

Background music is three CC BY 4.0 tracks by Kevin MacLeod (Guzheng City, Shenyang, Ripples, in `assets/music/`, credited on the play page), shuffled and looped while the game is open.

#### Bot competition

`npm run compete -- --deals 1000` plays strategies against each other, each deal once per seat rotation, split across worker threads.

- `--lineup a,b,c,d` sets the seats, and `--json file` saves the full report
- It prints each strategy's points per hand, wins, self-draws, deal-ins, points paid, average faan, limit hands, concealed wins, claims per hand, the patterns in its wins and its net points against each other strategy
- Code: `js/mahjong-competition.js`, `scripts/competition.js`. More in [docs/strategies/README.md](docs/strategies/README.md#competition)

#### Neural Cat training and models

Neural Cat's network is trained on simulated hands. How the whole AI layer works (features, model, decisions, training, the league, fair play, Hugging Face) is in [docs/machine-learning](docs/machine-learning/README.md), and the strategy's playbook, with every result, is [docs/strategies/neural-cat.md](docs/strategies/neural-cat.md).

- **Models**: [huggingface.co/codenameyau/lucky-cat-mahjong](https://huggingface.co/codenameyau/lucky-cat-mahjong). `neural-cat/neural-cat.json` is the model the game ships (the same file as `js/mahjong-ml-weights.js`), and `neural-cat/models/` holds every model that became the best, with a model card of the results
- **Training data**: [huggingface.co/datasets/codenameyau/lucky-cat-mahjong-games](https://huggingface.co/datasets/codenameyau/lucky-cat-mahjong-games). **Training data is not published unless the maintainer explicitly asks for it**: it runs to gigabytes a round, and every set can be played again from its manifest. Models are published as they ship. What's there now: the sets the shipped model trained on and the league's rounds at the time, in the format `npm run ml:generate` writes, with a dataset card that explains it. Older sets keep only their manifest, which says how to play them again
- **Fair play**: the models see only what their seat can see, never the wall or another hand. `js/mahjong-fair-play.test.js` checks it for every strategy

| Command | What it does |
| --- | --- |
| `npm run ml:generate` | Plays simulated hands across worker threads and writes training data to `ml/data/<name>/` |
| `npm run ml:train` | Trains a model on that data with PyTorch (`ml/train.py`; set up with `python3 -m venv ml/.venv && ml/.venv/bin/pip install -r ml/requirements.txt`; on Windows with an NVIDIA GPU, run `ml\setup-windows.ps1`, see [training](docs/machine-learning/training.md#windows-with-an-nvidia-gpu)) and checks the JS model gives the same outputs. `--ship` writes `js/mahjong-ml-weights.js` |
| `npm run ml:lab` | The lab, how Neural Cat is trained now: each round plays 50,000 deals against varied opponents, tries several experiments (retraining, wider networks, how the model plays), keeps one only on a clear gain on 20,000 fresh deals, and learns which experiments pay. State in `ml/lab/` |
| `npm run ml:league` | The league that came before the lab (it plateaued after L7). State in `ml/league/` |
| `npm run ml:orphans` | Trains the learned Only Orphans in rounds of 50,000 games, ranked each round against the best model and the rule-based Only Orphans; milestones ship to `js/mahjong-only-orphans-weights.js`. Progress in [only-orphans-training.md](docs/strategies/only-orphans-training.md), state in `ml/orphans/` |
| `npm run ml:hf -- --repo codenameyau/lucky-cat-mahjong` | Uploads each new best model and the model card to Hugging Face. `--watch` keeps going until the league is done |
| `npm run ml:hf-data -- --repo codenameyau/lucky-cat-mahjong-games --publish` | Only when the maintainer explicitly asks: uploads the training data in use to the Hugging Face dataset and drops what no model uses. Without `--publish` it uploads nothing |
| `node scripts/ml/prune-data.js --apply` | Moves training data no model uses from `ml/data/` to the Trash (the league does this after every round) |

Uploads go over git and SSH, so your SSH key must be on your Hugging Face account, the repos must already exist, and the data needs [Git LFS](https://git-lfs.com) (`brew install git-lfs`). Local data, models and upload copies (`ml/data/`, `ml/models/`, `ml/hf/`) aren't committed.

#### Hand review and feedback

`npm run review -- 3764864992-EE` replays a hand from its seed and shows the coach's advice each turn. Add `--turn N` for its reasoning and `--keep` or `--drop` to save feedback on a turn. Saved cases live in `docs/strategies/feedback.json`, and `npm test` holds the coach to the ones marked fixed. More in [docs/strategies/README.md](docs/strategies/README.md#reviewing-a-hand-and-teaching-the-coach).

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
- **Scripts** — the media formatter and hand review
- **Coach feedback** — every case in `docs/strategies/feedback.json` marked fixed

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
├── .pages.yml              # Pages CMS configuration
├── CNAME                   # Custom domain
├── index.html              # Homepage
├── community/              # Community event recaps
├── events/                 # Upcoming events and tickets
├── hong-kong-mahjong-scoring/ # Scoring guide + interactive Points Guide
├── which-mahjong-tiles-are-you/ # Tile quiz + a generated page per tile
├── play-mahjong/           # Play page: the game's options (mode, Start, Resume, Learn to play)
├── playing-mahjong/        # The game: canvas table and its playback view
├── sw.js                   # The site's service worker: the whole site offline
├── 404.html                # Custom not-found page
├── logo.png / logo.webp    # Club logo
├── css/
│   ├── styles.css          # Shared styles and design tokens
│   ├── community.css       # Community page styles
│   ├── events.css          # Events page styles
│   ├── points.css          # Points Guide styles
│   ├── tile-quiz.css       # Tile quiz styles
│   ├── play.css            # Play page styles
│   ├── 404.css             # 404 page styles
│   └── fonts.css           # Web font (KN Yuanmo SC)
├── js/                     # Each has a *.test.js beside it where noted below
│   ├── main.js             # Loads CMS data and renders the home page (tested)
│   ├── main.harness.js     # Test harness for the homepage renderer
│   ├── nav.js              # Shared header nav (loads data/nav.json)
│   ├── canonical-redirect.js # Sends /path/index.html to /path/
│   ├── community.js        # Community page renderer (tested)
│   ├── points.js           # Tile data, reference, and the faan calculator (tested)
│   ├── points.harness.js   # Test harness for the scoring calculator
│   ├── tile-quiz.js        # Quiz copy, scoring and page (tested)
│   ├── tile-quiz-art.js    # Quiz tile characters as inline SVG
│   ├── mahjong-engine.js   # Play: rules engine, shanten, claims, settlement (tested)
│   ├── mahjong-bot.js      # Play: bot engine and the rules every strategy shares
│   ├── mahjong-lucky-cat.js # Play: the lucky-cat strategy (tested)
│   ├── mahjong-jorge-yau.js # Play: the jorge-yau strategy
│   ├── mahjong-only-orphans.js # Play: the only-orphans strategy (learned)
│   ├── mahjong-only-orphans-weights.js # Play: its shipped model (generated)
│   ├── mahjong-ml.js       # Play: Neural Cat, the learned strategy (tested)
│   ├── mahjong-ml-features.js # Play: what the model sees of a position
│   ├── mahjong-ml-model.js # Play: the neural network, in plain JS
│   ├── mahjong-ml-weights.js # Play: the shipped model (generated)
│   ├── mahjong-analysis.js # Playback: the face-up table read (tested)
│   ├── mahjong-strategies.js # Play: strategy list and the Strategies sheet (tested)
│   ├── mahjong-competition.js # Play: strategies against each other
│   ├── mahjong-coach.js    # Play: the coach (tested)
│   ├── mahjong-rules.js    # Play: the Rules sheet (tested)
│   └── mahjong-game.js     # Play: canvas table, animation, sound
├── scripts/
│   ├── serve.py            # Local dev server that turns off caching
│   ├── format-media.js     # CLI: optimize media/ images and sync community.json
│   ├── format-media-lib.js # Shared image-formatting logic (tested)
│   ├── generate-tile-pages.js # Quiz: per-tile pages and preview images
│   ├── tile-pages-lib.js   # Shared tile-page logic (tested)
│   ├── competition.js      # CLI: npm run compete
│   ├── ml/                 # Neural Cat: data, self-play, the league, Hugging Face uploads
│   ├── review.js           # CLI: npm run review, replay a seed and give feedback
│   ├── review-lib.js       # Shared review logic (tested)
│   ├── generate-guide.js   # Printable rules booklet PDF
│   └── licensing-agreement.js # Licensing agreement PDF
├── ml/                     # train.py and requirements.txt (local data, models and the venv are gitignored)
├── docs/
│   ├── README.md           # Index of the docs
│   ├── analytics/          # Google Analytics setup, privacy and every event
│   ├── machine-learning/   # Neural Cat: features, model, decisions, training, fair play, Hugging Face
│   └── strategies/         # Bot and coach playbooks, and feedback.json
├── assets/                 # Music, sounds, PDFs and images
├── package.json            # npm scripts
├── tiles/                  # Hong Kong mahjong tile SVGs (CC0, see credit below)
├── data/
│   ├── site.json           # Site settings, copy & hero stats
│   ├── nav.json            # Header navigation links
│   ├── services.json       # Service offerings
│   ├── rates.json          # Pricing table
│   ├── testimonials.json   # Social proof / reviews
│   ├── faq.json            # Frequently asked questions
│   └── community.json      # Community page events & photos
├── media/                  # Uploaded event photos (via Pages CMS)
├── sitemap.xml
└── robots.txt
```

## Credits

Built by Jorge Yau, developer, mahjong instructor. [Source code on GitHub](https://github.com/codenameyau/lucky-cat-mahjong).

Music: "Guzheng City", "Shenyang" and "Ripples" by Kevin MacLeod ([incompetech.com](https://incompetech.com)), licensed under [Creative Commons: By Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). The tracks in `assets/music/` were re-encoded to AAC and are otherwise unchanged. Details in [assets/music/README.md](assets/music/README.md).

Sound effects by [Kenney](https://kenney.nl), from the [Casino Audio](https://kenney.nl/assets/casino-audio), [Impact Sounds](https://kenney.nl/assets/impact-sounds) and [Interface Sounds](https://kenney.nl/assets/interface-sounds) packs, released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The clips in `assets/sounds/` were trimmed and converted to WAV. Which clip each file comes from is listed in [assets/sounds/README.md](assets/sounds/README.md).

Tile artwork in `tiles/` from [samoheen/mahjong-tiles](https://github.com/samoheen/mahjong-tiles), released under [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
