import { openDB } from 'idb'

const DB_NAME = 'slashim'
const DB_VERSION = 1
const GAMES_STORE = 'games'

let databasePromise = null

function getDatabase() {
  if (!databasePromise) {
    databasePromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(GAMES_STORE)) {
          database.createObjectStore(GAMES_STORE, { keyPath: 'id' })
        }
      },
    })
  }

  return databasePromise
}

export async function saveGame(game) {
  const database = await getDatabase()
  await database.put(GAMES_STORE, game)
}

export async function loadGame(id) {
  const database = await getDatabase()
  return database.get(GAMES_STORE, id)
}

export async function listGames() {
  const database = await getDatabase()
  return database.getAll(GAMES_STORE)
}