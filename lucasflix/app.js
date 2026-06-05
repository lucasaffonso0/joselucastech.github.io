// ── CONFIG ────────────────────────────────────────────────────────
const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMG  = 'https://image.tmdb.org/t/p'
const SOURCES = [
  { key: 'redetoons', label: 'Server 1' },
  { key: 'superflix', label: 'Server 2' },
  { key: 'warez',     label: 'Server 3' },
]
let activeSourceIdx = 0
let TMDB_KEY = atob('NDAwOWRmMTI4ODY3OWQxYTAzNzRmZTBhMGUwZjg0MTk=')

// ── STATE ─────────────────────────────────────────────────────────
let currentView  = 'home'
let previousView = 'home'
let searchState  = { query: '', type: '', page: 1, totalPages: 1 }
let tvState      = { id: 0, season: 1, episode: 1, details: null }
let playerState  = { type: '', imdbId: '', tvId: 0 }
let cache        = {}
let homeInitialized  = false
let _scrollHandler   = null
let _reloadTimer     = null
let _loadSearchSeq   = 0

// ── TMDB API ──────────────────────────────────────────────────────
async function api(path, params = {}) {
  const key = path + JSON.stringify(params)
  if (cache[key]) return cache[key]
  const url = new URL(TMDB_BASE + path)
  url.searchParams.set('api_key', TMDB_KEY)
  url.searchParams.set('language', 'pt-BR')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const r = await fetch(url)
  if (!r.ok) throw new Error(`TMDB ${r.status}`)
  const data = await r.json()
  if (Object.keys(cache).length > 200) cache = {}
  cache[key] = data
  return data
}


function imgUrl(path, size = 'w500') {
  return path ? `${TMDB_IMG}/${size}${path}` : ''
}
function getTitle(c) { return c.title || c.name || 'Sem título' }
function getYear(c)  { const d = c.release_date || c.first_air_date; return d ? d.slice(0,4) : '' }
function getType(c)  { return (c.media_type === 'movie' || c.title) ? 'movie' : 'tv' }

// ── INIT ──────────────────────────────────────────────────────────
async function init() {
  homeInitialized = true
  showView('home')
  setActiveNav('nav-home')
  renderRowSkeletons()

  const [trending, movies, series, topRated, topSeries, onAir, animes] = await Promise.all([
    api('/trending/all/week'),
    api('/movie/popular'),
    api('/tv/popular'),
    api('/movie/top_rated'),
    api('/tv/top_rated'),
    api('/tv/on_the_air'),
    api('/discover/tv', { with_genres: '16', with_origin_country: 'JP', sort_by: 'popularity.desc' }),
  ])

  const heroItems = trending.results.filter(c => c.media_type !== 'person')
  renderHero(heroItems[0])

  const rows = document.getElementById('rows')
  rows.innerHTML = ''

  // Continue watching banner (non-blocking — doesn't delay row render)
  const _cwSaved = localStorage.getItem('lf_player')
  if (_cwSaved) {
    try {
      const ps = JSON.parse(_cwSaved)
      if (ps.id && ps.type) {
        const cw = document.createElement('div')
        cw.id = 'cw-banner'
        rows.appendChild(cw)
        api(`/${ps.type}/${ps.id}`).then(d => {
          if (!d || !document.getElementById('cw-banner')) return
          const ep = (ps.season && ps.episode) ? `T${ps.season} · E${ps.episode}` : ''
          cw.innerHTML = `
            <div class="mx-5 md:mx-12 mb-2 mt-1 rounded-xl overflow-hidden flex items-center gap-3 p-3" style="background:var(--surface);border:1px solid rgba(255,255,255,.08)">
              ${d.poster_path ? `<img src="${imgUrl(d.poster_path,'w92')}" class="w-10 rounded flex-none" style="aspect-ratio:2/3;object-fit:cover;border-radius:6px">` : ''}
              <div class="flex-1 min-w-0">
                <p class="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style="color:rgba(255,255,255,.3)">Continue Assistindo</p>
                <p class="text-white font-semibold text-sm truncate">${getTitle(d)}</p>
                ${ep ? `<p class="text-[11px] mt-0.5" style="color:rgba(255,255,255,.4)">${ep}</p>` : ''}
              </div>
              <button onclick="openPlayer(${ps.id},'${ps.type}',{season:${ps.season||1},episode:${ps.episode||1}})" class="btn-primary !text-xs !px-3 !py-1.5 flex-none">
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                Continuar
              </button>
            </div>`
        }).catch(() => { const el = document.getElementById('cw-banner'); if (el) el.remove() })
      }
    } catch(e) {}
  }

  const seen = new Set()
  const dedup = (items) => {
    const fresh = items.filter(c => !seen.has(c.id))
    fresh.forEach(c => seen.add(c.id))
    return fresh
  }

  renderRow('Em Alta esta Semana',       dedup(trending.results.filter(c=>c.media_type!=='person')), rows)
  renderRow('Filmes Populares',         dedup(movies.results),      rows, 'movie')
  renderRow('Filmes Mais Bem Avaliados',dedup(topRated.results),    rows, 'movie')
  renderRow('Séries Populares',         dedup(series.results),      rows, 'tv')
  renderRow('Séries no Ar Agora',       dedup(onAir.results),       rows, 'tv')
  renderRow('Séries Mais Bem Avaliadas',dedup(topSeries.results),   rows, 'tv')
  renderRow('Animes',                   dedup(animes.results),      rows, 'tv')
}

