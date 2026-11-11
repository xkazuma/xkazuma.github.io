<script setup lang="ts">
import projects from '../../../data/projects.json'
import MaterialLinks from './MaterialLinks.vue'

// 研究プロジェクトごとの資料。data/projects.json の published: true の項目を、並び順のまま表示する。
const published = projects.filter((p) => p.published)
</script>

<template>
  <ul v-if="published.length" class="xk-list">
    <li v-for="p in published" :key="p.id">
      <!-- /projects/ 配下は VitePress 管轄外の静的ページ。target="_self" で通常遷移させる -->
      <a class="xk-title" :href="p.path" target="_self">{{ p.title }}</a>
      <span v-if="p.period" class="xk-tags"><span class="xk-tag">{{ p.period }}</span></span>
      <p v-if="p.description" class="xk-meta">{{ p.description }}</p>
      <MaterialLinks :path="p.path" />
    </li>
  </ul>
  <p v-else class="xk-empty">公開中の研究プロジェクト資料はまだありません。</p>
</template>
