const ICONS = {
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/>',
  handshake: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
};

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

const GOOGLE_FONTS = new Set([
  'DM Sans', 'Inter', 'Lato', 'Open Sans', 'Roboto', 'Source Sans 3',
  'Nunito', 'Poppins', 'Work Sans', 'Playfair Display', 'Merriweather',
  'Lora', 'Libre Baskerville', 'Cormorant Garamond', 'DM Serif Display',
  'Fraunces', 'Bitter',
]);

const FONT_FALLBACKS = {
  'Avenir Medium': '"Avenir Next Medium", Avenir, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  'KN Yuanmo SC': 'sans-serif',
};

function applyStyleguide(styleguide) {
  const root = document.documentElement;
  const { fontFamily, headingFont, colors } = styleguide;

  root.style.setProperty('--color-primary', colors.primary);
  root.style.setProperty('--color-secondary', colors.secondary);
  root.style.setProperty('--color-accent', colors.accent);
  root.style.setProperty('--color-background', colors.background);
  root.style.setProperty('--color-surface', colors.surface);
  root.style.setProperty('--color-text', colors.text);
  root.style.setProperty('--color-text-muted', colors.textMuted);

  const bodyFallback = FONT_FALLBACKS[fontFamily] || 'system-ui, sans-serif';
  const headingFallback = FONT_FALLBACKS[headingFont] || 'sans-serif';
  root.style.setProperty('--font-body', `"${fontFamily}", ${bodyFallback}`);
  root.style.setProperty('--font-heading', `"${headingFont}", ${headingFallback}`);

  const googleFonts = [fontFamily, headingFont].filter((f) => GOOGLE_FONTS.has(f));
  let fontsLink = document.getElementById('google-fonts');
  if (googleFonts.length) {
    if (!fontsLink) {
      fontsLink = document.createElement('link');
      fontsLink.id = 'google-fonts';
      fontsLink.rel = 'stylesheet';
      document.head.appendChild(fontsLink);
    }
    const families = googleFonts
      .map((f) => f.replace(/ /g, '+') + ':wght@400;500;600;700')
      .join('&family=');
    fontsLink.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
  } else if (fontsLink) {
    fontsLink.remove();
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function linkifyContact(text, email, igHandle, igUrl) {
  let html = escapeHtml(text);
  if (email) {
    const escapedEmail = escapeHtml(email);
    html = html.replaceAll(
      escapedEmail,
      `<a href="mailto:${escapedEmail}">${escapedEmail}</a>`
    );
  }
  if (igHandle && igUrl) {
    const escapedHandle = escapeHtml(igHandle);
    const escapedUrl = escapeHtml(igUrl);
    html = html.replaceAll(
      escapedHandle,
      `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer">${escapedHandle}</a>`
    );
  }
  return html;
}

let contactInfo = { email: '', igHandle: '', igUrl: '' };

function applySite(site) {
  document.title = site.title;
  document.querySelector('meta[name="description"]').content = site.description;

  document.querySelector('.hero-headline').textContent = site.tagline;
  document.querySelector('.hero-subheadline').textContent = site.hero.subheadline;
  document.querySelector('#about .section-heading').textContent = site.about.heading;
  document.querySelector('.about-body').textContent = site.about.body;

  document.querySelector('.cta-heading').textContent = site.cta.heading;
  document.querySelector('.cta-body').textContent = site.cta.body;

  const mailto = `mailto:${site.contact_email}`;
  document.querySelectorAll('.cta-button, .hero-book-button').forEach((btn) => {
    btn.href = mailto;
    const label = btn.querySelector('.btn-label');
    if (label) {
      label.textContent = site.cta.button_label;
    }
  });

  const igUrl = site.instagram.url;
  const igHandle = site.instagram.handle;

  contactInfo = { email: site.contact_email, igHandle, igUrl };

  document.querySelectorAll('.instagram-link, .instagram-link-footer, .footer-instagram').forEach((el) => {
    el.href = igUrl;
    const textNode = el.childNodes[el.childNodes.length - 1];
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      textNode.textContent = igHandle;
    } else if (el.classList.contains('footer-instagram')) {
      el.textContent = igHandle;
    }
  });

  const footerEmail = document.querySelector('.footer-email');
  if (footerEmail) {
    footerEmail.href = mailto;
    const emailTextNode = footerEmail.childNodes[footerEmail.childNodes.length - 1];
    if (emailTextNode && emailTextNode.nodeType === Node.TEXT_NODE) {
      emailTextNode.textContent = site.contact_email;
    }
  }

  document.querySelector('.footer-brand span').textContent = site.title;
  document.querySelector('.footer-tagline').textContent = site.tagline;
}

function applyServices(servicesData) {
  document.querySelector('.services-heading').textContent = servicesData.heading;
  document.querySelector('.services-subheading').textContent = servicesData.subheading;

  const grid = document.querySelector('.services-grid');
  grid.innerHTML = servicesData.services.map((service) => {
    const iconPath = ICONS[service.icon] || ICONS.calendar;
    return `
      <article class="service-card" id="${service.id}">
        <div class="service-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">${iconPath}</svg>
        </div>
        <h3 class="service-title">${service.title}</h3>
        <p class="service-description">${service.description}</p>
      </article>
    `;
  }).join('');
}

function applyFaq(faqData) {
  if (!faqData || !Array.isArray(faqData.faqs) || faqData.faqs.length === 0) {
    const faqSection = document.getElementById('faq');
    if (faqSection) faqSection.hidden = true;
    return;
  }

  const headingEl = document.querySelector('.faq-heading');
  const subheadingEl = document.querySelector('.faq-subheading');
  if (headingEl && faqData.heading) headingEl.textContent = faqData.heading;
  if (subheadingEl && faqData.subheading) subheadingEl.textContent = faqData.subheading;

  const list = document.querySelector('.faq-list');
  list.innerHTML = faqData.faqs.map((item, idx) => {
    const answerHtml = linkifyContact(
      item.answer,
      contactInfo.email,
      contactInfo.igHandle,
      contactInfo.igUrl
    ).replace(/\n+/g, '<br>');
    return `
      <details class="faq-item" role="listitem"${idx === 0 ? ' open' : ''}>
        <summary class="faq-question">
          <span>${escapeHtml(item.question)}</span>
          <svg class="faq-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </summary>
        <div class="faq-answer">${answerHtml}</div>
      </details>
    `;
  }).join('');

  const ldId = 'faq-jsonld';
  document.getElementById(ldId)?.remove();
  const ldScript = document.createElement('script');
  ldScript.type = 'application/ld+json';
  ldScript.id = ldId;
  ldScript.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqData.faqs.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  });
  document.head.appendChild(ldScript);
}

