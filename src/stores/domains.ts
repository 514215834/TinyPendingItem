import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { api } from '../api/client'
import type { Domain } from '../types'

const ACTIVE_KEY = 'tiny-pending-item:domain'

function readActiveId(): number | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY)
    if (!raw) return null
    const value = Number.parseInt(raw, 10)
    return Number.isInteger(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

function persistActiveId(id: number | null): void {
  try {
    if (id === null) {
      localStorage.removeItem(ACTIVE_KEY)
    } else {
      localStorage.setItem(ACTIVE_KEY, String(id))
    }
  } catch {
    // 存储不可用时仅保留本次会话的选择（与排序方式同类处理）
  }
}

/**
 * 域：按场景（工作/生活/学习…）隔离待办。
 * activeId 为 null 表示“全部域”；选择跨会话持久化。
 */
export const useDomainsStore = defineStore('domains', () => {
  const list = ref<Domain[]>([])
  const activeId = ref<number | null>(readActiveId())

  /** 选择为跨会话偏好，变化时落盘 */
  watch(activeId, (id) => persistActiveId(id))

  const active = computed<Domain | null>(
    () => list.value.find((row) => row.id === activeId.value) ?? null,
  )

  const domainOptions = computed(() =>
    list.value.map((row) => ({ label: `${row.emoji} ${row.name}`, value: row.id })),
  )

  async function load(): Promise<void> {
    list.value = (await api.listDomains()).domains
    // 持久化的选择可能指向已删除的域，回退到“全部”
    if (activeId.value !== null && !list.value.some((row) => row.id === activeId.value)) {
      activeId.value = null
    }
  }

  async function add(name: string, emoji: string): Promise<void> {
    const { domain } = await api.addDomain(name, emoji)
    list.value = [...list.value, domain]
  }

  async function rename(id: number, name: string): Promise<void> {
    const { domain } = await api.updateDomain(id, { name })
    list.value = list.value.map((row) => (row.id === id ? domain : row))
  }

  async function setEmoji(id: number, emoji: string): Promise<void> {
    const { domain } = await api.updateDomain(id, { emoji })
    list.value = list.value.map((row) => (row.id === id ? domain : row))
  }

  async function remove(id: number): Promise<void> {
    await api.deleteDomain(id)
    list.value = list.value.filter((row) => row.id !== id)
    if (activeId.value === id) activeId.value = null
  }

  function reset(): void {
    list.value = []
  }

  return { list, activeId, active, domainOptions, load, add, rename, setEmoji, remove, reset }
})
