// 规则闭环验证（纯领域层，不依赖 React/DOM）：
//   npx esbuild scripts/check-rules.ts | node
// 用内存 localStorage 桩让 store 持久化分支也能运行。
import { Store } from "../src/domain/store";
import { seedState } from "../src/domain/seed";
import { getCycleViews, getHorseViews } from "../src/domain/selectors";
import { todayISO } from "../src/domain/rules";
import type { RecordInput } from "../src/domain/types";

let passed = 0;
function check(name: string, cond: boolean) {
  if (!cond) {
    console.error("✗ " + name);
    process.exitCode = 1;
  } else {
    passed += 1;
    console.log("✓ " + name);
  }
}

// localStorage 桩
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => void mem.set(k, v),
  removeItem: (k) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};

const today = todayISO();
const day = (off: number) => {
  const d = new Date();
  d.setDate(d.getDate() + off);
  return d.toISOString().slice(0, 10);
};

function baseInput(over: Partial<RecordInput> = {}): RecordInput {
  return {
    horseId: "T-1",
    position: "LF",
    date: day(-10),
    gaitGrade: 1,
    gaitNote: "",
    angleLeft: 52,
    angleRight: 52,
    shoeType: "铝蹄铁",
    nailPositions: ["内1", "外1"],
    farrier: "蹄铁师甲",
    recheckIntervalDays: 7,
    note: "",
    ...over,
  };
}

// 1. 正常建档 → active 周期 + 可训练
{
  const s = new Store(seedState());
  const r = s.createRecord(baseInput());
  check("正常建档成功", r.ok);
  const horses = getHorseViews(s.getState());
  const t1 = horses.find((h) => h.id === "T-1")!;
  check("正常档案可训练", t1.trainable);
  check("该蹄位恰有一条 active 复查", activeCount(s, "T-1", "LF") === 1);
}

// 2. 步态三级 / 角差>4° → 异常复查、冻结
{
  const s = new Store(seedState());
  s.createRecord(baseInput({ horseId: "T-2", gaitGrade: 3 }));
  let h = getHorseViews(s.getState()).find((x) => x.id === "T-2")!;
  check("步态三级不可训练", !h.trainable);

  s.createRecord(
    baseInput({ horseId: "T-3", position: "RF", angleLeft: 55, angleRight: 50 }),
  );
  h = getHorseViews(s.getState()).find((x) => x.id === "T-3")!;
  check("角差 5°（>4°）不可训练", !h.trainable);

  const views = getCycleViews(s.getState(), today);
  check(
    "T-2/T-3 均为异常复查",
    views.filter((v) => ["T-2", "T-3"].includes(v.cycle.horseId)).every((v) => v.abnormal),
  );
}

// 3. 同蹄位不能建第二条当前档案
{
  const s = new Store(seedState());
  s.createRecord(baseInput({ horseId: "T-4" }));
  const again = s.createRecord(baseInput({ horseId: "T-4" }));
  check("同蹄位重复建档被拒绝", !again.ok);
}

// 4. 复查闭环：同一人不能处置 → 另一人处置 → 连续两次正常才恢复
{
  const s = new Store(seedState());
  s.createRecord(baseInput({ horseId: "T-5" }));
  const cycId = s.activeCycle("T-5", "LF")!.id;

  const dup = s.submitRecheck(cycId, {
    date: day(-3),
    reviewer: "复查人A",
    gaitGrade: 1,
    angleLeft: 52,
    angleRight: 52,
    shoeFirm: true,
  });
  check("第一次复查登记成功", dup.ok);

  // 重复提交沿用首次结果
  const dup2 = s.submitRecheck(cycId, {
    date: day(-3),
    reviewer: "复查人B",
    gaitGrade: 3,
    angleLeft: 40,
    angleRight: 60,
    shoeFirm: false,
  });
  check("同日重复提交沿用首次结果（轮次不增加）", dup2.ok && s.activeCycle("T-5", "LF")!.rounds.length === 1);

  // 上一轮未由另一人处置 → 不能登记下一轮（换日期也不行）
  const blocked = s.submitRecheck(cycId, {
    date: day(-1),
    reviewer: "复查人A",
    gaitGrade: 1,
    angleLeft: 52,
    angleRight: 52,
    shoeFirm: true,
  });
  check("待处置期间登记下一轮被拒绝", !blocked.ok && s.activeCycle("T-5", "LF")!.rounds.length === 1);

  // 同一人处置被拒
  const round1 = s.activeCycle("T-5", "LF")!.rounds[0];
  const selfTreat = s.addTreatment(cycId, round1.id, {
    author: "复查人A",
    content: "自行处置",
  });
  check("复查人本人处置被拒绝", !selfTreat.ok);

  const resumeEarly = s.resumeTraining(cycId, "管理员");
  check("仅一次正常不能恢复", !resumeEarly.ok);

  // 另一人处置
  const t1 = s.addTreatment(cycId, round1.id, {
    author: "处置人C",
    content: "检查钉孔正常",
  });
  check("另一人处置成功", t1.ok);

  // 第二次正常复查 + 另一人处置
  s.submitRecheck(cycId, {
    date: today,
    reviewer: "复查人A",
    gaitGrade: 1,
    angleLeft: 52,
    angleRight: 52,
    shoeFirm: true,
  });
  const cyc2 = s.activeCycle("T-5", "LF")!;
  const noConfirmer = s.resumeTraining(cyc2.id, "  ");
  check("恢复需要确认人", !noConfirmer.ok);
  s.addTreatment(cyc2.id, cyc2.rounds[1].id, {
    author: "处置人C",
    content: "四钉牢固",
  });
  const done = s.resumeTraining(s.activeCycle("T-5", "LF")!.id, "主教练");
  check("连续两次正常且牢固后恢复成功", done.ok);
  check(
    "恢复后无 active 复查、马匹可训练",
    !s.activeCycle("T-5", "LF") &&
      getHorseViews(s.getState()).find((h) => h.id === "T-5")!.trainable,
  );
}

