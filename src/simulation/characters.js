import Chance from 'chance'
import { Tile } from '../generation/tileTypes.js'
import {
  deltaRelationship,
  getRelationship,
  getRelationshipLabel,
  pickTopicForSpeaker,
  resolveRelationshipDelta,
} from './social.js'
import {
  buildOccupiedSet,
  buildReservedRestSlotSet,
  countOpenNeighbors,
  findPath,
  findRoomAt,
  getOpenNeighborTiles,
  getRestTargets,
  getRoomLabel,
  pickRoomTile,
  pickTileNearCharacter,
} from './worldQueries.js'

// 12 distinct high-contrast colors that read well on a dark background.
// order matters — first N get assigned to the cast, so front-load the most readable ones.
const CHARACTER_PALETTE = [
  0x55ff55, // green
  0x5599ff, // blue
  0xff5555, // red
  0xffff55, // yellow
  0xff55ff, // magenta
  0x55ffff, // cyan
  0xff8844, // orange
  0xaa77ff, // purple
  0x88ddaa, // mint
  0xffaacc, // pink
  0xdddd88, // khaki
  0xaaccff, // light blue
]

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]]

// --- needs system ---

// ordered labels for the health state — driven by injuries and status effects.
// currently only 'FINE' is ever assigned; the rest are placeholders for future injury mechanics.
export const HEALTH_STATES = ['FINE', 'HURT', 'INJURED', 'HEAVILY_INJURED', 'NEAR_DEATH']

// ordered labels for mood, mapped from the average normalized goodness score across all needs.
export const MOOD_LABELS = ['TERRIBLE', 'BAD', 'OKAY', 'GOOD', 'GREAT']

// social motive tiers driven by the social need value (0-100).
// characters whose social drops lower become increasingly driven to seek conversation.
export const SOCIAL_MOTIVE_LABELS = ['CONTENT', 'SOCIAL', 'LONELY', 'ISOLATED']

// thresholds: social value ABOVE this → corresponding motive
// CONTENT: ≥ 75 | SOCIAL: ≥ 50 | LONELY: ≥ 25 | ISOLATED: < 25
const SOCIAL_THRESHOLDS = { CONTENT: 75, SOCIAL: 50, LONELY: 25 }

// base social decay per minute at extraversion 3 (neutral). scaled per character by extraversion.
const BASE_SOCIAL_DECAY = -0.10

// baseline need values for a character who just arrived at a late-night event.
// depleting stats (100 = full, 0 = empty): energy, stamina, hunger, thirst, social, sanity
// accumulating stats (0 = fine, 100 = maxed out): boredom, fear, adrenaline
const NEEDS_DEFAULTS = {
  energy:     80,
  stamina:    100,
  hunger:     70,
  thirst:     65,
  social:     80,
  sanity:     95,
  boredom:    20,
  fear:        5,
  adrenaline:  0,
}

export const CHARACTER_NEED_KEYS = Object.keys(NEEDS_DEFAULTS)

const ACCUMULATING_NEEDS = new Set(['boredom', 'fear', 'adrenaline'])

const NEED_PRESENTATION = {
  energy:     { label: 'Energy',     goodCue: 'Energized',  badCue: 'Tired' },
  stamina:    { label: 'Stamina',    goodCue: 'Rested',     badCue: 'Winded' },
  hunger:     { label: 'Hunger',     goodCue: 'Well-fed',   badCue: 'Hungry' },
  thirst:     { label: 'Thirst',     goodCue: 'Hydrated',   badCue: 'Thirsty' },
  social:     { label: 'Social',     goodCue: 'Connected',  badCue: 'Lonely' },
  sanity:     { label: 'Sanity',     goodCue: 'Grounded',   badCue: 'Unsettled' },
  boredom:    { label: 'Boredom',    goodCue: 'Engaged',    badCue: 'Bored' },
  fear:       { label: 'Fear',       goodCue: 'Calm',       badCue: 'Afraid' },
  adrenaline: { label: 'Adrenaline', goodCue: 'Relaxed',    badCue: 'Amped' },
}

// max ±variation applied to each default at spawn time so characters don't all start identical
const NEEDS_JITTER = 5

// per-tick passive decay — only fast-response stats tick every simulation step.
// negative = stat drains toward 0; positive = stat recovers toward 0 (for accumulators)
const TICK_DECAY = {
  fear:       -0.30, // fear fades quickly when nothing is happening
  adrenaline: -0.50, // adrenaline burns off fast once a threat passes
}

// per-minute passive decay — slow-moving survival stats.
// social is excluded here — it's computed per-character using extraversion scaling.
// sanity has no passive base decay — only event-driven changes (plus social isolation penalty).
const MINUTE_DECAY = {
  energy:  -0.15,
  stamina: +0.05, // baseline recovery is slight; real rest should matter more
  hunger:  -0.10,
  thirst:  -0.12,
  boredom: +0.20, // boredom builds when nothing interesting happens
  sanity:   0.00, // base is 0; social isolation adds a penalty on top
}

const ROOM_MEMORY_LIMIT = 4

const BEHAVIOR_LABELS = {
  wandering: 'Wandering',
  explore: 'Exploring',
  rest: 'Resting',
  social: 'Socializing',
  conversing: 'Conversing',
}

const BEHAVIOR_STAY_BONUS = 8
const BEHAVIOR_SWITCH_MARGIN = 12

