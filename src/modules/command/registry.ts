/**
 * 命令注册中心：业务侧只注册/执行，本模块不感知具体业务实现。
 */
import { toastError } from "../../notify";
import type { CommandDefinition, CommandListItem } from "./types";

const commands = new Map<string, CommandDefinition>();

/** 用户覆盖的快捷键：commandId → shortcut 字符串。 */
let shortcutOverrides: Record<string, string> = {};

export function setShortcutOverrides(overrides: Record<string, string>): void {
  shortcutOverrides = { ...overrides };
}

export function getShortcutOverrides(): Record<string, string> {
  return { ...shortcutOverrides };
}

export function registerCommand(command: CommandDefinition): void {
  if (commands.has(command.id)) {
    console.warn(`[markmfy] command already registered, overriding: ${command.id}`);
  }
  commands.set(command.id, command);
}

export function unregisterCommand(id: string): void {
  commands.delete(id);
}

export function getCommand(id: string): CommandDefinition | undefined {
  return commands.get(id);
}

export function effectiveShortcut(command: CommandDefinition): string | undefined {
  const override = shortcutOverrides[command.id];
  if (override != null && override.trim() !== "") {
    return override.trim();
  }
  return command.defaultShortcut;
}

export function listCommands(): CommandListItem[] {
  const items: CommandListItem[] = [];
  for (const command of commands.values()) {
    if (command.when && !command.when()) continue;
    items.push({
      ...command,
      shortcut: effectiveShortcut(command),
    });
  }
  return items.sort((a, b) => a.title.localeCompare(b.title, "zh"));
}

export async function executeCommand(id: string): Promise<boolean> {
  const command = commands.get(id);
  if (!command) return false;
  if (command.when && !command.when()) return false;
  try {
    await command.run();
    return true;
  } catch (err) {
    // 业务层已 toast 的不会再抛；此处兜底未捕获异常
    toastError(err, "命令执行失败");
    return false;
  }
}

/** 测试或热重载时清空（正常运行不调用）。 */
export function clearCommands(): void {
  commands.clear();
}
