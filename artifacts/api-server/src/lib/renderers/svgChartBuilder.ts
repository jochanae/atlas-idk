// Minimal dependency-free SVG chart builder used by chartRenderer.
// Deliberately hand-rolled (no canvas/native deps) so it bundles cleanly with
// esbuild and needs no headless browser — SVG is plain text output that
// renders natively in any browser, inline or downloaded.

export interface ChartDataset {
  label: string;
  values: number[];
}

export interface ChartPlan {
  title: string;
  chartType: "bar" | "line" | "pie";
  labels: string[];
  datasets: ChartDataset[];
}

const PALETTE = ["#4f46e5", "#0ea5e9", "#f59e0b", "#ef4444", "#10b981", "#a855f7", "#ec4899"];
const WIDTH = 640;
const HEIGHT = 420;
const PADDING = { top: 56, right: 24, bottom: 56, left: 56 };

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svgWrapper(title: string, body: string, legend: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="Helvetica, Arial, sans-serif">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#ffffff" />
  <text x="${WIDTH / 2}" y="28" text-anchor="middle" font-size="18" font-weight="600" fill="#111827">${escapeXml(title)}</text>
  ${body}
  ${legend}
</svg>`;
}

function buildLegend(datasets: ChartDataset[]): string {
  if (datasets.length <= 1) return "";
  const itemWidth = WIDTH / datasets.length;
  return datasets
    .map((d, i) => {
      const x = i * itemWidth + 16;
      const y = HEIGHT - 16;
      return `<rect x="${x}" y="${y - 10}" width="10" height="10" fill="${PALETTE[i % PALETTE.length]}" />
      <text x="${x + 16}" y="${y - 1}" font-size="12" fill="#374151">${escapeXml(d.label)}</text>`;
    })
    .join("\n");
}

function buildBarChart(plan: ChartPlan): string {
  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom - (plan.datasets.length > 1 ? 24 : 0);
  const maxValue = Math.max(1, ...plan.datasets.flatMap((d) => d.values));
  const groupCount = plan.labels.length;
  const groupWidth = chartWidth / groupCount;
  const barGap = 6;
  const barWidth = Math.max(4, (groupWidth - barGap * (plan.datasets.length + 1)) / plan.datasets.length);

  let bars = "";
  let axisLabels = "";
  for (let g = 0; g < groupCount; g++) {
    const groupX = PADDING.left + g * groupWidth;
    axisLabels += `<text x="${groupX + groupWidth / 2}" y="${HEIGHT - PADDING.bottom + 18}" text-anchor="middle" font-size="11" fill="#374151">${escapeXml(plan.labels[g] ?? "")}</text>`;
    for (let d = 0; d < plan.datasets.length; d++) {
      const value = plan.datasets[d]?.values[g] ?? 0;
      const barHeight = (value / maxValue) * chartHeight;
      const x = groupX + barGap + d * (barWidth + barGap);
      const y = PADDING.top + chartHeight - barHeight;
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" fill="${PALETTE[d % PALETTE.length]}" rx="2" />`;
    }
  }

  const axisLine = `<line x1="${PADDING.left}" y1="${PADDING.top + chartHeight}" x2="${WIDTH - PADDING.right}" y2="${PADDING.top + chartHeight}" stroke="#d1d5db" />`;

  return `${axisLine}${bars}${axisLabels}`;
}

function buildLineChart(plan: ChartPlan): string {
  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom - (plan.datasets.length > 1 ? 24 : 0);
  const maxValue = Math.max(1, ...plan.datasets.flatMap((d) => d.values));
  const pointCount = plan.labels.length;
  const stepX = pointCount > 1 ? chartWidth / (pointCount - 1) : 0;

  let lines = "";
  let axisLabels = "";
  for (let i = 0; i < pointCount; i++) {
    const x = PADDING.left + i * stepX;
    axisLabels += `<text x="${x.toFixed(1)}" y="${HEIGHT - PADDING.bottom + 18}" text-anchor="middle" font-size="11" fill="#374151">${escapeXml(plan.labels[i] ?? "")}</text>`;
  }

  for (let d = 0; d < plan.datasets.length; d++) {
    const dataset = plan.datasets[d];
    if (!dataset) continue;
    const points = dataset.values
      .map((v, i) => {
        const x = PADDING.left + i * stepX;
        const y = PADDING.top + chartHeight - (v / maxValue) * chartHeight;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    const color = PALETTE[d % PALETTE.length];
    lines += `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" />`;
    lines += dataset.values
      .map((v, i) => {
        const x = PADDING.left + i * stepX;
        const y = PADDING.top + chartHeight - (v / maxValue) * chartHeight;
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${color}" />`;
      })
      .join("");
  }

  const axisLine = `<line x1="${PADDING.left}" y1="${PADDING.top + chartHeight}" x2="${WIDTH - PADDING.right}" y2="${PADDING.top + chartHeight}" stroke="#d1d5db" />`;

  return `${axisLine}${lines}${axisLabels}`;
}

function buildPieChart(plan: ChartPlan): string {
  const dataset = plan.datasets[0];
  const values = dataset?.values ?? [];
  const total = values.reduce((sum, v) => sum + v, 0) || 1;
  const cx = WIDTH / 2;
  const cy = PADDING.top + (HEIGHT - PADDING.top - PADDING.bottom) / 2;
  const radius = Math.min(cx, cy - PADDING.top) - 24;

  let angleStart = -Math.PI / 2;
  let slices = "";
  for (let i = 0; i < values.length; i++) {
    const value = values[i] ?? 0;
    const fraction = value / total;
    const angleEnd = angleStart + fraction * 2 * Math.PI;
    const x1 = cx + radius * Math.cos(angleStart);
    const y1 = cy + radius * Math.sin(angleStart);
    const x2 = cx + radius * Math.cos(angleEnd);
    const y2 = cy + radius * Math.sin(angleEnd);
    const largeArc = angleEnd - angleStart > Math.PI ? 1 : 0;
    const color = PALETTE[i % PALETTE.length];
    slices += `<path d="M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${color}" />`;
    angleStart = angleEnd;
  }

  const sliceLegend = plan.labels
    .map((label, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 16 + col * (WIDTH / 2 - 16);
      const y = HEIGHT - 40 + row * 16;
      return `<rect x="${x}" y="${y - 10}" width="10" height="10" fill="${PALETTE[i % PALETTE.length]}" />
      <text x="${x + 16}" y="${y - 1}" font-size="11" fill="#374151">${escapeXml(label)} (${(((values[i] ?? 0) / total) * 100).toFixed(0)}%)</text>`;
    })
    .join("\n");

  return `${slices}${sliceLegend}`;
}

export function buildChartSvg(plan: ChartPlan): string {
  const legend = plan.chartType === "pie" ? "" : buildLegend(plan.datasets);
  let body: string;
  if (plan.chartType === "bar") body = buildBarChart(plan);
  else if (plan.chartType === "line") body = buildLineChart(plan);
  else body = buildPieChart(plan);

  return svgWrapper(plan.title, body, legend);
}
