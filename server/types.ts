export type Priority = 'high' | 'medium' | 'low'

export const PRIORITIES: Priority[] = ['high', 'medium', 'low']

export interface PublicUser {
  id: number
  username: string
  avatar: string
}

export interface Item {
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
