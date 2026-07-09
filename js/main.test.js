'use strict';

const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');
const { createHomepageApi } = require('./main.harness.js');

const SAMPLE_SITE = {
  title: 'Test Mahjong Club',
  tagline: 'Mahjong in Test City',
  description: 'A test site description.',
  contact_email: 'hello@test.example',
  instagram: {
    handle: 'test.mahjong',
    url: 'https://www.instagram.com/test.mahjong/',
  },
  hero: {
    headline: 'Hero headline',
    subheadline: 'Hero subheadline text.',
  },
  about: {
    heading: 'About us',
    body: 'First paragraph.\n\nSecond paragraph.',
  },
  cta: {
    heading: 'Get in touch',
    body: 'CTA body copy.',
    button_label: 'Email us',
  },
};

describe('Homepage utilities', function () {
  /** @type {ReturnType<typeof createHomepageApi>['api']} */
  let api;

  beforeEach(function () {
    api = createHomepageApi().api;
  });

  describe('escapeHtml', function () {
    it('escapes HTML special characters', function () {
      assert.equal(
        api.escapeHtml('<script>"\'&</script>'),
        '&lt;script&gt;&quot;&#39;&amp;&lt;/script&gt;'
      );
    });
  });

  describe('multilineHtml', function () {
    it('turns blank lines into paragraph breaks', function () {
      assert.equal(api.multilineHtml('Line one.\n\nLine two.'), 'Line one.<br><br>Line two.');
    });

    it('turns single newlines into line breaks', function () {
      assert.equal(api.multilineHtml('Line one.\nLine two.'), 'Line one.<br>Line two.');
    });
  });

  describe('linkifyContact', function () {
    it('wraps email and Instagram handle in links', function () {
      const html = api.linkifyContact(
        'Email hello@test.example or DM @test.mahjong',
        'hello@test.example',
        '@test.mahjong',
        'https://www.instagram.com/test.mahjong/'
      );

      assert.match(html, /<a href="mailto:hello@test\.example">/);
      assert.match(html, /<a href="https:\/\/www\.instagram\.com\/test\.mahjong\/" target="_blank"/);
    });
  });

  describe('buildMailto', function () {
    it('builds a mailto link with encoded subject and body', function () {
      api.setContactInfo({ email: 'hello@test.example' });
      const link = api.buildMailto('Booking inquiry', 'Hello there');

      assert.equal(link, 'mailto:hello@test.example?subject=Booking%20inquiry&body=Hello%20there');
    });

    it('falls back to the default events address', function () {
      api.setContactInfo({ email: '' });
      assert.equal(api.buildMailto(), 'mailto:events@luckycatmahjong.com');
    });
  });
});

