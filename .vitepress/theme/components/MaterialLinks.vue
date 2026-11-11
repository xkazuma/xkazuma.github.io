<script setup lang="ts">
import { computed } from 'vue'
import { data as materials } from '../../loaders/materials.data'

// 資料置き場 1 つ分（授業・研究プロジェクト）の公開資料と限定公開資料へのリンク。
// public.json がまだない（CI が一度も出力していない）場合は、従来どおり資料置き場へのリンクだけを出す。
const props = defineProps<{ path: string }>()
const m = computed(() => materials[props.path])
const href = (dir: string) => `${props.path}${encodeURIComponent(dir)}/`
</script>

<template>
  <!-- /lectures/・/projects/ 配下は VitePress 管轄外の静的ページ。target="_self" で通常遷移させる -->
  <ul v-if="m && m.decks.length" class="xk-materials">
    <li v-for="d in m.decks" :key="d.dir">
      <a :href="href(d.dir)" target="_self">{{ d.title }}</a>
      <span class="xk-access xk-access-open">公開</span>
    </li>
  </ul>
  <p v-if="!m || m.restricted" class="xk-meta">
    <a :href="path" target="_self">限定公開の資料（ログインが必要）</a>
  </p>
</template>
