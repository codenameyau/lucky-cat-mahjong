'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('./analytics-id.js');

const ROOT = path.join(__dirname, '..');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// A browser's cookie jar: document.cookie reads name=value pairs, and each write
// sets or (Max-Age=0) deletes one, keyed by name and domain.
function cookieJar() {
  const jar = new Map();
  const writes = [];
  return {
    writes,
    jar,
    get cookie() { return Array.from(jar.values()).map((c) => c.name + '=' + c.value).join('; '); },
    set cookie(str) {
      writes.push(str);
      const parts = str.split(/;\s*/);
      const [name, ...rest] = parts[0].split('=');
      const value = rest.join('=');
      const attrs = {};
      parts.slice(1).forEach((p) => { const [k, v] = p.split('='); attrs[k.toLowerCase()] = v === undefined ? true : v; });
      const key = name + '|' + (attrs.domain || '');
      if (attrs['max-age'] === '0') jar.delete(key);
      else jar.set(key, { name, value, attrs });
    },
  };
}

function setup(opts = {}) {
  const doc = cookieJar();
  if (opts.cookies) Object.entries(opts.cookies).forEach(([k, v]) => { doc.cookie = k + '=' + v + '; Path=/'; });
  doc.writes.length = 0;
  const win = {};
  let t = opts.now || 1_000_000;
  const api = A.create({
    window: win,
    document: doc,
    navigator: opts.navigator || {},
    location: { protocol: opts.protocol || 'https:', hostname: 'luckycatmahjong.com' },
    timeZone: opts.timeZone === undefined ? 'America/New_York' : opts.timeZone,
    now: () => t,
  });
  const calls = [];
  const gtag = (...args) => calls.push(args);
  return { api, doc, win, calls, gtag, advance: (ms) => { t += ms; } };
}

function cookie(doc, name) {
  const c = Array.from(doc.jar.values()).find((x) => x.name === name);
  return c ? c.value : undefined;
}

test('a first visit gets a random visitor ID and session, sent to GA as user_id', () => {
  const { api, doc, win, calls, gtag } = setup();
  assert.equal(api.start(gtag), 'granted');
  const vid = cookie(doc, 'lcm_vid');
  const [id, sessions] = vid.split('.');
  assert.match(id, UUID);
  assert.equal(sessions, '1');
  assert.match(cookie(doc, 'lcm_sid'), UUID);
  const set = calls.find((c) => c[0] === 'set');
  assert.deepEqual(set[1], {
    user_id: id,
    visitor_id: id,
    visitor_session_id: cookie(doc, 'lcm_sid'),
    visitor_session_number: 1,
  });
  assert.equal(win['ga-disable-G-B514HH987M'], false);
});

test('the cookies are first-party, Lax, Secure on https, and last 400 days and 7 hours 55 minutes', () => {
  const { api, doc, gtag } = setup();
  api.start(gtag);
  const vid = doc.writes.find((w) => w.startsWith('lcm_vid='));
  const sid = doc.writes.find((w) => w.startsWith('lcm_sid='));
  assert.match(vid, /Path=\/; Max-Age=34560000; SameSite=Lax; Secure$/);
  assert.match(sid, /Path=\/; Max-Age=28500; SameSite=Lax; Secure$/);
  assert.doesNotMatch(vid, /Domain=/);
  const local = setup({ protocol: 'http:' });
  local.api.start(local.gtag);
  assert.doesNotMatch(local.doc.writes.find((w) => w.startsWith('lcm_vid=')), /Secure/);
});

test('the ID never comes from anything personal: only random UUIDs are kept', () => {
  const { api, doc, calls, gtag } = setup({ cookies: { lcm_vid: encodeURIComponent('jane@example.com.3') } });
  api.start(gtag);
  assert.match(cookie(doc, 'lcm_vid').split('.')[0], UUID);
  assert.doesNotMatch(JSON.stringify(calls), /jane|example/);
  assert.equal(A.parseVisitor('not-a-uuid-at-all-but-36-characters.2'), null);
  for (let i = 0; i < 20; i++) assert.match(A.uuid(null, Math.random), UUID);
  assert.match(A.uuid({ getRandomValues: (a) => { a.fill(255); return a; } }), UUID);
});

test('a returning visitor keeps their ID; a session lasts until 7 hours 55 minutes without a page or click', () => {
  const first = setup();
  first.api.start(first.gtag);
  const id = first.api.ids().visitorId;
  const sid = first.api.ids().sessionId;

  // Same session: the next page within the session timeout.
  const page2 = setup({ cookies: { lcm_vid: id + '.1', lcm_sid: sid } });
  page2.api.start(page2.gtag);
  assert.deepEqual(page2.api.ids(), { visitorId: id, sessionId: sid, sessionNumber: 1 });

  // The session cookie has expired: a new session, numbered 2.
  const later = setup({ cookies: { lcm_vid: id + '.1' } });
  later.api.start(later.gtag);
  assert.equal(later.api.ids().visitorId, id);
  assert.notEqual(later.api.ids().sessionId, sid);
  assert.equal(later.api.ids().sessionNumber, 2);
  assert.equal(cookie(later.doc, 'lcm_vid'), id + '.2');
});

test('clicks keep the session cookie fresh, at most once a minute', () => {
  const s = setup();
  s.api.start(s.gtag);
  const writes = () => s.doc.writes.filter((w) => w.startsWith('lcm_sid=')).length;
  const before = writes();
  s.api.renew();
  assert.equal(writes(), before, 'not again within a minute');
  s.advance(61_000);
  s.api.renew();
  assert.equal(writes(), before + 1);
});

