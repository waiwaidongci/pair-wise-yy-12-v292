import { useState } from "react";
import { store } from "../hooks/useStore";
import {
  angleDiff,
  HOOF_LABEL,
  isAbnormal,
  isCycleAbnormal,
  todayISO,
} from "../domain/rules";
import type { HorseView } from "../domain/selectors";
import type { ShoeRecord } from "../domain/types";
import { Field, GaitSelect, NailPicker, TextInput } from "./controls";

function HoofCell({
  horse,
  position,
  record,
  cycle,
  onManage,
}: {
  horse: HorseView;
  position: keyof typeof HOOF_LABEL;
  record?: ShoeRecord;
  cycle?: HorseView["hooves"][number]["activeCycle"];
  onManage: (record: ShoeRecord, mode: "reshoe" | "revise") => void;
}) {
  if (!record) {
    return (
      <div className="hoof empty">
        <header>{HOOF_LABEL[position]}</header>
        <p>未建档</p>
      </div>
    );
  }
  const recordAbnormal = isAbnormal({
    gaitGrade: record.gaitGrade,
    angleLeft: record.angleLeft,
    angleRight: record.angleRight,
  });
  const abnormal = recordAbnormal || (cycle ? isCycleAbnormal(cycle) : false);
  return (
    <div className={abnormal ? "hoof bad" : "hoof good"}>
      <header>
        {HOOF_LABEL[position]}
        <span className={abnormal ? "tag bad" : "tag ok"}>
          {abnormal ? "异常" : "正常"}
        </span>
      </header>
      <p className="hoof-line">
        {record.shoeType} · v{record.revision}
      </p>
      <p className="hoof-line">
        步态{record.gaitGrade}级 · 左{record.angleLeft}°/右{record.angleRight}°
        （差 {angleDiff(record.angleLeft, record.angleRight)}°）
      </p>
      <p className="hoof-line nails">钉位：{record.nailPositions.join("、")}</p>
      <p className="hoof-line muted">
        {cycle
          ? cycle.status === "active"
            ? `复查中（${cycle.rounds.length} 轮）`
            : cycle.status === "closed-normal"
              ? "复查已关闭"
              : "旧复查已失效"
          : "无待复查"}
      </p>
      <div className="hoof-actions">
        <button
          className="small"
          onClick={() => onManage(record, "reshoe")}
        >
          更换蹄铁
        </button>
        <button
          className="small ghost"
          onClick={() => onManage(record, "revise")}
        >
          修订
        </button>
      </div>
    </div>
  );
}

