import { PawPrint } from 'lucide-react'

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
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-elevated">
          <PawPrint className="size-6" aria-hidden="true" />
        </div>
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