function renderRowSkeletons() {
  const rows = document.getElementById('rows')
  rows.innerHTML = Array.from({length: 3}).map(() => `
    <div class="mb-10 px-5 md:px-12">
      <div class="skeleton h-5 w-40 mb-4 rounded"></div>
      <div class="flex gap-3 overflow-hidden">
        ${Array.from({length: 8}).map(() => `
          <div class="flex-none w-[140px] md:w-[168px]">
            <div class="skeleton rounded-lg" style="aspect-ratio:2/3"></div>
          </div>`).join('')}
      </div>
    </div>`).join('')
}

// ── HERO ──────────────────────────────────────────────────────────
function renderHero(c) {
  const type = getType(c)
  const img = document.getElementById('hero-img')
  img.style.opacity = '0'
  img.src = imgUrl(c.backdrop_path, 'w1280')
  img.onload = () => { img.style.opacity = '1' }

  document.getElementById('hero-title').textContent = getTitle(c)
  document.getElementById('hero-overview').textContent = c.overview || ''
  document.getElementById('hero-play').onclick = () => openPlayer(c.id, type)
  document.getElementById('hero-info').onclick = () => openModal(c.id, type)

  const rating = c.vote_average ? c.vote_average.toFixed(1) : null
  document.getElementById('hero-badges').innerHTML = `
    <span style="background:rgba(229,9,20,.15);border:1px solid rgba(229,9,20,.3);color:#ff6b6b;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:.04em">
      ${type === 'movie' ? 'FILME' : 'SÉRIE'}
    </span>
    ${rating ? `<span style="background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.25);color:#fbbf24;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;display:flex;align-items:center;gap:4px">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      ${rating}
    </span>` : ''}`

  document.getElementById('hero-meta').innerHTML = `
    ${getYear(c) ? `<span>${getYear(c)}</span><span class="w-1 h-1 rounded-full bg-white/30 inline-block"></span>` : ''}
    <span class="border border-white/20 px-1.5 py-0.5 text-[10px] rounded font-medium">${c.adult ? '+18' : 'LIVRE'}</span>`
}

// ── ROWS ──────────────────────────────────────────────────────────
function renderRow(title, items, container, forcedType) {
  if (!items.length) return
  const row = document.createElement('div')
  row.className = 'row-group relative mb-2 py-6'
  row.innerHTML = `
    <h2 class="text-white font-semibold text-base md:text-lg mb-4 px-5 md:px-12 tracking-[-0.01em]">${title}</h2>
    <div class="relative">
      <button onclick="scrollRow(this,-1)" class="row-arrow row-arrow-left">
        <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
        </svg>
      </button>
      <div class="row-track flex gap-3 overflow-x-auto scroll-smooth px-5 md:px-12 pb-2 scrollbar-hide">
        ${items.map(c => cardHTML(c, forcedType)).join('')}
      </div>
      <button onclick="scrollRow(this,1)" class="row-arrow row-arrow-right">
        <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
        </svg>
      </button>
    </div>`
  container.appendChild(row)
  // Hide left arrow at start, right arrow at end
  requestAnimationFrame(() => {
    const track      = row.querySelector('.row-track')
    const leftArrow  = row.querySelector('.row-arrow-left')
    const rightArrow = row.querySelector('.row-arrow-right')
    const syncArrows = () => {
      leftArrow.classList.toggle('at-edge',  track.scrollLeft <= 2)
      rightArrow.classList.toggle('at-edge', track.scrollLeft >= track.scrollWidth - track.clientWidth - 2)
    }
    syncArrows()
    track.addEventListener('scroll', syncArrows, { passive: true })

    // Drag-to-scroll — mouse only (touch has native swipe)
    let dragStartX = 0, dragScrollStart = 0, didDrag = false

    const onMouseMove = e => {
      const dx = e.pageX - dragStartX
      if (Math.abs(dx) > 8) didDrag = true
      track.scrollLeft = dragScrollStart - dx
    }
    const onMouseUp = () => {
      track.classList.remove('dragging')
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    track.addEventListener('mousedown', e => {
      if (e.button !== 0) return
      didDrag = false
      dragStartX = e.pageX
      dragScrollStart = track.scrollLeft
      track.classList.add('dragging')
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    })
    track.addEventListener('click', e => {
      if (didDrag) { didDrag = false; e.stopPropagation() }
    }, true)
  })
}

function scrollRow(btn, dir) {
  const track = btn.closest('.relative').querySelector('.row-track')
  track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: 'smooth' })
}

