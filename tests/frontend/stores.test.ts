import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Priority } from '../../src/types'

vi.mock('../../src/api/client', () => {
  interface Row {
    id: number
    userId: number
    title: string
    notes: string
    done: boolean
    createdAt: number
    doneAt: number | null
    priority: Priority
    dueAt: number | null
    tags: string[]
    pinned: boolean
  }

  let seq = 1
  const rows: Row[] = []

  return {
    setUnauthorizedHandler: () => {},
    getToken: () => 'mock-token',
    setToken: () => {},
    api: {
      register: async (username: string) => ({ token: `token:${username}`, user: { id: 1, username } }),
      login: async (username: string) => ({ token: `token:${username}`, user: { id: 1, username } }),
      me: async () => ({ user: { id: 1, username: 'alice' } }),
      updateAvatar: async (avatar: unknown) => ({
        user: { id: 1, username: 'alice', avatar: JSON.stringify(avatar) },
      }),
      listItems: async () => ({ items: [...rows] }),
      addItem: async (
        title: string,
        options: { priority?: Priority; dueAt?: number | null; tags?: string[]; notes?: string } = {},
      ) => {
        const item: Row = {
          id: seq++,
          userId: 1,
          title,
          notes: options.notes ?? '',
          done: false,
          createdAt: Date.now() + seq,
          doneAt: null,
          priority: options.priority ?? 'medium',
          dueAt: options.dueAt ?? null,
          tags: options.tags ?? [],
          pinned: false,
        }
        rows.push(item)
        return { item }
      },
      updateItem: async (id: number, patch: Record<string, unknown>) => {
        const item = rows.find((row) => row.id === id)
        if (!item) throw new Error('条目不存在')
        if (typeof patch.done === 'boolean') {
          item.done = patch.done
          item.doneAt = patch.done ? Date.now() : null
        }
        if (typeof patch.title === 'string') item.title = patch.title
        if (typeof patch.notes === 'string') item.notes = patch.notes
        if (patch.priority === 'high' || patch.priority === 'medium' || patch.priority === 'low') {
          item.priority = patch.priority
        }
        if ('dueAt' in patch) item.dueAt = (patch.dueAt as number | null) ?? null
        if (Array.isArray(patch.tags)) item.tags = patch.tags as string[]
        if (typeof patch.pinned === 'boolean') item.pinned = patch.pinned
        return { item }
      },
      deleteItem: async (id: number) => {
        const index = rows.findIndex((row) => row.id === id)
        rows.splice(index, 1)
      },
      reorder: async (orderedIds: number[]) => {
        const byId = new Map(rows.map((row) => [row.id, row]))
        const next: Row[] = []
        for (const id of orderedIds) {
          const row = byId.get(id)
          if (row) next.push(row)
        }
        rows.length = 0
        rows.push(...next)
        return { updated: orderedIds.length }
      },
      clearCompleted: async () => {
        const before = rows.length
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].done) rows.splice(i, 1)
        }
        return { removed: before - rows.length }
      },
      exportItems: async () => ({
        app: 'tiny-pending-item',
        version: 1,
        exportedAt: Date.now(),
        items: [...rows],
      }),
      importItems: async (list: unknown[]) => {
        let imported = 0
        let skipped = 0
        for (const raw of list) {
          const record = (raw ?? {}) as { title?: string }
          if (!record.title || !record.title.trim()) {
            skipped++
            continue
          }
          rows.push({
            id: seq++,
            userId: 1,
            title: record.title.trim(),
            notes: '',
            done: false,
            createdAt: Date.now() + seq,
            doneAt: null,
            priority: 'medium',
            dueAt: null,
            tags: [],
            pinned: false,
          })
          imported++
        }
        return { imported, skipped }
      },
    },
  }
})

import { useAuthStore } from '../../src/stores/auth'
import { useItemsStore } from '../../src/stores/items'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('待办 store：基础行为', () => {
  it('添加条目后统计与筛选正确', async () => {
    const store = useItemsStore()
    await store.add('第一条')
    await store.add('第二条')

    expect(store.total).toBe(2)
    expect(store.remaining).toBe(2)
    expect(store.visible[0].title).toBe('第二条')
  })

  it('勾选完成后条目计入已完成，可撤销', async () => {
    const store = useItemsStore()
    await store.add('任务')
    const item = store.items[0]

    await store.toggle(item.id)
    expect(item.done).toBe(true)
    expect(store.remaining).toBe(0)

    store.filter = 'done'
    expect(store.visible).toHaveLength(1)

    store.filter = 'active'
    expect(store.visible).toHaveLength(0)

    await store.toggle(item.id)
    expect(store.items[0].done).toBe(false)
    expect(store.items[0].doneAt).toBeNull()
  })

  it('删除条目后列表更新', async () => {
    const store = useItemsStore()
    await store.add('会留下的')
    await store.add('会被删除的')
    const doomed = store.items.find((item) => item.title === '会被删除的')
    if (!doomed) throw new Error('待删除条目不存在')
    await store.remove(doomed.id)

    expect(store.total).toBe(1)
    expect(store.items[0].title).toBe('会留下的')
  })
})

