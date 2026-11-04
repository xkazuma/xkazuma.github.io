---
layout: home

hero:
  name: Kazuma Kusu
  actions:
    - theme: brand
      text: About
      link: /about
    - theme: alt
      text: 活動ログ
      link: /activities/

features:
  - title: 研究
    details: 論文・発表・研究課題などの業績。researchmap に掲載している内容をまとめています。
    link: /research/
    linkText: 業績を見る
  - title: 事業
    details: 事業活動の紹介と記録。
    link: /business/
    linkText: 事業を見る
  - title: 資料
    details: 授業資料など。受講者向けの限定公開資料もここから閲覧できます。
    link: /teaching/
    linkText: 資料を見る
---

## 最近の活動

<ActivityList :limit="5" />
