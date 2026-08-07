import * as React from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const SIDE_STYLES: Record<string, string> = {
  right: 'inset-y-0 right-0 h-full w-full max-w-md border-l',
  left: 'inset-y-0 left-0 h-full w-full max-w-md border-r',
  bottom: 'inset-x-0 bottom-0 w-full max-h-[85dvh] rounded-t-2xl border-t',
}

const ENTER_STYLES: Record<string, string> = {
  right: 'slide-in-from-right',
  left: 'slide-in-from-left',
  bottom: 'slide-in-from-bottom',
}

const EXIT_STYLES: Record<string, string> = {
  right: 'slide-out-to-right',
  left: 'slide-out-to-left',
  bottom: 'slide-out-to-bottom',
}

/**
 * Drawer: panel lateral/inferior para contenido largo en móvil y desktop.
 * Se construye sobre Dialog para mantener focus-trap, esc y a11y.
 */
function Drawer({
  open,
  onOpenChange,
  side = 'right',
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  side?: 'right' | 'left' | 'bottom'
  title?: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          className={cn(
            'fixed z-50 flex flex-col bg-card shadow-dialog outline-none',
            SIDE_STYLES[side],
            `data-[state=open]:animate-in data-[state=open]:${ENTER_STYLES[side]} data-[state=open]:duration-300`,
            `data-[state=closed]:animate-out data-[state=closed]:${EXIT_STYLES[side]} data-[state=closed]:duration-200`,
            className,
          )}
        >
          {title != null && (
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <p className="font-display text-base font-semibold text-foreground">{title}</p>
                {description && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onOpenChange(false)}
                aria-label="Cerrar"
              >
                <X className="size-4" />
              </Button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
          {footer != null && <div className="border-t border-border p-4">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export { Drawer }
