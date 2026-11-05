#!/usr/bin/env node
// lecture-vault: 授業（course）配下の資料（deck = Slidev の SPA ビルドなど）を資料ごとの鍵で暗号化し、
// GitHub Pages のような静的ホスティングで、資料ごとにアクセスできるユーザを分けて限定公開する。
//
// 使い方:
//   LECTURE_USERS='{"alice":"pass-1","bob":"pass-2"}' LECTURE_MASTER_KEY="$(cat master.key)" \
//   node tools/lecture-vault/encrypt.mjs --in build/course-a --out src/public/lectures/course-a \
//        --base /lectures/course-a/ --config courses/course-a/course.json
//
// --in の直下の各ディレクトリが 1 つの資料（deck）。--config（course.json）の形式:
//   {
//     "title": "授業名",
//     "users": ["alice", "bob"],                       // 既定で全資料を見られるユーザ
//     "admins": ["owner"],                            // 公開・非公開にかかわらず全資料を見られるユーザ（任意）
//     "decks": {
//       "05-exam": { "users": ["alice"] },             // この資料だけ見られるユーザを上書き
//       "06-extra": { "users": ["alice", "carol"], "keyVersion": 2 }
//     }
//   }
// keyVersion を上げるとその資料だけ鍵が変わる（その資料からユーザを外したときに使う）。
// 管理者（--admins / 環境変数 LECTURE_ADMINS をカンマ区切りで、または course.json の admins）は
// users が空の資料（非公開）も含めて全資料を見られ、資料一覧に公開状態と閲覧ユーザが表示される。
//
// 出力（すべて公開されても平文は含まれない）:
//   <out>/index.html, <out>/<deck>/index.html  ログイン画面
//   <out>/sw.js                                復号用 Service Worker（scope = base）
//   <out>/vault.json                           ユーザごとのキースロット（見られる資料の鍵だけを包む）
//   <out>/_v/<hmac>                            暗号化されたファイル本体（ファイル名も HMAC で秘匿）
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
    config: { type: 'string' },
    title: { type: 'string' },
    users: { type: 'string' }, // パスワードの JSON ファイル（未指定なら環境変数 LECTURE_USERS）
    admins: { type: 'string' }, // 管理者（カンマ区切り。未指定なら環境変数 LECTURE_ADMINS）
    iterations: { type: 'string', default: '600000' },
  },
});

function fail(msg) {
  console.error(`lecture-vault: ${msg}`);
  process.exit(1);
}
const warn = (msg) => console.warn(`lecture-vault: warning: ${msg}`);

if (!args.in || !args.out || !args.base) fail('--in, --out, --base は必須です');
let base = args.base;
if (!base.startsWith('/')) fail('--base は / で始まる絶対パスにしてください（例: /lectures/course-a/）');
if (!base.endsWith('/')) base += '/';
const iterations = Number(args.iterations);
if (!Number.isInteger(iterations) || iterations < 100000) fail('--iterations は 100000 以上の整数にしてください');

// --- パスワードとアクセス設定 ---------------------------------------------------
const usersRaw = args.users ? await fs.readFile(args.users, 'utf8') : process.env.LECTURE_USERS;
if (!usersRaw) fail('パスワード一覧がありません（--users <json> または環境変数 LECTURE_USERS）');
let passwords;
try {
  passwords = JSON.parse(usersRaw);
} catch {
  fail('パスワード一覧が JSON として読めません');
}
if (!passwords || typeof passwords !== 'object' || Array.isArray(passwords)) fail('パスワード一覧は {"ユーザ名": "パスワード"} の形にしてください');
for (const [u, p] of Object.entries(passwords)) {
  if (typeof p !== 'string') fail(`ユーザ "${u}" のパスワードが文字列ではありません`);
  if (p.length < 8) fail(`ユーザ "${u}" のパスワードは 8 文字以上にしてください`);
}

