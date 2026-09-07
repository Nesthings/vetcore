/** Mapeo de nombres de color (catálogo de mascotas) a valores CSS para swatches. */

const COLOR_HEX: Record<string, string> = {
  Negro: '#1f2937',
  Blanco: '#ffffff',
  'Café': '#8d5a2b',
  'Marrón oscuro': '#5b3a1a',
  'Marrón claro': '#a9743f',
  Chocolate: '#6b4226',
  Cobrizo: '#a05a2c',
  Dorado: '#c9a227',
  Oro: '#c9a227',
  Crema: '#f3e5c3',
  Gris: '#9ca3af',
  'Gris azulado': '#7c8ca0',
  'Gris (azul)': '#8a9bb0',
  Plateado: '#c0c7cf',
  Plata: '#c0c7cf',
  Albaricoque: '#f6c4a0',
  Alazán: '#a44a2a',
  Rojo: '#d64a4a',
  Naranja: '#e8833a',
  Azul: '#3b82f6',
  Hígado: '#7a4a33',
  Leonado: '#d2a06a',
  Atigrado: '#7a6a55',
  Bicolor: '#6b7280',
  Tricolor: '#9a6a3a',
  'Negro y blanco': '#52525b',
  Negro_blanco: '#52525b',
  Cálico: '#b0844a',
  Calicó: '#b0844a',
  'Blanco y negro': '#6b7280',
  Siamés: '#c8b9a0',
  'Punto de color': '#cbb8a5',
  Carey: '#8a4a3a',
  'Naranja (carey)': '#d07040',
  'Rojo (carey)': '#c05a3a',
  Grisáceo: '#b8bcc4',
  Lavanda: '#c5b8d8',
  Lila: '#c5b8d8',
  Miel: '#e0b45a',
  Arena: '#dcc9a0',
  Oliva: '#8a8a4a',
  'Capa azul': '#6a7a9a',
  Canela: '#b0704a',
  Sable: '#4a3a2a',
  Cobre: '#b8723a',
  'Amarillo': '#e3c34a',
  'Atigrado naranja': '#d0803a',
  'Atigrado gris': '#8a8a95',
  'Atigrado café': '#8a6240',
}

const DEFAULT_COLOR = '#9ca3af'

export function petColorHex(color?: string | null): string {
  if (!color) return DEFAULT_COLOR
  const key = color.trim()
  return COLOR_HEX[key] ?? COLOR_HEX[key.toLowerCase()] ?? DEFAULT_COLOR
}