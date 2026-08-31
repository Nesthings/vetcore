export const ALERT_TYPES = [
  'Alergia',
  'Enfermedad crónica',
  'Comportamiento',
  'Medidas especiales',
  'Otra',
]

export const ALERT_STYLES: Record<string, string> = {
  Alergia: 'border-destructive/40 bg-destructive/10 text-destructive',
  'Enfermedad crónica': 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  Comportamiento: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  'Medidas especiales': 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  Otra: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300',
}

export const ALERT_LIMIT = 20
