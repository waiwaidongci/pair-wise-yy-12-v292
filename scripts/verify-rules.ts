/**
 * 闭环规则验证脚本（非产品代码）：逐条验证需求规则。
 * 运行：npx esbuild scripts/verify-rules.ts --bundle --platform=node --outfile=/tmp/verify.mjs && node /tmp/verify.mjs
 */
import {
  activeRecordFor,
  evaluateHoof,
  isAbnormalShoeing,
  pendingReminders,
  RECOVERY_STREAK_REQUIRED,
  registerShoeing,
  reviseShoeing,
  RuleError,
  submitReview,
} from "../src/domain/rules";
import { FarrierState, ShoeingRecord } from "../src/domain/types";
import { buildSeedState } from "../src/storage/seed";

const TODAY = "2026-09-19";
const now = (t = "09:00") => `${TODAY}T${t}:00`;

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}`);
  }
}

function expectRuleError(name: string, fn: () => void, part?: string) {
  try {
    fn();
    failed += 1;
    console.error(`  ✗ ${name}（未抛错）`);
  } catch (err) {
    const ok = err instanceof RuleError && (!part || err.message.includes(part));
    if (ok) {
      passed += 1;
      console.log(`  ✓ ${name}`);
    } else {
      failed += 1;
      console.error(`  ✗ ${name}（错误不符：${String(err)}）`);
    }
  }
}

const base = {
  horseId: "HORSE-01",
  hoof: "LF" as const,
  gaitGrade: 1 as const,
  angleDiff: 2,
  shoeType: "铝蹄铁",
  nails: "外侧4钉·内侧4钉",
  farrier: "张铁生",
  shodAt: "2026-09-10",
  nextReviewAt: "2026-09-24",
  note: "",
};

let state: FarrierState = { records: [], reviews: [] };

console.log("1. 登记必填：步态分级 / 蹄角差 / 蹄铁 / 钉位");
expectRuleError("缺蹄铁类型被拒绝", () =>
  registerShoeing(state, { ...base, shoeType: " " }, now())
);
expectRuleError("缺钉位被拒绝", () => registerShoeing(state, { ...base, nails: "" }, now()));
expectRuleError("缺蹄角差被拒绝", () =>
  registerShoeing(state, { ...base, angleDiff: NaN }, now())
);

console.log("2. 同一匹马同一蹄位仅留一条待复查记录");
let r1 = registerShoeing(state, base, now());
state = r1.state;
let r2 = registerShoeing(state, { ...base, shoeType: "钢蹄铁" }, now("10:00"));
state = r2.state;
check("旧记录被更换", r1.record.status === "active" && r2.superseded?.id === r1.record.id);
check(
  "仅一条生效记录",
  state.records.filter((r) => r.status === "active" && r.horseId === "HORSE-01" && r.hoof === "LF")
    .length === 1
);

console.log("3. 步态三级或蹄角差>4° → 只进异常复查，不得列为可训练");
check("步态三级判异常", isAbnormalShoeing({ gaitGrade: 3, angleDiff: 0 }));
check("蹄角差4°不判异常", !isAbnormalShoeing({ gaitGrade: 1, angleDiff: 4 }));
check("蹄角差4.5°判异常", isAbnormalShoeing({ gaitGrade: 1, angleDiff: 4.5 }));
const ab = registerShoeing(
  state,
  { ...base, horseId: "HORSE-02", gaitGrade: 3, angleDiff: 1 },
  now()
);
state = ab.state;
let ev = evaluateHoof(state, "HORSE-02", "LF");
check("异常蹄位不可训练", !ev.trainable && ev.track === "abnormal" && ev.pendingReview);

console.log("4. 复查须另一人填写处置");
expectRuleError(
  "记录人自己复查被拒绝",
  () =>
    submitReview(
      state,
      {
        idempotencyKey: "k-x",
        recordId: ab.record.id,
        reviewer: "张铁生",
        result: "normal",
        nailsSecure: true,
        disposition: "自查",
      },
      now()
    ),
  "另一人"
);

console.log("5. 连续两次正常且鞋钉牢固才恢复");
const rv1 = submitReview(
  state,
  {
    idempotencyKey: "k-1",
    recordId: ab.record.id,
    reviewer: "王复诊",
    result: "normal",
    nailsSecure: true,
    disposition: "继续观察",
  },
  now("11:00")
);
state = rv1.state;
ev = evaluateHoof(state, "HORSE-02", "LF");
check("一次正常后仍未恢复", !ev.cleared && !ev.trainable && ev.streak === 1);
const rv2 = submitReview(
  state,
  {
    idempotencyKey: "k-2",
    recordId: ab.record.id,
    reviewer: "赵教练",
    result: "normal",
    nailsSecure: false,
    disposition: "鞋钉松动，已加固",
  },
  now("12:00")
);
state = rv2.state;
ev = evaluateHoof(state, "HORSE-02", "LF");
check("鞋钉不牢固不计入连续正常", ev.streak === 0 && !ev.cleared);
const rv3 = submitReview(
  state,
  {
    idempotencyKey: "k-3",
    recordId: ab.record.id,
    reviewer: "王复诊",
    result: "normal",
    nailsSecure: true,
    disposition: "正常",
  },
  now("13:00")
);
state = rv3.state;
const rv4 = submitReview(
  state,
  {
    idempotencyKey: "k-4",
    recordId: ab.record.id,
    reviewer: "赵教练",
    result: "normal",
    nailsSecure: true,
    disposition: "正常，同意恢复",
  },
  now("14:00")
);
state = rv4.state;
ev = evaluateHoof(state, "HORSE-02", "LF");
check(
  `连续${RECOVERY_STREAK_REQUIRED}次正常且鞋钉牢固后恢复`,
  ev.cleared && ev.trainable && !ev.pendingReview
);
check("闭环后退出复查提醒", !pendingReminders(state, TODAY).some((i) => i.record.id === ab.record.id));
expectRuleError("闭环后拒绝再复查", () =>
  submitReview(
    state,
    {
      idempotencyKey: "k-5",
      recordId: ab.record.id,
      reviewer: "王复诊",
      result: "normal",
      nailsSecure: true,
      disposition: "多余",
    },
    now("15:00")
  )
);

console.log("6. 复查异常会打断连续次数并转入异常复查");
const nm = registerShoeing(state, { ...base, horseId: "HORSE-03" }, now());
state = nm.state;
state = submitReview(state, {
  idempotencyKey: "k-6",
  recordId: nm.record.id,
  reviewer: "王复诊",
  result: "normal",
  nailsSecure: true,
  disposition: "正常",
}, now("11:00")).state;
state = submitReview(state, {
  idempotencyKey: "k-7",
  recordId: nm.record.id,
  reviewer: "王复诊",
  result: "abnormal",
  nailsSecure: true,
  disposition: "发现跛行，暂停训练",
}, now("12:00")).state;
ev = evaluateHoof(state, "HORSE-03", "LF");
check("常规记录复查异常后转为异常且不可训练", ev.track === "abnormal" && !ev.trainable && ev.streak === 0);

console.log("7. 更换蹄铁 → 旧复查立即失效");
const before = state.reviews.filter((rv) => rv.recordId === nm.record.id && rv.valid).length;
const rep = registerShoeing(state, { ...base, horseId: "HORSE-03", shoeType: "钢蹄铁" }, now("16:00"));
state = rep.state;
check("更换前存在有效复查", before === 2);
check(
  "更换后旧复查全部失效",
  state.reviews.filter((rv) => rv.recordId === nm.record.id).every((rv) => !rv.valid && rv.invalidReason === "shoe-replaced")
);
ev = evaluateHoof(state, "HORSE-03", "LF");
check("更换后连续次数清零", ev.streak === 0 && ev.pendingReview);

console.log("8. 修订原记录 → 旧复查立即失效");
state = submitReview(state, {
  idempotencyKey: "k-8",
  recordId: rep.record.id,
  reviewer: "王复诊",
  result: "normal",
  nailsSecure: true,
  disposition: "正常",
}, now("17:00")).state;
const rev = reviseShoeing(state, rep.record.id, { ...base, horseId: "HORSE-03", shoeType: "钢蹄铁", angleDiff: 3 }, now("18:00"));
state = rev.state;
check("修订后版本号+1", rev.record.revision === rep.record.revision + 1);
check(
  "修订后旧复查立即失效",
  state.reviews.filter((rv) => rv.recordId === rep.record.id).every((rv) => !rv.valid && rv.invalidReason === "record-revised")
);
ev = evaluateHoof(state, "HORSE-03", "LF");
check("修订后连续次数清零", ev.streak === 0);

console.log("9. 重复提交沿用首次结果");
const dupTarget: ShoeingRecord = rev.record;
const first = submitReview(state, {
  idempotencyKey: "k-dup",
  recordId: dupTarget.id,
  reviewer: "王复诊",
  result: "normal",
  nailsSecure: true,
  disposition: "首次结果",
}, now("19:00"));
state = first.state;
const reviewCount = state.reviews.length;
const dup = submitReview(state, {
  idempotencyKey: "k-dup",
  recordId: dupTarget.id,
  reviewer: "赵教练",
  result: "abnormal",
  nailsSecure: false,
  disposition: "篡改内容",
}, now("19:30"));
state = dup.state;
check("重复提交被识别", dup.deduplicated && !first.deduplicated);
check("重复提交不产生新记录", state.reviews.length === reviewCount);
check("沿用首次结果", dup.review.id === first.review.id && dup.review.result === "normal");

console.log("10. 演示数据各场景");
const seed = buildSeedState(TODAY);
check(
  "HORSE-18 右前蹄异常复查中（1/2）",
  (() => {
    const e = evaluateHoof(seed, "HORSE-18", "RF");
    return e.track === "abnormal" && !e.trainable && e.streak === 1 && e.pendingReview;
  })()
);
check(
  "HORSE-27 左后蹄已恢复可训练",
  (() => {
    const e = evaluateHoof(seed, "HORSE-27", "LH");
    return e.cleared && e.trainable;
  })()
);
check(
  "HORSE-27 右后蹄逾期提醒",
  pendingReminders(seed, TODAY).some((i) => i.record.horseId === "HORSE-27" && i.record.hoof === "RH" && i.overdue)
);
check(
  "HORSE-31 右前蹄旧复查因更换蹄铁失效",
  seed.reviews.some((rv) => rv.horseId === "HORSE-31" && rv.hoof === "RF" && !rv.valid && rv.invalidReason === "shoe-replaced")
);
check(
  "HORSE-31 左前蹄旧复查因修订失效",
  seed.reviews.some((rv) => rv.horseId === "HORSE-31" && rv.hoof === "LF" && !rv.valid && rv.invalidReason === "record-revised")
);
check(
  "HORSE-31 左前蹄修订后版本为1",
  activeRecordFor(seed, "HORSE-31", "LF")?.revision === 1
);

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
