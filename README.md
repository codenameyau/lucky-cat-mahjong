# Lucky Cat Mahjong

A static website for the Lucky Cat Mahjong club, with content managed through [Pages CMS](https://pagescms.org).

## Features

### Homepage

- **Logo & branding** — Uses `logo.png` / `logo.webp` with a red-forward color palette matching the Lucky Cat brand
- **Shared site navigation** — Sticky header across all pages (Our Services, Points Guide, Community, Events) with a mobile hamburger menu; links load from `data/nav.json`
- **Conversion-focused CTAs** — Hero and closing calls-to-action drive emails and Instagram messages
- **"Book a session" form** — Static lead form that builds a pre-filled email (no backend needed); a direct email/Instagram link sits beneath it
- **Direct Instagram message links** — "Message us" buttons open straight into a DM via `ig.me/m/<handle>`
- **Pre-filled email** — `mailto:` links open with a subject and a short template so leads arrive qualified
- **Multi-paragraph copy** — About and CTA body text support paragraphs (leave a blank line in the CMS to start a new paragraph)
- **Social proof** — Editable testimonials section and hero "stats" band to build trust
- **Floating mobile contact bar** — "Email Us" + "Message Us" buttons pinned to the bottom on phones
- **Analytics events** — Each CTA fires two Google Analytics 4 events (both with a `location` parameter):
  - a **unique** event so it can be tracked individually — `book_session_hero`, `book_session_submit`, `instagram_message_hero`, `instagram_message_mobilebar`, `instagram_message_quotenote`, `instagram_profile_header`, `instagram_profile_cta`, `email_click_cta`, `email_click_mobilebar`, `email_click_quotenote`
  - a **unified** channel event so totals are easy to read across the whole site — `email_click` (every email action, including the booking form), `instagram_message` (every Instagram DM action), and `instagram_profile` (every Instagram profile/follow click). The unified events include a `source_event` parameter identifying which specific CTA fired it.
- **Services** — Private lessons, workshops, and business collaborations
- **Editable rates** — Pricing table managed via Pages CMS
- **Instagram** — Links to [@luckycat.mahjong](https://www.instagram.com/luckycat.mahjong/)

### Hong Kong Mahjong Points Guide (`/hong-kong-mahjong-scoring/`)

- **Interactive faan calculator** — Build a winning hand tile-by-tile from a full 42-tile palette; situational bonuses (self-draw, concealed, seat/round wind, robbing the kong, and more)
- **Automatic scoring** — Detects patterns, counts faan, and converts to chip payouts with **full spicy** or **half spicy** tables
- **Example hands** — One-click presets from chicken hands through limit hands (Thirteen Orphans, Four Winds, Nine Gates, etc.)
- **Shareable hands** — "Share Hand" encodes the current hand and options into the URL so you can send a scored hand to friends
- **Scoring reference** — Beginner-friendly guide sections covering how scoring works, every way to score, special/limit hands, and tile basics
- **SEO** — Structured data (Article, FAQ, Breadcrumb) and keyword-rich meta tags for discoverability

### Community page (`/community/`)

- **CMS-managed event recaps** — Heading, subheading, and a list of past events (name, date, description, photos) editable in Pages CMS
- **Photo galleries** — Each event renders a responsive photo grid; events sort newest-first by date regardless of CMS list order
- **Infinite scroll** — Events load in batches as you scroll for fast initial page load
- **Desktop lightbox** — Click any photo on larger screens to browse full-size in a keyboard-navigable viewer
- **Image pipeline** — `npm run format-media` converts uploaded JPG/PNG to WebP, resizes for the web, and syncs paths back into `data/community.json`

### "Which Mahjong Tile Are You?" quiz (`/which-mahjong-tiles-are-you/`)

- **Personality quiz** — 12 questions match players to one of 22 tiles: the 13 orphans, the 8 flowers & seasons, and the blank tile. Quiz copy and scoring live in `js/tile-quiz.js`
- **Besties and enemies** — Every result names the tile's mahjong bestie and enemy
- **Chibi tile art** — Each tile is a hand-built inline SVG character (`js/tile-quiz-art.js`), no image files needed
- **Lead capture** — Before the result is revealed, first-time players enter name, Instagram, zip code, and skill level, which is posted straight to the "Which mahjong tile are you?" Google Form, including the tile they got (`FORM_FIELDS` in `js/tile-quiz.js` holds the entry IDs). The form's "Result" dropdown options must match each tile's `name` exactly, or Google rejects the submission
- **Progress survives a refresh** — Answers and the current question are saved to `localStorage` as you go, so reloading mid-quiz returns to the same question (or the info form if every question is answered); progress clears once the result is revealed
- **One submission per browser** — The submission and latest result are kept in `localStorage`; retakes skip the form and never re-submit
- **Shareable results** — Every tile has its own link (`/which-mahjong-tiles-are-you/red-dragon/`) whose link preview uses that tile's image instead of the Lucky Cat logo (the quiz page itself keeps the logo). That link is a small page with the tile's preview tags that redirects to the quiz (`?tile=red-dragon`), and the quiz then puts the tile link back in the address bar, so sharing from the browser gets the tile preview too. Old `?tile=` links still open the right tile. Results have a share-link button (native share sheet, or copies the link) and a "Download image" button that renders a 1080×1350 (4:5) card with the tile's description
- **Generated tile pages** — The per-tile redirect pages and their 1200×630 preview images are generated by `npm run generate-tile-pages` (uses Puppeteer, falling back to your installed Chrome; `--pages` skips the images). Re-run it after changing a tile's name, title, tagline or art; `npm test` fails if a page is out of date. Edits to the quiz page itself don't need a re-run
- **Tile details unlock after the quiz** — The "Meet the whole set" gallery shows and links every tile, but a tile's full reading only opens for visitors who have finished the quiz; anyone else who opens a tile link (including a shared one) is sent to the quiz with a note naming that tile. Completion is a signed record in `localStorage` (the answers, the tile they score to, and a signature over both), so hand-adding a value doesn't unlock it. It's a deterrent only: anyone who reads the code can forge one. Changing the questions invalidates old records, so players retake the quiz to unlock again. Link previews are unaffected
- **Analytics events** — `tile_quiz_start`, `tile_quiz_complete`, `tile_quiz_submit`, `tile_quiz_share` (with `method`), and `tile_quiz_view_shared`, each with a `tile` parameter

### Play Hong Kong mahjong (`/play-mahjong/`)

- **Coach and bot playbook** — The hands, discards, safety reads, and claims the coach and the bots follow are written out per strategy in `docs/strategies/`: `lucky-cat.md` and `jorge-yau.md`.
- **Strategies** (`js/mahjong-strategies.js`) — Every bot plays a named strategy, shown beside its name ("Mei · Lucky Cat"). The **Strategies** button in the top bar opens a sheet that describes each one and lets you pick a strategy for each bot seat and for the coach (tips and feedback). Picks are saved in `localStorage` (`lcm-play-strategies`); a bot seat with nothing saved plays a random strategy each game, and the coach defaults to jorge-yau. **lucky-cat** (`js/mahjong-lucky-cat.js`) reads the opening hand and builds toward one target hand; **jorge-yau** (`js/mahjong-jorge-yau.js`) is the original expected-value bot. Every strategy is built on the shared foundation in `js/mahjong-bot.js` with `MahjongBot.createStrategy({ id, hooks, tuning })`; see `docs/strategies/README.md`.
- **Bot competition** — `npm run compete -- --deals 1000` plays strategies against each other over thousands of hands (each deal once per seat rotation, split across worker threads) and prints each strategy's points per hand, wins, self-draws, deal-ins, points paid, average faan, limit hands, concealed wins, claims per hand, the patterns in its wins and its net points against each other strategy. `--lineup a,b,c,d` sets the seats, `--json file` saves the full report (`js/mahjong-competition.js`, `scripts/competition.js`).
- **Settings preview** — **Practice** mode is the default (no points or payouts, only each hand's faan). **Payout** mode starts everyone with 2,000 points and ends the game when you run out. Payouts always use the **full spicy** table. The coach and sound are set from the buttons in the top bar (the coach starts on). The Coach button cycles three ways, Coach on, Feedback on and Coach off. Choices are remembered in `localStorage` as soon as you change them. The in-game menu has **Restart game**, which takes a second tap to confirm
- **Same rules as the calculator** — Hands are scored by `HKScoring.scoreHand` in `js/points.js`, the calculator's own pattern detection, faan counting and payout tables, so the game and the calculator always agree. 3 faan minimum to win. On a self-draw every opponent pays the base points; on a discard (or robbed kong) only the discarder pays, as the scoring guide describes. Heavenly and Earthly hands, robbing the kong, win by kong/double kong, last tile, flowers and seasons (including Seven Robbing One and Eight Immortals) are all handled. The dealer keeps the deal after a win or a drawn hand, and the round wind moves on once everyone has dealt. A bot that runs out of points is replaced by a new opponent
- **Engine** (`js/mahjong-engine.js`) — Wall, dealing, flower replacement, draws, claims with HK priority (win > pung/kong > chow, chow only from the left), kongs with replacement draws, settlement, and a fast suit-by-suit shanten solver
- **Bots** (`js/mahjong-bot.js`, the shared foundation, and a file per strategy) — Every decision is an expected-value estimate from information the seat could legally see. Offense weighs shanten and live improving tiles for each plan (plain hand, half/full flush, all triplets, seven pairs, thirteen orphans) against the faan that plan is likely to reach; ready hands are valued exactly by scoring every wait with `points.js`, so bots know which waits can actually clear 3 faan. Defense estimates each opponent's chance of being ready (melds, turn, flush reading) and every tile's deal-in risk, so bots fold slow hands against a likely winner. Claims compare the hand's value with and without the meld On top of that they follow an expert playbook: bigger hands are worth more early and speed matters more late or against a big hand; dead waits (3+ copies visible) count for little; each opponent gets a Low/Medium/High/Extreme threat level from melds, one-suit signals and turn count, and defense takes over when someone is High or Extreme and the hand is slow, or when under 16 tiles remain; tile safety follows tiles thrown since the opponent's last meld, dead honors, suji and kabe; chows only when they are necessary or help a lot (they make a winning hand ready, or build the flush the hand is already going for, or save a step late in the hand), and once a chow is exposed (or 7 or more tiles are in one suit) every tile of another suit is treated as worthless and thrown first, since a mixed-suit hand can no longer reach 3 faan, always, even while folding; a Concealed Straights hand throws its honors first, all but one honor pair; dragons and own/round winds are always Punged (unless that breaks a ready hand worth more), early chows need a ready hand or a flush one tile from ready, while a kong is fine at any point; keeping pairs and dragons never costs a step toward ready, and while folding, safety decides; a punged honor is dead, but a punged number tile can still finish a chow. The full playbook is in `docs/strategies/jorge-yau.md`. They play for the most points, not the most wins: a hand is valued at its real payout (each faan doubles it), deal-in risk is weighed 1.5 times as heavily, and a slow hand late in the wall folds. Over thousands of paired simulated hands this scored about 13 points a hand more than valuing hands on a compressed scale, with fewer wins and 14% fewer deal-ins.
- **Coach** (`js/mahjong-coach.js`) — A coach that thinks like an experienced Hong Kong player and explains itself in plain words: it picks a route to 3 faan (Concealed Straights for hands spread across suits, a Half or Full Flush, All Triplets, Seven Pairs, or sets of dragons and winds), throws what the route doesn't use, keeps a lone honor while it can still become a set and lets it go once two are out (Concealed Straights throws honors first instead), plays tiles a threatening opponent already threw, always Pungs dragons and its own or the round's wind, and won't break a concealed runs hand for a claim. Moves are checked against the bots' tuned hand values; over 4,000 simulated hands, following the coach plays about as well as the bots (within the noise of the test). Hand names such as All Sequences or Half Flush are drawn in red, without their faan. A **Rules** button in the top bar opens a one-page rule sheet, styled like the table, listing every hand and its faan (read from the scoring table in `points.js`). Each tip is short and follows the same order: what to do and why, in a few words; where the hand stands (tiles from ready and the target hand with its faan, plus a note when it's late or someone shows a big hand); the players worth watching, in what the table shows ("Grace has three melds down, all Bamboo."), never the bots' internal threat level and how safe the discard is; and which tile goes next. Long tips grow the tip bar instead of being cut off. **Feedback on** is a training mode: instead of telling you what to do, the coach reviews your previous move once you've made it (a great, good, slowing or risky discard, or a good or missed claim) by comparing it with what it would have done, and says why. **Coach off** keeps the box, in gray, with a prompt to turn the coach on. Cycle the modes from the top bar
- **Canvas table** (`js/mahjong-game.js`) — The whole table is one `<canvas>` that only redraws while something changes or animates, with tile faces pre-rendered per size from the `tiles/` SVGs. Headings, wind letters and banners use the site's heading font (KN Yuanmo SC), and the game's own text is in English. Like a real table, each opponent's hand, melds and discards face that player (the player across is upside-down, the side players are turned 90°), and every player's melds and flowers run from their own left. Short landscape screens (phones turned sideways) lay the table out at 520px tall and scale it down to fit. Action buttons sit in your meld row (your name steps aside if they need the room), and the coach's bar keeps its space when the coach is off, so toggling it never moves the table. Bots visibly take turns: the drawn tile set apart, a few tiles lifted while deciding, and the discard flipping face up as it flies to the pond. Drawn tiles fly out of the center box, which shows the round wind and how many tiles are left. Sound effects are short CC0 clips from Kenney's Casino Audio and Interface Sounds packs (`assets/sounds/`, credits in its README), played with WebAudio: a chip laid down for a discard, a chip stack for a claim or kong, a ripple of tiles laid down when Show hands turns every hand face up, and soft chimes for flowers, your turn, wins and drawn hands. Computer players have a small robot icon beside their name and the human player a person icon. When your hand re-sorts (a drawn tile merging in after a discard, tiles leaving for a claim) every tile slides from its old place to its new one. Hovering a face-up tile with a mouse shows its English name and how many are left unseen. Keyboard play (arrows, Enter, Esc), and an end-of-hand summary showing the winning hand, every pattern with its faan, the total, base points, and each player's payout
- **Analytics events** — `play_start` (`spicy`, `mode`, `coach`, `speed`, `coach_strategy`, `strategies`), `play_hand_end` (`result`, `faan`), `play_set_coach`, `play_set_strategy` (`seat`, `strategy`), `play_set_coach_strategy` (`strategy`), `play_restart`, `play_open_rules`, `play_open_strategies`, `play_game_over`
- **Testing tip** — Animations are always on for players. Add `?instant=1` to the page URL to skip them for that visit, which makes testing much faster

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

The Hong Kong scoring calculator (`js/points.js`), the Play game's engine, bots and coach (`js/mahjong-engine.js`, `js/mahjong-bot.js` and its strategies, `js/mahjong-coach.js`), homepage renderer (`js/main.js`), community page (`js/community.js`), tile quiz (`js/tile-quiz.js`), and media formatter (`scripts/format-media-lib.js`) have unit tests using Node's built-in test runner. Requires **Node.js 18+**.

```bash
npm test
```

This runs `node --test` over the `js/*.test.js` files listed in `package.json` plus the script tests. The game tests check that `scoreHand` matches the calculator, cover legal claims, payouts and dealer rotation, play full bot hands to check that every tile is accounted for, and include a fixed-seed strength check of the bots against a tile-efficiency baseline. Harnesses in `js/points.harness.js` and `js/main.harness.js` load each script in a mocked browser environment so scoring logic and CMS rendering can be tested without opening the page.

## Media formatting

After uploading event photos through Pages CMS into `media/`, run:

```bash
npm run format-media
```

This optimizes images to WebP (max 2000px wide, 2:3 aspect crop) and updates photo paths in `data/community.json` when new dated folders are processed. Requires `npm install` once for the `sharp` dependency.

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

Navigation links (`data/nav.json`) and site styles (`css/`) are edited directly in the repo.

## Deploy to GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Set **Source** to **Deploy from a branch**
4. Choose the `main` branch and `/ (root)` folder
5. Save — your site will be live at `https://<username>.github.io/lucky-cat-mahjong/`

## Project structure

```
├── .pages.yml              # Pages CMS configuration
├── index.html              # Homepage
├── community/
│   └── index.html          # Community event recaps
├── hong-kong-mahjong-scoring/
│   └── index.html          # Scoring guide + interactive Points Guide
├── play-mahjong/
│   └── index.html          # Play page: settings preview + canvas game
├── 404.html                # Custom not-found page
├── logo.png / logo.webp    # Club logo
├── css/
│   ├── styles.css          # Shared styles and design tokens
│   ├── community.css       # Community page styles
│   ├── points.css          # Points Guide styles
│   ├── play.css            # Play page styles
│   ├── 404.css             # 404 page styles
│   └── fonts.css           # Web font (KN Yuanmo SC)
├── js/
│   ├── main.js             # Loads CMS data and renders the home page
│   ├── main.harness.js     # Test harness for the homepage renderer
│   ├── main.test.js        # Homepage unit tests
│   ├── nav.js              # Shared header nav (loads data/nav.json)
│   ├── community.js        # Community page renderer
│   ├── community.test.js   # Community page unit tests
│   ├── points.js           # Tile data, reference, and the faan calculator
│   ├── points.harness.js   # Test harness for the scoring calculator
│   ├── points.test.js      # Scoring calculator unit tests
│   ├── mahjong-engine.js   # Play: rules engine, shanten, claims, settlement
│   ├── mahjong-engine.test.js
│   ├── mahjong-bot.js      # Play: bot engine and the rules every strategy shares
│   ├── mahjong-jorge-yau.js # Play: the jorge-yau strategy
│   ├── mahjong-jorge-yau.test.js
│   ├── mahjong-lucky-cat.js # Play: the lucky-cat strategy
│   ├── mahjong-coach.js    # Play: the coach
│   ├── mahjong-coach.test.js
│   └── mahjong-game.js     # Play: canvas table, animation, sound
├── scripts/
│   ├── serve.py            # Local dev server that turns off caching
│   ├── format-media.js     # CLI: optimize media/ images and sync community.json
│   ├── format-media-lib.js # Shared image-formatting logic
│   └── format-media.test.js
├── package.json            # npm scripts (test, format-media)
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

Mahjong tile artwork in `tiles/` comes from the public-domain (CC0) [samoheen/mahjong-tiles](https://github.com/samoheen/mahjong-tiles) project.