const BEHAVIOR_MOVE_MULTIPLIERS = {
  wandering: 0.65,
  explore: 1.15,
  rest: 0.9,
  social: 1.0,
}

const SOFT_STUCK_TICKS = 4
const HARD_STUCK_TICKS = 9

// how many ticks a character can be chasing a social partner (moving phase) before giving up
const MAX_SOCIAL_APPROACH_TICKS = 28

// build a jittered needs object for a fresh character
function initNeeds(rng) {
  const needs = {}
  for (const [key, base] of Object.entries(NEEDS_DEFAULTS)) {
    const jitter = rng.integer({ min: -NEEDS_JITTER, max: NEEDS_JITTER })
    needs[key] = Math.max(0, Math.min(100, base + jitter))
  }
  return needs
}

// compute a 0–1 "goodness" score for a single stat.
// depleting stats: 1 when full, 0 when empty.
// accumulating stats: 1 when calm (0), 0 when maxed (100).
function statGoodness(key, value) {
  const accumulating = ACCUMULATING_NEEDS.has(key)
  return accumulating ? (100 - value) / 100 : value / 100
}

export function getNeedUrgency(key, value) {
  return ACCUMULATING_NEEDS.has(key) ? value : 100 - value
}

export function getNeedPresentation(key) {
  return NEED_PRESENTATION[key] ?? { label: key, goodCue: key, badCue: key }
}

export function getCharacterNeedSummaries(character) {
  return CHARACTER_NEED_KEYS
    .map((key) => {
      const value = Math.round(character.needs[key] ?? 0)
      const urgency = getNeedUrgency(key, value)
      const presentation = getNeedPresentation(key)
      return {
        key,
        value,
        urgency,
        label: presentation.label,
        cue: urgency > 50 ? presentation.badCue : presentation.goodCue,
        accumulating: ACCUMULATING_NEEDS.has(key),
      }
    })
    .sort((a, b) => b.urgency - a.urgency)
}

export function getTopNeedCues(character, limit = 2) {
  return getCharacterNeedSummaries(character)
    .slice(0, limit)
    .map((need) => need.cue)
}

// derive the HEALTH label from a character's current state.
// only 'FINE' is used until the injury system is implemented.
function deriveHealth(_character) {
  // TODO: factor in injury severity, bleeding, and status effects (not yet implemented)
  return 'FINE'
}

// derive the MOOD label from the average normalized goodness of all needs.
function deriveMood(character) {
  const keys = CHARACTER_NEED_KEYS
  const avg = keys.reduce((sum, k) => sum + statGoodness(k, character.needs[k]), 0) / keys.length
  // TODO: weight health state heavily — HURT or worse should drag mood toward TERRIBLE
  // TODO: fear > 70 or adrenaline > 70 should override mood to 'TERRIBLE' regardless of other stats
  const idx = Math.min(MOOD_LABELS.length - 1, Math.floor(avg * MOOD_LABELS.length))
  return MOOD_LABELS[idx]
}

// derive the social motive label from the current social need value.
function deriveSocialMotive(social) {
  if (social >= SOCIAL_THRESHOLDS.CONTENT) return 'CONTENT'
  if (social >= SOCIAL_THRESHOLDS.SOCIAL)  return 'SOCIAL'
  if (social >= SOCIAL_THRESHOLDS.LONELY)  return 'LONELY'
  return 'ISOLATED'
}

// write derived health, mood, and social motive back onto the character in place
function refreshDerivedStats(character) {
  character.health      = deriveHealth(character)
  character.mood        = deriveMood(character)
  character.socialMotive = deriveSocialMotive(character.needs.social)
}

// apply per-tick passive decay/recovery to fast-response needs (fear, adrenaline)
function tickCharacterNeeds(character) {
  const n = character.needs
  for (const [key, delta] of Object.entries(TICK_DECAY)) {
    n[key] = Math.max(0, Math.min(100, n[key] + delta))
  }
  // TODO: spike FEAR by 20–40 when character hears a scream or witnesses a corpse
  // TODO: spike ADRENALINE by 30–50 on taking damage or being actively chased
  // TODO: a FEAR spike should also raise ADRENALINE and lower SANITY proportionally
}

// --- social system helpers ---

// two characters can talk if they share a named room, or are both in hallways close enough to hear each other.
// room-to-hallway is blocked — the door separates them.
function canTalk(a, b) {
  if (a.roomIndex >= 0 && a.roomIndex === b.roomIndex) return true
  if (a.roomIndex === -1 && b.roomIndex === -1) {
    const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
    return dist <= 6
  }
  return false
}

// Chebyshev distance between two characters
function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

// fill a madlibs topic template with the speaker (A) and listener (B) names
function fillTopic(template, speakerName, listenerName) {
  return template.replace(/\{A\}/g, speakerName).replace(/\{B\}/g, listenerName)
}

// pick a random topic and fill it; returns the completed narrative string
function pickTalkLine(rng, topics, speakerName, listenerName) {
  const template = rng.pickone(topics)
  return fillTopic(template, speakerName, listenerName)
}

