/**
 * 页面：登记修蹄 / 更换蹄铁 / 修订原记录
 * - 登记：必填步态分级、蹄角差、蹄铁、钉位；同马同蹄位已有生效记录时即「更换蹄铁」，
 *   旧记录作废且其全部复查立即失效；
 * - 修订：在原记录上修改，版本号 +1，该记录全部旧复查立即失效；
 * - 步态三级或左右蹄角差超过 4° 时实时提示「只进异常复查，不得列为可训练」。
 */

import { useEffect, useMemo, useState } from "react";
import {
  FarrierState,
  GaitGrade,
  GAIT_GRADE_LABELS,
  GAIT_GRADES,
  HoofPosition,
  HOOF_LABELS,
  HOOF_POSITIONS,
} from "../domain/types";
import {
  activeRecordFor,
  isAbnormalShoeing,
  MAX_ANGLE_DIFF_DEG,
  registerShoeing,
  reviseShoeing,
  RuleError,
  ShoeingInput,
  validateShoeingInput,
} from "../domain/rules";

export type RegisterIntent =
  | { mode: "new"; horseId?: string; hoof?: HoofPosition }
  | { mode: "revise"; recordId: string };

interface Props {
  state: FarrierState;
  intent: RegisterIntent;
  onIntentChange: (intent: RegisterIntent) => void;
  onSaved: (next: FarrierState, message: string) => void;
}

interface FormShape {
  horseId: string;
  hoof: HoofPosition;
  gaitGrade: GaitGrade;
  angleDiff: string;
  shoeType: string;
  nails: string;
  farrier: string;
  shodAt: string;
  nextReviewAt: string;
  note: string;
}

const EMPTY_FORM: FormShape = {
  horseId: "",
  hoof: "LF",
  gaitGrade: 0,
  angleDiff: "",
  shoeType: "",
  nails: "",
  farrier: "",
  shodAt: "",
  nextReviewAt: "",
  note: "",
};

function toInput(form: FormShape): ShoeingInput {
  return {
    horseId: form.horseId,
    hoof: form.hoof,
    gaitGrade: form.gaitGrade,
    angleDiff: Number(form.angleDiff),
    shoeType: form.shoeType,
    nails: form.nails,
    farrier: form.farrier,
    shodAt: form.shodAt,
    nextReviewAt: form.nextReviewAt,
    note: form.note,
  };
}

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

