import fs from 'node:fs'

/**
 * 資料置き場（/lectures/<course>/ と /projects/<project>/）の公開資料の一覧。
 * xkazuma-lectures の CI が lecture-vault で出力する src/public/<kind>/<id>/public.json を読む。
 * 限定公開の資料の中身・題名はここには含まれない（restricted は「ログインが必要な資料があるか」だけ）。
 */
export interface MaterialDeck {
  dir: string
  title: string
}

export interface MaterialCollection {
  title: string
  base: string // 例: /lectures/stats-practice-fy26/
  decks: MaterialDeck[] // 公開資料（ログイン不要）
  restricted: boolean // 限定公開の資料があるか
}

declare const data: Record<string, MaterialCollection> // base -> collection
export { data }

export default {
  watch: ['../../src/public/lectures/*/public.json', '../../src/public/projects/*/public.json'],
  load(files: string[]): Record<string, MaterialCollection> {
    const out: Record<string, MaterialCollection> = {}
    for (const file of files) {
      const json = JSON.parse(fs.readFileSync(file, 'utf-8')) as MaterialCollection
      json.decks = [...(json.decks ?? [])].sort((a, b) => a.dir.localeCompare(b.dir))
      out[json.base] = json
    }
    return out
  },
}
