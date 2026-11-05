"use client";

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { Download, ImageDown } from "lucide-react";

echarts.use([BarChart, LineChart, GridComponent, TitleComponent, TooltipComponent, CanvasRenderer]);

export interface ChartPoint {
  label: string;
  value: number | null;
}

// Gráfico ECharts (solo agregados o muestras declaradas, nunca millones de
// puntos) + alternativa tabular accesible + descarga PNG.
export default function ChartView({
  title,
  kind,
  points,
}: {
  title: string;
  kind: "bar" | "line";
  points: ChartPoint[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [png, setPng] = useState<string | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;
    chart.setOption({
      backgroundColor: "transparent",
      color: ["#7c3aed"],
      title: { text: title, left: "center", top: 4, textStyle: { color: "#1e1b4b", fontSize: 14, fontWeight: 600 } },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#ffffff",
        borderColor: "#ddd6fe",
        borderWidth: 1,
        borderRadius: 10,
        textStyle: { color: "#1e1b4b" },
        axisPointer: { type: "line", lineStyle: { color: "#a78bfa", type: "dashed" } },
      },
      grid: { left: 52, right: 20, top: 52, bottom: 64, containLabel: true },
      xAxis: {
        type: "category",
        data: points.map((p) => p.label),
        axisLabel: { rotate: points.length > 8 ? 45 : 0, color: "#64748b", hideOverlap: true },
        axisLine: { lineStyle: { color: "#e2e8f0" } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#64748b" },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: "#f1f5f9" } },
      },
      series: [{
        type: kind,
        data: points.map((p) => p.value),
        itemStyle: { color: "#7c3aed", borderRadius: kind === "bar" ? [5, 5, 0, 0] : undefined },
        barMaxWidth: 36,
        ...(kind === "line" ? {
          smooth: true,
          showSymbol: true,
          symbol: "circle",
          symbolSize: 7,
          lineStyle: { color: "#7c3aed", width: 3 },
          itemStyle: { color: "#7c3aed", borderColor: "#ffffff", borderWidth: 2 },
          areaStyle: { color: "rgba(124, 58, 237, 0.10)" },
        } : {}),
      }],
    });
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
      chartRef.current = null;
    };
  }, [title, kind, points]);

  function download() {
    const chart = chartRef.current;
    if (!chart) return;
    setPng(chart.getDataURL({ type: "png", pixelRatio: 2 }));
  }

  return (
    <div className="min-w-0">
      <div ref={ref} role="img" aria-label={`Gráfico: ${title}`} style={{ height: 300 }} />
      <div className="mt-1 flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          onClick={download}
          className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 font-medium text-violet-800 transition hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          <Download aria-hidden="true" className="size-4" />Descargar PNG
        </button>
        {png ? (
          <a href={png} download={`${title}.png`} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 font-medium text-white transition hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2">
            <ImageDown aria-hidden="true" className="size-4" />Guardar imagen
          </a>
        ) : null}
      </div>
      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[320px] text-left text-sm">
          <caption className="bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
            Datos del gráfico (alternativa tabular)
          </caption>
          <thead className="bg-violet-50/70 text-xs font-semibold uppercase tracking-wide text-violet-950">
            <tr><th scope="col" className="px-3 py-2.5">Categoría</th><th scope="col" className="px-3 py-2.5 text-right">Valor</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {points.map((p, i) => (
              <tr key={i} className="odd:bg-white even:bg-slate-50/50">
                <td className="px-3 py-2.5 text-slate-700">{p.label}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums text-slate-900">{p.value === null ? "—" : p.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
