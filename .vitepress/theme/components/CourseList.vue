<script setup lang="ts">
import courses from '../../../data/courses.json'

const published = courses.filter((c) => c.published)
</script>

<template>
  <ul v-if="published.length" class="xk-list">
    <li v-for="c in published" :key="c.id">
      <!-- /lectures/ 配下は VitePress 管轄外の静的ページ（暗号化済み資料）。
           target="_self" でクライアントルーターを通さず通常遷移させる -->
      <a class="xk-title" :href="c.path" target="_self">{{ c.title }}</a>
      <span class="xk-tags"><span class="xk-tag">{{ c.term }}</span></span>
      <p v-if="c.description" class="xk-meta">{{ c.description }}</p>
    </li>
  </ul>
  <p v-else class="xk-empty">公開中の授業資料はまだありません。</p>
</template>
