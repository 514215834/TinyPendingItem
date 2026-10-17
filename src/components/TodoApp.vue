<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import {
  CheckmarkCircleOutline,
  CloudUploadOutline,
  ColorPaletteOutline,
  DownloadOutline,
  LogOutOutline,
  MoonOutline,
  PricetagsOutline,
  ReorderFourOutline,
  SunnyOutline,
  TimeOutline,
} from '@vicons/ionicons5'
import { useAuthStore } from '../stores/auth'
import { useItemsStore } from '../stores/items'
import { useThemeStore } from '../stores/theme'
import { api } from '../api/client'
import AddTodo from './AddTodo.vue'
import TodoList from './TodoList.vue'
import TodoDetail from './TodoDetail.vue'
import UserAvatar from './UserAvatar.vue'
import SettingsDialog from './SettingsDialog.vue'

const auth = useAuthStore()
const items = useItemsStore()
const theme = useThemeStore()
const message = useMessage()

const fileInput = ref<HTMLInputElement | null>(null)
const addTodoRef = ref<InstanceType<typeof AddTodo> | null>(null)
const settingsOpen = ref(false)

onMounted(() => {
  items.reset()
  void items.load()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

/** 全局快捷键：N 新建 · 1/2/3 筛选 · / 搜索 · Esc 关闭明细；其余快捷键在输入框聚焦时不响应 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    items.closeDetail()
    return
  }
  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return

  if (event.key === 'n' || event.key === 'N') {
    event.preventDefault()
    addTodoRef.value?.open()
  } else if (event.key === '/') {
    event.preventDefault()
    document.querySelector<HTMLInputElement>('#search-input input')?.focus()
  } else if (event.key === '1') {
    items.filter = 'all'
  } else if (event.key === '2') {
    items.filter = 'active'
  } else if (event.key === '3') {
    items.filter = 'done'
  } else if (event.key === 'Escape') {
    items.closeDetail()
  }
}

async function exportJson(): Promise<void> {
  try {
    const payload = await api.exportItems()
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `tiny-pending-item-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    message.success(`已导出 ${payload.items.length} 条待办`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '导出失败，请稍后再试')
  }
}

async function onImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const parsed: unknown = JSON.parse(await file.text())
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items)
        ? (parsed as { items: unknown[] }).items
        : null
    if (!list) {
      message.error('文件格式不正确：需为待办数组或包含 items 字段')
      return
    }
    const { imported, skipped } = await items.importItems(list)
    message.success(`导入完成：成功 ${imported} 条${skipped > 0 ? `，跳过 ${skipped} 条` : ''}`)
  } catch (error) {
    if (error instanceof SyntaxError) {
      message.error('文件不是合法的 JSON')
      return
    }
    message.error(error instanceof Error ? error.message : '导入失败，请稍后再试')
  }
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <h1 class="app-title">TinyPendingItem</h1>
      </div>

      <div class="side-stats">
        <div class="stat">
          <span class="stat-num">{{ items.total }}</span>
          <span class="stat-label">全部</span>
        </div>
        <div class="stat">
          <span class="stat-num accent">{{ items.remaining }}</span>
          <span class="stat-label">待办</span>
        </div>
        <div class="stat">
          <span class="stat-num">{{ items.doneCount }}</span>
          <span class="stat-label">已完成</span>
        </div>
      </div>

      <nav class="side-nav">
        <button class="nav-item" :class="{ active: items.filter === 'all' }" @click="items.filter = 'all'">
          <span class="nav-label"><n-icon :component="ReorderFourOutline" />全部</span>
          <span class="nav-count">{{ items.total }}</span>
        </button>
        <button class="nav-item" :class="{ active: items.filter === 'active' }" @click="items.filter = 'active'">
          <span class="nav-label"><n-icon :component="TimeOutline" />进行中</span>
          <span class="nav-count">{{ items.remaining }}</span>
        </button>
        <button class="nav-item" :class="{ active: items.filter === 'done' }" @click="items.filter = 'done'">
          <span class="nav-label"><n-icon :component="CheckmarkCircleOutline" />已完成</span>
          <span class="nav-count">{{ items.doneCount }}</span>
        </button>
      </nav>

      <div v-if="items.availableTags.length > 0" class="side-tags">
        <p class="side-heading"><n-icon :component="PricetagsOutline" />标签</p>
        <div class="tag-chips">
          <button
            v-for="tag in items.availableTags"
            :key="tag"
            class="tag-chip"
            :class="{ active: items.tagFilter === tag }"
            @click="items.tagFilter = items.tagFilter === tag ? '' : tag"
          >
            {{ tag }}
          </button>
        </div>
      </div>

      <div class="side-foot">
        <button type="button" class="avatar-entry" title="个性化设置" @click="settingsOpen = true">
          <UserAvatar v-if="auth.user" :user="auth.user" :size="34" />
          <span class="foot-name">{{ auth.user?.username }}</span>
        </button>
        <div class="foot-actions">
          <n-tooltip>
            <template #trigger>
              <n-button quaternary circle size="small" @click="settingsOpen = true">
                <n-icon :component="ColorPaletteOutline" />
              </n-button>
            </template>
            个性化
          </n-tooltip>
          <n-tooltip>
            <template #trigger>
              <n-button quaternary circle size="small" @click="exportJson">
                <n-icon :component="DownloadOutline" />
              </n-button>
            </template>
            导出 JSON
          </n-tooltip>
          <n-tooltip>
            <template #trigger>
              <n-button quaternary circle size="small" @click="fileInput?.click()">
                <n-icon :component="CloudUploadOutline" />
              </n-button>
            </template>
            导入 JSON
          </n-tooltip>
          <n-tooltip>
            <template #trigger>
              <n-button quaternary circle size="small" @click="theme.toggle()">
                <n-icon :component="theme.dark ? SunnyOutline : MoonOutline" />
              </n-button>
            </template>
            {{ theme.dark ? '切换浅色' : '切换深色' }}
          </n-tooltip>
          <n-tooltip>
            <template #trigger>
              <n-button quaternary circle size="small" type="error" @click="auth.logout()">
                <n-icon :component="LogOutOutline" />
              </n-button>
            </template>
            退出登录
          </n-tooltip>
        </div>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          class="hidden-file"
          @change="onImportFile"
        />
      </div>

      <SettingsDialog v-model:show="settingsOpen" />
    </aside>

    <main class="main">
      <div class="main-inner">
        <div class="list-column">
          <AddTodo ref="addTodoRef" />
          <TodoList />
          <p class="shortcut-hint">快捷键：N 新建 · 1/2/3 切换筛选 · / 搜索 · 双击编辑 · Esc 关闭明细</p>
        </div>
        <TodoDetail />
      </div>
    </main>
  </div>
</template>
