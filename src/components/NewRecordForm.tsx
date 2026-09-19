import { useMemo, useState } from "react";
import { store } from "../hooks/useStore";
import {
  ANGLE_LIMIT,
  angleDiff,
  HOOF_POSITIONS,
  isAbnormal,
  todayISO,
} from "../domain/rules";
import type { GaitGrade, HoofPosition, RecordInput } from "../domain/types";
import {
  Field,
  GaitSelect,
  NailPicker,
  PositionSelect,
  TextInput,
} from "./controls";

export function NewRecordForm() {
  const [horseId, setHorseId] = useState("");
  const [horseName, setHorseName] = useState("");
  const [position, setPosition] = useState<HoofPosition>("LF");
  const [date, setDate] = useState(todayISO());
  const [gaitGrade, setGaitGrade] = useState<GaitGrade>(1);
  const [gaitNote, setGaitNote] = useState("");
  const [angleLeft, setAngleLeft] = useState(52);
  const [angleRight, setAngleRight] = useState(52);
  const [shoeType, setShoeType] = useState("铝蹄铁");
  const [nails, setNails] = useState<string[]>(["内1", "外1"]);
  const [farrier, setFarrier] = useState("");
  const [intervalDays, setIntervalDays] = useState(14);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const state = store.getState();
  const occupied = useMemo(() => {
    const id = horseId.trim();
    if (!id) return [] as HoofPosition[];
    return HOOF_POSITIONS.filter((p) =>
      Boolean(store.currentRecord(id, p)),
    );
  }, [horseId, state.records]);

  const abnormal = isAbnormal({ gaitGrade, angleLeft, angleRight });
  const diff = angleDiff(angleLeft, angleRight);

  const submit = () => {
    const input: RecordInput = {
      horseId,
      horseName,
      position,
      date,
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
    const result = store.createRecord(input);
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) {
      setGaitNote("");
      setNote("");
      setNails(["内1", "外1"]);
    }
  };

  return (
    <section className="panel form-panel">
      <div className="heading">
        <div>
          <p>修蹄建档</p>
          <h2>新增修蹄档案</h2>
        </div>
      </div>

      <div className="field-grid">
        <Field label="马匹编号" required>
          <TextInput
            list="horse-list"
            value={horseId}
            placeholder="如 HORSE-60"
            onChange={(e) => setHorseId(e.target.value)}
          />
          <datalist id="horse-list">
            {state.horses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="马匹名称（新编号时填）">
          <TextInput
            value={horseName}
            placeholder="可留空"
            onChange={(e) => setHorseName(e.target.value)}
          />
        </Field>
        <Field label="蹄位" required>
          <PositionSelect
            value={position}
            onChange={setPosition}
            disabledPositions={occupied}
          />
        </Field>
        <Field label="修蹄日期" required>
          <TextInput
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field
          label="步态分级"
          required
          hint="三级为明显异常：只进异常复查、冻结训练"
        >
          <GaitSelect value={gaitGrade} onChange={setGaitGrade} />
        </Field>
        <Field label="步态问题描述">
          <TextInput
            value={gaitNote}
            placeholder="如外侧磨耗、运步短促"
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
        <Field
          label="右蹄角（度）"
          required
          hint={`左右差 ${diff}°，超过 ${ANGLE_LIMIT}° 即异常`}
        >
          <TextInput
            type="number"
            value={angleRight}
            onChange={(e) => setAngleRight(Number(e.target.value))}
          />
        </Field>
        <Field label="蹄铁类型" required hint="裸蹄可填“无”">
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
        <Field label="蹄铁师" required>
          <TextInput
            value={farrier}
            placeholder="建档操作人"
            onChange={(e) => setFarrier(e.target.value)}
          />
        </Field>
        <Field label="照片 / 备注">
          <TextInput
            value={note}
            placeholder="照片编号或文字备注"
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>

      <Field label="钉位（至少一个）" required>
        <NailPicker value={nails} onChange={setNails} />
      </Field>

      {abnormal ? (
        <div className="rule-banner danger">
          规则命中：步态三级或左右蹄角差 {diff}°＞{ANGLE_LIMIT}°，
          <b>仅进入异常复查，不得列为可训练</b>。
        </div>
      ) : (
        <div className="rule-banner ok">
          数据正常：建档后进入常规待复查，可继续训练，到期提醒复查。
        </div>
      )}

      {message ? (
        <div className={message.ok ? "flash ok" : "flash err"}>
          {message.text}
        </div>
      ) : null}

      <div className="form-actions">
        <button className="primary" onClick={submit}>
          保存建档并生成复查
        </button>
      </div>
    </section>
  );
}
