// ordered thresholds defining relationship label bands — -100 to 100
export const RELATIONSHIP_THRESHOLDS = [
  { min: -100, max: -75, label: 'Rivals' },
  { min:  -75, max: -50, label: 'Distrusted' },
  { min:  -50, max: -25, label: 'Disliked' },
  { min:  -25, max:   0, label: 'Unsure' },
  { min:    0, max:  25, label: 'Acquaintances' },
  { min:   25, max:  50, label: 'Friends' },
  { min:   50, max:  75, label: 'Good Friends' },
  { min:   75, max: 100, label: 'Best Friends' },
]

// maps a -100..100 value to the matching label string
export function getRelationshipLabel(value) {
  const clamped = Math.max(-100, Math.min(100, value))
  for (const band of RELATIONSHIP_THRESHOLDS) {
    if (clamped >= band.min && clamped < band.max) return band.label
  }
  // exactly 100 falls through the loop — return the top label
  return RELATIONSHIP_THRESHOLDS[RELATIONSHIP_THRESHOLDS.length - 1].label
}

// canonical key so (a, b) and (b, a) always produce the same string
export function getRelationshipKey(castIndexA, castIndexB) {
  const lo = Math.min(castIndexA, castIndexB)
  const hi = Math.max(castIndexA, castIndexB)
  return `${lo}:${hi}`
}

// read the current relationship value between two cast members — defaults to 0 (lazy init)
export function getRelationship(relationships, castIndexA, castIndexB) {
  return relationships[getRelationshipKey(castIndexA, castIndexB)] ?? 0
}

// apply a delta to the relationship between two cast members and return a change descriptor
export function deltaRelationship(relationships, castIndexA, castIndexB, delta) {
  const key = getRelationshipKey(castIndexA, castIndexB)
  const current = relationships[key] ?? 0
  const prevLabel = getRelationshipLabel(current)
  const newValue = Math.max(-100, Math.min(100, current + delta))
  relationships[key] = newValue
  const newLabel = getRelationshipLabel(newValue)
  return {
    newValue,
    prevLabel,
    newLabel,
    labelChanged: newLabel !== prevLabel,
  }
}

// pick a topic for a speaker based on their archetype preferences.
// speaker chooses from liked categories 70% of the time, neutral 20%, disliked 10%.
// falls back to a fully random category if preferences are missing or categories are empty.
// returns { text, category }
export function pickTopicForSpeaker(speakerArchetype, categorizedTopics, preferences, speakerName, listenerName, rng) {
  const prefs = preferences[speakerArchetype] ?? { likes: [], dislikes: [] }
  const allCategories = Object.keys(categorizedTopics)

  if (allCategories.length === 0) {
    return { text: `${speakerName} talks to ${listenerName}`, category: null }
  }

  const neutral = allCategories.filter(
    (cat) => !prefs.likes.includes(cat) && !prefs.dislikes.includes(cat),
  )
  const liked = prefs.likes.filter((cat) => categorizedTopics[cat]?.length > 0)
  const disliked = prefs.dislikes.filter((cat) => categorizedTopics[cat]?.length > 0)

  let pool
  const roll = rng.floating({ min: 0, max: 1 })

  if (liked.length > 0 && roll < 0.70) {
    pool = liked
  } else if (neutral.length > 0 && roll < 0.90) {
    pool = neutral
  } else if (disliked.length > 0) {
    pool = disliked
  } else {
    // fallback — pick any available category
    pool = allCategories
  }

  const category = rng.pickone(pool)
  const lines = categorizedTopics[category] ?? []

  if (lines.length === 0) {
    return { text: `${speakerName} talks to ${listenerName}`, category }
  }

  const template = rng.pickone(lines)
  const text = template.replace(/\{A\}/g, speakerName).replace(/\{B\}/g, listenerName)

  return { text, category }
}

// compute the relationship delta when the listener hears a topic they may like or dislike.
// liked topic  → 65% small positive, 25% zero, 10% small negative
// disliked topic → 20% small positive, 35% zero, 45% small negative
// neutral topic  → 40% + or -, 30% zero, 30% opposite direction
// TODO: future hook — personality modifiers (e.g. narcissism amplifies negatives) can be injected here
export function resolveRelationshipDelta(topicCategory, listenerArchetype, preferences, rng) {
  if (topicCategory == null) return 0

  const prefs = preferences[listenerArchetype] ?? { likes: [], dislikes: [] }
  const isLiked    = prefs.likes.includes(topicCategory)
  const isDisliked = prefs.dislikes.includes(topicCategory)

  const roll = rng.floating({ min: 0, max: 1 })

  if (isLiked) {
    if (roll < 0.65) return rng.integer({ min: 1, max: 3 })
    if (roll < 0.90) return 0
    return -1
  }

  if (isDisliked) {
    if (roll < 0.20) return rng.integer({ min: 1, max: 2 })
    if (roll < 0.55) return 0
    return -rng.integer({ min: 1, max: 3 })
  }

  // neutral
  if (roll < 0.40) return rng.bool() ? rng.integer({ min: 1, max: 2 }) : -rng.integer({ min: 1, max: 2 })
  if (roll < 0.70) return 0
  return rng.bool() ? rng.integer({ min: 1, max: 2 }) : -rng.integer({ min: 1, max: 2 })
}