// apply per-minute passive decay to all slow-moving needs and fire social interactions.
// returns an array of events (same pattern as tickCharacters).
// cast is needed to read per-character extraversion for social decay scaling.
export function minuteTickCharacters(characters, cast = [], topics = [], currentMinute = 0, rng = null) {
  const events = []

  for (const c of characters) {
    const n          = c.needs
    const castEntry  = cast[c.castIndex]
    const extraversion = castEntry?.personality?.extraversion ?? 3

    // standard per-minute decay for all needs except social
    for (const [key, delta] of Object.entries(MINUTE_DECAY)) {
      n[key] = Math.max(0, Math.min(100, n[key] + delta))
    }

    // social decay scaled by extraversion — extroverts drain faster, introverts slower
    const socialDecay = BASE_SOCIAL_DECAY * (extraversion / 3)
    n.social = Math.max(0, Math.min(100, n.social + socialDecay))

    // sanity drain from social isolation
    if (n.social < 10) {
      n.sanity = Math.max(0, n.sanity - 0.30)
    } else if (n.social < 25) {
      n.sanity = Math.max(0, n.sanity - 0.15)
    }

    // TODO: drain STAMINA faster per-tick when the character is running (not yet implemented)
    // TODO: low ENERGY (<20) should reduce moveChance or trigger a "seek rest" behavior
    // TODO: HUNGER < 15 should push character toward any room containing food (to be implemented)
    // TODO: THIRST < 15 should push character toward any room containing drink (to be implemented)
    // TODO: BOREDOM > 80 should drive character toward social areas or other characters
    // TODO: high FEAR (>60) should trigger flee behavior once pathfinding is in place
    // TODO: SANITY < 15 should trigger a mental break event (system to be implemented)

    refreshDerivedStats(c)
  }

  return events
}

function ensureBehaviorState(character) {
  if (!character.behaviorCooldowns) {
    character.behaviorCooldowns = {
      socialUntilTick: 0,
      exploreUntilTick: 0,
    }
  }

  if (!Array.isArray(character.recentRooms)) {
    character.recentRooms = []
  }

  if (!character.behavior) {
    character.behavior = {
      key: 'wandering',
      phase: 'idle',
      startedTick: 0,
      lockUntilTick: 0,
      waitUntilTick: 0,
      score: 0,
      target: null,
      targetLabel: null,
      path: [],
      blockedTicks: 0,
      blockedByCastIndex: null,
      complete: true,
    }
  }
}

function pushRecentRoom(character, roomIndex) {
  if (roomIndex == null || roomIndex < 0) return
  character.recentRooms = [roomIndex, ...character.recentRooms.filter((value) => value !== roomIndex)]
    .slice(0, ROOM_MEMORY_LIMIT)
}

function makeBehaviorEvent(character, key, targetLabel) {
  return {
    type: 'behavior-changed',
    name: character.name,
    behavior: BEHAVIOR_LABELS[key] ?? key,
    targetLabel,
  }
}

function getBehaviorSummary(character) {
  const phase = character.behavior?.phase
  if (phase === 'conversing') return BEHAVIOR_LABELS.conversing
  const key = character.behavior?.key ?? 'wandering'
  return BEHAVIOR_LABELS[key] ?? key
}

function clampNeed(key, delta, character) {
  character.needs[key] = Math.max(0, Math.min(100, character.needs[key] + delta))
}

function getWaitRange(rng, min, max) {
  return rng.integer({ min, max })
}

function getCurrentRoom(mapData, character) {
  return character.roomIndex >= 0 ? mapData.rooms[character.roomIndex] ?? null : null
}

function chooseWanderTarget(character, mapData, occupied, rng) {
  const room = getCurrentRoom(mapData, character)
  if (!room) return { x: character.x, y: character.y, roomIndex: character.roomIndex, label: 'Hallway' }

  const target = pickRoomTile(room, mapData, occupied, rng, { preferInterior: true })
  if (!target) return null
  return {
    ...target,
    roomIndex: character.roomIndex,
    label: getRoomLabel(mapData, character.roomIndex),
  }
}

function chooseExploreTarget(character, mapData, occupied, rng) {
  const candidates = mapData.rooms
    .map((room, index) => ({ room, index }))
    .filter(({ index }) => index !== character.roomIndex)
    .sort((a, b) => {
      const aSeen = character.recentRooms.includes(a.index) ? 1 : 0
      const bSeen = character.recentRooms.includes(b.index) ? 1 : 0
      return aSeen - bSeen
    })

  for (const { room, index } of candidates) {
    const target = pickRoomTile(room, mapData, occupied, rng, { preferInterior: true })
    if (!target) continue
    return {
      ...target,
      roomIndex: index,
      label: getRoomLabel(mapData, index),
    }
  }

  return null
}

function chooseFloorRestTarget(character, mapData, occupied, rng) {
  const preferredRooms = mapData.rooms
    .map((room, index) => ({ room, index }))
    .sort((a, b) => {
      const aWeight = a.index === character.roomIndex ? -2 : 0
      const bWeight = b.index === character.roomIndex ? -2 : 0
      const aBedroom = a.room.def?.type === 'bedroom' ? -1 : 0
      const bBedroom = b.room.def?.type === 'bedroom' ? -1 : 0
      return (aWeight + aBedroom) - (bWeight + bBedroom)
    })

  for (const { room, index } of preferredRooms) {
    const target = pickRoomTile(room, mapData, occupied, rng, { preferInterior: true })
    if (!target) continue
    return {
      ...target,
      roomIndex: index,
      label: `${getRoomLabel(mapData, index)} floor`,
      comfort: 0.75,
      posture: 'floor',
      recoveryPerTick: 0.22,
    }
  }

  return null
}

