import MetricsPanel from '../components/MetricsPanel';

export default function MetricsPage() {
  return (
    <div className="px-4 pt-5 pb-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-white tracking-tight">Metrics</h1>
        <p className="text-xs text-white/40 mt-0.5">Funnel performance at a glance</p>
      </div>
      <MetricsPanel expanded />
    </div>
  );
}