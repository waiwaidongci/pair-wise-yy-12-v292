import type { Metrics } from "../domain/selectors";

function Metric({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: number | string;
  tone?: "danger" | "warn" | "ok";
  sub?: string;
}) {
  return (
    <article className={`metric ${tone ?? ""}`}>
      <small>{label}</small>
      <strong>{value}</strong>
      {sub ? <span className="metric-sub">{sub}</span> : null}
    </article>
  );
}

export function MetricsBar({ metrics }: { metrics: Metrics }) {
  return (
    <section className="metrics">
      <Metric
        label="待复查（每马每蹄位一条）"
        value={metrics.pending}
        sub={`其中异常 ${metrics.abnormal} · 逾期 ${metrics.overdue}`}
        tone={metrics.overdue > 0 ? "danger" : undefined}
      />
      <Metric
        label="待他人处置"
        value={metrics.awaitingTreatment}
        tone={metrics.awaitingTreatment > 0 ? "warn" : undefined}
        sub="处置人须与复查人不同"
      />
      <Metric
        label="可训练马匹"
        value={`${metrics.trainableHorses}/${metrics.totalHorses}`}
        tone={
          metrics.trainableHorses === metrics.totalHorses ? "ok" : "danger"
        }
        sub="步态三级或角差>4°即冻结"
      />
      <Metric
        label="蹄铁更换次数"
        value={metrics.reshoeCount}
        sub="换铁/修订即冻结旧复查"
      />
    </section>
  );
}
