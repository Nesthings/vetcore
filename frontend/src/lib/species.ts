import {
  mdiBird,
  mdiCat,
  mdiDog,
  mdiFish,
  mdiHorse,
  mdiPaw,
  mdiRabbit,
  mdiRodent,
  mdiSnake,
  mdiTurtle,
} from '@mdi/js'

export const SPECIES_ICONS: Record<string, string> = {
  perro: mdiDog,
  gato: mdiCat,
  ave: mdiBird,
  conejo: mdiRabbit,
  reptil: mdiSnake,
  roedor: mdiRodent,
  hurones: mdiPaw,
  peces: mdiFish,
  anfibio: mdiTurtle,
  equino: mdiHorse,
  otro: mdiPaw,
}

export const SPECIES_LABELS: Record<string, string> = {
  perro: 'Perro',
  gato: 'Gato',
  ave: 'Ave',
  conejo: 'Conejo',
  reptil: 'Reptil',
  roedor: 'Roedor',
  hurones: 'Hurón',
  peces: 'Pez',
  anfibio: 'Anfibio',
  equino: 'Equino',
  otro: 'Otro',
}

export function speciesLabel(species?: string | null): string {
  if (!species) return '—'
  return SPECIES_LABELS[species] ?? species
}
