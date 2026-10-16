// يولّد صفحات HTML ثابتة قابلة للفهرسة لكل مقال وقسم + sitemap.xml + 404.html
// يُشغَّل تلقائيًا أثناء النشر على Netlify (انظر netlify.toml). الاستخدام: node scripts/prerender.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.resolve(process.argv[2] || ROOT);
const SITE_URL = 'https://techora-tech.netlify.app';
const template = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- استخراج البيانات والدوال المساعدة من index.html (مصدر واحد للحقيقة)
const slice = (from, to) => {
  const a = template.indexOf(from), b = template.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`prerender: marker not found: ${from}`);
  return template.slice(a, b);
};
const code = `const SITE_URL=${JSON.stringify(SITE_URL)};`
  + slice('const postUrl=', 'const Store=')
  + slice('const BASE_CATS=[', 'const TOOLS=[')
  + ';({BASE_CATS,AUTHORS,ARTICLES,postUrl,catUrl,pic,ogPic})';
const { BASE_CATS, AUTHORS, ARTICLES, postUrl, catUrl, pic, ogPic } = vm.runInNewContext(code);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slugify = s => String(s).trim().replace(/\s+/g, '-').replace(/[^\u0600-\u06FFa-zA-Z0-9-]/g, '').toLowerCase();
const posts = ARTICLES.filter(p => p.status !== 'draft').sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
const catOf = slug => BASE_CATS.find(c => c.slug === slug) || { slug, ar: slug, en: slug };
const CAT_DESC = {
  news: 'آخر أخبار التقنية والشركات والإطلاقات الجديدة بالعربية.',
  ai: 'أدوات الذكاء الاصطناعي وشروحاته ومستقبله بلغة واضحة.',
  devices: 'الهواتف والحواسيب والساعات والأجهزة الذكية: دلائل شراء ومقارنات.',
  apps: 'أفضل التطبيقات وطرق الاستفادة منها على الهاتف والحاسوب.',
  cybersecurity: 'نصائح عملية لحماية حساباتك وأجهزتك وبياناتك.',
  tutorials: 'شروحات تقنية خطوة بخطوة للمبتدئين والمحترفين.',
  reviews: 'مراجعات الأجهزة والخدمات مع الإيجابيات والسلبيات والحكم النهائي.',
  comparisons: 'مقارنات تقنية مباشرة تساعدك على اختيار الأنسب.',
  tools: 'أدوات وخدمات تقنية مختارة للتطوير والتصميم والإنتاجية والأمان.'
};

const orgLD = { '@context': 'https://schema.org', '@type': 'Organization', name: 'TECHORA', alternateName: 'تيكورا', url: SITE_URL + '/', logo: SITE_URL + '/assets/logo-512.png' };
const breadLD = items => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, u], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE_URL + u })) });
const articleLD = p => ({
  '@context': 'https://schema.org', '@type': 'NewsArticle', headline: p.title, description: p.excerpt,
  image: [ogPic(p.image)], datePublished: p.publishedAt, dateModified: p.updatedAt || p.publishedAt, inLanguage: 'ar',
  mainEntityOfPage: SITE_URL + postUrl(p), author: { '@type': 'Person', name: p.author },
  publisher: { '@type': 'Organization', name: 'TECHORA', logo: { '@type': 'ImageObject', url: SITE_URL + '/assets/logo-512.png' } },
  keywords: (p.tags || []).join(', ')
});

