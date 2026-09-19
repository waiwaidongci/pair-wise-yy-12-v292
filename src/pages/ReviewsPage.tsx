/**
 * 页面：复查提醒 + 复查处置
 * - 只列未闭环的生效记录，按下次复查日期排序，逾期置顶标红；
 * - 复查须另一人填写处置（复查人 ≠ 记录人）；
 * - 连续两次正常且鞋钉牢固才恢复（闭环）；
 * - 重复提交沿用首次结果：表单凭幂等键提交，同键重提不产生新记录。
 */

import { useMemo, useRef, useState } from "react";
import {
  FarrierState,
  GAIT_GRADE_LABELS,
  HOOF_LABELS,
  ReviewEntry,
  ReviewResult,
} from "../domain/types";
import {
  pendingReminders,
  RECOVERY_STREAK_REQUIRED,
  ReminderItem,
  RuleError,
  submitReview,
  uid,
} from "../domain/rules";

interface Props {
  state: FarrierState;
  today: string;
  onChange: (next: FarrierState, message: string) => void;
}

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

function ReviewForm({
  item,
  state,
  onChange,
}: {
  item: ReminderItem;
  state: FarrierState;
  onChange: Props["onChange"];
}) {
  // 幂等键在表单打开时生成一次：双击、重试、重复提交都沿用首次结果
  const idemKey = useRef(uid("idem"));
  const [reviewer, setReviewer] = useState("");
  const [result, setResult] = useState<ReviewResult>("normal");
  const [nailsSecure, setNailsSecure] = useState(true);
  const [disposition, setDisposition] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ review: ReviewEntry; deduplicated: boolean } | null>(null);

  const submit = () => {
    setError("");
    try {
      const out = submitReview(
        state,
        {
          idempotencyKey: idemKey.current,
          recordId: item.record.id,
          reviewer,
          result,
          nailsSecure,
          disposition,
        },
        nowIso()
      );
      setDone({ review: out.review, deduplicated: out.deduplicated });
      onChange(
        out.state,
        out.deduplicated ? "重复提交，已沿用首次结果" : "复查处置已提交"
      );
    } catch (err) {
      setError(err instanceof RuleError ? err.message : "提交失败，请重试");
    }
  };

  const resetForNext = () => {
    idemKey.current = uid("idem");
    setReviewer("");
    setResult("normal");
    setNailsSecure(true);
    setDisposition("");
    setDone(null);
    setError("");
  };

  if (done) {
    const rv = done.review;
    return (
      <div className={done.deduplicated ? "banner warn" : "banner ok"}>
        <p>
          <b>{done.deduplicated ? "重复提交，已沿用首次结果" : "复查已提交"}</b>
          {"　"}复查人 {rv.reviewer} · {rv.result === "normal" ? "正常" : "异常"} · 鞋钉
          {rv.nailsSecure ? "牢固" : "松动"} · {rv.disposition}
        </p>
        <div className="row-actions">
          <button onClick={submit}>再次提交（同一表单，验证幂等）</button>
          <button className="primary" onClick={resetForNext}>
            继续下一次复查
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="review-form">
      <div className="field-grid">
        <label>
          <span>复查人 *（须与记录人 {item.record.farrier} 不同）</span>
          <input
            placeholder="另一人填写"
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
          />
        </label>
        <label>
          <span>复查结果 *</span>
          <select value={result} onChange={(e) => setResult(e.target.value as ReviewResult)}>
            <option value="normal">正常</option>
            <option value="abnormal">异常</option>
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={nailsSecure}
            onChange={(e) => setNailsSecure(e.target.checked)}
          />
          <span>鞋钉牢固</span>
        </label>
        <label>
          <span>处置意见 *</span>
          <input
            placeholder="如：继续观察 / 调整钉位 / 暂停训练"
            value={disposition}
            onChange={(e) => setDisposition(e.target.value)}
          />
        </label>
      </div>
      {error && <div className="banner danger">{error}</div>}
      <div className="form-footer">
        <button className="primary" onClick={submit}>
          提交复查处置
        </button>
        <span className="hint">重复提交将沿用首次结果，不会产生新记录</span>
      </div>
    </div>
  );
}

export default function ReviewsPage({ state, today, onChange }: Props) {
  const reminders = useMemo(() => pendingReminders(state, today), [state, today]);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>按下次复查日期排序 · 逾期置顶</p>
          <h2>复查提醒（{reminders.length}）</h2>
        </div>
      </div>

      {reminders.length === 0 && (
        <p className="empty">当前没有待复查的蹄位，全部复查已闭环。</p>
      )}

      <div className="reminder-list">
        {reminders.map((item) => {
          const { record, evaluation } = item;
          const open = openId === record.id;
          return (
            <article key={record.id} className={`reminder ${item.overdue ? "is-overdue" : ""}`}>
              <header>
                <div>
                  <h3>
                    {record.horseId} · {HOOF_LABELS[record.hoof]}
                  </h3>
                  <p className="sub">
                    {GAIT_GRADE_LABELS[record.gaitGrade]} · 蹄角差 {record.angleDiff}° ·{" "}
                    {record.shoeType} · {record.nails}
                  </p>
                  <p className="sub">
                    记录人 {record.farrier} · 修蹄 {record.shodAt} · 下次复查 {record.nextReviewAt}
                    {record.revision > 0 && ` · 第${record.revision}次修订`}
                  </p>
                </div>
                <div className="reminder-side">
                  {item.overdue ? (
                    <span className="chip danger">逾期 {-item.daysUntil} 天</span>
                  ) : item.daysUntil === 0 ? (
                    <span className="chip warn">今日到期</span>
                  ) : (
                    <span className="chip info">{item.daysUntil} 天后复查</span>
                  )}
                  <span className={evaluation.track === "abnormal" ? "chip danger" : "chip info"}>
                    {evaluation.track === "abnormal" ? "异常复查 · 不可训练" : "常规复查 · 可训练"}
                  </span>
                </div>
              </header>

              <p className="streak">
                恢复进度：连续正常且鞋钉牢固 {evaluation.streak}/{RECOVERY_STREAK_REQUIRED}
                {evaluation.validReviews.length > 0 &&
                  `（最近：${evaluation.validReviews
                    .map((rv) => `${rv.reviewer} ${rv.result === "normal" ? "正常" : "异常"}`)
                    .join(" → ")}）`}
              </p>

              {!open ? (
                <div className="row-actions">
                  <button className="primary" onClick={() => setOpenId(record.id)}>
                    填写复查处置
                  </button>
                </div>
              ) : (
                <ReviewForm
                  item={item}
                  state={state}
                  onChange={(next, msg) => {
                    onChange(next, msg);
                  }}
                />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
