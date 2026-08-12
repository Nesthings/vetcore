import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Loader2, QrCode } from 'lucide-react'

import { cn } from '@/lib/utils'

export function PetQrCard({
  photoUrl,
  petName,
  qrUrl,
  placeholder,
  frontOverlay,
  flipToBack = false,
  containerClassName = 'size-56',
  frontClassName = '',
  backClassName = 'border-4 border-primary/30',
}: {
  photoUrl?: string | null
  petName: string
  qrUrl: string
  placeholder?: React.ReactNode
  frontOverlay?: React.ReactNode
  flipToBack?: boolean
  containerClassName?: string
  frontClassName?: string
  backClassName?: string
}) {
  const [flipped, setFlipped] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const showBack = flipToBack || flipped

  useEffect(() => {
    let alive = true
    const absoluteUrl = new URL(qrUrl, window.location.origin).href
    QRCode.toDataURL(absoluteUrl, {
      width: 512,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#14201d', light: '#ffffff' },
    })
      .then((url) => {
        if (alive) setQrDataUrl(url)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [qrUrl])

  return (
    <div
      className={cn('[perspective:1000px]', containerClassName)}
      role="button"
      tabIndex={0}
      title={showBack ? 'Volver a la foto' : 'Ver el QR de la cartilla'}
      aria-label={`${petName}: ${showBack ? 'volver a la foto' : 'ver el QR de la cartilla'}`}
      onClick={() => setFlipped((f) => !f)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setFlipped((f) => !f)
        }
      }}
    >
      <div
        className={cn(
          'relative size-full transition-transform duration-500 [transform-style:preserve-3d]',
          showBack && '[transform:rotateY(180deg)]',
        )}
      >
        <div
          className={cn(
            'absolute inset-0 overflow-hidden [backface-visibility:hidden]',
            frontClassName,
          )}
        >
          {photoUrl ? (
            <img src={photoUrl} alt={petName} crossOrigin="anonymous" className="size-full object-cover" />
          ) : (
            (placeholder ?? null)
          )}
          {frontOverlay && (
            <div
              className="absolute bottom-2 right-2"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {frontOverlay}
            </div>
          )}
        </div>
        <div
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-[2rem] bg-white p-3 [transform:rotateY(180deg)] [backface-visibility:hidden]',
            backClassName,
          )}
        >
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`QR de la cartilla de ${petName}`}
              className="size-full object-contain"
            />
          ) : (
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
          )}
          <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <QrCode className="size-3" aria-hidden="true" /> {petName}
          </span>
        </div>
      </div>
    </div>
  )
}
