<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { CheckmarkDoneOutline, SearchOutline } from '@vicons/ionicons5'
import { useItemsStore } from '../stores/items'
import TodoItem from './TodoItem.vue'

const items = useItemsStore()
const message = useMessage()

const sortOptions = [
  { label: '手动排序', value: 'manual' },
  { label: '按优先级', value: 'priority' },
]

/** 拖拽排序仅在“全部 + 手动排序 + 无搜索/标签过滤”时启用，保证本地顺序与完整列表一致 */
const dragEnabled = computed(
  () =>
    items.filter === 'all' &&
    !items.search.trim() &&
    !items.tagFilter &&
    items.sortMode === 'manual' &&
    items.visible.length > 1,
)

const draggingId = ref<number | null>(null)
let orderAtStart: number[] = []

function onDragStart(id: number): void {
  draggingId.value = id
  orderAtStart = items.items.map((item) => item.id)
}

function onDragOver(targetId: number): void {
  if (draggingId.value === null || draggingId.value === targetId) return
  const from = items.items.findIndex((item) => item.id === draggingId.value)
  const to = items.items.findIndex((item) => item.id === targetId)
  if (from < 0 || to < 0) return
  const next = [...items.items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  items.items = next
}

async function onDragEnd(): Promise<void> {
  const ids = items.items.map((item) => item.id)
  draggingId.value = null
  const changed = ids.length !== orderAtStart.length || ids.some((id, index) => id !== orderAtStart[index])
  if (!changed) return
  try {
    await items.reorder(ids)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存排序失败')
    await items.load()
  }
}

const emptyText = computed(() => {
  if (items.search.trim()) return '没有匹配的待办'
  if (items.tagFilter) return '该标签下暂无待办'
  if (items.filter === 'active') return '没有进行中的待办'
  if (items.filter === 'done') return '没有已完成的待办'
  return '还没有待办，记一条吧'
})

async function clearDone(): Promise<void> {
  try {
    const removed = await items.clearCompleted()
    message.success(`已将 ${removed} 条已完成待办移入回收站`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '清除失败，请稍后再试')
  }
}
</script>

<template>
  <div class="todo-list">
    <div class="toolbar">
      <n-input
        id="search-input"
        v-model:value="items.search"
        class="search-input"
        size="small"
        round
        clearable
        placeholder="搜索标题（/）"
      >
        <template #prefix>
          <n-icon :component="SearchOutline" />
        </template>
      </n-input>
      <n-select v-model:value="items.sortMode" class="sort-select" size="small" :options="sortOptions" />
      <n-button
        size="small"
        tertiary
        type="warning"
        :disabled="items.doneCount === 0"
        @click="clearDone"
      >
        <n-icon :component="CheckmarkDoneOutline" />
        清除已完成
      </n-button>
    </div>

    <div class="list-scroll">
      <n-spin :show="items.loading">
        <n-empty v-if="items.visible.length === 0" class="todo-empty" :description="emptyText" />
        <TransitionGroup v-else name="list" tag="ul" class="todo-items">
          <TodoItem
            v-for="item in items.visible"
            :key="item.id"
            :item="item"
            :can-drag="dragEnabled"
            @item-dragstart="onDragStart"
            @item-dragover="onDragOver"
            @item-dragend="onDragEnd"
          />
        </TransitionGroup>
      </n-spin>
    </div>
  </div>
</template>