function cardHTML(c, forcedType) {
  const type   = forcedType || getType(c)
  const poster = imgUrl(c.poster_path, 'w342')
  const title  = getTitle(c)
  const year   = getYear(c)
  const rating = c.vote_average ? c.vote_average.toFixed(1) : null
  // Escape for use inside onerror JS string (single-quote context)
  const safeJs  = title.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  // Escape for HTML attributes
  const safeAttr = title.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const img = poster
    ? `<img src="${poster}" alt="${safeAttr}" loading="lazy" onerror="this.parentElement.innerHTML='<div style=width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:8px;color:rgba(255,255,255,.2);font-size:11px;text-align:center>${safeJs}</div>'">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:8px;color:rgba(255,255,255,.2);font-size:11px;text-align:center">${title}</div>`

  return `
    <div onclick="openPlayer(${c.id},'${type}')" class="card-wrap" title="${safeAttr}">
      <div class="card-img-wrap">
        ${img}
        ${rating ? `<div class="rating-badge"><svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>${rating}</div>` : ''}
        <div class="card-overlay">
          <div class="card-play-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#000"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <p style="font-size:11px;font-weight:600;color:#fff;line-height:1.3;margin:0">${title}</p>
          ${year ? `<p style="font-size:10px;color:rgba(255,255,255,.5);margin:2px 0 0">${year}</p>` : ''}
        </div>
      </div>
      <p class="mt-2 text-[11px] text-white/55 truncate leading-tight" title="${safeAttr}">${title}</p>
    </div>`
}

// ── PLAYER ────────────────────────────────────────────────────────
async function openPlayer(id, type, opts = {}) {
  activeSourceIdx = 0
  document.getElementById('source-label').textContent = 'Server 1'
  const nav = document.getElementById('nav-source-label')
  if (nav) nav.textContent = 'Server 1'
  previousView = (currentView === 'player') ? 'home' : currentView
  showView('player')
  document.getElementById('player-iframe').src = ''
  document.getElementById('player-title').textContent = 'Carregando...'
  document.getElementById('episodes-toggle-btn').classList.add('hidden')
  document.getElementById('episodes-toggle-btn').classList.remove('flex')
  document.getElementById('episodes-sidebar').classList.add('hidden')

  try {
    const details = await api(`/${type}/${id}`, { append_to_response: 'external_ids,seasons' })
    document.getElementById('player-title').textContent = getTitle(details)

    const rating  = details.vote_average ? details.vote_average.toFixed(1) : null
    document.getElementById('player-overview').textContent = details.overview || ''
    document.getElementById('player-meta-row').innerHTML = buildMetaRow(details, type)

    if (type === 'movie') {
      const imdbId = details.external_ids?.imdb_id
      if (!imdbId) { document.getElementById('player-title').textContent = 'Não disponível'; return }
      playerState = { type: 'movie', imdbId, id }
      localStorage.setItem('lf_player', JSON.stringify({ id, type: 'movie' }))
      document.getElementById('player-iframe').src = buildEmbedUrl()
    } else {
      const initSeason  = opts.season  || 1
      const initEpisode = opts.episode || 1
      playerState = { type: 'tv', tvId: id }
      tvState = { id, season: initSeason, episode: initEpisode, details }
      document.getElementById('episodes-toggle-btn').classList.remove('hidden')
      document.getElementById('episodes-toggle-btn').classList.add('flex')
      document.getElementById('episodes-sidebar').classList.remove('hidden')
      document.getElementById('episodes-sidebar').classList.add('flex', 'flex-col')
      renderSeasonSelect(details)
      document.getElementById('season-select').value = initSeason
      await loadEpisodes(initSeason)
      playEpisode(initSeason, initEpisode)
    }
  } catch(e) {
    document.getElementById('player-title').textContent = 'Erro ao carregar'
  }
}

