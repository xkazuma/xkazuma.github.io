# CLAUDE.md

このリポジトリは xkzm.me のポートフォリオサイト（VitePress）です。構成とコンテンツの追加方法は [README.md](README.md) を参照してください。

## 更新ログのルール

「活動ログ」ではなく「更新ログ」と呼びます。更新ログは `src/activities/posts/YYYY-MM-DD-slug.md` の 1 ファイル 1 エントリーで、frontmatter の `category` によって各ページの「更新ログ」欄に表示されます。

- **「資料・成果物」ページに資料を公開したら**、同じ PR で `category: teaching` の更新ログを追加する。本文には資料ページへのリンク（`/lectures/...` は `<a href="..." target="_self">`）を入れる。
- **「研究」ページにエントリーを追加したら**（researchmap の取り込みで業績が増えた場合を含む）、同じ PR で `category: research` の更新ログを追加する。本文には追加した業績を種別ごとに列挙する。取り込み前後の `data/research/*.json` を比較して、新しく増えた項目だけを書く。
- 既存の更新ログは書き換えない（誤記の修正を除く）。
