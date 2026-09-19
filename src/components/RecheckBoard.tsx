import { useState } from "react";
import { store } from "../hooks/useStore";
import {
  angleDiff,
  HOOF_LABEL,
  isTreatmentComplete,
  todayISO,
  treatmentAuthorError,
} from "../domain/rules";
import type { CycleView } from "../domain/selectors";
import { roundOutcome } from "../domain/selectors";
import type { GaitGrade, RecheckRound } from "../domain/types";
import { Field, GaitSelect, TextInput, Toggle } from "./controls";

const KIND_TEXT: Record<CycleView["kind"], string> = {
  abnormal: "异常复查 · 训练冻结",
  "normal-pending": "常规待复查 · 可训练",
  "awaiting-treatment": "等待另一人处置",
  "ready-to-resume": "连续两次正常 · 待确认恢复",
  closed: "已恢复关闭",
  invalidated: "已失效（换铁 / 修订）",
};

const REMINDER_TEXT = {
  overdue: "已逾期",
  "due-today": "今日到期",
  upcoming: "临近复查",
} as const;

function RecheckForm({ view }: { view: CycleView }) {
  const [date, setDate] = useState(todayISO());
  const [reviewer, setReviewer] = useState("");
  const [gaitGrade, setGaitGrade] = useState<GaitGrade>(1);
  const [angleLeft, setAngleLeft] = useState(view.record.angleLeft);
  const [angleRight, setAngleRight] = useState(view.record.angleRight);
  const [shoeFirm, setShoeFirm] = useState(true);
  const [note, setNote] = useState("");
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const submit = () => {
    const result = store.submitRecheck(view.cycle.id, {
      date,
      reviewer,
      gaitGrade,
      angleLeft,
      angleRight,
      shoeFirm,
      note,
    });
    setFlash({ ok: result.ok, text: result.message });
  };

  return (
    <div className="sub-form">
      <div className="sub-form-title">登记本轮复查</div>
      <div className="field-grid compact">
        <Field label="复查日期" required>
          <TextInput
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="复查人" required>
          <TextInput
            value={reviewer}
            placeholder="本场复查登记人"
            onChange={(e) => setReviewer(e.target.value)}
          />
        </Field>
        <Field label="步态分级" required>
          <GaitSelect value={gaitGrade} onChange={setGaitGrade} />
        </Field>
        <Field label="左蹄角（度）" required>
          <TextInput
            type="number"
            value={angleLeft}
            onChange={(e) => setAngleLeft(Number(e.target.value))}
          />
        </Field>
        <Field label="右蹄角（度）" required>
          <TextInput
            type="number"
            value={angleRight}
            onChange={(e) => setAngleRight(Number(e.target.value))}
          />
        </Field>
        <Field label="鞋钉检查">
          <Toggle
            checked={shoeFirm}
            onChange={setShoeFirm}
            label={shoeFirm ? "鞋钉牢固" : "鞋钉松动"}
          />
        </Field>
      </div>
      <Field label="备注">
        <TextInput
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="运步、裂纹、照片编号等"
        />
      </Field>
      {flash ? (
        <div className={flash.ok ? "flash ok" : "flash err"}>{flash.text}</div>
      ) : null}
      <button className="primary small" onClick={submit}>
        提交复查
      </button>
      <p className="tip">
        同一日期重复提交将沿用首次结果；提交后须由另一人填写处置。
      </p>
    </div>
  );
}

function TreatmentForm({
  view,
  round,
}: {
  view: CycleView;
  round: RecheckRound;
}) {
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const authorErr = treatmentAuthorError(round.reviewer, author);

  const submit = () => {
    const result = store.addTreatment(view.cycle.id, round.id, {
      author,
      content,
    });
    setFlash({ ok: result.ok, text: result.message });
    if (result.ok) {
      setAuthor("");
      setContent("");
    }
  };

  return (
    <div className="sub-form treatment">
      <div className="sub-form-title">
        处置登记 <em>（须由复查人「{round.reviewer}」之外的另一人填写）</em>
      </div>
      <div className="field-grid compact">
        <Field label="处置人" required hint={authorErr ?? undefined}>
          <TextInput
            className={authorErr ? "invalid" : ""}
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="与复查人不同"
          />
        </Field>
        <Field label="处置内容" required>
          <TextInput
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="如重钉、打磨修整、休息观察"
          />
        </Field>
      </div>
      {flash ? (
        <div className={flash.ok ? "flash ok" : "flash err"}>{flash.text}</div>
      ) : null}
      <button className="small" onClick={submit}>
        登记处置
      </button>
    </div>
  );
}

function RoundItem({ view, round }: { view: CycleView; round: RecheckRound }) {
  const outcome = roundOutcome(round);
  const complete = isTreatmentComplete(round);
  return (
    <div className={complete ? "round done" : "round open"}>
      <div className="round-head">
        <b>{round.date}</b>
        <span className={outcome.normal ? "tag ok" : "tag bad"}>
          {outcome.normal ? "正常" : "异常 / 非正常"}
        </span>
        {!complete ? <span className="tag warn">待处置</span> : null}
      </div>
      <p className="round-meta">
        复查人 {round.reviewer} · 步态{round.gaitGrade}级 · 左{round.angleLeft}°
        /右{round.angleRight}°（差 {angleDiff(round.angleLeft, round.angleRight)}
        °） · {round.shoeFirm ? "鞋钉牢固" : "鞋钉松动"}
      </p>
      {round.note ? <p className="round-note">记录：{round.note}</p> : null}
      {outcome.flags.length > 0 ? (
        <p className="round-flags">命中：{outcome.flags.join("、")}</p>
      ) : null}
      <div className="treat-list">
        {round.treatments.map((t) => (
          <p key={t.id} className="treat-item">
            <span className="tag ok">处置</span>
            {t.author}：{t.content}
          </p>
        ))}
      </div>
      {!complete && view.cycle.status === "active" ? (
        <TreatmentForm view={view} round={round} />
      ) : null}
    </div>
  );
}

