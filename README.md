# Lucky Cat Mahjong

A static website for the Lucky Cat Mahjong club at [luckycatmahjong.com](https://luckycatmahjong.com), with content managed through [Pages CMS](https://pagescms.org).

## Contents

**Site pages**

- [Homepage](#homepage)
- [Points Guide](#hong-kong-mahjong-points-guide-hong-kong-mahjong-scoring)
- [Community](#community-page-community)
- [Events](#events-page-events)
- [Personality quiz](#which-mahjong-tile-are-you-quiz-which-mahjong-tiles-are-you)
- [Play Mahjong](#play-hong-kong-mahjong-play-mahjong)
  - Playing: [Game modes](#game-modes) · [Rules and scoring](#rules-and-scoring) · [Saving and resuming](#saving-and-resuming) · [Hand seeds](#hand-seeds)
  - Bots and coach: [Strategies](#strategies) · [Bots](#bots) · [Coach](#coach) · [Bot competition](#bot-competition) · [Hand review and feedback](#hand-review-and-feedback)
  - Table: [Table and layouts](#table-and-layouts) · [Sound and music](#sound-and-music)
  - For developers: [Analytics events](docs/analytics.md) · [Testing tip](#testing-tip)
- [Other pages](#other)

**Working on the site**

- [Local preview](#local-preview)
- [Tests](#tests)
- [Other scripts](#other-scripts): [Media formatting](#media-formatting) · [Print and PDF](#print-and-pdf)
- [Editing content with Pages CMS](#editing-content-with-pages-cms)
- [Deploy to GitHub Pages](#deploy-to-github-pages)
- [Project structure](#project-structure)

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
- **Refreshing** — While a game is open, the page's URL has `?opened=1`, so refreshing goes straight back to the game. On a finished hand's results, it stays on that hand until Next hand. Quitting removes it. A lesson isn't saved, so it doesn't set it, and without a save that loads the page shows as usual
- **Back** — While a game or lesson is open, the browser's Back button returns to the Play page, and the game stays saved. Forward goes back into a saved game
- **No hidden tiles in a save** — It holds the game as the current hand began, that hand's seed and your own moves. Resuming deals the hand from the seed and replays it
- **Signed** — The save is signed (HMAC-SHA256). A changed or damaged save is discarded and a new game starts
- **Compatible across versions** — Saves load into any version with the same major number
- **Quit leaves the save** — Start new game replaces it. A lesson does not

#### Hand seeds

Tap your wind badge to save a playback. The badge flashes to confirm. The file is signed (HMAC-SHA256). It holds the hand seed (`handSeed`, such as `919942249-NE`: the shuffle number, your seat wind, the round wind), every draw, discard, and claim so far, and each player's hand at that moment. Open `/play-mahjong/playback/` and that saved hand plays. With none saved, Upload in the center reads a JSON playback file. Command+V or Ctrl+V pastes one too. A changed or damaged file won't play. The hand plays on the table, and the bar stops at the last move in the file. Recommendations, under the coach column and as tall as your hand, shows the tile each strategy would discard. The same panel sits beside your hand in a game. Click one to make it the coach. The side panel is titled Coach and that strategy. At the end of a full game, Results saves that playback and has View replay, which opens the last hand here, and See hands, which turns the finished hands face up. A refresh on that results page keeps the table as the hand ended. Back returns to those results. The Points Guide still reads the file, or just the hand seed, as that starting hand.

#### Strategies

Every bot plays a named strategy, built on the shared foundation in `js/mahjong-bot.js` with `MahjongBot.createStrategy({ id, hooks, tuning })`.

| Strategy | File | Style | Playbook |
| --- | --- | --- | --- |
| **lucky-cat** | `js/mahjong-lucky-cat.js` | Tracks every discard and plays the odds to the fastest 3-faan win | [lucky-cat.md](docs/strategies/lucky-cat.md) |
| **jorge-yau** | `js/mahjong-jorge-yau.js` | Reads the opening hand and builds toward one target hand | [jorge-yau.md](docs/strategies/jorge-yau.md) |
| **only-orphans** | `js/mahjong-only-orphans.js` | Goes for Thirteen Orphans every hand, then pivots to a hand of 1s, 9s and honors | [only-orphans.md](docs/strategies/only-orphans.md) |
| **no-defense** | `js/mahjong-no-defense.js` | Never folds or minds what it feeds, keeps honors, and locks onto a hand worth 7 faan or more | [no-defense.md](docs/strategies/no-defense.md) |

- The **Strategies** button in the top bar (`js/mahjong-strategies.js`) describes each one and lets you pick a strategy for each bot seat and for the coach
- Picks are saved in `localStorage` (`lcm-play-strategies`). A bot seat with nothing saved plays a random strategy each game, and the coach defaults to lucky-cat
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
2. Where the hand stands: tiles from ready and the target hand with its faan, plus a note when it's late
3. The players worth watching, in what the table shows ("Grace has three melds down, all Bamboo."), never the bots' internal threat level, and how safe the discard is

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
- Action buttons sit in your meld row, and your name steps aside if they need the room
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

#### Hand review and feedback

`npm run review -- 3764864992-EE` replays a hand from its seed and shows the coach's advice each turn. Add `--turn N` for its reasoning and `--keep` or `--drop` to save feedback on a turn. Saved cases live in `docs/strategies/feedback.json`, and `npm test` holds the coach to the ones marked fixed. More in [docs/strategies/README.md](docs/strategies/README.md#reviewing-a-hand-and-teaching-the-coach).

#### Testing tip

Animations are always on for players. Add `?instant=1` to the page URL to skip them for that visit, which makes testing much faster. Add `sound=0` to turn sound and music off for that visit, or `sound=1` to turn them on. With no `sound` parameter, the Sound button's saved choice is used. Always set `sound=0` while testing programmatically, so the run stays quiet.

### Other

- **Custom 404 page** — On-brand "page not found" screen with mahjong tile artwork
- **Old Points Guide URL** — `/hong-kong-mahjong-points/` redirects to `/hong-kong-mahjong-scoring/`
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
├── hong-kong-mahjong-points/  # Old URL, redirects to the Points Guide
├── which-mahjong-tiles-are-you/ # Tile quiz + a generated page per tile
├── play-mahjong/           # Play page: start screen + canvas game
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
│   ├── review.js           # CLI: npm run review, replay a seed and give feedback
│   ├── review-lib.js       # Shared review logic (tested)
│   ├── generate-guide.js   # Printable rules booklet PDF
│   └── licensing-agreement.js # Licensing agreement PDF
├── docs/
│   ├── analytics.md        # Google Analytics events
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
