/**
 * 存储层：FarrierState 的 localStorage 持久化。
 * 只负责读写与重置，不含任何业务规则；所有视图都从同一份状态推导，
 * 因此马匹列表、复查提醒与刷新后的数据保持一致。
 */

import { FarrierState } from "../domain/types";
import { todayStr } from "../domain/rules";
import { buildSeedState } from "./seed";

const STORAGE_KEY = "hxyfront-62011.farrier.v1";

export function loadState(): FarrierState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FarrierState;
      if (parsed && Array.isArray(parsed.records) && Array.isArray(parsed.reviews)) {
        return parsed;
      }
    }
  } catch {
    // 存储不可用（隐私模式等）时回退到演示数据
  }
  const seeded = buildSeedState(todayStr());
  saveState(seeded);
  return seeded;
}

export function saveState(state: FarrierState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 写入失败不阻断操作，内存状态仍然有效
  }
}

export function resetState(): FarrierState {
  const seeded = buildSeedState(todayStr());
  saveState(seeded);
  return seeded;
}
