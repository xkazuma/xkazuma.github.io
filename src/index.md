---
layout: home

hero:
  name: Kazuma Kusu
  text: 研究・事業・資料
  actions:
    - theme: brand
      text: About
      link: /about
    - theme: alt
      text: 活動ログ
      link: /activities/

features:
  - title: 研究
    details: 論文・発表・研究課題などの業績。researchmap の情報をもとに自動更新します。
    link: /research/
    linkText: 業績を見る
  - title: 活動ログ
    details: 研究活動・事業活動・授業などの日々の記録。
    link: /activities/
    linkText: ログを見る
  - title: 授業
    details: 担当授業の紹介と、受講者向けの限定公開資料。
    link: /teaching/
    linkText: 授業を見る
---

## 最近の活動

<ActivityList :limit="5" />
