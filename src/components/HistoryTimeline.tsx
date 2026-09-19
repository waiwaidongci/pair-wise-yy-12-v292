import { HOOF_LABEL } from "../domain/rules";
import type { AppState } from "../domain/types";

const TYPE_LABEL = {
  create: "建档",
  reshoe: "更换蹄铁",
  revise: "修订 / 复查",
} as const;

export function HistoryTimeline({ state }: { state: AppState }) {
  const events = [...state.events].sort((a, b) => b.at.localeCompare(a.at));
  const horseName = (id: string) =>
    state.horses.find((h) => h.id === id)?.name ?? id;

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>留痕时间线</p>
          <h2>蹄铁更换与操作历史</h2>
        </div>
        <span className="muted">换铁 / 修订后旧复查立即可见为“已失效”</span>
      </div>
      {events.length === 0 ? (
        <p className="empty">暂无操作记录。</p>
      ) : (
        <ol className="timeline">
          {events.map((e) => (
            <li key={e.id} className={`tl ${e.type}`}>
              <span className={`tl-type ${e.type}`}>
                {TYPE_LABEL[e.type]}
              </span>
              <div>
                <p>
                  <b>
                    {horseName(e.horseId)}（{e.horseId}）·{" "}
                    {HOOF_LABEL[e.position]} · v{e.revision}
                  </b>
                </p>
                <p className="muted">{e.detail}</p>
                <p className="muted small-text">
                  {e.at.replace("T", " ").slice(0, 16)} · 操作人 {e.operator}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
