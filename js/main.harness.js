'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createTextNode(text) {
  return {
    nodeType: 3,
    textContent: text,
    childNodes: [],
  };
}

function createClassList() {
  const classes = new Set();
  return {
    add: function (name) { classes.add(name); },
    remove: function (name) { classes.delete(name); },
    toggle: function (name, force) {
      if (force === true) classes.add(name);
      else if (force === false) classes.delete(name);
      else if (classes.has(name)) classes.delete(name);
      else classes.add(name);
    },
    contains: function (name) { return classes.has(name); },
  };
}

function createElement(tag) {
  const el = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    id: '',
    className: '',
    classList: createClassList(),
    style: {},
    innerHTML: '',
    textContent: '',
    href: '',
    rel: '',
    hidden: false,
    childNodes: [],
    attributes: {},
    head: null,
    appendChild: function (child) {
      this.childNodes.push(child);
      child.parentNode = this;
      return child;
    },
    remove: function () {
      if (this.parentNode) {
        this.parentNode.childNodes = this.parentNode.childNodes.filter(function (c) { return c !== this; }, this);
      }
    },
    setAttribute: function (name, value) {
      this.attributes[name] = value;
      if (name === 'id') this.id = value;
      if (name === 'class') this.className = value;
    },
    getAttribute: function (name) { return this.attributes[name]; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    closest: function () { return null; },
    addEventListener: function () {},
    reportValidity: function () { return true; },
  };

  Object.defineProperty(el, 'innerHTML', {
    get: function () { return el._innerHTML || ''; },
    set: function (html) {
      el._innerHTML = html;
      el.childNodes = parseSimpleHtml(html);
      el.childNodes.forEach(function (child) {
        child.parentNode = el;
        wireDom(child);
      });
    },
  });

  Object.defineProperty(el, 'textContent', {
    get: function () {
      if (el.childNodes.length) {
        return el.childNodes.map(function (child) {
          return child.nodeType === 3 ? child.textContent : child.textContent;
        }).join('');
      }
      return el._textContent || '';
    },
    set: function (value) {
      el._textContent = value;
      el.childNodes = [createTextNode(value)];
    },
  });

  return el;
}

function matchesSelector(el, selector) {
  let tag = null;
  let className = null;
  let attrName = null;
  let attrValue = null;

  const tagAttrMatch = /^(\w+)\[([^\]=]+)(?:="([^"]*)")?\]$/.exec(selector);
  if (tagAttrMatch) {
    tag = tagAttrMatch[1].toUpperCase();
    attrName = tagAttrMatch[2];
    attrValue = tagAttrMatch[3];
  } else if (selector.startsWith('#')) {
    return el.id === selector.slice(1);
  } else if (selector.startsWith('.')) {
    return el.className.split(/\s+/).filter(Boolean).includes(selector.slice(1));
  } else {
    const attrMatch = /^\[([^\]=]+)(?:="([^"]*)")?\]$/.exec(selector);
    if (attrMatch) {
      attrName = attrMatch[1];
      attrValue = attrMatch[2];
    } else {
      return el.tagName === selector.toUpperCase();
    }
  }

  if (tag && el.tagName !== tag) return false;
  if (className && !el.className.split(/\s+/).filter(Boolean).includes(className)) return false;
  if (attrName) {
    const value = el.getAttribute ? el.getAttribute(attrName) : el.attributes[attrName];
    return attrValue === undefined ? value != null : value === attrValue;
  }
  return true;
}

function splitSelectors(selector) {
  return selector.split(',').map(function (part) { return part.trim(); }).filter(Boolean);
}

function queryOne(root, selector) {
  const selectors = splitSelectors(selector);
  for (let s = 0; s < selectors.length; s++) {
    const single = selectors[s];
    if (single.includes(' ')) {
      const parts = single.trim().split(/\s+/);
      let nodes = [root];
      for (let i = 0; i < parts.length; i++) {
        const next = [];
        for (let j = 0; j < nodes.length; j++) {
          next.push.apply(next, queryAll(nodes[j], parts[i], false));
        }
        nodes = next;
        if (!nodes.length) break;
      }
      if (nodes[0]) return nodes[0];
      continue;
    }
    const found = queryAll(root, single, false);
    if (found[0]) return found[0];
  }
  return null;
}

