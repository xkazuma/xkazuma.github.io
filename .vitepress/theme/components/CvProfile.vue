<script setup lang="ts">
/**
 * CV ページ。data/profile.json（researchmap エクスポートから scripts/import-researchmap.mjs で生成）を表示する。
 */
import profile from '../../../data/profile.json'

type L = { ja?: string; en?: string }
type Period = { from?: string; to?: string }

const p = profile as Record<string, any>
const t = (v?: L) => v?.ja ?? v?.en ?? ''
const join = (...xs: (L | undefined)[]) => xs.map(t).filter(Boolean).join(' ')
const fmt = (d?: string) => (d ? d.replace(/-/g, '/') : '')
const span = (x: Period) => `${fmt(x.from)} – ${x.to === 'present' ? '現在' : fmt(x.to)}`
const has = (k: string) => Array.isArray(p[k]) && p[k].length > 0
</script>

<template>
  <div class="xk-cv">
    <section v-if="p.name || has('affiliations')" class="xk-cv-head">
      <p v-if="p.name" class="xk-cv-name">
        {{ p.name.ja }}<span v-if="p.name.en" class="xk-meta"> / {{ p.name.en }}</span>
      </p>
      <p v-for="(a, i) in p.affiliations" :key="i">{{ join(a.affiliation, a.section, a.job) }}</p>
    </section>

    <template v-if="has('researchInterests') || has('researchAreas')">
      <h2 id="research-fields">研究分野・キーワード</h2>
      <p v-if="has('researchInterests')" class="xk-tags xk-cv-tags">
        <span v-for="(k, i) in p.researchInterests" :key="i" class="xk-tag">{{ t(k) }}</span>
      </p>
      <ul v-if="has('researchAreas')">
        <li v-for="(a, i) in p.researchAreas" :key="i">{{ t(a.discipline) }} / {{ t(a.field) }}</li>
      </ul>
    </template>

    <template v-if="has('experience')">
      <h2 id="experience">経歴</h2>
      <table class="xk-cv-table">
        <tr v-for="(e, i) in p.experience" :key="i">
          <th>{{ span(e) }}</th>
          <td>{{ join(e.affiliation, e.section, e.job) }}</td>
        </tr>
      </table>
    </template>

    <template v-if="has('education')">
      <h2 id="education">学歴</h2>
      <table class="xk-cv-table">
        <tr v-for="(e, i) in p.education" :key="i">
          <th>{{ span(e) }}</th>
          <td>{{ join(e.affiliation, e.department, e.course) }}</td>
        </tr>
      </table>
    </template>

    <template v-if="has('degrees')">
      <h2 id="degrees">学位</h2>
      <table class="xk-cv-table">
        <tr v-for="(d, i) in p.degrees" :key="i">
          <th>{{ fmt(d.date) }}</th>
          <td>{{ t(d.degree) }}<span class="xk-meta">（{{ t(d.institution) }}）</span></td>
        </tr>
      </table>
    </template>

    <template v-if="has('teaching')">
      <h2 id="teaching">担当経験のある科目</h2>
      <table class="xk-cv-table">
        <tr v-for="(c, i) in p.teaching" :key="i">
          <th>{{ span(c) }}</th>
          <td>{{ t(c.subject) }}<span class="xk-meta">（{{ t(c.institution) }}）</span></td>
        </tr>
      </table>
    </template>

    <template v-if="has('committees')">
      <h2 id="committees">委員歴</h2>
      <table class="xk-cv-table">
        <tr v-for="(c, i) in p.committees" :key="i">
          <th>{{ span(c) }}</th>
          <td>{{ join(c.name, c.association) }}</td>
        </tr>
      </table>
    </template>

    <template v-if="has('memberships')">
      <h2 id="memberships">所属学協会</h2>
      <ul>
        <li v-for="(m, i) in p.memberships" :key="i">{{ t(m) }}</li>
      </ul>
    </template>

    <p v-if="!p.name && !has('experience')" class="xk-empty">プロフィールを準備中です。</p>
  </div>
</template>
