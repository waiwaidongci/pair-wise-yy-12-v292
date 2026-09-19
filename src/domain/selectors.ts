// 派生查询层：列表、提醒、统计全部由同一份 AppState 计算，
// 不保存任何会漂移的缓存，保证“列表 / 提醒 / 刷新后”口径一致。
import {
  canResumeTraining,
  consecutiveNormalCount,
  getCycleDueDate,
  hoofTrainability,
  horseTrainable,
  isAbnormal,
  isCycleAbnormal,
  isRoundNormal,
  isTreatmentComplete,
  reminderLevel,
  roundNeedsTreatment,
} from "./rules";
import type {
  AppState,
  GaitGrade,
  HoofPosition,
  RecheckCycle,
  ShoeRecord,
} from "./types";

export interface HoofView {
  position: HoofPosition;
  record?: ShoeRecord;
  activeCycle?: RecheckCycle;
}

export interface HorseView {
  id: string;
  name: string;
  hooves: HoofView[];
  trainable: boolean;
  /** 冻结原因（取首个不可训练蹄位） */
  freezeReason: string | null;
  abnormalHoofCount: number;
  pendingCount: number;
}

export type CycleStatusKind =
  | "abnormal"
  | "normal-pending"
  | "awaiting-treatment"
  | "ready-to-resume"
  | "closed"
  | "invalidated";

export interface CycleView {
  cycle: RecheckCycle;
  record: ShoeRecord;
  horseName: string;
  abnormal: boolean;
  kind: CycleStatusKind;
  due: string;
  reminder: ReturnType<typeof reminderLevel>;
  normalStreak: number;
  canResume: boolean;
  awaitingTreatmentRoundId: string | null;
}

const REASON_TEXT: Record<string, string> = {
  "abnormal-findings": "步态三级或左右蹄角差超过 4°",
  "active-abnormal-cycle": "异常复查未关闭",
};

export function getHorseViews(state: AppState): HorseView[] {
  return state.horses
    .map((horse): HorseView => {
      const hooves: HoofView[] = (["LF", "RF", "LH", "RH"] as const).map(
        (position) => ({
          position,
          record: state.records.find(
            (r) =>
              r.horseId === horse.id &&
              r.position === position &&
              !r.superseded,
          ),
          activeCycle: state.cycles.find(
            (c) =>
              c.horseId === horse.id &&
              c.position === position &&
              c.status === "active",
          ),
        }),
      );
      const withRecord = hooves.filter(
        (h): h is HoofView & { record: ShoeRecord } => Boolean(h.record),
      );
      const trainable =
        withRecord.length === 0 ? true : horseTrainable(withRecord);

      let freezeReason: string | null = null;
      for (const h of withRecord) {
        const verdict = hoofTrainability(h.record, h.activeCycle);
        if (!verdict.ok) {
          freezeReason = `${positionLabel(h.position)}：${REASON_TEXT[verdict.reason] ?? "复查未完成"}`;
          break;
        }
      }
      return {
        id: horse.id,
        name: horse.name,
        hooves,
        trainable,
        freezeReason,
        abnormalHoofCount: withRecord.filter((h) =>
          hoofAbnormal(h.record, h.activeCycle),
        ).length,
        pendingCount: hooves.filter((h) => h.activeCycle).length,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function hoofAbnormal(
  record: ShoeRecord,
  cycle: RecheckCycle | undefined,
): boolean {
  if (
    isAbnormal({
      gaitGrade: record.gaitGrade,
      angleLeft: record.angleLeft,
      angleRight: record.angleRight,
    })
  ) {
    return true;
  }
  return cycle ? isCycleAbnormal(cycle) : false;
}

export function positionLabel(position: HoofPosition): string {
  return { LF: "左前蹄", RF: "右前蹄", LH: "左后蹄", RH: "右后蹄" }[position];
}

/** 每匹马每个蹄位只展开一条 active 周期（存储层已保证唯一，这里再做防线） */
export function getCycleViews(state: AppState, today: string): CycleView[] {
  const seen = new Set<string>();
  const views: CycleView[] = [];
  for (const cycle of state.cycles) {
    const key = `${cycle.horseId}:${cycle.position}`;
    if (cycle.status === "active") {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const record = state.records.find((r) => r.id === cycle.recordId);
    if (!record) continue;
    const horse = state.horses.find((h) => h.id === cycle.horseId);
    const abnormal = isCycleAbnormal(cycle);
    const due = getCycleDueDate(cycle, record);

    let kind: CycleStatusKind;
    let awaitingRound: string | null = null;
    if (cycle.status === "closed-normal") kind = "closed";
    else if (cycle.status === "invalidated") kind = "invalidated";
    else {
      const last = cycle.rounds[cycle.rounds.length - 1];
      if (last && roundNeedsTreatment(last)) {
        kind = "awaiting-treatment";
        awaitingRound = last.id;
      } else if (canResumeTraining(cycle)) {
        kind = "ready-to-resume";
      } else if (abnormal) {
        kind = "abnormal";
      } else {
        kind = "normal-pending";
      }
    }

    views.push({
      cycle,
      record,
      horseName: horse?.name ?? cycle.horseId,
      abnormal,
      kind,
      due,
      reminder: reminderLevel(cycle, due, today),
      normalStreak: consecutiveNormalCount(cycle),
      canResume: canResumeTraining(cycle),
      awaitingTreatmentRoundId: awaitingRound,
    });
  }
  // active 优先，其次按到期日
  return views.sort((a, b) => {
    const rank = (v: CycleView) =>
      v.cycle.status === "active"
        ? v.reminder === "overdue"
          ? 0
          : v.reminder === "due-today"
            ? 1
            : 2
        : 3;
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.due.localeCompare(b.due);
  });
}

export interface Metrics {
  pending: number;
  abnormal: number;
  awaitingTreatment: number;
  overdue: number;
  trainableHorses: number;
  totalHorses: number;
  reshoeCount: number;
}

export function getMetrics(state: AppState, today: string): Metrics {
  const views = getCycleViews(state, today);
  const active = views.filter((v) => v.cycle.status === "active");
  const horses = getHorseViews(state);
  return {
    pending: active.length,
    abnormal: active.filter((v) => v.abnormal).length,
    awaitingTreatment: active.filter(
      (v) => v.kind === "awaiting-treatment",
    ).length,
    overdue: active.filter((v) => v.reminder === "overdue").length,
    trainableHorses: horses.filter((h) => h.trainable).length,
    totalHorses: horses.length,
    reshoeCount: state.events.filter((e) => e.type === "reshoe").length,
  };
}

export function roundOutcome(round: {
  gaitGrade: GaitGrade;
  angleLeft: number;
  angleRight: number;
  shoeFirm: boolean;
}): { normal: boolean; flags: string[] } {
  const flags: string[] = [];
  if (round.gaitGrade >= 3) flags.push("步态三级");
  if (
    isAbnormal({
      gaitGrade: round.gaitGrade,
      angleLeft: round.angleLeft,
      angleRight: round.angleRight,
    }) &&
    round.gaitGrade < 3
  ) {
    flags.push("左右蹄角差超 4°");
  }
  if (!round.shoeFirm) flags.push("鞋钉松动");
  if (round.gaitGrade === 2 && !flags.includes("步态三级")) {
    flags.push("步态二级（不计正常）");
  }
  return { normal: isRoundNormal(round), flags };
}

export { isTreatmentComplete };
