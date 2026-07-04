interface Props {
  completed: number
  total: number
}

export default function ProgressSummary({ completed, total }: Props) {
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100)

  const getMessage = () => {
    if (completed === 0) return "Let's get started 💪"
    if (completed === total) return "All done — great day! 🎉"
    if (percent >= 75) return "Almost there, keep going!"
    return "Good progress, keep it up!"
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-0.5">Today's Progress</p>
          <p className="text-white font-medium text-sm">{getMessage()}</p>
        </div>
        <div className="text-right">
          <span className="text-3xl font-bold text-emerald-400">{completed}</span>
          <span className="text-gray-500 text-lg">/{total}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
        <div
          className="h-2.5 rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${percent}%`,
            background: percent === 100
              ? 'linear-gradient(90deg, #10b981, #34d399)'
              : 'linear-gradient(90deg, #10b981, #6ee7b7)',
          }}
        />
      </div>

      <p className="text-gray-500 text-xs mt-2 text-right">{percent}% complete</p>
    </div>
  )
}