import { useState, useCallback, useRef, useLayoutEffect, useEffect } from 'react'

const MIN = 0
const MAX = 100
const STEP = 5

const TRACK_WIDTH = 494
const PILL_INSET = 8
const SLOT_COUNT = String(MAX).length
const SLOT_MASK =
  'linear-gradient(to bottom, transparent, #000 0.35em, #000 calc(100% - 0.35em), transparent)'

const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Simulate a damped spring from 0 → 1 and bake it into a CSS `linear()` easing,
// so WAAPI / CSS transitions get real spring motion without a JS loop per frame.
function bakeSpring({ stiffness, damping, mass = 1 }) {
  const dt = 1 / 240
  const pts = [0]
  let x = 0, v = 0, t = 0
  while (t < 3) {
    const a = (-stiffness * (x - 1) - damping * v) / mass
    v += a * dt
    x += v * dt
    t += dt
    pts.push(x)
    if (Math.abs(x - 1) < 0.0005 && Math.abs(v) < 0.005) break
  }
  const N = 60
  const samples = Array.from({ length: N + 1 }, (_, k) => {
    const f = (k / N) * (pts.length - 1)
    const i = Math.floor(f)
    const y = pts[i] + ((pts[Math.min(i + 1, pts.length - 1)] ?? 1) - pts[i]) * (f - i)
    return +y.toFixed(4)
  })
  samples[N] = 1
  return { easing: `linear(${samples.join(', ')})`, duration: Math.round(t * 1000) }
}

const supportsLinear =
  typeof CSS !== 'undefined' && CSS.supports('transition-timing-function', 'linear(0, 1)')

const DIGIT_SPRING = supportsLinear
  ? bakeSpring({ stiffness: 280, damping: 22 })
  : { easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', duration: 450 }

const WIDTH_SPRING = supportsLinear
  ? bakeSpring({ stiffness: 320, damping: 30 })
  : { easing: 'cubic-bezier(0.22, 1, 0.36, 1)', duration: 400 }

// ─── Velocity-preserving spring for continuous values (the pill) ────────────
// Retargeting mid-flight keeps current velocity, so rapid clicks glide instead of restarting.
function useSpringValue(target, onFrame, { stiffness = 260, damping = 28, mass = 1 } = {}) {
  const s = useRef({ x: target, v: 0, raf: 0, last: 0 })

  useLayoutEffect(() => {
    onFrame(s.current.x)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const st = s.current
    cancelAnimationFrame(st.raf)
    if (prefersReducedMotion) {
      st.x = target
      st.v = 0
      onFrame(target)
      return
    }
    st.last = performance.now()
    const tick = (now) => {
      const dt = Math.min((now - st.last) / 1000, 1 / 30)
      st.last = now
      const steps = 4
      const h = dt / steps
      for (let i = 0; i < steps; i++) {
        const a = (-stiffness * (st.x - target) - damping * st.v) / mass
        st.v += a * h
        st.x += st.v * h
      }
      if (Math.abs(st.v) < 0.02 && Math.abs(st.x - target) < 0.02) {
        st.x = target
        st.v = 0
        onFrame(target)
        return
      }
      onFrame(st.x)
      st.raf = requestAnimationFrame(tick)
    }
    st.raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(st.raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])
}

// ─── A single glyph inside a slot ───────────────────────────────────────────
function DigitLayer({ id, char, status, direction, onExited }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || status === 'idle') return
    const sign = direction === 'up' ? 1 : -1
    const { easing, duration } = DIGIT_SPRING

    if (status === 'enter') {
      el.getAnimations().forEach((a) => a.cancel())
      if (prefersReducedMotion) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, fill: 'both' })
        return
      }
      el.animate(
        [{ transform: `translateY(${sign * 100}%)` }, { transform: 'translateY(0)' }],
        { duration, easing, fill: 'both' },
      )
      el.animate(
        [
          { opacity: 0, filter: 'blur(4px)' },
          { opacity: 1, filter: 'blur(0px)' },
        ],
        { duration: duration * 0.45, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'both' },
      )
    }

    if (status === 'exit') {
      // Start the exit from wherever the glyph is right now (it may still be entering).
      const cs = getComputedStyle(el)
      const fromY = cs.transform === 'none' ? 0 : new DOMMatrixReadOnly(cs.transform).m42
      const fromOpacity = cs.opacity
      const fromFilter = cs.filter === 'none' ? 'blur(0px)' : cs.filter
      el.getAnimations().forEach((a) => a.cancel())

      if (prefersReducedMotion) {
        const anim = el.animate([{ opacity: fromOpacity }, { opacity: 0 }], { duration: 150, fill: 'both' })
        anim.onfinish = () => onExited(id)
        return
      }
      const move = el.animate(
        [{ transform: `translateY(${fromY}px)` }, { transform: `translateY(${-sign * 100}%)` }],
        { duration: duration * 0.8, easing, fill: 'both' },
      )
      el.animate(
        [
          { opacity: fromOpacity, filter: fromFilter },
          { opacity: 0, filter: 'blur(4px)' },
        ],
        { duration: duration * 0.35, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'both' },
      )
      move.onfinish = () => onExited(id)
    }
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span
      ref={ref}
      style={{
        position: 'absolute', inset: 0,
        display: 'block', lineHeight: 1, textAlign: 'center',
        willChange: status === 'idle' ? 'auto' : 'transform, opacity, filter',
      }}
    >
      {char}
    </span>
  )
}

