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
  const keys = await getKeys().catch(() => null);
  if (!keys) return isNav ? fetch(req) : new Response('Unauthorized', { status: 401 });

  for (const cand of candidates(rel, isNav)) {
    const name = hex(await crypto.subtle.sign('HMAC', keys.nameKey, enc.encode(cand))).slice(0, 40);
    const res = await fetch(BASE + '_v/' + name);
    if (res.status === 404) continue;
    if (!res.ok) return new Response('Upstream error', { status: 502 });
    const blob = new Uint8Array(await res.arrayBuffer());
    let body;
    try {
      body = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: blob.slice(0, 12), additionalData: enc.encode(cand) }, keys.encKey, blob.slice(12));
    } catch {
      // 再暗号化などで鍵が合わなくなった。鍵を捨ててログイン画面へ戻す。
      await dropKeys();
      return isNav ? fetch(req) : new Response('Unauthorized', { status: 401 });
    }
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': typeOf(cand), 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    });
  }
  return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
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
