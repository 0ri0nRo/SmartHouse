import { useState, useEffect, useCallback } from 'react'
import {
  ShoppingCart, Plus, Trash2, Check, CheckCheck,
  X, RefreshCw, Clock, Store,
} from 'lucide-react'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'

// ── API helpers ────────────────────────────────────────────
const shopApi = {
  getItems:       ()          => fetch('/api/shopping-list/current', { cache:'no-cache' }).then(r => r.json()),
  addItem:        (body)      => fetch('/todolist/insert', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  completeItem:   (id, body)  => fetch(`/api/shopping-list/complete/${id}`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) }),
  deleteItem:     (id)        => fetch(`/todolist/delete/${id}`, { method:'DELETE' }),
  clearCompleted: ()          => fetch('/api/shopping-list/clear-completed', { method:'POST' }).then(r => r.json()),
  bulkComplete:   (ids)       => fetch('/api/shopping-list/bulk-complete', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ item_ids: ids }) }).then(r => r.json()),
  getHistory:     (s, e)      => fetch(`/todolist/update/${s}/${e}`).then(r => r.json()),
}

// ── Priority dot ───────────────────────────────────────────
const PRIORITY_COLOR = { high:'var(--color-danger)', medium:'var(--color-warning)', low:'var(--color-success)' }

function PriorityDot({ priority }) {
  return (
    <span style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, display:'inline-block',
      background: PRIORITY_COLOR[priority] || PRIORITY_COLOR.medium }}/>
  )
}

// ── Stat card ──────────────────────────────────────────────
function StatCard({ label, value, accent }) {
  return (
    <div className={`stat-card accent-${accent}`} style={{
      background:'var(--bg-surface)', border:'1px solid var(--border)',
      borderRadius:'var(--radius-lg)', padding:'1.1rem', textAlign:'center',
      transition:'transform 0.2s',
    }}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:'1.75rem', fontWeight:500,
        color:`var(--card-${accent}-accent)`, lineHeight:1 }}>{value}</div>
      <div className="stat-label" style={{ marginTop:'0.4rem' }}>{label}</div>
    </div>
  )
}

// ── Receipt item ───────────────────────────────────────────
function ReceiptItem({ item, index, onComplete, onDelete, completing, deleting }) {
  return (
    <li style={{
      display:'flex', alignItems:'flex-start', gap:'0.75rem',
      padding:'0.9rem 0', borderBottom:'1px dashed var(--border)',
      transition:'opacity 0.3s, transform 0.3s',
      opacity: (completing || deleting) ? 0.4 : 1,
      transform: deleting ? 'translateX(40px)' : 'translateX(0)',
      fontFamily:'var(--font-mono)',
    }}>
      {/* Checkbox */}
      <button onClick={onComplete} disabled={completing || deleting}
        style={{
          width:22, height:22, borderRadius:4, border:'2px solid var(--border-strong)',
          background:'var(--bg-surface)', cursor:'pointer', flexShrink:0, marginTop:2,
          display:'flex', alignItems:'center', justifyContent:'center',
          transition:'all 0.2s',
        }}>
        {completing && <RefreshCw size={11} style={{ animation:'spin 0.8s linear infinite', color:'var(--text-muted)' }}/>}
      </button>

      {/* Content */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:'0.5rem' }}>
          <span style={{ fontWeight:700, fontSize:'0.85rem', color:'var(--text-primary)',
            textTransform:'uppercase', letterSpacing:'0.5px', wordBreak:'break-word' }}>
            {item.item_name || item.name}
          </span>
          <span style={{ fontWeight:700, fontSize:'0.85rem', color:'var(--text-primary)',
            flexShrink:0, whiteSpace:'nowrap' }}>
            ×{item.quantity}
          </span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginTop:'0.3rem', flexWrap:'wrap' }}>
          <span style={{ fontSize:'0.68rem', color:'var(--text-secondary)', letterSpacing:'0.5px' }}>
            {item.store}
          </span>
          <PriorityDot priority={item.priority}/>
          {item.neededBy && (
            <span style={{ fontSize:'0.65rem', color:'var(--text-muted)', fontStyle:'italic' }}>
              By {new Date(item.neededBy).toLocaleDateString('it-IT')}
            </span>
          )}
        </div>
      </div>

      {/* Delete */}
      <button onClick={onDelete} disabled={completing || deleting}
        style={{ background:'transparent', border:'1px solid var(--color-danger)', borderRadius:4,
          padding:'4px 8px', color:'var(--color-danger)', cursor:'pointer', fontSize:'0.9rem',
          flexShrink:0, transition:'all 0.2s', marginTop:2 }}>
        ×
      </button>
    </li>
  )
}

