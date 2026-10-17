import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from '../../server/index.js'
import { createDb, type DB } from '../../server/db.js'

let db: DB
let server: Server
let base: string

interface CallResult {
  status: number
  data: any
}

async function call(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<CallResult> {
  const headers: Record<string, string> = {}
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const text = await res.text()
  return { status: res.status, data: text ? JSON.parse(text) : null }
}

async function register(username: string, password = 'password123'): Promise<string> {
  const { data } = await call('POST', '/api/auth/register', {
    body: { username, password },
  })
  return data.token
}

async function addItem(token: string, title: string): Promise<number> {
  const { data } = await call('POST', '/api/items', { token, body: { title } })
  return data.item.id
}

beforeAll(() => {
  db = createDb(':memory:')
  const app = createApp(db)
  server = app.listen(0)
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
  db.close()
})

describe('认证：注册 / 登录 / 会话', () => {
  it('注册成功返回 token 与用户信息，且不泄露密码字段', async () => {
    const { status, data } = await call('POST', '/api/auth/register', {
      body: { username: 'alice', password: 'abc12345' },
    })
    expect(status).toBe(201)
    expect(data.user.username).toBe('alice')
    expect(data.token).toBeTruthy()
    expect(JSON.stringify(data)).not.toContain('password')
  })

  it('重复用户名注册被拒绝', async () => {
    const { status, data } = await call('POST', '/api/auth/register', {
      body: { username: 'alice', password: 'abc12345' },
    })
    expect(status).toBe(409)
    expect(data.error).toContain('已存在')
  })

  it('用户名或密码不合法被拒绝', async () => {
    const shortName = await call('POST', '/api/auth/register', {
      body: { username: 'ab', password: 'abc12345' },
    })
    expect(shortName.status).toBe(400)

    const shortPassword = await call('POST', '/api/auth/register', {
      body: { username: 'bob', password: '123' },
    })
    expect(shortPassword.status).toBe(400)
  })

  it('登录成功签发 token，密码错误返回 401', async () => {
    const ok = await call('POST', '/api/auth/login', {
      body: { username: 'alice', password: 'abc12345' },
    })
    expect(ok.status).toBe(200)
    expect(ok.data.token).toBeTruthy()

    const bad = await call('POST', '/api/auth/login', {
      body: { username: 'alice', password: 'wrong-password' },
    })
    expect(bad.status).toBe(401)
  })

  it('未登录访问业务接口返回 401，伪造 token 同样被拒', async () => {
    expect((await call('GET', '/api/items')).status).toBe(401)
    expect((await call('GET', '/api/items', { token: 'not-a-jwt' })).status).toBe(401)
  })

  it('me 接口返回当前用户', async () => {
    const token = await register('carol')
    const { status, data } = await call('GET', '/api/auth/me', { token })
    expect(status).toBe(200)
    expect(data.user.username).toBe('carol')
  })

  it('数据库中不存明文密码', async () => {
    const row = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('alice') as {
      password_hash: string
    }
    expect(row.password_hash.startsWith('$2')).toBe(true)
    expect(row.password_hash).not.toContain('abc12345')
  })
})

describe('数据隔离与条目操作', () => {
  let tokenA: string
  let tokenB: string
  let itemA1: number

  beforeAll(async () => {
    tokenA = await register('iso-a')
    tokenB = await register('iso-b')
  })

  it('各自添加条目后，账号 B 看不到账号 A 的任何条目', async () => {
    itemA1 = await addItem(tokenA, 'A 的第一条')
    await addItem(tokenA, 'A 的第二条')
    const idB = await addItem(tokenB, 'B 的第一条')

    const listB = await call('GET', '/api/items', { token: tokenB })
    expect(listB.data.items).toHaveLength(1)
    expect(listB.data.items[0].title).toBe('B 的第一条')
    expect(listB.data.items[0].id).toBe(idB)
    expect(JSON.stringify(listB.data.items)).not.toContain('A 的')

    const listA = await call('GET', '/api/items', { token: tokenA })
    expect(listA.data.items).toHaveLength(2)
  })

  it('条目按创建时间倒序排列', async () => {
    const listA = await call('GET', '/api/items', { token: tokenA })
    const titles: string[] = listA.data.items.map((i: { title: string }) => i.title)
    expect(titles).toEqual(['A 的第二条', 'A 的第一条'])
  })

  it('账号 B 无法修改、删除账号 A 的条目（表现为 404）', async () => {
    const patch = await call('PATCH', `/api/items/${itemA1}`, {
      token: tokenB,
      body: { done: true },
    })
    expect(patch.status).toBe(404)

    const remove = await call('DELETE', `/api/items/${itemA1}`, { token: tokenB })
    expect(remove.status).toBe(404)

    const listA = await call('GET', '/api/items', { token: tokenA })
    const target = listA.data.items.find((i: { id: number }) => i.id === itemA1)
    expect(target).toBeTruthy()
    expect(target.done).toBe(false)
  })

  it('本人可以正常勾选完成与撤销，并记录完成时间', async () => {
    const done = await call('PATCH', `/api/items/${itemA1}`, {
      token: tokenA,
      body: { done: true },
    })
    expect(done.status).toBe(200)
    expect(done.data.item.done).toBe(true)
    expect(done.data.item.doneAt).toBeGreaterThan(0)

    const undone = await call('PATCH', `/api/items/${itemA1}`, {
      token: tokenA,
      body: { done: false },
    })
    expect(undone.data.item.done).toBe(false)
    expect(undone.data.item.doneAt).toBeNull()
  })

  it('本人删除条目成功，且他人条目不受影响', async () => {
    const idB = await addItem(tokenB, 'B 待删除')
    const remove = await call('DELETE', `/api/items/${idB}`, { token: tokenB })
    expect(remove.status).toBe(204)

    const listA = await call('GET', '/api/items', { token: tokenA })
    expect(listA.data.items).toHaveLength(2)
  })

  it('标题校验：空白被拒绝，超长被拒绝', async () => {
    const blank = await call('POST', '/api/items', { token: tokenA, body: { title: '   ' } })
    expect(blank.status).toBe(400)

    const tooLong = await call('POST', '/api/items', {
      token: tokenA,
      body: { title: '字'.repeat(51) },
    })
    expect(tooLong.status).toBe(400)

    const exact = await call('POST', '/api/items', {
      token: tokenA,
      body: { title: '字'.repeat(50) },
    })
    expect(exact.status).toBe(201)
  })

  it('PATCH 参数不合法返回 400', async () => {
    const bad = await call('PATCH', `/api/items/${itemA1}`, {
      token: tokenA,
      body: { done: 'yes' },
    })
    expect(bad.status).toBe(400)
  })
})

describe('迭代二/三：编辑、优先级、截止、标签、置顶、排序、清理、导入导出', () => {
  let tokenA: string
  let tokenB: string

  beforeAll(async () => {
    tokenA = await register('f23-a')
    tokenB = await register('f23-b')
  })

  it('创建条目可带优先级、截止日期与标签', async () => {
    const { status, data } = await call('POST', '/api/items', {
      token: tokenA,
      body: { title: '带属性待办', priority: 'high', dueAt: Date.now() + 86400000, tags: ['工作', '紧急'] },
    })
    expect(status).toBe(201)
    expect(data.item.priority).toBe('high')
    expect(data.item.tags).toEqual(['工作', '紧急'])
    expect(data.item.dueAt).toBeGreaterThan(0)
  })

  it('PATCH 可部分更新标题、优先级与置顶', async () => {
    const id = await addItem(tokenA, '原始标题')
    const { status, data } = await call('PATCH', `/api/items/${id}`, {
      token: tokenA,
      body: { title: '新标题', priority: 'low', pinned: true },
    })
    expect(status).toBe(200)
    expect(data.item.title).toBe('新标题')
    expect(data.item.priority).toBe('low')
    expect(data.item.pinned).toBe(true)
  })

  it('PATCH 空对象与非法字段返回 400', async () => {
    const id = await addItem(tokenA, 'patch 校验')
    expect((await call('PATCH', `/api/items/${id}`, { token: tokenA, body: {} })).status).toBe(400)
    expect(
      (await call('PATCH', `/api/items/${id}`, { token: tokenA, body: { priority: 'urgent' } })).status,
    ).toBe(400)
  })

  it('标签去重且最多 5 个', async () => {
    const { data } = await call('POST', '/api/items', {
      token: tokenA,
      body: { title: '标签上限', tags: ['a', 'b', 'a', 'c', 'd', 'e', 'f'] },
    })
    expect(data.item.tags).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('置顶条目排在列表最前', async () => {
    await addItem(tokenA, '普通一')
    await addItem(tokenA, '普通二')
    const list = await call('GET', '/api/items', { token: tokenA })
    expect(list.data.items[0].title).toBe('新标题')
    expect(list.data.items[0].pinned).toBe(true)
  })

  it('reorder 生效，且无法影响他人条目顺序', async () => {
    const id1 = await addItem(tokenB, 'B1')
    const id2 = await addItem(tokenB, 'B2')
    const id3 = await addItem(tokenB, 'B3')
    const reorder = await call('POST', '/api/items/reorder', {
      token: tokenB,
      body: { orderedIds: [id1, id2, id3] },
    })
    expect(reorder.status).toBe(200)
    const list = await call('GET', '/api/items', { token: tokenB })
    expect(list.data.items.map((i: { title: string }) => i.title)).toEqual(['B1', 'B2', 'B3'])

    const listA = await call('GET', '/api/items', { token: tokenA })
    const firstA = listA.data.items[0]
    await call('POST', '/api/items/reorder', { token: tokenB, body: { orderedIds: [firstA.id] } })
    const listA2 = await call('GET', '/api/items', { token: tokenA })
    expect(listA2.data.items[0].id).toBe(firstA.id)
    expect(listA2.data.items[0].title).toBe(firstA.title)
  })

  it('一键清除已完成仅影响本人', async () => {
    const idB = await addItem(tokenB, 'B 完成一')
    await call('PATCH', `/api/items/${idB}`, { token: tokenB, body: { done: true } })

    const clearedA = await call('POST', '/api/items/clear-completed', { token: tokenA })
    expect(clearedA.data.removed).toBe(0)

    const clearedB = await call('POST', '/api/items/clear-completed', { token: tokenB })
    expect(clearedB.data.removed).toBe(1)
    const listB = await call('GET', '/api/items', { token: tokenB })
    expect(listB.data.items.some((i: { title: string }) => i.title === 'B 完成一')).toBe(false)
  })

  it('导出仅含本人数据，导入保留字段并跳过非法行', async () => {
    const exported = await call('GET', '/api/items/export', { token: tokenA })
    expect(exported.status).toBe(200)
    expect(exported.data.items.length).toBeGreaterThan(0)
    expect(JSON.stringify(exported.data.items)).not.toContain('B1')

    const { data } = await call('POST', '/api/items/import', {
      token: tokenA,
      body: {
        items: [
          { title: '导入一', createdAt: 1600000000000, done: true, priority: 'high', tags: ['备份'] },
          { title: '   ' },
        ],
      },
    })
    expect(data.imported).toBe(1)
    expect(data.skipped).toBe(1)

    const list = await call('GET', '/api/items', { token: tokenA })
    const imported = list.data.items.find((i: { title: string }) => i.title === '导入一')
    expect(imported.done).toBe(true)
    expect(imported.priority).toBe('high')
    expect(imported.tags).toEqual(['备份'])
    expect(imported.createdAt).toBe(1600000000000)
  })
})

describe('卡片明细（notes）', () => {
  let tokenA: string

  beforeAll(async () => {
    tokenA = await register('notes-a')
  })

  it('创建时带明细并回读', async () => {
    const { status, data } = await call('POST', '/api/items', {
      token: tokenA,
      body: { title: '带明细待办', notes: '第一行\n第二行 含链接 https://example.com' },
    })
    expect(status).toBe(201)
    expect(data.item.notes).toContain('第二行')
  })

  it('PATCH 更新明细，超过 2000 字返回 400', async () => {
    const created = await call('POST', '/api/items', { token: tokenA, body: { title: '明细校验' } })
    const id = created.data.item.id

    const patched = await call('PATCH', `/api/items/${id}`, {
      token: tokenA,
      body: { notes: '更新后的明细' },
    })
    expect(patched.status).toBe(200)
    expect(patched.data.item.notes).toBe('更新后的明细')

    const tooLong = await call('PATCH', `/api/items/${id}`, {
      token: tokenA,
      body: { notes: '字'.repeat(2001) },
    })
    expect(tooLong.status).toBe(400)
  })

  it('导入携带明细字段', async () => {
    const { data } = await call('POST', '/api/items/import', {
      token: tokenA,
      body: { items: [{ title: '导入带明细', notes: '导入的明细内容', createdAt: 1600000000001 }] },
    })
    expect(data.imported).toBe(1)

    const list = await call('GET', '/api/items', { token: tokenA })
    const imported = list.data.items.find((i: { title: string }) => i.title === '导入带明细')
    expect(imported.notes).toBe('导入的明细内容')
  })
})

describe('用户头像', () => {
  let token: string

  beforeAll(async () => {
    token = await register('avatar-a')
  })

  it('未设置时为空；设置后 me 返回该头像', async () => {
    const before = await call('GET', '/api/auth/me', { token })
    expect(before.data.user.avatar).toBe('')

    const { status, data } = await call('PATCH', '/api/auth/me', {
      token,
      body: { avatar: { emoji: '🦊', color: '#8B5CF6' } },
    })
    expect(status).toBe(200)
    expect(data.user.username).toBe('avatar-a')
    expect(JSON.parse(data.user.avatar)).toEqual({ emoji: '🦊', color: '#8b5cf6' })

    const after = await call('GET', '/api/auth/me', { token })
    expect(JSON.parse(after.data.user.avatar).emoji).toBe('🦊')
  })

  it('非法头像数据被拒绝', async () => {
    const emptyEmoji = await call('PATCH', '/api/auth/me', {
      token,
      body: { avatar: { emoji: '', color: '#8b5cf6' } },
    })
    expect(emptyEmoji.status).toBe(400)

    const badColor = await call('PATCH', '/api/auth/me', {
      token,
      body: { avatar: { emoji: '🦊', color: 'red' } },
    })
    expect(badColor.status).toBe(400)

    const badShape = await call('PATCH', '/api/auth/me', { token, body: { avatar: 'not-json' } })
    expect(badShape.status).toBe(400)
  })

  it('传空清除头像，且不影响其他账号', async () => {
    const tokenB = await register('avatar-b')
    await call('PATCH', '/api/auth/me', {
      token,
      body: { avatar: { emoji: '🐱', color: '#18a058' } },
    })

    const cleared = await call('PATCH', '/api/auth/me', { token, body: { avatar: '' } })
    expect(cleared.data.user.avatar).toBe('')

    const meB = await call('GET', '/api/auth/me', { token: tokenB })
    expect(meB.data.user.avatar).toBe('')
  })
})
