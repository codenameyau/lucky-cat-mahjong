/* Shared site header: nav links from data/nav.json, mobile hamburger menu, scroll shadow. */

(function () {
  "use strict";

  var NAV_JSON = "/data/nav.json";

  var DEFAULT_LINKS = [
    { label: "Community", href: "/community/" },
    { label: "Events", href: "/events/" },
    { label: "Points Guide", href: "/hong-kong-mahjong-scoring/" },
    { label: "Personality Quiz", href: "/which-mahjong-tiles-are-you/" },
    { label: "Play Mahjong", href: "/play-mahjong/" },
  ];

  // Line icons for the nav links (also written into each page's own nav, so there is no flash).
  var NAV_ICONS = {
    "/community/": "<circle cx=\"9\" cy=\"8\" r=\"3.2\"/><path d=\"M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5\"/><circle cx=\"17\" cy=\"9\" r=\"2.5\"/><path d=\"M16.5 13.7c2.6 0 4.5 1.8 4.5 4.3\"/>",
    "/events/": "<rect x=\"3.5\" y=\"5\" width=\"17\" height=\"15.5\" rx=\"2.5\"/><path d=\"M3.5 10h17M8 3v4M16 3v4\"/>",
    "/hong-kong-mahjong-scoring/": "<rect x=\"5\" y=\"3\" width=\"14\" height=\"18\" rx=\"2.5\"/><path d=\"M8.5 7.5h7\"/><path d=\"M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01\"/>",
    "/which-mahjong-tiles-are-you/": "<path d=\"M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z\"/><path d=\"M19 15v4M17 17h4\"/>",
    "/play-mahjong/": "<rect x=\"3.5\" y=\"3.5\" width=\"17\" height=\"17\" rx=\"3\"/><circle cx=\"8.6\" cy=\"8.6\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"15.4\" cy=\"8.6\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"12\" cy=\"12\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"8.6\" cy=\"15.4\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"15.4\" cy=\"15.4\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/>",
  };

  function navIcon(href) {
    var path = String(href || "").split("#")[0];
    var paths = NAV_ICONS[path];
    return paths ? "<svg class=\"nav-icon\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\">" + paths + "</svg>" : "";
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizePath(path) {
    if (!path || path === "/") return "/";
    return path.replace(/\/index\.html$/, "/").replace(/\/$/, "") || "/";
  }

  function linkIsActive(href) {
    var path = normalizePath(window.location.pathname);
    if (href.indexOf("/#") === 0) return path === "/";
    var linkPath = normalizePath(href.split("#")[0]);
    // A section's link stays highlighted on its sub-pages too (a quiz tile's page).
    return path === linkPath || (linkPath !== "/" && path.indexOf(linkPath + "/") === 0);
  }

  function renderListItems(links) {
    return links.map(function (item) {
      var active = linkIsActive(item.href) ? " is-active" : "";
      return "<li><a href=\"" + escapeHtml(item.href) + "\" class=\"nav-link" + active + "\">" +
        navIcon(item.href) + escapeHtml(item.label) + "</a></li>";
    }).join("");
  }

  function renderHeader(links) {
    return (
      "<nav class=\"nav container\">" +
        "<a href=\"/\" class=\"header-brand\" aria-label=\"Lucky Cat Mahjong home\">" +
          "<picture>" +
            "<source srcset=\"/logo.webp\" type=\"image/webp\">" +
            "<img src=\"/logo.png\" alt=\"\" class=\"header-logo\" width=\"36\" height=\"37\" decoding=\"async\" draggable=\"false\">" +
          "</picture>" +
          "<span class=\"header-brand-name\">Lucky Cat Mahjong</span>" +
        "</a>" +
        "<button type=\"button\" class=\"nav-toggle\" aria-label=\"Toggle menu\" aria-expanded=\"false\">" +
          "<span></span>" +
          "<span></span>" +
          "<span></span>" +
        "</button>" +
        "<ul class=\"nav-links\">" +
          renderListItems(links) +
        "</ul>" +
      "</nav>"
    );
  }

  function applyActiveStates(list) {
    list.querySelectorAll("a.nav-link").forEach(function (a) {
      a.classList.toggle("is-active", linkIsActive(a.getAttribute("href") || ""));
    });
  }

  function getLinksFromList(list) {
    return Array.prototype.map.call(list.querySelectorAll("a.nav-link"), function (a) {
      return { label: a.textContent, href: a.getAttribute("href") || "" };
    });
  }

  function linksEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i].label !== b[i].label || a[i].href !== b[i].href) return false;
    }
    return true;
  }

  function measureNavLinksHeight(links) {
    var wasOpen = links.classList.contains("open");
    links.classList.add("open");
    var previous = links.style.maxHeight;
    links.style.maxHeight = "none";
    var height = links.scrollHeight;
    links.style.maxHeight = previous;
    if (!wasOpen) links.classList.remove("open");
    return height;
  }

  function syncMobileNavHeight(header, links) {
    if (!header || !links) return;
    if (!links.classList.contains("open")) {
      header.style.setProperty("--mobile-nav-height", "0px");
      return;
    }
    header.style.setProperty("--mobile-nav-height", measureNavLinksHeight(links) + "px");
  }

  function setMobileNavOpen(header, links, toggle, open) {
    links.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    syncMobileNavHeight(header, links);
  }

  function setupLinkCloseHandlers(header) {
    var toggle = document.querySelector(".nav-toggle");
    var links = document.querySelector(".nav-links");
    if (!toggle || !links) return;

    links.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        setMobileNavOpen(header, links, toggle, false);
      });
    });
  }

  function trackNav(name, params) {
    params.page = window.location.pathname;
    if (typeof window.gtag === "function") window.gtag("event", name, params);
  }

  // What kind of site a link leaves to, so reports group them without a
  // custom dimension per address.
  function linkType(host) {
    if (/(^|\.)github\.com$/.test(host)) return "github";
    if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
    if (/(^|\.)tickettailor\.com$/.test(host)) return "tickettailor";
    if (/(^|\.)huggingface\.co$/.test(host)) return "huggingface";
    return "other";
  }

  // Every link off the site, on every page with the header: outbound_click with
  // the domain and its kind (only the address's host, never its path or query).
  function setupOutbound() {
    if (document.documentElement.dataset.outboundBound) return;
    document.documentElement.dataset.outboundBound = "true";
    document.addEventListener("click", function (e) {
      var link = e.target.closest && e.target.closest("a[href]");
      if (!link || !/^https?:$/.test(link.protocol)) return;
      var host = link.hostname.replace(/^www\./, "");
      if (!host || host === window.location.hostname.replace(/^www\./, "") || /(^|\.)luckycatmahjong\.com$/.test(host)) return;
      trackNav("outbound_click", { link_domain: host, link_type: linkType(host) });
    });
  }

  function setupMenu(header) {
    var toggle = document.querySelector(".nav-toggle");
    var links = document.querySelector(".nav-links");
    if (!toggle || !links || toggle.dataset.bound) return;
    toggle.dataset.bound = "true";

    toggle.addEventListener("click", function () {
      setMobileNavOpen(header, links, toggle, !links.classList.contains("open"));
      trackNav("nav_toggle_click", {});
    });

    document.addEventListener("click", function (e) {
      var link = e.target.closest(".nav-link, .header-brand");
      if (link) trackNav("nav_click", { link: link.textContent.trim() || "Home" });
    });

    window.addEventListener("resize", function () {
      syncMobileNavHeight(header, links);
    });

    setupLinkCloseHandlers(header);
  }

  function setupScrollShadow(header) {
    var onScroll = function () {
      header.classList.toggle("scrolled", window.scrollY > 8);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function setupBrandProtection() {
    document.querySelectorAll(".header-logo, .header-brand picture").forEach(function (el) {
      el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    });
  }

  function loadNavConfig() {
    return fetch(NAV_JSON)
      .then(function (res) {
        if (!res.ok) throw new Error("nav.json " + res.status);
        return res.json();
      })
      .then(function (data) {
        return Array.isArray(data.links) ? data.links : [];
      });
  }

  function init() {
    var header = document.getElementById("site-header");
    if (!header) return;

    var list = header.querySelector(".nav-links");
    if (!list) {
      header.innerHTML = renderHeader(DEFAULT_LINKS);
      list = header.querySelector(".nav-links");
    }

    if (!list) return;

    applyActiveStates(list);
    setupMenu(header);
    setupOutbound();
    setupScrollShadow(header);
    setupBrandProtection();

    loadNavConfig()
      .then(function (links) {
        if (!links.length) return;
        if (!linksEqual(links, getLinksFromList(list))) {
          list.innerHTML = renderListItems(links);
          setupLinkCloseHandlers(header);
        }
        applyActiveStates(list);
        syncMobileNavHeight(header, list);
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
