import fs from 'node:fs'
import path from 'node:path'

/**
 * 研究業績データ。
 * data/research/<category>.json を読み込む。researchmap からの自動取得スクリプトは
 * このスキーマ（ResearchCategory）に正規化して書き出すこと。
 */
export interface ResearchItem {
  title: string
  authors?: string[]
  venue?: string // 掲載誌・会議名など
  date?: string // YYYY, YYYY-MM, YYYY-MM-DD
  url?: string
  doi?: string
  note?: string
}

export interface ResearchCategory {
  category: string // researchmap の achievement type（published_papers, presentations, awards, research_projects など）
  label: string // 表示名
  order?: number
  items: ResearchItem[]
}

export interface ResearchData {
  updatedAt?: string
  source?: string
  categories: ResearchCategory[]
}

declare const data: ResearchData
export { data }

export default {
  watch: ['../../data/research/*.json'],
  load(files: string[]): ResearchData {
    const categories: ResearchCategory[] = []
    let meta: Partial<ResearchData> = {}
    for (const file of files) {
      const json = JSON.parse(fs.readFileSync(file, 'utf-8'))
      if (path.basename(file) === '_meta.json') {
        meta = json
        continue
      }
      const cat = json as ResearchCategory
      cat.items = [...(cat.items ?? [])].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      categories.push(cat)
    }
    categories.sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    return { ...meta, categories }
  },
}
