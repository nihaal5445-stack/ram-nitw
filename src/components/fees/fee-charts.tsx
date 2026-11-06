"use client";

import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { feeShares, feeTrend, monthlyFeeRs } from "@/config/fee-demo";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--gold)", "var(--muted-foreground)"];
const SERIES = [["food", "var(--chart-1)"], ["staff", "var(--chart-2)"], ["other", "var(--chart-3)"]] as const;

export function FeeCharts() {
  const t = useTranslations("Fees");
  const rs = (pct: number) => Math.round((monthlyFeeRs * pct) / 100);
  const pie = feeShares.map((s) => ({ ...s, name: t(`cat.${s.key}`), value: s.pct }));
  const trend = feeTrend.map((m) => ({ ...m, total: m.food + m.staff + m.other }));

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <section aria-labelledby="donut-title">
        <h2 id="donut-title" className="font-display text-2xl font-semibold">{t("donutTitle")}</h2>
        <div className="relative mt-4 h-72" role="img" aria-label={`${t("donutAria")}: ${pie.map((p) => `${p.name} ${p.pct}%`).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 288 }}>
            <PieChart>
              <Pie data={pie} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="92%" paddingAngle={1.5} stroke="var(--background)" strokeWidth={2} isAnimationActive={false}>
                {pie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [`${v}% · Rs ${rs(Number(v))}`, n]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-xs text-muted-foreground">{t("perStudent")}</span>
            <span className="font-display text-3xl font-semibold text-brand">Rs {monthlyFeeRs.toLocaleString("en-IN")}</span>
          </div>
        </div>
        <table className="mt-4 w-full text-sm">
          <caption className="sr-only">{t("donutTitle")}</caption>
          <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="py-1">&nbsp;</th><th className="py-1 text-right">{t("share")}</th><th className="py-1 text-right">{t("amount")}</th></tr></thead>
          <tbody className="divide-y divide-border">
            {pie.map((p, i) => (
              <tr key={p.key}>
                <td className="py-1.5"><span className="mr-2 inline-block size-3 rounded-sm align-middle" style={{ background: COLORS[i % COLORS.length] }} aria-hidden />{p.name}</td>
                <td className="py-1.5 text-right tabular-nums">{p.pct}%</td>
                <td className="py-1.5 text-right tabular-nums">Rs {rs(p.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="trend-title">
        <h2 id="trend-title" className="font-display text-2xl font-semibold">{t("trendTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("trendLead")}</p>
        <div className="mt-4 h-72" role="img" aria-label={`${t("trendAria")}: ${trend.map((m) => `${m.month} Rs ${m.total}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height: 288 }}>
            <BarChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
              <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Legend formatter={(v) => <span style={{ color: "var(--foreground)" }}>{v}</span>} />
              {SERIES.map(([k, c]) => <Bar key={k} dataKey={k} name={t(`series.${k}`)} stackId="a" fill={c} isAnimationActive={false} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table className="mt-4 w-full text-sm">
          <caption className="sr-only">{t("trendTitle")}</caption>
          <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="py-1">{t("month")}</th>{SERIES.map(([k]) => <th key={k} className="py-1 text-right">{t(`series.${k}`)}</th>)}<th className="py-1 text-right">{t("total")}</th></tr></thead>
          <tbody className="divide-y divide-border">
            {trend.map((m) => (
              <tr key={m.month}><td className="py-1.5">{m.month}</td><td className="py-1.5 text-right tabular-nums">{m.food}</td><td className="py-1.5 text-right tabular-nums">{m.staff}</td><td className="py-1.5 text-right tabular-nums">{m.other}</td><td className="py-1.5 text-right font-medium tabular-nums">{m.total}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
