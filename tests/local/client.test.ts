import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { api, ApiError, getToken, setToken, setUnauthorizedHandler } from '../../src/api/client'
import type { PendingItem, User } from '../../src/types'

/** node 环境无 localStorage，安装一个 Map 垫片 */
function installStorageShim(): void {
  const map = new Map<string, string>()
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value))
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
    clear: () => {
      map.clear()
    },
  }
  globalThis.localStorage = storage as unknown as Storage
}

beforeEach(() => {
  installStorageShim()
  setUnauthorizedHandler(() => {})
})

afterEach(() => {
  setToken(null)
})

async function registerAndLogin(username: string, password = 'password123'): Promise<User> {
  const { token, user } = await api.register(username, password)
  setToken(token)
  return user
}

/** 已注册账号重新建立会话（同用例内切换账号用） */
async function loginAs(username: string, password = 'password123'): Promise<void> {
  const { token } = await api.login(username, password)
  setToken(token)
}

async function addItem(title: string, options: Parameters<typeof api.addItem>[1] = {}): Promise<PendingItem> {
  const { item } = await api.addItem(title, options)
  return item
}

function expectApiError(promise: Promise<unknown>, status: number, message?: string): Promise<ApiError> {
  return promise
    .then(() => {
      throw new Error('预期应抛出 ApiError，但操作成功了')
    })
    .catch((error: unknown) => {
      expect(error).toBeInstanceOf(ApiError)
      const apiError = error as ApiError
      expect(apiError.status).toBe(status)
      if (message !== undefined) expect(apiError.message).toBe(message)
      return apiError
    })
}

describe('认证：注册 / 登录 / 会话（本地存储）', () => {
  it('注册成功返回 token 与用户信息，且不落明文密码', async () => {
    const { token, user } = await api.register('alice', 'abc12345')
    expect(token).toBeTruthy()
    expect(user.username).toBe('alice')
    expect(user.avatar).toBe('')

    expect(JSON.stringify(globalThis.localStorage.getItem('tiny-pending-item:local:users'))).not.toContain(
      'abc12345',
    )
  })

  it('重复用户名注册被拒绝', async () => {
    await api.register('alice', 'abc12345')
    const error = await expectApiError(api.register('alice', 'abc12345'), 409)
    expect(error.message).toContain('已存在')
  })

  it('用户名或密码不合法被拒绝', async () => {
    await expectApiError(api.register('ab', 'abc12345'), 400)
    await expectApiError(api.register('bob', '123'), 400)
  })

  it('登录成功，密码错误返回 401', async () => {
    await api.register('alice', 'abc12345')

    const ok = await api.login('alice', 'abc12345')
    expect(ok.token).toBeTruthy()
    expect(ok.user.username).toBe('alice')

    await expectApiError(api.login('alice', 'wrong-password'), 401)
    await expectApiError(api.login('nobody', 'abc12345'), 401)
  })

  it('未登录访问业务接口返回 401，并清掉失效会话', async () => {
    setToken(null)
    const error = await expectApiError(api.listItems(), 401)
    expect(error.message).toBe('未登录')

    setToken('not-a-session')
    await expectApiError(api.listItems(), 401)
    expect(getToken()).toBeNull()
  })

  it('me 返回当前用户；会话指向不存在的账号时失效', async () => {
    const user = await registerAndLogin('carol')
    const me = await api.me()
    expect(me.user.username).toBe('carol')

    globalThis.localStorage.setItem('tiny-pending-item:local:users', '[]')
    await expectApiError(api.me(), 401)
    expect(getToken()).toBeNull()
    expect(user.username).toBe('carol')
  })
})

