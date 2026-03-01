interface RegisterStepIndicatorProps {
  step: number
}

export function RegisterStepIndicator({ step }: RegisterStepIndicatorProps) {
  return (
    <div className="flex items-center justify-center mb-8 sm:mb-12">
      {[1, 2].map((num, index) => (
        <div key={num} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${num < step ? "bg-green-500" : num === step ? "bg-[#0C2340]" : "bg-slate-200"
                }`}
            >
              {num < step ? (
                <span className="text-white text-xs">✓</span>
              ) : (
                <span className={`text-xs ${num === step ? "text-white" : "text-slate-500"}`}>{num}</span>
              )}
            </div>
            <span
              className={`text-[11px] mt-2 font-medium ${num < step ? "text-green-600" : num === step ? "text-[#0C2340]" : "text-slate-400"
                }`}
            >
              {num === 1 && "Info"}
              {num === 2 && "Documents"}
            </span>
          </div>
          {index < 1 && (
            <div
              className={`w-16 sm:w-32 h-0.5 mx-2 transition-colors ${num < step ? "bg-green-500" : num === step ? "bg-[#0C2340]" : "bg-slate-200"}`}
            />
          )}
        </div>
      ))}
    </div>
  )
}
