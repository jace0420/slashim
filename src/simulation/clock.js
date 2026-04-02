// simulation clock — realtime, pause/resume with selectable speed presets.
// start paused by default; caller calls play() to begin ticking.
// each tick fires onTick; every TICKS_PER_MINUTE ticks, clock advances one minute.

export const SPEED_PRESETS = {
  normal:  { label: 'NORMAL',  tickIntervalMs: 400 }, // ~1 sim-min per 1.6s
  fast:    { label: 'FAST',    tickIntervalMs: 150 }, // ~1 sim-min per 0.6s
  fastest: { label: 'FASTEST', tickIntervalMs: 50  }, // ~1 sim-min per 0.2s
}

export const DEFAULT_CLOCK_PARAMS = {
  tickIntervalMs: SPEED_PRESETS.normal.tickIntervalMs,
  ticksPerMinute: 4,   // ticks that must fire before the minute advances
  moveChance: 0.25,    // base probability a character moves each tick
}

// initialize clock state from the setup meta values
export function initClock(meta) {
  return {
    hour: meta.startingHour,
    minute: 0,
    meridiem: meta.startingMeridiem,
  }
}

// bump the clock forward by one minute, rolling over hour/meridiem as needed
export function advanceMinute(clock) {
  clock.minute += 1

  if (clock.minute >= 60) {
    clock.minute = 0
    clock.hour += 1

    if (clock.hour > 12) {
      clock.hour = 1
    }

    // flip meridiem when crossing 12
    if (clock.hour === 12) {
      clock.meridiem = clock.meridiem === 'am' ? 'pm' : 'am'
    }
  }

  return clock
}

// "8:05 PM"
export function formatClock(clock) {
  const mm = String(clock.minute).padStart(2, '0')
  return `${clock.hour}:${mm} ${clock.meridiem.toUpperCase()}`
}

// creates a realtime clock, starts paused. call play() to begin.
// onTick(tickIndex, minuteAdvanced) fires each tick.
// onMinute(clock) fires when the clock rolls forward.
// returns { play, pause, setSpeed, stop, isPaused }.
export function createClock(clock, clockParams, { onTick, onMinute }) {
  let tickCount = 0
  let paused = true
  let timer = null

  function tick() {
    tickCount += 1
    let minuteAdvanced = false

    if (tickCount % clockParams.ticksPerMinute === 0) {
      advanceMinute(clock)
      minuteAdvanced = true
    }

    onTick(tickCount, minuteAdvanced)

    if (minuteAdvanced) {
      onMinute(clock)
    }

    // TODO: minor events — briefly slow the interval then auto-resume
    // TODO: major events — call pause() and wait for player input before resume()
  }

  function play() {
    if (!paused) return
    paused = false
    timer = setInterval(tick, clockParams.tickIntervalMs)
  }

  function pause() {
    if (paused) return
    paused = true
    clearInterval(timer)
    timer = null
  }

  // changes tick rate; takes effect immediately if currently playing
  function setSpeed(intervalMs) {
    clockParams.tickIntervalMs = intervalMs
    if (!paused) {
      clearInterval(timer)
      timer = setInterval(tick, intervalMs)
    }
  }

  function stop() {
    clearInterval(timer)
    timer = null
    paused = true
  }

  return { play, pause, setSpeed, stop, isPaused: () => paused }
}
