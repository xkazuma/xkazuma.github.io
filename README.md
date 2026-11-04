# xkazuma.github.io

個人ポートフォリオサイト <https://www.xkzm.me> のソース。[VitePress](https://vitepress.dev/)（Vue 3 + Vite）で構築し、GitHub Actions で GitHub Pages にデプロイします。

## 注意

このリポジトリは公開リポジトリです。限定公開の授業資料などは、平文のままコミットしないでください（暗号化してから配置する方針）。

## 開発

```sh
npm ci
npm run dev      # http://localhost:5173
npm run build    # .vitepress/dist に出力
npm run preview
```

`main` に push すると `.github/workflows/deploy.yml` がビルドして Pages に公開します。

### 本番反映前の確認

- **ローカル:** `npm run build && npm run preview` で本番と同じビルド結果を http://localhost:4173 で確認できます。
- **PR:** PR を作るとビルドだけが走り（本番には反映されません）、ビルド結果が Actions の実行ページに Artifact `site-preview`（zip）として 7 日間保存されます。ダウンロードして展開し、`npx serve <展開先>` などで開けば確認できます。

## ディレクトリ構成

```
.vitepress/
  config.mts             サイト設定（ナビ・フッターなど）
  loaders/               ビルド時データローダー
    activities.data.ts   src/activities/posts/*.md の frontmatter を一覧化
    research.data.ts     data/research/*.json を読み込み
  theme/                 デフォルトテーマの拡張・Vue コンポーネント
data/
  research/*.json        研究業績（researchmap のエクスポートから変換して上書き）
  profile.json           CV ページ用のプロフィール（同上）
  courses.json           授業資料の一覧
scripts/
  import-researchmap.mjs researchmap エクスポート → data/research/*.json 変換
src/                     ページ（Markdown）
  index.md  about.md  cv.md
  research/  activities/  teaching/
  public/                そのまま dist にコピーされる静的ファイル（CNAME など）
    lectures/            授業資料（暗号化済み Slidev SPA）。VitePress の管轄外
```

## コンテンツの追加方法

### 活動ログ

`src/activities/posts/YYYY-MM-DD-slug.md` を作成します。

```md
---
title: タイトル
date: 2026-11-04
category: research   # research | business | teaching | private
tags: [tag1]
summary: 一覧に表示する概要
draft: false         # true にすると一覧に出ない
---
```

### 研究業績（researchmap 連携）

researchmap の API は利用申請が前提のため使わず、**エクスポート機能で手動更新**します。

1. researchmap にログインし、エクスポート画面で形式「json」を選び、出力したい業績種別（論文・講演・口頭発表等・競争的資金等の研究課題・受賞 など）をチェックしてエクスポート。
2. 状態が「完了」になったら zip をダウンロードし、画面に表示されたパスワードで展開する（例: `researchmap-export/` に展開。このディレクトリは `.gitignore` 済み）。
3. 変換する:

   ```sh
   npm run import:researchmap -- researchmap-export/       # 日本語優先（既定）
   npm run import:researchmap -- researchmap-export/ --lang en   # 英語優先
   ```

   入力に含まれる種別の `data/research/<種別>.json` だけが上書きされ、`_meta.json` の `updatedAt` が更新されます。researchmap 上で「公開」（`display` が `disclosed`）の業績だけを出力します。経歴・学歴・学位・研究分野・担当科目・所属学協会は `data/profile.json` に書き出され、CV ページ（`/cv`）に表示されます。こちらも公開設定の項目だけで、連絡先・ORCID などの ID・画像・URL は出力しません（対象種別は `scripts/import-researchmap.mjs` の `RESEARCH_TYPES` / `PROFILE_TYPES`）。
4. `npm run dev` で表示を確認し、`data/research/` と `data/profile.json` の変更だけをコミットして push する。エクスポートの元ファイルはコミットしない。

`data/research/<category>.json` は以下の形式です（手で編集しても構いません）。`_meta.json` には `source` と `updatedAt`（最終同期日時）を入れます。

```json
{
  "category": "published_papers",
  "label": "論文",
  "order": 1,
  "items": [
    { "title": "...", "authors": ["..."], "venue": "...", "date": "2025-04", "url": "https://...", "doi": "..." }
  ]
}
```

### 授業資料

暗号化済みの資料は `src/public/lectures/` 配下に置きます（ビルド時に `/lectures/` へそのままコピー）。`/lectures/` は VitePress のルーティング対象外で、サイト内リンクは `target="_self"` で通常遷移させます。一覧は `data/courses.json` の `published: true` の項目が「授業」ページに表示されます。

授業資料のソースは private リポジトリ `xkazuma/xkazuma-lectures` にあり、そちらの CI が Slidev のビルドと暗号化を行って `src/public/lectures/` に push します。暗号化の仕組みと使い方は [tools/lecture-vault/README.md](tools/lecture-vault/README.md) を参照してください。
