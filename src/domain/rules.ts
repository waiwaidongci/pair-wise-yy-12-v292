/**
 * 领域规则：全部业务判断与状态流转的纯函数实现。
 * 不依赖 React / localStorage，输入旧状态返回新状态，便于测试与复用。
 *
 * 闭环规则：
 * 1. 每匹马同一蹄位仅留一条生效（待复查）记录；再次登记即视为更换蹄铁。
 * 2. 登记必须包含步态分级、左右蹄角差、蹄铁类型、钉位。
 * 3. 步态三级或左右蹄角差超过 4° → 只进异常复查，不得列为可训练。
 * 4. 复查须由另一人填写处置（复查人 ≠ 记录人）。
 * 5. 连续两次复查正常且鞋钉牢固 → 闭环恢复（异常蹄位恢复为可训练）。
 * 6. 更换蹄铁或修订原记录 → 该记录全部旧复查立即失效，连续次数清零。
 * 7. 复查按幂等键去重：重复提交沿用首次结果。
 */

import {
  FarrierState,
  GaitGrade,
  HoofPosition,
  HOOF_POSITIONS,
  ReviewEntry,
  ReviewResult,
  ShoeingRecord,
} from "./types";

export const MAX_ANGLE_DIFF_DEG = 4;
export const ABNORMAL_GAIT_GRADE: GaitGrade = 3;
export const RECOVERY_STREAK_REQUIRED = 2;

export class RuleError extends Error {}

let idSeq = 0;
export function uid(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

/* ---------------------------------- 校验 ---------------------------------- */

export interface ShoeingInput {
  horseId: string;
  hoof: HoofPosition;
  gaitGrade: GaitGrade;
  angleDiff: number;
  shoeType: string;
  nails: string;
  farrier: string;
  shodAt: string;
  nextReviewAt: string;
  note: string;
}

export function validateShoeingInput(input: ShoeingInput): string[] {
  const errors: string[] = [];
  if (!input.horseId.trim()) errors.push("请填写马匹编号");
  if (!input.farrier.trim()) errors.push("请填写记录人（修蹄师）");
  if (!input.shoeType.trim()) errors.push("请填写蹄铁类型");
  if (!input.nails.trim()) errors.push("请填写钉位");
  if (![0, 1, 2, 3].includes(input.gaitGrade)) errors.push("请选择步态分级（0-3级）");
  if (!Number.isFinite(input.angleDiff) || input.angleDiff < 0)
    errors.push("请填写左右蹄角差（度，≥0）");
  if (!input.shodAt) errors.push("请选择修蹄日期");
  if (!input.nextReviewAt) errors.push("请选择下次复查日期");
  if (input.shodAt && input.nextReviewAt && input.nextReviewAt < input.shodAt)
    errors.push("下次复查日期不能早于修蹄日期");
  return errors;
}

/* -------------------------------- 判定与推导 ------------------------------- */

/** 步态三级或左右蹄角差超过 4° → 异常 */
export function isAbnormalShoeing(input: { gaitGrade: number; angleDiff: number }): boolean {
  return input.gaitGrade >= ABNORMAL_GAIT_GRADE || input.angleDiff > MAX_ANGLE_DIFF_DEG;
}

/** 同一匹马同一蹄位仅留一条生效记录 */
export function activeRecordFor(
  state: FarrierState,
  horseId: string,
  hoof: HoofPosition
): ShoeingRecord | undefined {
  return state.records.find(
    (r) => r.status === "active" && r.horseId === horseId && r.hoof === hoof
  );
}

export function reviewsForRecord(state: FarrierState, record: ShoeingRecord): ReviewEntry[] {
  return state.reviews
    .filter((rv) => rv.recordId === record.id)
    .sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt) || a.id.localeCompare(b.id));
}

/** 当前修订版本下仍有效的复查（换铁 / 修订后旧复查已失效，不计入） */
export function validReviewsForRecord(
  state: FarrierState,
  record: ShoeingRecord
): ReviewEntry[] {
  return reviewsForRecord(state, record).filter(
    (rv) => rv.valid && rv.recordRevision === record.revision
  );
}

/** 连续「正常且鞋钉牢固」次数（从最近一次往前数，遇中断即止） */
export function recoveryStreak(validReviews: ReviewEntry[]): number {
  let streak = 0;
  for (let i = validReviews.length - 1; i >= 0; i -= 1) {
    const rv = validReviews[i];
    if (rv.result === "normal" && rv.nailsSecure) streak += 1;
    else break;
  }
  return streak;
}

export type HoofTrack = "none" | "normal" | "abnormal";

export interface HoofEvaluation {
  horseId: string;
  hoof: HoofPosition;
  record?: ShoeingRecord;
  track: HoofTrack;
  /** 登记指标正常但复查发现异常，被转入异常复查 */
  escalated: boolean;
  /** 连续两次正常且鞋钉牢固 → 闭环 */
  cleared: boolean;
  streak: number;
  /** 是否可训练：异常蹄位在闭环恢复前一律不可训练 */
  trainable: boolean;
  /** 是否仍待复查（闭环前都算待复查） */
  pendingReview: boolean;
  validReviews: ReviewEntry[];
  statusLabel: string;
}

