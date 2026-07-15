<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useWorkspaceStore } from "../../filesystem";
import { UnsavedChangesDialog, applyStoreContentToActiveEditor, useTabsStore } from "../../tabs";
import { useGitStore } from "../store";
import BranchSelector from "./BranchSelector.vue";
import CommitHistory from "./CommitHistory.vue";
import DiffViewer from "./DiffViewer.vue";
import type { CommitInfo, GitFileStatus } from "../types";

const workspaceStore = useWorkspaceStore();
const tabsStore = useTabsStore();
const gitStore = useGitStore();

const workspacePath = computed(() => workspaceStore.rootPath);

/** 待切换的目标分支；非空表示正在走未保存确认流程。 */
const pendingBranch = ref<string | null>(null);
/** 待逐个确认的 dirty tab id 队列。 */
const pendingDirtyQueue = ref<string[]>([]);

const pendingDirtyTab = computed(() => {
  const id = pendingDirtyQueue.value[0];
  if (!id) return null;
  return tabsStore.tabs.find((t) => t.id === id) ?? null;
});

watch(
  workspacePath,
  (path) => {
    void gitStore.refresh(path);
  },
  { immediate: true },
);

async function onSelectFile(file: GitFileStatus): Promise<void> {
  if (!workspacePath.value) return;
  await gitStore.selectFile(workspacePath.value, file);
}

async function onSelectCommit(commit: CommitInfo): Promise<void> {
  if (!workspacePath.value) return;
  await gitStore.selectCommit(workspacePath.value, commit);
}

async function onStage(file: GitFileStatus): Promise<void> {
  if (!workspacePath.value) return;
  await gitStore.stage(workspacePath.value, file.path);
}

async function onUnstage(file: GitFileStatus): Promise<void> {
  if (!workspacePath.value) return;
  await gitStore.unstage(workspacePath.value, file.path);
}

async function onCommit(): Promise<void> {
  if (!workspacePath.value) return;
  await gitStore.commit(workspacePath.value);
}

async function finishCheckout(): Promise<void> {
  const branchName = pendingBranch.value;
  pendingBranch.value = null;
  pendingDirtyQueue.value = [];
  if (!workspacePath.value || !branchName) return;
  await gitStore.checkout(workspacePath.value, branchName);
  await workspaceStore.refresh();
  tabsStore.closeAllTabs();
}

async function onBranchChange(branchName: string): Promise<void> {
  if (!workspacePath.value || branchName === gitStore.currentBranch) return;
  tabsStore.materializeActiveContent();
  const dirtyIds = tabsStore.dirtyTabs.map((t) => t.id);
  if (dirtyIds.length === 0) {
    pendingBranch.value = branchName;
    await finishCheckout();
    return;
  }
  pendingBranch.value = branchName;
  pendingDirtyQueue.value = [...dirtyIds];
}

async function onDirtyDialogSave(): Promise<void> {
  const tab = pendingDirtyTab.value;
  if (!tab) return;
  await tabsStore.saveTab(tab.id);
  pendingDirtyQueue.value = pendingDirtyQueue.value.slice(1);
  if (pendingDirtyQueue.value.length === 0) {
    await finishCheckout();
  }
}

function onDirtyDialogDiscard(): void {
  const tab = pendingDirtyTab.value;
  if (!tab) return;
  const wasActive = tab.id === tabsStore.activeTabId;
  tabsStore.discardChanges(tab.id);
  if (wasActive) {
    applyStoreContentToActiveEditor();
  }
  pendingDirtyQueue.value = pendingDirtyQueue.value.slice(1);
  if (pendingDirtyQueue.value.length === 0) {
    void finishCheckout();
  }
}

function onDirtyDialogCancel(): void {
  pendingBranch.value = null;
  pendingDirtyQueue.value = [];
}
</script>

