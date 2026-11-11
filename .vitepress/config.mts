import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { defineConfig, type HeadConfig } from 'vitepress'

// Google アナリティクス (GA4)。測定ID (G-XXXXXXXXXX) はビルド時の環境変数 GA_MEASUREMENT_ID から読む。
// 本番ビルドでは GitHub のリポジトリ変数 GA_MEASUREMENT_ID を deploy.yml が渡す。未設定ならタグを出力しない。
// VitePress のページ遷移（history.pushState）は GA4 の拡張計測「ブラウザの履歴イベントに基づくページの変更」で計測される。
// /lectures/（授業資料）と /projects/（研究プロジェクトの資料）には VitePress の <head> が入らないため、
// 同じ測定IDを使う /lectures/analytics.js と /projects/analytics.js を buildEnd で書き出し、
// ログイン画面・Service Worker（復号したページに差し込む）・公開資料の HTML から読み込ませる。
const gaId = process.env.GA_MEASUREMENT_ID?.trim()
const gaHead: HeadConfig[] = gaId && /^G-[A-Z0-9]+$/.test(gaId)
  ? [
      ['script', { async: '', src: `https://www.googletagmanager.com/gtag/js?id=${gaId}` }],
      ['script', {}, `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`],
    ]
  : []

// 授業資料用の計測スクリプト。測定ID未設定なら何もしない空のスクリプトになる。
const lecturesAnalyticsJs = gaHead.length
  ? `// 授業資料ページ用 Google アナリティクス（.vitepress/config.mts が生成）
(() => {
  const id = ${JSON.stringify(gaId)};
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', id);
})();
`
  : '// Google アナリティクスの測定ID が未設定のため、何もしない\n'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: 'ja-JP',
  title: 'xkzm.me',
  description: 'Kazuma Kusu のポートフォリオ：研究・事業・資料',
  srcDir: 'src',
  cleanUrls: true,
  lastUpdated: true,
  // 授業資料・研究プロジェクトの資料 (Slidev SPA など) は src/public/lectures/・src/public/projects/ 配下に
  // 静的ファイルとして置く。VitePress の Markdown ページではないため、デッドリンク判定から除外する。
  ignoreDeadLinks: [/^\/(lectures|projects)(\/|$)/],
  head: [
    ['meta', { name: 'theme-color', content: '#3f6f8f' }],
    ...gaHead,
  ],
  async buildEnd(siteConfig) {
    for (const dir of ['lectures', 'projects']) {
      const target = path.join(siteConfig.outDir, dir, 'analytics.js')
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, lecturesAnalyticsJs)
    }
  },
  themeConfig: {
    siteTitle: 'xkzm.me',
    nav: [
      { text: 'About', link: '/about' },
      { text: 'CV', link: '/cv' },
      { text: '研究', link: '/research/', activeMatch: '^/research/' },
      { text: '更新ログ', link: '/activities/', activeMatch: '^/activities/' },
      { text: '資料・成果物', link: '/teaching/', activeMatch: '^/teaching/' },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/xkazuma' },
      {
        icon: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>researchmap</title><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><text x="12" y="16" font-size="10" text-anchor="middle" fill="currentColor" font-family="sans-serif" font-weight="700">R</text></svg>' },
        link: 'https://researchmap.jp/xkzm',
        ariaLabel: 'researchmap',
      },
    ],
    outline: { label: '目次' },
    docFooter: { prev: '前へ', next: '次へ' },
    lastUpdated: { text: '最終更新' },
    darkModeSwitchLabel: '外観',
    sidebarMenuLabel: 'メニュー',
    returnToTopLabel: 'トップへ戻る',
    footer: {
      copyright: '© Kazuma Kusu',
    },
  },
})
