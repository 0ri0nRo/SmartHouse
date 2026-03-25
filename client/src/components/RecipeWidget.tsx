import { useState, useEffect } from 'react'
import { ChefHat, ChevronRight, Clock, ExternalLink, RefreshCw } from 'lucide-react'

interface Meal {
  idMeal: string
  strMeal: string
  strCategory: string
  strArea: string
  strInstructions: string
  strMealThumb: string
  strSource: string
  strYoutube: string
  [key: string]: string | null
}

function getIngredients(meal: Meal): { name: string; measure: string }[] {
  const result = []
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`]
    const measure = meal[`strMeasure${i}`]
    if (name && name.trim()) {
      result.push({ name: name.trim(), measure: measure?.trim() || '' })
    }
  }
  return result
}

// Seed by day so it's stable across refreshes but changes daily
function getDaySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

export default function RecipeWidget() {
  const [meal, setMeal] = useState<Meal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      // Use day-based seed via backend to keep the same recipe all day
      const res = await fetch('/api/recipe/daily')
      if (!res.ok) throw new Error('Recipe unavailable')
      const data = await res.json()
      setMeal(data)
    } catch (e: any) {
      setError(e.message || 'Failed to load recipe')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ── Loading ──────────────────────────────────────────────
  if (loading) return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', minHeight: 140, height: '100%',
    }}>
      <span className="spinner" />
    </div>
  )

  // ── Error ────────────────────────────────────────────────
  if (error || !meal) return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '1.25rem',
      display: 'flex', flexDirection: 'column', gap: '0.5rem', height: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <ChefHat size={16} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Recipe of the day</span>
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{error}</div>
      <button className="btn btn--ghost btn--sm" onClick={load} style={{ alignSelf: 'flex-start', marginTop: '0.25rem' }}>
        <RefreshCw size={11} /> Retry
      </button>
    </div>
  )

  const ingredients = getIngredients(meal)

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', overflow: 'hidden', height: '100%',
      display: 'flex', flexDirection: 'column', transition: 'border-color var(--transition)',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      {/* Header */}
      <div style={{ padding: '1.1rem 1.1rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 'var(--radius-md)',
            background: 'var(--card-temp-bg)', color: 'var(--card-temp-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <ChefHat size={18} />
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            {meal.strSource && (
              <a href={meal.strSource} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                title="Full recipe">
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
          Recipe of the day
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem', fontFamily: 'var(--font-mono)' }}>
          {meal.strCategory} · {meal.strArea}
        </div>
      </div>

      {/* Thumbnail + name */}
      <div style={{ flex: 1, padding: '0.9rem 1.1rem 0' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <img
            src={meal.strMealThumb}
            alt={meal.strMeal}
            style={{
              width: 64, height: 64, borderRadius: 'var(--radius-md)',
              objectFit: 'cover', flexShrink: 0,
              border: '1px solid var(--border)',
            }}
          />
          <div>
            <div style={{
              fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)',
              lineHeight: 1.3, marginBottom: '0.3rem',
            }}>
              {meal.strMeal}
            </div>
            <div style={{
              fontSize: '0.68rem', color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
            }}>
              {ingredients.length} ingredients
            </div>
          </div>
        </div>
      </div>

      {/* Ingredients toggle */}
      <button onClick={() => setExpanded(v => !v)} style={{
        width: '100%', background: 'var(--bg-surface-2)', border: 'none',
        borderTop: '1px solid var(--border)', padding: '0.5rem 1.1rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.7rem',
        fontFamily: 'var(--font-mono)', fontWeight: 500, marginTop: '0.75rem',
      }}>
        <span>Ingredients</span>
        <ChevronRight size={12} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {/* Ingredients list */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-surface-2)', maxHeight: 220, overflowY: 'auto' }}>
          {ingredients.map((ing, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.4rem 1.1rem',
              borderBottom: i < ingredients.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-primary)' }}>
                {ing.name}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                {ing.measure || '—'}
              </span>
            </div>
          ))}
          {meal.strYoutube && (
            <div style={{ padding: '0.6rem 1.1rem', borderTop: '1px solid var(--border)' }}>
              <a href={meal.strYoutube} target="_blank" rel="noopener noreferrer"
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                  color: 'var(--color-danger)', textDecoration: 'none',
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                }}>
                <ExternalLink size={11} /> Watch on YouTube
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}