export default function RegisterPage({ state, intent, onIntentChange, onSaved }: Props) {
  const [form, setForm] = useState<FormShape>(EMPTY_FORM);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  const activeRecords = useMemo(
    () =>
      state.records
        .filter((r) => r.status === "active")
        .sort((a, b) => a.horseId.localeCompare(b.horseId) || a.hoof.localeCompare(b.hoof)),
    [state.records]
  );

  const knownHorses = useMemo(
    () => Array.from(new Set(state.records.map((r) => r.horseId))).sort(),
    [state.records]
  );

  // 根据外部入口（马匹列表跳转）初始化表单
  useEffect(() => {
    setErrors([]);
    setNotice("");
    if (intent.mode === "revise") {
      const rec = state.records.find((r) => r.id === intent.recordId);
      if (rec) {
        setForm({
          horseId: rec.horseId,
          hoof: rec.hoof,
          gaitGrade: rec.gaitGrade,
          angleDiff: String(rec.angleDiff),
          shoeType: rec.shoeType,
          nails: rec.nails,
          farrier: rec.farrier,
          shodAt: rec.shodAt,
          nextReviewAt: rec.nextReviewAt,
          note: rec.note,
        });
        return;
      }
    }
    setForm({
      ...EMPTY_FORM,
      horseId: intent.mode === "new" ? intent.horseId ?? "" : "",
      hoof: intent.mode === "new" ? intent.hoof ?? "LF" : "LF",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  const set = <K extends keyof FormShape>(key: K, value: FormShape[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const revisingRecord =
    intent.mode === "revise" ? state.records.find((r) => r.id === intent.recordId) : undefined;

  const existingActive =
    intent.mode === "new" && form.horseId.trim()
      ? activeRecordFor(state, form.horseId.trim(), form.hoof)
      : undefined;

  const angleNum = Number(form.angleDiff);
  const abnormal =
    form.angleDiff !== "" &&
    isAbnormalShoeing({ gaitGrade: form.gaitGrade, angleDiff: angleNum });

  const clientErrors = validateShoeingInput(toInput(form));

  const handleSubmit = () => {
    setErrors([]);
    setNotice("");
    try {
      if (intent.mode === "revise") {
        if (!revisingRecord) throw new RuleError("未找到要修订的修蹄记录");
        const { state: next, record } = reviseShoeing(state, revisingRecord.id, toInput(form), nowIso());
        onSaved(
          next,
          `已修订 ${record.horseId} · ${HOOF_LABELS[record.hoof]}（第 ${record.revision} 次修订），该记录全部旧复查已立即失效`
        );
      } else {
        const { state: next, record, superseded } = registerShoeing(state, toInput(form), nowIso());
        const abnormalMsg = isAbnormalShoeing(record)
          ? "，已进入异常复查，闭环前不得列为可训练"
          : "";
        const replaceMsg = superseded ? "，旧记录已作废且其复查立即失效" : "";
        onSaved(
          next,
          `已登记 ${record.horseId} · ${HOOF_LABELS[record.hoof]}${superseded ? "（更换蹄铁）" : ""}${replaceMsg}${abnormalMsg}`
        );
      }
    } catch (err) {
      setErrors(err instanceof RuleError ? err.message.split("；") : ["保存失败，请重试"]);
    }
  };

  return (
    <section className="panel form-panel">
      <div className="heading">
        <div>
          <p>蹄铁更换与复查冻结闭环 · 登记</p>
          <h2>{intent.mode === "revise" ? "修订原记录" : "登记修蹄 / 更换蹄铁"}</h2>
        </div>
        <div className="mode-switch">
          <button
            className={intent.mode === "new" ? "primary" : ""}
            onClick={() => onIntentChange({ mode: "new" })}
          >
            新登记
          </button>
          <button
            className={intent.mode === "revise" ? "primary" : ""}
            onClick={() =>
              onIntentChange(
                activeRecords[0]
                  ? { mode: "revise", recordId: activeRecords[0].id }
                  : { mode: "new" }
              )
            }
          >
            修订原记录
          </button>
        </div>
      </div>

      {intent.mode === "revise" && (
        <div className="banner warn">
          <label className="inline-label">
            <span>选择要修订的生效记录</span>
            <select
              value={revisingRecord?.id ?? ""}
              onChange={(e) => onIntentChange({ mode: "revise", recordId: e.target.value })}
            >
              {activeRecords.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.horseId} · {HOOF_LABELS[r.hoof]} · {r.shoeType} ·{" "}
                  {r.revision === 0 ? "原始" : `第${r.revision}次修订`}
                </option>
              ))}
            </select>
          </label>
          <p>修订将使该记录的全部旧复查立即失效，连续正常次数清零，需重新复查。</p>
        </div>
      )}

      {intent.mode === "new" && existingActive && (
        <div className="banner warn">
          该蹄位已有生效记录（{existingActive.shoeType} · {existingActive.shodAt}
          ）。保存即视为<b>更换蹄铁</b>：旧记录作废，其全部复查立即失效；同一蹄位始终只留一条待复查记录。
        </div>
      )}

      {abnormal && (
        <div className="banner danger">
          步态三级或左右蹄角差超过 {MAX_ANGLE_DIFF_DEG}°：该蹄位只进异常复查，不得列为可训练；
          须连续两次复查正常且鞋钉牢固方可恢复。
        </div>
      )}

      {errors.length > 0 && (
        <div className="banner danger">
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {notice && <div className="banner ok">{notice}</div>}

      <div className="field-grid">
        <label>
          <span>马匹编号 *</span>
          <input
            list="known-horses"
            placeholder="如 HORSE-18"
            value={form.horseId}
            disabled={intent.mode === "revise"}
            onChange={(e) => set("horseId", e.target.value)}
          />
          <datalist id="known-horses">
            {knownHorses.map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
        </label>

        <label>
          <span>蹄位 *</span>
          <select
            value={form.hoof}
            disabled={intent.mode === "revise"}
            onChange={(e) => set("hoof", e.target.value as HoofPosition)}
          >
            {HOOF_POSITIONS.map((h) => (
              <option key={h} value={h}>
                {HOOF_LABELS[h]}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>步态分级 *</span>
          <select
            value={form.gaitGrade}
            onChange={(e) => set("gaitGrade", Number(e.target.value) as GaitGrade)}
          >
            {GAIT_GRADES.map((g) => (
              <option key={g} value={g}>
                {GAIT_GRADE_LABELS[g]}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>左右蹄角差（度）*</span>
          <input
            type="number"
            min="0"
            step="0.5"
            placeholder={`超过 ${MAX_ANGLE_DIFF_DEG}° 进入异常复查`}
            value={form.angleDiff}
            onChange={(e) => set("angleDiff", e.target.value)}
          />
        </label>

        <label>
          <span>蹄铁类型 *</span>
          <input
            placeholder="如 铝蹄铁 / 钢蹄铁+护蹄垫"
            value={form.shoeType}
            onChange={(e) => set("shoeType", e.target.value)}
          />
        </label>

        <label>
          <span>钉位 *</span>
          <input
            placeholder="如 外侧4钉 · 内侧3钉"
            value={form.nails}
            onChange={(e) => set("nails", e.target.value)}
          />
        </label>

        <label>
          <span>记录人（修蹄师）*</span>
          <input
            placeholder="复查须由另一人填写"
            value={form.farrier}
            onChange={(e) => set("farrier", e.target.value)}
          />
        </label>

        <label>
          <span>修蹄日期 *</span>
          <input
            type="date"
            value={form.shodAt}
            onChange={(e) => set("shodAt", e.target.value)}
          />
        </label>

        <label>
          <span>下次复查日期 *</span>
          <input
            type="date"
            value={form.nextReviewAt}
            onChange={(e) => set("nextReviewAt", e.target.value)}
          />
        </label>

        <label className="span-2">
          <span>备注（照片说明、蹄形评估等）</span>
          <input
            placeholder="选填"
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </label>
      </div>

      <div className="form-footer">
        <button
          className="primary"
          disabled={clientErrors.length > 0}
          title={clientErrors[0] ?? ""}
          onClick={handleSubmit}
        >
          {intent.mode === "revise" ? "保存修订（旧复查立即失效）" : existingActive ? "确认更换蹄铁" : "保存登记"}
        </button>
        {clientErrors.length > 0 && <span className="hint">请先完善：{clientErrors[0]}</span>}
      </div>
    </section>
  );
}
