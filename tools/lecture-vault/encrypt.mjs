#!/usr/bin/env node
// lecture-vault: 静的サイト（Slidev の SPA ビルドなど）をディレクトリごと暗号化し、
// GitHub Pages のような静的ホスティングでユーザ名・パスワードによる限定公開を行う。
//
// 使い方:
//   LECTURE_USERS='{"student":"pass1","ta":"pass2"}' \
//   node tools/lecture-vault/encrypt.mjs --in build/course-a --out src/public/lectures/course-a \
//        --base /lectures/course-a/ [--title "授業名"] [--iterations 600000]
//
// 出力（すべて公開されても平文は含まれない）:
//   <out>/index.html, <out>/**/index.html  ログイン画面（入力側に index.html があるディレクトリごと）
//   <out>/sw.js                            復号用 Service Worker（scope = base）
//   <out>/vault.json                       ユーザごとに鍵を包んだキースロット
//   <out>/_v/<hmac>                        暗号化されたファイル本体（ファイル名も HMAC で秘匿）
import { webcrypto as crypto } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const here = path.dirname(fileURLToPath(import.meta.url));
const subtle = crypto.subtle;
const enc = new TextEncoder();
const hex = (buf) => Buffer.from(buf).toString('hex');
const b64 = (buf) => Buffer.from(buf).toString('base64');

const { values: args } = parseArgs({
  options: {
    in: { type: 'string' },
    out: { type: 'string' },
    base: { type: 'string' },
    title: { type: 'string', default: '授業資料' },
    users: { type: 'string' }, // JSON ファイルのパス（未指定なら環境変数 LECTURE_USERS）
    iterations: { type: 'string', default: '600000' },
  },
});

function fail(msg) {
  console.error(`lecture-vault: ${msg}`);
  process.exit(1);
}

if (!args.in || !args.out || !args.base) fail('--in, --out, --base は必須です');
let base = args.base;
if (!base.startsWith('/')) fail('--base は / で始まる絶対パスにしてください（例: /lectures/course-a/）');
if (!base.endsWith('/')) base += '/';
const iterations = Number(args.iterations);
if (!Number.isInteger(iterations) || iterations < 100000) fail('--iterations は 100000 以上の整数にしてください');

const usersRaw = args.users ? await fs.readFile(args.users, 'utf8') : process.env.LECTURE_USERS;
if (!usersRaw) fail('ユーザ一覧がありません（--users <json> または環境変数 LECTURE_USERS）');
let users;
try {
  users = JSON.parse(usersRaw);
} catch {
  fail('ユーザ一覧が JSON として読めません');
}
const userEntries = Object.entries(users ?? {});
if (userEntries.length === 0) fail('ユーザが 0 人です');
for (const [u, p] of userEntries) {
  if (typeof p !== 'string' || p.length < 8) fail(`ユーザ "${u}" のパスワードは 8 文字以上にしてください`);
}

const inDir = path.resolve(args.in);
const outDir = path.resolve(args.out);
if (outDir === inDir || outDir.startsWith(inDir + path.sep)) fail('--out を --in の内側にはできません');

async function walk(dir, rel = '') {
  const out = [];
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...(await walk(path.join(dir, ent.name), r)));
    else if (ent.isFile()) out.push(r);
  }
  return out;
}

const files = await walk(inDir);
if (files.length === 0) fail(`${inDir} にファイルがありません`);

