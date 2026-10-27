// play.css @imports style.css so the main-site system always loads before the arcade layout.
import './play.css'
import { setupImageFallbacks, setupSiteMenu } from './site-menu'

// /play/ is a static arcade hub: every build opens on its own full-screen page.
setupSiteMenu()
setupImageFallbacks()
document.querySelector('#year')!.textContent = String(new Date().getFullYear())
