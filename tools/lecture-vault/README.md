# lecture-vault

GitHub Pages（サーバ側の認証がない静的ホスティング）で、授業資料（Slidev の SPA ビルドなど）を
**ユーザ名・パスワードを知っている人だけが閲覧できる**ように公開するための仕組みです。

公開リポジトリと Pages に置かれるのは暗号文だけです。平文の資料はこのリポジトリにコミットしません。

## しくみ

```
/lectures/<course>/
├── index.html, <deck>/index.html   ログイン画面（平文。資料の中身は含まない）
├── sw.js                           復号用 Service Worker（scope = /lectures/<course>/）
├── vault.json                      ユーザごとのキースロット
└── _v/<hmac>                       暗号化されたファイル本体（ファイル名も秘匿）
```

1. `encrypt.mjs` が授業ごとにランダムな鍵（または `LECTURE_MASTER_KEY`）で全ファイルを AES-256-GCM で暗号化します。
   ファイル名は HMAC で置き換えるので、どんなスライドや画像があるかも分かりません。
2. ユーザごとに、`ユーザ名 + パスワード` から PBKDF2-SHA256（60 万回）で作った鍵で授業の鍵を包み、`vault.json` に入れます。
3. 閲覧者がログインすると、ブラウザ内で授業の鍵を取り出し、取り出し不可（non-extractable）の鍵として IndexedDB に保存します。
4. Service Worker が `/lectures/<course>/` 配下へのリクエストを横取りし、対応する暗号文を取得・復号して返します。
   Slidev の SPA はそのまま動きます（`/deck/5` のようなルートは `deck/index.html` にフォールバック）。

ログアウトは `/lectures/<course>/?logout` を開きます（授業トップの一覧ページにリンクがあります）。

## 使い方

```sh
# Slidev をサブパス付きでビルド（base は最終的な公開パスと一致させる）
npx slidev build slides.md --base /lectures/course-a/intro/ --out build/course-a/intro

# 授業単位で暗号化
LECTURE_USERS='{"student":"long-random-password"}' \
LECTURE_MASTER_KEY="$(cat master.key)" \
node tools/lecture-vault/encrypt.mjs \
  --in build/course-a --out src/public/lectures/course-a \
  --base /lectures/course-a/ --title "授業名"
```

- `--in` 直下に `index.html` がなければ、配下のスライド一覧ページを自動で作って一緒に暗号化します。
- `LECTURE_USERS` の代わりに `--users users.json` も使えます（このファイルはコミットしないこと）。
- 出力先は VitePress の `src/public/lectures/` です。ビルド時に `/lectures/` へそのままコピーされます。

CI で自動化する場合は [`examples/lectures-repo-publish.yml`](examples/lectures-repo-publish.yml) を
資料ソース用の private リポジトリに置きます。push するとビルド・暗号化して、暗号文だけをこのリポジトリに push します。

## 運用上の注意

- **パスワードの強さがそのまま安全性です。** 暗号文と `vault.json` は誰でも取得でき、オフラインで総当たりできます。
  ランダムな 12 文字以上を推奨します（8 文字未満は拒否します）。
- **ユーザの失効には鍵の作り直しが必要です。** 一度ログインした人は授業の鍵を持っているので、
  `LECTURE_USERS` から消すだけでは足りません。`LECTURE_MASTER_KEY` を作り直して再暗号化してください（全員ログインし直しになります）。
- パスワードの変更・追加だけなら `LECTURE_MASTER_KEY` はそのままで構いません。
- `LECTURE_MASTER_KEY` を固定すると、変更のないファイルは同じ暗号文になり、git の差分が変更分だけになります。
- ユーザ名は SHA-256 で照合するので、推測しやすいユーザ名は `vault.json` から存在を確かめられます。秘密にしたい情報はパスワード側に持たせてください。
- ログイン前にスライドの途中のページ（`/deck/5` など）を直接開くと 404 になります。授業トップかスライドのトップから入ってください。
- 必要なもの: HTTPS（または localhost）と Service Worker に対応したブラウザ。プライベートブラウズでは IndexedDB の制限で動かないことがあります。
