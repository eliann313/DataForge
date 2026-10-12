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
      title: { text: title, left: "center", textStyle: { fontSize: 14 } },
      tooltip: { trigger: "axis" },
      grid: { left: 48, right: 16, top: 48, bottom: 64 },
      xAxis: {
        type: "category",
        data: points.map((p) => p.label),
        axisLabel: { rotate: points.length > 8 ? 45 : 0 },
      },
      yAxis: { type: "value" },
      series: [{ type: kind, data: points.map((p) => p.value) }],
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
    <div>
      <div ref={ref} role="img" aria-label={`Gráfico: ${title}`} style={{ height: 320 }} />
      <p className="mt-1 flex gap-2 text-sm">
        <button
          type="button"
          onClick={download}
          className="rounded border border-gray-300 px-2 py-1"
        >
          Descargar PNG
        </button>
        {png ? (
          <a href={png} download={`${title}.png`} className="underline">
            Guardar imagen
          </a>
        ) : null}
      </p>
      <table className="df-table mt-2">
        <caption className="text-left text-sm text-gray-600">
          Datos del gráfico (alternativa tabular)
        </caption>
        <thead>
          <tr><th scope="col">Categoría</th><th scope="col">Valor</th></tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}><td>{p.label}</td><td>{p.value === null ? "—" : p.value}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
