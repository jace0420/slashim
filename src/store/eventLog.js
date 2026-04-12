// event log store — persists simulation events with timestamps and categories.
// subscribers are notified after each push so the UI can react immediately.

let _idCounter = 0

function formatEvent(raw) {
  switch (raw.type) {
    case 'room-enter':
      return { category: 'movement', text: `${raw.name} entered ${raw.room}` }
    case 'behavior-changed': {
      const suffix = raw.targetLabel ? ` → ${raw.targetLabel}` : ''
      return { category: 'behavior', text: `${raw.name} is now ${raw.behavior}${suffix}` }
    }
    case 'social-begin':
    case 'social-topic-beat':
      return { category: 'social', text: raw.text }
    case 'social-relationship-changed':
      return { category: 'social', text: `${raw.nameA} and ${raw.nameB} are now ${raw.label}` }
    default:
      return { category: 'other', text: `[${raw.type}]` }
  }
}

export function createEventLog(maxEntries = 500) {
  const entries = []
  const subscribers = []

  function push(rawEvent, clock) {
    const { category, text } = formatEvent(rawEvent)
    const entry = {
      id: _idCounter++,
      type: rawEvent.type,
      category,
      text,
      timestamp: clock
        ? { hour: clock.hour, minute: clock.minute, meridiem: clock.meridiem }
        : null,
    }
    entries.push(entry)
    let purged = 0
    if (entries.length > maxEntries) {
      purged = entries.length - maxEntries
      entries.splice(0, purged)
    }
    for (const fn of subscribers) fn(entry, purged)
  }

  // returns an unsubscribe function
  function subscribe(fn) {
    subscribers.push(fn)
    return () => {
      const i = subscribers.indexOf(fn)
      if (i !== -1) subscribers.splice(i, 1)
    }
  }

  // empties the log and notifies subscribers with a null entry to trigger full rebuild
  function clear() {
    entries.length = 0
    for (const fn of subscribers) fn(null, 0)
  }

  return { entries, push, subscribe, clear }
}
