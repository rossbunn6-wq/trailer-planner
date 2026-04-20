export interface GearItem {
  id?: number
  name: string
  w: number   // width inches
  d: number   // depth inches
  h: number   // height inches
  weight: number
  qty: number
  color: string
  rotation: 'both' | 'normal' | 'rotated'
}

export interface PlacedItem {
  gear: GearItem
  x: number
  y: number
  rotated: boolean
}

export interface SavedLayout {
  id?: number
  label: string
  trailerLength: number
  trailerWidth: number
  maxPayload: number
  placements: Array<{
    name: string
    instance: number
    x: number
    y: number
    rotated: boolean
  }>
}

export interface AILayoutResponse {
  reasoning: string
  placements: Array<{
    name: string
    instance: number
    x: number
    y: number
    rotated: boolean
  }>
}