function CycleCard({ view }: { view: CycleView }) {
  const [open, setOpen] = useState(false);
  const [resumeBy, setResumeBy] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const { cycle, record } = view;
  const active = cycle.status === "active";
  const last = cycle.rounds[cycle.rounds.length - 1];
  const needsTreatment = Boolean(last && !isTreatmentComplete(last));

  const resume = () => {
    const result = store.resumeTraining(cycle.id, resumeBy);
    setFlash(result.message);
  };

  return (
    <article
      className={`cycle-card ${view.abnormal ? "abnormal" : ""} ${
        active ? "" : "dim"
      }`}
    >
      <header className="cycle-head" onClick={() => setOpen((v) => !v)}>
        <div className="cycle-title">
          <h3>
            {view.horseName}（{cycle.horseId}） · {HOOF_LABEL[cycle.position]}
          </h3>
          <p>
            {record.shoeType} · v{cycle.revision} · 建档 {record.date} ·
            应复查 {view.due}
          </p>
        </div>
        <div className="cycle-tags">
          {active && view.reminder ? (
            <span className={`tag remind ${view.reminder}`}>
              {REMINDER_TEXT[view.reminder]}
            </span>
          ) : null}
          <span
            className={`tag ${
              view.kind === "abnormal"
                ? "bad"
                : view.kind === "ready-to-resume"
                  ? "ok"
                  : view.kind === "awaiting-treatment"
                    ? "warn"
                    : "neutral"
            }`}
          >
            {KIND_TEXT[view.kind]}
          </span>
          <span className="chevron">{open ? "收起 ▴" : "展开 ▾"}</span>
        </div>
      </header>

      {open ? (
        <div className="cycle-body">
          <div className="streak">
            连续正常计数：
            <b className={view.normalStreak >= 2 ? "ok-text" : ""}>
              {view.normalStreak}
            </b>
            / 2（步态须一级、角差 ≤4°、鞋钉牢固，且处置齐全）
          </div>

          {cycle.status === "invalidated" ? (
            <div className="rule-banner danger">
              该复查已于 {String(cycle.invalidatedAt).slice(0, 10)} 因
              {cycle.invalidatedReason === "reshoe" ? "更换蹄铁" : "修订原记录"}
              立即失效，历史结果仅留档，恢复计数已清零。
            </div>
          ) : null}
          {cycle.status === "closed-normal" ? (
            <div className="rule-banner ok">
              已于 {String(cycle.closedAt).slice(0, 10)} 由 {cycle.closedBy}{" "}
              确认恢复训练，复查闭环关闭。
            </div>
          ) : null}

          {cycle.rounds.length > 0 ? (
            <div className="rounds">
              {cycle.rounds.map((r) => (
                <RoundItem key={r.id} view={view} round={r} />
              ))}
            </div>
          ) : (
            <p className="tip">尚无复查轮次。</p>
          )}

          {active && !needsTreatment ? <RecheckForm view={view} /> : null}
          {active && needsTreatment ? (
            <p className="tip warn-text">
              最新一轮复查等待另一人处置，处置完成前不能登记下一轮。
            </p>
          ) : null}

          {active && view.canResume ? (
            <div className="sub-form resume">
              <div className="sub-form-title">恢复训练（冻结闭环出口）</div>
              <div className="field-grid compact">
                <Field label="确认人" required>
                  <TextInput
                    value={resumeBy}
                    onChange={(e) => setResumeBy(e.target.value)}
                    placeholder="记录确认恢复的人"
                  />
                </Field>
              </div>
              {flash ? <div className="flash ok">{flash}</div> : null}
              <button className="primary small" onClick={resume}>
                确认连续两次正常 · 恢复训练
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function RecheckBoard({
  views,
  allViews,
}: {
  views: CycleView[];
  allViews: CycleView[];
}) {
  const active = views.filter((v) => v.cycle.status === "active");
  const history = allViews.filter((v) => v.cycle.status !== "active");

  return (
    <section className="panel board">
      <div className="heading">
        <div>
          <p>复查冻结闭环</p>
          <h2>复查工作台</h2>
        </div>
        <span className="muted">每匹马同一蹄位仅一条待复查</span>
      </div>

      <h3 className="section-sub">待复查（{active.length}）</h3>
      {active.length === 0 ? (
        <p className="empty">当前没有待复查记录。</p>
      ) : (
        <div className="cycle-list">
          {active.map((v) => (
            <CycleCard key={v.cycle.id} view={v} />
          ))}
        </div>
      )}

      <h3 className="section-sub">已关闭 / 已失效留档（{history.length}）</h3>
      <div className="cycle-list dim-list">
        {history.map((v) => (
          <CycleCard key={v.cycle.id} view={v} />
        ))}
      </div>
    </section>
  );
}
