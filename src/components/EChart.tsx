import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, ScatterChart, CustomChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, LineChart, ScatterChart, CustomChart, GridComponent, TooltipComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, VisualMapComponent, CanvasRenderer]);

export type EOption = echarts.EChartsCoreOption;

/** Theme-aware chrome shared by every chart (recessive grid/axes, text tokens). */
export function chrome(): { text: string; muted: string; grid: string; axis: string; surface: string } {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return { text: v('--text-primary'), muted: v('--text-muted'), grid: v('--hair'), axis: v('--axis'), surface: v('--surface-1') };
}

export function baseOption(): EOption {
  const c = chrome();
  return {
    animation: false,
    textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: c.muted },
    grid: { left: 36, right: 10, top: 18, bottom: 24 },
    tooltip: { trigger: 'axis', backgroundColor: c.surface, borderColor: c.grid, textStyle: { color: c.text, fontSize: 12 }, axisPointer: { lineStyle: { color: c.axis } } },
  };
}

export function axisStyle() {
  const c = chrome();
  return {
    axisLine: { lineStyle: { color: c.axis } },
    axisTick: { show: false },
    axisLabel: { color: c.muted, fontSize: 10 },
    splitLine: { lineStyle: { color: c.grid } },
  };
}

export function EChart({ option, height = 160 }: { option: EOption; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts>();
  useEffect(() => {
    if (!ref.current) return;
    inst.current = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    const ro = new ResizeObserver(() => inst.current?.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      inst.current?.dispose();
    };
  }, []);
  useEffect(() => {
    inst.current?.setOption(option, true);
  }, [option]);
  return <div ref={ref} style={{ height, width: '100%' }} />;
}
