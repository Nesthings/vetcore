export interface SaleProduct {
  id: string
  clinic_id: string
  name: string
  category: string
  price: number | null
  stock_quantity: number
  photo_url: string | null
  active: boolean
  created_at: string
}

export const PRODUCT_CATEGORY_SUGGESTIONS = [
  'Alimento',
  'Premios',
  'Juguetes',
  'Ropa',
  'Camas',
  'Platos y accesorios',
  'Higiene',
  'Farmacia',
  'Otro',
]
