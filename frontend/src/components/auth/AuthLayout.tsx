import { useTheme } from '@/lib/theme'

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const { theme } = useTheme()

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden bg-background px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/collage.png')" }}
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute inset-0 bg-background/85" aria-hidden="true" />

      <div className="relative flex flex-col items-center gap-3 text-center">
        <img
          src={theme === 'dark' ? '/logo_for_darkmode.png' : '/logo_for_whitemode.png'}
          alt="VetCore"
          className="size-30 rounded-2xl object-contain shadow-elevated"
        />
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">VetCore</h1>
      </div>

      <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-card">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </div>

      {footer && <p className="relative text-sm text-muted-foreground">{footer}</p>}
    </div>
  )
}