function applyRates(ratesData) {
  document.querySelector('.rates-heading').textContent = ratesData.heading;
  document.querySelector('.rates-subheading').textContent = ratesData.subheading;
  document.querySelector('.rates-disclaimer').innerHTML = linkifyContact(
    ratesData.disclaimer,
    contactInfo.email,
    contactInfo.igHandle,
    contactInfo.igUrl
  );

  const tbody = document.querySelector('.rates-body');
  tbody.innerHTML = ratesData.rates.map((rate) => `
    <tr>
      <td>${escapeHtml(rate.service)}</td>
      <td>${escapeHtml(rate.duration)}</td>
      <td>${escapeHtml(rate.price)}</td>
      <td>${linkifyContact(rate.notes, contactInfo.email, contactInfo.igHandle, contactInfo.igUrl)}</td>
    </tr>
  `).join('');
}

async function init() {
  document.getElementById('year').textContent = new Date().getFullYear();

  try {
    const [site, styleguide, services, rates, faq] = await Promise.all([
      loadJSON('data/site.json'),
      loadJSON('data/styleguide.json'),
      loadJSON('data/services.json'),
      loadJSON('data/rates.json'),
      loadJSON('data/faq.json').catch(() => null),
    ]);

    applyStyleguide(styleguide);
    applySite(site);
    applyServices(services);
    applyRates(rates);
    if (faq) applyFaq(faq);
  } catch (err) {
    console.warn('Could not load CMS data, using static defaults:', err);
  }
}

init();
