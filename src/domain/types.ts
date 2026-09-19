/**
 * 领域类型：修蹄档案 · 蹄铁更换 · 复查闭环
 * 本层只放数据结构与常量，不含任何行为。
 */

export type HoofPosition = "LF" | "RF" | "LH" | "RH";

export const HOOF_POSITIONS: HoofPosition[] = ["LF", "RF", "LH", "RH"];

export const HOOF_LABELS: Record<HoofPosition, string> = {
  LF: "左前蹄",
  RF: "右前蹄",
  LH: "左后蹄",
  RH: "右后蹄",
};

/** 步态分级：0 正常 / 1 轻微 / 2 明显 / 3 严重（三级即入异常复查） */
export type GaitGrade = 0 | 1 | 2 | 3;

export const GAIT_GRADES: GaitGrade[] = [0, 1, 2, 3];

export const GAIT_GRADE_LABELS: Record<GaitGrade, string> = {
  0: "0级 · 步态正常",
  1: "1级 · 轻微跛行",
  2: "2级 · 明显跛行",
  3: "3级 · 严重跛行",
};

export type RecordStatus = "active" | "superseded";

/** 修蹄记录（蹄铁档案）。同一匹马同一蹄位仅允许一条 active。 */
export interface ShoeingRecord {
  id: string;
  horseId: string;
  hoof: HoofPosition;
  gaitGrade: GaitGrade;
  /** 左右蹄角差（度） */
  angleDiff: number;
  /** 蹄铁类型 */
  shoeType: string;
  /** 钉位 */
  nails: string;
  /** 记录人（修蹄师），复查人须与其不同 */
  farrier: string;
  /** 修蹄日期 YYYY-MM-DD */
  shodAt: string;
  /** 下次复查日期 YYYY-MM-DD */
  nextReviewAt: string;
  note: string;
  /** 修订次数：每次修订 +1，并使旧复查立即失效 */
  revision: number;
  status: RecordStatus;
  supersededBy?: string;
  supersededAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReviewResult = "normal" | "abnormal";

export type InvalidReason = "shoe-replaced" | "record-revised";

/** 复查处置记录，绑定到某次修蹄记录的某个修订版本。 */
export interface ReviewEntry {
  id: string;
  /** 幂等键：重复提交沿用首次结果 */
  idempotencyKey: string;
  recordId: string;
  recordRevision: number;
  horseId: string;
  hoof: HoofPosition;
  /** 复查人（必须 ≠ 记录人） */
  reviewer: string;
  result: ReviewResult;
  /** 鞋钉是否牢固 */
  nailsSecure: boolean;
  /** 处置意见 */
  disposition: string;
  reviewedAt: string;
  /** 更换蹄铁或修订原记录后，旧复查立即失效 */
  valid: boolean;
  invalidReason?: InvalidReason;
}

export interface FarrierState {
  records: ShoeingRecord[];
  reviews: ReviewEntry[];
}
