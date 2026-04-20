import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '../../lib/db'
import type { GearItem } from '../../lib/types'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, name, width_in as w, depth_in as d, height_in as h,
               weight_lbs as weight, qty, color, rotation
        FROM gear_library
        ORDER BY created_at ASC
      `
      return res.status(200).json(rows)
    }

    if (req.method === 'POST') {
      const g: GearItem = req.body
      const rows = await sql`
        INSERT INTO gear_library (name, width_in, depth_in, height_in, weight_lbs, qty, color, rotation)
        VALUES (${g.name}, ${g.w}, ${g.d}, ${g.h}, ${g.weight}, ${g.qty}, ${g.color}, ${g.rotation})
        RETURNING id, name, width_in as w, depth_in as d, height_in as h,
                  weight_lbs as weight, qty, color, rotation
      `
      return res.status(201).json(rows[0])
    }

    if (req.method === 'DELETE') {
      const { id } = req.query
      await sql`DELETE FROM gear_library WHERE id = ${Number(id)}`
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    console.error('Gear API error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}
