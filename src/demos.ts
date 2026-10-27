import './style.css'
import './subpage.css'
import './demos.css'
import { setupSiteMenu } from './site-menu'

// /demos/ cards are generated at build time from public/demos/manifest.json
// (see scripts/demos.mjs). The header and footer are the main-site chrome.
setupSiteMenu()
document.querySelector('#year')!.textContent = String(new Date().getFullYear())