describe('待办 store：编辑、优先级、标签、搜索、清理', () => {
  it('优先级排序：置顶最前，其余按高→中→低', async () => {
    const store = useItemsStore()
    await store.add('低优先', { priority: 'low' })
    await store.add('高优先', { priority: 'high' })
    await store.add('中优先', { priority: 'medium' })
    await store.add('置顶项', { priority: 'low' })
    const pinned = store.items.find((item) => item.title === '置顶项')
    if (!pinned) throw new Error('置顶条目不存在')
    await store.togglePin(pinned)

    store.sortMode = 'priority'
    expect(store.visible.map((item) => item.title)).toEqual(['置顶项', '高优先', '中优先', '低优先'])
  })

  it('搜索与标签过滤', async () => {
    const store = useItemsStore()
    await store.add('买菜', { tags: ['生活'] })
    await store.add('写周报', { tags: ['工作'] })

    store.search = '买'
    expect(store.visible.map((item) => item.title)).toEqual(['买菜'])

    store.search = ''
    store.tagFilter = '工作'
    expect(store.visible.map((item) => item.title)).toEqual(['写周报'])
    expect(store.availableTags).toEqual(['工作', '生活'])

    store.tagFilter = ''
    expect(store.visible).toHaveLength(2)
  })

  it('行内更新标题、优先级、截止日期与标签，并可切换置顶', async () => {
    const store = useItemsStore()
    await store.add('原始')
    const item = store.items[0]

    await store.update(item.id, {
      title: '改名',
      priority: 'high',
      dueAt: 1700000000000,
      tags: ['新标签'],
    })
    expect(store.items[0].title).toBe('改名')
    expect(store.items[0].priority).toBe('high')
    expect(store.items[0].dueAt).toBe(1700000000000)
    expect(store.items[0].tags).toEqual(['新标签'])

    await store.togglePin(store.items[0])
    expect(store.items[0].pinned).toBe(true)
    await store.togglePin(store.items[0])
    expect(store.items[0].pinned).toBe(false)
  })

  it('一键清除已完成', async () => {
    const store = useItemsStore()
    await store.add('保留')
    await store.add('清除')
    const target = store.items.find((item) => item.title === '清除')
    if (!target) throw new Error('待完成条目不存在')
    await store.toggle(target.id)

    const removed = await store.clearCompleted()
    expect(removed).toBe(1)
    expect(store.total).toBe(1)
    expect(store.items[0].title).toBe('保留')
  })

  it('选中卡片供明细面板展示，再次点击或关闭后取消', async () => {
    const store = useItemsStore()
    await store.add('甲')
    await store.add('乙')
    const first = store.items.find((item) => item.title === '甲')
    if (!first) throw new Error('条目不存在')

    store.select(first.id)
    expect(store.selected?.id).toBe(first.id)

    await store.update(first.id, { notes: '新的明细内容' })
    expect(store.selected?.notes).toBe('新的明细内容')

    store.select(first.id)
    expect(store.selected).toBeNull()

    store.select(first.id)
    store.closeDetail()
    expect(store.selected).toBeNull()
  })
})

describe('认证 store', () => {
  it('登录后进入已认证状态，退出后清除', async () => {
    const auth = useAuthStore()
    expect(auth.isAuthenticated).toBe(false)

    await auth.login('alice', 'password123')
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.user?.username).toBe('alice')
    expect(auth.token).toBe('token:alice')

    auth.logout()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.user).toBeNull()
    expect(auth.token).toBeNull()
  })

  it('注册同样建立会话', async () => {
    const auth = useAuthStore()
    await auth.register('bob', 'password123')
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.user?.username).toBe('bob')
  })

  it('更新头像同步到当前用户', async () => {
    const auth = useAuthStore()
    await auth.login('alice', 'password123')
    await auth.updateAvatar({ emoji: '🦊', color: '#8b5cf6' })
    expect(auth.user?.avatar).toContain('🦊')
  })
})