// ── History item ───────────────────────────────────────────
function HistoryItem({ name, store, frequency, totalQuantity, lastPurchased }) {
  return (
    <div className="card animate-fade" style={{ padding:'0.875rem 1rem', display:'flex',
      alignItems:'center', gap:'0.875rem' }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:500, fontSize:'0.875rem', color:'var(--text-primary)',
          textTransform:'uppercase', fontFamily:'var(--font-mono)', letterSpacing:'0.5px' }}>
          {name}
        </div>
        <div style={{ display:'flex', gap:'0.75rem', marginTop:'0.25rem', flexWrap:'wrap' }}>
          <span style={{ display:'flex', alignItems:'center', gap:'0.25rem',
            fontSize:'0.7rem', color:'var(--text-secondary)' }}>
            <Store size={10}/> {store}
          </span>
          <span style={{ fontSize:'0.7rem', color:'var(--text-muted)' }}>
            Total: {totalQuantity}
          </span>
          {lastPurchased && (
            <span style={{ display:'flex', alignItems:'center', gap:'0.25rem',
              fontSize:'0.7rem', color:'var(--text-muted)' }}>
              <Clock size={10}/> {new Date(lastPurchased).toLocaleDateString('it-IT')}
            </span>
          )}
        </div>
      </div>
      <span className="badge badge--success" style={{ flexShrink:0 }}>×{frequency}</span>
    </div>
  )
}

// ── Add item form ──────────────────────────────────────────
const EMPTY_FORM = { name:'', store:'', quantity:1, priority:'medium', neededBy:'' }

function AddItemForm({ onAdd, loading }) {
  const [form, setForm] = useState(EMPTY_FORM)

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  const handleSubmit = () => {
    if (!form.name.trim() || !form.store.trim()) return
    onAdd({ ...form }, () => setForm(EMPTY_FORM))
  }

  return (
    <div className="card mb-lg">
      <div className="card-header">
        <div className="card-header-icon" style={{ background:'var(--card-shop-bg)', color:'var(--card-shop-accent)' }}>
          <Plus size={15}/>
        </div>
        <span className="card-header-title">Add Item</span>
        <span className="badge badge--muted" style={{ marginLeft:'auto', fontSize:'0.6rem' }}>
          Ctrl+Enter
        </span>
      </div>
      <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>

        {/* Name + Quantity */}
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'0.75rem' }}>
          <div className="field">
            <label className="field-label">Item Name</label>
            <input className="input" value={form.name} onChange={set('name')}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="e.g. Milk, Bread..."/>
          </div>
          <div className="field">
            <label className="field-label">Quantity</label>
            <input className="input input--mono" type="number" min={1} value={form.quantity}
              onChange={set('quantity')}/>
          </div>
        </div>

        {/* Store + Priority */}
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'0.75rem' }}>
          <div className="field">
            <label className="field-label">Store</label>
            <input className="input" value={form.store} onChange={set('store')}
              placeholder="e.g. Conad, Maurys..."/>
          </div>
          <div className="field">
            <label className="field-label">Priority</label>
            <select className="select" value={form.priority} onChange={set('priority')}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        {/* Needed by */}
        <div className="field">
          <label className="field-label">Needed By (optional)</label>
          <input className="input input--mono" type="date" value={form.neededBy} onChange={set('neededBy')}/>
        </div>

        <button className="btn btn--primary btn--full" onClick={handleSubmit} disabled={loading || !form.name.trim() || !form.store.trim()}>
          {loading
            ? <><RefreshCw size={14} style={{ animation:'spin 0.8s linear infinite' }}/> Adding...</>
            : <><Plus size={14}/> Add to List</>}
        </button>
      </div>
    </div>
  )
}

