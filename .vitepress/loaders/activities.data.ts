import { createContentLoader } from 'vitepress'

export interface Activity {
  url: string
  title: string
  date: string // YYYY-MM-DD
  category?: string // research | business | teaching | private など
  tags: string[]
  summary?: string
}

declare const data: Activity[]
export { data }

// src/activities/posts/*.md の frontmatter から更新ログ一覧を作る（新しい順）
export default createContentLoader('activities/posts/*.md', {
  transform(raw): Activity[] {
    return raw
      .filter((p) => !p.frontmatter.draft)
      .map((p) => ({
        url: p.url,
        title: p.frontmatter.title ?? p.url,
        date: normalizeDate(p.frontmatter.date),
        category: p.frontmatter.category,
        tags: p.frontmatter.tags ?? [],
        summary: p.frontmatter.summary,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
  },
})

function normalizeDate(d: unknown): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10)
  return typeof d === 'string' ? d.slice(0, 10) : ''
}
