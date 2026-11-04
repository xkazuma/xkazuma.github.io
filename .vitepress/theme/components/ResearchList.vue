<script setup lang="ts">
import { data } from '../../loaders/research.data'

const total = data.categories.reduce((n, c) => n + c.items.length, 0)
const updated = data.updatedAt
  ? new Date(data.updatedAt).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })
  : ''
</script>

<template>
  <p class="xk-meta">
    出典: <a :href="data.source" target="_blank" rel="noopener">researchmap</a>
    <template v-if="updated"> ・ 最終更新 {{ updated }}</template>
  </p>
  <p v-if="total === 0" class="xk-empty">
    業績一覧は準備中です。最新の業績は researchmap をご覧ください。
  </p>
  <template v-for="cat in data.categories" :key="cat.category">
    <section v-if="cat.items.length">
      <h2 :id="cat.category">{{ cat.label }}</h2>
      <ul class="xk-list">
        <li v-for="(it, i) in cat.items" :key="i">
          <a v-if="it.url" class="xk-title" :href="it.url" target="_blank" rel="noopener">{{ it.title }}</a>
          <span v-else class="xk-title">{{ it.title }}</span>
          <div class="xk-meta">
            <span v-if="it.authors?.length">{{ it.authors.join(', ') }}</span>
            <span v-if="it.venue"> ・ {{ it.venue }}</span>
            <span v-if="it.date"> ・ {{ it.date }}</span>
            <span v-if="it.note"> ・ {{ it.note }}</span>
          </div>
        </li>
      </ul>
    </section>
  </template>
</template>
