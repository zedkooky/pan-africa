(function (global) {
  'use strict';

  var STORAGE_KEY = 'pad-cms-content';
  var PIN_KEY = 'pad-cms-authed';
  var DB_NAME = 'pad-cms-assets';
  var STORE = 'files';
  var blobCache = {};

  function getPath(obj, path) {
    if (!obj || !path) return undefined;
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function setPath(obj, path, value) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var key = parts[i];
      if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
      cur = cur[key];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function nlToBr(text) {
    if (text == null) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) { resolve(null); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
    });
  }

  async function putAsset(id, blob) {
    var db = await openDb();
    if (!db) return null;
    return new Promise(function (resolve) {
      var tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = function () { resolve(id); };
      tx.onerror = function () { resolve(null); };
    });
  }

  async function getAsset(id) {
    if (blobCache[id]) return blobCache[id];
    var db = await openDb();
    if (!db) return null;
    return new Promise(function (resolve) {
      var tx = db.transaction(STORE, 'readonly');
      var req = tx.objectStore(STORE).get(id);
      req.onsuccess = function () {
        var blob = req.result;
        if (!blob) { resolve(null); return; }
        var url = URL.createObjectURL(blob);
        blobCache[id] = url;
        resolve(url);
      };
      req.onerror = function () { resolve(null); };
    });
  }

  async function resolveSrc(src) {
    if (!src) return '';
    if (src.indexOf('idb:') === 0) {
      var url = await getAsset(src.slice(4));
      return url || '';
    }
    return src;
  }

  async function fetchJson(url) {
    var res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function loadContent() {
    var fileContent = null;
    var apiContent = null;
    try { apiContent = await fetchJson('/api/content'); } catch (e) { /* no server */ }
    try { fileContent = await fetchJson('content.json'); } catch (e) { /* missing file */ }

    var local = null;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) local = JSON.parse(raw);
    } catch (e) { local = null; }

    var candidates = [apiContent, local, fileContent].filter(Boolean);
    if (!candidates.length) throw new Error('No content available');
    candidates.sort(function (a, b) {
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
    return candidates[0];
  }

  async function saveLocal(content) {
    content.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
    return content;
  }

  async function saveRemote(content, pin) {
    content.updatedAt = new Date().toISOString();
    var res = await fetch('/api/content', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Pin': pin || ''
      },
      body: JSON.stringify(content)
    });
    if (!res.ok) {
      var err = await res.json().catch(function () { return {}; });
      throw new Error(err.error || 'Could not save to disk');
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
    return res.json();
  }

  async function probeServer() {
    try {
      var res = await fetch('/api/health', { cache: 'no-store' });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async function uploadFile(file, pin) {
    var online = await probeServer();
    if (online) {
      var buf = await file.arrayBuffer();
      var bytes = new Uint8Array(buf);
      var binary = '';
      for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      var b64 = btoa(binary);
      var res = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Pin': pin || ''
        },
        body: JSON.stringify({
          filename: file.name,
          mime: file.type || 'application/octet-stream',
          data: b64
        })
      });
      if (!res.ok) throw new Error('Upload failed');
      var out = await res.json();
      return out.path;
    }
    var id = 'asset-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    var stored = await putAsset(id, file);
    if (!stored) throw new Error('Could not store image in this browser');
    return 'idb:' + id;
  }

  async function applyMedia(root, content) {
    var nodes = (root || document).querySelectorAll('[data-cms-src]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var src = getPath(content, el.getAttribute('data-cms-src'));
      var resolved = await resolveSrc(src);
      if (resolved) el.setAttribute('src', resolved);
      var altPath = el.getAttribute('data-cms-alt');
      if (altPath) {
        var alt = getPath(content, altPath);
        if (alt != null) el.setAttribute('alt', alt);
      }
    }
    var lion = getPath(content, 'brand.lionSrc');
    var lionUrl = await resolveSrc(lion);
    if (lionUrl) {
      document.documentElement.style.setProperty('--lion-mask', 'url("' + lionUrl + '")');
    }
  }

  function applyText(root, content) {
    (root || document).querySelectorAll('[data-cms]').forEach(function (el) {
      var v = getPath(content, el.getAttribute('data-cms'));
      if (v == null) return;
      el.textContent = v;
    });
    (root || document).querySelectorAll('[data-cms-html]').forEach(function (el) {
      var v = getPath(content, el.getAttribute('data-cms-html'));
      if (v == null) return;
      if (el.getAttribute('data-cms-nl') === 'true') el.innerHTML = nlToBr(v);
      else el.innerHTML = v;
    });
    (root || document).querySelectorAll('[data-cms-href]').forEach(function (el) {
      var v = getPath(content, el.getAttribute('data-cms-href'));
      if (v != null) el.setAttribute('href', v);
    });
  }

  function renderNav(content, kind) {
    var links = kind === 'team' ? content.nav.teamLinks : content.nav.homeLinks;
    document.querySelectorAll('[data-nav]').forEach(function (nav) {
      nav.innerHTML = '';
      links.forEach(function (link) {
        var a = document.createElement('a');
        a.href = link.href;
        a.textContent = link.label;
        if (link.current) a.setAttribute('aria-current', 'page');
        nav.appendChild(a);
      });
    });
  }

  function renderHeroStrip(content) {
    var el = document.getElementById('heroStrip');
    if (!el) return;
    el.innerHTML = '';
    (content.hero.strip || []).forEach(function (item) {
      var span = document.createElement('span');
      span.textContent = item;
      el.appendChild(span);
    });
  }

  function renderStats(content) {
    var row = document.getElementById('statsRow');
    if (!row) return;
    row.innerHTML = '';
    (content.stats || []).forEach(function (stat) {
      var wrap = document.createElement('div');
      wrap.className = 's2-stat od-stat';
      var num = document.createElement('div');
      num.className = 's2-num';
      num.setAttribute('data-end', String(stat.end));
      num.setAttribute('data-suffix', stat.suffix || '');
      if (stat.group) num.setAttribute('data-group', '1');
      num.textContent = '0' + (stat.suffix || '');
      var label = document.createElement('div');
      label.className = 's2-label';
      label.textContent = stat.label;
      wrap.appendChild(num);
      wrap.appendChild(label);
      row.appendChild(wrap);
    });
  }

  async function renderGallery(content) {
    var row = document.getElementById('galleryRow');
    if (!row) return;
    row.innerHTML = '';
    var items = (content.gallery && content.gallery.items) || [];
    for (var i = 0; i < items.length; i++) {
      var p = items[i];
      var item = document.createElement('button');
      item.className = 'gallery-expand-item';
      item.type = 'button';
      item.setAttribute('aria-label', p.name + ' — ' + p.note);
      var img = document.createElement('img');
      img.src = await resolveSrc(p.src);
      img.alt = (p.name || '') + ': ' + (p.note || '');
      img.loading = 'lazy';
      var cap = document.createElement('div');
      cap.className = 'gallery-cap';
      var idx = document.createElement('span');
      idx.className = 'cap-idx';
      idx.textContent = String(i + 1).padStart(2, '0');
      var name = document.createElement('span');
      name.className = 'cap-name';
      name.textContent = p.name;
      var note = document.createElement('span');
      note.className = 'cap-note';
      note.textContent = p.note;
      cap.appendChild(idx);
      cap.appendChild(name);
      cap.appendChild(note);
      item.appendChild(img);
      item.appendChild(cap);
      row.appendChild(item);
    }
  }

  function renderFacts(content) {
    var el = document.getElementById('storyFacts');
    if (!el) return;
    el.innerHTML = '';
    (content.story.facts || []).forEach(function (f) {
      var div = document.createElement('div');
      div.className = 'fact';
      var dt = document.createElement('dt');
      dt.textContent = f.label;
      var dd = document.createElement('dd');
      dd.textContent = f.value;
      div.appendChild(dt);
      div.appendChild(dd);
      el.appendChild(div);
    });
  }

  function renderDepots(content) {
    var el = document.getElementById('depotList');
    if (!el) return;
    el.innerHTML = '';
    (content.network.depots || []).forEach(function (d) {
      var row = document.createElement('div');
      row.className = 'depot';
      var idx = document.createElement('span');
      idx.className = 'd-idx';
      idx.textContent = d.idx;
      var place = document.createElement('span');
      place.className = 'd-place';
      place.textContent = d.place;
      var role = document.createElement('span');
      role.className = 'd-role';
      role.textContent = d.role;
      row.appendChild(idx);
      row.appendChild(place);
      row.appendChild(role);
      el.appendChild(row);
    });
  }

  function renderRoutes(content) {
    var el = document.getElementById('routeList');
    if (!el) return;
    el.innerHTML = '';
    (content.network.routes || []).forEach(function (r) {
      var span = document.createElement('span');
      span.className = 'route-chip od-nowrap';
      span.textContent = r;
      el.appendChild(span);
    });
  }

  function renderLegend(content) {
    var el = document.getElementById('mapLegend');
    if (!el) return;
    el.innerHTML = '';
    (content.map.legend || []).forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'lg-item';
      var dot = document.createElement('span');
      dot.className = 'lg-dot' + (item.kind === 'depot' ? ' depot' : '');
      dot.setAttribute('aria-hidden', 'true');
      var span = document.createElement('span');
      var b = document.createElement('b');
      b.textContent = item.title;
      span.appendChild(b);
      span.appendChild(document.createTextNode(item.text));
      li.appendChild(dot);
      li.appendChild(span);
      el.appendChild(li);
    });
  }

  async function renderBrands(content) {
    var el = document.getElementById('brandRows');
    if (!el) return;
    el.innerHTML = '';
    var items = (content.brands && content.brands.items) || [];
    for (var i = 0; i < items.length; i++) {
      var b = items[i];
      var art = document.createElement('article');
      art.className = 'brand-feature reveal';
      var fig = document.createElement('figure');
      fig.className = 'brand-media';
      var img = document.createElement('img');
      img.className = 'od-media';
      img.src = await resolveSrc(b.image);
      img.alt = b.imageAlt || b.name;
      img.width = 1200;
      img.height = 960;
      img.loading = 'lazy';
      var cap = document.createElement('figcaption');
      cap.textContent = b.caption;
      fig.appendChild(img);
      fig.appendChild(cap);
      var body = document.createElement('div');
      body.className = 'brand-body';
      var idx = document.createElement('p');
      idx.className = 'b-idx';
      idx.textContent = b.idx;
      
      var headerRow = document.createElement('div');
      headerRow.className = 'brand-header-row';

      var h3 = document.createElement('h3');
      h3.className = 'b-name';
      h3.textContent = b.name;

      var badge = document.createElement('span');
      badge.className = 'brand-logo-badge';
      if (b.name.indexOf('British American') !== -1) { badge.classList.add('bat'); badge.textContent = 'BAT'; }
      else if (b.name.indexOf('Nestl') !== -1) { badge.classList.add('nestle'); badge.textContent = 'Nestlé'; }
      else if (b.name.indexOf('Lion Match') !== -1) { badge.classList.add('lion'); badge.textContent = 'Lion Match'; }
      else if (b.name.indexOf('Colgate') !== -1) { badge.classList.add('colgate'); badge.textContent = 'Colgate'; }
      else if (b.name.indexOf('Sylko') !== -1) { badge.classList.add('sylko'); badge.textContent = 'Sylko'; }
      else if (b.name.indexOf('Promasidor') !== -1) { badge.classList.add('promasidor'); badge.textContent = 'Promasidor'; }
      else { badge.classList.add('dgm'); badge.textContent = 'DGM'; }

      headerRow.appendChild(h3);
      headerRow.appendChild(badge);

      var desc = document.createElement('p');
      desc.className = 'b-desc';
      desc.textContent = b.desc;
      body.appendChild(idx);
      body.appendChild(headerRow);
      body.appendChild(desc);
      art.appendChild(fig);
      art.appendChild(body);
      el.appendChild(art);
    }
  }

  function renderInquireDetails(content) {
    var el = document.getElementById('inqDetails');
    if (!el) return;
    el.innerHTML = '';
    (content.inquire.details || []).forEach(function (d) {
      var wrap = document.createElement('div');
      wrap.className = 'inq-detail';
      var dt = document.createElement('dt');
      dt.textContent = d.label;
      var dd = document.createElement('dd');
      dd.innerHTML = d.html;
      wrap.appendChild(dt);
      wrap.appendChild(dd);
      el.appendChild(wrap);
    });
  }

  async function renderTeam(content) {
    var el = document.getElementById('teamGrid');
    if (!el) return;
    el.innerHTML = '';
    var people = (content.teamPage && content.teamPage.people) || [];
    for (var i = 0; i < people.length; i++) {
      var p = people[i];
      var art = document.createElement('article');
      art.className = 'team-card reveal';
      if (p.photo) {
        var img = document.createElement('img');
        img.className = 'team-photo';
        img.src = await resolveSrc(p.photo);
        img.alt = p.photoAlt || p.name;
        img.width = 640;
        img.height = 800;
        art.appendChild(img);
      } else {
        var mono = document.createElement('span');
        mono.className = 'team-mono';
        mono.setAttribute('aria-hidden', 'true');
        mono.textContent = p.initials || '';
        art.appendChild(mono);
      }
      var h2 = document.createElement('h2');
      h2.className = 'team-name';
      h2.textContent = p.name;
      var role = document.createElement('p');
      role.className = 'team-role';
      role.textContent = p.role;
      var bio = document.createElement('p');
      bio.className = 'team-bio';
      bio.textContent = p.bio;
      art.appendChild(h2);
      art.appendChild(role);
      art.appendChild(bio);
      el.appendChild(art);
    }
  }

  function renderTicker(content) {
    var tracks = document.querySelectorAll('.ticker-track span');
    var word = (content.brand && content.brand.ticker) || 'Panafrica.';
    var unit = word + '\u00a0\u00a0\u00a0';
    var line = '';
    for (var i = 0; i < 6; i++) line += unit;
    tracks.forEach(function (span) { span.textContent = line; });
  }

  async function hydrate(page) {
    var content = await loadContent();
    document.title = page === 'team' ? content.meta.teamTitle : content.meta.homeTitle;
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', page === 'team' ? content.meta.teamDescription : content.meta.homeDescription);

    applyText(document, content);
    await applyMedia(document, content);
    renderNav(content, page);
    renderTicker(content);
    renderHeroStrip(content);
    renderStats(content);
    await renderGallery(content);
    renderFacts(content);
    renderDepots(content);
    renderRoutes(content);
    renderLegend(content);
    await renderBrands(content);
    renderInquireDetails(content);
    await renderTeam(content);

    var map = document.querySelector('.zm-map');
    if (map && content.map && content.map.ariaLabel) {
      map.setAttribute('aria-label', content.map.ariaLabel);
    }
    return content;
  }

  global.PADCMS = {
    STORAGE_KEY: STORAGE_KEY,
    PIN_KEY: PIN_KEY,
    getPath: getPath,
    setPath: setPath,
    nlToBr: nlToBr,
    loadContent: loadContent,
    saveLocal: saveLocal,
    saveRemote: saveRemote,
    probeServer: probeServer,
    uploadFile: uploadFile,
    resolveSrc: resolveSrc,
    hydrate: hydrate
  };
})(window);
