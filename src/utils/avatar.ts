/** 头像工具：JSON {emoji, color} ↔ 渲染规格；未设置时按用户名派生默认头像 */
export interface AvatarSpec {
  emoji: string
  color: string
}

export const AVATAR_COLORS = [
  '#3f7cf6',
  '#18a058',
  '#eb2f96',
  '#f08c00',
  '#8b5cf6',
  '#13c2c2',
  '#f5222d',
  '#57606f',
]

export const AVATAR_EMOJIS = [
  '😀', '😎', '🥳', '🤔', '😴', '🦊', '🐱', '🐶',
  '🐼', '🐙', '🦄', '🌸', '🍀', '⭐️', '🔥', '🌙',
  '🚀', '⚽️', '🎸', '📚', '🍕', '☕️', '🍎', '🎯',
]

export function parseAvatar(raw: string | null | undefined): AvatarSpec | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (
      value &&
      typeof value === 'object' &&
      typeof (value as AvatarSpec).emoji === 'string' &&
      typeof (value as AvatarSpec).color === 'string' &&
      /^#[0-9a-fA-F]{6}$/.test((value as AvatarSpec).color)
    ) {
      return value as AvatarSpec
    }
  } catch {
    // 非法存储内容时回退默认头像
  }
  return null
}

function hashString(text: string): number {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }
  return hash
}

export function fallbackAvatar(username: string): AvatarSpec {
  const first = [...username.trim()][0] ?? '?'
  const color = AVATAR_COLORS[hashString(username) % AVATAR_COLORS.length]
  return { emoji: first, color }
}

export function resolveAvatar(user: { username: string; avatar?: string | null }): AvatarSpec {
  return parseAvatar(user.avatar) ?? fallbackAvatar(user.username)
}
