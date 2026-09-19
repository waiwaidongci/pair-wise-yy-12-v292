import type { ReactNode } from "react";
import { GAIT_LABEL, NAIL_OPTIONS } from "../domain/rules";
import type { GaitGrade, HoofPosition } from "../domain/types";

export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required ? <em>*</em> : null}
      </span>
      {children}
      {hint ? <small className="field-hint">{hint}</small> : null}
    </label>
  );
}

export function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return <input {...props} />;
}

export function GaitSelect({
  value,
  onChange,
}: {
  value: GaitGrade;
  onChange: (g: GaitGrade) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value) as GaitGrade)}
    >
      {(Object.keys(GAIT_LABEL) as unknown as string[]).map((k) => (
        <option key={k} value={k}>
          {GAIT_LABEL[Number(k) as GaitGrade]}
        </option>
      ))}
    </select>
  );
}

export function PositionSelect({
  value,
  onChange,
  disabledPositions,
}: {
  value: HoofPosition;
  onChange: (p: HoofPosition) => void;
  disabledPositions?: HoofPosition[];
}) {
  const labels: Record<HoofPosition, string> = {
    LF: "左前蹄",
    RF: "右前蹄",
    LH: "左后蹄",
    RH: "右后蹄",
  };
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as HoofPosition)}
    >
      {(Object.keys(labels) as HoofPosition[]).map((p) => (
        <option
          key={p}
          value={p}
          disabled={disabledPositions?.includes(p)}
        >
          {labels[p]}
          {disabledPositions?.includes(p) ? "（已有当前档案）" : ""}
        </option>
      ))}
    </select>
  );
}

export function NailPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (nails: string[]) => void;
}) {
  const toggle = (nail: string) => {
    onChange(
      value.includes(nail)
        ? value.filter((n) => n !== nail)
        : [...value, nail],
    );
  };
  return (
    <div className="nail-picker">
      {NAIL_OPTIONS.map((nail) => (
        <button
          type="button"
          key={nail}
          className={value.includes(nail) ? "nail on" : "nail"}
          onClick={() => toggle(nail)}
        >
          {nail}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={checked ? "toggle on" : "toggle"}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-dot" />
      {label}
    </button>
  );
}