describe('Homepage CMS rendering', function () {
  /** @type {ReturnType<typeof createHomepageApi>} */
  let ctx;

  beforeEach(function () {
    ctx = createHomepageApi();
  });

  describe('applySite', function () {
    it('fills hero, about, CTA, and contact links from site.json-shaped data', function () {
      ctx.api.applySite(SAMPLE_SITE);

      assert.equal(ctx.document.title, 'Test Mahjong Club | Mahjong in Test City');
      assert.equal(ctx.document.querySelector('meta[name="description"]').content, SAMPLE_SITE.description);
      assert.equal(ctx.document.querySelector('.hero-headline').textContent, SAMPLE_SITE.tagline);
      assert.equal(ctx.document.querySelector('.hero-subheadline').textContent, SAMPLE_SITE.hero.subheadline);
      assert.equal(ctx.document.querySelector('#about .section-heading').textContent, SAMPLE_SITE.about.heading);
      assert.equal(ctx.document.querySelector('.about-body').innerHTML, 'First paragraph.<br><br>Second paragraph.');
      assert.equal(ctx.document.querySelector('.cta-heading').textContent, SAMPLE_SITE.cta.heading);
      assert.equal(ctx.document.querySelector('.cta-button').href, 'mailto:' + SAMPLE_SITE.contact_email);
      assert.equal(ctx.document.querySelector('.cta-button .btn-label').textContent, SAMPLE_SITE.cta.button_label);
      assert.equal(ctx.document.querySelector('.instagram-link').href, SAMPLE_SITE.instagram.url);
      assert.equal(ctx.document.querySelector('.footer-tagline').textContent, SAMPLE_SITE.tagline);
    });
  });

  describe('applyServices', function () {
    it('renders one card per service', function () {
      ctx.api.applyServices({
        heading: 'Services',
        subheading: 'What we offer',
        services: [
          { id: 'lessons', title: 'Private Lessons', description: 'One-on-one instruction.' },
          { id: 'workshops', title: 'Workshops', description: 'Group sessions.' },
        ],
      });

      const cards = ctx.document.querySelectorAll('.service-card');
      assert.equal(cards.length, 2);
      assert.equal(cards[0].id, 'lessons');
      assert.match(cards[0].innerHTML, /Private Lessons/);
      assert.match(cards[1].innerHTML, /Workshops/);
    });
  });

  describe('applyStats', function () {
    it('renders hero stats when provided', function () {
      ctx.api.applyStats([
        { value: '100+', label: 'Players taught' },
        { value: '5', label: 'Boroughs' },
      ]);

      const stats = ctx.document.querySelectorAll('.hero-stat');
      assert.equal(stats.length, 2);
      assert.equal(ctx.document.querySelector('.hero-stats').hidden, false);
    });

    it('hides the stats band when empty', function () {
      ctx.api.applyStats([]);
      assert.equal(ctx.document.querySelector('.hero-stats').hidden, true);
    });
  });

  describe('applyTestimonials', function () {
    it('hides the section when there are no testimonials', function () {
      ctx.api.applyTestimonials(null);
      assert.equal(ctx.document.getElementById('testimonials').hidden, true);
    });

    it('renders testimonial cards when data is present', function () {
      ctx.api.applyTestimonials({
        heading: 'Reviews',
        subheading: 'Kind words',
        testimonials: [
          { quote: 'So much fun!', author: 'Alex', role: 'Workshop guest' },
        ],
      });

      const section = ctx.document.getElementById('testimonials');
      assert.equal(section.hidden, false);
      assert.match(section.querySelector('.testimonials-grid').innerHTML, /So much fun!/);
      assert.match(section.querySelector('.testimonials-grid').innerHTML, /Alex/);
    });
  });

  describe('applyRates', function () {
    it('renders pricing rows and linkifies contact info in notes', function () {
      ctx.api.applySite(SAMPLE_SITE);
      ctx.api.applyRates({
        heading: 'Rates',
        subheading: 'Pricing',
        disclaimer: 'Contact hello@test.example for custom quotes.',
        rates: [
          { service: 'Lessons', duration: '2 hr', price: '$75', notes: 'Per person' },
        ],
      });

      const row = ctx.document.querySelector('.rates-body tr');
      assert.match(row.innerHTML, /Lessons/);
      assert.match(row.innerHTML, /\$75/);
      assert.match(ctx.document.querySelector('.rates-disclaimer').innerHTML, /mailto:hello@test\.example/);
    });
  });

  describe('applyFaq', function () {
    it('hides the FAQ section when there are no entries', function () {
      ctx.api.applyFaq({ heading: 'FAQ', subheading: 'Questions', faqs: [] });
      assert.equal(ctx.document.getElementById('faq').hidden, true);
    });

    it('renders expandable FAQ items and FAQPage JSON-LD', function () {
      ctx.api.applySite(SAMPLE_SITE);
      ctx.api.applyFaq({
        heading: 'FAQ',
        subheading: 'Common questions',
        faqs: [
          { question: 'Do I need experience?', answer: 'No prior experience needed.' },
          { question: 'Where do you teach?', answer: 'Across NYC.' },
        ],
      });

      const items = ctx.document.querySelectorAll('.faq-item');
      assert.equal(items.length, 2);
      assert.equal(items[0].attributes.open, 'open');
      assert.match(items[0].innerHTML, /Do I need experience\?/);

      const ld = ctx.document.getElementById('faq-jsonld');
      assert.ok(ld);
      const schema = JSON.parse(ld.textContent);
      assert.equal(schema['@type'], 'FAQPage');
      assert.equal(schema.mainEntity.length, 2);
    });
  });

});
