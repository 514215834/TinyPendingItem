import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

const THEME_KEY = 'tiny-pending-item:theme'
const ACCENT_KEY = 'tiny-pending-item:accent'

export interface AccentPreset {
  key: string
  label: string
  primary: string
  hover: string
  pressed: string
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { key: 'green', label: '翠绿', primary: '#18a058', hover: '#36ad6a', pressed: '#0c7a43' },
  { key: 'blue', label: '晴蓝', primary: '#3f7cf6', hover: '#5c93ff', pressed: '#2b5fd0' },
  { key: 'purple', label: '黛紫', primary: '#8b5cf6', hover: '#a178f8', pressed: '#6d46d9' },
  { key: 'orange', label: '暖橙', primary: '#f08c00', hover: '#ffa940', pressed: '#d37200' },
  { key: 'rose', label: '蔷薇', primary: '#eb2f96', hover: '#ff5cb1', pressed: '#c9207f' },
]

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function persist(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 存储不可用时仅保留本次会话的选择
  }
}

export const useThemeStore = defineStore('theme', () => {
  const dark = ref(readStored(THEME_KEY) === 'dark')
  const primary = ref(readStored(ACCENT_KEY) ?? 'green')

  const accent = computed(
    () => ACCENT_PRESETS.find((preset) => preset.key === primary.value) ?? ACCENT_PRESETS[0],
  )

  function toggle(): void {
    dark.value = !dark.value
    persist(THEME_KEY, dark.value ? 'dark' : 'light')
  }

  function setPrimary(key: string): void {
    primary.value = key
    persist(ACCENT_KEY, key)
  }

  return { dark, toggle, primary, accent, setPrimary }
})