export function evaluateHoof(
  state: FarrierState,
  horseId: string,
  hoof: HoofPosition
): HoofEvaluation {
  const record = activeRecordFor(state, horseId, hoof);
  if (!record) {
    return {
      horseId,
      hoof,
      track: "none",
      escalated: false,
      cleared: false,
      streak: 0,
      trainable: true,
      pendingReview: false,
      validReviews: [],
      statusLabel: "无修蹄记录",
    };
  }

  const validReviews = validReviewsForRecord(state, record);
  const streak = recoveryStreak(validReviews);
  const escalated = validReviews.some((rv) => rv.result === "abnormal");
  const abnormal = isAbnormalShoeing(record) || escalated;
  const cleared = streak >= RECOVERY_STREAK_REQUIRED;
  const track: HoofTrack = abnormal ? "abnormal" : "normal";
  const trainable = !abnormal || cleared;
  const pendingReview = !cleared;

  let statusLabel: string;
  if (cleared) {
    statusLabel = abnormal ? "已恢复 · 可训练" : "复查通过 · 可训练";
  } else if (abnormal) {
    statusLabel = `异常复查中 · 不可训练（连续正常 ${streak}/${RECOVERY_STREAK_REQUIRED}）`;
  } else if (streak > 0) {
    statusLabel = `复查中 · 可训练（连续正常 ${streak}/${RECOVERY_STREAK_REQUIRED}）`;
  } else {
    statusLabel = "待复查 · 可训练";
  }

  return {
    horseId,
    hoof,
    record,
    track,
    escalated,
    cleared,
    streak,
    trainable,
    pendingReview,
    validReviews,
    statusLabel,
  };
}

/* -------------------------------- 状态流转 -------------------------------- */

/**
 * 登记修蹄 / 更换蹄铁。
 * 若该蹄位已有生效记录：旧记录转为 superseded，其全部复查立即失效（shoe-replaced）。
 */