// --- بناء صفحة من القالب مع استبدال وسوم الرأس والمحتوى
function page({ title, desc, canon, image, type = 'website', robots = 'index,follow,max-image-preview:large', ld = [], preload, body = '' }) {
  let h = template;
  const set = (re, val) => { if (!re.test(h)) throw new Error('prerender: tag not found ' + re); h = h.replace(re, val); };
  const url = SITE_URL + canon;
  set(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  set(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`);
  set(/<meta name="robots" content="[^"]*">/, `<meta name="robots" content="${robots}">`);
  set(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
  set(/<link rel="alternate" hreflang="ar" href="[^"]*">/, `<link rel="alternate" hreflang="ar" href="${url}">`);
  set(/<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${type}">`);
  set(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`);
  set(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`);
  set(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  set(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${image}">`);
  set(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(title)}">`);
  set(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(desc)}">`);
  set(/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${image}">`);
  if (preload) set(/<link rel="preload" as="image" href="[^"]*"/, `<link rel="preload" as="image" href="${preload}"`);
  if (ld.length) h = h.replace('</head>', `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n</head>`);
  return h.replace(/<main id="app">[\s\S]*?<\/main>/, `<main id="app">${body}</main>`);
}

const figure = (seed, alt, eager) => `<img src="${pic(seed, 1200)}" width="1200" height="750" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
const block = b => {
  switch (b.t) {
    case 'p': return `<p>${b.v}</p>`;
    case 'h2': return `<h2 id="${slugify(b.v)}">${b.v}</h2>`;
    case 'ul': return `<ul>${b.v.map(li => `<li>${li}</li>`).join('')}</ul>`;
    case 'quote': return `<blockquote><p>${b.v}</p></blockquote>`;
    case 'img': return `<figure>${figure(b.seed, b.cap || 'صورة توضيحية')}<figcaption>${esc(b.cap || '')}</figcaption></figure>`;
    case 'table': return `<table><thead><tr>${b.head.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    default: return '';
  }
};
const linkList = list => `<ul>${list.map(p => `<li><a href="${postUrl(p)}">${esc(p.title)}</a></li>`).join('')}</ul>`;
const write = (rel, html) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); };

// --- صفحات المقالات
for (const p of posts) {
  const c = catOf(p.cat);
  const related = posts.filter(x => x.id !== p.id && (x.cat === p.cat || x.tags.some(tg => p.tags.includes(tg)))).slice(0, 4);
  const body = `<article class="container">
<nav aria-label="مسار التنقل"><a href="/">الرئيسية</a> ‹ <a href="${catUrl(p.cat)}">${esc(c.ar)}</a> ‹ <span>${esc(p.title)}</span></nav>
<h1>${esc(p.title)}</h1><p>${esc(p.excerpt)}</p>
<p>بقلم ${esc(p.author)} · <time datetime="${p.publishedAt}">${p.publishedAt}</time> · ${p.readingTime} دقائق قراءة</p>
<figure>${figure(p.image, p.title, true)}</figure>
${p.content.map(block).join('\n')}
${related.length ? `<h2>مقالات ذات صلة</h2>${linkList(related)}` : ''}
</article>`;
  write(postUrl(p).slice(1) + 'index.html', page({
    title: `${p.title} | تيكورا TECHORA`, desc: p.excerpt, canon: postUrl(p), image: ogPic(p.image), type: 'article',
    preload: pic(p.image, 1200), body,
    ld: [orgLD, articleLD(p), breadLD([['الرئيسية', '/'], [c.ar, catUrl(p.cat)], [p.title, postUrl(p)]])]
  }).replace('<meta property="og:type" content="article">', `<meta property="og:type" content="article">\n<meta property="article:published_time" content="${p.publishedAt}">\n<meta property="article:section" content="${esc(c.ar)}">`));
}

// --- صفحات الأقسام
for (const c of BASE_CATS) {
  const list = posts.filter(p => p.cat === c.slug);
  const desc = CAT_DESC[c.slug] || `أحدث مقالات ${c.ar} على تيكورا.`;
  const body = `<section class="container"><h1>${esc(c.ar)}</h1><p>${esc(desc)}</p>${linkList(list)}</section>`;
  write(catUrl(c.slug).slice(1) + 'index.html', page({
    title: `${c.ar} | تيكورا TECHORA`, desc: `${desc} تصفّح ${list.length} مقالًا في قسم ${c.ar}.`, canon: catUrl(c.slug),
    image: ogPic(list[0]?.image || c.slug), preload: list[0] ? pic(list[0].image, 800) : null, body,
    ld: [orgLD, breadLD([['الرئيسية', '/'], [c.ar, catUrl(c.slug)]]),
      { '@context': 'https://schema.org', '@type': 'CollectionPage', name: c.ar, url: SITE_URL + catUrl(c.slug),
        mainEntity: { '@type': 'ItemList', itemListElement: list.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE_URL + postUrl(p) })) } }]
  }));
}

// --- الرئيسية: روابط ثابتة لكل الأقسام والمقالات لتسهيل الزحف
const homeBody = `<section class="container"><h1>تيكورا TECHORA — عالمك من التقنية</h1>
<p>أخبار التقنية والذكاء الاصطناعي ومراجعات الأجهزة والشروحات والمقارنات بالعربية.</p>
<ul>${BASE_CATS.map(c => `<li><a href="${catUrl(c.slug)}">${esc(c.ar)}</a></li>`).join('')}</ul>${linkList(posts)}</section>`;
write('index.html', template.replace(/<main id="app">[\s\S]*?<\/main>/, `<main id="app">${homeBody}</main>`)
  .replace('</head>', `<script type="application/ld+json">${JSON.stringify([orgLD, { '@context': 'https://schema.org', '@type': 'WebSite', name: 'TECHORA', alternateName: 'تيكورا', url: SITE_URL + '/', inLanguage: 'ar' }])}</script>\n</head>`));

// --- 404 (يعرض واجهة الموقع مع رسالة الصفحة غير موجودة عبر الراوتر)
write('404.html', page({ title: '404 — الصفحة غير موجودة | تيكورا', desc: 'الصفحة التي تبحث عنها غير موجودة في تيكورا.', canon: '/', image: ogPic('techora-cover'), robots: 'noindex,follow' }));

// --- sitemap.xml مع الصور
const today = new Date().toISOString().slice(0, 10);
const latest = list => list.reduce((m, p) => (p.publishedAt > m ? p.publishedAt : m), '2026-01-01');
const urls = [
  { loc: '/', lastmod: latest(posts), pri: '1.0' },
  ...BASE_CATS.map(c => ({ loc: catUrl(c.slug), lastmod: latest(posts.filter(p => p.cat === c.slug)), pri: '0.8' })),
  ...posts.map(p => ({ loc: postUrl(p), lastmod: p.updatedAt || p.publishedAt, pri: '0.7', img: ogPic(p.image), title: p.title })),
  ...['/about/', '/contact/', '/privacy/', '/terms/'].map(loc => ({ loc, lastmod: '2026-08-18', pri: '0.3' }))
];
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map(u => `  <url><loc>${SITE_URL}${u.loc}</loc><lastmod>${u.lastmod > today ? today : u.lastmod}</lastmod><priority>${u.pri}</priority>${u.img ? `<image:image><image:loc>${u.img}</image:loc><image:title>${esc(u.title)}</image:title></image:image>` : ''}</url>`).join('\n')}
</urlset>
`);
console.log(`prerender: ${posts.length} articles, ${BASE_CATS.length} categories → ${OUT}`);
