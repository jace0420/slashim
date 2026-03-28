import './style.css'

import { registerScreen, showScreen } from './router'
import { mountMenu } from './screens/menu'
import { mountSetup } from './screens/setup'
import { mountSetupSetting } from './screens/setupSetting'
import { mountSetupCast } from './screens/setupCast'
import { mountSetupKiller } from './screens/setupKiller'
import { mountGame } from './screens/game'

registerScreen('menu', mountMenu)
registerScreen('setup', mountSetup)
registerScreen('setup-setting', mountSetupSetting)
registerScreen('setup-cast', mountSetupCast)
registerScreen('setup-killer', mountSetupKiller)
registerScreen('game', mountGame)

showScreen('menu')
