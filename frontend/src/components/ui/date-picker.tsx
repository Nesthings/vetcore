import * as React from 'react'
import { CalendarDays } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * DatePicker: wrapper estilizado del input de fecha nativo.
 * Mantiene el contrato del input (value 'YYYY-MM-DD', onChange) sin
 * cambiar el formato ni introducir dependencias de calendario.
 */
function DatePicker({
  className,
  icon = true,
  ...props
}: React.ComponentProps<'input'> & { icon?: boolean }) {
  return (
    <div className={cn('relative w-full', className)}>
      <Input type="date" className={cn('pr-9', !icon && 'pr-3')} {...props} />
      {icon && (
        <CalendarDays
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
      )}
    </div>
  )
}

export { DatePicker }
