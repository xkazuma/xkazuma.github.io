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
  research/*.json        研究業績（researchmap の内容をもとに更新）
  courses.json           授業資料の一覧
src/                     ページ（Markdown）
  index.md  about.md
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

### 研究業績（researchmap の内容）

`data/research/<category>.json` を以下の形式で置くと「研究」ページに表示されます。researchmap の内容（エクスポートなど）をこのスキーマに整形して置きます。`_meta.json` には `source` と `updatedAt`（最終同期日時）を入れます。

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
