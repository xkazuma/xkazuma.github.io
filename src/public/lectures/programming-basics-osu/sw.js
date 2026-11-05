// lecture-vault Service Worker
// scope 配下へのリクエストを横取りし、_v/ の暗号文を取得・復号して返す。
// 鍵はログイン画面が IndexedDB に保存した non-extractable な CryptoKey を使う。
const BASE = new URL(self.registration.scope).pathname;
const enc = new TextEncoder();

const TYPES = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', map: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8', xml: 'application/xml', webmanifest: 'application/manifest+json',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav',
  pdf: 'application/pdf', wasm: 'application/wasm', zip: 'application/zip',
};
const typeOf = (p) => TYPES[p.split('.').pop().toLowerCase()] ?? 'application/octet-stream';
// アクセス解析スクリプト（サイト本体のビルドが生成。授業ディレクトリの 1 つ上）。
// 管理者の閲覧は数えないよう、管理者以外に返す HTML にだけ差し込む。
const ANALYTICS_TAG = `<script async src="${new URL('../analytics.js', self.registration.scope).pathname}"></script>`;
const withAnalytics = (html, rec) => (rec.admin ? html : html.replace(/<\/head>/i, `${ANALYTICS_TAG}</head>`));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('lecture-vault', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('keys');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('keys', mode);
      const req = fn(tx.objectStore('keys'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}
const getKeys = () => idb('readonly', (s) => s.get(BASE));
const dropKeys = () => idb('readwrite', (s) => s.delete(BASE));

// 平文のまま配信するもの（ログイン画面から直接使う）
const isPublic = (rel) => rel === 'sw.js' || rel === 'vault.json' || rel.startsWith('_v/');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  let rel;
  try { rel = decodeURIComponent(url.pathname.slice(BASE.length)); } catch { return; }
  if (isPublic(rel)) return;
  event.respondWith(handle(req, url, rel));
});

async function handle(req, url, rel) {
  const isNav = req.mode === 'navigate';
  if (isNav && url.searchParams.has('logout')) {
    await dropKeys();
    return fetch(req);
  }
  const rec = await getKeys().catch(() => null);
  if (!rec || !rec.decks) return isNav ? fetch(req) : new Response('Unauthorized', { status: 401 });

  // 授業トップ: ログイン中のユーザが見られる資料だけを一覧にする
  if (rel === '' || rel === 'index.html') return page(200, rec.title, renderIndex(rec), rec);

  const slash = rel.indexOf('/');
  const dir = slash < 0 ? rel : rel.slice(0, slash);
  const inner = slash < 0 ? '' : rel.slice(slash + 1);
  const deck = rec.decks[dir];
  if (!deck) {
    if (!isNav) return new Response('Forbidden', { status: 403 });
    return page(403, rec.title, `<h1>この資料は閲覧できません</h1>
    <p>${esc(rec.user ?? '')} さんには、この資料の閲覧権限がありません。別のユーザでログインする場合はログアウトしてください。</p>
    <p><a href="${BASE}">資料一覧へ</a> · <a href="${BASE}?logout">ログアウト</a></p>`, rec);
  }
  if (slash < 0 && isNav) return Response.redirect(url.pathname + '/' + url.search, 301);

  for (const cand of candidates(inner, isNav)) {
    const name = hex(await crypto.subtle.sign('HMAC', deck.nameKey, enc.encode(cand))).slice(0, 40);
    const res = await fetch(BASE + '_v/' + name);
    if (res.status === 404) continue;
    if (!res.ok) return new Response('Upstream error', { status: 502 });
    const blob = new Uint8Array(await res.arrayBuffer());
    let body;
    try {
      body = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: blob.slice(0, 12), additionalData: enc.encode(cand) }, deck.encKey, blob.slice(12));
    } catch {
      // 再暗号化などで鍵が合わなくなった。鍵を捨ててログイン画面へ戻す。
      await dropKeys();
      return isNav ? fetch(req) : new Response('Unauthorized', { status: 401 });
    }
    if (isNav && typeOf(cand).startsWith('text/html')) body = withAnalytics(new TextDecoder().decode(body), rec);
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': typeOf(cand), 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    });
  }
  return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function renderIndex(rec) {
  const entries = Object.entries(rec.decks).sort(([a], [b]) => a.localeCompare(b));
  const status = (d) => {
    if (!rec.admin || !Array.isArray(d.users)) return '';
    return d.users.length
      ? ` <span class="tag pub">公開中</span> <span class="who">${esc(d.users.join(', '))}</span>`
      : ' <span class="tag priv">非公開</span> <span class="who">管理者のみ</span>';
  };
  const items = entries
    .map(([dir, d]) => `<li><a href="${BASE}${encodeURIComponent(dir)}/" target="_blank" rel="noopener">${esc(d.title || dir)}</a>${status(d)}</li>`)
    .join('');
  const pub = entries.filter(([, d]) => Array.isArray(d.users) && d.users.length).length;
  const summary = rec.admin
    ? `<p class="admin">管理者として表示しています。公開中 ${pub} 件・非公開 ${entries.length - pub} 件</p>`
    : '';
  return `<h1>${esc(rec.title)}</h1>${summary}
    <ul>${items || '<li>閲覧できる資料はまだありません。</li>'}</ul>
    <footer>${esc(rec.user ?? '')} でログイン中 · <a href="${BASE}?logout">ログアウト</a></footer>`;
}

