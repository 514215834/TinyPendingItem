import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, type ItemPatch } from '../api/client'
import type { PendingItem, Priority } from '../types'

export type SortMode = 'manual' | 'priority'

const PRIORITY_WEIGHT: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

export const useItemsStore = defineStore('items', () => {
  const items = ref<PendingItem[]>([])
  const filter = ref<string>('all')
  const loading = ref(false)
  const sortMode = ref<SortMode>('manual')
  const search = ref('')
  const tagFilter = ref('')
  const selectedId = ref<number | null>(null)

  const total = computed(() => items.value.length)
  const remaining = computed(() => items.value.filter((item) => !item.done).length)
  const doneCount = computed(() => items.value.filter((item) => item.done).length)

  const availableTags = computed(() => {
    const tags = new Set<string>()
    for (const item of items.value) {
      for (const tag of item.tags) tags.add(tag)
    }
    return [...tags].sort()
  })

  const visible = computed(() => {
    let list = items.value
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
    options: { priority?: Priority; dueAt?: number | null; tags?: string[]; notes?: string } = {},
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
    return removed
  }

  async function importItems(list: unknown[]): Promise<{ imported: number; skipped: number }> {
    const result = await api.importItems(list)
    await load()
    return result
  }

  function reset(): void {
    items.value = []
    filter.value = 'all'
    sortMode.value = 'manual'
    search.value = ''
    tagFilter.value = ''
    selectedId.value = null
  }

  return {
    items,
    filter,
    loading,
    sortMode,
    search,
    tagFilter,
    selectedId,
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
    reorder,
    clearCompleted,
    importItems,
    reset,
    select,
    closeDetail,
  }
})
