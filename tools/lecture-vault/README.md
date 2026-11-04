# lecture-vault

GitHub Pages（サーバ側の認証がない静的ホスティング）で、授業資料（Slidev の SPA ビルドなど）を
**資料ごとに決めたユーザだけが、ユーザ名とパスワードで閲覧できる**ように公開するための仕組みです。

公開リポジトリと Pages に置かれるのは暗号文だけです。平文の資料はこのリポジトリにコミットしません。

## しくみ

```
/lectures/<course>/
├── index.html, <deck>/index.html   ログイン画面（平文。資料の中身は含まない）
├── sw.js                           復号用 Service Worker（scope = /lectures/<course>/）
├── vault.json                      ユーザごとのキースロット
└── _v/<hmac>                       暗号化されたファイル本体（ファイル名も秘匿）
```

1. `encrypt.mjs` が **資料（deck）ごとに別の鍵** を `LECTURE_MASTER_KEY` から導出し、その資料の全ファイルを AES-256-GCM で暗号化します。
   ファイル名は HMAC で置き換えるので、どんなスライドや画像があるかも分かりません。
2. ユーザごとに、`ユーザ名 + パスワード` から PBKDF2-SHA256（60 万回）で作った鍵で、**そのユーザが見られる資料の鍵だけ** を包んで `vault.json` に入れます。
   見られない資料の鍵はそのユーザのスロットに入っていないので、ブラウザを細工しても復号できません。
3. 閲覧者がログインすると、ブラウザ内で資料の鍵を取り出し、取り出し不可（non-extractable）の鍵として IndexedDB に保存します。
4. Service Worker が `/lectures/<course>/` 配下へのリクエストを横取りし、対応する暗号文を取得・復号して返します。
   - 授業トップ（`/lectures/<course>/`）は、ログイン中のユーザが見られる資料だけの一覧になります。
   - 権限のない資料を開くと「この資料は閲覧できません」と表示します。
   - Slidev の SPA はそのまま動きます（`/deck/5` のようなルートは `deck/index.html` にフォールバック）。

ログアウトは `/lectures/<course>/?logout` を開きます（一覧ページにリンクがあります）。

## アクセス設定（course.json）

```json
{
  "title": "統計学演習",
  "users": ["alice", "bob"],
  "decks": {
    "05-exam":  { "users": ["alice"] },
    "06-extra": { "users": ["alice", "carol"], "keyVersion": 1 }
  }
}
```

- `users`: その授業の資料を既定で見られるユーザ。
- `decks.<deck>.users`: その資料だけ見られるユーザを上書きします（既定に追加ではなく置き換え）。
- `users` が空・未指定の資料は公開されません。新しい授業が意図せず全員に公開されることはありません。
- パスワードは `LECTURE_USERS`（`{"alice": "パスワード", ...}`）で全授業共通に管理します。`course.json` に書いたユーザのパスワードがないとエラーになります。

## 使い方

```sh
# Slidev をサブパス付きでビルド（base は最終的な公開パスと一致させる）
npx slidev build slides.md --base /lectures/course-a/01-intro/ --out build/course-a/01-intro

# 授業単位で暗号化（--in の直下のディレクトリが 1 資料）
LECTURE_USERS='{"alice":"long-random-password"}' \
LECTURE_MASTER_KEY="$(cat master.key)" \
node tools/lecture-vault/encrypt.mjs \
  --in build/course-a --out src/public/lectures/course-a \
  --base /lectures/course-a/ --config courses/course-a/course.json
```

出力先は VitePress の `src/public/lectures/` です。ビルド時に `/lectures/` へそのままコピーされます。

CI で自動化する場合は [`examples/lectures-repo-publish.yml`](examples/lectures-repo-publish.yml) を
資料ソース用の private リポジトリ（xkazuma/xkazuma-lectures）に置きます。push するとビルド・暗号化して、暗号文だけをこのリポジトリに push します。

## 運用上の注意

- **パスワードの強さがそのまま安全性です。** 暗号文と `vault.json` は誰でも取得でき、オフラインで総当たりできます。
  ランダムな 12 文字以上を推奨します（8 文字未満は拒否します）。
- **ある資料からユーザを外すとき**は、`course.json` から外したうえで、その資料の `keyVersion` を 1 つ上げてください。
  一度ログインした人はその資料の鍵を持っているので、外すだけでは足りません。鍵が変わった資料を見ていた人はログインし直しになります。
- ユーザ自体を全授業から失効させるときは、`LECTURE_MASTER_KEY` を作り直すのが確実です（全員ログインし直し）。
- パスワードの変更・ユーザの追加だけなら鍵はそのままで構いません。
- `LECTURE_MASTER_KEY` を固定すると、変更のないファイルは同じ暗号文になり、git の差分が変更分だけになります。
- ユーザ名は SHA-256 で照合するので、推測しやすいユーザ名は `vault.json` から存在を確かめられます。
  また、その授業で見られる資料が 1 つもないユーザは「ユーザ名またはパスワードが違います」と表示されます。
- 権限が分かれていても、同じ授業の資料はファイル数とサイズ（暗号文の大きさ）だけは誰にでも見えます。
- ログイン前にスライドの途中のページ（`/deck/5` など）を直接開くと 404 になります。授業トップかスライドのトップから入ってください。
- 必要なもの: HTTPS（または localhost）と Service Worker に対応したブラウザ。プライベートブラウズでは IndexedDB の制限で動かないことがあります。