function chooseRestTarget(character, mapData, occupied, reservedSlotKeys, rng) {
  const restTargets = getRestTargets(mapData, occupied, reservedSlotKeys)
  let best = null
  let bestScore = -Infinity

  for (const target of restTargets) {
    const path = findPath(mapData, character, target, occupied)
    if (!path) continue
    const roomWeight = mapData.rooms[target.roomIndex]?.def?.type === 'bedroom' ? 6 : 0
    const score = target.comfort * 24 + roomWeight - path.length * 1.8
    if (score > bestScore) {
      bestScore = score
      best = { ...target, path }
    }
  }

  if (best) return best

  const floorTarget = chooseFloorRestTarget(character, mapData, occupied, rng)
  if (!floorTarget) return null

  return {
    ...floorTarget,
    path: findPath(mapData, character, floorTarget, occupied) ?? [],
  }
}

function chooseSocialPartner(character, characters) {
  const candidates = characters.filter((other) => {
    if (other === character) return false
    if (other.behavior?.key === 'rest') return false
    if (other.behavior?.phase === 'conversing') return false
    return true
  })

  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    const socialNeedDiff = a.needs.social - b.needs.social
    if (socialNeedDiff !== 0) return socialNeedDiff
    return Math.abs(a.x - character.x) + Math.abs(a.y - character.y)
      - (Math.abs(b.x - character.x) + Math.abs(b.y - character.y))
  })

  return candidates[0]
}

function shouldKeepBehavior(character, best, currentScore, tickIndex) {
  if (!best) return false
  if (best.key === character.behavior.key) return true
  if (tickIndex < character.behavior.lockUntilTick && character.needs.stamina > 20) return true
  return best.score <= currentScore + BEHAVIOR_SWITCH_MARGIN
}

function scoreBehaviors(character, characters, mapData, tickIndex) {
  const boredom = character.needs.boredom
  const lowStamina = 100 - character.needs.stamina
  const lowSocial = 100 - character.needs.social

  const scores = {
    wandering: 18 + Math.max(0, 30 - boredom * 0.2),
    explore: mapData.rooms.length > 1 ? boredom * 0.92 + character.recentRooms.length * 1.5 : -Infinity,
    rest: lowStamina * 1.45 + (100 - character.needs.energy) * 0.45,
    social: characters.length > 1 ? lowSocial * 1.25 + boredom * 0.35 : -Infinity,
  }

  if (tickIndex < character.behaviorCooldowns.socialUntilTick) {
    scores.social = -Infinity
  }

  if (tickIndex < character.behaviorCooldowns.exploreUntilTick) {
    scores.explore -= 14
  }

  if (character.behavior?.key) {
    scores[character.behavior.key] = (scores[character.behavior.key] ?? 0) + BEHAVIOR_STAY_BONUS
  }

  return scores
}

function moveCharacter(character, dest, mapData, asciiGrid, occupied, events) {
  const prevChar = mapData.chars[character.y][character.x]
  const prevColor = mapData.colors[character.y][character.x]
  const prevBg = mapData.bgs?.[character.y]?.[character.x]
  asciiGrid.updateTile(character.x, character.y, prevChar, prevColor, prevBg)
  occupied.delete(`${character.x},${character.y}`)

  character.x = dest.x
  character.y = dest.y
  occupied.add(`${character.x},${character.y}`)

  const destBg = mapData.bgs?.[character.y]?.[character.x] ?? 0x000000
  asciiGrid.updateTile(character.x, character.y, character.glyph, character.color, destBg)

  const newRoom = findRoomAt(character.x, character.y, mapData.rooms)
  if (newRoom !== character.roomIndex) {
    if (newRoom !== -1) {
      events.push({ type: 'room-enter', name: character.name, room: getRoomLabel(mapData, newRoom) })
      pushRecentRoom(character, newRoom)
    }
    character.roomIndex = newRoom
  }
}

function isAtTarget(character) {
  const target = character.behavior?.target
  if (!target) return true
  if (target.x == null || target.y == null) return true
  return character.x === target.x && character.y === target.y
}

function clearBlockedState(character) {
  character.behavior.blockedTicks = 0
  character.behavior.blockedByCastIndex = null
}

function rebuildPathToCurrentTarget(character, context) {
  if (!character.behavior?.target) return false
  if (isAtTarget(character)) return true

  const path = findPath(context.mapData, character, character.behavior.target, context.occupied) ?? []
  character.behavior.path = path
  return path.length > 0
}

function isReciprocalBlock(character, blocker) {
  const blockerNext = blocker?.behavior?.path?.[0]
  return blockerNext?.x === character.x && blockerNext?.y === character.y
}

function isRestrictedTile(mapData, tile, occupied, current, blocker) {
  const occupiedForShape = new Set(occupied)
  occupiedForShape.delete(`${current.x},${current.y}`)
  if (blocker) occupiedForShape.delete(`${blocker.x},${blocker.y}`)
  return countOpenNeighbors(mapData, tile.x, tile.y, occupiedForShape) <= 2
}

