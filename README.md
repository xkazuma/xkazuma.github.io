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

## アクセス解析（Google アナリティクス 4）

- 測定ID（`G-XXXXXXXXXX`）は GitHub のリポジトリ変数 `GA_MEASUREMENT_ID`（Settings → Secrets and variables → Actions → **Variables**）に設定します。`main` へのデプロイ時だけビルドに渡され、`<head>` に gtag.js が入ります。未設定なら何も出力しません。PR ビルドには入りません。
- ローカルで確認する場合: `GA_MEASUREMENT_ID=G-XXXXXXXXXX npm run build`
- ページ遷移の計測は GA4 の拡張計測（「ブラウザの履歴イベントに基づくページの変更」、既定で有効）に任せています。
- `/lectures/` 配下の授業資料も同じ測定IDで計測します。ビルド時に `/lectures/analytics.js` を生成し、ログイン画面と、Service Worker が返す資料一覧・復号したスライドに読み込ませます。**管理者でログインしているときの閲覧は数えません**（ログイン画面の表示は数えます）。
- 資料ごとの閲覧数は GA4 の「ページとスクリーン」でページパス `/lectures/<course-id>/<deck-id>/` から始まる行を見ます（Slidev のスライド送りは `/<deck-id>/5` のように別ページとして記録されます）。

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
  projects.json          研究プロジェクトの資料の一覧
scripts/
  import-researchmap.mjs researchmap エクスポート(zip/JSONL) → data/research/*.json・data/profile.json 変換
  lib/read-zip.mjs       パスワード付き zip の読み込み（依存なし）
src/                     ページ（Markdown）
  index.md  about.md  cv.md
  research/  activities/  teaching/
  public/                そのまま dist にコピーされる静的ファイル（CNAME など）
    lectures/            授業資料（暗号化済み Slidev SPA と公開資料）。VitePress の管轄外
    projects/            研究プロジェクトの資料（同上）
```

## コンテンツの追加方法

### 更新ログ

`src/activities/posts/YYYY-MM-DD-slug.md` を作成します。`category` に応じて各ページ（研究・事業・資料・成果物）の「更新ログ」欄に表示され、全件は `/activities/`（更新ログページ）に一覧されます。

次の更新をしたときは、必ず対応する更新ログのエントリーを追加します。

- 「資料・成果物」ページに資料を公開したとき（`data/courses.json` に `published: true` の項目を追加したときなど）→ `category: teaching` のエントリーを追加
- 「研究」ページにエントリーを追加したとき（researchmap の取り込みや `data/research/*.json` の手動編集で業績が増えたとき）→ `category: research` のエントリーを追加し、追加した業績を本文に列挙

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

1. researchmap にログインし、エクスポート画面で形式「json」を選び、研究者情報と業績をすべてチェックしてエクスポート。
2. 状態が「完了」になったら zip をダウンロードし、画面に表示されたパスワードを控える。zip は展開しなくてよい。
3. zip をそのまま渡して変換する（パスワードは実行時に聞かれる。入力は画面に表示されない）:

   ```sh
   npm run import:researchmap -- ~/Downloads/rm_researchers20261104.zip            # 日本語優先（既定）
   npm run import:researchmap -- ~/Downloads/rm_researchers20261104.zip --lang en  # 英語優先
   ```

   入力に含まれる種別の `data/research/<種別>.json` だけが上書きされ、`_meta.json` の `updatedAt` が更新されます。researchmap 上で「公開」（`display` が `disclosed`）の業績だけを出力します。経歴・学歴・学位・研究分野・担当科目・所属学協会は `data/profile.json` に書き出され、CV ページ（`/cv`）に表示されます。こちらも公開設定の項目だけで、連絡先・ORCID などの ID・画像・URL は出力しません（対象種別は `scripts/import-researchmap.mjs` の `RESEARCH_TYPES` / `PROFILE_TYPES`）。
   zip はメモリ上で展開され、中身はディスクに書き出されません。展開済みの `.jsonl` やそのフォルダを渡すこともできます（ZipCrypto 以外の AES 暗号化 zip は非対応なので、その場合は展開してから渡す）。
4. `npm run dev` で表示を確認し、`data/research/` と `data/profile.json` の変更だけをコミットして push する。zip や展開したファイルはリポジトリの外に置き、コミットしない（念のため `*.zip` と `researchmap-export/` は `.gitignore` 済み）。

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

資料は「公開」（暗号化せずに置き、誰でも閲覧可）・「限定公開」（ログインが必要）・「非公開」（管理者のみ）に分けられます。公開資料は資料置き場の `public.json` に一覧され、「資料・成果物」ページの各授業の下に直接リンクが表示されます。

授業資料のソースは private リポジトリ `xkazuma/xkazuma-lectures` にあり、そちらの CI が Slidev のビルドと暗号化を行って `src/public/lectures/` に push します。暗号化の仕組みと使い方は [tools/lecture-vault/README.md](tools/lecture-vault/README.md) を参照してください。

### 研究プロジェクトの資料

研究プロジェクトごとの資料は `/projects/<project-id>/` に置きます（`src/public/projects/`、仕組みは授業資料と同じ）。ソースは `xkazuma/xkazuma-lectures` の `projects/<project-id>/project.json` です。
研究ページの「研究プロジェクトの資料」には、`data/projects.json` の `published: true` の項目が表示されます。

```json
{ "id": "<project-id>", "title": "プロジェクト名", "period": "2026年度〜", "description": "概要（任意）", "path": "/projects/<project-id>/", "published": true }
```
