import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import express from 'express'
import type { Express, NextFunction, Request, Response } from 'express'
import { createDb, type DB } from './db.js'
import { authRouter, requireAuth } from './auth.js'
import { itemsRouter } from './items.js'

const serverDir = path.dirname(fileURLToPath(import.meta.url))

export function createApp(db: DB): Express {
  const app = express()
  app.use(express.json())

  app.use('/api/auth', authRouter(db))
  app.use('/api/items', requireAuth, itemsRouter(db))
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: '接口不存在' })
  })

  const distDir = path.join(serverDir, '..', 'dist')
  app.use(express.static(distDir))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      next()
      return
    }
    res.sendFile(path.join(distDir, 'index.html'), (err) => {
      if (err) next(err)
    })
  })

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as { status?: number } | null)?.status
    if (!status || status >= 500) {
      console.error(err)
    }
    res.status(status ?? 500).json({ error: status ? '请求格式错误' : '服务器内部错误' })
  })

  return app
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.JWT_SECRET) {
    console.error('[启动失败] 缺少环境变量 JWT_SECRET（用于签发登录令牌，须通过环境变量提供）')
    process.exit(1)
  }
  const dbPath = process.env.TINY_DB_PATH ?? path.join(serverDir, 'tiny.db')
  const db = createDb(dbPath)
  const port = Number(process.env.PORT ?? 3010)
  createApp(db).listen(port, () => {
    console.log(`TinyPendingItem 服务已启动: http://localhost:${port}`)
  })
}
