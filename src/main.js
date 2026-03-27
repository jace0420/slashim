import './style.css'

import { registerScreen, showScreen } from './router'
import { mountMenu } from './screens/menu'
import { mountSetup } from './screens/setup'
import { mountSetupSetting } from './screens/setupSetting'
import { initBloodSplatter } from './ui/bloodSplatter'

initBloodSplatter()

registerScreen('menu', mountMenu)
registerScreen('setup', mountSetup)
registerScreen('setup-setting', mountSetupSetting)

showScreen('menu')
