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

The Hong Kong scoring calculator (`js/points.js`), homepage renderer (`js/main.js`), community page (`js/community.js`), and media formatter (`scripts/format-media-lib.js`) have unit tests using Node's built-in test runner. Requires **Node.js 18+**.

```bash
npm test
```

This runs `node --test js/points.test.js js/main.test.js js/community.test.js scripts/format-media.test.js`. Harnesses in `js/points.harness.js` and `js/main.harness.js` load each script in a mocked browser environment so scoring logic and CMS rendering can be tested without opening the page.

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
├── 404.html                # Custom not-found page
├── logo.png / logo.webp    # Club logo
├── css/
│   ├── styles.css          # Shared styles and design tokens
│   ├── community.css       # Community page styles
│   ├── points.css          # Points calculator styles
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
│   └── points.test.js      # Scoring calculator unit tests
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
