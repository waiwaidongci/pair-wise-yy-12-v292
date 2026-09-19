// 演示种子数据：日期相对“今天”偏移，保证刷新后提醒状态真实可见。
import type {
  AppState,
  RecheckCycle,
  ShoeRecord,
  Treatment,
} from "./types";

function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

const T0 = "2026-09-01T08:00:00.000Z";
const T1 = "2026-09-10T08:00:00.000Z";

function treatment(
  id: string,
  author: string,
  content: string,
  at: string,
): Treatment {
  return { id, author, content, createdAt: at };
}

export function seedState(): AppState {
  const horses = [
    { id: "HORSE-18", name: "闪电" },
    { id: "HORSE-27", name: "铜铃" },
    { id: "HORSE-31", name: "银风" },
    { id: "HORSE-45", name: "琥珀" },
    { id: "HORSE-52", name: "云雀" },
  ];

  const records: ShoeRecord[] = [
    // 闪电 · 右前蹄：左右角差 6°（异常），已复查一次为步态三级
    {
      id: "rec-18-rf",
      horseId: "HORSE-18",
      position: "RF",
      revision: 1,
      date: day(-18),
      gaitGrade: 2,
      gaitNote: "右前蹄外侧磨耗明显",
      angleLeft: 53,
      angleRight: 47,
      shoeType: "铝蹄铁",
      nailPositions: ["内1", "内2", "外1", "外2"],
      farrier: "陈蹄铁师",
      recheckIntervalDays: 14,
      note: "外侧受力偏大，列入异常复查",
      superseded: false,
      createdAt: T0,
      updatedAt: T0,
    },
    // 铜铃 · 左前蹄：连续两次正常且鞋钉牢固，待确认恢复
    {
      id: "rec-27-lf",
      horseId: "HORSE-27",
      position: "LF",
      revision: 1,
      date: day(-30),
      gaitGrade: 1,
      gaitNote: "后蹄裂纹已加护蹄垫",
      angleLeft: 52,
      angleRight: 52,
      shoeType: "加护蹄垫",
      nailPositions: ["内1", "内2", "外1", "跟钉L"],
      farrier: "陈蹄铁师",
      recheckIntervalDays: 14,
      note: "复查恢复中",
      superseded: false,
      createdAt: T0,
      updatedAt: T0,
    },
    // 银风 · 左后蹄：步态三级建档
    {
      id: "rec-31-lh",
      horseId: "HORSE-31",
      position: "LH",
      revision: 1,
      date: day(-6),
      gaitGrade: 3,
      gaitNote: "步态明显不稳，着地疼痛反应",
      angleLeft: 51,
      angleRight: 50,
      shoeType: "普通钢蹄铁",
      nailPositions: ["内1", "外1", "外2"],
      farrier: "周蹄铁师",
      recheckIntervalDays: 7,
      note: "只进异常复查，暂停训练，通知教练",
      superseded: false,
      createdAt: T1,
      updatedAt: T1,
    },
    // 琥珀 · 右后蹄：v1 已换蹄铁取代，v2 当前
    {
      id: "rec-45-rh-v1",
      horseId: "HORSE-45",
      position: "RH",
      revision: 1,
      date: day(-40),
      gaitGrade: 1,
      gaitNote: "",
      angleLeft: 50,
      angleRight: 50,
      shoeType: "普通钢蹄铁",
      nailPositions: ["内1", "内2", "外1"],
      farrier: "周蹄铁师",
      recheckIntervalDays: 21,
      note: "旧蹄铁",
      superseded: true,
      supersededReason: "reshoe",
      createdAt: "2026-08-01T08:00:00.000Z",
      updatedAt: "2026-08-01T08:00:00.000Z",
    },
    {
      id: "rec-45-rh-v2",
      horseId: "HORSE-45",
      position: "RH",
      revision: 2,
      date: day(-3),
      gaitGrade: 1,
      gaitNote: "换用聚氨酯减震蹄铁",
      angleLeft: 50,
      angleRight: 51,
      shoeType: "聚氨酯减震蹄铁",
      nailPositions: ["内1", "内2", "外1", "外2"],
      farrier: "周蹄铁师",
      recheckIntervalDays: 21,
      note: "换蹄铁后新开复查",
      superseded: false,
      createdAt: T1,
      updatedAt: T1,
    },
    // 云雀 · 右前蹄：常规建档，复查已逾期
    {
      id: "rec-52-rf",
      horseId: "HORSE-52",
      position: "RF",
      revision: 1,
      date: day(-20),
      gaitGrade: 1,
      gaitNote: "",
      angleLeft: 54,
      angleRight: 53,
      shoeType: "铝蹄铁",
      nailPositions: ["内1", "外1", "外2"],
      farrier: "陈蹄铁师",
      recheckIntervalDays: 14,
      note: "",
      superseded: false,
      createdAt: T0,
      updatedAt: T0,
    },
  ];

  const cycles: RecheckCycle[] = [
    {
      // 闪电：异常复查，已有一轮三级结果，等另一人处置
      id: "cyc-18-rf",
      horseId: "HORSE-18",
      position: "RF",
      recordId: "rec-18-rf",
      revision: 1,
      status: "active",
      originAbnormal: true,
      createdAt: T0,
      createdBy: "陈蹄铁师",
      rounds: [
        {
          id: "round-18-rf-1",
          date: day(-4),
          reviewer: "李教练",
          gaitGrade: 3,
          angleLeft: 53,
          angleRight: 46,
          shoeFirm: false,
          note: "运步短促，外侧钉有松动",
          submittedAt: T1,
          treatments: [],
        },
      ],
    },
    {
      // 铜铃：连续两次正常且牢固，处置齐全，待恢复确认
      id: "cyc-27-lf",
      horseId: "HORSE-27",
      position: "LF",
      recordId: "rec-27-lf",
      revision: 1,
      status: "active",
      originAbnormal: false,
      createdAt: T0,
      createdBy: "陈蹄铁师",
      rounds: [
        {
          id: "round-27-lf-1",
          date: day(-16),
          reviewer: "李教练",
          gaitGrade: 1,
          angleLeft: 52,
          angleRight: 52,
          shoeFirm: true,
          note: "裂纹无扩展",
          submittedAt: "2026-09-03T08:00:00.000Z",
          treatments: [
            treatment(
              "treat-27-1",
              "王助理",
              "清理护垫缝隙，复查钉孔无炎性渗液",
              "2026-09-03T10:00:00.000Z",
            ),
          ],
        },
        {
          id: "round-27-lf-2",
          date: day(-2),
          reviewer: "李教练",
          gaitGrade: 1,
          angleLeft: 52,
          angleRight: 52,
          shoeFirm: true,
          note: "直线与圈乘运步正常",
          submittedAt: T1,
          treatments: [
            treatment(
              "treat-27-2",
              "王助理",
              "护垫贴合良好，四钉牢固，同意恢复",
              "2026-09-17T09:30:00.000Z",
            ),
          ],
        },
      ],
    },
    {
      // 银风：异常复查尚未到场
      id: "cyc-31-lh",
      horseId: "HORSE-31",
      position: "LH",
      recordId: "rec-31-lh",
      revision: 1,
      status: "active",
      originAbnormal: true,
      createdAt: T1,
      createdBy: "周蹄铁师",
      rounds: [],
    },
    {
      // 琥珀 v1 周期：换蹄铁立即失效
      id: "cyc-45-rh-v1",
      horseId: "HORSE-45",
      position: "RH",
      recordId: "rec-45-rh-v1",
      revision: 1,
      status: "invalidated",
      originAbnormal: false,
      createdAt: "2026-08-01T08:00:00.000Z",
      createdBy: "周蹄铁师",
      rounds: [
        {
          id: "round-45-rh-old",
          date: day(-25),
          reviewer: "李教练",
          gaitGrade: 1,
          angleLeft: 50,
          angleRight: 50,
          shoeFirm: true,
          note: "更换前最后一次复查",
          submittedAt: "2026-08-20T08:00:00.000Z",
          treatments: [
            treatment(
              "treat-45-old",
              "王助理",
              "计划到期更换减震蹄铁",
              "2026-08-20T09:00:00.000Z",
            ),
          ],
        },
      ],
      invalidatedAt: T1,
      invalidatedReason: "reshoe",
      newRecordId: "rec-45-rh-v2",
    },
    {
      // 琥珀 v2：换蹄铁后新开
      id: "cyc-45-rh-v2",
      horseId: "HORSE-45",
      position: "RH",
      recordId: "rec-45-rh-v2",
      revision: 2,
      status: "active",
      originAbnormal: false,
      createdAt: T1,
      createdBy: "周蹄铁师",
      rounds: [],
    },
    {
      // 云雀：逾期未复查
      id: "cyc-52-rf",
      horseId: "HORSE-52",
      position: "RF",
      recordId: "rec-52-rf",
      revision: 1,
      status: "active",
      originAbnormal: false,
      createdAt: T0,
      createdBy: "陈蹄铁师",
      rounds: [],
    },
  ];

  const events = [
    {
      id: "evt-seed-1",
      at: "2026-08-01T08:00:00.000Z",
      type: "create" as const,
      horseId: "HORSE-45",
      position: "RH" as const,
      revision: 1,
      recordId: "rec-45-rh-v1",
      operator: "周蹄铁师",
      detail: "建档：普通钢蹄铁",
    },
    {
      id: "evt-seed-2",
      at: T1,
      type: "reshoe" as const,
      horseId: "HORSE-45",
      position: "RH" as const,
      revision: 2,
      recordId: "rec-45-rh-v2",
      operator: "周蹄铁师",
      detail: "更换蹄铁：普通钢蹄铁 → 聚氨酯减震蹄铁，旧复查立即失效",
    },
  ];

  return { horses, records, cycles, events };
}
