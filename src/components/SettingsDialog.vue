<script setup lang="ts">
import { computed } from 'vue'
import { useMessage } from 'naive-ui'
import { useAuthStore } from '../stores/auth'
import { useThemeStore, ACCENT_PRESETS } from '../stores/theme'
import UserAvatar from './UserAvatar.vue'
import { AVATAR_COLORS, AVATAR_EMOJIS, resolveAvatar, type AvatarSpec } from '../utils/avatar'

const show = defineModel<boolean>('show')

const auth = useAuthStore()
const theme = useThemeStore()
const message = useMessage()

const current = computed<AvatarSpec>(() => resolveAvatar(auth.user ?? { username: '', avatar: '' }))

async function applyAvatar(emoji: string, color: string): Promise<void> {
  if (current.value.emoji === emoji && current.value.color === color) return
  try {
    await auth.updateAvatar({ emoji, color })
  } catch (error) {
    message.error(error instanceof Error ? error.message : '头像保存失败，请稍后再试')
  }
}

function pickEmoji(emoji: string): void {
  void applyAvatar(emoji, current.value.color)
}

function pickColor(color: string): void {
  void applyAvatar(current.value.emoji, color)
}
</script>

<template>
  <n-modal
    v-model:show="show"
    preset="card"
    title="个性化"
    class="settings-dialog"
    :bordered="false"
    :style="{ width: '430px' }"
  >
    <div class="dialog-body">
      <section>
        <p class="settings-heading">头像</p>
        <div class="avatar-row">
          <UserAvatar v-if="auth.user" :user="auth.user" :size="58" />
          <span class="avatar-hint">点下方图标与底色即时生效</span>
        </div>
        <div class="emoji-grid">
          <button
            v-for="emoji in AVATAR_EMOJIS"
            :key="emoji"
            type="button"
            class="emoji-cell"
            :class="{ active: current.emoji === emoji }"
            @click="pickEmoji(emoji)"
          >
            {{ emoji }}
          </button>
        </div>
        <div class="color-row">
          <button
            v-for="color in AVATAR_COLORS"
            :key="color"
            type="button"
            class="color-dot"
            :class="{ active: current.color.toLowerCase() === color.toLowerCase() }"
            :style="{ background: color }"
            @click="pickColor(color)"
          ></button>
        </div>
      </section>

      <section>
        <p class="settings-heading">主题色</p>
        <div class="color-row">
          <n-tooltip v-for="preset in ACCENT_PRESETS" :key="preset.key">
            <template #trigger>
              <button
                type="button"
                class="color-dot accent-dot"
                :class="{ active: theme.primary === preset.key }"
                :style="{ background: preset.primary }"
                @click="theme.setPrimary(preset.key)"
              ></button>
            </template>
            {{ preset.label }}
          </n-tooltip>
        </div>
      </section>

      <section>
        <p class="settings-heading">外观</p>
        <div class="appearance-row">
          <span>{{ theme.dark ? '当前：深色' : '当前：浅色' }}</span>
          <n-switch :value="theme.dark" @update:value="theme.dark !== $event && theme.toggle()">
            <template #checked>深色</template>
            <template #unchecked>浅色</template>
          </n-switch>
        </div>
      </section>
    </div>

    <template #footer>
      <div class="dialog-actions">
        <n-button type="primary" @click="show = false">完成</n-button>
      </div>
    </template>
  </n-modal>
</template>