function chooseYieldTile(character, blocker, context) {
  const nextStep = character.behavior.path[0]
  const candidates = getOpenNeighborTiles(context.mapData, character.x, character.y, context.occupied)
    .filter((tile) => !(nextStep && tile.x === nextStep.x && tile.y === nextStep.y))

  if (candidates.length === 0) return null

  const blockerNext = blocker?.behavior?.path?.[0]
  const scored = candidates.map((tile) => {
    const branchiness = countOpenNeighbors(context.mapData, tile.x, tile.y, context.occupied)
    const roomBonus = findRoomAt(tile.x, tile.y, context.mapData.rooms) >= 0 ? 2 : 0
    const blockerPenalty = blockerNext && tile.x === blockerNext.x && tile.y === blockerNext.y ? 6 : 0
    const retreatBias = blocker ? Math.abs(tile.x - blocker.x) + Math.abs(tile.y - blocker.y) : 0
    return {
      tile,
      score: branchiness * 5 + roomBonus + retreatBias - blockerPenalty,
    }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.tile ?? null
}

function shouldYield(character, blocker, context) {
  if (!blocker) return false
  if (!isReciprocalBlock(character, blocker)) return false
  const restricted = isRestrictedTile(context.mapData, character, context.occupied, character, blocker)
    && isRestrictedTile(context.mapData, blocker, context.occupied, character, blocker)
  if (!restricted) return false

  const characterPriority = (character.behavior.target?.comfort ?? 0) + character.behavior.score
  const blockerPriority = (blocker.behavior?.target?.comfort ?? 0) + (blocker.behavior?.score ?? 0)
  if (characterPriority !== blockerPriority) return characterPriority < blockerPriority
  return character.castIndex > blocker.castIndex
}

function applyBlockedFallback(character, context) {
  if (character.behavior.key === 'explore') {
    character.behaviorCooldowns.exploreUntilTick = context.tickIndex + 24
  }

  if (character.behavior.key === 'social') {
    character.behaviorCooldowns.socialUntilTick = context.tickIndex + 18
  }

  character.behavior.complete = true
  character.behavior.path = []
  character.behavior.target = null
  character.behavior.targetLabel = null
  clearBlockedState(character)
}

function resolveBlockedMovement(character, blocker, context) {
  const canYield = character.behavior.blockedTicks >= SOFT_STUCK_TICKS && shouldYield(character, blocker, context)
  if (canYield) {
    const yieldTile = chooseYieldTile(character, blocker, context)
    if (yieldTile) {
      character.behavior.phase = 'yielding'
      character.behavior.path = [yieldTile]
      character.behavior.blockedTicks = 0
      character.behavior.blockedByCastIndex = null
      return
    }
  }

  if (character.behavior.blockedTicks >= SOFT_STUCK_TICKS) {
    const rebuilt = rebuildPathToCurrentTarget(character, context)
    if (rebuilt) {
      character.behavior.phase = 'moving'
      character.behavior.blockedTicks = Math.max(0, character.behavior.blockedTicks - 2)
      character.behavior.blockedByCastIndex = blocker?.castIndex ?? null
      return
    }
  }

  if (character.behavior.blockedTicks >= HARD_STUCK_TICKS) {
    applyBlockedFallback(character, context)
  }
}

function stepAlongPath(character, context) {
  const { occupied, mapData, asciiGrid, events, moveChance, rng } = context
  if (!character.behavior.path || character.behavior.path.length === 0) return true

  const moveRoll = rng.floating({ min: 0, max: 1 })
  const moveBudget = Math.min(1, moveChance * (BEHAVIOR_MOVE_MULTIPLIERS[character.behavior.key] ?? 1))
  if (moveRoll > moveBudget) return false

  const nextStep = character.behavior.path[0]
  const blocker = context.characters.find((candidate) => candidate.x === nextStep.x && candidate.y === nextStep.y) ?? null
  if (blocker) {
    character.behavior.blockedTicks += 1
    character.behavior.blockedByCastIndex = blocker.castIndex
    resolveBlockedMovement(character, blocker, context)
    return false
  }

  moveCharacter(character, nextStep, mapData, asciiGrid, occupied, events)
  character.behavior.path.shift()
  clearBlockedState(character)
  return character.behavior.path.length === 0
}

function setBehavior(character, key, tickIndex, target = null, score = 0) {
  character.behavior = {
    key,
    phase: 'moving',
    startedTick: tickIndex,
    lockUntilTick: tickIndex + 6,
    waitUntilTick: tickIndex,
    score,
    target,
    targetLabel: target?.label ?? null,
    path: target?.path ? [...target.path] : [],
    blockedTicks: 0,
    blockedByCastIndex: null,
    complete: false,
  }
}

function enterBehavior(character, key, context, score) {
  const { mapData, occupied, reservedSlotKeys, rng, characters, tickIndex } = context

  if (key === 'wandering') {
    const target = chooseWanderTarget(character, mapData, occupied, rng)
    setBehavior(character, key, tickIndex, {
      ...target,
      path: target ? findPath(mapData, character, target, occupied) ?? [] : [],
    }, score)
    character.behavior.waitUntilTick = tickIndex + getWaitRange(rng, 8, 24)
  } else if (key === 'explore') {
    const target = chooseExploreTarget(character, mapData, occupied, rng)
    if (!target) return enterBehavior(character, 'wandering', context, score)
    setBehavior(character, key, tickIndex, {
      ...target,
      path: findPath(mapData, character, target, occupied) ?? [],
    }, score)
    character.behavior.waitUntilTick = tickIndex + getWaitRange(rng, 4, 10)
    character.behaviorCooldowns.exploreUntilTick = tickIndex + 18
  } else if (key === 'rest') {
    const target = chooseRestTarget(character, mapData, occupied, reservedSlotKeys, rng)
    if (!target) return enterBehavior(character, 'wandering', context, score)
    setBehavior(character, key, tickIndex, target, score)
    character.behavior.phase = character.behavior.path.length > 0 ? 'moving' : 'resting'
    character.behavior.waitUntilTick = tickIndex + getWaitRange(rng, 14, 32)
  } else if (key === 'social') {
    const partner = chooseSocialPartner(character, characters)
    if (!partner) return enterBehavior(character, 'wandering', context, score)
    const nearTile = pickTileNearCharacter(partner, mapData, occupied, rng, 2)
    const target = {
      type: 'social',
      partnerCastIndex: partner.castIndex,
      label: partner.name,
      path: nearTile ? (findPath(mapData, character, nearTile, occupied) ?? []) : [],
      x: nearTile?.x ?? character.x,
      y: nearTile?.y ?? character.y,
    }
    setBehavior(character, key, tickIndex, target, score)
    character.behavior.waitUntilTick = tickIndex + getWaitRange(rng, 10, 22)
  }
}

function maybeChooseBehavior(character, context) {
  const scores = scoreBehaviors(character, context.characters, context.mapData, context.tickIndex)
  const currentScore = scores[character.behavior.key] ?? -Infinity
  const best = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([key, score]) => ({ key, score }))
    [0]

  if (shouldKeepBehavior(character, best, currentScore, context.tickIndex) && !character.behavior.complete) {
    return null
  }

  enterBehavior(character, best.key, context, best.score)
  return makeBehaviorEvent(character, best.key, character.behavior.targetLabel)
}

// pick an opening topic, set up the conversation object on both parties, emit the begin event
function beginConversation(character, partner, context) {
  const { rng, topics, beats, cast, tickIndex, events, archetypePreferences } = context
  const castEntry = cast[character.castIndex]
  const extraversion = castEntry?.personality?.extraversion ?? 3
  const duration = Math.round(rng.integer({ min: 30, max: 65 }) * (extraversion / 3))
  const beatInterval = rng.integer({ min: 15, max: 25 })

  const hasCategorizedTopics = topics && typeof topics === 'object' && !Array.isArray(topics) && topics.categories
  let openingTopic, openingCategory

  if (hasCategorizedTopics) {
    const result = pickTopicForSpeaker(castEntry?.archetype, topics.categories, archetypePreferences, character.name, partner.name, rng)
    openingTopic = result.text
    openingCategory = result.category
  } else {
    const pool = Array.isArray(topics) && topics.length > 0 ? topics : null
    openingTopic = pool ? pickTalkLine(rng, pool, character.name, partner.name) : `${character.name} talks to ${partner.name}`
    openingCategory = null
  }

  const conversationObj = {
    partnerCastIndex: partner.castIndex,
    startedTick: tickIndex,
    currentTopic: openingTopic,
    currentTopicCategory: openingCategory,
    lastBeatTick: tickIndex,
    beatInterval,
    beatCount: 0,
  }

  character.conversation = conversationObj
  character.behavior.phase = 'conversing'
  character.behavior.waitUntilTick = tickIndex + duration
  character.behavior.targetLabel = partner.name
  character.behavior.target = {
    type: 'social',
    partnerCastIndex: partner.castIndex,
    label: partner.name,
  }

  if (partner.behavior?.key !== 'rest') {
    partner.conversation = {
      ...conversationObj,
      partnerCastIndex: character.castIndex,
    }
    partner.behavior = {
      key: 'social',
      phase: 'conversing',
      startedTick: tickIndex,
      lockUntilTick: tickIndex + duration,
      waitUntilTick: tickIndex + duration,
      score: character.behavior.score,
      target: { type: 'social', partnerCastIndex: character.castIndex, label: character.name },
      targetLabel: character.name,
      path: [],
      complete: false,
    }
  }

  events.push({ type: 'social-begin', text: openingTopic })
}

function tickWandering(character, context) {
  if (character.behavior.path.length === 0 && !isAtTarget(character)) {
    rebuildPathToCurrentTarget(character, context)
  }

  if (character.behavior.path.length > 0) {
    stepAlongPath(character, context)
    return
  }

  character.behavior.phase = 'idle'
  if (context.tickIndex >= character.behavior.waitUntilTick) {
    character.behavior.complete = true
  }
}

function tickExplore(character, context) {
  if (character.behavior.path.length === 0 && !isAtTarget(character)) {
    rebuildPathToCurrentTarget(character, context)
  }

  if (character.behavior.path.length > 0) {
    stepAlongPath(character, context)
    return
  }

  character.behavior.phase = 'idle'
  if (context.tickIndex >= character.behavior.waitUntilTick) {
    character.behavior.complete = true
  }
}

function tickRest(character, context) {
  if (character.behavior.phase === 'yielding' && character.behavior.path.length === 0 && !isAtTarget(character)) {
    character.behavior.phase = 'moving'
    rebuildPathToCurrentTarget(character, context)
  }

  if (character.behavior.phase === 'moving' && character.behavior.path.length === 0 && !isAtTarget(character)) {
    rebuildPathToCurrentTarget(character, context)
  }

  if (character.behavior.phase === 'moving' && character.behavior.path.length > 0) {
    const arrived = stepAlongPath(character, context)
    if (arrived) character.behavior.phase = 'resting'
    return
  }

  character.behavior.phase = 'resting'
  clampNeed('stamina', character.behavior.target?.recoveryPerTick ?? 0.22, character)
  clampNeed('energy', 0.04, character)
  clampNeed('boredom', -0.08, character)

  if (character.needs.stamina >= 92 && context.tickIndex >= character.behavior.waitUntilTick) {
    character.behavior.complete = true
  }
}

function endConversation(character, partner) {
  character.conversation = null
  character.behavior.complete = true
  if (partner && partner.behavior?.phase === 'conversing') {
    partner.conversation = null
    partner.behavior.complete = true
  }
}

function tickSocial(character, context) {
  const { tickIndex, rng, topics, beats, events, characters, cast, relationships, archetypePreferences } = context
  const partner = characters.find((candidate) => candidate.castIndex === character.behavior.target?.partnerCastIndex)

  if (!partner) {
    character.conversation = null
    character.behavior.complete = true
    return
  }

  if (character.behavior.phase === 'conversing') {
    // passive needs recovery while talking
    clampNeed('social', 0.38, character)
    clampNeed('boredom', -0.16, character)
    clampNeed('sanity', 0.03, character)

    // partner drifted out of range — interrupted
    if (!canTalk(character, partner) || chebyshev(character, partner) > 6) {
      endConversation(character, partner)
      return
    }

    // partner is no longer pointing back at this character — interrupted
    const partnerStillHere = partner.behavior?.phase === 'conversing'
      && partner.behavior?.target?.partnerCastIndex === character.castIndex
    if (!partnerStillHere) {
      endConversation(character, partner)
      return
    }

    // satisfied early-exit: social is full enough and lock has expired
    const lockExpired = tickIndex >= character.behavior.lockUntilTick + 15
    if (character.needs.social >= 88 && lockExpired) {
      endConversation(character, partner)
      character.behaviorCooldowns.socialUntilTick = tickIndex + 18
      return
    }

    // natural time limit
    if (tickIndex >= character.behavior.waitUntilTick) {
      endConversation(character, partner)
      character.behaviorCooldowns.socialUntilTick = tickIndex + 18
      return
    }

    // beat: emit a new topic or flavor line every beatInterval ticks
    const conv = character.conversation
    if (conv && tickIndex - conv.lastBeatTick >= conv.beatInterval) {
      const hasCategorizedTopics = topics && typeof topics === 'object' && !Array.isArray(topics) && topics.categories
      const useFlavorBeat = beats.length > 0 && rng.bool({ likelihood: 40 })

      if (useFlavorBeat) {
        // flavor beats: no relationship effect
        const beatText = pickTalkLine(rng, beats, character.name, partner.name)
        conv.currentTopic = beatText
        conv.currentTopicCategory = null
        conv.lastBeatTick = tickIndex
        conv.beatCount += 1
        conv.beatInterval = rng.integer({ min: 15, max: 25 })
        if (partner.conversation) {
          partner.conversation.currentTopic = beatText
          partner.conversation.currentTopicCategory = null
          partner.conversation.lastBeatTick = tickIndex
          partner.conversation.beatCount = conv.beatCount
          partner.conversation.beatInterval = conv.beatInterval
        }
        events.push({ type: 'social-topic-beat', text: beatText })
      } else if (hasCategorizedTopics) {
        // categorized topic beat: resolve relationship delta for both parties
        const speakerCast = cast[character.castIndex]
        const listenerCast = cast[partner.castIndex]
        const speakerArchetype = speakerCast?.archetype
        const listenerArchetype = listenerCast?.archetype
        const { text: beatText, category: beatCategory } = pickTopicForSpeaker(speakerArchetype, topics.categories, archetypePreferences, character.name, partner.name, rng)
        conv.currentTopic = beatText
        conv.currentTopicCategory = beatCategory
        conv.lastBeatTick = tickIndex
        conv.beatCount += 1
        conv.beatInterval = rng.integer({ min: 15, max: 25 })
        if (partner.conversation) {
          partner.conversation.currentTopic = beatText
          partner.conversation.currentTopicCategory = beatCategory
          partner.conversation.lastBeatTick = tickIndex
          partner.conversation.beatCount = conv.beatCount
          partner.conversation.beatInterval = conv.beatInterval
        }
        events.push({ type: 'social-topic-beat', text: beatText })

        // relationship delta: listener reacts to the topic category
        const delta = resolveRelationshipDelta(beatCategory, listenerArchetype, archetypePreferences, rng)
        if (delta !== 0) {
          const change = deltaRelationship(relationships, character.castIndex, partner.castIndex, delta)
          if (change.labelChanged) {
            events.push({
              type: 'social-relationship-changed',
              nameA: character.name,
              nameB: partner.name,
              label: change.newLabel,
              direction: delta > 0 ? 'positive' : 'negative',
            })
          }
        }
      } else if (Array.isArray(topics) && topics.length > 0) {
        // plain array fallback: no relationship effect
        const beatText = pickTalkLine(rng, topics, character.name, partner.name)
        conv.currentTopic = beatText
        conv.currentTopicCategory = null
        conv.lastBeatTick = tickIndex
        conv.beatCount += 1
        conv.beatInterval = rng.integer({ min: 15, max: 25 })
        if (partner.conversation) {
          partner.conversation.currentTopic = beatText
          partner.conversation.currentTopicCategory = null
          partner.conversation.lastBeatTick = tickIndex
          partner.conversation.beatCount = conv.beatCount
          partner.conversation.beatInterval = conv.beatInterval
        }
        events.push({ type: 'social-topic-beat', text: beatText })
      }
    }
    return
  }

  if (canTalk(character, partner) && chebyshev(character, partner) <= 2) {
    beginConversation(character, partner, context)
    return
  }

  if (character.behavior.phase === 'yielding' && character.behavior.path.length === 0) {
    character.behavior.phase = 'moving'
  }

  // hard timeout — if we've been chasing the partner for too long without a conversation starting,
  // give up with a longer cooldown so the character doesn't spin forever on the same target
  if (tickIndex - character.behavior.startedTick > MAX_SOCIAL_APPROACH_TICKS) {
    character.behaviorCooldowns.socialUntilTick = tickIndex + 32
    character.behavior.complete = true
    return
  }

  if (tickIndex % 4 === 0 || character.behavior.path.length === 0) {
    // try close radius first; widen if the nearby tiles are all packed
    let retarget = pickTileNearCharacter(partner, context.mapData, context.occupied, rng, 2)
    if (!retarget) retarget = pickTileNearCharacter(partner, context.mapData, context.occupied, rng, 5)

    if (retarget) {
      character.behavior.path = findPath(context.mapData, character, retarget, context.occupied) ?? []
    } else if (canTalk(character, partner) && chebyshev(character, partner) <= 5) {
      // all tiles near partner are blocked but they're in the same room and close enough —
      // start the conversation from wherever we are rather than staying stuck forever
      beginConversation(character, partner, context)
      return
    }
  }

  if (character.behavior.path.length > 0) {
    stepAlongPath(character, context)
    return
  }

  // no path — apply a short cooldown before completing so we don't immediately re-enter
  // social behavior targeting the same unreachable partner next tick
  character.behaviorCooldowns.socialUntilTick = tickIndex + 18
  character.behavior.complete = true
}

function tickBehavior(character, context) {
  if (character.behavior.key === 'wandering') tickWandering(character, context)
  else if (character.behavior.key === 'explore') tickExplore(character, context)
  else if (character.behavior.key === 'rest') tickRest(character, context)
  else if (character.behavior.key === 'social') tickSocial(character, context)
}

// spawn all cast members onto the map with unique colors and positions.
// each character gets a random room and a random floor tile within it.
export function initCharacters(cast, mapData, seed) {
  const rng = new Chance(seed + '-characters')
  const characters = []
  const occupied = new Set()

  // shuffle room indices so characters spread across different rooms
  const roomIndices = mapData.rooms.map((_, i) => i)
  rng.shuffle(roomIndices)

  for (let i = 0; i < cast.length; i++) {
    const color = CHARACTER_PALETTE[i % CHARACTER_PALETTE.length]

    // try the next room in the shuffled list, wrapping if more cast than rooms
    const roomIndex = roomIndices[i % roomIndices.length]
    const room = mapData.rooms[roomIndex]

    const pos = pickRoomTile(room, mapData, occupied, rng, { preferInterior: true })
    if (!pos) {
      // shouldn't happen unless rooms are tiny and packed — skip this character
      console.warn(`[characters] couldn't place ${cast[i].name} in room ${roomIndex}`)
      continue
    }

    occupied.add(`${pos.x},${pos.y}`)

    const needs = initNeeds(rng)
    const character = {
      castIndex: i,
      name: cast[i].name,
      x: pos.x,
      y: pos.y,
      color,
      glyph: '@',
      roomIndex,
      needs,
      health: 'FINE',
      mood: deriveMood({ needs }),
      socialMotive: deriveSocialMotive(needs.social),
      behavior: null,
      behaviorCooldowns: null,
      recentRooms: [roomIndex],
      lastSocialMinute: -1,
    }
    ensureBehaviorState(character)
    characters.push(character)
  }

  return characters
}

// render all characters onto the ascii grid
export function renderCharacters(characters, asciiGrid, mapData) {
  for (const c of characters) {
    const bg = mapData?.bgs?.[c.y]?.[c.x] ?? 0x000000
    asciiGrid.updateTile(c.x, c.y, c.glyph, c.color, bg)
  }
}

// process one simulation tick — each character may move one tile.
// returns an array of narrative events that happened this tick.
export function tickCharacters(characters, mapData, asciiGrid, rng, moveChance, tickIndex = 0, topics = [], beats = [], cast = [], relationships = {}, archetypePreferences = {}) {
  const events = []
  const occupied = buildOccupiedSet(characters)

  for (const c of characters) {
    // apply per-tick need decay (fear, adrenaline) regardless of movement
    tickCharacterNeeds(c)
    ensureBehaviorState(c)

    const context = {
      tickIndex,
      topics,
      beats,
      cast,
      characters,
      mapData,
      asciiGrid,
      rng,
      moveChance,
      occupied,
      events,
      relationships,
      archetypePreferences,
      reservedSlotKeys: buildReservedRestSlotSet(characters, c.castIndex),
    }

    const behaviorEvent = maybeChooseBehavior(c, context)
    if (behaviorEvent) events.push(behaviorEvent)

    tickBehavior(c, context)
    refreshDerivedStats(c)
  }

  return events
}

export function getCharacterBehaviorSummary(character) {
  return getBehaviorSummary(character)
}

export function getCharacterBehaviorTarget(character) {
  return character.behavior?.targetLabel ?? null
}

export function getCharacterConversationTopic(character) {
  return character.conversation?.currentTopic ?? null
}
