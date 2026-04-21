// src/renderer/src/components/ProgressBar.tsx
interface ProgressBarProps {
  value: number   // 0–100; clamped internally
  size?: 'md' | 'sm'
}

export function ProgressBar({ value, size = 'md' }: ProgressBarProps) {
  const h = size === 'md' ? 'h-2' : 'h-1.5'
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`w-full bg-gray-700 rounded-full ${h} overflow-hidden`}
    >
      <div
        className="bg-blue-500 rounded-full h-full transition-[width] duration-150"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}