// --- 鍵の準備 ---------------------------------------------------------------
// LECTURE_MASTER_KEY（base64 の 32 バイト）を与えると毎回同じ鍵で暗号化する。
// 内容が変わらないファイルは同じ暗号文になるので、git に積む差分が変更分だけになる。
// 与えなければビルドごとに新しい鍵を作る（全員がログインし直しになる）。
let master;
if (process.env.LECTURE_MASTER_KEY) {
  master = new Uint8Array(Buffer.from(process.env.LECTURE_MASTER_KEY, 'base64'));
  if (master.length !== 32) fail('LECTURE_MASTER_KEY は base64 で 32 バイトにしてください（openssl rand -base64 32）');
} else {
  master = crypto.getRandomValues(new Uint8Array(32));
}
const hkdfKey = await subtle.importKey('raw', master, 'HKDF', false, ['deriveKey']);
const hkdf = (info) => ({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode(base), info: enc.encode(info) });
const encKey = await subtle.deriveKey(hkdf('lecture-vault/enc'), hkdfKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const nameKey = await subtle.deriveKey(hkdf('lecture-vault/name'), hkdfKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const ivKey = await subtle.deriveKey(hkdf('lecture-vault/iv'), hkdfKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const blobName = async (rel) => hex(await subtle.sign('HMAC', nameKey, enc.encode(rel))).slice(0, 40);

// 入力にルートの index.html がなければ、配下のスライド一覧ページを作って一緒に暗号化する
const plain = new Map();
for (const rel of files) plain.set(rel, null);
if (!plain.has('index.html')) {
  const decks = [];
  for (const rel of files.filter((f) => /^[^/]+\/index\.html$/.test(f)).sort()) {
    const html = await fs.readFile(path.join(inDir, rel), 'utf8');
    const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').trim() || rel.split('/')[0];
    decks.push({ dir: rel.split('/')[0], title });
  }
  plain.set('index.html', Buffer.from(renderIndex(args.title, decks)));
}

// --- ファイル本体の暗号化 ------------------------------------------------------
await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(path.join(outDir, '_v'), { recursive: true });
for (const [rel, generated] of plain) {
  const data = generated ?? (await fs.readFile(path.join(inDir, rel)));
  // IV は (パス, 内容) から決定的に作る。同じ IV になるのは同じパス・同じ内容のときだけ。
  const digest = new Uint8Array(await subtle.digest('SHA-256', data));
  const iv = new Uint8Array(await subtle.sign('HMAC', ivKey, Buffer.concat([enc.encode(rel), Buffer.from([0]), digest]))).slice(0, 12);
  // パスを AAD に入れ、暗号文の差し替え（別ファイルとして読ませる）を防ぐ
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(rel) }, encKey, data);
  await fs.writeFile(path.join(outDir, '_v', await blobName(rel)), Buffer.concat([iv, Buffer.from(ct)]));
}

// --- キースロット -------------------------------------------------------------
const slots = [];
for (const [user, pass] of userEntries) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pw = await subtle.importKey('raw', enc.encode(`${user}\u0000${pass}`), 'PBKDF2', false, ['deriveKey']);
  const kek = await subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, pw, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(base) }, kek, master);
  const id = hex(await subtle.digest('SHA-256', enc.encode(`${base}\n${user}`)));
  slots.push({ id, salt: b64(salt), iv: b64(iv), key: b64(wrapped) });
}
slots.sort((a, b) => a.id.localeCompare(b.id));
const vault = { v: 1, base, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations }, slots };
await fs.writeFile(path.join(outDir, 'vault.json'), JSON.stringify(vault));

// --- ログイン画面と Service Worker ---------------------------------------------
const shellTpl = await fs.readFile(path.join(here, 'runtime', 'shell.html'), 'utf8');
const shell = shellTpl
  .replaceAll('__VAULT_BASE_JSON__', JSON.stringify(base))
  .replaceAll('__VAULT_TITLE__', escapeHtml(args.title));
const dirs = new Set([...plain.keys()].filter((r) => r === 'index.html' || r.endsWith('/index.html')).map((r) => path.posix.dirname(r)));
for (const d of dirs) {
  const target = path.join(outDir, d, 'index.html');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, shell);
}
await fs.copyFile(path.join(here, 'runtime', 'sw.js'), path.join(outDir, 'sw.js'));

console.log(`lecture-vault: ${plain.size} files encrypted, ${slots.length} user(s), ${dirs.size} login page(s) -> ${outDir}`);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function renderIndex(title, decks) {
  const items = decks.map((d) => `<li><a href="./${encodeURI(d.dir)}/">${escapeHtml(d.title)}</a></li>`).join('\n      ');
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { --bg: #fafaf9; --fg: #1c1917; --muted: #78716c; --link: #2563eb; }
    @media (prefers-color-scheme: dark) { :root { --bg: #1c1917; --fg: #f5f5f4; --muted: #a8a29e; --link: #93c5fd; } }
    body { margin: 0; background: var(--bg); color: var(--fg); font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif; }
    main { max-width: 40rem; margin: 0 auto; padding: 3rem 1rem; }
    h1 { font-size: 1.6rem; margin: 0 0 1.5rem; }
    ul { padding-left: 1.2rem; line-height: 2; }
    a { color: var(--link); }
    footer { margin-top: 3rem; color: var(--muted); font-size: .9rem; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <ul>
      ${items || '<li>資料はまだありません。</li>'}
    </ul>
    <footer><a href="./?logout">ログアウト</a></footer>
  </main>
</body>
</html>
`;
}
