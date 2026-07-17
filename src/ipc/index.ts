/**
 * 前端调用 Tauri command 的统一封装层。
 * 业务模块禁止直接调用 @tauri-apps/api 的 invoke，必须通过本层导出的函数调用。
 */
export * from "./app";
export * from "./fs";
export * from "./dialog";
export * from "./git";
export * from "./settings";
export * from "./search";
export { normalizeInvokeError } from "./errors";
export { toAssetUrl } from "./asset";