let config = {};
if (args.config) {
  try {
    config = JSON.parse(await fs.readFile(args.config, 'utf8'));
  } catch (e) {
    fail(`--config を読めません: ${e.message}`);
  }
}
const courseTitle = args.title ?? config.title ?? path.basename(base);
// --config を渡したのに users がなければ誰にも見せない（新しい授業が意図せず全員に公開されるのを防ぐ）
const defaultUsers = config.users ?? (args.config ? [] : Object.keys(passwords));
const deckConfig = config.decks ?? {};
const admins = [...new Set([
  ...String(args.admins ?? process.env.LECTURE_ADMINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  ...(config.admins ?? []),
])];
for (const u of admins) if (!(u in passwords)) fail(`管理者 "${u}" のパスワードが LECTURE_USERS にありません`);

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

const deckDirs = (await fs.readdir(inDir, { withFileTypes: true }))
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();
for (const name of Object.keys(deckConfig)) {
  if (!deckDirs.includes(name)) warn(`設定にある資料 "${name}" が --in にありません`);
}
for (const e of await fs.readdir(inDir, { withFileTypes: true })) {
  if (e.isFile()) warn(`授業直下のファイル "${e.name}" は無視します（資料はサブディレクトリに置いてください）`);
}

// --- 鍵の準備 ---------------------------------------------------------------
// LECTURE_MASTER_KEY（base64 の 32 バイト）から資料ごとの鍵を導出する。固定しておくと
// 内容が変わらないファイルは同じ暗号文になり、git の差分が変更分だけになる。
let master;
if (process.env.LECTURE_MASTER_KEY) {
  master = new Uint8Array(Buffer.from(process.env.LECTURE_MASTER_KEY, 'base64'));
  if (master.length !== 32) fail('LECTURE_MASTER_KEY は base64 で 32 バイトにしてください（openssl rand -base64 32）');
} else {
  warn('LECTURE_MASTER_KEY がないので毎回ランダムな鍵を使います（全員がログインし直しになります）');
  master = crypto.getRandomValues(new Uint8Array(32));
}
const masterHkdf = await subtle.importKey('raw', master, 'HKDF', false, ['deriveBits']);
const hkdf = (salt, info) => ({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode(salt), info: enc.encode(info) });

async function deckKeys(raw, dir) {
  const k = await subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
  const salt = `${base}${dir}/`;
  return {
    encKey: await subtle.deriveKey(hkdf(salt, 'lecture-vault/enc'), k, { name: 'AES-GCM', length: 256 }, false, ['encrypt']),
    nameKey: await subtle.deriveKey(hkdf(salt, 'lecture-vault/name'), k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
    ivKey: await subtle.deriveKey(hkdf(salt, 'lecture-vault/iv'), k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
  };
}

// --- 資料ごとの暗号化 ----------------------------------------------------------
await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(path.join(outDir, '_v'), { recursive: true });

const grants = new Map(); // user -> [{dir, title, key}]
const published = [];
let fileCount = 0;
for (const dir of deckDirs) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(dir)) fail(`資料名 "${dir}" は英数字・ハイフン・ドット・アンダースコアにしてください`);
  const dc = deckConfig[dir] ?? {};
  const users = [...new Set(dc.users ?? defaultUsers)];
  // 管理者以外に見られるユーザがいれば「公開」、いなければ「非公開」（管理者だけが見られる）
  const viewers = users.filter((u) => !admins.includes(u));
  const readers = [...new Set([...users, ...admins])];
  if (readers.length === 0) {
    warn(`資料 "${dir}" を見られるユーザがいないので公開しません`);
    continue;
  }
  for (const u of users) if (!(u in passwords)) fail(`資料 "${dir}" のユーザ "${u}" のパスワードが LECTURE_USERS にありません`);

  const files = await walk(path.join(inDir, dir));
  if (!files.includes('index.html')) {
    warn(`資料 "${dir}" に index.html がないので公開しません`);
    continue;
  }
  const keyVersion = Number(dc.keyVersion ?? 0);
  const raw = new Uint8Array(await subtle.deriveBits(hkdf(base, `lecture-vault/deck/${dir}/${keyVersion}`), masterHkdf, 256));
  const keys = await deckKeys(raw, dir);
  for (const rel of files) {
    const data = await fs.readFile(path.join(inDir, dir, rel));
    // IV は (パス, 内容) から決定的に作る。同じ IV になるのは同じパス・同じ内容のときだけ。
    const digest = new Uint8Array(await subtle.digest('SHA-256', data));
    const iv = new Uint8Array(await subtle.sign('HMAC', keys.ivKey, Buffer.concat([enc.encode(rel), Buffer.from([0]), digest]))).slice(0, 12);
    // パスを AAD に入れ、暗号文の差し替え（別ファイルとして読ませる）を防ぐ
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(rel) }, keys.encKey, data);
    const name = hex(await subtle.sign('HMAC', keys.nameKey, enc.encode(rel))).slice(0, 40);
    await fs.writeFile(path.join(outDir, '_v', name), Buffer.concat([iv, Buffer.from(ct)]));
    fileCount++;
  }
  const html = await fs.readFile(path.join(inDir, dir, 'index.html'), 'utf8');
  const title = (dc.title ?? html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').trim().replace(/ - Slidev$/, '') || dir;
  for (const u of readers) {
    if (!grants.has(u)) grants.set(u, []);
    // 公開状態と閲覧ユーザは管理者のスロットにだけ入れる（受講者には他の受講者名を見せない）
    grants.get(u).push(admins.includes(u) ? { dir, title, key: b64(raw), users: viewers } : { dir, title, key: b64(raw) });
  }
  published.push({ dir, viewers });
}

// --- キースロット -------------------------------------------------------------
// 各ユーザのスロットには、そのユーザが見られる資料の鍵だけを入れる。
const slots = [];
for (const [user, decks] of grants) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pw = await subtle.importKey('raw', enc.encode(`${user}\u0000${passwords[user]}`), 'PBKDF2', false, ['deriveKey']);
  const kek = await subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, pw, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = enc.encode(JSON.stringify({ title: courseTitle, decks, ...(admins.includes(user) ? { admin: true } : {}) }));
  const wrapped = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(base) }, kek, payload);
  const id = hex(await subtle.digest('SHA-256', enc.encode(`${base}\n${user}`)));
  slots.push({ id, salt: b64(salt), iv: b64(iv), data: b64(wrapped) });
}
slots.sort((a, b) => a.id.localeCompare(b.id));
const vault = { v: 2, base, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations }, slots };
await fs.writeFile(path.join(outDir, 'vault.json'), JSON.stringify(vault));

// --- ログイン画面と Service Worker ---------------------------------------------
const shellTpl = await fs.readFile(path.join(here, 'runtime', 'shell.html'), 'utf8');
const shell = shellTpl
  .replaceAll('__VAULT_BASE_JSON__', JSON.stringify(base))
  .replaceAll('__VAULT_TITLE__', escapeHtml(courseTitle));
for (const d of ['', ...published.map((p) => p.dir)]) {
  const target = path.join(outDir, d, 'index.html');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, shell);
}
await fs.copyFile(path.join(here, 'runtime', 'sw.js'), path.join(outDir, 'sw.js'));

console.log(`lecture-vault: ${published.length} deck(s), ${fileCount} files encrypted, ${slots.length} user(s) -> ${outDir}`);
if (admins.length) console.log(`  管理者: ${admins.join(', ')}`);
for (const p of published) console.log(`  ${p.dir}: ${p.viewers.length ? `公開（${p.viewers.join(', ')}）` : '非公開（管理者のみ）'}`);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