function playEpisode(season, episode) {
  tvState.season  = season
  tvState.episode = episode
  const details   = tvState.details
  if (details) {
    document.getElementById('player-title').textContent =
      `${getTitle(details)} · T${season} E${episode}`
  }
  const existing = JSON.parse(localStorage.getItem('lf_player') || '{}')
  localStorage.setItem('lf_player', JSON.stringify({ ...existing, season, episode }))
  document.getElementById('player-iframe').src = buildEmbedUrl()
  highlightEpisode(season, episode)
}

function closePlayer() {
  if (document.fullscreenElement) document.exitFullscreen()
  document.getElementById('player-iframe').src = ''
  document.getElementById('player-title').textContent = ''
  document.getElementById('player-meta-row').innerHTML = ''
  document.getElementById('player-overview').textContent = ''
  const sidebar = document.getElementById('episodes-sidebar')
  sidebar.classList.add('hidden')
  sidebar.classList.remove('flex', 'flex-col')
  document.getElementById('episodes-toggle-btn').classList.add('hidden')
  document.getElementById('episodes-toggle-btn').classList.remove('flex')
  localStorage.removeItem('lf_player')
  const dest = (previousView === 'search') ? 'search' : 'home'
  previousView = 'home'
  showView(dest)
  if (dest === 'search') {
    loadSearch()
  } else {
    setActiveNav('nav-home')
    if (!homeInitialized) init()
  }
}

async function openModal(id, type) {
  const modal = document.getElementById('modal')
  modal.classList.remove('hidden')
  modal.classList.add('flex')
  document.getElementById('modal-backdrop').src = ''
  document.getElementById('modal-body').innerHTML = `
    <div class="flex justify-center py-6">
      <div class="w-6 h-6 border-2 border-[#E50914] border-t-transparent rounded-full animate-spin"></div>
    </div>`
  try {
    const details = await api(`/${type}/${id}`)
    const backdrop = imgUrl(details.backdrop_path, 'w780')
    if (backdrop) document.getElementById('modal-backdrop').src = backdrop
    document.getElementById('modal-play-btn').onclick = () => { closeModal(); openPlayer(id, type) }
    const rating  = details.vote_average ? details.vote_average.toFixed(1) : null
    const genres  = (details.genres || []).map(g => g.name).join(', ')
    const runtime = details.runtime
      ? `${details.runtime} min`
      : details.number_of_seasons
        ? `${details.number_of_seasons} temporada${details.number_of_seasons > 1 ? 's' : ''}`
        : ''
    document.getElementById('modal-body').innerHTML = `
      <h2 class="text-white text-xl font-bold mb-2">${getTitle(details)}</h2>
      <div class="flex flex-wrap items-center gap-3 text-sm text-white/50 mb-4">
        ${getYear(details) ? `<span>${getYear(details)}</span>` : ''}
        ${runtime ? `<span>${runtime}</span>` : ''}
        ${rating ? `<span class="flex items-center gap-1.5 text-yellow-400 font-semibold">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          ${rating}
        </span>` : ''}
      </div>
      ${details.overview ? `<p class="text-white/60 text-sm leading-relaxed mb-5">${details.overview}</p>` : ''}
      ${genres ? `<p class="text-xs text-white/30"><span class="text-white/20 font-semibold uppercase tracking-widest text-[10px]">Gêneros</span><br><span class="mt-1 inline-block">${genres}</span></p>` : ''}`
  } catch(e) {
    document.getElementById('modal-body').innerHTML = '<p class="text-white/40 text-sm py-4 text-center">Erro ao carregar detalhes.</p>'
  }
}

function toggleFullscreen() {
  const iframe = document.getElementById('player-iframe')
  if (!document.fullscreenElement) {
    // Try iframe fullscreen first (best experience); fall back to player box
    const target = iframe.requestFullscreen ? iframe : document.getElementById('player-box')
    target.requestFullscreen().catch(() => {})
  } else {
    document.exitFullscreen()
  }
}

document.addEventListener('fullscreenchange', () => {
  const icon  = document.getElementById('fullscreen-icon')
  const label = document.getElementById('fullscreen-label')
  if (!icon || !label) return
  if (document.fullscreenElement) {
    icon.innerHTML  = '<path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4m0 5H4m5 0L3 3m18 6V4m0 5h-5m5 0l-6-6M9 15v5m0-5H4m5 5l-6 6m18-6v5m0-5h-5m5 5l-6-6"/>'
    label.textContent = 'Sair'
  } else {
    icon.innerHTML  = '<path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>'
    label.textContent = 'Tela cheia'
  }
})

