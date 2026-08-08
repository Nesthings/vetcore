import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QrScanner from 'qr-scanner'
import { ImageUp, Loader2, ScanLine, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { apiFetch } from '@/lib/api'

function extractToken(decoded: string): string | null {
  const value = decoded.trim()
  if (!value) return null
  try {
    const url = new URL(value, window.location.origin)
    const t = url.searchParams.get('token')
    if (t) return t
  } catch {
    // no es URL: puede ser el token crudo
  }
  return value
}

/** Pide el permiso de cámara DENTRO del gesto del usuario (clic).
 * Debe llamarse desde el onClick del botón: así el navegador muestra el
 * prompt de permisos (Chrome/Safari lo exigen dentro de un gesto de usuario). */
export async function requestCameraPermission(): Promise<boolean> {
  try {
    if (!navigator.mediaDevices?.getUserMedia) return false
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    })
    stream.getTracks().forEach((track) => track.stop())
    return true
  } catch {
    return false
  }
}

export function QrScannerModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<QrScanner | null>(null)
  const [videoReady, setVideoReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [decoding, setDecoding] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [hasCamera, setHasCamera] = useState(true)

  const stopScanner = useCallback(() => {
    scannerRef.current?.stop()
    scannerRef.current?.destroy()
    scannerRef.current = null
  }, [])

  const handleDecoded = useCallback(
    async (decoded: string) => {
      const token = extractToken(decoded)
      if (!token) return
      setDecoding(true)
      setMessage('Resolviendo paciente…')
      try {
        const res = await apiFetch<{ pet_id: string; pet_name: string }>('/pets/resolve-qr', {
          method: 'POST',
          body: JSON.stringify({ token }),
        })
        stopScanner()
        onOpenChange(false)
        setDecoding(false)
        setMessage(null)
        navigate(`/pets/${res.pet_id}`)
      } catch (err) {
        setDecoding(false)
        setMessage(
          err instanceof Error
            ? 'QR no válido. Verifica que sea el QR de una cartilla de esta clínica.'
            : 'No se pudo resolver el QR',
        )
      }
    },
    [navigate, onOpenChange, stopScanner],
  )

  const startCamera = useCallback(async () => {
    const video = videoRef.current
    if (!video || scannerRef.current) return
    setCameraError(null)
    const granted = await requestCameraPermission()
    if (!granted) {
      setHasCamera(false)
      setCameraError(
        'No se pudo acceder a la cámara. Revisa los permisos o sube una imagen del QR.',
      )
      return
    }
    setHasCamera(true)
    try {
      const scanner = new QrScanner(video, (result: string) => {
        handleDecoded(result)
      })
      scannerRef.current = scanner
      await scanner.start()
    } catch {
      stopScanner()
      setCameraError('No se pudo iniciar la cámara. Revisa los permisos o sube una imagen del QR.')
    }
  }, [handleDecoded, stopScanner])

  const setVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el
    setVideoReady(Boolean(el))
  }, [])

  useEffect(() => {
    if (open) {
      if (videoReady) startCamera()
    } else {
      stopScanner()
      setDecoding(false)
      setMessage(null)
    }
  }, [open, videoReady, startCamera, stopScanner])

  useEffect(() => () => stopScanner(), [stopScanner])

  const handleFile = async (file: File | undefined) => {
    if (!file || decoding) return
    setDecoding(true)
    setMessage('Leyendo imagen…')
    try {
      const result = await QrScanner.scanImage(file)
      await handleDecoded(result)
    } catch {
      setDecoding(false)
      setMessage('No se encontró un QR válido en la imagen.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="size-5 text-primary" aria-hidden="true" /> Escanear QR
          </DialogTitle>
          <DialogDescription>
            Apunta al QR de la cartilla del paciente. Se abrirá su expediente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted">
            <video ref={setVideoRef} className="size-full object-cover" muted playsInline />
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted-foreground">
                {cameraError}
              </div>
            )}
            {!cameraError && hasCamera && (
              <div
                className="pointer-events-none absolute inset-0 rounded-xl border-4 border-primary/40"
                aria-hidden="true"
              />
            )}
          </div>

          <div className="flex items-center justify-center gap-2">
            <input
              id="qr-image-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                handleFile(f)
                e.currentTarget.value = ''
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={decoding}
              onClick={() => document.getElementById('qr-image-input')?.click()}
            >
              {decoding ? <Loader2 className="animate-spin" /> : <ImageUp />} Subir imagen del QR
            </Button>
          </div>

          {decoding && (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {message ?? 'Leyendo…'}
            </p>
          )}
          {!decoding && message && (
            <p className="text-center text-sm text-destructive">{message}</p>
          )}

          <div className="flex justify-end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              <X /> Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
