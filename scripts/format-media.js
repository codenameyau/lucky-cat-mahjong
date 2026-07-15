'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const sharp = require('sharp');
const {
  mediaWebPath,
  buildDateToWebpMap,
  updateCommunityFromMedia,
} = require('./format-media-lib.js');

const ROOT = path.resolve(__dirname, '..');
const MEDIA_DIR = path.join(ROOT, 'media');
const COMMUNITY_JSON = path.join(ROOT, 'data', 'community.json');
const TARGET_WIDTH = 2000;
const TARGET_HEIGHT = Math.round(TARGET_WIDTH * (2 / 3));
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const JPEG_EXTENSIONS = new Set(['.jpg', '.jpeg']);

function listMediaImages(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap(function (entry) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) return listMediaImages(entryPath);
    if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) return [entryPath];
    return [];
  });
}

async function formatImage(sourcePath) {
  const filename = path.basename(sourcePath);
  const ext = path.extname(filename).toLowerCase();
  const isJpeg = JPEG_EXTENSIONS.has(ext);
  const relativeDir = path.relative(MEDIA_DIR, path.dirname(sourcePath));
  const oldRelativePath = path.relative(MEDIA_DIR, sourcePath);
  const oldWebPath = mediaWebPath(oldRelativePath);
  const meta = await sharp(sourcePath).metadata();

  const outFilename = randomUUID() + '.webp';
  const outRelativePath = relativeDir === '' ? outFilename : path.join(relativeDir, outFilename);
  const outPath = path.join(MEDIA_DIR, outRelativePath);
  const pipeline = sharp(sourcePath).rotate();

  if (isJpeg || meta.width !== TARGET_WIDTH) {
    pipeline.resize(TARGET_WIDTH, TARGET_HEIGHT, {
      fit: 'cover',
      position: 'centre',
    });
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await pipeline.webp({ quality: 85 }).toFile(outPath);

  if (sourcePath !== outPath && fs.existsSync(sourcePath)) {
    fs.unlinkSync(sourcePath);
  }

  return {
    status: 'updated',
    webPath: mediaWebPath(outRelativePath),
    oldWebPath: oldWebPath,
    sourcePath: sourcePath,
    from: filename,
  };
}

async function processMediaFolder() {
  const files = listMediaImages(MEDIA_DIR);
  const results = [];
  const processedDates = new Set();

  for (const sourcePath of files) {
    if (!fs.existsSync(sourcePath)) continue;

    const filename = path.basename(sourcePath);
    const relativePath = path.relative(MEDIA_DIR, sourcePath);
    const dateKey = relativePath.split(path.sep)[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      processedDates.add(dateKey);
    }
    try {
      const result = await formatImage(sourcePath);
      results.push(result);
      if (result.status === 'updated') {
        console.log(`updated ${result.from} -> ${result.webPath}`);
      }
    } catch (err) {
      console.error(`failed ${filename}: ${err.message}`);
      results.push({ file: filename, status: 'failed', error: err.message });
    }
  }

  return { results: results, processedDates: processedDates };
}

function datesMissingFromCommunity(community, dateToPhotos) {
  const missing = new Set();
  const existing = new Set(
    (community.events || [])
      .map(function (event) {
        return event && event.date ? String(event.date).slice(0, 10) : '';
      })
      .filter(Boolean)
  );

  dateToPhotos.forEach(function (_photos, dateKey) {
    if (!existing.has(dateKey)) missing.add(dateKey);
  });

  return missing;
}

function syncCommunityJson(processedDates) {
  if (!fs.existsSync(COMMUNITY_JSON)) return false;

  const community = JSON.parse(fs.readFileSync(COMMUNITY_JSON, 'utf8'));
  const dateToPhotos = buildDateToWebpMap(MEDIA_DIR, MEDIA_DIR);
  const datesToSync = new Set(processedDates || []);
  datesMissingFromCommunity(community, dateToPhotos).forEach(function (dateKey) {
    datesToSync.add(dateKey);
  });

  if (!datesToSync.size) return false;

  const communityChanged = updateCommunityFromMedia(community, dateToPhotos, datesToSync);

  if (communityChanged) {
    fs.writeFileSync(COMMUNITY_JSON, JSON.stringify(community, null, 2) + '\n', 'utf8');
    console.log(`updated ${COMMUNITY_JSON}`);
  }

  return communityChanged;
}

async function main() {
  if (!fs.existsSync(MEDIA_DIR)) {
    console.log('No media/ folder found.');
    return;
  }

  const mediaRun = await processMediaFolder();
  const communityChanged = syncCommunityJson(mediaRun.processedDates);

  if (!mediaRun.results.length && !communityChanged) {
    console.log('No images found in media/.');
    return;
  }

  const updated = mediaRun.results.filter(function (r) { return r.status === 'updated'; }).length;
  const failed = mediaRun.results.filter(function (r) { return r.status === 'failed'; }).length;
  console.log(`Done: ${updated} updated, ${failed} failed.`);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
