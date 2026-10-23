export function LoadingMark({ label, large = false }: { label: string; large?: boolean }) {
  return (
    <div className="flex items-center gap-3" role="status" aria-live="polite">
      <span className={large ? 'ciwa-spinner ciwa-spinner-lg' : 'ciwa-spinner'} aria-hidden="true" />
      <span className="text-sm text-slate-400">{label}</span>
    </div>
  )
}
