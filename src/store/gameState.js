import { nanoid } from 'nanoid'

export function createDefaultCharacter() {
  return {
    name: '',
    sex: 'male',
    age: 18,
    archetype: 'the-hero',
    personality: { openness: 3, neuroticism: 3, conscientiousness: 3, agreeableness: 3, extraversion: 3 },
    attributes: { str: 10, con: 10, dex: 10, wis: 10, int: 10, cha: 10 },
  }
}

function createDefaultMeta() {
  return {
    filmTitle: '',
    filmType: 'slasher',
    releaseYear: 1984,
    mpaaRating: 'R',
    castSize: 6,
    location: 'manor',
    season: 'spring',
    startingWeather: 'clear',
    startingHour: 8,
    startingMeridiem: 'pm',
    killerName: '',
  }
}

export const state = {
  id: nanoid(),
  meta: createDefaultMeta(),
  cast: [],
  map: null,
  mapSeed: null,
}

export function resetGameState() {
  state.id = nanoid()
  state.meta = createDefaultMeta()
  state.cast = []
  state.map = null
  state.mapSeed = null
  return state
}

export function patchGameState(nextState) {
  if (nextState.meta) {
    state.meta = {
      ...state.meta,
      ...nextState.meta,
    }
  }

  Object.keys(nextState)
    .filter((key) => key !== 'meta')
    .forEach((key) => {
      state[key] = nextState[key]
    })

  return state
}