function buildEmbedUrl() {
  const src = SOURCES[activeSourceIdx].key
  if (playerState.type === 'movie') {
    //if (src === 'redetoons') return `https://proxy.redetoons.me/p/beta/movie/${playerState.id}`
    if (src === 'redetoons') return `https://redetoons.lol/watch/filme?id=${playerState.id}&type=movie`
    const base = src === 'superflix' ? 'https://superflixapi.fit' : 'https://warezcdn.lat'
    return playerState.imdbId ? `${base}/filme/${playerState.imdbId}` : ''
  }
  if (playerState.type === 'tv') {
    if (src === 'redetoons') return `https://proxy.redetoons.me/p/beta/tv/${tvState.id}/${tvState.season}/${tvState.episode}`
    const base = src === 'superflix' ? 'https://superflixapi.fit' : 'https://warezcdn.lat'
    return `${base}/serie/${tvState.id}/${tvState.season}/${tvState.episode}`
  }
  return ''
}

function buildMetaRow(details, type) {
  const year    = getYear(details)
  const rating  = details.vote_average ? details.vote_average.toFixed(1) : null
  const runtime = type === 'movie' && details.runtime ? `${details.runtime} min` : ''
  const seasons = type !== 'movie' && details.number_of_seasons
    ? `${details.number_of_seasons} temporada${details.number_of_seasons > 1 ? 's' : ''}` : ''
  const dot = `<span class="w-1 h-1 rounded-full bg-white/25 inline-block"></span>`
  let parts = []
  if (year)    parts.push(`<span>${year}</span>`)
  if (runtime) parts.push(`<span>${runtime}</span>`)
  if (seasons) parts.push(`<span>${seasons}</span>`)
  if (rating)  parts.push(`
    <span class="inline-flex items-center gap-1 font-semibold" style="color:#fbbf24">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      ${rating}
    </span>`)
  return parts.join(dot)
}

function reloadPlayer() {
  const url = buildEmbedUrl()
  if (!url) return
  const iframe = document.getElementById('player-iframe')
  iframe.src = ''
  if (_reloadTimer) clearTimeout(_reloadTimer)
  _reloadTimer = setTimeout(() => {
    _reloadTimer = null
    if (currentView === 'player') iframe.src = url
  }, 100)
}

function toggleSource() {
  activeSourceIdx = (activeSourceIdx + 1) % SOURCES.length
  const label = SOURCES[activeSourceIdx].label
  document.getElementById('source-label').textContent = label
  const nav = document.getElementById('nav-source-label')
  if (nav) nav.textContent = label
  reloadPlayer()
}

function toggleEpisodes() {
  const sidebar = document.getElementById('episodes-sidebar')
  const open    = !sidebar.classList.contains('hidden')
  sidebar.classList.toggle('hidden', open)
  sidebar.classList.toggle('flex',     !open)
  sidebar.classList.toggle('flex-col', !open)
}

// ── EPISODES ──────────────────────────────────────────────────────
function renderSeasonSelect(details) {
  const sel = document.getElementById('season-select')
  sel.innerHTML = ''
  const seasons = (details.seasons || []).filter(s => s.season_number > 0)
  if (!seasons.length) {
    sel.innerHTML = `<option value="1">Temporada 1</option>`
    return
  }
  seasons.forEach(s => {
    const opt = document.createElement('option')
    opt.value = s.season_number
    opt.textContent = s.name
    sel.appendChild(opt)
  })
}

async function changeSeason(season) {
  tvState.season = Number(season)
  await loadEpisodes(Number(season))
  playEpisode(Number(season), 1)
}

async function loadEpisodes(season) {
  const list = document.getElementById('episodes-list')
  list.innerHTML = `<div class="flex justify-center py-8"><div class="w-6 h-6 border-2 border-[#E50914] border-t-transparent rounded-full animate-spin"></div></div>`
  try {
    const data = await api(`/tv/${tvState.id}/season/${season}`)
    list.innerHTML = data.episodes.map(ep => `
      <button onclick="playEpisode(${season},${ep.episode_number})"
        id="ep-${season}-${ep.episode_number}" class="ep-btn">
        <div class="flex gap-3 items-start">
          <div class="flex-none relative">
            ${ep.still_path
              ? `<img src="${imgUrl(ep.still_path,'w185')}" class="w-[72px] rounded" style="aspect-ratio:16/9;object-fit:cover" loading="lazy">`
              : `<div class="w-[72px] rounded flex items-center justify-center" style="aspect-ratio:16/9;background:rgba(255,255,255,.05)">
                  <svg class="w-4 h-4" style="color:rgba(255,255,255,.2)" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </div>`}
            <div class="ep-overlay absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity" style="background:rgba(0,0,0,.5);border-radius:4px">
              <svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-white text-xs font-semibold truncate leading-tight">${ep.episode_number}. ${ep.name}</p>
            ${ep.runtime ? `<p class="text-[10px] mt-0.5" style="color:rgba(255,255,255,.3)">${ep.runtime} min</p>` : ''}
            ${ep.overview ? `<p class="text-[10px] mt-1.5 clamp2 leading-relaxed" style="color:rgba(255,255,255,.4)">${ep.overview}</p>` : ''}
          </div>
        </div>
      </button>`).join('')
  } catch(e) {
    list.innerHTML = '<p class="text-center py-6 text-sm" style="color:rgba(255,255,255,.3)">Erro ao carregar episódios</p>'
  }
}