// ── History section ────────────────────────────────────────
function HistorySection() {
  const { toast, showToast } = useToast()
  const today = new Date()
  const oneMonthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())

  const [startDate, setStartDate] = useState(oneMonthAgo.toISOString().split('T')[0])
  const [endDate,   setEndDate]   = useState(today.toISOString().split('T')[0])
  const [history,   setHistory]   = useState([])
  const [loading,   setLoading]   = useState(false)

  const handleFilter = async () => {
    if (!startDate || !endDate) { showToast('Select both dates', 'error'); return }
    setLoading(true)
    try {
      const data = await shopApi.getHistory(startDate, endDate)
      // Group by name+store
      const freq = {}
      data.forEach(item => {
        const key = `${item.item_name||item.name}__${item.store}`
        if (!freq[key]) freq[key] = { name:item.item_name||item.name, store:item.store, frequency:0, totalQuantity:0, lastPurchased:item.timestamp||item.purchaseDate }
        freq[key].frequency++
        freq[key].totalQuantity += parseInt(item.quantity)||0
        const d = item.timestamp||item.purchaseDate
        if (d && new Date(d) > new Date(freq[key].lastPurchased)) freq[key].lastPurchased = d
      })
      setHistory(Object.values(freq).sort((a,b) => b.frequency - a.frequency))
      if (!data.length) showToast('No items found in this range', 'warning')
    } catch { showToast('Error loading history', 'error') }
    finally { setLoading(false) }
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon" style={{ background:'var(--card-exp-bg)', color:'var(--card-exp-accent)' }}>
          <Clock size={15}/>
        </div>
        <span className="card-header-title">Purchase History</span>
      </div>
      <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
          {[{label:'From',val:startDate,set:setStartDate},{label:'To',val:endDate,set:setEndDate}].map(f=>(
            <div key={f.label} className="field">
              <label className="field-label">{f.label}</label>
              <input className="input input--mono" type="date" value={f.val} onChange={e=>f.set(e.target.value)}/>
            </div>
          ))}
        </div>
        <button className="btn btn--primary btn--full" onClick={handleFilter} disabled={loading}>
          {loading
            ? <><RefreshCw size={14} style={{ animation:'spin 0.8s linear infinite' }}/> Loading...</>
            : 'Filter History'}
        </button>

        {history.length === 0 && !loading && (
          <div className="empty-state" style={{ padding:'2rem' }}>
            <Clock size={24}/><div>Filter to see purchase history</div>
          </div>
        )}

        <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem' }}>
          {history.map((h,i) => <HistoryItem key={i} {...h}/>)}
        </div>
      </div>
      <Toast toast={toast}/>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────
export default function ShoppingPage() {
  const { toast, showToast } = useToast()

  const [items,      setItems]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [adding,     setAdding]     = useState(false)
  const [completing, setCompleting] = useState(new Set())
  const [deleting,   setDeleting]   = useState(new Set())

  // Load items
  const loadItems = useCallback(async () => {
    try {
      const data = await shopApi.getItems()
      setItems(data || [])
    } catch {
      showToast('Error loading items', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadItems() }, [loadItems])

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        document.getElementById('sh-add-btn')?.click()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Stats
  const active  = items.filter(i => !i.inCart)
  const done    = items.filter(i => i.inCart)
  const stores  = new Set(items.map(i => i.store)).size

  // ── Actions ───────────────────────────────────────────────
  const handleAdd = async (form, resetForm) => {
    setAdding(true)
    try {
      await shopApi.addItem({
        item_name: form.name, store: form.store,
        quantity: form.quantity, priority: form.priority,
        timestamp: new Date().toISOString(),
      })
      resetForm()
      showToast(`"${form.name}" added to list`)
      loadItems()
    } catch {
      showToast('Error adding item', 'error')
    } finally {
      setAdding(false)
    }
  }

  const handleComplete = async (item) => {
    const id = item.id || item._id
    setCompleting(s => new Set(s).add(id))
    try {
      await shopApi.completeItem(id, {
        item_name: item.item_name || item.name,
        store: item.store, quantity: item.quantity,
        priority: item.priority,
        timestamp: new Date().toISOString().split('T')[0],
      })
      showToast(`"${item.item_name || item.name}" completed!`)
      loadItems()
    } catch {
      showToast('Error completing item', 'error')
    } finally {
      setCompleting(s => { const n = new Set(s); n.delete(id); return n })
    }
  }

  const handleDelete = async (item) => {
    const id = item.id || item._id
    setDeleting(s => new Set(s).add(id))
    setTimeout(async () => {
      try {
        await shopApi.deleteItem(id)
        showToast(`"${item.item_name || item.name}" deleted`)
        loadItems()
      } catch {
        showToast('Error deleting item', 'error')
      } finally {
        setDeleting(s => { const n = new Set(s); n.delete(id); return n })
      }
    }, 300)
  }

  const handleClearDone = async () => {
    try {
      const res = await shopApi.clearCompleted()
      showToast(`Cleared ${res.cleared_count || done.length} completed items`)
      loadItems()
    } catch { showToast('Error clearing items', 'error') }
  }

  const handleMarkAll = async () => {
    const ids = active.map(i => i.id || i._id).filter(Boolean)
    try {
      const res = await shopApi.bulkComplete(ids)
      showToast(`Completed ${res.updated_count || active.length} items`)
      loadItems()
    } catch { showToast('Error completing items', 'error') }
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="page animate-fade">
      <div className="page-header">
        <h1 className="page-title">Shop<span style={{ color:'var(--accent)' }}>ping</span></h1>
        <p className="page-subtitle">Smart shopping made simple</p>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0.875rem', marginBottom:'1.5rem' }}>
        <StatCard label="To Buy"  value={active.length} accent="shop"/>
        <StatCard label="Done"    value={done.length}   accent="air"/>
        <StatCard label="Stores"  value={stores}        accent="hum"/>
      </div>

      {/* Add item */}
      <AddItemForm onAdd={handleAdd} loading={adding}/>

      {/* Shopping list — receipt style */}
      <div className="card mb-lg">
        <div className="card-header">
          <div className="card-header-icon" style={{ background:'var(--card-shop-bg)', color:'var(--card-shop-accent)' }}>
            <ShoppingCart size={15}/>
          </div>
          <span className="card-header-title">Shopping List</span>
          <div style={{ display:'flex', gap:'0.4rem', marginLeft:'auto' }}>
            {done.length > 0 && (
              <button className="btn btn--ghost btn--sm" onClick={handleClearDone} title="Clear completed">
                <Trash2 size={12}/>
              </button>
            )}
            {active.length > 0 && (
              <button className="btn btn--success btn--sm" onClick={handleMarkAll} title="Mark all complete">
                <CheckCheck size={12}/>
              </button>
            )}
          </div>
        </div>

        <div className="card-body">
          {/* Receipt container */}
          <div style={{
            background:'var(--bg-surface)', border:'2px dashed var(--border-strong)',
            borderRadius:'var(--radius-md)', padding:'1.25rem 1rem',
            fontFamily:'var(--font-mono)',
          }}>
            {/* Receipt header */}
            <div style={{ textAlign:'center', borderBottom:'2px solid var(--border-strong)',
              paddingBottom:'0.75rem', marginBottom:'1rem' }}>
              <div style={{ fontSize:'1rem', fontWeight:700, letterSpacing:3,
                color:'var(--text-primary)', textTransform:'uppercase' }}>
                Grocery List
              </div>
              <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', letterSpacing:1, marginTop:2 }}>
                {new Date().toLocaleDateString('it-IT')}
              </div>
            </div>

            {/* Items */}
            {loading ? (
              <div className="loading-box"><span className="spinner"/></div>
            ) : active.length === 0 ? (
              <div className="empty-state" style={{ padding:'2rem' }}>
                <ShoppingCart size={28}/><div>Your cart is empty — add items above</div>
              </div>
            ) : (
              <ul style={{ listStyle:'none' }}>
                {active.map((item) => {
                  const id = item.id || item._id
                  return (
                    <ReceiptItem
                      key={id}
                      item={item}
                      onComplete={() => handleComplete(item)}
                      onDelete={() => handleDelete(item)}
                      completing={completing.has(id)}
                      deleting={deleting.has(id)}
                    />
                  )
                })}
              </ul>
            )}

            {/* Receipt footer */}
            {active.length > 0 && (
              <div style={{ borderTop:'2px solid var(--border-strong)', paddingTop:'0.75rem',
                marginTop:'0.75rem', display:'flex', justifyContent:'space-between',
                fontFamily:'var(--font-mono)', fontSize:'0.85rem', fontWeight:700,
                color:'var(--text-primary)', letterSpacing:1 }}>
                <span>TOTAL ITEMS:</span>
                <span>{active.length}</span>
              </div>
            )}
          </div>

          {/* Completed items */}
          {done.length > 0 && (
            <div style={{ marginTop:'1rem', paddingTop:'1rem', borderTop:'1px solid var(--border)' }}>
              <div style={{ fontSize:'0.68rem', letterSpacing:2, textTransform:'uppercase',
                color:'var(--text-muted)', marginBottom:'0.75rem', fontFamily:'var(--font-mono)' }}>
                Completed ({done.length})
              </div>
              <ul style={{ listStyle:'none', opacity:0.5 }}>
                {done.map((item) => {
                  const id = item.id || item._id
                  return (
                    <li key={id} style={{ display:'flex', alignItems:'center', gap:'0.75rem',
                      padding:'0.6rem 0', borderBottom:'1px dashed var(--border)',
                      fontFamily:'var(--font-mono)' }}>
                      <div style={{ width:22, height:22, borderRadius:4, background:'var(--text-primary)',
                        flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <Check size={13} style={{ color:'var(--bg-surface)' }}/>
                      </div>
                      <span style={{ flex:1, fontSize:'0.82rem', fontWeight:600,
                        textDecoration:'line-through', color:'var(--text-secondary)',
                        textTransform:'uppercase', letterSpacing:'0.5px' }}>
                        {item.item_name || item.name}
                      </span>
                      <span style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>×{item.quantity}</span>
                      <button onClick={() => handleDelete(item)} disabled={deleting.has(id)}
                        style={{ background:'transparent', border:'none', cursor:'pointer',
                          color:'var(--text-muted)', padding:'2px 4px' }}>
                        <X size={13}/>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* History */}
      <HistorySection/>

      <Toast toast={toast}/>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}