function parseSimpleHtml(html) {
  const nodes = [];
  let pos = 0;
  while (pos < html.length) {
    while (pos < html.length && html[pos] !== '<') pos++;
    if (pos >= html.length) break;

    const tagMatch = /^<(\w+)([^>]*)>/.exec(html.slice(pos));
    if (!tagMatch) break;

    const tag = tagMatch[1];
    const closeTag = '</' + tag + '>';
    let depth = 1;
    let cursor = pos + tagMatch[0].length;

    while (cursor < html.length && depth > 0) {
      const nextOpen = html.indexOf('<' + tag, cursor);
      const nextClose = html.indexOf(closeTag, cursor);
      if (nextClose === -1) break;

      const isNestedOpen = nextOpen !== -1 && nextOpen < nextClose &&
        html[nextOpen + tag.length + 1] !== '/';
      if (isNestedOpen) {
        depth++;
        cursor = nextOpen + 1;
        continue;
      }

      depth--;
      if (depth === 0) {
        const chunk = html.slice(pos, nextClose + closeTag.length);
        const node = createElement(tag);
        const attrs = tagMatch[2];
        const classMatch = /\bclass="([^"]*)"/.exec(attrs);
        const idMatch = /\bid="([^"]*)"/.exec(attrs);
        const openMatch = /\bopen\b/.test(attrs);
        if (classMatch) node.className = classMatch[1];
        if (idMatch) node.id = idMatch[1];
        if (openMatch) node.attributes.open = 'open';
        node._innerHTML = chunk.slice(tagMatch[0].length, chunk.length - closeTag.length);
        node.childNodes = parseSimpleHtml(node._innerHTML);
        node.childNodes.forEach(function (child) {
          child.parentNode = node;
          wireDom(child);
        });
        nodes.push(node);
        pos = nextClose + closeTag.length;
        break;
      }
      cursor = nextClose + closeTag.length;
    }

    if (depth > 0) break;
  }
  return nodes;
}

function queryAll(root, selector, includeRoot) {
  const selectors = splitSelectors(selector);
  if (selectors.length > 1) {
    const merged = [];
    for (let s = 0; s < selectors.length; s++) {
      queryAll(root, selectors[s], includeRoot).forEach(function (node) {
        if (merged.indexOf(node) === -1) merged.push(node);
      });
    }
    return merged;
  }

  selector = selectors[0];
  const results = [];
  if (includeRoot !== false && matchesSelector(root, selector)) results.push(root);
  for (let i = 0; i < root.childNodes.length; i++) {
    const child = root.childNodes[i];
    if (child.nodeType !== 1) continue;
    if (matchesSelector(child, selector)) results.push(child);
    results.push.apply(results, queryAll(child, selector, false));
  }
  return results;
}

function wireDom(root) {
  function bind(el) {
    el.querySelector = function (selector) { return queryOne(el, selector); };
    el.querySelectorAll = function (selector) { return queryAll(el, selector); };
    el.childNodes.forEach(function (child) {
      if (child.nodeType === 1) bind(child);
    });
  }
  bind(root);
  return root;
}