function highlightEpisode(season, episode) {
  document.querySelectorAll('[id^="ep-"]').forEach(el => el.classList.remove('active'))
  const el = document.getElementById(`ep-${season}-${episode}`)
  if (el) { el.classList.add('active'); el.scrollIntoView({ block: 'nearest' }) }
}

// ── SEARCH ────────────────────────────────────────────────────────
function toggleSearch() {
  const wrap  = document.getElementById('search-expand-wrap')
  const input = document.getElementById('search-input')
  if (!wrap.classList.contains('open')) {
    wrap.classList.add('open')
    setTimeout(() => input.focus(), 50)
  } else if (input.value.trim()) {
    doSearch()
  } else {
    wrap.classList.remove('open')
    input.blur()
  }
}

function closeSearch() {
  setTimeout(() => {
    const input = document.getElementById('search-input')
    if (!input.value) {
      document.getElementById('search-expand-wrap').classList.remove('open')
    }
  }, 200)
}

function doSearch() {
  const q = document.getElementById('search-input').value.trim()
  if (!q) return
  document.getElementById('search-expand-wrap').classList.remove('open')
  const searchInput = document.getElementById('search-input')
  searchInput.value = ''
  searchInput.blur()
  searchState = { query: q, type: '', page: 1, totalPages: 1 }
  document.getElementById('search-title').textContent = `"${q}"`
  document.getElementById('search-count').textContent = ''
  document.getElementById('search-grid').innerHTML = ''
  setActiveNav(null)
  showView('search')
  loadSearch()
}

function browseType(type) {
  const labels = { movie: 'Filmes', tv: 'Séries', anime: 'Animes' }
  const navIds  = { movie: 'nav-movie', tv: 'nav-tv', anime: 'nav-anime' }
  searchState = { query: '', type, page: 1, totalPages: 1 }
  document.getElementById('search-title').textContent = labels[type] || type
  document.getElementById('search-count').textContent = ''
  document.getElementById('search-grid').innerHTML = ''
  setGenreTab(type)
  setActiveNav(navIds[type] || null)
  showView('search')
  loadSearch()
}

async function loadSearch() {
  const seq     = ++_loadSearchSeq
  const loading = document.getElementById('search-loading')
  const empty   = document.getElementById('search-empty')
  document.getElementById('pagination').classList.add('hidden')
  loading.classList.remove('hidden')
  loading.classList.add('flex')
  empty.classList.add('hidden')
  empty.classList.remove('flex')
  document.getElementById('search-grid').innerHTML = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })

  try {
    let data
    const { query, type, page } = searchState

    if (query) {
      data = await api('/search/multi', { query, page })
      data.results = data.results.filter(r => r.media_type !== 'person')
    } else if (type === 'genre') {
      data = await api(`/discover/${searchState.mediaType}`, { with_genres: searchState.genreId, sort_by: 'popularity.desc', page })
      data.total_pages = Math.min(data.total_pages, 50)
    } else if (type === 'movie') {
      data = await api('/movie/popular', { page })
      data.total_pages = Math.min(data.total_pages, 15)
    } else if (type === 'tv') {
      data = await api('/tv/popular', { page })
      data.total_pages = Math.min(data.total_pages, 15)
    } else if (type === 'anime') {
      data = await api('/discover/tv', { with_genres: '16', with_origin_country: 'JP', sort_by: 'popularity.desc', page })
      data.total_pages = Math.min(data.total_pages, 15)
    } else {
      data = await api('/tv/popular', { page })
      data.total_pages = Math.min(data.total_pages, 15)
    }

    // Stale call — a newer loadSearch was triggered while this one was fetching
    if (seq !== _loadSearchSeq) return

    searchState.totalPages = data.total_pages

    const grid = document.getElementById('search-grid')
    if (!data.results.length) {
      empty.classList.remove('hidden')
      empty.classList.add('flex')
    } else {
      if (query) {
        document.getElementById('search-count').textContent =
          `${data.total_results?.toLocaleString('pt-BR') || ''} resultados`
      } else {
        const countLabel = (data.total_results || 0).toLocaleString('pt-BR')
        document.getElementById('search-count').textContent =
          `${countLabel} títulos disponíveis`
      }
      data.results.forEach(c => {
        const t = type === 'movie' ? 'movie' :
                  type === 'tv'    ? 'tv' :
                  type === 'anime' ? 'tv' :
                  type === 'genre' ? (searchState.mediaType || getType(c)) :
                  getType(c)
        grid.insertAdjacentHTML('beforeend', cardHTML(c, t))
      })
      renderPagination()
    }
  } catch(e) {
    console.error(e)
  } finally {
    if (seq === _loadSearchSeq) {
      loading.classList.add('hidden')
      loading.classList.remove('flex')
    }
  }
}

