# Lucky Cat Mahjong

A static website for the Lucky Cat Mahjong club, with content managed through [Pages CMS](https://pagescms.org).

## Features

- **Logo & branding** — Uses `logo.png` with a red-forward color palette matching the Lucky Cat brand
- **Sticky header** — Persistent navigation with always-visible "Book a session" and Instagram buttons
- **Conversion-focused CTAs** — Hero and closing calls-to-action drive emails and Instagram DMs
- **Request-a-quote form** — Static lead form that builds a pre-filled email *or* an Instagram DM (no backend needed); the form is copied to the clipboard before opening Instagram
- **Direct Instagram DM links** — "Message us" buttons open straight into a DM via `ig.me/m/<handle>`
- **Pre-filled email** — `mailto:` links open with a subject and a short template so leads arrive qualified
- **Social proof** — Editable testimonials section and hero "stats" band to build trust
- **Floating mobile contact bar** — Email + DM buttons pinned to the bottom on phones
- **Analytics events** — All CTAs fire Google Analytics 4 events (`book_cta`, `email_click`, `instagram_dm`, `instagram_profile`, `quote_submit_email`, `quote_submit_dm`) so engagement is measurable
- **Services** — Office workshops, business collaborations, and private lessons
- **Editable rates** — Pricing table managed via Pages CMS
- **Customizable style guide** — Fonts, primary/secondary colors, and accent colors all editable in the CMS
- **Instagram** — Links to [@luckycat.mahjong](https://www.instagram.com/luckycat.mahjong/)

## Local preview

Serve the site locally (requires a local server for JSON data loading):

```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

## Editing content with Pages CMS

1. Go to [app.pagescms.org](https://app.pagescms.org) and sign in with GitHub
2. Install the Pages CMS GitHub App on this repository
3. Open the repo — the `.pages.yml` config defines all editable content:
   - **Site Settings** — Title, hero text, about section, contact email, Instagram, and hero stats
   - **Style Guide** — Body font, heading font, and all brand colors
   - **Services** — Add, edit, or reorder service offerings
   - **Rates** — Set and update pricing for each service
   - **Testimonials** — Add reviews/social proof (leave empty to hide the section)
   - **FAQ** — Questions and answers

Changes save directly to the JSON files in `data/` and deploy with your next push.

## Deploy to GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Set **Source** to **Deploy from a branch**
4. Choose the `main` branch and `/ (root)` folder
5. Save — your site will be live at `https://<username>.github.io/lucky-cat-mahjong/`

## Project structure

```
├── .pages.yml          # Pages CMS configuration
├── index.html          # Main page
├── logo.png            # Club logo
├── css/styles.css      # Styles (CSS variables from styleguide)
├── js/main.js          # Loads CMS data and renders content
├── data/
│   ├── site.json         # Site settings, copy & hero stats
│   ├── styleguide.json   # Fonts & colors
│   ├── services.json     # Service offerings
│   ├── rates.json        # Pricing table
│   ├── testimonials.json # Social proof / reviews
│   └── faq.json          # Frequently asked questions
└── media/              # Uploaded media (via Pages CMS)
```
