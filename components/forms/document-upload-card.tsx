interface DocumentUploadCardProps {
  title: string
  description: string
  file: File | null
  isLoading?: boolean
  inputId: string
  onFileChange: (file: File | null) => void
  theme: "red" | "blue" | "purple" | "green"
  emptyHint: string
}

const themeClasses = {
  red: {
    card: "bg-red-50 border-red-200",
    title: "text-red-700",
    description: "text-red-600",
    dropzone: "border-red-300",
  },
  blue: {
    card: "bg-blue-50 border-blue-200",
    title: "text-blue-700",
    description: "text-blue-600",
    dropzone: "border-blue-300",
  },
  purple: {
    card: "bg-purple-50 border-purple-200",
    title: "text-purple-700",
    description: "text-purple-600",
    dropzone: "border-purple-300",
  },
  green: {
    card: "bg-green-50 border-green-200",
    title: "text-green-700",
    description: "text-green-600",
    dropzone: "border-green-300",
  },
} as const

export function DocumentUploadCard({
  title,
  description,
  file,
  isLoading = false,
  inputId,
  onFileChange,
  theme,
  emptyHint,
}: DocumentUploadCardProps) {
  const classes = themeClasses[theme]

  return (
    <div className={`border rounded-lg p-4 ${classes.card}`}>
      <h3 className={`text-sm font-bold mb-1 ${classes.title}`}>{title}</h3>
      <p className={`text-[11px] mb-3 ${classes.description}`}>{description}</p>

      <div className={`rounded-md p-6 text-center ${file ? "bg-green-50 border border-green-200" : `border-2 border-dashed ${classes.dropzone}`}`}>
        {isLoading ? (
          <p className="text-xs text-slate-500">Uploading file...</p>
        ) : file ? (
          <div className="flex items-center justify-between">
            <span className="text-xs text-green-700">✓ {file.name}</span>
            <button onClick={() => onFileChange(null)} className="text-xs text-red-600 hover:text-red-700">
              Remove
            </button>
          </div>
        ) : (
          <>
            <input
              type="file"
              id={inputId}
              onChange={(e) => onFileChange(e.target.files?.[0] || null)}
              className="hidden"
              accept=".pdf,.jpg,.png"
            />
            <label htmlFor={inputId} className="cursor-pointer text-xs text-slate-600">
              {emptyHint}
            </label>
          </>
        )}
      </div>
    </div>
  )
}
