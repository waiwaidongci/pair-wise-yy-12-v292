/**
 * 页面：蹄铁更换历史
 * 全部修蹄记录（生效 / 已被更换）及其复查时间线；
 * 因更换蹄铁或修订记录而失效的复查逐条标注，可追溯闭环全过程。
 */

import { useMemo, useState } from "react";
import {
  FarrierState,
  GAIT_GRADE_LABELS,
  HOOF_LABELS,
  ReviewEntry,
  ShoeingRecord,
} from "../domain/types";
import { evaluateHoof, reviewsForRecord } from "../domain/rules";

interface Props {
  state: FarrierState;
}

function invalidReasonLabel(rv: ReviewEntry): string {
  if (rv.valid) return "";
  return rv.invalidReason === "shoe-replaced" ? "已失效 · 更换蹄铁" : "已失效 · 修订原记录";
}

function RecordCard({ state, record }: { state: FarrierState; record: ShoeingRecord }) {
  const reviews = reviewsForRecord(state, record);
  const ev =
    record.status === "active" ? evaluateHoof(state, record.horseId, record.hoof) : undefined;

  return (
    <article className={`history-card ${record.status === "superseded" ? "is-old" : ""}`}>
      <header>
        <div>
          <h3>
            {record.horseId} · {HOOF_LABELS[record.hoof]} · {record.shoeType}
          </h3>
          <p className="sub">
            修蹄 {record.shodAt} · 下次复查 {record.nextReviewAt} · 记录人 {record.farrier}
          </p>
        </div>
        <div className="reminder-side">
          <span className={record.status === "active" ? "chip ok" : "chip muted"}>
            {record.status === "active" ? "生效中" : "已被更换"}
          </span>
          <span className="chip info">
            {record.revision === 0 ? "原始版本" : `第 ${record.revision} 次修订`}
          </span>
          {ev && (
            <span className={ev.trainable ? "chip ok" : "chip danger"}>
              {ev.trainable ? "可训练" : "不可训练"}
            </span>
          )}
        </div>
      </header>

      <dl className="history-fields">
        <div>
          <dt>步态分级</dt>
          <dd>{GAIT_GRADE_LABELS[record.gaitGrade]}</dd>
        </div>
        <div>
          <dt>左右蹄角差</dt>
          <dd>{record.angleDiff}°</dd>
        </div>
        <div>
          <dt>钉位</dt>
          <dd>{record.nails}</dd>
        </div>
        <div>
          <dt>备注</dt>
          <dd>{record.note || "—"}</dd>
        </div>
      </dl>

      {record.status === "superseded" && record.supersededAt && (
        <p className="invalid-line">已于 {record.supersededAt.slice(0, 10)} 被新记录更换，其复查全部失效</p>
      )}

      {reviews.length > 0 && (
        <div className="review-timeline">
          <h4>复查记录（{reviews.length}）</h4>
          {reviews.map((rv) => (
            <div key={rv.id} className={`review-item ${rv.valid ? "" : "is-invalid"}`}>
              <span className={rv.valid ? "chip ok" : "chip muted"}>
                {rv.valid ? "有效" : invalidReasonLabel(rv)}
              </span>
              <p>
                {rv.reviewedAt.slice(0, 10)} · {rv.reviewer} ·{" "}
                {rv.result === "normal" ? "正常" : "异常"} · 鞋钉{rv.nailsSecure ? "牢固" : "松动"}
                　{rv.disposition}
              </p>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export default function HistoryPage({ state }: Props) {
  const horses = useMemo(
    () => Array.from(new Set(state.records.map((r) => r.horseId))).sort(),
    [state.records]
  );
  const [filter, setFilter] = useState<string>("all");

  const records = useMemo(
    () =>
      state.records
        .filter((r) => filter === "all" || r.horseId === filter)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.records, filter]
  );

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>更换与修订全程留痕 · 失效复查可追溯</p>
          <h2>蹄铁更换历史（{records.length}）</h2>
        </div>
        <div className="chips">
          <button className={filter === "all" ? "primary" : ""} onClick={() => setFilter("all")}>
            全部
          </button>
          {horses.map((h) => (
            <button
              key={h}
              className={filter === h ? "primary" : ""}
              onClick={() => setFilter(h)}
            >
              {h}
            </button>
          ))}
        </div>
      </div>

      {records.length === 0 && <p className="empty">暂无修蹄记录。</p>}

      <div className="history-list">
        {records.map((r) => (
          <RecordCard key={r.id} state={state} record={r} />
        ))}
      </div>
    </section>
  );
}