function goToPage(page) {
  searchState.page = page
  loadSearch()
}

function renderPagination() {
  const { page, totalPages } = searchState
  if (totalPages <= 1) return
  const el = document.getElementById('pagination')
  el.classList.remove('hidden')
  el.classList.add('flex')

  const btn = (label, p, active = false, disabled = false) => {
    const cls = active ? 'page-btn page-btn-active' :
                disabled ? 'page-btn page-btn-disabled' :
                'page-btn page-btn-normal'
    return `<button onclick="${disabled ? '' : `goToPage(${p})`}" class="${cls}">${label}</button>`
  }
  const dots = `<span class="page-btn" style="color:rgba(255,255,255,.2);cursor:default">…</span>`

  let pages = []
  pages.push(btn('‹', page - 1, false, page === 1))
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(btn(i, i, i === page))
  } else {
    pages.push(btn(1, 1, page === 1))
    if (page > 3) pages.push(dots)
    for (let i = Math.max(2, page-1); i <= Math.min(totalPages-1, page+1); i++) pages.push(btn(i, i, i===page))
    if (page < totalPages - 2) pages.push(dots)
    pages.push(btn(totalPages, totalPages, page === totalPages))
  }
  pages.push(btn('›', page + 1, false, page === totalPages))
  el.innerHTML = pages.join('')
}

// ── MODAL ─────────────────────────────────────────────────────────
function closeModal() {
  document.getElementById('modal').classList.add('hidden')
  document.getElementById('modal').classList.remove('flex')
}
function closeModalOutside(e) {
  if (e.target === document.getElementById('modal')) closeModal()
}

// ── VIEW MANAGEMENT ───────────────────────────────────────────────
function showView(name) {
  currentView = name
  document.getElementById('view-home').classList.toggle('hidden', name !== 'home')
  document.getElementById('view-search').classList.toggle('hidden', name !== 'search')
  document.getElementById('view-player').classList.toggle('hidden', name !== 'player')

  const nav      = document.getElementById('navbar')
  const genreBar = document.getElementById('genre-bar')
  genreBar.classList.toggle('hidden', name === 'player')

  const navControls = document.getElementById('nav-player-controls')
  navControls.classList.toggle('hidden', name !== 'player')
  navControls.classList.toggle('flex', name === 'player')

  // Remove old scroll listener every time we switch view
  if (_scrollHandler) {
    window.removeEventListener('scroll', _scrollHandler)
    _scrollHandler = null
  }

  if (name === 'home') {
    _scrollHandler = () => {
      if (window.scrollY > 40) nav.classList.add('scrolled')
      else nav.classList.remove('scrolled')
    }
    nav.classList.remove('scrolled')
    nav.style.background = ''
    _scrollHandler()
    window.addEventListener('scroll', _scrollHandler, { passive: true })
  } else {
    nav.classList.add('scrolled')
    nav.style.background = ''
    if (name === 'player') window.scrollTo({ top: 0, behavior: 'instant' })
  }
}

function showHome() {
  if (currentView === 'player') closePlayer()
  else { showView('home'); setActiveNav('nav-home') }
}

function setActiveNav(id) {
  ['nav-home','nav-movie','nav-tv','nav-anime'].forEach(n => {
    const el = document.getElementById(n)
    if (el) el.classList.toggle('active', n === id)
  })
}

