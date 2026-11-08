// Helpers for success stories: HTML sanitising, YouTube ID parsing and slug building.
const sanitizeHtml = require('sanitize-html');

// Allowlist for article HTML. Only what the admin editor can produce.
const SANITIZE_OPTIONS = {
  allowedTags: [
    'h1', 'h2', 'h3', 'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'hr',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt'],
    h1: ['style'], h2: ['style'], h3: ['style'], p: ['style'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowedStyles: {
    '*': { 'text-align': [/^(left|right|center|justify)$/] },
  },
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' },
    }),
  },
};

const sanitizeStoryHtml = (html) => sanitizeHtml(html || '', SANITIZE_OPTIONS);

// Plain text of the article, used to decide whether an article actually has content.
const htmlToText = (html) =>
  sanitizeHtml(html || '', { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();

// Accepts watch?v=, youtu.be/, /shorts/, /embed/ and /live/ links. Returns the 11-char ID or null.
const parseYoutubeId = (input) => {
  if (!input || typeof input !== 'string') return null;
  const value = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?]+)/);
      id = m ? m[1] : null;
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
};

// Plain-text teaser of an article for list pages: block boundaries become spaces (so headings don't
// run into the next paragraph), entities are decoded, and the cut falls on a word boundary.
const makeExcerpt = (html, max = 240) => {
  const spaced = (html || '').replace(/<\/(p|h[1-3]|li|blockquote)>|<br\s*\/?>/gi, ' $&');
  const text = htmlToText(spaced)
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max * 0.6))}…`;
};

const slugify = (title) =>
  String(title || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

module.exports = { sanitizeStoryHtml, htmlToText, makeExcerpt, parseYoutubeId, slugify };
