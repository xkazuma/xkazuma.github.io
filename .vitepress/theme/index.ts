import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import ActivityList from './components/ActivityList.vue'
import ResearchList from './components/ResearchList.vue'
import CourseList from './components/CourseList.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ActivityList', ActivityList)
    app.component('ResearchList', ResearchList)
    app.component('CourseList', CourseList)
  },
} satisfies Theme
