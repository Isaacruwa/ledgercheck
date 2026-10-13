// Markdown content negotiation for eobcheck.online.
// Runs ONLY when a request sends "Accept: text/markdown" (see matcher below).
// It fetches the normal HTML page and returns a clean Markdown version of it.
// Browsers and every other client keep getting the HTML page untouched.

export const config = {
  matcher: [
    {
      source: '/((?!api/|_vercel/)[^.]*)',
      has: [{ type: 'header', key: 'accept', value: '.*text/markdown.*' }],
    },
  ],
};

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '\u2014', ndash: '\u2013', hellip: '\u2026', rsquo: '\u2019',
  lsquo: '\u2018', ldquo: '\u201C', rdquo: '\u201D', copy: '\u00A9',
  rarr: '\u2192', larr: '\u2190', bull: '\u2022', middot: '\u00B7',
  times: '\u00D7', check: '\u2713',
};

function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENTITIES ? ENTITIES[n.toLowerCase()] : m));
}

function attr(tag, name) {
  const m = tag.match(new RegExp('\\b' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i'));
  return m ? decode(m[2] !== undefined ? m[2] : m[3]) : '';
}

function absolute(href, base) {
  try { return new URL(href, base).toString(); } catch (e) { return href; }
}

function htmlToMarkdown(html, pageUrl) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decode(titleMatch[1]).replace(/\s+/g, ' ').trim() : '';
  const descTag = html.match(/<meta[^>]+name\s*=\s*["']description["'][^>]*>/i);
  const description = descTag ? attr(descTag[0], 'content').trim() : '';

  // Main content only: <main>, else <article>, else <body>.
  const pick = html.match(/<main\b[\s\S]*?<\/main>/i)
    || html.match(/<article\b[\s\S]*?<\/article>/i)
    || html.match(/<body\b[\s\S]*<\/body>/i);
  let s = pick ? pick[0] : html;

  // Drop non-content elements.
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<(script|style|noscript|template|svg|iframe|canvas|nav|header|footer|aside|form|select|textarea|button|dialog)\b[\s\S]*?<\/\1\s*>/gi, '');
  s = s.replace(/<(input|link|meta|source|img[^>]*aria-hidden[^>]*)\b[^>]*>/gi, '');

  // Code blocks: stash so whitespace is preserved.
  const stash = [];
  s = s.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner) => {
    const code = decode(inner.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/\n+$/, '');
    stash.push('\n\n```\n' + code + '\n```\n\n');
    return '\u0000' + (stash.length - 1) + '\u0000';
  });

  // Collapse HTML whitespace.
  s = s.replace(/\s+/g, ' ');

  // Images (keep alt text only).
  s = s.replace(/<img\b[^>]*>/gi, (tag) => {
    const alt = attr(tag, 'alt').trim();
    return alt ? ' ' + alt + ' ' : '';
  });

  // Inline formatting.
  s = s.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_, __, t) => (t.trim() ? '**' + t.trim() + '**' : ''));
  s = s.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_, __, t) => (t.trim() ? '*' + t.trim() + '*' : ''));
  s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code\s*>/gi, (_, t) => (t.trim() ? '`' + t.replace(/<[^>]+>/g, '').trim() + '`' : ''));

  // Links.
  s = s.replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, (_, attrs, inner) => {
    const text = inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const href = attr('<a ' + attrs + '>', 'href').trim();
    if (!text) return '';
    if (!href || href.startsWith('#') || /^(javascript|mailto|tel):/i.test(href)) {
      return /^(mailto|tel):/i.test(href) ? text : text;
    }
    return '[' + text + '](' + absolute(href, pageUrl) + ')';
  });

  // Headings.
  s = s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_, n, t) => {
    const text = t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    return text ? '\n\n' + '#'.repeat(Number(n)) + ' ' + text + '\n\n' : '';
  });

  // Tables.
  s = s.replace(/<table\b[\s\S]*?<\/table\s*>/gi, (table) => {
    const rows = [...table.matchAll(/<tr\b[\s\S]*?<\/tr\s*>/gi)].map((r) =>
      [...r[0].matchAll(/<(t[hd])\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)].map((c) =>
        c[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()));
    const filled = rows.filter((r) => r.length);
    if (!filled.length) return '';
    const width = Math.max(...filled.map((r) => r.length));
    const line = (r) => '| ' + Array.from({ length: width }, (_, i) => r[i] || '').join(' | ') + ' |';
    const out = [line(filled[0]), '| ' + Array.from({ length: width }, () => '---').join(' | ') + ' |'];
    filled.slice(1).forEach((r) => out.push(line(r)));
    return '\n\n' + out.join('\n') + '\n\n';
  });

  // Lists.
  s = s.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol\s*>/gi, (_, inner) => {
    let i = 0;
    return '\n\n' + inner.replace(/<li\b[^>]*>/gi, () => '\n' + (++i) + '. ') + '\n\n';
  });
  s = s.replace(/<li\b[^>]*>/gi, '\n- ');
  s = s.replace(/<\/li\s*>/gi, '');
  s = s.replace(/<\/?(ul|ol)\b[^>]*>/gi, '\n\n');

  // Blockquotes, breaks, rules, paragraphs and other block containers.
  s = s.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote\s*>/gi, (_, t) =>
    '\n\n> ' + t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() + '\n\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<hr\b[^>]*>/gi, '\n\n---\n\n');
  s = s.replace(/<\/?(p|div|section|article|main|details|summary|figure|figcaption|dl|dt|dd|tr|address)\b[^>]*>/gi, '\n\n');

  // Remove any remaining tags, decode entities, tidy whitespace.
  s = s.replace(/<[^>]+>/g, '');
  s = decode(s);
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)]);
  s = s
    .split('\n')
    .map((l) => (l.startsWith('    ') || l.startsWith('```') ? l : l.replace(/[ \t]+/g, ' ').trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const hasH1 = /^#\s/m.test(s);
  let md = '';
  if (!hasH1 && title) md += '# ' + title + '\n\n';
  if (description) md += '> ' + description + '\n\n';
  md += s + '\n\n---\nSource: ' + pageUrl + '\nSite summary for AI agents: ' + new URL('/llms.txt', pageUrl).toString() + '\n';
  return md;
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const method = request.method;

  // Only GET/HEAD can be negotiated; anything else passes through to the page.
  const upstream = await fetch(url.toString(), {
    method: 'GET',
    headers: { accept: 'text/html', 'user-agent': request.headers.get('user-agent') || 'markdown-negotiation' },
    redirect: 'manual',
  });

  const type = upstream.headers.get('content-type') || '';
  if ((method !== 'GET' && method !== 'HEAD') || upstream.status !== 200 || !type.includes('text/html')) {
    return upstream;
  }

  const html = await upstream.text();
  const markdown = htmlToMarkdown(html, url.origin + url.pathname);
  const tokens = Math.ceil(markdown.length / 4);

  return new Response(method === 'HEAD' ? null : markdown, {
    status: 200,
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'x-markdown-tokens': String(tokens),
      vary: 'Accept',
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  });
}
