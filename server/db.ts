import Database from 'better-sqlite3'

export type DB = Database.Database

function ensureColumn(db: DB, table: string, name: string, ddl: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (cols.some((c) => c.name === name)) {
    return false
  }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  return true
}

export function createDb(path: string): DB {
  const db = new Database(path)
  if (path !== ':memory:') {
    db.pragma('journal_mode = WAL')
  }
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      avatar        TEXT    NOT NULL DEFAULT '',
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      title      TEXT    NOT NULL,
      notes      TEXT    NOT NULL DEFAULT '',
      done       INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      done_at    INTEGER,
      priority   TEXT    NOT NULL DEFAULT 'medium',
      due_at     INTEGER,
      tags       TEXT    NOT NULL DEFAULT '[]',
      pinned     INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id, created_at);
  `)

  // 兼容 v0.1 旧库：补齐迭代二/三新增列
  ensureColumn(db, 'items', 'priority', "priority TEXT NOT NULL DEFAULT 'medium'")
  ensureColumn(db, 'items', 'notes', "notes TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'users', 'avatar', "avatar TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'items', 'due_at', 'due_at INTEGER')
  ensureColumn(db, 'items', 'tags', "tags TEXT NOT NULL DEFAULT '[]'")
  ensureColumn(db, 'items', 'pinned', 'pinned INTEGER NOT NULL DEFAULT 0')
  if (ensureColumn(db, 'items', 'sort_order', 'sort_order INTEGER NOT NULL DEFAULT 0')) {
    // 旧数据以创建时间倒序作为手动排序的初始顺序（新条目同样以 -created_at 落库）
    db.exec('UPDATE items SET sort_order = -created_at')
  }
  return db
}