<template>
  <aside class="git-panel">
    <div v-if="!workspacePath" class="git-panel__hint">请先打开文件夹</div>
    <div v-else-if="!gitStore.isRepo" class="git-panel__hint">当前文件夹不是 Git 仓库</div>
    <template v-else>
      <div class="git-panel__header">
        <BranchSelector
          :branches="gitStore.branches"
          :current-branch="gitStore.currentBranch"
          @change="onBranchChange"
        />
        <button type="button" class="git-panel__refresh" @click="gitStore.refresh(workspacePath)">
          刷新
        </button>
      </div>

      <div class="git-panel__tabs">
        <button
          type="button"
          :class="{ active: gitStore.activeTab === 'changes' }"
          @click="gitStore.setActiveTab('changes')"
        >
          改动
        </button>
        <button
          type="button"
          :class="{ active: gitStore.activeTab === 'history' }"
          @click="gitStore.setActiveTab('history')"
        >
          历史
        </button>
      </div>

      <div class="git-panel__body">
        <div class="git-panel__list">
          <template v-if="gitStore.activeTab === 'changes'">
            <section class="git-panel__section">
              <h4>已暂存</h4>
              <ul>
                <li v-for="file in gitStore.stagedFiles" :key="`s-${file.path}-${file.kind}`">
                  <button type="button" class="git-panel__file" @click="onSelectFile(file)">
                    <span>{{ file.path }}</span>
                    <span class="git-panel__kind">{{ file.kind }}</span>
                  </button>
                  <button type="button" class="git-panel__action" @click="onUnstage(file)">
                    −
                  </button>
                </li>
              </ul>
            </section>
            <section class="git-panel__section">
              <h4>未暂存</h4>
              <ul>
                <li v-for="file in gitStore.unstagedFiles" :key="`u-${file.path}-${file.kind}`">
                  <button type="button" class="git-panel__file" @click="onSelectFile(file)">
                    <span>{{ file.path }}</span>
                    <span class="git-panel__kind">{{ file.kind }}</span>
                  </button>
                  <button type="button" class="git-panel__action" @click="onStage(file)">+</button>
                </li>
              </ul>
            </section>
            <div class="git-panel__commit">
              <textarea
                v-model="gitStore.commitMessage"
                rows="3"
                placeholder="提交说明"
              />
              <button
                type="button"
                :disabled="!gitStore.commitMessage.trim() || gitStore.stagedFiles.length === 0"
                @click="onCommit"
              >
                提交
              </button>
            </div>
          </template>
          <CommitHistory
            v-else
            :commits="gitStore.commits"
            :selected-hash="
              gitStore.selected?.mode === 'commit' ? gitStore.selected.path : null
            "
            @select="onSelectCommit"
          />
        </div>
        <DiffViewer class="git-panel__diff" :lines="gitStore.diffLines" />
      </div>
    </template>

    <UnsavedChangesDialog
      v-if="pendingDirtyTab"
      :file-name="pendingDirtyTab.fileName"
      @save="onDirtyDialogSave"
      @discard="onDirtyDialogDiscard"
      @cancel="onDirtyDialogCancel"
    />
  </aside>
</template>

<style scoped>
.git-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-left: 1px solid var(--mm-color-border);
  background: var(--mm-color-panel, var(--mm-color-bg));
  color: var(--mm-color-text);
  min-width: 280px;
}

.git-panel__hint {
  padding: 16px;
  color: var(--mm-color-text-muted);
  font-size: 13px;
}

.git-panel__header {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid var(--mm-color-border);
}

.git-panel__refresh {
  border: 1px solid var(--mm-color-border);
  background: transparent;
  color: inherit;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
}

.git-panel__tabs {
  display: flex;
  border-bottom: 1px solid var(--mm-color-border);
}

.git-panel__tabs button {
  flex: 1;
  border: none;
  background: transparent;
  color: inherit;
  padding: 8px;
  cursor: pointer;
  font-size: 13px;
}

.git-panel__tabs button.active {
  border-bottom: 2px solid var(--mm-color-accent);
  font-weight: 600;
}

.git-panel__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.git-panel__list {
  flex: 1;
  overflow: auto;
  border-bottom: 1px solid var(--mm-color-border);
  min-height: 160px;
}

.git-panel__section {
  padding: 8px;
}

.git-panel__section h4 {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--mm-color-text-muted);
}

.git-panel__section ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.git-panel__section li {
  display: flex;
  align-items: center;
  gap: 4px;
}

.git-panel__file {
  flex: 1;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  padding: 4px 2px;
  cursor: pointer;
  font-size: 12px;
  min-width: 0;
}

.git-panel__file span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-panel__kind {
  color: var(--mm-color-text-muted);
  flex-shrink: 0;
}

.git-panel__action {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  width: 22px;
  height: 22px;
}

.git-panel__commit {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.git-panel__commit textarea {
  resize: vertical;
  font-size: 12px;
  padding: 6px;
  border: 1px solid var(--mm-color-border);
  border-radius: 4px;
  background: var(--mm-color-bg);
  color: var(--mm-color-text);
}

.git-panel__commit button {
  align-self: flex-end;
  padding: 4px 12px;
  border: none;
  border-radius: 4px;
  background: var(--mm-color-accent);
  color: #fff;
  cursor: pointer;
}

.git-panel__commit button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.git-panel__diff {
  flex: 1;
  min-height: 140px;
}
</style>
