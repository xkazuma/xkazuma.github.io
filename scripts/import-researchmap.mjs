#!/usr/bin/env node
/**
 * researchmap のエクスポートファイル（JSON Lines）を data/research/<category>.json に変換する。
 *
 * 使い方:
 *   npm run import:researchmap -- <ファイルまたはディレクトリ> [...] [--lang ja|en]
 *
 *   - researchmap のエクスポート画面で「json」形式を選び、ダウンロードした zip を展開して得た
 *     .jsonl / .json ファイル（またはそれを含むディレクトリ）を渡す。
 *   - 入力に含まれる業績種別のファイルだけを上書きする（含まれない種別は触らない）。
 *   - display が "disclosed"（公開）以外の業績は出力しない。
 *   - 既存ファイルの label / order は引き継ぐ。
 *
 * エクスポートの1行は {"insert": {"type": "published_papers", "id": ...}, "merge": {...}} の形。
 * API のレスポンスと同じ項目名（paper_title.ja など）を持つ前提で、項目が無い場合は飛ばす。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'data', 'research')

const DEFAULT_LABELS = {
  published_papers: ['論文', 1],
  presentations: ['講演・口頭発表', 2],
  research_projects: ['研究課題', 3],
  awards: ['受賞', 4],
  misc: ['MISC', 5],
  books_etc: ['書籍等出版物', 6],
  works: ['Works（作品等）', 7],
  industrial_property_rights: ['産業財産権', 8],
  teaching_experience: ['担当経験のある科目', 9],
  research_experience: ['経歴', 10],
  education: ['学歴', 11],
  committee_memberships: ['委員歴', 12],
  association_memberships: ['所属学協会', 13],
  social_contribution: ['社会貢献活動', 14],
  media_coverage: ['メディア報道', 15],
  academic_contribution: ['学術貢献活動', 16],
  others: ['その他', 17],
}

// 研究ページに出す業績種別（ここに無い種別は読み飛ばす）
const RESEARCH_TYPES = [
  'published_papers', 'presentations', 'research_projects', 'awards', 'misc', 'books_etc', 'works',
  'industrial_property_rights', 'academic_contribution', 'social_contribution', 'media_coverage', 'others',
]

// CV ページ（data/profile.json）に使う種別
const PROFILE_TYPES = [
  'researchers', 'research_experience', 'education', 'research_interests', 'research_areas',
  'teaching_experience', 'association_memberships', 'committee_memberships',
]

const TITLE_KEYS = [
  'award_title',
  'paper_title', 'presentation_title', 'research_project_title', 'award_name', 'book_title',
  'work_title', 'industrial_property_right_name', 'subject', 'committee_name',
  'academic_contribution_title', 'social_contribution_title', 'media_coverage_title',
  'other_title', 'research_interests', 'research_area', 'title',
]
const PEOPLE_KEYS = ['authors', 'presenters', 'investigators', 'winners', 'award_winners', 'creators', 'inventors']
const VENUE_KEYS = [
  'publication_name', 'event', 'offer_organization', 'association', 'publisher', 'organization',
  'affiliation', 'school_name', 'institution', 'department',
]
const DATE_KEYS = [
  'publication_date', 'from_event_date', 'award_date', 'from_date', 'application_date', 'start_date',
]

// ---- 引数 ----
const args = process.argv.slice(2)
let lang = 'ja'
const inputs = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--lang') lang = args[++i]
  else if (args[i] === '-h' || args[i] === '--help') usage(0)
  else inputs.push(args[i])
}
if (!['ja', 'en'].includes(lang)) usage(1, `--lang は ja か en: ${lang}`)
if (inputs.length === 0) usage(1)
const otherLang = lang === 'ja' ? 'en' : 'ja'

function usage(code, msg) {
  if (msg) console.error(msg)
  console.error('usage: npm run import:researchmap -- <export.jsonl|dir> [...] [--lang ja|en]')
  process.exit(code)
}

// ---- 入力の読み込み ----
function collectFiles(p) {
  const st = fs.statSync(p)
  if (st.isDirectory()) return fs.readdirSync(p).sort().flatMap((f) => collectFiles(path.join(p, f)))
  return /\.(jsonl|json|ndjson)$/i.test(p) ? [p] : []
}

function parseFile(file) {
  const text = fs.readFileSync(file, 'utf-8').replace(/^﻿/, '').trim()
  if (!text) return []
  // JSON 配列・単一オブジェクトにも対応
  if (text.startsWith('[')) return JSON.parse(text)
  try {
    const one = JSON.parse(text)
    // API レスポンス（@graph に種別ごとのブロック）も受け付ける
    if (Array.isArray(one['@graph'])) return one['@graph'].flatMap((g) => (g.items ?? []).map((x) => ({ type: g['@type'], merge: x })))
    return Array.isArray(one.items) ? one.items.map((x) => ({ merge: x })) : [one]
  } catch {
    // JSON Lines
  }
  return text.split(/\r?\n/).filter((l) => l.trim()).map((l, n) => {
    try {
      return JSON.parse(l)
    } catch (e) {
      throw new Error(`${file}:${n + 1}: JSON として読めません (${e.message})`)
    }
  })
}

// {insert:{type}, merge:{...}} / {type, ...} / API 形式 {"@type": ...} のどれでも受ける
function normalizeRecord(rec, file) {
  const type = rec.insert?.type ?? rec.type ?? rec['@type'] ?? typeFromFileName(file)
  const body = rec.merge ?? rec.similar_merge ?? rec.force ?? rec.data ?? rec
  return { type, body }
}

function typeFromFileName(file) {
  const base = path.basename(file).replace(/\.[^.]+$/, '')
  return Object.keys(DEFAULT_LABELS).find((k) => base.includes(k))
}

// ---- 値の取り出し ----
function text(v) {
  if (v == null) return undefined
  if (typeof v === 'string') return v.trim() || undefined
  if (Array.isArray(v)) return text(v[0])
  if (typeof v === 'object') return text(v[lang]) ?? text(v[otherLang])
  return String(v)
}

function people(v) {
  if (!v || typeof v !== 'object') return undefined
  const list = Array.isArray(v) ? v : (v[lang]?.length ? v[lang] : v[otherLang])
  if (!Array.isArray(list)) return undefined
  const names = list.map((p) => (typeof p === 'string' ? p : text(p.name) ?? text(p))).filter(Boolean)
  return names.length ? names : undefined
}

const first = (body, keys, fn) => {
  for (const k of keys) {
    const v = fn(body[k])
    if (v) return v
  }
  return undefined
}

function pages(b) {
  const s = text(b.starting_page)
  const e = text(b.ending_page)
  return s && e ? `${s}-${e}` : s
}

function venue(type, b) {
  if (type === 'awards') return [text(b.association), text(b.award_name)].filter(Boolean).join(' ') || undefined
  if (type === 'research_projects') {
    return [text(b.offer_organization), text(b.system_name), text(b.category)].filter(Boolean).join(' ') || undefined
  }
  const base = first(b, VENUE_KEYS, text)
  if (!base) return undefined
  const vol = text(b.volume)
  const num = text(b.number)
  const pp = pages(b)
  let s = base
  if (vol) s += ` ${vol}`
  if (num) s += `(${num})`
  if (pp) s += ` ${pp}`
  return s
}

function dateOf(b) {
  const d = first(b, DATE_KEYS, text)
  if (!d) return undefined
  // "2022-12" / "2022/12/01" / "20221201" などを YYYY[-MM[-DD]] にそろえる
  const m = d.replace(/\//g, '-').match(/^(\d{4})-?(\d{2})?-?(\d{2})?/)
  if (!m) return d
  return [m[1], m[2], m[3]].filter(Boolean).join('-')
}

function noteOf(type, b) {
  const tags = []
  if (b.referee === true || b.referee === 'true') tags.push('査読有り')
  if (b.invited === true || b.invited === 'true') tags.push('招待有り')
  if (b.major_achievement === true || b.major_achievement === 'true') tags.push('主要な業績')
  if (type === 'research_projects') {
    const to = text(b.to_date)
    if (to) tags.push(`〜${to}`)
    if (b.research_project_owner_role === 'principal_investigator') tags.push('研究代表者')
    if (b.research_project_owner_role === 'coinvestigator') tags.push('研究分担者')
  }
  return tags.length ? tags.join(' / ') : undefined
}

function toItem(type, b) {
  const title = first(b, TITLE_KEYS, text) ?? Object.entries(b).find(([k]) => /_(title|name)$/.test(k))?.[1]
  const t = text(title)
  if (!t) return null
  const doi = text(b.identifiers?.doi)
  const url = text(b.see_also?.map?.((s) => s['@id'])) ?? (doi ? `https://doi.org/${doi}` : undefined)
  const item = {
    title: t,
    authors: first(b, PEOPLE_KEYS, people),
    venue: venue(type, b),
    date: dateOf(b),
    url,
    doi,
    note: noteOf(type, b),
  }
  for (const k of Object.keys(item)) if (item[k] === undefined) delete item[k]
  return item
}

// ---- 変換 ----
const files = inputs.flatMap(collectFiles)
if (files.length === 0) usage(1, '読み込める .jsonl / .json ファイルがありません')

const byType = new Map()
const profileRecs = new Map() // CV ページ用（経歴・学歴など）
const stats = { read: 0, other: 0, hidden: 0, skipped: 0 }
for (const file of files) {
  for (const rec of parseFile(file)) {
    stats.read++
    const { type, body } = normalizeRecord(rec, file)
    if (!type) {
      stats.skipped++
      continue
    }
    if (PROFILE_TYPES.includes(type)) {
      if (!profileRecs.has(type)) profileRecs.set(type, [])
      profileRecs.get(type).push(body)
      continue
    }
    if (!RESEARCH_TYPES.includes(type)) {
      stats.other++
      continue
    }
    if (body.display !== 'disclosed') {
      stats.hidden++
      continue
    }
    const item = toItem(type, body)
    if (!item) {
      stats.skipped++
      continue
    }
    if (!byType.has(type)) byType.set(type, [])
    byType.get(type).push(item)
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true })
for (const [type, items] of byType) {
  const out = path.join(OUT_DIR, `${type}.json`)
  const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf-8')) : {}
  const [label, order] = DEFAULT_LABELS[type] ?? [type, 99]
  items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  const data = { category: type, label: prev.label ?? label, order: prev.order ?? order, items }
  fs.writeFileSync(out, JSON.stringify(data, null, 2) + '\n')
  console.log(`${path.relative(ROOT, out)}: ${items.length} 件`)
}

// ---- CV（プロフィール）----
// 公開設定（disclosed）の項目だけを、表示に使う項目に限って書き出す。
// 連絡先・各種 ID・画像・URL・エフォート率などは出力しない。
const isOpen = (v) => v === 'disclosed'
const period = (b) => ({ from: dateOf({ from_date: b.from_date }), to: b.to_date === '9999' ? 'present' : dateOf({ from_date: b.to_date }) })
const compact = (o) => {
  for (const k of Object.keys(o)) if (o[k] === undefined || (Array.isArray(o[k]) && !o[k].length)) delete o[k]
  return o
}
const openItems = (type) => (profileRecs.get(type) ?? []).filter((b) => isOpen(b.display))
const byFromDesc = (a, b) => (b.from ?? '').localeCompare(a.from ?? '')

if (profileRecs.size) {
  const r = profileRecs.get('researchers')?.[0] ?? {}
  const both = (v) => (v ? compact({ ja: v.ja, en: v.en }) : undefined)
  const profile = compact({
    name: r.family_name
      ? compact({
          ja: [r.family_name.ja, r.given_name?.ja].filter(Boolean).join(' ') || undefined,
          en: [r.given_name?.en, r.family_name.en].filter(Boolean).join(' ') || undefined,
        })
      : undefined,
    affiliations: (r.affiliations ?? []).filter((a) => isOpen(a.display_affiliation)).map((a) =>
      compact({ affiliation: both(a.affiliation), section: both(a.section), job: isOpen(a.display_job) ? both(a.job) : undefined }),
    ),
    degrees: (r.degrees ?? []).filter((d) => isOpen(d.display_degree)).map((d) =>
      compact({ degree: both(d.degree), institution: both(d.degree_institution), date: d.degree_date }),
    ).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    researchInterests: openItems('research_interests').map((b) => both(b.keyword)).filter(Boolean),
    researchAreas: openItems('research_areas').map((b) => compact({ discipline: both(b.discipline), field: both(b.research_field) })),
    experience: openItems('research_experience').map((b) =>
      compact({ ...period(b), affiliation: both(b.affiliation), section: both(b.section), job: both(b.job) }),
    ).sort(byFromDesc),
    education: openItems('education').map((b) =>
      compact({ ...period(b), affiliation: both(b.affiliation), department: both(b.department), course: both(b.course) }),
    ).sort(byFromDesc),
    teaching: openItems('teaching_experience').map((b) =>
      compact({ ...period(b), subject: both(b.subject_name), institution: both(b.institution_name) }),
    ).sort(byFromDesc),
    committees: openItems('committee_memberships').map((b) =>
      compact({ ...period(b), name: both(b.committee_name), association: both(b.association) }),
    ).sort(byFromDesc),
    memberships: openItems('association_memberships').map((b) => both(b.academic_society_name)).filter(Boolean),
  })
  const profilePath = path.join(ROOT, 'data', 'profile.json')
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2) + '\n')
  console.log(`${path.relative(ROOT, profilePath)}: ${Object.keys(profile).join(', ')}`)
}

const metaPath = path.join(OUT_DIR, '_meta.json')
const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf-8')) : {}
meta.updatedAt = new Date().toISOString()
meta.source ??= 'https://researchmap.jp/xkzm'
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')

console.log(`読み込み ${stats.read} 件 / 対象外の種別 ${stats.other} 件 / 非公開で除外 ${stats.hidden} 件 / タイトル不明で除外 ${stats.skipped} 件`)