// ─── One digit position; stacks entering/exiting glyphs so changes never cut each other off ──
function DigitSlot({ char, direction }) {
  const nextId = useRef(1)
  const prevChar = useRef(char)
  const [layers, setLayers] = useState(() =>
    char === ' ' ? [] : [{ id: 0, char, status: 'idle', direction }],
  )

  useLayoutEffect(() => {
    if (char === prevChar.current) return
    prevChar.current = char
    setLayers((ls) => [
      ...ls.map((l) => (l.status === 'exit' ? l : { ...l, status: 'exit', direction })),
      ...(char === ' ' ? [] : [{ id: nextId.current++, char, status: 'enter', direction }]),
    ])
  }, [char, direction])

  const handleExited = useCallback((id) => {
    setLayers((ls) => ls.filter((l) => l.id !== id))
  }, [])

  const active = char !== ' '
  const { easing, duration } = WIDTH_SPRING

  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: active ? '1ch' : 0,
        transition: prefersReducedMotion ? 'none' : `width ${duration}ms ${easing}`,
        // Extra vertical room so glyphs can travel, softly masked at the edges.
        paddingBlock: '0.35em',
        marginBlock: '-0.35em',
        overflow: 'hidden',
        WebkitMaskImage: SLOT_MASK,
        maskImage: SLOT_MASK,
      }}
    >
      <span style={{ position: 'relative', display: 'block', height: '1em', width: '1ch' }}>
        {layers.map((l) => (
          <DigitLayer key={l.id} {...l} onExited={handleExited} />
        ))}
      </span>
    </span>
  )
}

export default function SetAmount() {
  const [{ amount, direction }, setState] = useState({ amount: 0, direction: 'up' })
  const pillRef = useRef(null)

  const decrement = useCallback(() => {
    setState((s) => {
      const next = Math.max(MIN, s.amount - STEP)
      return next === s.amount ? s : { amount: next, direction: 'down' }
    })
  }, [])

  const increment = useCallback(() => {
    setState((s) => {
      const next = Math.min(MAX, s.amount + STEP)
      return next === s.amount ? s : { amount: next, direction: 'up' }
    })
  }, [])

  const pillWidth = ((amount - MIN) / (MAX - MIN)) * (TRACK_WIDTH - PILL_INSET * 2)
  useSpringValue(pillWidth, (w) => {
    if (pillRef.current) pillRef.current.style.width = `${Math.max(0, w)}px`
  })

  // Fixed slots keyed from the right (index 0 = units); unused leading slots collapse to width 0.
  const digits = String(amount).padStart(SLOT_COUNT, ' ')

  return (
    <div className="flex items-center justify-center w-screen h-screen bg-[#f2f2f2]">
      {/* Card */}
      <div className="bg-white rounded-[100px] px-[100px] py-[200px] flex flex-col gap-[10px] items-start overflow-hidden">
        <div className="flex flex-col gap-8 items-center w-[494px]">

          {/* Title */}
          <h1
            className="w-full text-center text-black text-[36px] font-semibold leading-none"
            style={{ fontFamily: '"Inter Tight", sans-serif' }}
          >
            Set Amount
          </h1>

          <div className="flex flex-col gap-5 w-full">
            {/* Track */}
            <div className="relative bg-black/10 rounded-[32px] px-8 py-10 flex items-center gap-10 w-full">

              {/* Fill pill */}
              <div
                ref={pillRef}
                className="absolute top-[6px] bottom-[6px] left-[8px] rounded-[24px] bg-white shadow-sm pointer-events-none"
              />

              {/* Minus */}
              <button
                onClick={decrement}
                disabled={amount <= MIN}
                aria-label="Decrease amount"
                className="relative z-10 flex items-center justify-center size-16 shrink-0
                           text-black/40 hover:text-black disabled:opacity-30
                           transition-[color,opacity,transform] duration-200 ease-out
                           active:scale-[0.86] active:duration-75 disabled:active:scale-100
                           cursor-pointer disabled:cursor-not-allowed select-none"
              >
                <MinusIcon />
              </button>

              {/* Per-digit animated amount */}
              <div
                className="relative z-10 flex-1 flex items-center justify-center text-[56px] font-semibold leading-none text-black"
                style={{ fontFamily: '"Inter Tight", sans-serif', fontVariantNumeric: 'tabular-nums' }}
              >
                <span className="sr-only" aria-live="polite">${amount}.00</span>
                <span aria-hidden>$&nbsp;</span>
                {Array.from({ length: SLOT_COUNT }, (_, fromRight) => (
                  <DigitSlot
                    key={fromRight}
                    char={digits[SLOT_COUNT - 1 - fromRight]}
                    direction={direction}
                  />
                )).reverse()}
                <span aria-hidden>.00</span>
              </div>

              {/* Plus */}
              <button
                onClick={increment}
                disabled={amount >= MAX}
                aria-label="Increase amount"
                className="relative z-10 flex items-center justify-center size-16 shrink-0
                           text-black/40 hover:text-black disabled:opacity-30
                           transition-[color,opacity,transform] duration-200 ease-out
                           active:scale-[0.86] active:duration-75 disabled:active:scale-100
                           cursor-pointer disabled:cursor-not-allowed select-none"
              >
                <PlusIcon />
              </button>
            </div>

            {/* Range labels */}
            <div
              className="flex items-center justify-between text-[32px] font-medium leading-none text-black/20 w-full"
              style={{ fontFamily: '"Inter Tight", sans-serif' }}
            >
              <span>$0</span>
              <span>$100</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MinusIcon() {
  return (
    <svg width="40" height="6" viewBox="0 0 40 6" fill="none">
      <rect width="40" height="6" rx="3" fill="currentColor" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <rect x="0" y="17" width="40" height="6" rx="3" fill="currentColor" />
      <rect x="17" y="0" width="6" height="40" rx="3" fill="currentColor" />
    </svg>
  )
}
