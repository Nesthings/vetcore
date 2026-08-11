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
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-4 py-12">
      <div className="flex flex-col items-center gap-3 text-center">
        <img
          src="/vetcore-logo.png"
          alt="VetCore"
          className="size-20 rounded-2xl object-contain shadow-elevated"
        />
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">VetCore</h1>
      </div>

      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-card">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </div>

      {footer && <p className="text-sm text-muted-foreground">{footer}</p>}
    </div>
  )
}
