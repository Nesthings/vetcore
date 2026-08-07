import * as React from 'react'

import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Botón solo-icono: atajo sobre Button para tamaño y accesibilidad. */
function IconButton({
  className,
  size = 'icon',
  ...props
}: React.ComponentProps<typeof Button> & { size?: 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg' }) {
  return <Button size={size} className={cn('shrink-0', className)} {...props} />
}

export { IconButton, buttonVariants }
