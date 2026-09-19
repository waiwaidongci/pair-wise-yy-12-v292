// 业务规则层：所有判定集中在此，页面与存储都不自行解释规则。
import type {
  GaitGrade,
  RecheckCycle,
  RecheckRound,
  ShoeRecord,
} from "./types";

export const HOOF_POSITIONS = ["LF", "RF", "LH", "RH"] as const;
export const HOOF_LABEL: Record<string, string> = {
  LF: "左前蹄",
  RF: "右前蹄",
  LH: "左后蹄",
  RH: "右后蹄",
};

export const GAIT_LABEL: Record<GaitGrade, string> = {
  1: "一级 · 步态正常",
  2: "二级 · 轻度异常",
  3: "三级 · 明显异常",
};

/** 常用钉位 */
export const NAIL_OPTIONS = [
  "内1",
  "内2",
  "内3",
  "外1",
  "外2",
  "外3",
  "跟钉L",
  "跟钉R",
];

/** 左右蹄角差（绝对值，度） */
export function angleDiff(angleLeft: number, angleRight: number): number {
  return Math.abs(angleLeft - angleRight);
}

export const ANGLE_LIMIT = 4;
export const GAIT_ABNORMAL = 3;

/**
 * 异常判据（硬冻结）：步态三级 或 左右蹄角差超过四度。
 * 命中则只能进入“异常复查”，且不得列为可训练。
 */
export function isAbnormal(input: {
  gaitGrade: GaitGrade;
  angleLeft: number;
  angleRight: number;
}): boolean {
  return (
    input.gaitGrade >= GAIT_ABNORMAL ||
    angleDiff(input.angleLeft, input.angleRight) > ANGLE_LIMIT
  );
}

/** 该档案 / 复查是否存在登记问题：步态三级或角差超限（不考虑鞋钉） */
export function hasMeasureAbnormality(
  gaitGrade: GaitGrade,
  angleLeft: number,
  angleRight: number,
): boolean {
  return isAbnormal({ gaitGrade, angleLeft, angleRight });
}

/**
 * 单轮复查“正常”判据：步态一级 + 左右蹄角差不超过 4° + 鞋钉牢固。
 * 步态二级属于轻度异常，不计为正常（连续计数被打断）。
 */
export function isRoundNormal(round: {
  gaitGrade: GaitGrade;
  angleLeft: number;
  angleRight: number;
  shoeFirm: boolean;
}): boolean {
  return (
    round.gaitGrade === 1 &&
    !isAbnormal({
      gaitGrade: round.gaitGrade,
      angleLeft: round.angleLeft,
      angleRight: round.angleRight,
    }) &&
    round.shoeFirm
  );
}

/** 末尾连续正常轮数（处置不完整的轮次不计入） */
export function consecutiveNormalCount(cycle: RecheckCycle): number {
  let count = 0;
  for (let i = cycle.rounds.length - 1; i >= 0; i--) {
    const round = cycle.rounds[i];
    if (isTreatmentComplete(round) && isRoundNormal(round)) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

/** 一轮复查是否已由“另一人”填写处置 */
export function isTreatmentComplete(round: RecheckRound): boolean {
  return (
    round.treatments.length > 0 &&
    round.treatments.some((t) => t.author.trim() !== "" && t.content.trim() !== "")
  );
}

/** 是否满足恢复条件：连续两次正常且鞋钉牢固（含在 isRoundNormal 内） */
export function canResumeTraining(cycle: RecheckCycle): boolean {
  return cycle.status === "active" && consecutiveNormalCount(cycle) >= 2;
}

/** 周期是否异常复查：建档异常，或期间任一轮出现过三级/角差异常 */
export function isCycleAbnormal(cycle: RecheckCycle): boolean {
  if (cycle.originAbnormal) return true;
  return cycle.rounds.some(
    (r) =>
      hasMeasureAbnormality(r.gaitGrade, r.angleLeft, r.angleRight) ||
      !r.shoeFirm,
  );
}

/** 轮次是否需要处置（任何复查轮都必须由另一人处置后才算完成） */
export function roundNeedsTreatment(round: RecheckRound): boolean {
  return !isTreatmentComplete(round);
}

/** 周期下一次应复查日期（建档日期 + 间隔） */
export function nextDueDate(
  record: Pick<ShoeRecord, "date" | "recheckIntervalDays">,
): string {
  const base = new Date(record.date + "T00:00:00");
  base.setDate(base.getDate() + record.recheckIntervalDays);
  return base.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 周期当前应复查日期：
 * 没有复查轮 → 建档日期 + 间隔；之后每轮复查日期 + 间隔。
 */
export function getCycleDueDate(
  cycle: Pick<RecheckCycle, "rounds">,
  record: Pick<ShoeRecord, "date" | "recheckIntervalDays">,
): string {
  const last = cycle.rounds[cycle.rounds.length - 1];
  return addDays(
    last ? last.date : record.date,
    record.recheckIntervalDays,
  );
}

/** 复查提醒等级（针对 active 周期）；due 由 getCycleDueDate 计算 */
export function reminderLevel(
  cycle: RecheckCycle,
  due: string,
  today: string,
): "overdue" | "due-today" | "upcoming" | null {
  if (cycle.status !== "active") return null;
  // 有已登记但未由另一人处置的轮次：处置优先
  const last = cycle.rounds[cycle.rounds.length - 1];
  if (last && roundNeedsTreatment(last)) return "upcoming";
  if (due < today) return "overdue";
  if (due === today) return "due-today";
  return "upcoming";
}

export type Trainability =
  | { ok: true; reason: null }
  | { ok: false; reason: "abnormal-findings" | "active-abnormal-cycle" | "pending-normal-cycle" };

/**
 * 单条“当前档案”的可训练判定。
 * - 档案本身异常（步态三级 / 角差 > 4°）→ 不可训练
 * - 存在 active 异常复查周期 → 不可训练
 * - 存在 active 普通待复查周期 → 可训练但有待办（ok=true，调用方可另行提示）
 * 题目硬要求仅为“异常不得列为可训练”，普通待复查不冻结训练。
 */
export function hoofTrainability(
  record: ShoeRecord,
  activeCycle: RecheckCycle | undefined,
): Trainability {
  if (
    isAbnormal({
      gaitGrade: record.gaitGrade,
      angleLeft: record.angleLeft,
      angleRight: record.angleRight,
    })
  ) {
    return { ok: false, reason: "abnormal-findings" };
  }
  if (activeCycle) {
    if (isCycleAbnormal(activeCycle)) {
      return { ok: false, reason: "active-abnormal-cycle" };
    }
    return { ok: true, reason: null };
  }
  return { ok: true, reason: null };
}

/** 马匹维度：任一当前蹄位不可训练，则整马不可训练 */
export function horseTrainable(
  entries: { record: ShoeRecord; activeCycle?: RecheckCycle }[],
): boolean {
  return entries.every((e) => hoofTrainability(e.record, e.activeCycle).ok);
}

/** 校验：处置人必须是复查人之外的另一人 */
export function treatmentAuthorError(
  reviewer: string,
  author: string,
): string | null {
  if (!author.trim()) return "处置人必填（须为复查人之外的另一人）";
  if (reviewer.trim() && author.trim() === reviewer.trim()) {
    return "处置必须由另一人填写，处置人不能与复查人相同";
  }
  return null;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
