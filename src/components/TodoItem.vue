<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { useItemsStore } from '../stores/items'
import { useDomainsStore } from '../stores/domains'
import { TrashOutline, StarOutline, Star } from '@vicons/ionicons5'
import { PRIORITIES, PRIORITY_LABELS, type PendingItem, type Priority } from '../types'

const props = defineProps<{ item: PendingItem; canDrag: boolean; variant?: 'list' | 'card' }>()

const emit = defineEmits<{
  'item-dragstart': [id: number]
  'item-dragover': [id: number]
  'item-dragend': []
}>()

const items = useItemsStore()
const domains = useDomainsStore()
const message = useMessage()

const isCard = computed(() => props.variant === 'card')

/** 卡片视图展示明细摘要，避免内容溢出 */
const notesPreview = computed(() => {
  const notes = props.item.notes
  return notes.length > 80 ? `${notes.slice(0, 80)}…` : notes
})

const dragging = ref(false)
const editing = ref(false)
const editTitle = ref('')
const editPriority = ref<Priority>('medium')
const editDueAt = ref<number | null>(null)
const editTags = ref<string[]>([])

const priorityOptions = PRIORITIES.map((value) => ({ label: PRIORITY_LABELS[value], value }))

/** “全部域”视图下卡片显示归属域，域视图内则省略 */
const ownerDomain = computed(() =>
  domains.activeId === null ? domains.list.find((row) => row.id === props.item.domainId) ?? null : null,
)

const dueState = computed<'none' | 'overdue' | 'today' | 'future'>(() => {
  if (!props.item.dueAt || props.item.done) return 'none'
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (props.item.dueAt < todayStart) return 'overdue'
  if (props.item.dueAt < todayStart + 86400000) return 'today'
  return 'future'
})

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDue(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function startEdit(): void {
  editTitle.value = props.item.title
  editPriority.value = props.item.priority
  editDueAt.value = props.item.dueAt
  editTags.value = [...props.item.tags]
  editing.value = true
}

function cancelEdit(): void {
  editing.value = false
}

async function saveEdit(): Promise<void> {
  const title = editTitle.value.trim()
  if (!title) {
    message.warning('待办标题不能为空')
    return
  }
  if (title.length > 50) {
    message.warning('待办标题不能超过 50 个字符')
    return
  }
  try {
    await items.update(props.item.id, {
      title,
      priority: editPriority.value,
      dueAt: editDueAt.value,
      tags: editTags.value,
    })
    editing.value = false
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存失败，请稍后再试')
  }
}

function onDragStart(): void {
  dragging.value = true
  emit('item-dragstart', props.item.id)
}

function onDragEnd(): void {
  dragging.value = false
  emit('item-dragend')
}

/** 删除为软删除：移入回收站，30 天内可恢复 */
async function onRemove(): Promise<void> {
  try {
    await items.remove(props.item.id)
    message.success('已移入回收站，30 天内可恢复')
  } catch (error) {
    message.error(error instanceof Error ? error.message : '删除失败，请稍后再试')
  }
}
</script>

<template>
  <li
    class="todo-item"
    :class="{
      done: item.done,
      pinned: item.pinned,
      dragging,
      overdue: dueState === 'overdue',
      selected: items.selected?.id === item.id,
    }"
    :draggable="canDrag && !editing && !item.pinned"
    @dragstart="onDragStart"
    @dragover.prevent="$emit('item-dragover', item.id)"
    @dragend="onDragEnd"
  >
    <template v-if="!editing">
      <n-checkbox :checked="item.done" @update:checked="items.toggle(item.id)" />
      <span v-if="canDrag && !item.pinned" class="drag-handle" title="拖拽调整顺序">⋮⋮</span>

      <div
        class="item-main"
        :class="{ clickable: !editing }"
        title="点击查看/编辑明细"
        @click="items.select(item.id)"
      >
        <div class="title-row">
          <span class="prio" :class="`prio-${item.priority}`">{{ PRIORITY_LABELS[item.priority] }}</span>
          <span class="title" title="双击编辑" @dblclick="startEdit">{{ item.title }}</span>
        </div>
        <p v-if="isCard && item.notes" class="card-notes" :title="item.notes">{{ notesPreview }}</p>
        <div class="meta">
          <span v-if="item.notes" class="notes-hint" :title="item.notes">📄</span>
          <span v-if="ownerDomain" class="domain-chip">{{ ownerDomain.emoji }} {{ ownerDomain.name }}</span>
          <n-tag v-for="tag in item.tags" :key="tag" size="tiny" round :bordered="false">{{ tag }}</n-tag>
          <span v-if="dueState === 'overdue'" class="due overdue">已逾期 {{ formatDue(item.dueAt!) }}</span>
          <span v-else-if="dueState === 'today'" class="due today">今天截止</span>
          <span v-else-if="dueState === 'future'" class="due">截止 {{ formatDue(item.dueAt!) }}</span>
          <span class="time">{{ formatTime(item.createdAt) }}</span>
        </div>
      </div>

      <span class="item-actions">
        <n-tooltip>
          <template #trigger>
            <n-button
              quaternary
              circle
              size="tiny"
              class="pin"
              :type="item.pinned ? 'warning' : 'default'"
              @click="items.togglePin(item)"
            >
              <n-icon :component="item.pinned ? Star : StarOutline" />
            </n-button>
          </template>
          {{ item.pinned ? '取消置顶' : '置顶' }}
        </n-tooltip>
        <n-tooltip>
          <template #trigger>
            <n-button quaternary circle size="tiny" type="error" @click="onRemove">
              <n-icon :component="TrashOutline" />
            </n-button>
          </template>
          删除
        </n-tooltip>
      </span>
    </template>

    <template v-else>
      <div class="edit" @dblclick.stop>
        <n-input
          v-model:value="editTitle"
          size="small"
          placeholder="待办标题"
          @keyup.enter="saveEdit"
          @keyup.esc="cancelEdit"
        />
        <div class="edit-row">
          <n-select v-model:value="editPriority" class="edit-priority" size="small" :options="priorityOptions" />
          <n-date-picker
            v-model:value="editDueAt"
            class="edit-due"
            size="small"
            type="date"
            clearable
            placeholder="截止日期"
          />
          <n-button size="small" type="primary" @click="saveEdit">保存</n-button>
          <n-button size="small" quaternary @click="cancelEdit">取消</n-button>
        </div>
        <n-dynamic-tags v-model:value="editTags" size="small" :max="5" />
      </div>
    </template>
  </li>
</template>
