'use strict';

const fs = require('fs');
const path = require('path');
const {
  truncateText,
  absoluteUrl,
} = require('../js/events-lib.js');
const { loadEvents } = require('./sync-events-lib.js');

const ROOT = path.resolve(__dirname, '..');
const EVENTS_DIR = path.join(ROOT, 'data', 'events');
const INDEX_PATH = path.join(ROOT, 'data', 'events-index.json');
const DETAIL_TEMPLATE_PATH = path.join(ROOT, 'events', '_detail', 'index.html');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const SITE_ORIGIN = 'https://luckycatmahjong.com';
const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/logo.png`;

function loadEventsFromDisk() {
  return loadEvents(EVENTS_DIR);
}

function replaceAll(template, replacements) {
  return Object.keys(replacements).reduce(function (html, key) {
    return html.split(`{{${key}}}`).join(replacements[key]);
  }, template);
}

function eventDescription(event) {
  if (event.description) return truncateText(event.description.replace(/\s+/g, ' '), 160);
  const parts = [event.title, event.location, event.price].filter(Boolean);
  return truncateText(parts.join(' · '), 160);
}

function writeDetailPages(events, template) {
  const generatedDirs = new Set();

  events.forEach(function (event) {
    const slug = event.slug;
    const outDir = path.join(ROOT, 'events', slug);
    const outPath = path.join(outDir, 'index.html');
    const canonical = `${SITE_ORIGIN}/events/${slug}/`;
    const ogImage = event.flyer ? absoluteUrl(event.flyer, SITE_ORIGIN) : DEFAULT_OG_IMAGE;
    const html = replaceAll(template, {
      TITLE: escapeAttr(event.title),
      DESCRIPTION: escapeAttr(eventDescription(event)),
      SLUG: escapeAttr(slug),
      CANONICAL_URL: escapeAttr(canonical),
      OG_IMAGE: escapeAttr(ogImage),
      OG_IMAGE_ALT: escapeAttr(event.title + ' flyer'),
    });

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, html, 'utf8');
    generatedDirs.add(slug);
  });

  cleanupStaleDetailPages(generatedDirs);
}

function cleanupStaleDetailPages(validSlugs) {
  const eventsRoot = path.join(ROOT, 'events');
  if (!fs.existsSync(eventsRoot)) return;

  fs.readdirSync(eventsRoot, { withFileTypes: true }).forEach(function (entry) {
    if (!entry.isDirectory()) return;
    if (entry.name === '_detail') return;
    if (validSlugs.has(entry.name)) return;

    const dirPath = path.join(eventsRoot, entry.name);
    fs.rmSync(dirPath, { recursive: true, force: true });
  });
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function writeEventsIndex(events) {
  fs.writeFileSync(INDEX_PATH, JSON.stringify({ events: events }, null, 2) + '\n', 'utf8');
}

function updateSitemap(events) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    {
      loc: `${SITE_ORIGIN}/events/`,
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.9',
    },
  ];

  events.forEach(function (event) {
    urls.push({
      loc: `${SITE_ORIGIN}/events/${event.slug}/`,
      lastmod: event.date || today,
      changefreq: 'monthly',
      priority: isPast(event.date) ? '0.5' : '0.8',
    });
  });

  const nonEventUrls = extractNonEventUrls();
  const xml = buildSitemap(nonEventUrls.concat(urls));
  fs.writeFileSync(SITEMAP_PATH, xml, 'utf8');
}

function isPast(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr));
  if (!match) return false;
  const eventDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return eventDate < today;
}

function extractNonEventUrls() {
  if (!fs.existsSync(SITEMAP_PATH)) return [];
  const xml = fs.readFileSync(SITEMAP_PATH, 'utf8');
  const urls = [];
  const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];

  urlBlocks.forEach(function (block) {
    const locMatch = /<loc>([^<]+)<\/loc>/.exec(block);
    if (!locMatch) return;
    const loc = locMatch[1];
    if (loc.includes('/events/')) return;

    urls.push({
      loc: loc,
      lastmod: (/<lastmod>([^<]+)<\/lastmod>/.exec(block) || [])[1],
      changefreq: (/<changefreq>([^<]+)<\/changefreq>/.exec(block) || [])[1],
      priority: (/<priority>([^<]+)<\/priority>/.exec(block) || [])[1],
      imageBlock: (/<image:image>[\s\S]*?<\/image:image>/.exec(block) || [])[0] || '',
    });
  });

  return urls;
}

function buildSitemap(urlEntries) {
  const body = urlEntries.map(function (entry) {
    const parts = [
      '  <url>',
      `    <loc>${entry.loc}</loc>`,
    ];
    if (entry.lastmod) parts.push(`    <lastmod>${entry.lastmod}</lastmod>`);
    if (entry.changefreq) parts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
    if (entry.priority) parts.push(`    <priority>${entry.priority}</priority>`);
    if (entry.imageBlock) {
      entry.imageBlock.split('\n').forEach(function (line) {
        parts.push('    ' + line.trim());
      });
    }
    parts.push('  </url>');
    return parts.join('\n');
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
    `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
    `${body}\n` +
    `</urlset>\n`;
}

function main() {
  const template = fs.readFileSync(DETAIL_TEMPLATE_PATH, 'utf8');
  const result = loadEventsFromDisk();

  result.warnings.forEach(function (message) {
    console.warn('sync-events:', message);
  });

  writeEventsIndex(result.events);
  writeDetailPages(result.events, template);
  updateSitemap(result.events);

  console.log(`sync-events: indexed ${result.events.length} event(s)`);
}

main();