// 5. 步态二级 + 松钉不计正常，打断连续计数
{
  const s = new Store(seedState());
  s.createRecord(baseInput({ horseId: "T-6" }));
  const cycId = s.activeCycle("T-6", "LF")!.id;
  s.submitRecheck(cycId, {
    date: day(-5), reviewer: "A", gaitGrade: 1, angleLeft: 52, angleRight: 52, shoeFirm: true,
  });
  s.addTreatment(cycId, s.activeCycle("T-6", "LF")!.rounds[0].id, { author: "C", content: "ok" });
  s.submitRecheck(cycId, {
    date: day(-2), reviewer: "A", gaitGrade: 2, angleLeft: 52, angleRight: 52, shoeFirm: true,
  });
  s.addTreatment(cycId, s.activeCycle("T-6", "LF")!.rounds[1].id, { author: "C", content: "观察" });
  const v = getCycleViews(s.getState(), today).find((x) => x.cycle.horseId === "T-6")!;
  check("步态二级打断连续正常计数（streak=0）", v.normalStreak === 0);
  check("二级不满足恢复", !v.canResume);
}

// 6. 换蹄铁 / 修订 → 旧复查立即失效、计数清零、新周期重开
{
  const s = new Store(seedState());
  s.createRecord(baseInput({ horseId: "T-7" }));
  const cycId = s.activeCycle("T-7", "LF")!.id;
  s.submitRecheck(cycId, {
    date: day(-4), reviewer: "A", gaitGrade: 1, angleLeft: 52, angleRight: 52, shoeFirm: true,
  });
  s.addTreatment(cycId, s.activeCycle("T-7", "LF")!.rounds[0].id, { author: "C", content: "ok" });
  const current = s.currentRecord("T-7", "LF")!;
  const res = s.reshoe(current.id, baseInput({ shoeType: "聚氨酯减震蹄铁", farrier: "蹄铁师乙", date: today }));
  check("更换蹄铁成功并重开", res.ok);

  const old = s.getState().cycles.find((c) => c.id === cycId)!;
  check("旧复查换铁后立即失效", old.status === "invalidated" && old.invalidatedReason === "reshoe");
  check("每蹄位仍仅一条 active", activeCount(s, "T-7", "LF") === 1);
  check("新周期计数清零", s.activeCycle("T-7", "LF")!.rounds.length === 0);
  check(
    "旧档案标记 superseded、新版本 v2",
    current.id !== s.currentRecord("T-7", "LF")!.id &&
      s.currentRecord("T-7", "LF")!.revision === 2,
  );

  // 修订同样失效
  const cur2 = s.currentRecord("T-7", "LF")!;
  const rev = s.revise(cur2.id, { angleLeft: 53 });
  check("修订成功", rev.ok);
  check(
    "修订后旧周期失效、重开 v3",
    s.activeCycle("T-7", "LF")!.revision === 3 && activeCount(s, "T-7", "LF") === 1,
  );
}

// 7. 修订成异常 → 新周期异常、马匹冻结
{
  const s = new Store(seedState());
  s.createRecord(baseInput({ horseId: "T-8" }));
  const cur = s.currentRecord("T-8", "LF")!;
  s.revise(cur.id, { gaitGrade: 3 });
  check(
    "修订为三级后马匹不可训练",
    !getHorseViews(s.getState()).find((h) => h.id === "T-8")!.trainable,
  );
}

// 8. 持久化：刷新（new Store 无参 → localStorage）后状态一致
{
  const s = new Store(seedState());
  s.createRecord(baseInput({ horseId: "T-9" }));
  const reloaded = new Store();
  check("刷新后马匹存在", reloaded.getState().horses.some((h) => h.id === "T-9"));
  check("刷新后 active 复查仍为一条", activeCount(reloaded, "T-9", "LF") === 1);
}

// 9. 种子数据：铜铃可恢复、银风/闪电冻结、云雀逾期
{
  const s = new Store(seedState());
  const views = getCycleViews(s.getState(), today);
  const find = (horse: string) =>
    views.find((v) => v.cycle.horseId === horse)!;
  check("种子-铜铃满足恢复", find("HORSE-27").canResume);
  check("种子-银风异常", find("HORSE-31").abnormal);
  check("种子-闪电异常且待处置", find("HORSE-18").abnormal && find("HORSE-18").kind === "awaiting-treatment");
  check("种子-云雀逾期", find("HORSE-52").reminder === "overdue");
  const horses = getHorseViews(s.getState());
  check("种子-琥珀换铁后仍可训练", horses.find((h) => h.id === "HORSE-45")!.trainable);
}

function activeCount(s: Store, horse: string, pos: string): number {
  return s
    .getState()
    .cycles.filter((c) => c.horseId === horse && c.position === pos && c.status === "active")
    .length;
}

console.log(`\n${passed} 项检查通过`);
