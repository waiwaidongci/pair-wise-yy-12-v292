import { useMemo, useState } from "react";
import "./styles.css";
import { NewRecordForm } from "./components/NewRecordForm";
import { RecheckBoard } from "./components/RecheckBoard";
import { HorseBoard } from "./components/HorseBoard";
import { HistoryTimeline } from "./components/HistoryTimeline";
import { MetricsBar } from "./components/MetricsBar";
import { useAppState, store } from "./hooks/useStore";
import {
  getCycleViews,
  getHorseViews,
  getMetrics,
} from "./domain/selectors";
import { todayISO } from "./domain/rules";

type BoardFilter = "all" | "abnormal" | "overdue" | "treatment" | "ready";

const FILTERS: { key: BoardFilter; label: string }[] = [
  { key: "all", label: "全部待复查" },
  { key: "abnormal", label: "仅异常复查" },
  { key: "overdue", label: "已逾期" },
  { key: "treatment", label: "待他人处置" },
  { key: "ready", label: "待恢复确认" },
];

const RULES = [
  "每匹马同一蹄位仅保留一条待复查记录，须登记步态分级、蹄角差、蹄铁与钉位。",
  "步态三级或左右蹄角差超过 4°：只进异常复查，不得列为可训练。",
  "复查处置必须由复查人之外的另一人填写；连续两次正常且鞋钉牢固才可恢复。",
  "更换蹄铁或修订原记录，旧复查立即失效；同日重复提交沿用首次结果。",
];

function App() {
  const state = useAppState();
  const today = useMemo(todayISO, []);
  const [filter, setFilter] = useState<BoardFilter>("all");

  const horses = useMemo(() => getHorseViews(state), [state]);
  const cycleViews = useMemo(() => getCycleViews(state, today), [state, today]);
  const metrics = useMemo(() => getMetrics(state, today), [state, today]);

  const activeViews = cycleViews.filter((v) => v.cycle.status === "active");
  const boardViews = cycleViews.filter((v) => {
    if (filter === "all") return true;
    if (filter === "abnormal") return v.abnormal && v.cycle.status === "active";
    if (filter === "overdue") return v.reminder === "overdue";
    if (filter === "treatment") return v.kind === "awaiting-treatment";
    if (filter === "ready") return v.kind === "ready-to-resume";
    return true;
  });

  return (
    <main className="app">
      <section className="hero">
        <p>马术蹄铁修整档案 · 蹄铁更换与复查冻结闭环</p>
        <h1>修蹄档案闭环工作台</h1>
        <ul className="rule-list">
          {RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>

      <MetricsBar metrics={metrics} />

      <section className="panel filter-bar">
        <div className="chips">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={filter === f.key ? "chip on" : "chip"}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          className="ghost"
          onClick={() => {
            if (
              window.confirm("重置为演示数据？当前所有改动将被清除。")
            ) {
              store.resetToSeed();
            }
          }}
        >
          重置演示数据
        </button>
      </section>

      <section className="layout">
        <div className="col-left">
          <NewRecordForm />
        </div>
        <div className="col-right">
          <RecheckBoard views={boardViews} allViews={cycleViews} />
        </div>
      </section>

      <p className="muted summary-line">
        共 {activeViews.length} 条待复查 · {metrics.overdue} 条逾期 ·{" "}
        {metrics.abnormal} 条异常冻结
      </p>

      <HorseBoard horses={horses} />
      <HistoryTimeline state={state} />

      <footer className="footer">
        规则（domain/rules）、存储（domain/store + localStorage）、页面（components）
        三层分离；列表、提醒与刷新后数据均由同一状态派生。
      </footer>
    </main>
  );
}

export default App;
