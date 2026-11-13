"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const PAGES = [
  "index.html",
  "play-mahjong/index.html",
  "playing-mahjong/index.html",
  "hong-kong-mahjong-scoring/index.html",
  "events/index.html",
  "community/index.html",
  "which-mahjong-tiles-are-you/index.html",
  "privacy-policy/index.html",
  "terms-and-conditions/index.html",
  "refund-policy/index.html",
];

// The pattern each page uses to spot a local or private address.
function localPattern(html) {
  const m = /var localHost = \/(.+)\/i\.test\(location\.hostname\);/.exec(html);
  assert.ok(m, "page has the local-address check");
  return new RegExp(m[1], "i");
}

test("every page that loads Google Analytics skips it on local addresses", () => {
  PAGES.forEach((page) => {
    const html = fs.readFileSync(path.join(ROOT, page), "utf8");
    assert.match(html, /G-B514HH987M/, page + " loads Google Analytics");
    assert.match(html, /if \(!localHost\) \{/, page + " only loads it off a local address");
    assert.match(html, /function gtag\(\)\{ if \(!localHost\) dataLayer\.push\(arguments\); else \(window\.lcmLocalEvents = window\.lcmLocalEvents \|\| \[\]\)\.push\(\[\]\.slice\.call\(arguments\)\); \}/, page + " sends nothing from a local address, and keeps the calls locally");
    // The script tag isn't in the page itself: it's added only when not local.
    assert.doesNotMatch(html, /<script async src="https:\/\/www\.googletagmanager\.com/, page + " has no always-on tag");
  });
});

test("localhost and private network addresses count as local", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const local = localPattern(html);
  ["localhost", "127.0.0.1", "::1", "[::1]", "192.168.1.20", "192.168.0.5", "10.0.0.7", "172.16.4.2", "172.31.255.1", "my-laptop.local"].forEach((host) => {
    assert.ok(local.test(host), host + " is local");
  });
});

test("the live site and public addresses are not local", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const local = localPattern(html);
  ["luckycatmahjong.com", "www.luckycatmahjong.com", "codenameyau.github.io", "172.32.0.1", "172.15.0.1", "8.8.8.8", "192.169.1.1"].forEach((host) => {
    assert.ok(!local.test(host), host + " is not local");
  });
});

test("every page that loads Google Analytics starts the visitor IDs and cookie choice before the page view", () => {
  PAGES.forEach((page) => {
    const html = fs.readFileSync(path.join(ROOT, page), "utf8");
    const start = html.indexOf("if (window.lcmAnalytics) window.lcmAnalytics.start(gtag);");
    const gtagFn = html.indexOf("function gtag(){");
    const config = html.indexOf("gtag(\"config\", \"G-B514HH987M\")");
    assert.ok(gtagFn < start && start < config, page + " starts it after gtag is defined and before config");
    // The homepage defers js/analytics-id.js so it doesn't hold up the first paint
    // (PageSpeed): the snippet defines gtag and lcmStartAnalytics, and the deferred
    // script's onload runs it, before js/nav.js and js/main.js (deferred scripts run in
    // order), so the IDs still come before the page view and every event.
    const deferred = "<script src=\"/js/analytics-id.js\" defer onload=\"lcmStartAnalytics()\" onerror=\"lcmStartAnalytics()\"></script>";
    if (page === "index.html") {
      const script = html.indexOf(deferred);
      assert.ok(script > config, page + " loads js/analytics-id.js deferred, after the snippet");
      assert.ok(html.indexOf("function lcmStartAnalytics()") < start, page + " starts it inside lcmStartAnalytics");
      const later = ["/js/nav.js", "js/main.js"].map((src) => html.indexOf("<script src=\"" + src + "\" defer>"));
      later.forEach((at) => assert.ok(at > script, page + " runs it before the other deferred scripts"));
      assert.equal((html.match(/src="\/js\/analytics-id\.js"/g) || []).length, 1, page + " loads it once");
      return;
    }
    const script = html.indexOf("<script src=\"/js/analytics-id.js\"></script>");
    assert.ok(script > 0, page + " loads js/analytics-id.js");
    assert.ok(script < gtagFn, page + " loads it (not deferred) before the snippet");
    assert.doesNotMatch(html, /analytics-id\.js"[^>]*(defer|async)/, page + " loads it in order");
  });
});

test("every page with a footer links the privacy policy and cookie settings", () => {
  const pages = PAGES.filter((p) => p !== "playing-mahjong/index.html");
  pages.forEach((page) => {
    const html = fs.readFileSync(path.join(ROOT, page), "utf8");
    const footer = /<footer class="site-footer">[\s\S]*?<\/footer>/.exec(html);
    assert.ok(footer, page + " has the site footer");
    assert.match(footer[0], /<a href="\/privacy-policy\/" class="footer-link">Privacy Policy<\/a>/, page + " links the privacy policy");
    assert.match(footer[0], /<a href="\/terms-and-conditions\/" class="footer-link">Terms and Conditions<\/a>/, page + " links the terms and conditions");
    assert.match(footer[0], /<a href="\/refund-policy\/" class="footer-link">Refund Policy<\/a>/, page + " links the refund policy");
    assert.match(footer[0], /class="footer-link js-cookie-settings">Cookie Settings<\/button>/, page + " has cookie settings");
    const order = ["Terms and Conditions", "Privacy Policy", "Refund Policy", "Cookie Settings"].map((label) => footer[0].indexOf(">" + label + "<"));
    assert.deepEqual(order.slice().sort((x, y) => x - y), order, page + " lists Terms and Conditions, Privacy Policy, Refund Policy, Cookie Settings");
    assert.doesNotMatch(footer[0], /Your Privacy Choices/, page + " has no Your Privacy Choices link");
    assert.equal((footer[0].match(/class="footer-link[ "]/g) || []).length, 4, page + " has four footer links");
  });
  const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  assert.match(sitemap, /<loc>https:\/\/luckycatmahjong\.com\/privacy-policy\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/luckycatmahjong\.com\/terms-and-conditions\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/luckycatmahjong\.com\/refund-policy\/<\/loc>/);
});
