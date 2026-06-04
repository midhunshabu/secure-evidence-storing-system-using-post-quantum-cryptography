import { useEffect, useRef, useState } from 'react'

const DOT_COUNT = 14

export default function CursorTrail() {
  const [enabled, setEnabled] = useState(false)
  const dotRefs = useRef([])
  const mouse = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  const positions = useRef(
    Array.from({ length: DOT_COUNT }, () => ({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    }))
  )
  const frameRef = useRef(0)

  useEffect(() => {
    const finePointer = window.matchMedia('(pointer: fine)').matches
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setEnabled(finePointer && !reducedMotion)
  }, [])

  useEffect(() => {
    if (!enabled) return undefined

    const handleMove = (event) => {
      mouse.current.x = event.clientX
      mouse.current.y = event.clientY
    }

    const animate = (time) => {
      const lead = positions.current[0]
      lead.x += (mouse.current.x - lead.x) * 0.35
      lead.y += (mouse.current.y - lead.y) * 0.35

      for (let i = 1; i < DOT_COUNT; i += 1) {
        const prev = positions.current[i - 1]
        const current = positions.current[i]
        current.x += (prev.x - current.x) * 0.35
        current.y += (prev.y - current.y) * 0.35
      }

      positions.current.forEach((pos, i) => {
        const el = dotRefs.current[i]
        if (!el) return
        const scale = 1 - (i / DOT_COUNT) * 0.72
        const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(time / 320 + i * 0.55))
        el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${scale})`
        el.style.opacity = String(pulse)
      })

      frameRef.current = window.requestAnimationFrame(animate)
    }

    window.addEventListener('mousemove', handleMove, { passive: true })
    frameRef.current = window.requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.cancelAnimationFrame(frameRef.current)
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <div className="cursor-trail-layer" aria-hidden="true">
      {Array.from({ length: DOT_COUNT }).map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            dotRefs.current[i] = el
          }}
          className="cursor-trail-dot"
        />
      ))}
    </div>
  )
}

