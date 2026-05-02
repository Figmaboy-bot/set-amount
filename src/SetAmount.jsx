import { useState, useCallback } from 'react'

const MIN = 0
const MAX = 100
const STEP = 5

const TRACK_WIDTH = 494
const PILL_INSET = 8
const ANIM = '0.35s cubic-bezier(0.34, 1.56, 0.64, 1)'

// Build slot arrays keyed from the right (0=units, 1=tens, 2=hundreds).
// We pad to whichever is longer so both arrays stay the same length during a transition,
// but we never allocate more slots than the larger number needs.
function getSlots(current, previous) {
  const currStr = String(Math.floor(current))
  const prevStr = previous !== null ? String(Math.floor(previous)) : ''
  const len = Math.max(currStr.length, prevStr.length)
  const curr = currStr.padStart(len, ' ').split('').reverse() // index 0 = units
  const prev = prevStr ? prevStr.padStart(len, ' ').split('').reverse() : null
  return { curr, prev, len }
}

function DigitSlot({ current, previous, direction, animKey }) {
  const changed   = previous !== null && current !== previous
  const isEmpty   = current === ' '
  const prevEmpty = !previous || previous === ' '

  if (isEmpty) return null

  return (
    <span style={{ position: 'relative', display: 'inline-block', clipPath: 'inset(-60px -50px)' }}>
      {/* Entering / static digit — sets slot width */}
      <span
        key={`in-${animKey}`}
        style={{
          display: 'block',
          lineHeight: 1,
          animation: changed
            ? `${direction === 'up' ? 'enterFromBottom' : 'enterFromTop'} ${ANIM} forwards`
            : 'none',
        }}
      >
        {current}
      </span>

      {/* Exiting digit — absolutely overlaid, doesn't affect layout */}
      {changed && !prevEmpty && (
        <span
          key={`out-${animKey}`}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            display: 'block', lineHeight: 1,
            animation: `${direction === 'up' ? 'exitUp' : 'exitDown'} ${ANIM} forwards`,
          }}
        >
          {previous}
        </span>
      )}
    </span>
  )
}

export default function SetAmount() {
  const [state, setState] = useState({
    current: 0,
    previous: null,
    direction: null,
    key: 0,
  })

  const amount = state.current

  const decrement = useCallback(() => {
    setState((s) => {
      const next = Math.max(MIN, s.current - STEP)
      if (next === s.current) return s
      return { current: next, previous: s.current, direction: 'down', key: s.key + 1 }
    })
  }, [])

  const increment = useCallback(() => {
    setState((s) => {
      const next = Math.min(MAX, s.current + STEP)
      if (next === s.current) return s
      return { current: next, previous: s.current, direction: 'up', key: s.key + 1 }
    })
  }, [])

  const pillWidth = ((amount - MIN) / (MAX - MIN)) * (TRACK_WIDTH - PILL_INSET * 2)
  const { curr: currentSlots, prev: previousSlots, len: slotCount } = getSlots(state.current, state.previous)

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
                className="absolute top-[6px] bottom-[6px] left-[8px] rounded-[24px] bg-white shadow-sm pointer-events-none"
                style={{
                  width: pillWidth,
                  transition: 'width 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              />

              {/* Minus */}
              <button
                onClick={decrement}
                disabled={amount <= MIN}
                aria-label="Decrease amount"
                className="relative z-10 flex items-center justify-center size-16 shrink-0
                           text-black/40 hover:text-black disabled:opacity-30
                           transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed select-none"
              >
                <MinusIcon />
              </button>

              {/* Per-digit animated amount */}
              <div
                className="relative z-10 flex-1 flex items-center justify-center text-[56px] font-semibold leading-none text-black"
                style={{ fontFamily: '"Inter Tight", sans-serif', fontVariantNumeric: 'tabular-nums' }}
              >
                <span>$&nbsp;</span>
                {/* Render left-to-right but key from the right so units=0, tens=1, hundreds=2 */}
                {Array.from({ length: slotCount }, (_, fromRight) => {
                  const displayIndex = slotCount - 1 - fromRight
                  return (
                    <DigitSlot
                      key={fromRight}
                      current={currentSlots[displayIndex]}
                      previous={previousSlots ? previousSlots[displayIndex] : null}
                      direction={state.direction}
                      animKey={state.key}
                    />
                  )
                })}
                <span>.00</span>
              </div>

              {/* Plus */}
              <button
                onClick={increment}
                disabled={amount >= MAX}
                aria-label="Increase amount"
                className="relative z-10 flex items-center justify-center size-16 shrink-0
                           text-black/40 hover:text-black disabled:opacity-30
                           transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed select-none"
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