// ── GENRES ────────────────────────────────────────────────────────
const MOVIE_GENRES = [
  {id:28,name:'Ação'},{id:35,name:'Comédia'},{id:18,name:'Drama'},
  {id:27,name:'Terror'},{id:878,name:'Ficção Científica'},{id:53,name:'Thriller'},
  {id:12,name:'Aventura'},{id:16,name:'Animação'},{id:80,name:'Crime'},
  {id:14,name:'Fantasia'},{id:10749,name:'Romance'},{id:9648,name:'Mistério'},
  {id:10752,name:'Guerra'},{id:37,name:'Faroeste'},{id:99,name:'Documentário'},
]
const TV_GENRES = [
  {id:10759,name:'Ação & Aventura'},{id:35,name:'Comédia'},{id:18,name:'Drama'},
  {id:27,name:'Terror'},{id:10765,name:'Ficção Científica'},{id:80,name:'Crime'},
  {id:9648,name:'Mistério'},{id:16,name:'Animação'},{id:10751,name:'Família'},
  {id:10764,name:'Reality'},{id:99,name:'Documentário'},{id:10768,name:'Guerra'},
]

let activeGenreTab = 'movie'
let activeGenreId  = null

function setGenreTab(tab) {
  activeGenreTab = (tab === 'anime') ? 'tv' : tab
  activeGenreId  = null
  const on  = 'text-[11px] font-bold px-3.5 py-1 rounded-full border transition-all border-[#E50914] text-white bg-[#E50914]'
  const off = 'text-[11px] font-bold px-3.5 py-1 rounded-full border transition-all border-white/15 text-white/45'
  document.getElementById('gtab-movie').className = (tab === 'movie') ? on : off
  document.getElementById('gtab-tv').className    = (tab === 'tv' || tab === 'anime') ? on : off
  renderGenrePills()
}

function renderGenrePills() {
  const genres = activeGenreTab === 'movie' ? MOVIE_GENRES : TV_GENRES
  document.getElementById('genre-pills').innerHTML = genres.map(g => `
    <button onclick="browseGenre('${activeGenreTab}',${g.id},'${g.name}')"
      class="genre-pill ${activeGenreId === g.id ? 'active' : ''}">
      ${g.name}
    </button>`).join('')
}

function browseGenre(mediaType, genreId, genreName) {
  activeGenreId = genreId
  renderGenrePills()
  searchState = { query: '', type: 'genre', genreId, mediaType, page: 1, totalPages: 1 }
  document.getElementById('search-title').textContent = genreName
  document.getElementById('search-count').textContent = ''
  document.getElementById('search-grid').innerHTML = ''
  showView('search')
  loadSearch()
}

// ── AUTH ──────────────────────────────────────────────────────────
const CREDENTIALS = { user: atob('bHVjYXM='), pass: atob('c2FudG8=') }

function doLogin() {
  const user = document.getElementById('login-user').value.trim()
  const pass = document.getElementById('login-pass').value
  const err  = document.getElementById('login-error')

  if (user === CREDENTIALS.user && pass === CREDENTIALS.pass) {
    const screen = document.getElementById('login-screen')
    screen.style.transition = 'opacity .4s'
    screen.style.opacity = '0'
    setTimeout(() => screen.classList.add('hidden'), 400)
    localStorage.setItem('lf_auth', Date.now().toString())
    err.classList.add('hidden')
    // Restore saved player if it exists, otherwise go home
    const _saved = localStorage.getItem('lf_player')
    if (_saved) {
      try {
        const ps = JSON.parse(_saved)
        if (ps.id && ps.type) {
          openPlayer(ps.id, ps.type, { season: ps.season, episode: ps.episode })
          return
        }
      } catch(e) {}
    }
    init()
  } else {
    err.classList.remove('hidden')
    document.getElementById('login-pass').value = ''
    document.getElementById('login-pass').focus()
    document.getElementById('login-pass').closest('div').style.animation = 'none'
    requestAnimationFrame(() => {
      document.getElementById('login-pass').closest('div').style.animation = 'shake .3s ease'
    })
  }
}

// ── KEYBOARD ──────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!document.getElementById('modal').classList.contains('hidden')) closeModal()
  }
})

// ── BOOT ──────────────────────────────────────────────────────────
renderGenrePills()
setActiveNav('nav-home')
const _authTs = parseInt(localStorage.getItem('lf_auth') || '0', 10)
const _authValid = _authTs > 0 && (Date.now() - _authTs) < 24 * 60 * 60 * 1000
if (_authValid) {
  document.getElementById('login-screen').classList.add('hidden')
  const _saved = localStorage.getItem('lf_player')
  if (_saved) {
    try {
      const ps = JSON.parse(_saved)
      if (ps.id && ps.type) {
        openPlayer(ps.id, ps.type, { season: ps.season, episode: ps.episode })
      } else {
        init()
      }
    } catch(e) {
      init()
    }
  } else {
    init()
  }
} else {
  document.getElementById('login-user').focus()
}