describe('数据隔离与条目操作', () => {
  it('各自添加条目后，账号 B 看不到账号 A 的任何条目', async () => {
    await registerAndLogin('iso-a')
    await addItem('A 的第一条')
    await addItem('A 的第二条')

    await registerAndLogin('iso-b')
    const idB = (await addItem('B 的第一条')).id

    const listB = (await api.listItems()).items
    expect(listB).toHaveLength(1)
    expect(listB[0].title).toBe('B 的第一条')
    expect(listB[0].id).toBe(idB)
    expect(JSON.stringify(listB)).not.toContain('A 的')

    await loginAs('iso-a')
    expect((await api.listItems()).items).toHaveLength(2)
  })

  it('条目按创建时间倒序排列', async () => {
    await registerAndLogin('iso-a')
    await addItem('A 的第一条')
    await addItem('A 的第二条')

    const titles = (await api.listItems()).items.map((item) => item.title)
    expect(titles).toEqual(['A 的第二条', 'A 的第一条'])
  })

  it('账号 B 无法修改、删除账号 A 的条目（表现为 404）', async () => {
    await registerAndLogin('iso-a')
    const itemA1 = await addItem('A 的第一条')

    await registerAndLogin('iso-b')
    await expectApiError(api.updateItem(itemA1.id, { done: true }), 404, '条目不存在')
    await expectApiError(api.deleteItem(itemA1.id), 404, '条目不存在')

    await loginAs('iso-a')
    const target = (await api.listItems()).items.find((item) => item.id === itemA1.id)
    expect(target?.done).toBe(false)
  })

  it('本人可以正常勾选完成与撤销，并记录完成时间', async () => {
    await registerAndLogin('iso-a')
    const item = await addItem('A 的第一条')

    const done = (await api.updateItem(item.id, { done: true })).item
    expect(done.done).toBe(true)
    expect(done.doneAt).toBeGreaterThan(0)

    const undone = (await api.updateItem(item.id, { done: false })).item
    expect(undone.done).toBe(false)
    expect(undone.doneAt).toBeNull()
  })

  it('本人删除条目成功，且他人条目不受影响', async () => {
    await registerAndLogin('iso-a')
    await addItem('A 的第一条')

    await registerAndLogin('iso-b')
    const idB = (await addItem('B 待删除')).id
    await api.deleteItem(idB)
    expect((await api.listItems()).items).toHaveLength(0)

    await loginAs('iso-a')
    expect((await api.listItems()).items).toHaveLength(1)
  })

  it('标题校验：空白被拒绝，超长被拒绝，50 字恰好通过', async () => {
    await registerAndLogin('iso-a')
    await expectApiError(api.addItem('   '), 400)
    await expectApiError(api.addItem('字'.repeat(51)), 400)
    await addItem('字'.repeat(50))
  })

  it('PATCH 参数不合法返回 400', async () => {
    await registerAndLogin('iso-a')
    const item = await addItem('patch 校验')

    await expectApiError(api.updateItem(item.id, {}), 400, '缺少可更新字段')
    await expectApiError(api.updateItem(item.id, { done: 'yes' as unknown as boolean }), 400)
    await expectApiError(api.updateItem(item.id, { priority: 'urgent' as unknown as never }), 400)
    await expectApiError(api.updateItem(item.id, { title: '   ' }), 400)
  })
})