function ManageModal({
  record,
  mode,
  onClose,
}: {
  record: ShoeRecord;
  mode: "reshoe" | "revise";
  onClose: () => void;
}) {
  const [date, setDate] = useState(
    mode === "reshoe" ? todayISO() : record.date,
  );
  const [gaitGrade, setGaitGrade] = useState(record.gaitGrade);
  const [gaitNote, setGaitNote] = useState(record.gaitNote);
  const [angleLeft, setAngleLeft] = useState(record.angleLeft);
  const [angleRight, setAngleRight] = useState(record.angleRight);
  const [shoeType, setShoeType] = useState(record.shoeType);
  const [nails, setNails] = useState<string[]>(record.nailPositions);
  const [farrier, setFarrier] = useState(record.farrier);
  const [intervalDays, setIntervalDays] = useState(
    record.recheckIntervalDays,
  );
  const [note, setNote] = useState(record.note);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const abnormal = isAbnormal({ gaitGrade, angleLeft, angleRight });

  const submit = () => {
    const patch = {
      gaitGrade,
      gaitNote,
      angleLeft,
      angleRight,
      shoeType,
      nailPositions: nails,
      farrier,
      recheckIntervalDays: intervalDays,
      note,
    };
    const result =
      mode === "reshoe"
        ? store.reshoe(record.id, {
            date,
            ...patch,
          })
        : store.revise(record.id, patch);
    setFlash({ ok: result.ok, text: result.message });
    if (result.ok) setTimeout(onClose, 900);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="heading">
          <div>
            <p>{mode === "reshoe" ? "蹄铁更换" : "档案修订"}</p>
            <h2>
              {record.horseId} · {HOOF_LABEL[record.position]} · v
              {record.revision} → v{record.revision + 1}
            </h2>
          </div>
          <button className="ghost" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="rule-banner danger">
          {mode === "reshoe"
            ? "更换蹄铁后：旧待复查立即失效、连续正常计数清零，按新数据重开复查。"
            : "修订原记录后：旧待复查立即失效、已登记复查全部作废，按修订数据重开。"}
        </div>

        <div className="field-grid">
          <Field label={mode === "reshoe" ? "换蹄铁日期" : "修蹄日期"} required>
            <TextInput
              type="date"
              value={date}
              disabled={mode === "revise"}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="操作蹄铁师" required>
            <TextInput
              value={farrier}
              onChange={(e) => setFarrier(e.target.value)}
            />
          </Field>
          <Field label="步态分级" required>
            <GaitSelect value={gaitGrade} onChange={setGaitGrade} />
          </Field>
          <Field label="步态问题">
            <TextInput
              value={gaitNote}
              onChange={(e) => setGaitNote(e.target.value)}
            />
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
          <Field label="蹄铁类型" required>
            <TextInput
              value={shoeType}
              onChange={(e) => setShoeType(e.target.value)}
            />
          </Field>
          <Field label="复查间隔（天）" required>
            <TextInput
              type="number"
              min={1}
              value={intervalDays}
              onChange={(e) => setIntervalDays(Number(e.target.value))}
            />
          </Field>
        </div>

        <Field label="钉位" required>
          <NailPicker value={nails} onChange={setNails} />
        </Field>
        <Field label="备注">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {abnormal ? (
          <div className="rule-banner danger">
            新数据命中异常规则：仅进入异常复查，不得列为可训练。
          </div>
        ) : (
          <div className="rule-banner ok">新数据正常：进入常规待复查。</div>
        )}

        {flash ? (
          <div className={flash.ok ? "flash ok" : "flash err"}>{flash.text}</div>
        ) : null}

        <div className="form-actions">
          <button className="primary" onClick={submit}>
            {mode === "reshoe" ? "确认更换并重开复查" : "确认修订并重开复查"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function HorseBoard({ horses }: { horses: HorseView[] }) {
  const [managing, setManaging] = useState<{
    record: ShoeRecord;
    mode: "reshoe" | "revise";
  } | null>(null);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>马匹档案</p>
          <h2>马匹列表 · 四蹄对比</h2>
        </div>
        <span className="muted">任一蹄位异常 → 整马不得列为可训练</span>
      </div>
      <div className="horse-grid">
        {horses.map((horse) => (
          <article
            key={horse.id}
            className={horse.trainable ? "horse-card ok" : "horse-card frozen"}
          >
            <header className="horse-head">
              <div>
                <h3>
                  {horse.name} <span className="muted">{horse.id}</span>
                </h3>
                <p>
                  待复查 {horse.pendingCount} · 异常蹄位 {horse.abnormalHoofCount}
                </p>
              </div>
              <span className={horse.trainable ? "tag ok big" : "tag bad big"}>
                {horse.trainable ? "可训练" : "禁止训练"}
              </span>
            </header>
            {horse.freezeReason ? (
              <p className="freeze-reason">冻结原因：{horse.freezeReason}</p>
            ) : (
              <p className="freeze-reason ok-text">各蹄位数据正常</p>
            )}
            <div className="hoof-grid">
              {horse.hooves.map((h) => (
                <HoofCell
                  key={h.position}
                  horse={horse}
                  position={h.position}
                  record={h.record}
                  cycle={h.activeCycle}
                  onManage={(record, mode) => setManaging({ record, mode })}
                />
              ))}
            </div>
          </article>
        ))}
      </div>
      {managing ? (
        <ManageModal
          record={managing.record}
          mode={managing.mode}
          onClose={() => setManaging(null)}
        />
      ) : null}
    </section>
  );
}