export function registerShoeing(
  state: FarrierState,
  input: ShoeingInput,
  now: string
): { state: FarrierState; record: ShoeingRecord; superseded?: ShoeingRecord } {
  const errors = validateShoeingInput(input);
  if (errors.length) throw new RuleError(errors.join("；"));

  const horseId = input.horseId.trim();
  const record: ShoeingRecord = {
    id: uid("shoe"),
    horseId,
    hoof: input.hoof,
    gaitGrade: input.gaitGrade,
    angleDiff: input.angleDiff,
    shoeType: input.shoeType.trim(),
    nails: input.nails.trim(),
    farrier: input.farrier.trim(),
    shodAt: input.shodAt,
    nextReviewAt: input.nextReviewAt,
    note: input.note.trim(),
    revision: 0,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  let records = [...state.records, record];
  let reviews = state.reviews;
  let superseded: ShoeingRecord | undefined;

  const previous = activeRecordFor(state, horseId, input.hoof);
  if (previous) {
    superseded = {
      ...previous,
      status: "superseded",
      supersededAt: now,
      supersededBy: record.id,
    };
    records = records.map((r) => (r.id === previous.id ? superseded! : r));
    reviews = reviews.map((rv) =>
      rv.recordId === previous.id && rv.valid
        ? { ...rv, valid: false, invalidReason: "shoe-replaced" as const }
        : rv
    );
  }

  return { state: { records, reviews }, record, superseded };
}

/**
 * 修订原记录：版本号 +1，该记录全部旧复查立即失效（record-revised）。
 * 马匹编号与蹄位不可改（否则等同于更换蹄铁，应走 registerShoeing）。
 */
export function reviseShoeing(
  state: FarrierState,
  recordId: string,
  patch: ShoeingInput,
  now: string
): { state: FarrierState; record: ShoeingRecord } {
  const errors = validateShoeingInput(patch);
  if (errors.length) throw new RuleError(errors.join("；"));

  const current = state.records.find((r) => r.id === recordId);
  if (!current) throw new RuleError("未找到要修订的修蹄记录");
  if (current.status !== "active") throw new RuleError("该记录已被更换，无法修订");

  const revised: ShoeingRecord = {
    ...current,
    gaitGrade: patch.gaitGrade,
    angleDiff: patch.angleDiff,
    shoeType: patch.shoeType.trim(),
    nails: patch.nails.trim(),
    farrier: patch.farrier.trim(),
    shodAt: patch.shodAt,
    nextReviewAt: patch.nextReviewAt,
    note: patch.note.trim(),
    revision: current.revision + 1,
    updatedAt: now,
  };

  const records = state.records.map((r) => (r.id === recordId ? revised : r));
  const reviews = state.reviews.map((rv) =>
    rv.recordId === recordId && rv.valid
      ? { ...rv, valid: false, invalidReason: "record-revised" as const }
      : rv
  );

  return { state: { records, reviews }, record: revised };
}

export interface ReviewInput {
  idempotencyKey: string;
  recordId: string;
  reviewer: string;
  result: ReviewResult;
  nailsSecure: boolean;
  disposition: string;
}

/**
 * 提交复查处置。
 * - 重复提交（同一幂等键）直接沿用首次结果，不产生新记录；
 * - 复查人必须与记录人不同；
 * - 已闭环（连续两次正常且鞋钉牢固）的蹄位不再接受复查。
 */
export function submitReview(
  state: FarrierState,
  input: ReviewInput,
  now: string
): { state: FarrierState; review: ReviewEntry; deduplicated: boolean } {
  const existing = state.reviews.find((rv) => rv.idempotencyKey === input.idempotencyKey);
  if (existing) return { state, review: existing, deduplicated: true };

  if (!input.idempotencyKey.trim()) throw new RuleError("缺少提交标识，请刷新后重试");
  if (!input.reviewer.trim()) throw new RuleError("请填写复查人");
  if (!input.disposition.trim()) throw new RuleError("请填写处置意见");

  const record = state.records.find((r) => r.id === input.recordId);
  if (!record) throw new RuleError("未找到对应的修蹄记录");
  if (record.status !== "active") throw new RuleError("该记录已被更换，无法复查");

  if (input.reviewer.trim() === record.farrier) {
    throw new RuleError(`复查须由另一人填写：复查人不能与记录人（${record.farrier}）相同`);
  }

  const evaluation = evaluateHoof(state, record.horseId, record.hoof);
  if (evaluation.cleared) {
    throw new RuleError("该蹄位已连续两次复查正常且鞋钉牢固，复查闭环已完成");
  }

  const review: ReviewEntry = {
    id: uid("rev"),
    idempotencyKey: input.idempotencyKey,
    recordId: record.id,
    recordRevision: record.revision,
    horseId: record.horseId,
    hoof: record.hoof,
    reviewer: input.reviewer.trim(),
    result: input.result,
    nailsSecure: input.nailsSecure,
    disposition: input.disposition.trim(),
    reviewedAt: now,
    valid: true,
  };

  return { state: { ...state, reviews: [...state.reviews, review] }, review, deduplicated: false };
}

/* -------------------------------- 查询视图 -------------------------------- */

export interface ReminderItem {
  record: ShoeingRecord;
  evaluation: HoofEvaluation;
  overdue: boolean;
  daysUntil: number;
}

/** 复查提醒：所有未闭环的生效记录，按下次复查日期升序 */
export function pendingReminders(state: FarrierState, today: string): ReminderItem[] {
  return state.records
    .filter((r) => r.status === "active")
    .map((record) => ({ record, evaluation: evaluateHoof(state, record.horseId, record.hoof) }))
    .filter((item) => item.evaluation.pendingReview)
    .map((item) => ({
      ...item,
      overdue: item.record.nextReviewAt < today,
      daysUntil: daysBetween(today, item.record.nextReviewAt),
    }))
    .sort(
      (a, b) =>
        a.record.nextReviewAt.localeCompare(b.record.nextReviewAt) ||
        a.record.horseId.localeCompare(b.record.horseId)
    );
}

export interface HorseSummary {
  horseId: string;
  hooves: HoofEvaluation[];
  trainable: boolean;
  abnormalCount: number;
  pendingCount: number;
  lastShodAt?: string;
}

export function listHorses(state: FarrierState): HorseSummary[] {
  const ids = Array.from(new Set(state.records.map((r) => r.horseId))).sort();
  return ids.map((horseId) => {
    const hooves = HOOF_POSITIONS.map((hoof) => evaluateHoof(state, horseId, hoof));
    const activeRecords = hooves
      .map((e) => e.record)
      .filter((r): r is ShoeingRecord => Boolean(r));
    return {
      horseId,
      hooves,
      trainable: hooves.every((e) => e.trainable),
      abnormalCount: hooves.filter((e) => e.track === "abnormal" && !e.cleared).length,
      pendingCount: hooves.filter((e) => e.pendingReview).length,
      lastShodAt: activeRecords.map((r) => r.shodAt).sort().slice(-1)[0],
    };
  });
}

export interface Metrics {
  horses: number;
  pendingReviews: number;
  abnormalHooves: number;
  shoeReplacements: number;
}

export function computeMetrics(state: FarrierState, today: string): Metrics {
  const horses = listHorses(state);
  return {
    horses: horses.length,
    pendingReviews: pendingReminders(state, today).length,
    abnormalHooves: horses.reduce((n, h) => n + h.abnormalCount, 0),
    shoeReplacements: state.records.filter((r) => r.status === "superseded").length,
  };
}
