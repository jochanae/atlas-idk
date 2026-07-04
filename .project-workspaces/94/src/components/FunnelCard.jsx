import React, { useState } from 'react'
import { useDashboard } from '../hooks/useDashboard'

const STEP_COLORS = ['#f59e0b', 'rgba(245,158,11,0.6)', 'rgba(245,158,11,0.35)']

function FunnelStep({ step, index, total }) {
  const isLast = index === total - 1

  return (
    <div className="flex flex-col">
      <div className="flex gap-3">
        {/* Step indicator */}
        <div className="flex flex-col items-center" style={{ minWidth: 28 }}>
          <div
            className="rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              width: 28,
              height: 28,
              background: `rgba(245, 158, 11, ${0.15 - index * 0.03})`,
              border: `1px solid ${STEP_COLORS[index]}`,
              fontSize: 11,
              fontWeight: 700,
              color: STEP_COLORS[index]
            }}
          >
            {index + 1}
          </div>
          {!isLast && (
            <div className="step-connector mt-1" />
          )}
        </div>

        {/* Step content */}
        <div className="pb-4 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: STEP_COLORS[index],
                letterSpacing: '0.1em',
                textTransform: 'uppercase'
              }}
            >
              {step.label}
            </span>
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.9)',
              marginBottom: 4,
              lineHeight: 1.4
            }}
          >
            {step.title}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.5)',
              lineHeight: 1.6,
              marginBottom: 8
            }}
          >
            {step.description}
          </div>
          <div
            className="inline-flex items-center gap-1 rounded-lg"
            style={{
              padding: '4px 10px',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.15)',
              fontSize: 11,
              fontWeight: 600,
              color: '#f59e0b',
              letterSpacing: '0.02em'
            }}
          >
            {step.cta}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function FunnelCard({ funnel, compact }) {
  const { toggleFunnel, deleteFunnel } = useDashboard()
  const [expanded, setExpanded] = useState(!compact)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const daysAgo = Math.floor((Date.now() - new Date(funnel.createdAt)) / 86400000)
  const timeLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`

  const handleDelete = () => {
    if (confirmDelete) {
      deleteFunnel(funnel.id)
    } else {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
    }
  }

  return (
    <div
      className="rounded-2xl fade-slide-up"
      style={{
        background: funnel.active
          ? 'rgba(255, 255, 255, 0.04)'
          : 'rgba(255, 255, 255, 0.02)',
        border: `1px solid ${funnel.active ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.04)'}`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        opacity: funnel.active ? 1 : 0.6
      }}
    >
      {/* Card header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <p
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.7)',
                lineHeight: 1.4,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical'
              }}
            >
              "{funnel.prompt}"
            </p>
          </div>

          {/* Status toggle */}
          <button
            onClick={() => toggleFunnel(funnel.id)}
            className="flex-shrink-0 rounded-full transition-all duration-200 active:scale-95"
            style={{
              width: 36,
              height: 20,
              background: funnel.active
                ? 'linear-gradient(90deg, #d97706, #f59e0b)'
                : 'rgba(255,255,255,0.1)',
              border: 'none',
              position: 'relative',
              cursor: 'pointer'
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 2,
                left: funnel.active ? 18 : 2,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: 'white',
                transition: 'left 0.2s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.4)'
              }}
            />
          </button>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3">
          <span
            style={{
              fontSize: 10,
              color: funnel.active ? '#f59e0b' : 'rgba(255,255,255,0.25)',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase'
            }}
          >
            {funnel.active ? '● Active' : '○ Paused'}
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>·</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.03em' }}>
            {timeLabel}
          </span>
          {funnel.leads > 0 && (
            <>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>·</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.03em' }}>
                {funnel.leads} leads
              </span>
            </>
          )}
        </div>
      </div>

      {/* Expand/collapse toggle */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2 transition-opacity duration-200"
        style={{
          background: 'transparent',
          border: 'none',
          borderTop: '1px solid rgba(255,255,255,0.04)',
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.35)',
          fontSize: 11,
          letterSpacing: '0.04em'
        }}
      >
        <span>{expanded ? 'Hide steps' : 'View 3 steps'}</span>
        <span style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>
          ↓
        </span>
      </button>

      {/* Steps */}
      {expanded && (
        <div
          className="px-4 pt-3 fade-slide-up"
          style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
        >
          {funnel.steps.map((step, i) => (
            <FunnelStep key={step.id} step={step} index={i} total={funnel.steps.length} />
          ))}
        </div>
      )}

      {/* Delete action */}
      <div
        className="flex justify-end px-4 pb-3"
        style={{ borderTop: expanded ? '1px solid rgba(255,255,255,0.04)' : 'none', paddingTop: expanded ? 10 : 0 }}
      >
        <button
          onClick={handleDelete}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 11,
            color: confirmDelete ? '#ef4444' : 'rgba(255,255,255,0.2)',
            letterSpacing: '0.03em',
            padding: '4px 0',
            transition: 'color 0.2s'
          }}
        >
          {confirmDelete ? 'Tap again to delete' : 'Remove'}
        </button>
      </div>
    </div>
  )
}