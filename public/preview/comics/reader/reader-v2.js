/* Static reader. Preferences stay on this device. No trackers. */
(() => {
  'use strict'
  const $ = (id) => document.getElementById(id)
  // Preview never reads or writes the normal reader's preferences.
  const preview = location.pathname.startsWith('/preview/comics/')
  const namespace = preview ? '.preview.mobile.v2' : ''
  const storageKey = 'aknewcomic.issue01.reader.final.v2' + namespace
  const modeKey = 'aknewcomic.issue01.reader.mode.v3' + namespace
  const comicKey = 'aknewcomic.issue01.reader.comic.v3' + namespace
  const fitKey = 'aknewcomic.issue01.reader.fit.v2' + namespace
  const edge = 1 / 3
  let mode = 'comic'
  let pages = []
  let pageIndex = 0
  let panelIndex = 0
  let view = 'panel'
  let textSize = 28
  let touchStart = null
  let ignoreClickUntil = 0
  let imageManifest = {}
  let renderToken = 0
  const decodedImages = new Map()

  // Cap phone transfer pixels at 720px without changing the rendered layout.
  // The full-resolution src stays available to the explicit Enlarge dialog.
  function imageSizes() {
    return window.innerWidth <= 600 ? `${Math.min(window.innerWidth - 24, 720 / (window.devicePixelRatio || 1))}px` : '1200px'
  }
  function configureImage(image, src, webpOnly = false) {
    const entry = imageManifest[src]
    if (entry) {
      image.width = entry.width
      image.height = entry.height
      image.style.setProperty('--source-width', `${entry.width}px`)
      image.style.setProperty('--source-ratio', String(entry.width / entry.height))
      image.sizes = imageSizes()
      image.srcset = (webpOnly ? entry.webp : entry.variants).filter((variant) => variant.width >= 600).map((variant) => `${variant.src} ${variant.width}w`).join(', ')
    } else image.removeAttribute('srcset')
    image.src = src
  }
  function warmNeighbours(src) {
    const sequence = accessible() && shownView() === 'panel'
      ? pages.flatMap((page, index) => index ? page.panels.map((panel) => panel.src) : [page.src])
      : pages.map((page) => page.src)
    const index = sequence.indexOf(src)
    const wanted = [src, sequence[index + 1], sequence[index + 2], sequence[index - 1]].filter(Boolean)
    for (const key of decodedImages.keys()) if (!wanted.includes(key)) decodedImages.delete(key)
    // Start warming only after the visible image has decoded, never competing
    // with the first page for the phone's network budget.
    for (const key of wanted) {
      if (key === src || decodedImages.has(key)) continue
      const image = new Image()
      image.fetchPriority = 'low'
      let fallback = false
      image.onerror = () => { if (!fallback) { fallback = true; configureImage(image, key, true) } }
      configureImage(image, key)
      decodedImages.set(key, image)
      image.decode().catch(() => { /* Current-image loading reports errors when needed. */ })
    }
  }

  function renderImage(src) {
    const token = ++renderToken
    const image = $('page')
    const entry = imageManifest[src]
    $('art').style.backgroundImage = entry ? `url("${entry.placeholder}")` : ''
    $('art').style.backgroundSize = '100% 100%'
    image.style.opacity = '0'
    $('art').hidden = false
    $('status').hidden = true
    let fallback = false
    image.onload = async () => {
      try { await image.decode() } catch { return }
      if (token !== renderToken) return
      image.style.opacity = '1'
      $('art').style.backgroundImage = ''
      $('status').hidden = true
      warmNeighbours(src)
    }
    image.onerror = () => {
      if (token !== renderToken) return
      if (entry && !fallback) { fallback = true; configureImage(image, src, true); return }
      $('status').textContent = accessible()
        ? 'This image could not load. The comic text is below. You can continue, reload, or download the issue from Options.'
        : 'This image could not load. You can continue, reload, read the text in Large text mode, or download the issue from Options.'
      $('status').hidden = false
      $('art').hidden = true
    }
    configureImage(image, src)
    if (image.complete && image.naturalWidth) image.onload()
  }

  const accessible = () => mode === 'accessible'
  const shownView = () => accessible() ? view : 'page'

  function save() {
    try {
      if (accessible()) localStorage.setItem(storageKey, JSON.stringify({ pageIndex, panelIndex, view, textSize }))
      else localStorage.setItem(comicKey, JSON.stringify({ pageIndex }))
    } catch { /* Reading still works when local storage is unavailable. */ }
  }

  function saveMode() {
    try { localStorage.setItem(modeKey, mode) } catch { /* Mode still applies for this visit. */ }
  }

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {} } catch { return {} }
  }

  function setSize(size) {
    textSize = Math.min(44, Math.max(24, size))
    document.documentElement.style.setProperty('--story-size', `${textSize}px`)
    $('text-size').value = String(textSize)
    $('smaller').disabled = textSize === 24
    $('larger').disabled = textSize === 44
    save()
  }

  function storyPart(panel) {
    const section = document.createElement('div')
    section.className = 'transcript-part'
    const scene = document.createElement('p')
    scene.className = 'scene'
    scene.textContent = panel.description
    section.append(scene)
    for (const line of panel.dialogue) {
      const block = document.createElement('div')
      block.className = 'line'
      const speaker = document.createElement('span')
      speaker.className = 'speaker'
      speaker.textContent = line.speaker
      const words = document.createElement('p')
      words.className = 'words'
      words.textContent = line.text
      block.append(speaker, words)
      section.append(block)
    }
    return section
  }

  function show(nextPage, nextPanel = 0, scroll = true) {
    pageIndex = Math.min(pages.length - 1, Math.max(0, nextPage))
    const p = pages[pageIndex]
    const panels = p.panels || []
    panelIndex = Math.min(Math.max(0, panels.length - 1), Math.max(0, nextPanel))
    const cover = pageIndex === 0
    const panel = panels[panelIndex]
    const large = accessible()
    const shown = shownView()
    const last = pageIndex === pages.length - 1 && (shown === 'page' || panelIndex === panels.length - 1)
    document.body.classList.toggle('cover', cover)
    document.body.classList.toggle('accessible', large)
    document.body.classList.toggle('comic', !large)
    $('mode-toggle').setAttribute('aria-pressed', String(large))
    $('size-row').hidden = !large
    $('reader').hidden = false
    $('cover-note').hidden = !cover
    $('view-controls').hidden = cover || !large
    $('transcript').hidden = cover || !large
    $('panel-view').setAttribute('aria-pressed', String(shown === 'panel'))
    $('page-view').setAttribute('aria-pressed', String(shown === 'page'))
    $('prev').disabled = cover
    $('next').disabled = last
    $('next').textContent = cover ? 'Read issue →' : last ? 'Finished ✓' : 'Next →'
    $('count').textContent = cover ? 'Cover · Issue #1' : `Page ${pageIndex} of ${pages.length - 1}${shown === 'panel' ? ` · Panel ${panelIndex + 1} of ${panels.length}` : ''}`
    $('page-select').value = String(pageIndex)
    $('saved-place').textContent = `Saved here: ${$('count').textContent}. Reopening resumes this place.`
    for (const button of $('overview').querySelectorAll('button')) {
      if (Number(button.value) === pageIndex) button.setAttribute('aria-current', 'page')
      else button.removeAttribute('aria-current')
    }
    $('ending').hidden = !last
    $('transcript').replaceChildren(...(cover || !large ? [] : (shown === 'panel' ? [panel] : panels).filter(Boolean).map(storyPart)))
    const src = !cover && shown === 'panel' && panel ? panel.src : p.src
    $('page').alt = cover ? p.description || 'Cover of The Costume, Issue #1. Two Black friends stand together beneath a tree growing from an open book.' : shown === 'panel' && panel ? panel.description : p.label
    $('art').setAttribute('aria-label', cover ? 'Enlarge cover' : 'Enlarge comic art')
    // Hiding a focused image button otherwise drops keyboard focus to body.
    if (document.activeElement === $('art')) $('story').focus({ preventScroll: true })
    renderImage(src)
    save()
    if (scroll) window.scrollTo({ top: 0, behavior: 'instant' })
  }

  function move(direction) {
    if (!pages.length) return
    const panels = pages[pageIndex].panels || []
    const shown = shownView()
    if (shown === 'panel' && pageIndex > 0) {
      const next = panelIndex + direction
      if (next >= 0 && next < panels.length) return show(pageIndex, next)
    }
    const nextPage = pageIndex + direction
    if (nextPage < 0 || nextPage >= pages.length) return
    const nextPanel = direction < 0 && shown === 'panel' ? Math.max(0, (pages[nextPage].panels || []).length - 1) : 0
    show(nextPage, nextPanel)
  }

  $('prev').onclick = () => move(-1)
  $('next').onclick = () => move(1)
  document.querySelector('.brand').onclick = (event) => { event.preventDefault(); if (pages.length) show(0) }
  $('options-toggle').onclick = () => {
    const open = $('options').hidden
    $('options').hidden = !open
    $('options-toggle').setAttribute('aria-expanded', String(open))
  }
  $('mode-toggle').onclick = () => {
    mode = accessible() ? 'comic' : 'accessible'
    saveMode()
    // Drop a ?mode= deep link so a reload keeps the reader's latest choice.
    if (new URLSearchParams(location.search).has('mode')) history.replaceState(null, '', location.pathname + location.hash)
    if (pages.length) show(pageIndex, 0, false)
  }
  function setFit(width) {
    document.body.classList.toggle('fit-width', width)
    $('fit-width').setAttribute('aria-pressed', String(width))
    $('fit-screen').setAttribute('aria-pressed', String(!width))
    try { localStorage.setItem(fitKey, width ? 'width' : 'screen') } catch { /* Visit-only fit still works. */ }
  }
  $('fit-width').onclick = () => setFit(true)
  $('fit-screen').onclick = () => setFit(false)
  $('restart').onclick = () => {
    if (!pages.length) return
    show(0)
    $('options').hidden = true
    $('options-toggle').setAttribute('aria-expanded', 'false')
    $('story').focus({ preventScroll: true })
  }
  $('overview-toggle').onclick = () => {
    const open = $('overview').hidden
    // Populate once, on demand, so cover load does not download all pages.
    if (!$('overview').children.length) {
      pages.forEach((p, index) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.value = String(index)
        button.setAttribute('aria-label', index === 0 ? 'Open cover' : `Open page ${index}`)
        if (index === pageIndex) button.setAttribute('aria-current', 'page')
        const image = document.createElement('img')
        image.src = imageManifest[p.src]?.webp[0]?.src || p.src
        image.alt = ''
        image.loading = 'lazy'
        const label = document.createElement('span')
        label.textContent = index === 0 ? 'Cover' : `Page ${index}`
        button.append(image, label)
        button.onclick = () => {
          show(index)
          $('options').hidden = true
          $('options-toggle').setAttribute('aria-expanded', 'false')
          $('story').focus({ preventScroll: true })
        }
        $('overview').append(button)
      })
    }
    $('overview').hidden = !open
    $('overview-toggle').setAttribute('aria-expanded', String(open))
  }
  $('smaller').onclick = () => setSize(textSize - 4)
  $('larger').onclick = () => setSize(textSize + 4)
  $('page-select').onchange = () => show(Number($('page-select').value))
  $('panel-view').onclick = () => { view = 'panel'; show(pageIndex, panelIndex, false) }
  $('page-view').onclick = () => { view = 'page'; show(pageIndex, panelIndex, false) }
  function zoom() {
    $('zoom-error').hidden = true
    $('zoom-page').src = $('page').src
    $('zoom-page').alt = $('page').alt
    $('zoom-scroll').classList.remove('actual')
    $('fit').textContent = 'Actual size'
    $('zoom').showModal()
  }
  // Keyboard activation of the artwork keeps its existing enlarge behavior.
  // Pointer navigation belongs to the full reading area, not the image bounds.
  $('art').onclick = (event) => { if (event.detail === 0) zoom() }
  $('enlarge').onclick = zoom
  const control = (target) => target.closest('button:not(#art),a,select,input,textarea,[role="group"]')
  const zoomed = () => window.visualViewport && Math.abs(window.visualViewport.scale - 1) > 0.02
  $('story').addEventListener('click', (event) => {
    if (event.detail === 0 || performance.now() < ignoreClickUntil || $('zoom').open || control(event.target) || zoomed() || String(window.getSelection()).length) return
    const box = $('story').getBoundingClientRect()
    move((event.clientX - box.left) / box.width < edge ? -1 : 1)
  })
  $('zoom-page').onerror = () => { $('zoom-error').hidden = false }
  $('fit').onclick = () => {
    const actual = $('zoom-scroll').classList.toggle('actual')
    $('fit').textContent = actual ? 'Fit art' : 'Actual size'
  }
  $('close').onclick = () => $('zoom').close()
  // The close event can arrive after a quick page turn already moved focus; only fill an empty focus.
  $('zoom').addEventListener('close', () => {
    const active = document.activeElement
    if (!active || active === document.body || $('zoom').contains(active)) $('art').focus()
  })
  document.addEventListener('keydown', (event) => {
    if ($('zoom').open || event.altKey || event.ctrlKey || event.metaKey || ['SELECT', 'INPUT', 'TEXTAREA'].includes(event.target.tagName)) return
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      move(event.key === 'ArrowRight' ? 1 : -1)
    }
  })
  // Once a sequence contains multiple fingers it stays invalid until all lift.
  // Maximum excursion, not just final delta, protects scroll-and-return gestures.
  let multiTouch = false
  const suppressClick = () => { ignoreClickUntil = performance.now() + 750 }
  $('story').addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) multiTouch = true
    if (multiTouch || control(event.target) || zoomed()) {
      touchStart = null
      suppressClick()
      return
    }
    const point = event.touches[0]
    touchStart = { x: point.clientX, y: point.clientY, time: event.timeStamp, scroll: window.scrollY, maxY: 0, maxX: 0 }
  }, { passive: true })
  $('story').addEventListener('touchmove', (event) => {
    if (!touchStart) return
    if (event.touches.length !== 1) { multiTouch = true; touchStart = null; suppressClick(); return }
    // A stationary hold is a long press. A swipe already in motion may take
    // longer than 500ms, especially while a phone is decoding nearby artwork.
    if (event.timeStamp - touchStart.time > 500 && touchStart.maxX <= 10 && touchStart.maxY <= 10) { touchStart = null; suppressClick(); return }
    touchStart.maxX = Math.max(touchStart.maxX, Math.abs(event.touches[0].clientX - touchStart.x))
    touchStart.maxY = Math.max(touchStart.maxY, Math.abs(event.touches[0].clientY - touchStart.y))
  }, { passive: true })
  $('story').addEventListener('touchcancel', () => { touchStart = null; multiTouch = false; suppressClick() }, { passive: true })
  $('story').addEventListener('contextmenu', suppressClick)
  $('story').addEventListener('touchend', (event) => {
    const start = touchStart
    touchStart = null
    const invalid = multiTouch || event.touches.length > 0
    if (!event.touches.length) multiTouch = false
    if (!start || invalid || !event.changedTouches.length) { suppressClick(); return }
    const dx = event.changedTouches[0].clientX - start.x
    const dy = event.changedTouches[0].clientY - start.y
    const duration = event.timeStamp - start.time
    if (zoomed() || Math.abs(window.scrollY - start.scroll) > 2 || (duration > 500 && start.maxX < 60) || duration > 2000 || start.maxY > 30 || String(window.getSelection()).length) { suppressClick(); return }
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2 && start.maxY < 30) {
      suppressClick()
      move(dx < 0 ? 1 : -1)
    } else if (start.maxX > 10 || start.maxY > 10 || Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      suppressClick()
    }
  }, { passive: true })

  async function boot() {
    try {
      const [response, derivatives] = await Promise.all([
        fetch('issue.json', { cache: 'no-cache' }),
        fetch('responsive/manifest.json').then((result) => result.ok ? result.json() : null).catch(() => null),
      ])
      // Development checkouts without a build retain the original-image fallback.
      if (derivatives?.schema === 'aknewcomic-images/2') imageManifest = derivatives.images
      if (!response.ok) throw new Error('Issue unavailable')
      const issue = await response.json()
      if (issue.schema !== 'aknewcomic-issue/2' || !Array.isArray(issue.pages) || issue.pages.length !== 16) throw new Error('Incomplete issue')
      for (const [index, p] of issue.pages.entries()) {
        if (!p || typeof p !== 'object' || !/^pages\/[a-z0-9-]+\.webp$/.test(p.src) || typeof p.label !== 'string' || !p.label.trim()) throw new Error('Invalid page')
        if (index === 0) {
          if (typeof p.description !== 'string' || !p.description.trim()) throw new Error('Invalid cover description')
        } else {
          if (!Array.isArray(p.panels) || !p.panels.length) throw new Error('Invalid panels')
          for (const panel of p.panels) {
            if (!panel || !/^panels\/[a-z0-9-]+\.webp$/.test(panel.src) || typeof panel.description !== 'string' || !panel.description.trim() || !Array.isArray(panel.dialogue)) throw new Error('Invalid panel')
            for (const line of panel.dialogue) {
              if (!line || typeof line.speaker !== 'string' || !line.speaker.trim() || typeof line.text !== 'string' || !line.text.trim()) throw new Error('Invalid dialogue')
            }
          }
        }
      }
      pages = issue.pages
      for (const [index] of pages.entries()) {
        const option = document.createElement('option')
        option.value = String(index)
        option.textContent = index === 0 ? 'Cover' : `Page ${index}`
        $('page-select').append(option)
      }
      const asked = new URLSearchParams(location.search).get('mode')
      if (asked === 'accessible' || asked === 'comic') {
        mode = asked
        saveMode()
      } else {
        try { if (localStorage.getItem(modeKey) === 'accessible') mode = 'accessible' } catch { /* Default layout. */ }
      }
      // Ignore stale/corrupted preferences field by field.
      const saved = read(storageKey)
      if (saved.view === 'page') view = 'page'
      if (Number.isFinite(saved.textSize)) textSize = saved.textSize
      if (accessible()) {
        if (Number.isInteger(saved.pageIndex)) pageIndex = saved.pageIndex
        if (Number.isInteger(saved.panelIndex)) panelIndex = saved.panelIndex
      } else {
        const comic = read(comicKey)
        if (Number.isInteger(comic.pageIndex)) pageIndex = comic.pageIndex
      }
      try { setFit(localStorage.getItem(fitKey) === 'width') } catch { setFit(false) }
      setSize(textSize)
      show(pageIndex, panelIndex, false)
    } catch {
      $('reader').hidden = true
      $('status').textContent = 'The comic could not open. Please reload, or download Issue #1 from Options.'
      $('status').hidden = false
      $('prev').disabled = true
      $('next').disabled = true
    }
  }
  boot()
})()
