import { nanoid } from 'nanoid'

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
  }
}

export const state = {
  id: nanoid(),
  meta: createDefaultMeta(),
}

export function resetGameState() {
  state.id = nanoid()
  state.meta = createDefaultMeta()
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