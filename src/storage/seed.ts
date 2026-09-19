/**
 * 演示数据：通过领域规则函数逐笔生成，保证种子数据本身满足全部业务约束。
 * 覆盖：异常复查中、待复查、已恢复、逾期未复查、更换蹄铁失效、修订失效等场景。
 */

import { FarrierState } from "../domain/types";
import { registerShoeing, reviseShoeing, submitReview } from "../domain/rules";

export function offsetDate(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function buildSeedState(today: string): FarrierState {
  let state: FarrierState = { records: [], reviews: [] };
  const at = (dayOffset: number, hhmm = "09:30") => `${offsetDate(today, dayOffset)}T${hhmm}:00`;

  // HORSE-18 右前蹄：蹄角差 5.5° > 4° → 异常复查；已有一次正常复查（连续正常 1/2）
  const h18rf = registerShoeing(
    state,
    {
      horseId: "HORSE-18",
      hoof: "RF",
      gaitGrade: 2,
      angleDiff: 5.5,
      shoeType: "铝蹄铁",
      nails: "外侧4钉 · 内侧3钉",
      farrier: "张铁生",
      shodAt: offsetDate(today, -12),
      nextReviewAt: offsetDate(today, 2),
      note: "右前蹄外侧磨耗明显，蹄角差偏大，换铝蹄铁观察",
    },
    at(-12)
  );
  state = h18rf.state;
  state = submitReview(
    state,
    {
      idempotencyKey: "seed-h18rf-r1",
      recordId: h18rf.record.id,
      reviewer: "王复诊",
      result: "normal",
      nailsSecure: true,
      disposition: "步态较修蹄前平稳，钉位牢固，继续观察",
    },
    at(-5, "10:00")
  ).state;

  // HORSE-18 左前蹄：常规记录，待复查
  state = registerShoeing(
    state,
    {
      horseId: "HORSE-18",
      hoof: "LF",
      gaitGrade: 1,
      angleDiff: 1.5,
      shoeType: "铝蹄铁",
      nails: "外侧4钉 · 内侧4钉",
      farrier: "张铁生",
      shodAt: offsetDate(today, -12),
      nextReviewAt: offsetDate(today, 5),
      note: "常规修蹄",
    },
    at(-12, "10:30")
  ).state;

  // HORSE-27 左后蹄：步态三级 → 异常；已连续两次正常且鞋钉牢固 → 已恢复
  const h27lh = registerShoeing(
    state,
    {
      horseId: "HORSE-27",
      hoof: "LH",
      gaitGrade: 3,
      angleDiff: 2,
      shoeType: "钢蹄铁 + 护蹄垫",
      nails: "外侧4钉 · 内侧4钉",
      farrier: "李牧",
      shodAt: offsetDate(today, -30),
      nextReviewAt: offsetDate(today, -16),
      note: "左后蹄裂纹，步态三级，暂停训练",
    },
    at(-30)
  );
  state = h27lh.state;
  state = submitReview(
    state,
    {
      idempotencyKey: "seed-h27lh-r1",
      recordId: h27lh.record.id,
      reviewer: "王复诊",
      result: "normal",
      nailsSecure: true,
      disposition: "裂纹稳定，步态明显改善",
    },
    at(-16, "09:00")
  ).state;
  state = submitReview(
    state,
    {
      idempotencyKey: "seed-h27lh-r2",
      recordId: h27lh.record.id,
      reviewer: "赵教练",
      result: "normal",
      nailsSecure: true,
      disposition: "连续第二次正常，鞋钉牢固，同意恢复训练",
    },
    at(-2, "09:00")
  ).state;

  // HORSE-27 右后蹄：常规记录，复查已逾期
  state = registerShoeing(
    state,
    {
      horseId: "HORSE-27",
      hoof: "RH",
      gaitGrade: 1,
      angleDiff: 2,
      shoeType: "钢蹄铁",
      nails: "外侧4钉 · 内侧4钉",
      farrier: "李牧",
      shodAt: offsetDate(today, -20),
      nextReviewAt: offsetDate(today, -3),
      note: "常规修蹄",
    },
    at(-20, "11:00")
  ).state;

  // HORSE-31 右前蹄：先登记钢蹄铁并复查一次，随后更换铝蹄铁 → 旧复查立即失效
  const h31rfOld = registerShoeing(
    state,
    {
      horseId: "HORSE-31",
      hoof: "RF",
      gaitGrade: 1,
      angleDiff: 2.5,
      shoeType: "普通钢蹄铁",
      nails: "外侧4钉 · 内侧4钉",
      farrier: "张铁生",
      shodAt: offsetDate(today, -25),
      nextReviewAt: offsetDate(today, -11),
      note: "常规修蹄",
    },
    at(-25)
  );
  state = h31rfOld.state;
  state = submitReview(
    state,
    {
      idempotencyKey: "seed-h31rf-r1",
      recordId: h31rfOld.record.id,
      reviewer: "王复诊",
      result: "normal",
      nailsSecure: true,
      disposition: "步态正常",
    },
    at(-11, "10:00")
  ).state;
  state = registerShoeing(
    state,
    {
      horseId: "HORSE-31",
      hoof: "RF",
      gaitGrade: 0,
      angleDiff: 1,
      shoeType: "铝蹄铁",
      nails: "外侧4钉 · 内侧3钉",
      farrier: "张铁生",
      shodAt: offsetDate(today, -6),
      nextReviewAt: offsetDate(today, 8),
      note: "钢蹄铁磨耗严重，更换为铝蹄铁",
    },
    at(-6)
  ).state;

  // HORSE-31 左前蹄：登记后复查一次，随后修订原记录（校正蹄角差）→ 旧复查立即失效
  const h31lf = registerShoeing(
    state,
    {
      horseId: "HORSE-31",
      hoof: "LF",
      gaitGrade: 2,
      angleDiff: 5,
      shoeType: "铝蹄铁",
      nails: "外侧4钉 · 内侧4钉",
      farrier: "李牧",
      shodAt: offsetDate(today, -9),
      nextReviewAt: offsetDate(today, 4),
      note: "初测蹄角差 5°，待复核",
    },
    at(-9)
  );
  state = h31lf.state;
  state = submitReview(
    state,
    {
      idempotencyKey: "seed-h31lf-r1",
      recordId: h31lf.record.id,
      reviewer: "王复诊",
      result: "normal",
      nailsSecure: true,
      disposition: "步态平稳，建议复核蹄角测量",
    },
    at(-4, "15:00")
  ).state;
  state = reviseShoeing(
    state,
    h31lf.record.id,
    {
      horseId: "HORSE-31",
      hoof: "LF",
      gaitGrade: 2,
      angleDiff: 3,
      shoeType: "铝蹄铁",
      nails: "外侧4钉 · 内侧4钉",
      farrier: "李牧",
      shodAt: offsetDate(today, -9),
      nextReviewAt: offsetDate(today, 4),
      note: "复测校正：蹄角差 3°（原记录 5° 为测量误差）",
    },
    at(-3, "08:30")
  ).state;

  return state;
}
