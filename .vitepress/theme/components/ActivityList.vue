<script setup lang="ts">
import { computed } from 'vue'
import { withBase } from 'vitepress'
import { data as activities } from '../../loaders/activities.data'

const props = defineProps<{ limit?: number; category?: string }>()

const labels: Record<string, string> = {
  research: '研究',
  business: '事業',
  teaching: '授業',
  private: 'プライベート',
}

const items = computed(() => {
  const list = props.category ? activities.filter((a) => a.category === props.category) : activities
  return props.limit ? list.slice(0, props.limit) : list
})
</script>

<template>
  <ul v-if="items.length" class="xk-list">
    <li v-for="a in items" :key="a.url">
      <div class="xk-meta">
        <time :datetime="a.date">{{ a.date }}</time>
        <span v-if="a.category" class="xk-tags"><span class="xk-tag">{{ labels[a.category] ?? a.category }}</span></span>
      </div>
      <a class="xk-title" :href="withBase(a.url)">{{ a.title }}</a>
      <p v-if="a.summary" class="xk-meta">{{ a.summary }}</p>
    </li>
  </ul>
  <p v-else class="xk-empty">まだ記録がありません。</p>
</template>
