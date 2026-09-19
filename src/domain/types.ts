// 修蹄档案领域模型：只描述数据结构，不含任何规则与存储逻辑。

/** 蹄位：左前 / 右前 / 左后 / 右后 */
export type HoofPosition = "LF" | "RF" | "LH" | "RH";

/** 步态分级：1 正常 / 2 轻度异常 / 3 三级（明显异常） */
export type GaitGrade = 1 | 2 | 3;

/**
 * 修蹄档案（一次建档 / 换蹄铁 / 修订都会产生一个新版本）。
 * 同一马匹同一蹄位，只有 revision 最大且未被取代的版本为“当前档案”。
 */
export interface ShoeRecord {
  id: string;
  horseId: string;
  position: HoofPosition;
  revision: number;
  /** 修蹄 / 换蹄铁日期（yyyy-mm-dd） */
  date: string;
  /** 步态分级 */
  gaitGrade: GaitGrade;
  gaitNote: string;
  /** 左蹄角（度） */
  angleLeft: number;
  /** 右蹄角（度） */
  angleRight: number;
  /** 蹄铁类型，如：铝蹄铁 / 加护蹄垫 / 普通钢蹄铁；裸蹄填“无” */
  shoeType: string;
  /** 钉位标签，如：内1、内2、外1…… */
  nailPositions: string[];
  /** 建档 / 操作蹄铁师 */
  farrier: string;
  /** 建议复查间隔（天） */
  recheckIntervalDays: number;
  note: string;
  /** 是否已被更新版本取代 */
  superseded: boolean;
  supersededReason?: "reshoe" | "revise";
  createdAt: string;
  updatedAt: string;
}

/** 一轮复查的现场结果 */
export interface RecheckRound {
  id: string;
  /** 复查日期（yyyy-mm-dd），同周期同日重复提交按该日期去重 */
  date: string;
  /** 复查人（登记结果的人） */
  reviewer: string;
  gaitGrade: GaitGrade;
  angleLeft: number;
  angleRight: number;
  /** 鞋钉是否牢固 */
  shoeFirm: boolean;
  note: string;
  submittedAt: string;
  /** 处置：必须由复查人之外的另一人填写 */
  treatments: Treatment[];
}

/** 处置记录 */
export interface Treatment {
  id: string;
  /** 处置人（不得与本轮复查人相同） */
  author: string;
  content: string;
  createdAt: string;
}

/**
 * 复查周期（= 列表中“一条待复查记录”）。
 * 每匹马每个蹄位至多存在一条 active 周期；换蹄铁或修订档案后立即失效。
 */
export interface RecheckCycle {
  id: string;
  horseId: string;
  position: HoofPosition;
  /** 周期所针对的档案版本 */
  recordId: string;
  revision: number;
  status: "active" | "closed-normal" | "invalidated";
  /** 建档数据本身是否异常（步态三级或左右蹄角差 > 4°） */
  originAbnormal: boolean;
  rounds: RecheckRound[];
  createdAt: string;
  createdBy: string;
  /** 连续两次正常后恢复关闭 */
  closedAt?: string;
  closedBy?: string;
  /** 被换蹄铁 / 修订强制失效 */
  invalidatedAt?: string;
  invalidatedReason?: "reshoe" | "revise";
  newRecordId?: string;
}

export interface Horse {
  id: string;
  name: string;
}

/** 蹄铁更换 / 档案修订事件（历史时间线） */
export interface ShoeChangeEvent {
  id: string;
  at: string;
  type: "create" | "reshoe" | "revise";
  horseId: string;
  position: HoofPosition;
  revision: number;
  recordId: string;
  operator: string;
  detail: string;
}

export interface AppState {
  horses: Horse[];
  records: ShoeRecord[];
  cycles: RecheckCycle[];
  events: ShoeChangeEvent[];
}

/** 新建档案的表单输入 */
export interface RecordInput {
  horseId: string;
  horseName?: string;
  position: HoofPosition;
  date: string;
  gaitGrade: GaitGrade;
  gaitNote?: string;
  angleLeft: number;
  angleRight: number;
  shoeType: string;
  nailPositions: string[];
  farrier: string;
  recheckIntervalDays: number;
  note?: string;
}

export interface RecheckInput {
  date: string;
  reviewer: string;
  gaitGrade: GaitGrade;
  angleLeft: number;
  angleRight: number;
  shoeFirm: boolean;
  note?: string;
}

export interface TreatmentInput {
  author: string;
  content: string;
}
