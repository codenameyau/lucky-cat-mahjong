# Lucky Cat Mahjong

A static website for the Lucky Cat Mahjong club, with content managed through [Pages CMS](https://pagescms.org).

## Features

### Homepage

- **Logo & branding** — Uses `logo.png` / `logo.webp` with a red-forward color palette matching the Lucky Cat brand
- **Shared site navigation** — Sticky header across all pages (Our Services, Points Calculator, Community, Events) with a mobile hamburger menu; links load from `data/nav.json`
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
- **Services** — Private lessons, office workshops, and business collaborations
- **Editable rates** — Pricing table managed via Pages CMS
- **Instagram** — Links to [@luckycat.mahjong](https://www.instagram.com/luckycat.mahjong/)

### Hong Kong Mahjong Points Calculator (`/hong-kong-mahjong-scoring/`)

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

- **Settings preview** — Pick **Payout** mode (everyone starts with 2,000 points; the game ends when you run out) or **Practice** mode (no points or payouts, only each hand's faan), and the **full spicy** or **half spicy** payout table. **Animations** (Normal, Fast, or Skip, where bots play instantly) and **walls** are set from the in-game menu, and hint tips and sound from the buttons in the top bar (hints start on, animations at Normal, walls shown). Choices are remembered in `localStorage`
- **Same rules as the calculator** — Hands are scored by `HKScoring.scoreHand` in `js/points.js`, the calculator's own pattern detection, faan counting and payout tables, so the game and the calculator always agree. 3 faan minimum to win. On a self-draw every opponent pays the base points; on a discard (or robbed kong) only the discarder pays, as the scoring guide describes. Heavenly and Earthly hands, robbing the kong, win by kong/double kong, last tile, flowers and seasons (including Seven Robbing One and Eight Immortals) are all handled. The dealer keeps the deal after a win or a drawn hand, and the round wind moves on once everyone has dealt. A bot that runs out of points is replaced by a new opponent
- **Engine** (`js/mahjong-engine.js`) — Wall, dealing, flower replacement, draws, claims with HK priority (win > pung/kong > chow, chow only from the left), kongs with replacement draws, settlement, and a fast suit-by-suit shanten solver
- **Bots** (`js/mahjong-bot.js`) — Every decision is an expected-value estimate from information the seat could legally see. Offense weighs shanten and live improving tiles for each plan (plain hand, half/full flush, all triplets, seven pairs, thirteen orphans) against the faan that plan is likely to reach; ready hands are valued exactly by scoring every wait with `points.js`, so bots know which waits can actually clear 3 faan. Defense estimates each opponent's chance of being ready (melds, turn, flush reading) and every tile's deal-in risk, so bots fold slow hands against a likely winner. Claims compare the hand's value with and without the meld
- **Hint tips** — The same analysis suggests your best discard (glowing tile), explains the plan and live tiles, lists your waits and their faan when you're ready, warns when a hand is too cheap to win or an opponent looks ready, and recommends claims or passes with the reason. Toggle in the top bar
- **Canvas table** (`js/mahjong-game.js`) — The whole table is one `<canvas>` that only redraws while something changes or animates, with tile faces pre-rendered per size from the `tiles/` SVGs. Like a real table, each opponent's hand, melds and discards face that player (the player across is upside-down, the side players are turned 90°). Each hand opens with the tiles washed face down (a small rigid-body simulation: two palms sweep the felt, and tiles collide, bounce, spin and slide to a stop without ever overlapping), the four walls built (when shown), and hands dealt from the break in the wall in rounds of four. Bots visibly take turns: a thinking bubble, the drawn tile set apart, a few tiles lifted while deciding, and the discard flipping face up as it flies to the pond. Walls shrink from the front as tiles are drawn and from the back for kong and flower replacements. Sound effects are synthesized in the browser with WebAudio (no audio files): tile impacts are modal (short decaying resonances plus a noise transient), a bright click for tile on tile and a duller thock for a tile set on the felt. During the shuffle every collision in the simulation clicks, louder for harder hits, over a sliding rumble that follows how fast the tiles move. Claims and wins add plucked-string pentatonic notes and a soft gong. Keyboard play (arrows, Enter, Esc), and an end-of-hand summary showing the winning hand, every pattern with its faan, the total, base points, and each player's payout
- **Analytics events** — `play_start` (`spicy`, `mode`, `hints`, `speed`, `walls`), `play_hand_end` (`result`, `faan`), `play_toggle_hints`, `play_toggle_walls`, `play_set_speed`, `play_game_over`
- **Testing tip** — Add `?instant=1` to the page URL to skip animations for that visit without changing the saved setting

### Other

- **Custom 404 page** — On-brand "page not found" screen with mahjong tile artwork
- **Sitemap & robots** — `sitemap.xml` and `robots.txt` for search engines

## Local preview

Serve the site locally (requires a local server for JSON data loading):

```bash
python3 -m http.server 8080
```

Then open [localhost:8080](http://localhost:8080).

Find your host machine's ip address to preview on your mobile device on the same network.
```
ipconfig getifaddr en0
```

Then for example, go to your phone and type the ip address plus port into your browser.

For example [192.168.1.155:8080](http://192.168.1.155:8080).


## Tests

The Hong Kong scoring calculator (`js/points.js`), the Play game's engine, bots and shuffle physics (`js/mahjong-engine.js`, `js/mahjong-bot.js`, `js/mahjong-game.js`), homepage renderer (`js/main.js`), community page (`js/community.js`), tile quiz (`js/tile-quiz.js`), and media formatter (`scripts/format-media-lib.js`) have unit tests using Node's built-in test runner. Requires **Node.js 18+**.

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
│   └── index.html          # Scoring guide + interactive points calculator
├── play-mahjong/
│   └── index.html          # Play page: settings preview + canvas game
├── 404.html                # Custom not-found page
├── logo.png / logo.webp    # Club logo
├── css/
│   ├── styles.css          # Shared styles and design tokens
│   ├── community.css       # Community page styles
│   ├── points.css          # Points calculator styles
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
│   ├── mahjong-bot.js      # Play: bot decisions and hint tips
│   ├── mahjong-bot.test.js
│   ├── mahjong-game.js     # Play: canvas table, animation, sound
│   └── mahjong-shuffle.test.js
├── scripts/
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
