<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { TrashOutline } from '@vicons/ionicons5'
import { useDomainsStore } from '../stores/domains'
import { DOMAIN_EMOJIS } from '../types'

const show = defineModel<boolean>('show')

const domains = useDomainsStore()
const message = useMessage()

const MAX_DOMAIN_NAME = 10

const draft = reactive<{ name: string; emoji: string }>({ name: '', emoji: DOMAIN_EMOJIS[0]! })
const adding = ref(false)

/** 行内重命名的草稿（按域 id 存放），失焦或回车时提交 */
const nameDrafts = reactive<Record<number, string>>({})
const savingName = ref(false)

const emojiOptions = DOMAIN_EMOJIS.map((emoji) => ({ label: emoji, value: emoji }))

/** 打开时同步一份名称草稿，避免输入框直接绑定 store 造成逐字符提交 */
watch(show, (open) => {
  if (!open) return
  draft.name = ''
  draft.emoji = DOMAIN_EMOJIS[0]!
  nameDraftsSync()
})

function nameDraftsSync(): void {
  for (const row of domains.list) {
    nameDrafts[row.id] = row.name
  }
}

function pickEmoji(id: number, emoji: string): void {
  const target = domains.list.find((row) => row.id === id)
  if (!target || target.emoji === emoji) return
  domains
    .setEmoji(id, emoji)
    .then(() => nameDraftsSync())
    .catch((error: unknown) => {
      message.error(error instanceof Error ? error.message : '保存失败，请稍后再试')
    })
}

async function commitName(id: number): Promise<void> {
  const target = domains.list.find((row) => row.id === id)
  if (!target) return
  const name = (nameDrafts[id] ?? '').trim()
  if (name === target.name) return
  if (!name) {
    nameDrafts[id] = target.name
    message.warning('域名称不能为空')
    return
  }
  if (name.length > MAX_DOMAIN_NAME) {
    nameDrafts[id] = target.name
    message.warning(`域名称不能超过 ${MAX_DOMAIN_NAME} 个字符`)
    return
  }
  savingName.value = true
  try {
    await domains.rename(id, name)
    message.success('域已重命名')
  } catch (error) {
    nameDrafts[id] = target.name
    message.error(error instanceof Error ? error.message : '保存失败，请稍后再试')
  } finally {
    savingName.value = false
  }
}

async function addDomain(): Promise<void> {
  const name = draft.name.trim()
  if (!name) {
    message.warning('请填写域名称')
    return
  }
  if (name.length > MAX_DOMAIN_NAME) {
    message.warning(`域名称不能超过 ${MAX_DOMAIN_NAME} 个字符`)
    return
  }
  adding.value = true
  try {
    await domains.add(name, draft.emoji)
    message.success(`域「${name}」已创建`)
    draft.name = ''
    nameDraftsSync()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '创建失败，请稍后再试')
  } finally {
    adding.value = false
  }
}

async function removeDomain(id: number): Promise<void> {
  const target = domains.list.find((row) => row.id === id)
  try {
    await domains.remove(id)
    message.success(`域「${target?.name ?? ''}」已删除`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '删除失败')
  }
}
</script>

<template>
  <n-modal
    v-model:show="show"
    preset="card"
    title="管理域"
    class="domains-dialog"
    :bordered="false"
    :style="{ width: '460px' }"
  >
    <div class="dialog-body">
      <section>
        <p class="settings-heading">新增域</p>
        <div class="domain-add-row">
          <n-select
            v-model:value="draft.emoji"
            class="domain-emoji-select"
            size="small"
            :options="emojiOptions"
            :consistent-menu-width="false"
          />
          <n-input
            v-model:value="draft.name"
            size="small"
            maxlength="10"
            placeholder="域名称（1-10 字）"
            @keyup.enter="addDomain"
          />
          <n-button size="small" type="primary" :loading="adding" @click="addDomain">添加</n-button>
        </div>
      </section>

      <section>
        <p class="settings-heading">已有域（{{ domains.list.length }}）</p>
        <div class="domain-rows">
          <div v-for="row in domains.list" :key="row.id" class="domain-row">
            <n-select
              :value="row.emoji"
              class="domain-emoji-select"
              size="small"
              :options="emojiOptions"
              :consistent-menu-width="false"
              @update:value="pickEmoji(row.id, $event)"
            />
            <n-input
              v-model:value="nameDrafts[row.id]"
              size="small"
              maxlength="10"
              placeholder="域名称"
              @blur="commitName(row.id)"
              @keyup.enter="($event.target as HTMLInputElement)?.blur()"
            />
            <n-popconfirm
              placement="left"
              positive-text="删除"
              negative-text="取消"
              @positive-click="removeDomain(row.id)"
            >
              <template #trigger>
                <n-button size="small" quaternary type="error">
                  <n-icon :component="TrashOutline" />
                </n-button>
              </template>
              删除后该域不再出现在列表中（域内有待办时无法删除）。
            </n-popconfirm>
          </div>
        </div>
        <p class="domain-hint">名称修改在输入框失焦或回车后保存；删除域前需先移走或清空其待办。</p>
      </section>
    </div>

    <template #footer>
      <div class="dialog-actions">
        <n-button type="primary" @click="show = false">完成</n-button>
      </div>
    </template>
  </n-modal>
</template>
