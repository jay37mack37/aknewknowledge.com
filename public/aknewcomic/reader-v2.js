/* Sol 6.1 on behalf of the owner. Static, local preferences only. No trackers. */
(() => {
  'use strict'
  const $ = (id) => document.getElementById(id)
  // Large text mode keeps the v2 key. The mode and normal-layout page use new
  // keys so v2 preferences never force earlier visitors into Large text mode.
  const storageKey = 'aknewcomic.issue01.reader.final.v2'
  const modeKey = 'aknewcomic.issue01.reader.mode.v3'
  const comicKey = 'aknewcomic.issue01.reader.comic.v3'
  const edge = 0.3
  let mode = 'comic'
  let pages = []
  let pageIndex = 0
  let panelIndex = 0
  let view = 'panel'
  let textSize = 28
  let touchStart = null
  let ignoreClickUntil = 0

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
    $('ending').hidden = !last
    $('transcript').replaceChildren(...(cover || !large ? [] : (shown === 'panel' ? [panel] : panels).filter(Boolean).map(storyPart)))
    const src = !cover && shown === 'panel' && panel ? panel.src : p.src
    $('page').alt = cover ? p.description || 'Cover of The Costume, Issue #1. Two Black friends stand together beneath a tree growing from an open book.' : shown === 'panel' && panel ? panel.description : p.label
    $('art').setAttribute('aria-label', cover ? 'Enlarge cover' : 'Enlarge comic art')
    // Hiding a focused image button otherwise drops keyboard focus to body.
    if (document.activeElement === $('art')) $('story').focus({ preventScroll: true })
    $('status').textContent = 'Loading artwork…'
    $('status').hidden = false
    $('art').hidden = true
    $('page').src = src
    if ($('page').complete && $('page').naturalWidth) {
      $('status').hidden = true
      $('art').hidden = false
    }
    // Warm the next whole page so normal page turns feel instant.
    if (!large && pages[pageIndex + 1]) new Image().src = pages[pageIndex + 1].src
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

  $('page').onload = () => { $('status').hidden = true; $('art').hidden = false }
  $('page').onerror = () => {
    $('status').textContent = accessible()
      ? 'This image could not load. The comic text is below. You can continue, reload, or download the issue from Options.'
      : 'This image could not load. You can continue, reload, read the text in Large text mode, or download the issue from Options.'
    $('status').hidden = false
    $('art').hidden = true
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
  $('art').onclick = (event) => {
    // A swipe already turned the page; ignore the click some browsers synthesize after it.
    if (performance.now() < ignoreClickUntil) return
    // Normal layout: pointer taps on the outer edges turn pages, the center enlarges.
    // Keyboard activation (detail 0) always enlarges.
    if (!accessible() && event.detail > 0) {
      const box = $('art').getBoundingClientRect()
      const x = (event.clientX - box.left) / box.width
      if (x < edge && pageIndex > 0) return move(-1)
      if (x > 1 - edge && pageIndex < pages.length - 1) return move(1)
    }
    zoom()
  }
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
  $('art').addEventListener('touchstart', (event) => {
    touchStart = event.touches.length === 1 ? [event.touches[0].clientX, event.touches[0].clientY] : null
  }, { passive: true })
  $('art').addEventListener('touchcancel', () => { touchStart = null }, { passive: true })
  $('art').addEventListener('touchend', (event) => {
    if (!touchStart || !event.changedTouches.length) return
    const dx = event.changedTouches[0].clientX - touchStart[0]
    const dy = event.changedTouches[0].clientY - touchStart[1]
    touchStart = null
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) {
      ignoreClickUntil = performance.now() + 700
      move(dx < 0 ? 1 : -1)
    } else if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      ignoreClickUntil = performance.now() + 700
    }
  }, { passive: true })

  async function boot() {
    try {
      const response = await fetch('issue.json', { cache: 'no-cache' })
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
