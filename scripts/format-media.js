'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const MEDIA_DIR = path.join(ROOT, 'media');
const COMMUNITY_JSON = path.join(ROOT, 'data', 'community.json');
const TARGET_WIDTH = 2000;
const TARGET_HEIGHT = Math.round(TARGET_WIDTH * (2 / 3));
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const JPEG_EXTENSIONS = new Set(['.jpg', '.jpeg']);

function mediaWebPath(relativePath) {
  return '/media/' + relativePath.split(path.sep).join('/');
}

function listMediaImages(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap(function (entry) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) return listMediaImages(entryPath);
    if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) return [entryPath];
    return [];
  });
}

function updateCommunityPhotoPaths(community, pathMap) {
  let changed = false;
  (community.events || []).forEach(function (event) {
    if (!Array.isArray(event.photos)) return;
    event.photos = event.photos.map(function (photo) {
      if (pathMap.has(photo)) {
        changed = true;
        return pathMap.get(photo);
      }
      return photo;
    });
  });
  return changed;
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
  const pathMap = new Map();
  const results = [];

  for (const sourcePath of files) {
    if (!fs.existsSync(sourcePath)) continue;

    const filename = path.basename(sourcePath);
    try {
      const result = await formatImage(sourcePath);
      results.push(result);

      if (result.status === 'updated') {
        pathMap.set(result.oldWebPath, result.webPath);
        console.log(`"${result.webPath}",`);
      }
    } catch (err) {
      console.error(`failed ${filename}: ${err.message}`);
      results.push({ file: filename, status: 'failed', error: err.message });
    }
  }

  return { pathMap: pathMap, results: results };
}

async function main() {
  if (!fs.existsSync(MEDIA_DIR)) {
    console.log('No media/ folder found.');
    return;
  }

  const mediaRun = await processMediaFolder();

  if (!mediaRun.results.length) {
    console.log('No images found in media/.');
    return;
  }

  if (fs.existsSync(COMMUNITY_JSON) && mediaRun.pathMap.size) {
    const community = JSON.parse(fs.readFileSync(COMMUNITY_JSON, 'utf8'));
    const communityChanged = updateCommunityPhotoPaths(community, mediaRun.pathMap);

    if (communityChanged) {
      fs.writeFileSync(COMMUNITY_JSON, JSON.stringify(community, null, 2) + '\n', 'utf8');
      console.log(`updated ${COMMUNITY_JSON}`);
    }
  }

  const updated = mediaRun.results.filter(function (r) { return r.status === 'updated'; }).length;
  const failed = mediaRun.results.filter(function (r) { return r.status === 'failed'; }).length;
  console.log(`Done: ${updated} updated, ${failed} failed.`);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
