<script setup lang="ts">
/**
 * CV ページの業績リスト。研究ページと同じ data/research/*.json を、CV 向けの書式（番号付き・1行引用）で表示する。
 */
import { data } from '../../loaders/research.data'

const cats = data.categories.filter((c) => c.items.length)
const fmt = (d?: string) => (d ? d.replace(/-/g, '/') : '')
</script>

<template>
  <template v-for="cat in cats" :key="cat.category">
    <h3 :id="`cv-${cat.category}`">{{ cat.label }}<span class="xk-meta">（{{ cat.items.length }}件）</span></h3>
    <ol class="xk-cv-pubs">
      <li v-for="(it, i) in cat.items" :key="i">
        <span v-if="it.authors?.length">{{ it.authors.join(', ') }}. </span>
        <a v-if="it.url" :href="it.url" target="_blank" rel="noopener">{{ it.title }}</a><span v-else>{{ it.title }}</span><span v-if="it.venue">. {{ it.venue }}</span><span v-if="it.date">, {{ fmt(it.date) }}</span>.
        <span v-if="it.note" class="xk-meta">［{{ it.note }}］</span>
      </li>
    </ol>
  </template>
  <p v-if="!cats.length" class="xk-empty">業績一覧を準備中です。</p>
</template>