test('consent defaults: denied by Google region in Europe, then this browser\'s state', () => {
  const { api, calls, gtag } = setup();
  api.start(gtag);
  const defaults = calls.filter((c) => c[0] === 'consent' && c[1] === 'default');
  assert.equal(defaults.length, 2);
  assert.equal(defaults[0][2].analytics_storage, 'denied');
  assert.ok(defaults[0][2].region.includes('DE') && defaults[0][2].region.includes('GB') && defaults[0][2].region.includes('CH'));
  assert.equal(defaults[1][2].analytics_storage, 'granted');
  assert.equal(defaults[1][2].region, undefined);
  // Before the page's set and config.
  assert.ok(calls.findIndex((c) => c[0] === 'consent') < calls.findIndex((c) => c[0] === 'set'));
});

test('in Europe nothing is set or sent until the visitor accepts', () => {
  ['Europe/Berlin', 'Europe/London', 'Europe/Zurich', 'Atlantic/Canary'].forEach((tz) => {
    const { api, doc, win, calls, gtag } = setup({ timeZone: tz });
    assert.equal(api.start(gtag), 'pending', tz);
    assert.equal(cookie(doc, 'lcm_vid'), undefined);
    assert.equal(cookie(doc, 'lcm_sid'), undefined);
    assert.equal(win['ga-disable-G-B514HH987M'], true);
    assert.equal(calls.find((c) => c[0] === 'set'), undefined);

    api.setConsent('granted');
    assert.equal(cookie(doc, 'lcm_consent'), 'granted');
    assert.match(cookie(doc, 'lcm_vid'), /\.1$/);
    assert.equal(win['ga-disable-G-B514HH987M'], false);
    assert.deepEqual(calls.find((c) => c[0] === 'consent' && c[1] === 'update')[2].analytics_storage, 'granted');
    assert.ok(calls.find((c) => c[0] === 'set'));
    assert.deepEqual(calls[calls.length - 1], ['event', 'page_view'], 'the held-back page view is sent');
  });
  ['America/New_York', 'America/Los_Angeles', 'Asia/Hong_Kong', ''].forEach((tz) => {
    assert.equal(setup({ timeZone: tz }).api.start(() => {}), 'granted', tz || 'no time zone');
  });
});

test('declining deletes the IDs and Google\'s cookies and disables GA', () => {
  const { api, doc, win, calls, gtag } = setup({ cookies: { _ga: 'GA1.1.123', _ga_B514HH987M: 'GS1.1.x' } });
  api.start(gtag);
  assert.ok(cookie(doc, 'lcm_vid'));
  api.setConsent('denied');
  assert.equal(cookie(doc, 'lcm_consent'), 'denied');
  assert.equal(cookie(doc, 'lcm_vid'), undefined);
  assert.equal(cookie(doc, 'lcm_sid'), undefined);
  assert.equal(cookie(doc, '_ga'), undefined);
  assert.equal(cookie(doc, '_ga_B514HH987M'), undefined);
  assert.ok(doc.writes.some((w) => w.startsWith('_ga=') && /Domain=\.luckycatmahjong\.com/.test(w)), 'on the parent domain too');
  assert.equal(win['ga-disable-G-B514HH987M'], true);
  assert.equal(api.fields().user_id, undefined);
  assert.equal(calls.find((c) => c[0] === 'consent' && c[1] === 'update')[2].analytics_storage, 'denied');

  // The next page remembers it.
  const next = setup({ cookies: { lcm_consent: 'denied' } });
  assert.equal(next.api.start(next.gtag), 'denied');
  assert.equal(cookie(next.doc, 'lcm_vid'), undefined);
});

test('Global Privacy Control turns analytics off unless the visitor turns it on', () => {
  const gpc = { globalPrivacyControl: true };
  const s = setup({ navigator: gpc });
  assert.equal(s.api.start(s.gtag), 'denied');
  assert.equal(cookie(s.doc, 'lcm_vid'), undefined);
  const chose = setup({ navigator: gpc, cookies: { lcm_consent: 'granted' } });
  assert.equal(chose.api.start(chose.gtag), 'granted');
});

test('the privacy page explains every cookie the tracker sets, and the GA4 settings', () => {
  const html = fs.readFileSync(path.join(ROOT, 'privacy/index.html'), 'utf8');
  Object.values(A.COOKIES).forEach((name) => assert.match(html, new RegExp('<code>' + name + '</code>'), name));
  assert.match(html, /<code>_ga<\/code>/);
  ['Google signals', 'User-ID', 'User-provided data collection', 'Granular location and device data', 'User Data Collection Acknowledgement'].forEach((s) => assert.ok(html.includes(s), s));
  assert.match(html, /We do not sell your personal information, and we do not share it with marketers or other businesses/);
  assert.doesNotMatch(html, /sell, or lease/);
  assert.match(html, /id="choices"/, 'the footer links #choices');
  assert.match(html, /id="california"/);
  assert.match(html, /Global Privacy Control/);
  assert.match(html, /adssettings\.google\.com/);
  assert.match(html, /name, email address and Instagram handle/);
  assert.match(html, /data-consent="granted"/);
  assert.match(html, /data-consent="denied"/);
  assert.match(html, /data-consent-status/);
  assert.match(html, /mailto:events@luckycatmahjong\.com/);
  assert.match(html, /id="cookies"/, 'the banner links to #cookies');
});
