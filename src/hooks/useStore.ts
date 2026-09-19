import { useSyncExternalStore } from "react";
import { Store } from "../domain/store";
import type { AppState } from "../domain/types";

// 全局单例：刷新页面后从 localStorage 恢复，列表/提醒读取同一状态。
export const store = new Store();

export function useAppState(): AppState {
  return useSyncExternalStore(
    (onChange) => store.subscribe(onChange),
    () => store.getState(),
    () => store.getState(),
  );
}
