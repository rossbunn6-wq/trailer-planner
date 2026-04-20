import { useEffect, useRef, useState, useCallback } from 'react'
import Head from 'next/head'
import type { GearItem, PlacedItem } from '../lib/types'

const TRAILER_PRESETS: Record<string, [number, number]> = {
  "53ft": [636, 102],
  "48ft": [576, 102],
  "45ft": [540, 96],
}

const DEFAULT_COLORS = ['#378ADD','#1D9E75','#D85A30','#9F45B0','#BA7517','#D4537E','#639922','#E24B4A']

function fmtFt(inches: number) { return `${inches}" (${(inches/12).toFixed(1)}')` }

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const [gear, setGear] = useState<GearItem[]>([])
  const [placed, setPlaced] = useState<PlacedItem[]>([])
  const [trailerW, setTrailerW] = useState(636)
  const [trailerH, setTrailerH] = useState(102)
  const [maxPayload, setMaxPayload] = useState(45000)
  const [preset, setPreset] = useState('53ft')
  const [customL, setCustomL] = useState('')
  const [customW, setCustomW] = useState('')

  // form state
  const [form, setForm] = useState({ name:'', w:'', d:'', h:'', weight:'', qty:'1', color:'#378ADD', rotation:'both' as GearItem['rotation'] })

  // UI state
  const [aiLog, setAiLog] = useState('Add gear then click Optimize with AI.')
  const [aiLoading, setAiLoading] = useState(false)
  const [dbLoading, setDbLoading] = useState(false)
  const [saveLabel, setSaveLabel] = useState('')
  const [savedLayouts, setSavedLayouts] = useState<Array<{id:number,label:string,createdAt:string,trailerLength:number,trailerWidth:number,maxPayload:number,placements:PlacedItem['gear'][]}>>([])
  const [showSavePanel, setShowSavePanel] = useState(false)
  const [showLoadPanel, setShowLoadPanel] = useState(false)
  const [manifestText, setManifestText] = useState('')
  const [showManifest, setShowManifest] = useState(false)
  const [dragGear, setDragGear] = useState<GearItem | null>(null)

  // ── Draw canvas ──────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const dark = window.matchMedia('(prefers-color-scheme:dark)').matches
    const maxW = wrap.clientWidth - 4
    const scale = Math.min(maxW / trailerW, 340 / trailerH, 1.5)
    canvas.width = Math.round(trailerW * scale)
    canvas.height = Math.round(trailerH * scale)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = dark ? '#2a2a2a' : '#f8f8f6'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = dark ? '#666' : '#aaa'
    ctx.lineWidth = 1.5
    ctx.strokeRect(0.75, 0.75, canvas.width - 1.5, canvas.height - 1.5)
    const gs = 12 * scale
    ctx.strokeStyle = dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)'
    ctx.lineWidth = 0.5
    for (let x = gs; x < canvas.width; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke() }
    for (let y = gs; y < canvas.height; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke() }
    placed.forEach(p => {
      const pw = p.rotated ? p.gear.d : p.gear.w
      const pd = p.rotated ? p.gear.w : p.gear.d
      const x = p.x * scale, y = p.y * scale, w = pw * scale, h = pd * scale
      ctx.fillStyle = p.gear.color + (dark ? 'cc' : '99')
      ctx.beginPath(); ctx.roundRect(x+1, y+1, w-2, h-2, 3); ctx.fill()
      ctx.strokeStyle = p.gear.color; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(x+1, y+1, w-2, h-2, 3); ctx.stroke()
      if (w > 22 && h > 14) {
        const lbl = p.gear.name.length > 14 ? p.gear.name.slice(0, 13) + '…' : p.gear.name
        const fs = Math.max(9, Math.min(11, h * 0.28))
        ctx.fillStyle = dark ? 'rgba(255,255,255,.9)' : 'rgba(0,0,0,.8)'
        ctx.font = `500 ${fs}px -apple-system,sans-serif`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(lbl, x + w/2, y + h/2)
        if (p.rotated && w > 30) {
          ctx.font = `500 9px -apple-system,sans-serif`
          ctx.fillStyle = dark ? 'rgba(255,255,255,.4)' : 'rgba(0,0,0,.35)'
          ctx.fillText('R', x + w - 8, y + 9)
        }
      }
    })
  }, [placed, trailerW, trailerH])

  useEffect(() => { draw() }, [draw])
  useEffect(() => { window.addEventListener('resize', draw); return () => window.removeEventListener('resize', draw) }, [draw])

  // ── Load gear from DB on mount ───────────────────────────
  useEffect(() => {
    fetch('/api/gear').then(r => r.json()).then((rows: GearItem[]) => {
      if (Array.isArray(rows) && rows.length) setGear(rows)
      else setGear(PRELOAD)
    }).catch(() => setGear(PRELOAD))
  }, [])

  // ── Stats ────────────────────────────────────────────────
  const totalWeight = placed.reduce((s, p) => s + (p.gear.weight || 0), 0)
  const usedArea = placed.reduce((s, p) => { const pw = p.rotated ? p.gear.d : p.gear.w; const pd = p.rotated ? p.gear.w : p.gear.d; return s + pw * pd }, 0)
  const totalArea = trailerW * trailerH
  const weightPct = Math.min(100, Math.round(totalWeight / maxPayload * 100))
  const areaPct = Math.round(usedArea / totalArea * 100)

  // ── Canvas click to remove ───────────────────────────────
  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    const scale = Math.min((wrap.clientWidth - 4) / trailerW, 340 / trailerH, 1.5)
    const r = canvas.getBoundingClientRect()
    const mx = (e.clientX - r.left) / scale
    const my = (e.clientY - r.top) / scale
    for (let i = placed.length - 1; i >= 0; i--) {
      const p = placed[i]
      const pw = p.rotated ? p.gear.d : p.gear.w
      const pd = p.rotated ? p.gear.w : p.gear.d
      if (mx >= p.x && mx <= p.x + pw && my >= p.y && my <= p.y + pd) {
        setPlaced(prev => prev.filter((_, idx) => idx !== i))
        return
      }
    }
  }

  function handleCanvasDrop(e: React.DragEvent<HTMLCanvasElement>) {
    e.preventDefault()
    if (!dragGear) return
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    const scale = Math.min((wrap.clientWidth - 4) / trailerW, 340 / trailerH, 1.5)
    const r = canvas.getBoundingClientRect()
    let x = (e.clientX - r.left) / scale - dragGear.w / 2
    let y = (e.clientY - r.top) / scale - dragGear.d / 2
    x = Math.max(0, Math.min(trailerW - dragGear.w, x))
    y = Math.max(0, Math.min(trailerH - dragGear.d, y))
    setPlaced(prev => [...prev, { gear: dragGear!, x: Math.round(x), y: Math.round(y), rotated: false }])
    setDragGear(null)
  }

  // ── Add gear ─────────────────────────────────────────────
  async function addGear() {
    const { name, w, d, h, weight, qty, color, rotation } = form
    if (!name || !w || !d || !h) { alert('Please fill in name and W/D/H dimensions.'); return }
    const item: GearItem = { name, w: +w, d: +d, h: +h, weight: +weight||0, qty: +qty||1, color, rotation }
    setDbLoading(true)
    try {
      const res = await fetch('/api/gear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) })
      const saved: GearItem = await res.json()
      setGear(prev => [...prev, saved])
    } catch { setGear(prev => [...prev, item]) }
    setDbLoading(false)
    setForm(f => ({ ...f, name:'', w:'', d:'', h:'', weight:'', qty:'1' }))
  }

  async function removeGear(idx: number) {
    const g = gear[idx]
    setPlaced(prev => prev.filter(p => p.gear !== g))
    setGear(prev => prev.filter((_, i) => i !== idx))
    if (g.id) { try { await fetch(`/api/gear?id=${g.id}`, { method: 'DELETE' }) } catch {} }
  }

  // ── Preset ───────────────────────────────────────────────
  function applyPreset(key: string) {
    setPreset(key)
    if (key !== 'custom') {
      const [l, w] = TRAILER_PRESETS[key]
      setTrailerW(l); setTrailerH(w)
    }
  }

  // ── AI Optimize ──────────────────────────────────────────
  async function runAI() {
    if (!gear.length) { alert('Add equipment first.'); return }
    setAiLoading(true)
    setAiLog('Calculating optimal layout…')
    try {
      const res = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gear, trailerW, trailerH, maxPayload })
      })
      if (!res.ok) { const e = await res.json(); setAiLog('Error: ' + e.error); setAiLoading(false); return }
      const data = await res.json()
      setAiLog(data.reasoning || 'Layout applied.')
      const newPlaced: PlacedItem[] = []
      for (const pl of (data.placements || [])) {
        const g = gear.find(g => g.name === pl.name)
        if (!g) continue
        const rotated = !!pl.rotated
        const pw = rotated ? g.d : g.w, pd = rotated ? g.w : g.d
        const x = Math.max(0, Math.min(trailerW - pw, Number(pl.x) || 0))
        const y = Math.max(0, Math.min(trailerH - pd, Number(pl.y) || 0))
        newPlaced.push({ gear: g, x, y, rotated })
      }
      setPlaced(newPlaced)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setAiLog('Error: ' + message)
    }
    setAiLoading(false)
  }

  // ── Save / Load layout ───────────────────────────────────
  async function saveLayout() {
    if (!saveLabel.trim()) { alert('Enter a label for this layout.'); return }
    const payload = {
      label: saveLabel.trim(),
      trailerLength: trailerW,
      trailerWidth: trailerH,
      maxPayload,
      placements: placed.map((p, i) => ({ name: p.gear.name, instance: i+1, x: p.x, y: p.y, rotated: p.rotated }))
    }
    try {
      await fetch('/api/layouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      setSaveLabel('')
      setShowSavePanel(false)
      alert('Layout saved!')
    } catch { alert('Save failed.') }
  }

  async function loadLayouts() {
    try {
      const res = await fetch('/api/layouts')
      const rows = await res.json()
      setSavedLayouts(rows)
      setShowLoadPanel(true)
    } catch { alert('Could not load saved layouts.') }
  }

  async function applyLayout(layout: typeof savedLayouts[0]) {
    setTrailerW(layout.trailerLength)
    setTrailerH(layout.trailerWidth)
    setMaxPayload(layout.maxPayload)
    const newPlaced: PlacedItem[] = (layout.placements as unknown as Array<{name:string,x:number,y:number,rotated:boolean}>).map(pl => {
      const g = gear.find(g => g.name === pl.name) || gear[0]
      return { gear: g, x: pl.x, y: pl.y, rotated: pl.rotated }
    })
    setPlaced(newPlaced)
    setShowLoadPanel(false)
  }

  async function deleteLayout(id: number) {
    await fetch(`/api/layouts?id=${id}`, { method: 'DELETE' })
    setSavedLayouts(prev => prev.filter(l => l.id !== id))
  }

  // ── Manifest ─────────────────────────────────────────────
  function buildManifest() {
    if (!placed.length) { alert('No items placed.'); return }
    const now = new Date()
    const lines = [
      '====================================================',
      'LOAD MANIFEST — AUDIO TOURING EQUIPMENT',
      `Generated: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`,
      `Trailer: ${fmtFt(trailerW)} long x ${fmtFt(trailerH)} wide`,
      `Max payload: ${maxPayload.toLocaleString()} lbs`,
      '====================================================', '',
      '#   Item                   W"   D"   H"     Wt    X"    Y"  Rot',
      '------------------------------------------------------------',
    ]
    placed.forEach((p, i) => {
      const pw = p.rotated ? p.gear.d : p.gear.w
      const pd = p.rotated ? p.gear.w : p.gear.d
      lines.push(
        String(i+1).padEnd(4) +
        p.gear.name.slice(0,21).padEnd(22) +
        String(pw).padStart(4) + String(pd).padStart(5) + String(p.gear.h).padStart(5) +
        String(p.gear.weight||0).padStart(7) +
        String(Math.round(p.x)).padStart(6) + String(Math.round(p.y)).padStart(6) +
        (p.rotated ? '  Yes' : '   No')
      )
    })
    lines.push('------------------------------------------------------------')
    lines.push('TOTAL WEIGHT'.padEnd(47) + String(totalWeight).padStart(6) + ' lbs')
    lines.push(`Payload used: ${weightPct}%`)
    lines.push('')
    const grouped: Record<string,number> = {}
    placed.forEach(p => { grouped[p.gear.name] = (grouped[p.gear.name]||0)+1 })
    lines.push('Summary by type:')
    Object.entries(grouped).forEach(([n,c]) => lines.push(`  ${c}x ${n}`))
    lines.push('====================================================')
    setManifestText(lines.join('\n'))
    setShowManifest(true)
  }

  function copyManifest() {
    navigator.clipboard.writeText(manifestText).then(() => alert('Copied!')).catch(() => alert('Select and copy manually.'))
  }

  // ── Render ───────────────────────────────────────────────
  const wbarColor = weightPct > 90 ? '#A32D2D' : weightPct > 70 ? '#BA7517' : '#3B6D11'

  return (
    <>
      <Head>
        <title>Trailer Load Planner</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={{ minHeight:'100vh', background:'var(--bg)', padding:'16px' }}>
        <div style={{ maxWidth: 1200, margin:'0 auto' }}>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:8 }}>
            <div>
              <h1 style={{ fontSize:20, fontWeight:500 }}>Trailer Load Planner</h1>
              <p style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>Audio touring equipment — powered by AI layout optimization</p>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <Btn variant="default" small onClick={loadLayouts}>Load saved</Btn>
              <Btn variant="default" small onClick={() => setShowSavePanel(s => !s)}>Save layout</Btn>
            </div>
          </div>

          {/* Save panel */}
          {showSavePanel && (
            <Card style={{ marginBottom:12, display:'flex', gap:8, alignItems:'center' }}>
              <input value={saveLabel} onChange={e=>setSaveLabel(e.target.value)} placeholder="Layout name (e.g. Summer Tour 2025)" style={inputStyle} />
              <Btn variant="blue" onClick={saveLayout}>Save</Btn>
              <Btn variant="default" small onClick={()=>setShowSavePanel(false)}>Cancel</Btn>
            </Card>
          )}

          {/* Load panel */}
          {showLoadPanel && (
            <Card style={{ marginBottom:12 }}>
              <Label>Saved layouts</Label>
              {savedLayouts.length === 0 && <p style={{ fontSize:12, color:'var(--text3)' }}>No saved layouts yet.</p>}
              {savedLayouts.map(l => (
                <div key={l.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', borderBottom:'0.5px solid var(--border)' }}>
                  <div>
                    <span style={{ fontWeight:500 }}>{l.label}</span>
                    <span style={{ fontSize:11, color:'var(--text2)', marginLeft:8 }}>{new Date(l.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <Btn variant="blue" small onClick={() => applyLayout(l)}>Load</Btn>
                    <Btn variant="danger" small onClick={() => deleteLayout(l.id!)}>Delete</Btn>
                  </div>
                </div>
              ))}
              <Btn variant="default" small onClick={()=>setShowLoadPanel(false)} style={{ marginTop:8 }}>Close</Btn>
            </Card>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:14 }}>

            {/* Left column */}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>

              {/* Add gear form */}
              <Card>
                <Label>Add equipment</Label>
                <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Name (e.g. Line Array Cabinet)" style={inputStyle} />
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:5 }}>
                  <div><span style={lblStyle}>Width (in)</span><input type="number" value={form.w} onChange={e=>setForm(f=>({...f,w:e.target.value}))} placeholder="22" min="1" style={inputStyle} /></div>
                  <div><span style={lblStyle}>Depth (in)</span><input type="number" value={form.d} onChange={e=>setForm(f=>({...f,d:e.target.value}))} placeholder="24" min="1" style={inputStyle} /></div>
                  <div><span style={lblStyle}>Height (in)</span><input type="number" value={form.h} onChange={e=>setForm(f=>({...f,h:e.target.value}))} placeholder="20" min="1" style={inputStyle} /></div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:5 }}>
                  <div><span style={lblStyle}>Weight (lbs)</span><input type="number" value={form.weight} onChange={e=>setForm(f=>({...f,weight:e.target.value}))} placeholder="120" min="0" style={inputStyle} /></div>
                  <div><span style={lblStyle}>Qty</span><input type="number" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))} min="1" max="99" style={inputStyle} /></div>
                  <div><span style={lblStyle}>Color</span><input type="color" value={form.color} onChange={e=>setForm(f=>({...f,color:e.target.value}))} style={{...inputStyle,height:34,padding:'2px 4px'}} /></div>
                </div>
                <div style={{ marginBottom:6 }}>
                  <span style={lblStyle}>Rotation</span>
                  <select value={form.rotation} onChange={e=>setForm(f=>({...f,rotation:e.target.value as GearItem['rotation']}))} style={inputStyle}>
                    <option value="both">Auto — AI picks best</option>
                    <option value="normal">Fixed — as entered</option>
                    <option value="rotated">Fixed — rotated 90°</option>
                  </select>
                </div>
                <Btn variant="blue" full onClick={addGear} disabled={dbLoading}>{dbLoading ? 'Saving…' : '+ Add to library'}</Btn>
              </Card>

              {/* Gear library */}
              <Card style={{ flex:1 }}>
                <Label>Equipment library ({gear.length})</Label>
                <div style={{ display:'flex', flexDirection:'column', gap:4, maxHeight:200, overflowY:'auto', marginBottom:8 }}>
                  {gear.length === 0 && <p style={{ fontSize:12, color:'var(--text3)', textAlign:'center', padding:'10px 0' }}>No equipment yet</p>}
                  {gear.map((g, i) => (
                    <div key={i} draggable onDragStart={()=>setDragGear(g)}
                      style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 8px', background:'var(--surface2)', borderRadius:'var(--radius)', border:'0.5px solid var(--border)', cursor:'grab', userSelect:'none' }}>
                      <div style={{ width:9, height:9, borderRadius:2, background:g.color, flexShrink:0 }} />
                      <span style={{ fontSize:12, fontWeight:500, flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{g.name}</span>
                      <span style={{ fontSize:11, color:'var(--text2)', whiteSpace:'nowrap' }}>×{g.qty} {g.w}"×{g.d}" {g.weight ? g.weight+'lb' : ''}</span>
                      <button onClick={()=>removeGear(i)} style={{ ...smallBtnStyle, color:'var(--red)', borderColor:'var(--red)' }}>✕</button>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop:'0.5px solid var(--border)', paddingTop:10 }}>
                  <Label>Trailer</Label>
                  <select value={preset} onChange={e=>applyPreset(e.target.value)} style={inputStyle}>
                    <option value="53ft">53' Standard (636" × 102")</option>
                    <option value="48ft">48' Standard (576" × 102")</option>
                    <option value="45ft">45' Trailer (540" × 96")</option>
                    <option value="custom">Custom…</option>
                  </select>
                  {preset === 'custom' && (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5 }}>
                      <div><span style={lblStyle}>Length (in)</span><input type="number" value={customL} onChange={e=>{setCustomL(e.target.value);const v=parseFloat(e.target.value);if(v>0)setTrailerW(v)}} placeholder="636" style={inputStyle} /></div>
                      <div><span style={lblStyle}>Width (in)</span><input type="number" value={customW} onChange={e=>{setCustomW(e.target.value);const v=parseFloat(e.target.value);if(v>0)setTrailerH(v)}} placeholder="102" style={inputStyle} /></div>
                    </div>
                  )}
                  <div>
                    <span style={lblStyle}>Max payload (lbs)</span>
                    <input type="number" value={maxPayload} onChange={e=>setMaxPayload(+e.target.value)} min="1" style={inputStyle} />
                  </div>
                </div>
              </Card>
            </div>

            {/* Right column — canvas */}
            <Card style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:500 }}>Trailer floor plan</div>
                  <div style={{ fontSize:11, color:'var(--text2)' }}>{fmtFt(trailerW)} long × {fmtFt(trailerH)} wide</div>
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  <Btn variant="green" onClick={runAI} disabled={aiLoading}>{aiLoading ? 'Optimizing…' : 'Optimize with AI'}</Btn>
                  <Btn variant="amber" onClick={buildManifest}>Print manifest</Btn>
                  <Btn variant="default" small onClick={()=>setPlaced([])}>Clear</Btn>
                </div>
              </div>

              <p style={{ fontSize:11, color:'var(--text2)' }}>Drag items from the library onto the trailer, or use AI to auto-arrange. Click a placed item to remove it.</p>

              <div ref={wrapRef} style={{ border:'1.5px dashed var(--border2)', borderRadius:'var(--radius)', overflow:'auto', background:'var(--surface2)', lineHeight:0 }}>
                <canvas ref={canvasRef}
                  onClick={handleCanvasClick}
                  onDragOver={e=>e.preventDefault()}
                  onDrop={handleCanvasDrop}
                  style={{ display:'block', cursor:'crosshair' }}
                />
              </div>

              {/* Stats */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
                {[['Floor used', areaPct+'%'], ['Items placed', placed.length], ['Total weight', totalWeight.toLocaleString()+' lbs'], ['Floor area', Math.round(totalArea/144)+' sqft']].map(([l,v]) => (
                  <div key={l as string} style={{ background:'var(--surface2)', borderRadius:'var(--radius)', padding:'6px 10px' }}>
                    <div style={{ fontSize:10, color:'var(--text2)' }}>{l}</div>
                    <div style={{ fontSize:14, fontWeight:500 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Weight bar */}
              <div style={{ background:'var(--surface2)', borderRadius:'var(--radius)', padding:'8px 10px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11 }}>
                  <span style={{ color:'var(--text2)' }}>Payload capacity</span>
                  <span style={{ fontWeight:500 }}>{weightPct}%</span>
                </div>
                <div style={{ height:8, background:'var(--border)', borderRadius:4, overflow:'hidden', marginTop:4 }}>
                  <div style={{ height:'100%', borderRadius:4, background:wbarColor, width:weightPct+'%', transition:'width .3s' }} />
                </div>
              </div>

              {/* Legend */}
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {[...new Map(placed.map(p => [p.gear.name, p.gear.color]))].map(([n,c]) => (
                  <div key={n} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'var(--text2)' }}>
                    <div style={{ width:9, height:9, borderRadius:2, background:c }} /><span>{n}</span>
                  </div>
                ))}
              </div>

              {/* AI log */}
              <div>
                <Label>AI reasoning</Label>
                <div style={{ background:'var(--surface2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius)', padding:9, fontSize:11, color:'var(--text2)', minHeight:36, maxHeight:72, overflowY:'auto', whiteSpace:'pre-wrap', lineHeight:1.5 }}>
                  {aiLog}
                </div>
              </div>

              {/* Manifest */}
              {showManifest && (
                <div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <Label>Load manifest</Label>
                    <div style={{ display:'flex', gap:6 }}>
                      <Btn variant="default" small onClick={copyManifest}>Copy</Btn>
                      <Btn variant="default" small onClick={()=>setShowManifest(false)}>Close</Btn>
                    </div>
                  </div>
                  <pre style={{ background:'var(--surface2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius)', padding:10, fontSize:11, fontFamily:'monospace', overflowX:'auto', maxHeight:220, overflowY:'auto', color:'var(--text)', marginTop:6 }}>{manifestText}</pre>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Preload data ─────────────────────────────────────────────────────────────
const PRELOAD: GearItem[] = [
  { name:'Subwoofer',            w:30, d:34, h:26, weight:265, qty:8,  color:'#1D9E75', rotation:'both' },
  { name:'Line Array Cabinet',   w:22, d:24, h:20, weight:130, qty:16, color:'#378ADD', rotation:'both' },
  { name:'Amp Rack (8U)',        w:19, d:30, h:14, weight:180, qty:6,  color:'#D85A30', rotation:'normal' },
  { name:'Stage Monitor',        w:24, d:18, h:14, weight:85,  qty:8,  color:'#9F45B0', rotation:'both' },
  { name:'FOH Console Case',     w:48, d:36, h:24, weight:320, qty:1,  color:'#185FA5', rotation:'normal' },
  { name:'Monitor Console Case', w:36, d:30, h:24, weight:240, qty:1,  color:'#0F6E56', rotation:'normal' },
  { name:'Cable Trunk',          w:24, d:24, h:24, weight:120, qty:4,  color:'#BA7517', rotation:'both' },
  { name:'Snake Box',            w:19, d:24, h:6,  weight:45,  qty:4,  color:'#D4537E', rotation:'normal' },
  { name:'Dimmer Rack',          w:19, d:24, h:14, weight:95,  qty:2,  color:'#534AB7', rotation:'normal' },
  { name:'Misc Road Case',       w:20, d:20, h:20, weight:60,  qty:4,  color:'#888780', rotation:'both' },
]

// ── Shared style helpers ──────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width:'100%', padding:'6px 9px', fontSize:13,
  border:'0.5px solid var(--border2)', borderRadius:'var(--radius)',
  background:'var(--surface2)', color:'var(--text)', marginBottom:5, fontFamily:'inherit'
}
const lblStyle: React.CSSProperties = { fontSize:11, color:'var(--text2)', display:'block', marginBottom:2 }
const smallBtnStyle: React.CSSProperties = {
  padding:'2px 7px', fontSize:11, border:'0.5px solid var(--border2)',
  borderRadius:'var(--radius)', background:'transparent', cursor:'pointer', fontFamily:'inherit'
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize:11, fontWeight:500, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>{children}</div>
}

function Card({ children, style }: { children: React.ReactNode, style?: React.CSSProperties }) {
  return (
    <div style={{ background:'var(--surface)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-lg)', padding:13, ...style }}>
      {children}
    </div>
  )
}

type BtnVariant = 'blue' | 'green' | 'amber' | 'danger' | 'default'
function Btn({ children, variant='default', full, small, disabled, onClick, style }: {
  children: React.ReactNode, variant?: BtnVariant, full?: boolean, small?: boolean,
  disabled?: boolean, onClick?: () => void, style?: React.CSSProperties
}) {
  const base: React.CSSProperties = {
    display:'inline-flex', alignItems:'center', justifyContent:'center', gap:5,
    padding: small ? '3px 9px' : '7px 13px',
    fontSize: small ? 12 : 13, fontWeight:500,
    border:'0.5px solid var(--border2)', borderRadius:'var(--radius)',
    background:'transparent', color:'var(--text)', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? .45 : 1, width: full ? '100%' : undefined,
    fontFamily:'inherit', transition:'background .1s', ...style
  }
  const variants: Record<BtnVariant, React.CSSProperties> = {
    blue:    { background:'#185FA5', color:'#E6F1FB', borderColor:'#185FA5' },
    green:   { background:'#3B6D11', color:'#EAF3DE', borderColor:'#3B6D11' },
    amber:   { background:'#854F0B', color:'#FAEEDA', borderColor:'#854F0B' },
    danger:  { background:'transparent', color:'var(--red)', borderColor:'var(--red)' },
    default: {},
  }
  return <button style={{...base,...variants[variant]}} onClick={onClick} disabled={disabled}>{children}</button>
}
