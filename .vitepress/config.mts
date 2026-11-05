import { defineConfig, type HeadConfig } from 'vitepress'

// Google アナリティクス (GA4)。測定ID (G-XXXXXXXXXX) はビルド時の環境変数 GA_MEASUREMENT_ID から読む。
// 本番ビルドでは GitHub のリポジトリ変数 GA_MEASUREMENT_ID を deploy.yml が渡す。未設定ならタグを出力しない。
// VitePress のページ遷移（history.pushState）は GA4 の拡張計測「ブラウザの履歴イベントに基づくページの変更」で計測される。
// /lectures/ 配下の授業資料は VitePress の管轄外の静的ファイルなので、このタグは入らない（計測対象外）。
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

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: 'ja-JP',
  title: 'xkzm.me',
  description: 'Kazuma Kusu のポートフォリオ：研究・事業・資料',
  srcDir: 'src',
  cleanUrls: true,
  lastUpdated: true,
  // 暗号化済みの授業資料 (Slidev SPA) は src/public/lectures/ 配下に静的ファイルとして置く。
  // VitePress の Markdown ページではないため、デッドリンク判定から除外する。
  ignoreDeadLinks: [/^\/lectures(\/|$)/],
  head: [
    ['meta', { name: 'theme-color', content: '#3f6f8f' }],
    ...gaHead,
  ],
  themeConfig: {
    siteTitle: 'xkzm.me',
    nav: [
      { text: 'About', link: '/about' },
      { text: 'CV', link: '/cv' },
      { text: '研究', link: '/research/', activeMatch: '^/research/' },
      { text: '活動ログ', link: '/activities/', activeMatch: '^/activities/' },
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