function buildHomepageDom() {
  const html = createElement('html');
  const head = createElement('head');
  const body = createElement('body');
  html.childNodes = [head, body];
  html.head = head;
  html.appendChild = function (child) {
    if (child.tagName === 'LINK' || child.tagName === 'SCRIPT') head.appendChild(child);
    else body.appendChild(child);
    return child;
  };

  const rootStyle = {
    setProperty: function (name, value) {
      this[name] = value;
    },
  };
  html.style = rootStyle;
  Object.defineProperty(html, 'documentElement', { get: function () { return html; } });

  const metaDescription = createElement('meta');
  metaDescription.setAttribute('name', 'description');
  head.appendChild(metaDescription);

  function section(id, className) {
    const sec = createElement('section');
    if (id) sec.id = id;
    if (className) sec.className = className;
    body.appendChild(sec);
    return sec;
  }

  function add(tag, className, parent) {
    const node = createElement(tag);
    if (className) node.className = className;
    (parent || body).appendChild(node);
    return node;
  }

  add('h1', 'hero-headline');
  add('p', 'hero-subheadline');
  add('div', 'hero-stats');

  const about = section('about', 'section about');
  add('h2', 'section-heading', about);
  add('p', 'section-body about-body', about);

  const services = section('services', 'section services');
  add('h2', 'section-heading services-heading', services);
  add('p', 'section-subheading services-subheading', services);
  add('div', 'services-grid', services);

  const testimonials = section('testimonials', 'section testimonials');
  testimonials.hidden = true;
  add('h2', 'section-heading testimonials-heading', testimonials);
  add('p', 'section-subheading testimonials-subheading', testimonials);
  add('div', 'testimonials-grid', testimonials);

  const rates = section('rates', 'section rates');
  add('h2', 'section-heading rates-heading', rates);
  add('p', 'section-subheading rates-subheading', rates);
  const table = add('table', 'rates-table', rates);
  const tbody = add('tbody', 'rates-body', table);
  add('p', 'rates-disclaimer', rates);

  const faq = section('faq', 'section faq');
  add('h2', 'section-heading faq-heading', faq);
  add('p', 'section-subheading faq-subheading', faq);
  add('div', 'faq-list', faq);

  const cta = section('contact', 'section cta');
  add('h2', 'section-heading cta-heading', cta);
  add('p', 'section-body cta-body', cta);
  const ctaBtn = add('a', 'btn btn-primary cta-button', cta);
  ctaBtn.appendChild(createTextNode(''));
  const ctaLabel = add('span', 'btn-label', ctaBtn);
  const heroBtn = add('a', 'btn btn-primary hero-book-button');
  heroBtn.appendChild(createTextNode(''));
  add('span', 'btn-label', heroBtn);

  const igLink = add('a', 'instagram-link');
  igLink.appendChild(createTextNode('@handle'));
  const igFooter = add('a', 'instagram-link-footer');
  igFooter.appendChild(createTextNode('@handle'));
  const footerIg = add('a', 'footer-instagram');

  const footerEmail = add('a', 'footer-email');
  footerEmail.appendChild(createTextNode('email@example.com'));

  const footerBrand = add('div', 'footer-brand');
  add('span', '', footerBrand);
  add('p', 'footer-tagline');

  add('div', 'toast').hidden = true;

  wireDom(html);

  const document = {
    documentElement: html,
    head: head,
    body: body,
    title: '',
    querySelector: function (selector) {
      return queryOne(head, selector) || queryOne(body, selector) || queryOne(html, selector);
    },
    querySelectorAll: function (selector) {
      const headMatches = queryAll(head, selector);
      if (headMatches.length) return headMatches;
      const bodyMatches = queryAll(body, selector);
      return bodyMatches.length ? bodyMatches : queryAll(html, selector);
    },
    getElementById: function (id) { return queryOne(body, '#' + id) || queryOne(html, '#' + id); },
    createElement: createElement,
    addEventListener: function () {},
  };

  Object.defineProperty(document, 'title', {
    get: function () { return document._title || ''; },
    set: function (value) { document._title = value; },
  });

  return document;
}

function createHomepageApi() {
  const document = buildHomepageDom();
  const sandbox = {
    document: document,
    window: {},
    Node: { TEXT_NODE: 3 },
    FormData: function () {
      const data = new Map();
      this.get = function (key) { return data.get(key) || null; };
      this.set = function (key, value) { data.set(key, value); };
    },
    setTimeout: function (fn) { fn(); return 0; },
    clearTimeout: function () {},
    requestAnimationFrame: function (fn) { fn(); },
    fetch: function () { return Promise.reject(new Error('fetch disabled in tests')); },
    gtag: function () {},
    __MAIN_TEST_API__: null,
  };
  sandbox.window = sandbox;

  const source = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const injected = source.replace(
    /\ninit\(\);\s*$/,
    '\n__MAIN_TEST_API__ = {\n' +
    '  escapeHtml: escapeHtml,\n' +
    '  multilineHtml: multilineHtml,\n' +
    '  linkifyContact: linkifyContact,\n' +
    '  buildMailto: buildMailto,\n' +
    '  applySite: applySite,\n' +
    '  applyServices: applyServices,\n' +
    '  applyFaq: applyFaq,\n' +
    '  applyStats: applyStats,\n' +
    '  applyTestimonials: applyTestimonials,\n' +
    '  applyRates: applyRates,\n' +
    '  setContactInfo: function (info) { contactInfo = info; },\n' +
    '  getContactInfo: function () { return contactInfo; },\n' +
    '};\n'
  );

  vm.runInNewContext(injected, sandbox);
  return { api: sandbox.__MAIN_TEST_API__, document: document };
}

module.exports = { createHomepageApi, buildHomepageDom };
