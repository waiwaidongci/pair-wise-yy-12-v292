import { useMemo, useState } from "react";
import "./styles.css";
import { FarrierState } from "./domain/types";
import { todayStr } from "./domain/rules";
import { loadState, resetState, saveState } from "./storage/store";
import HorsesPage from "./pages/HorsesPage";
import RegisterPage, { RegisterIntent } from "./pages/RegisterPage";
import ReviewsPage from "./pages/ReviewsPage";
import HistoryPage from "./pages/HistoryPage";

type PageKey = "horses" | "register" | "reviews" | "history";

const PAGE_TABS: { key: PageKey; label: string }[] = [
  { key: "horses", label: "马匹列表" },
  { key: "register", label: "登记 / 更换蹄铁" },
  { key: "reviews", label: "复查提醒" },
  { key: "history", label: "更换历史" },
];

function App() {
  // 唯一状态源：所有页面由此推导，变更即写入 localStorage，刷新后一致
  const [state, setState] = useState<FarrierState>(() => loadState());
  const [page, setPage] = useState<PageKey>("horses");
  const [intent, setIntent] = useState<RegisterIntent>({ mode: "new" });
  const [flash, setFlash] = useState("");
  const today = useMemo(() => todayStr(), []);

  const update = (next: FarrierState, message?: string) => {
    setState(next);
    saveState(next);
    if (message) setFlash(message);
  };

  const goRegister = (nextIntent: RegisterIntent) => {
    setIntent(nextIntent);
    setPage("register");
  };

  const handleReset = () => {
    if (window.confirm("确定重置为演示数据？当前全部修蹄与复查记录将被清除。")) {
      update(resetState(), "已重置为演示数据");
    }
  };

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62011 · 蹄铁更换与复查冻结闭环</p>
        <h1>马术蹄铁修整档案</h1>
        <span>
          每匹马同一蹄位仅留一条待复查记录；登记须含步态分级、左右蹄角差、蹄铁与钉位。
          步态三级或蹄角差超过 4° 只进异常复查、不得列为可训练；复查须另一人填写处置，
          连续两次正常且鞋钉牢固才恢复。更换蹄铁或修订原记录会使旧复查立即失效，重复提交沿用首次结果。
        </span>
        <nav className="tabs">
          {PAGE_TABS.map((tab) => (
            <button
              key={tab.key}
              className={page === tab.key ? "primary" : ""}
              onClick={() => setPage(tab.key)}
            >
              {tab.label}
            </button>
          ))}
          <button className="ghost" onClick={handleReset}>
            重置演示数据
          </button>
        </nav>
      </section>

      {flash && (
        <div className="banner ok flash" onClick={() => setFlash("")}>
          {flash}（点击关闭）
        </div>
      )}

      {page === "horses" && (
        <HorsesPage
          state={state}
          today={today}
          onRegister={goRegister}
          onGoReviews={() => setPage("reviews")}
        />
      )}

      {page === "register" && (
        <RegisterPage
          state={state}
          intent={intent}
          onIntentChange={setIntent}
          onSaved={(next, message) => {
            update(next, message);
            setPage("horses");
          }}
        />
      )}

      {page === "reviews" && (
        <ReviewsPage state={state} today={today} onChange={update} />
      )}

      {page === "history" && <HistoryPage state={state} />}
    </main>
  );
}

export default App;
