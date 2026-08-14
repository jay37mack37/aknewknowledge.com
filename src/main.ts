import './style.css'

const icon = (name: 'arrow' | 'book' | 'code' | 'headphones' | 'mail' | 'menu' | 'close') => {
  const paths = {
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13Z"/><path d="M8 7h8M8 11h6"/>',
    code: '<path d="m8 9-3 3 3 3m8-6 3 3-3 3m-3-9-2 12"/>',
    headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M18 19h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3v4a3 3 0 0 1-3 3ZM6 19H5a3 3 0 0 1-3-3v-4h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2Z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
  }

  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`
}

const discordIcon = () => `
  <svg class="discord-logo" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.51 13.7 13.7 0 0 0-.63 1.29 18.4 18.4 0 0 0-5.58 0 12.6 12.6 0 0 0-.64-1.29 20 20 0 0 0-4.9 1.52C.59 9.09-.36 13.67.07 18.18a19.9 19.9 0 0 0 6 3.03 14.7 14.7 0 0 0 1.29-2.1 13 13 0 0 1-2.03-.97l.5-.39a14.3 14.3 0 0 0 12.35 0l.5.39c-.65.38-1.33.7-2.03.96.37.74.8 1.45 1.29 2.11a19.8 19.8 0 0 0 6-3.03c.5-5.23-.85-9.77-3.62-13.81ZM8.02 15.4c-1.2 0-2.18-1.1-2.18-2.45s.96-2.46 2.18-2.46c1.23 0 2.2 1.11 2.18 2.46 0 1.35-.96 2.45-2.18 2.45Zm7.97 0c-1.2 0-2.18-1.1-2.18-2.45s.96-2.46 2.18-2.46c1.22 0 2.2 1.11 2.18 2.46 0 1.35-.96 2.45-2.18 2.45Z"/>
  </svg>`

const externalLink = (href: string, label: string, className = '') =>
  `<a class="${className}" href="${href}" target="_blank" rel="noopener noreferrer">${label}${icon('arrow')}</a>`

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="site-header">
    <a class="brand" href="#top" aria-label="A Knew Knowledge home">
      <span class="brand-mark">AK</span>
      <span>A Knew Knowledge</span>
    </a>
    <nav class="desktop-nav" aria-label="Primary navigation">
      <a href="#mission">Mission</a>
      <a href="#book">The Book</a>
      <a href="#work">What We Build</a>
      <a href="#community">Community</a>
      <a href="#contact">Contact</a>
    </nav>
    <a class="nav-cta" href="#book">Read the book</a>
    <button class="menu-button" type="button" aria-expanded="false" aria-controls="mobile-nav" aria-label="Open navigation">${icon('menu')}</button>
    <nav class="mobile-nav" id="mobile-nav" aria-label="Mobile navigation">
      <a href="#mission">Mission</a>
      <a href="#book">The Book</a>
      <a href="#work">What We Build</a>
      <a href="#community">Community</a>
      <a href="#contact">Contact</a>
    </nav>
  </header>

  <main id="top">
    <section class="hero section-shell">
      <div class="hero-copy reveal">
        <p class="eyebrow"><span></span> Ideas for a more conscious future</p>
        <h1>Some knowledge is not learned.<br><em>It is remembered.</em></h1>
        <p class="hero-intro">A Knew Knowledge is a book, a mission, and a growing body of open work exploring better ways to think, build, and move through the world.</p>
        <div class="hero-actions">
          <a class="button button-primary" href="#book">Explore the book${icon('arrow')}</a>
          ${externalLink('https://github.com/jay37mack37', 'View the work', 'button button-secondary')}
        </div>
      </div>
      <div class="hero-art reveal" aria-hidden="true">
        <div class="orbit orbit-one"></div>
        <div class="orbit orbit-two"></div>
        <div class="hero-symbol">K</div>
        <span class="hero-note note-one">question</span>
        <span class="hero-note note-two">remember</span>
        <span class="hero-note note-three">build</span>
      </div>
      <a class="scroll-cue" href="#mission"><span>Scroll to discover</span><i></i></a>
    </section>

    <section class="mission section-shell" id="mission">
      <div class="section-number">01</div>
      <div class="mission-grid reveal">
        <p class="section-label">Our mission</p>
        <div>
          <h2>Question what is given.<br>Build what should exist.</h2>
          <p>We create tools, systems, and ideas that help people see familiar problems differently. Our work sits where human curiosity meets practical technology, with an emphasis on open exploration, thoughtful automation, and knowledge that creates agency.</p>
        </div>
      </div>
      <div class="principles reveal">
        <article><span>01</span><h3>Stay curious</h3><p>Better questions open doors that certainty keeps closed.</p></article>
        <article><span>02</span><h3>Build in public</h3><p>Working openly turns individual experiments into shared progress.</p></article>
        <article><span>03</span><h3>Keep evolving</h3><p>Every useful system should learn, adapt, and become more capable.</p></article>
      </div>
    </section>

    <section class="book-section" id="book">
      <div class="section-shell book-grid">
        <div class="book-visual reveal">
          <div class="book-shadow"></div>
          <img src="./assets/a-knew-knowledge-cover.webp" width="1000" height="1000" alt="Cover of A Knew Knowledge by Samuel Anderson" loading="lazy">
          <div class="book-stamp"><strong>1h 04m</strong><span>Audiobook</span></div>
        </div>
        <div class="book-copy reveal">
          <p class="eyebrow light"><span></span> The book behind the mission</p>
          <h2>A Knew<br>Knowledge</h2>
          <p class="byline">by Samuel Anderson</p>
          <blockquote>“You were never meant to fit in.<br>You were meant to remember.”</blockquote>
          <p>A concise nonfiction journey that pulls back the curtain on a world that feels familiar but never quite made sense. It offers fewer conclusions and sharper questions, revealing not something new, but something forgotten.</p>
          <div class="format-tabs" role="tablist" aria-label="Book formats">
            <button class="format-tab active" id="read-tab" type="button" role="tab" aria-selected="true" aria-controls="read-panel" data-format="read">${icon('book')} Read</button>
            <button class="format-tab" id="listen-tab" type="button" role="tab" aria-selected="false" aria-controls="listen-panel" tabindex="-1" data-format="listen">${icon('headphones')} Listen</button>
          </div>
          <div class="retailers active" id="read-panel" role="tabpanel" aria-labelledby="read-tab" data-panel="read">
            ${externalLink('https://www.amazon.com/Knew-knowedge-Samuel-Anderson-ebook/dp/B0F8X9XV7H', 'Amazon Kindle')}
            ${externalLink('https://www.amazon.com/dp/B0FHG1M453', 'Amazon Paperback')}
            ${externalLink('https://www.kobo.com/us/en/ebook/a-knew-knowledge', 'Kobo')}
            ${externalLink('https://www.everand.com/search?query=A%20Knew%20Knowledge%20Samuel%20Anderson', 'Everand')}
            ${externalLink('https://www.thalia.de/shop/home/artikeldetails/A1075410149', 'Thalia')}
            ${externalLink('https://www.hoopladigital.com/ebook/19423840', 'Hoopla')}
            ${externalLink('https://www.smashwords.com/books/view/1771132', 'Smashwords')}
            ${externalLink('https://fable.co/book/x-9798231249114', 'Fable')}
          </div>
          <div class="retailers" id="listen-panel" role="tabpanel" aria-labelledby="listen-tab" data-panel="listen" hidden>
            ${externalLink('https://books.apple.com/us/audiobook/a-knew-knowledge/id1887498382', 'Apple Books')}
            ${externalLink('https://play.google.com/store/audiobooks/details/A_Knew_Knowledge?id=AQAAAEBa2EOYCM&hl=en_US', 'Google Play')}
            ${externalLink('https://www.kobo.com/us/en/audiobook/knew-knowledge-a', 'Kobo')}
            ${externalLink('https://www.chirpbooks.com/audiobooks/a-knew-knowledge-by-samuel-anderson', 'Chirp')}
            ${externalLink('https://libro.fm/search?q=A%20Knew%20Knowledge%20Samuel%20Anderson', 'Libro.fm')}
          </div>
          <p class="book-meta">Nonfiction <i></i> Book 2025 <i></i> Audiobook 2026</p>
        </div>
      </div>
    </section>

    <section class="work section-shell" id="work">
      <div class="section-number">02</div>
      <div class="work-heading reveal">
        <div><p class="section-label">What we build</p><h2>Ideas made<br><em>useful.</em></h2></div>
        <p>Our experiments span intelligent software, market research, and everyday tools. Different problems, one approach: observe closely, test honestly, and make the result useful.</p>
      </div>
      <div class="work-grid reveal">
        <article class="work-card featured">
          <div class="card-top"><span>AI systems</span>${icon('code')}</div>
          <h3>AKnewAI</h3>
          <p>A multi-agent coding pipeline where specialized AI agents plan, implement, review, fix, and verify each other's work.</p>
          <div class="tag-row"><span>Python</span><span>Automation</span><span>Open source</span></div>
          ${externalLink('https://github.com/jay37mack37', 'Explore on GitHub', 'card-link')}
        </article>
        <article class="work-card">
          <div class="card-top"><span>Research</span><span class="card-index">02</span></div>
          <h3>AKnewGuru</h3>
          <p>A privacy-friendly browser tool that turns vehicle listings into useful mileage insights, with all processing kept on the page.</p>
          <div class="tag-row"><span>TypeScript</span><span>Privacy</span><span>Utility</span></div>
        </article>
        <article class="work-card dark">
          <div class="card-top"><span>Practical tools</span><span class="card-index">03</span></div>
          <h3>Market research,<br>tested honestly.</h3>
          <p>Experimental forecasting systems evaluated against clear baselines. Research only, never investment advice.</p>
          ${externalLink('https://github.com/jay37mack37?tab=repositories', 'See all projects', 'card-link')}
        </article>
      </div>
    </section>

    <section class="community" id="community">
      <div class="section-shell community-inner reveal">
        <p class="section-label">Open by nature</p>
        <h2>Knowledge grows<br>when it is <em>shared.</em></h2>
        <p>The code, experiments, and people behind A Knew Knowledge live in the open. Follow the work, explore the repositories, and build on what resonates.</p>
        <a class="discord-card" href="https://discord.gg/zaUzpeBv6" target="_blank" rel="noopener noreferrer">
          <span class="discord-icon">${discordIcon()}</span>
          <span><strong>Join A Knew Knowledge on Discord</strong><small>A space to connect, question, share, and build together.</small></span>
          <span class="discord-action">Join the community${icon('arrow')}</span>
        </a>
        <div class="profile-links">
          ${externalLink('https://github.com/jay37mack37', '<span>@jay37mack37</span><small>Projects and research</small>')}
          ${externalLink('https://github.com/Jvelly22', '<span>@Jvelly22</span><small>Partner and collaborator</small>')}
          ${externalLink('https://github.com/Benthejunebug', '<span>@Benthejunebug</span><small>GitHub profile</small>')}
        </div>
      </div>
    </section>

    <section class="contact section-shell" id="contact">
      <div class="section-number">03</div>
      <div class="contact-heading">
        <p class="section-label">Start a conversation</p>
        <h2>Have an inquiry?<br><em>Talk to the founders.</em></h2>
        <p>For business opportunities, partnerships, press, or questions about the website, contact the creators and co-founders of A Knew Knowledge LLC.</p>
      </div>
      <div class="contact-links">
        <a href="mailto:jarrod.womack@aknewknowledge.com">
          <span class="contact-icon">${icon('mail')}</span>
          <span><strong>Jarrod Womack</strong><small>jarrod.womack@aknewknowledge.com</small></span>
          ${icon('arrow')}
        </a>
        <a href="mailto:javellsamuel@aknewknowledge.com">
          <span class="contact-icon">${icon('mail')}</span>
          <span><strong>Javell Samuel</strong><small>javellsamuel@aknewknowledge.com</small></span>
          ${icon('arrow')}
        </a>
      </div>
    </section>
  </main>

  <footer>
    <div class="section-shell footer-grid">
      <a class="brand footer-brand" href="#top"><span class="brand-mark">AK</span><span>A Knew Knowledge</span></a>
      <p>Remember differently.<br>Build intentionally.</p>
      <div class="footer-links"><a href="#book">Book</a><a href="#work">Projects</a><a href="#contact">Contact</a><a href="https://github.com/jay37mack37" target="_blank" rel="noopener noreferrer">GitHub</a><a class="footer-discord" href="https://discord.gg/zaUzpeBv6" target="_blank" rel="noopener noreferrer">${discordIcon()}Discord</a></div>
      <small>© <span id="year"></span> A Knew Knowledge LLC</small>
    </div>
  </footer>
`

const menuButton = document.querySelector<HTMLButtonElement>('.menu-button')!
const mobileNav = document.querySelector<HTMLElement>('.mobile-nav')!
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') === 'true'
  menuButton.setAttribute('aria-expanded', String(!open))
  menuButton.setAttribute('aria-label', open ? 'Open navigation' : 'Close navigation')
  menuButton.innerHTML = icon(open ? 'menu' : 'close')
  mobileNav.classList.toggle('open', !open)
})

mobileNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  menuButton.setAttribute('aria-expanded', 'false')
  menuButton.setAttribute('aria-label', 'Open navigation')
  menuButton.innerHTML = icon('menu')
  mobileNav.classList.remove('open')
}))

const formatTabs = [...document.querySelectorAll<HTMLButtonElement>('.format-tab')]
const formatPanels = [...document.querySelectorAll<HTMLElement>('.retailers')]

const activateFormat = (tab: HTMLButtonElement, moveFocus = false) => {
  formatTabs.forEach((item) => {
    const active = item === tab
    item.classList.toggle('active', active)
    item.setAttribute('aria-selected', String(active))
    item.tabIndex = active ? 0 : -1
  })
  formatPanels.forEach((panel) => {
    const active = panel.dataset.panel === tab.dataset.format
    panel.classList.toggle('active', active)
    panel.hidden = !active
  })
  if (moveFocus) tab.focus()
}

formatTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateFormat(tab))
  tab.addEventListener('keydown', (event) => {
    let nextIndex: number | undefined
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % formatTabs.length
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + formatTabs.length) % formatTabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = formatTabs.length - 1
    if (nextIndex === undefined) return
    event.preventDefault()
    activateFormat(formatTabs[nextIndex], true)
  })
})

document.querySelector('#year')!.textContent = String(new Date().getFullYear())