describe('编辑、优先级、截止、标签、置顶、排序、清理、导入导出', () => {
  it('创建条目可带优先级、截止日期与标签；非法截止日期静默置空', async () => {
    await registerAndLogin('f23-a')
    const item = await addItem('带属性待办', {
      priority: 'high',
      dueAt: Date.now() + 86400000,
      tags: ['工作', '紧急'],
    })
    expect(item.priority).toBe('high')
    expect(item.tags).toEqual(['工作', '紧急'])
    expect(item.dueAt).toBeGreaterThan(0)

    const cleared = await addItem('空截止', { dueAt: Number.NaN })
    expect(cleared.dueAt).toBeNull()
  })

  it('PATCH 可部分更新标题、优先级与置顶', async () => {
    await registerAndLogin('f23-a')
    const item = await addItem('原始标题')

    const patched = (await api.updateItem(item.id, { title: '新标题', priority: 'low', pinned: true })).item
    expect(patched.title).toBe('新标题')
    expect(patched.priority).toBe('low')
    expect(patched.pinned).toBe(true)
  })

  it('标签去重且最多 5 个', async () => {
    await registerAndLogin('f23-a')
    const item = await addItem('标签上限', { tags: ['a', 'b', 'a', 'c', 'd', 'e', 'f'] })
    expect(item.tags).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('置顶条目排在列表最前', async () => {
    await registerAndLogin('f23-a')
    const pinned = await addItem('普通一')
    await addItem('普通二')

    await api.updateItem(pinned.id, { pinned: true })
    const titles = (await api.listItems()).items.map((item) => item.title)
    expect(titles[0]).toBe('普通一')
    expect((await api.listItems()).items[0].pinned).toBe(true)
  })

  it('reorder 生效，且无法影响他人条目顺序', async () => {
    await registerAndLogin('reorder-a')
    const idA = (await addItem('A1')).id

    await registerAndLogin('reorder-b')
    const b1 = await addItem('B1')
    const b2 = await addItem('B2')
    const b3 = await addItem('B3')

    expect((await api.reorder([b3.id, b1.id, b2.id])).updated).toBe(3)
    expect((await api.listItems()).items.map((item) => item.title)).toEqual(['B3', 'B1', 'B2'])

    await expectApiError(api.reorder([]), 400)
    await expectApiError(api.reorder([1.5]), 400)

    // B 无法借 reorder 移动 A 的条目
    expect((await api.reorder([idA])).updated).toBe(1)
    await loginAs('reorder-a')
    const listA = (await api.listItems()).items
    expect(listA.map((item) => item.title)).toEqual(['A1'])
  })

  it('一键清除已完成仅影响本人', async () => {
    await registerAndLogin('clear-a')
    await addItem('A 未完成')

    await registerAndLogin('clear-b')
    const idB = (await addItem('B 完成一')).id
    await api.updateItem(idB, { done: true })

    // A 进入时没有已完成条目，清理次数为 0（隔离验证）
    await loginAs('clear-a')
    expect((await api.clearCompleted()).removed).toBe(0)

    await loginAs('clear-b')
    expect((await api.clearCompleted()).removed).toBe(1)
    expect((await api.listItems()).items.some((item) => item.title === 'B 完成一')).toBe(false)
  })

  it('导出仅含本人数据，格式与服务端版兼容', async () => {
    await registerAndLogin('export-a')
    await addItem('A 的待办', { priority: 'high' })
    await registerAndLogin('export-b')
    await addItem('B 的待办')

    const payload = await api.exportItems()
    expect(payload.app).toBe('tiny-pending-item')
    expect(payload.version).toBe(1)
    expect(payload.exportedAt).toBeGreaterThan(0)
    expect(payload.items.map((item) => item.title)).toEqual(['B 的待办'])
  })

  it('导入保留字段并跳过非法行，明细一并带入', async () => {
    await registerAndLogin('import-a')

    let result = await api.importItems([
      { title: '导入一', createdAt: 1600000000000, done: true, priority: 'high', tags: ['备份'] },
      { title: '导入带明细', notes: '导入的明细内容', createdAt: 1600000000001 },
      { title: '   ' },
    ])
    expect(result).toEqual({ imported: 2, skipped: 1 })

    const list = (await api.listItems()).items
    const first = list.find((item) => item.title === '导入一')
    expect(first?.done).toBe(true)
    expect(first?.priority).toBe('high')
    expect(first?.tags).toEqual(['备份'])
    expect(first?.createdAt).toBe(1600000000000)
    expect(first?.doneAt).toBeGreaterThan(0)
    expect(list.find((item) => item.title === '导入带明细')?.notes).toBe('导入的明细内容')
    // 导入按原创建时间倒序融入：较新的在前
    expect(list[0].title).toBe('导入带明细')

    // 空数组导入合法：无内容，0 成功 0 跳过
    expect(await api.importItems([])).toEqual({ imported: 0, skipped: 0 })
  })

  it('导入数量超限返回 400', async () => {
    await registerAndLogin('import-b')
    await expectApiError(api.importItems(Array.from({ length: 1001 }, (_, i) => ({ title: `行${i}` }))), 400)
  })

  it('明细校验：PATCH 超过 2000 字返回 400', async () => {
    await registerAndLogin('notes-a')
    const item = await addItem('明细校验')

    expect((await api.updateItem(item.id, { notes: '更新后的明细' })).item.notes).toBe('更新后的明细')
    await expectApiError(api.updateItem(item.id, { notes: '字'.repeat(2001) }), 400)
  })
})

describe('用户头像（本地存储）', () => {
  it('未设置时为空；设置后小写化保存并可回读', async () => {
    await registerAndLogin('avatar-a')
    expect((await api.me()).user.avatar).toBe('')

    const { user } = await api.updateAvatar({ emoji: '🦊', color: '#8B5CF6' })
    expect(JSON.parse(user.avatar)).toEqual({ emoji: '🦊', color: '#8b5cf6' })
    expect(JSON.parse((await api.me()).user.avatar).emoji).toBe('🦊')
  })

  it('非法头像数据被拒绝', async () => {
    await registerAndLogin('avatar-a')
    await expectApiError(api.updateAvatar({ emoji: '', color: '#8b5cf6' }), 400)
    await expectApiError(api.updateAvatar({ emoji: '🦊', color: 'red' }), 400)
  })

  it('传空清除头像，且不影响其他账号', async () => {
    await registerAndLogin('avatar-a')
    await api.updateAvatar({ emoji: '🐱', color: '#18a058' })

    expect((await api.updateAvatar('')).user.avatar).toBe('')

    await registerAndLogin('avatar-b')
    expect((await api.me()).user.avatar).toBe('')
  })
})
