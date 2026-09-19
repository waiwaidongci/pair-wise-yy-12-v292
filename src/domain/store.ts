// 存储层：负责状态变更、事件留痕与 localStorage 持久化。
// 业务判定一律调用 domain/rules，本层只做“校验 → 改状态 → 发事件”。
import {
  canResumeTraining,
  isAbnormal,
  isTreatmentComplete,
  todayISO,
  treatmentAuthorError,
} from "./rules";
import { seedState } from "./seed";
import type {
  AppState,
  Horse,
  RecheckCycle,
  RecheckInput,
  RecheckRound,
  RecordInput,
  ShoeChangeEvent,
  ShoeRecord,
  Treatment,
  TreatmentInput,
} from "./types";

const STORAGE_KEY = "hoofcare-archive-v1";

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

function uid(prefix: string): string {
  const raw =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}-${raw}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

export class Store {
  private state: AppState;
  private listeners = new Set<() => void>();

  constructor(initial?: AppState) {
    this.state = initial ?? loadState() ?? seedState();
  }

  getState(): AppState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    persistState(this.state);
    this.listeners.forEach((l) => l());
  }

  private pushEvent(
    event: Omit<ShoeChangeEvent, "id" | "at">,
  ): void {
    this.state.events.push({ id: uid("evt"), at: nowISO(), ...event });
  }

  /** 新增马匹（编号唯一） */
  addHorse(id: string, name: string): ActionResult {
    const horseId = id.trim();
    if (!horseId) return { ok: false, message: "马匹编号必填" };
    if (this.state.horses.some((h) => h.id === horseId)) {
      return { ok: false, message: "马匹编号已存在" };
    }
    const horse: Horse = { id: horseId, name: name.trim() || horseId };
    this.state = { ...this.state, horses: [...this.state.horses, horse] };
    this.emit();
    return { ok: true, message: `已新增马匹 ${horseId}` };
  }

  /**
   * 新建修蹄档案（首次建档）。
   * 同一匹马同一蹄位只允许有一个当前版本；已存在时须走“换蹄铁/修订”。
   */
  createRecord(input: RecordInput): ActionResult {
    const validate = validateRecordInput(input);
    if (validate) return { ok: false, message: validate };
    if (this.currentRecord(input.horseId, input.position)) {
      return {
        ok: false,
        message: `${input.horseId} 该蹄位已有当前档案，请使用“更换蹄铁”或“修订”`,
      };
    }
    if (!this.state.horses.some((h) => h.id === input.horseId.trim())) {
      this.state = {
        ...this.state,
        horses: [
          ...this.state.horses,
          {
            id: input.horseId.trim(),
            name: input.horseName?.trim() || input.horseId.trim(),
          },
        ],
      };
    }

    const record = this.buildRecord(input, 1);
    const cycle = this.openCycle(record, input.farrier);
    this.state = {
      ...this.state,
      records: [...this.state.records, record],
      cycles: [...this.state.cycles, cycle],
    };
    this.pushEvent({
      type: "create",
      horseId: record.horseId,
      position: record.position,
      revision: 1,
      recordId: record.id,
      operator: record.farrier,
      detail: `建档：${record.shoeType}，步态${record.gaitGrade}级，角差${Math.abs(
        record.angleLeft - record.angleRight,
      )}°${cycle.originAbnormal ? "（异常，进入异常复查）" : ""}`,
    });
    this.emit();
    return {
      ok: true,
      message: cycle.originAbnormal
        ? "档案已建立：检测异常，仅进入异常复查，不得列为可训练"
        : "档案已建立，待复查记录已生成",
    };
  }

  /**
   * 更换蹄铁：旧档案标记取代、旧待复查周期立即失效，
   * 按新数据产生新版本与新周期（每蹄位仍只有一条待复查）。
   */
  reshoe(
    currentId: string,
    input: Omit<RecordInput, "horseId" | "position">,
  ): ActionResult {
    const current = this.state.records.find((r) => r.id === currentId);
    if (!current || current.superseded) {
      return { ok: false, message: "未找到当前档案" };
    }
    const full: RecordInput = {
      ...input,
      horseId: current.horseId,
      position: current.position,
    };
    const validate = validateRecordInput(full);
    if (validate) return { ok: false, message: validate };

    return this.replaceRecord(current, full, "reshoe", full.farrier);
  }

  /**
   * 修订原记录：旧待复查周期立即失效（已填写的复查结果全部作废，
   * 连续正常计数清零），按修订后数据重开周期。
   */
  revise(
    currentId: string,
    patch: Partial<
      Pick<
        RecordInput,
        | "gaitGrade"
        | "gaitNote"
        | "angleLeft"
        | "angleRight"
        | "shoeType"
        | "nailPositions"
        | "recheckIntervalDays"
        | "note"
        | "farrier"
      >
    >,
  ): ActionResult {
    const current = this.state.records.find((r) => r.id === currentId);
    if (!current || current.superseded) {
      return { ok: false, message: "未找到当前档案" };
    }
    const full: RecordInput = {
      horseId: current.horseId,
      position: current.position,
      date: current.date,
      gaitGrade: patch.gaitGrade ?? current.gaitGrade,
      gaitNote: patch.gaitNote ?? current.gaitNote,
      angleLeft: patch.angleLeft ?? current.angleLeft,
      angleRight: patch.angleRight ?? current.angleRight,
      shoeType: patch.shoeType ?? current.shoeType,
      nailPositions: patch.nailPositions ?? current.nailPositions,
      farrier: patch.farrier ?? current.farrier,
      recheckIntervalDays:
        patch.recheckIntervalDays ?? current.recheckIntervalDays,
      note: patch.note ?? current.note,
    };
    const validate = validateRecordInput(full);
    if (validate) return { ok: false, message: validate };

    return this.replaceRecord(current, full, "revise", full.farrier);
  }

  private replaceRecord(
    current: ShoeRecord,
    input: RecordInput,
    reason: "reshoe" | "revise",
    operator: string,
  ): ActionResult {
    const activeBefore = this.activeCycle(current.horseId, current.position);

    const records = this.state.records.map((r) =>
      r.id === current.id
        ? {
            ...r,
            superseded: true,
            supersededReason: reason,
            updatedAt: nowISO(),
          }
        : r,
    );
    const next = this.buildRecord(input, current.revision + 1);
    records.push(next);

    const cycles = this.state.cycles.map((c) =>
      activeBefore && c.id === activeBefore.id
        ? {
            ...c,
            status: "invalidated" as const,
            invalidatedAt: nowISO(),
            invalidatedReason: reason,
            newRecordId: next.id,
          }
        : c,
    );
    const cycle = this.openCycle(next, operator);
    cycles.push(cycle);

    this.state = { ...this.state, records, cycles };
    this.pushEvent({
      type: reason,
      horseId: next.horseId,
      position: next.position,
      revision: next.revision,
      recordId: next.id,
      operator,
      detail:
        reason === "reshoe"
          ? `更换蹄铁：${current.shoeType} → ${next.shoeType}，旧复查立即失效`
          : "修订原记录，旧复查立即失效并按新数据重开",
    });
    this.emit();
    return {
      ok: true,
      message:
        reason === "reshoe"
          ? "蹄铁已更换：旧复查立即失效，已按新数据重开待复查"
          : "原记录已修订：旧复查立即失效，连续正常计数清零",
    };
  }

  /**
   * 提交复查。
   * 同一周期同一日期重复提交 → 沿用首次结果，不产生新数据。
   */
  submitRecheck(cycleId: string, input: RecheckInput): ActionResult {
    const cycle = this.state.cycles.find((c) => c.id === cycleId);
    if (!cycle) return { ok: false, message: "复查记录不存在" };
    if (cycle.status !== "active") {
      return { ok: false, message: "该复查已失效或关闭，不能再提交" };
    }
    if (!input.date) return { ok: false, message: "复查日期必填" };
    if (!input.reviewer.trim()) return { ok: false, message: "复查人必填" };

    // 同一日期重复提交：无论处置状态如何，都沿用首次结果
    const duplicate = cycle.rounds.find((r) => r.date === input.date);
    if (duplicate) {
      return {
        ok: true,
        message: `该日期已提交过复查，沿用首次结果（${input.date} 由 ${duplicate.reviewer} 登记）`,
      };
    }

    const lastRound = cycle.rounds[cycle.rounds.length - 1];
    if (lastRound && !isTreatmentComplete(lastRound)) {
      return {
        ok: false,
        message:
          "上一轮复查尚未由另一人填写处置，处置完成前不能登记下一轮",
      };
    }

    const round: RecheckRound = {
      id: uid("round"),
      date: input.date,
      reviewer: input.reviewer.trim(),
      gaitGrade: input.gaitGrade,
      angleLeft: input.angleLeft,
      angleRight: input.angleRight,
      shoeFirm: input.shoeFirm,
      note: input.note?.trim() ?? "",
      submittedAt: nowISO(),
      treatments: [],
    };
    this.state = {
      ...this.state,
      cycles: this.state.cycles.map((c) =>
        c.id === cycle.id ? { ...c, rounds: [...c.rounds, round] } : c,
      ),
    };
    const abnormal = isAbnormal({
      gaitGrade: input.gaitGrade,
      angleLeft: input.angleLeft,
      angleRight: input.angleRight,
    });
    this.pushEvent({
      type: "revise",
      horseId: cycle.horseId,
      position: cycle.position,
      revision: cycle.revision,
      recordId: cycle.recordId,
      operator: input.reviewer.trim(),
      detail: `复查登记（${input.date}）：步态${input.gaitGrade}级${
        abnormal ? "，异常" : ""
      }${input.shoeFirm ? "" : "，鞋钉松动"}，待另一人处置`,
    });
    this.emit();
    return {
      ok: true,
      message: abnormal
        ? "复查已登记：结果异常，该蹄位继续冻结训练，须另一人填写处置"
        : "复查已登记，须由另一人填写处置后方计入连续正常",
    };
  }

  /** 另一人填写处置 */
  addTreatment(
    cycleId: string,
    roundId: string,
    input: TreatmentInput,
  ): ActionResult {
    const cycle = this.state.cycles.find((c) => c.id === cycleId);
    if (!cycle || cycle.status !== "active") {
      return { ok: false, message: "复查已失效或关闭" };
    }
    const round = cycle.rounds.find((r) => r.id === roundId);
    if (!round) return { ok: false, message: "复查轮次不存在" };

    const authorError = treatmentAuthorError(round.reviewer, input.author);
    if (authorError) return { ok: false, message: authorError };
    if (!input.content.trim()) return { ok: false, message: "处置内容必填" };

    const treatment: Treatment = {
      id: uid("treat"),
      author: input.author.trim(),
      content: input.content.trim(),
      createdAt: nowISO(),
    };
    this.state = {
      ...this.state,
      cycles: this.state.cycles.map((c) =>
        c.id === cycle.id
          ? {
              ...c,
              rounds: c.rounds.map((r) =>
                r.id === round.id
                  ? { ...r, treatments: [...r.treatments, treatment] }
                  : r,
              ),
            }
          : c,
      ),
    };
    this.emit();

    const updated = this.state.cycles.find((c) => c.id === cycleId)!;
    if (canResumeTraining(updated)) {
      return {
        ok: true,
        message:
          "处置已登记：已连续两次正常且鞋钉牢固，可执行恢复训练操作",
      };
    }
    return { ok: true, message: "处置已登记（须为复查人之外的另一人）" };
  }

  /** 连续两次正常且鞋钉牢固 → 恢复训练，关闭复查周期 */
  resumeTraining(cycleId: string, operator: string): ActionResult {
    const cycle = this.state.cycles.find((c) => c.id === cycleId);
    if (!cycle) return { ok: false, message: "复查记录不存在" };
    if (cycle.status !== "active") {
      return { ok: false, message: "该复查已失效或关闭" };
    }
    if (!operator.trim()) return { ok: false, message: "请填写确认人" };
    if (!canResumeTraining(cycle)) {
      return {
        ok: false,
        message: "恢复条件未满足：须连续两次复查正常且鞋钉牢固",
      };
    }
    this.state = {
      ...this.state,
      cycles: this.state.cycles.map((c) =>
        c.id === cycle.id
          ? {
              ...c,
              status: "closed-normal",
              closedAt: nowISO(),
              closedBy: operator.trim(),
            }
          : c,
      ),
    };
    this.pushEvent({
      type: "revise",
      horseId: cycle.horseId,
      position: cycle.position,
      revision: cycle.revision,
      recordId: cycle.recordId,
      operator: operator.trim(),
      detail: "连续两次正常且鞋钉牢固，复查关闭、恢复训练",
    });
    this.emit();
    return { ok: true, message: "已恢复训练，复查闭环关闭" };
  }

  resetToSeed(): void {
    this.state = seedState();
    this.emit();
  }

  // ---- 内部构造 ----

  private buildRecord(input: RecordInput, revision: number): ShoeRecord {
    const ts = nowISO();
    return {
      id: uid("rec"),
      horseId: input.horseId.trim(),
      position: input.position,
      revision,
      date: input.date,
      gaitGrade: input.gaitGrade,
      gaitNote: input.gaitNote?.trim() ?? "",
      angleLeft: input.angleLeft,
      angleRight: input.angleRight,
      shoeType: input.shoeType.trim(),
      nailPositions: input.nailPositions,
      farrier: input.farrier.trim(),
      recheckIntervalDays: input.recheckIntervalDays,
      note: input.note?.trim() ?? "",
      superseded: false,
      createdAt: ts,
      updatedAt: ts,
    };
  }

  private openCycle(record: ShoeRecord, createdBy: string): RecheckCycle {
    return {
      id: uid("cyc"),
      horseId: record.horseId,
      position: record.position,
      recordId: record.id,
      revision: record.revision,
      status: "active",
      originAbnormal: isAbnormal({
        gaitGrade: record.gaitGrade,
        angleLeft: record.angleLeft,
        angleRight: record.angleRight,
      }),
      rounds: [],
      createdAt: nowISO(),
      createdBy,
    };
  }

  // ---- 查询（页面与提醒统一走这些派生，保证一致） ----

  currentRecord(horseId: string, position: string): ShoeRecord | undefined {
    return this.state.records.find(
      (r) => r.horseId === horseId && r.position === position && !r.superseded,
    );
  }

  activeCycle(horseId: string, position: string): RecheckCycle | undefined {
    return this.state.cycles.find(
      (c) =>
        c.horseId === horseId &&
        c.position === position &&
        c.status === "active",
    );
  }
}

function validateRecordInput(input: RecordInput): string | null {
  if (!input.horseId.trim()) return "马匹编号必填";
  if (!input.date) return "修蹄日期必填";
  if (![1, 2, 3].includes(input.gaitGrade)) return "步态分级必填";
  if (!Number.isFinite(input.angleLeft) || !Number.isFinite(input.angleRight)) {
    return "左右蹄角必须为数字";
  }
  if (input.angleLeft <= 0 || input.angleRight <= 0) {
    return "蹄角需为正数";
  }
  if (!input.shoeType.trim()) return "蹄铁类型必填（裸蹄可填“无”）";
  if (input.nailPositions.length === 0) return "至少登记一个钉位";
  if (!input.farrier.trim()) return "蹄铁师必填";
  if (
    !Number.isInteger(input.recheckIntervalDays) ||
    input.recheckIntervalDays <= 0
  ) {
    return "复查间隔须为正整数（天）";
  }
  return null;
}

function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed.records || !parsed.cycles || !parsed.horses) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时仅影响刷新留存，不阻断操作
  }
}

export { STORAGE_KEY, todayISO };
