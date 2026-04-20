import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '../../lib/db'
import type { SavedLayout } from '../../lib/types'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, label, trailer_length_in as "trailerLength", trailer_width_in as "trailerWidth",
               max_payload_lbs as "maxPayload", placements, created_at as "createdAt"
        FROM saved_layouts
        ORDER BY created_at DESC
        LIMIT 20
      `
      return res.status(200).json(rows)
    }

    if (req.method === 'POST') {
      const layout: SavedLayout = req.body
      const rows = await sql`
        INSERT INTO saved_layouts (label, trailer_length_in, trailer_width_in, max_payload_lbs, placements)
        VALUES (${layout.label}, ${layout.trailerLength}, ${layout.trailerWidth},
                ${layout.maxPayload}, ${JSON.stringify(layout.placements)})
        RETURNING id, label, created_at as "createdAt"
      `
      return res.status(201).json(rows[0])
    }

    if (req.method === 'DELETE') {
      const { id } = req.query
      await sql`DELETE FROM saved_layouts WHERE id = ${Number(id)}`
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    console.error('Layouts API error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}
