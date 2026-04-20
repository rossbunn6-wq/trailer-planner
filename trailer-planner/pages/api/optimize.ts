import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import type { GearItem, AILayoutResponse } from '../../lib/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { gear, trailerW, trailerH, maxPayload } = req.body as {
    gear: GearItem[]
    trailerW: number
    trailerH: number
    maxPayload: number
  }

  if (!gear?.length) return res.status(400).json({ error: 'No gear provided' })

  const gearLines = gear
    .map(g => `- ${g.name}: width=${g.w}in, depth=${g.d}in, height=${g.h}in, weight=${g.weight}lbs each, qty=${g.qty}, rotation=${g.rotation}`)
    .join('\n')

  const prompt = `Pack this audio equipment into a semi trailer floor plan as efficiently as possible.

Trailer: ${trailerW}" long (x-axis, front=0) x ${trailerH}" wide (y-axis, left=0).
Max payload: ${maxPayload}lbs.

Equipment:
${gearLines}

Rules:
1. No item may go out of bounds: x + item_width <= ${trailerW}, y + item_depth <= ${trailerH}.
2. No two items may overlap. Carefully check every pair.
3. Heaviest items go toward the front (lowest x values) for axle weight balance.
4. Group similar items together when possible.
5. rotation=both: you may swap width and depth if it improves packing. rotation=normal: no swap. rotation=rotated: always swap.
6. Each unit of a multi-qty item needs its own entry with a unique instance number starting at 1.

Respond with ONLY a raw JSON object — no markdown, no backticks, no extra text:
{"reasoning":"2-3 sentence strategy summary","placements":[{"name":"...","instance":1,"x":0,"y":0,"rotated":false}]}`

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: 'You are a professional audio touring load planner. Respond ONLY with raw JSON — no markdown, no prose outside the JSON object.',
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim()
    const clean = raw.replace(/^```[a-z]*\n?/, '').replace(/```$/, '').trim()
    const parsed: AILayoutResponse = JSON.parse(clean)

    return res.status(200).json(parsed)
  } catch (err: unknown) {
    console.error('AI layout error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}