function page(status, title, body, rec) {
  const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>
  :root { --bg: #fafaf9; --fg: #1c1917; --muted: #78716c; --link: #2563eb; --pub-bg: #dcfce7; --pub-fg: #166534; --priv-bg: #e7e5e4; --priv-fg: #44403c; }
  @media (prefers-color-scheme: dark) { :root { --bg: #1c1917; --fg: #f5f5f4; --muted: #a8a29e; --link: #93c5fd; --pub-bg: #14532d; --pub-fg: #bbf7d0; --priv-bg: #44403c; --priv-fg: #e7e5e4; } }
  body { margin: 0; background: var(--bg); color: var(--fg); font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif; }
  main { max-width: 40rem; margin: 0 auto; padding: 3rem 1rem; }
  h1 { font-size: 1.6rem; margin: 0 0 1.5rem; }
  ul { padding-left: 1.2rem; line-height: 2; }
  a { color: var(--link); }
  p, footer { color: var(--muted); }
  footer { margin-top: 3rem; font-size: .9rem; }
  .tag { display: inline-block; margin-left: .5rem; padding: 0 .5rem; border-radius: 999px; font-size: .75rem; line-height: 1.6; vertical-align: middle; }
  .tag.pub { background: var(--pub-bg); color: var(--pub-fg); }
  .tag.priv { background: var(--priv-bg); color: var(--priv-fg); }
  .who { color: var(--muted); font-size: .8rem; margin-left: .3rem; }
  p.admin { font-size: .85rem; }
</style></head><body><main>${body}</main></body></html>`;
  return new Response(withAnalytics(html, rec), { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// 探索するファイルの候補。ページ遷移なら SPA 用に上位の index.html へフォールバックする
// （Slidev の /deck/5 のようなルートは /deck/index.html が処理する）。
function candidates(rel, isNav) {
  const out = [];
  if (rel === '' || rel.endsWith('/')) out.push(rel + 'index.html');
  else {
    out.push(rel);
    if (isNav && !/\.[a-z0-9]+$/i.test(rel)) out.push(rel + '/index.html');
  }
  if (isNav) {
    const parts = rel.split('/').filter(Boolean);
    parts.pop();
    while (true) {
      const c = (parts.length ? parts.join('/') + '/' : '') + 'index.html';
      if (!out.includes(c)) out.push(c);
      if (!parts.length) break;
      parts.pop();
    }
  }
  return out;
}
