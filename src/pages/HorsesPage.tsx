/**
 * 页面：马匹列表
 * 每匹马四个蹄位的闭环状态一览：待复查 / 异常复查（不可训练）/ 已恢复，
 * 并提供「更换蹄铁」「修订记录」「去复查」入口。数据全部来自同一份状态推导。
 */

import {
  FarrierState,
  GAIT_GRADE_LABELS,
  HOOF_LABELS,
  HOOF_POSITIONS,
} from "../domain/types";
import {
  computeMetrics,
  evaluateHoof,
  listHorses,
  MAX_ANGLE_DIFF_DEG,
  RECOVERY_STREAK_REQUIRED,
} from "../domain/rules";
import type { RegisterIntent } from "./RegisterPage";

interface Props {
  state: FarrierState;
  today: string;
  onRegister: (intent: RegisterIntent) => void;
  onGoReviews: () => void;
}

function trackClass(track: string, cleared: boolean): string {
  if (cleared) return "chip ok";
  if (track === "abnormal") return "chip danger";
  if (track === "normal") return "chip info";
  return "chip muted";
}

export default function HorsesPage({ state, today, onRegister, onGoReviews }: Props) {
  const metrics = computeMetrics(state, today);
  const horses = listHorses(state);

  return (
    <>
      <section className="metrics">
        <article>
          <small>待复查</small>
          <strong>{metrics.pendingReviews}</strong>
        </article>
        <article>
          <small>异常步态</small>
          <strong>{metrics.abnormalHooves}</strong>
        </article>
        <article>
          <small>更换蹄铁</small>
          <strong>{metrics.shoeReplacements}</strong>
        </article>
        <article>
          <small>马匹档案</small>
          <strong>{metrics.horses}</strong>
        </article>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>闭环状态 · 每蹄位仅留一条待复查记录</p>
            <h2>马匹列表</h2>
          </div>
          <button className="primary" onClick={() => onRegister({ mode: "new" })}>
            登记修蹄 / 更换蹄铁
          </button>
        </div>

        {horses.length === 0 && <p className="empty">暂无马匹档案，请先登记修蹄记录。</p>}

        <div className="horse-list">
          {horses.map((horse) => (
            <article key={horse.horseId} className="horse-card">
              <header>
                <div>
                  <h3>{horse.horseId}</h3>
                  <p className="sub">
                    {horse.lastShodAt ? `最近修蹄 ${horse.lastShodAt}` : "暂无修蹄记录"}
                    {horse.pendingCount > 0 && ` · 待复查 ${horse.pendingCount} 蹄`}
                  </p>
                </div>
                <span className={horse.trainable ? "chip ok" : "chip danger"}>
                  {horse.trainable ? "可训练" : "暂停训练"}
                </span>
              </header>

              <div className="hoof-grid">
                {HOOF_POSITIONS.map((hoof) => {
                  const ev = evaluateHoof(state, horse.horseId, hoof);
                  const rec = ev.record;
                  return (
                    <div key={hoof} className="hoof-cell">
                      <div className="hoof-head">
                        <b>{HOOF_LABELS[hoof]}</b>
                        <span className={trackClass(ev.track, ev.cleared)}>{ev.statusLabel}</span>
                      </div>
                      {rec ? (
                        <>
                          <dl>
                            <div>
                              <dt>蹄铁 / 钉位</dt>
                              <dd>
                                {rec.shoeType} · {rec.nails}
                              </dd>
                            </div>
                            <div>
                              <dt>步态 / 蹄角差</dt>
                              <dd>
                                {GAIT_GRADE_LABELS[rec.gaitGrade].split(" ")[0]} · 左右差{" "}
                                {rec.angleDiff}°{rec.angleDiff > MAX_ANGLE_DIFF_DEG && "（超阈）"}
                              </dd>
                            </div>
                            <div>
                              <dt>修蹄 / 复查</dt>
                              <dd>
                                {rec.shodAt} → {rec.nextReviewAt}
                                {rec.nextReviewAt < today && ev.pendingReview && (
                                  <em className="overdue">逾期</em>
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>记录人 / 版本</dt>
                              <dd>
                                {rec.farrier} · {rec.revision === 0 ? "原始" : `第${rec.revision}次修订`}
                              </dd>
                            </div>
                          </dl>
                          {ev.track === "abnormal" && !ev.cleared && (
                            <p className="streak">
                              恢复条件：连续正常且鞋钉牢固 {ev.streak}/{RECOVERY_STREAK_REQUIRED}
                            </p>
                          )}
                          <div className="hoof-actions">
                            <button
                              onClick={() =>
                                onRegister({ mode: "new", horseId: horse.horseId, hoof })
                              }
                            >
                              更换蹄铁
                            </button>
                            <button onClick={() => onRegister({ mode: "revise", recordId: rec.id })}>
                              修订
                            </button>
                            {ev.pendingReview && <button onClick={onGoReviews}>去复查</button>}
                          </div>
                        </>
                      ) : (
                        <div className="hoof-empty">
                          <p>无修蹄记录</p>
                          <button
                            onClick={() => onRegister({ mode: "new", horseId: horse.horseId, hoof })}
                          >
                            登记
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
