import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { api, type ItemPatch } from '../api/client'
import { useDomainsStore } from './domains'
import type { PendingItem, Priority } from '../types'

export type SortMode = 'manual' | 'priority'

const PRIORITY_WEIGHT: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

const SORT_KEY = 'tiny-pending-item:sort'
const SORT_MODES: SortMode[] = ['manual', 'priority']

function readSortMode(): SortMode {
  try {
    const raw = localStorage.getItem(SORT_KEY)
    return SORT_MODES.includes(raw as SortMode) ? (raw as SortMode) : 'manual'
  } catch {
    return 'manual'
  }
}

function persistSortMode(mode: SortMode): void {
  try {
    localStorage.setItem(SORT_KEY, mode)
  } catch {
    // 存储不可用时仅保留本次会话的选择（与主题偏好同类处理）
  }
}

export const useItemsStore = defineStore('items', () => {
  const domains = useDomainsStore()
  const items = ref<PendingItem[]>([])
  const filter = ref<string>('all')
  const loading = ref(false)
  const sortMode = ref<SortMode>(readSortMode())
  const search = ref('')
  const tagFilter = ref('')
  const selectedId = ref<number | null>(null)
  /** 回收站：软删除条目（按删除时间倒序），trashView 时主列表区整体切换为回收站视图 */
  const trash = ref<PendingItem[]>([])
  const trashView = ref(false)

  /** 排序方式为跨会话偏好，变化时落盘 */
  watch(sortMode, (mode) => persistSortMode(mode))

  /** 当前域范围内的条目：统计、标签与列表都基于它；activeId 为 null 即全部域 */
  const scoped = computed(() =>
    domains.activeId === null ? items.value : items.value.filter((item) => item.domainId === domains.activeId),
  )

  const total = computed(() => scoped.value.length)
  const remaining = computed(() => scoped.value.filter((item) => !item.done).length)
  const doneCount = computed(() => scoped.value.filter((item) => item.done).length)

  const availableTags = computed(() => {
    const tags = new Set<string>()
    for (const item of scoped.value) {
      for (const tag of item.tags) tags.add(tag)
    }
    return [...tags].sort()
  })

  const visible = computed(() => {
    let list = scoped.value
    if (filter.value !== 'all') {
      list = list.filter((item) => (filter.value === 'done' ? item.done : !item.done))
    }
    if (tagFilter.value) {
      list = list.filter((item) => item.tags.includes(tagFilter.value))
    }
    const keyword = search.value.trim().toLowerCase()
    if (keyword) {
      list = list.filter((item) => item.title.toLowerCase().includes(keyword))
    }
    if (sortMode.value === 'priority') {
      list = [...list].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]
      })
    }
    return list
  })

  /** 当前选中卡片，供右侧明细面板展示 */
  const selected = computed(() => items.value.find((item) => item.id === selectedId.value) ?? null)

  async function load(): Promise<void> {
    loading.value = true
    try {
      items.value = (await api.listItems()).items
    } finally {
      loading.value = false
    }
  }

  async function add(
    title: string,
    options: { domainId?: number; priority?: Priority; dueAt?: number | null; tags?: string[]; notes?: string } = {},
  ): Promise<void> {
    const result = await api.addItem(title, options)
    items.value.unshift(result.item)
  }

  async function update(id: number, patch: ItemPatch): Promise<void> {
    const result = await api.updateItem(id, patch)
    const index = items.value.findIndex((item) => item.id === id)
    if (index >= 0) {
      items.value[index] = result.item
    }
  }

  async function toggle(id: number): Promise<void> {
    const current = items.value.find((item) => item.id === id)
    if (!current) return
    await update(id, { done: !current.done })
  }

  async function togglePin(item: PendingItem): Promise<void> {
    await update(item.id, { pinned: !item.pinned })
  }

  async function remove(id: number): Promise<void> {
    await api.deleteItem(id)
    if (selectedId.value === id) {
      selectedId.value = null
    }
    items.value = items.value.filter((item) => item.id !== id)
    void refreshTrash()
  }

  /** 打开回收站：拉取列表并惰性清理超期条目（autoPurged>0 时由调用方提示） */
  async function loadTrash(): Promise<{ autoPurged: number }> {
    const { items: trashItems, autoPurged } = await api.listTrash()
    trash.value = trashItems
    return { autoPurged }
  }

  /** 仅刷新回收站计数（软删除后侧栏角标即时更新） */
  async function refreshTrash(): Promise<void> {
    try {
      trash.value = (await api.listTrash()).items
    } catch {
      // 计数刷新失败不打断主流程
    }
  }

  /** 进入/退出回收站视图；列表由 TrashList 组件挂载时拉取 */
  function toggleTrash(): void {
    trashView.value = !trashView.value
    if (trashView.value) {
      selectedId.value = null
    }
  }

  function exitTrash(): void {
    trashView.value = false
  }

  /** 恢复到原域原位置 */
  async function restoreFromTrash(id: number): Promise<void> {
    const { item } = await api.restoreItem(id)
    trash.value = trash.value.filter((row) => row.id !== id)
    items.value.unshift(item)
  }

  /** 彻底删除单条 */
  async function purgeFromTrash(id: number): Promise<void> {
    await api.purgeItem(id)
    trash.value = trash.value.filter((row) => row.id !== id)
  }

  /** 清空回收站，返回清除条数 */
  async function emptyTrash(): Promise<number> {
    const { purged } = await api.emptyTrash()
    trash.value = []
    return purged
  }

  /** 选中/再次点击取消选中，供明细面板使用 */
  function select(id: number): void {
    selectedId.value = selectedId.value === id ? null : id
  }

  function closeDetail(): void {
    selectedId.value = null
  }

  /** 拖拽结束后持久化手动顺序，并按服务端权威顺序刷新 */
  async function reorder(orderedIds: number[]): Promise<void> {
    await api.reorder(orderedIds)
    await load()
  }

  async function clearCompleted(): Promise<number> {
    const { removed } = await api.clearCompleted()
    items.value = items.value.filter((item) => !item.done)
    void refreshTrash()
    return removed
  }

  async function importItems(
    list: unknown[],
    domainList: unknown[] = [],
  ): Promise<{ imported: number; skipped: number }> {
    const result = await api.importItems(list, domainList)
    await load()
    return result
  }

  function reset(): void {
    // sortMode 是本地持久化偏好，不随会话重置
    items.value = []
    filter.value = 'all'
    search.value = ''
    tagFilter.value = ''
    selectedId.value = null
    trash.value = []
    trashView.value = false
  }

  return {
    items,
    filter,
    loading,
    sortMode,
    search,
    tagFilter,
    selectedId,
    trash,
    trashView,
    total,
    remaining,
    doneCount,
    availableTags,
    visible,
    selected,
    load,
    add,
    update,
    toggle,
    togglePin,
    remove,
    loadTrash,
    refreshTrash,
    toggleTrash,
    exitTrash,
    restoreFromTrash,
    purgeFromTrash,
    emptyTrash,
    reorder,
    clearCompleted,
    importItems,
    reset,
    select,
    closeDetail,
  }
})
