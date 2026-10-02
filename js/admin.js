(function () {
  'use strict';

  var state = { content: null, pin: '', server: false, dirty: false };
  var app = document.getElementById('app');

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function field(label, input) {
    var wrap = document.createElement('label');
    wrap.className = 'field';
    var span = document.createElement('span');
    span.textContent = label;
    wrap.appendChild(span);
    wrap.appendChild(input);
    return wrap;
  }

  function textInput(value, onChange, multiline) {
    var el = document.createElement(multiline ? 'textarea' : 'input');
    if (!multiline) el.type = 'text';
    el.value = value == null ? '' : String(value);
    el.addEventListener('input', function () { onChange(el.value); markDirty(); });
    return el;
  }

  function numInput(value, onChange) {
    var el = document.createElement('input');
    el.type = 'number';
    el.value = value == null ? 0 : value;
    el.addEventListener('input', function () { onChange(Number(el.value)); markDirty(); });
    return el;
  }

  function checkInput(value, onChange, label) {
    var wrap = document.createElement('label');
    wrap.className = 'check';
    var el = document.createElement('input');
    el.type = 'checkbox';
    el.checked = !!value;
    el.addEventListener('change', function () { onChange(el.checked); markDirty(); });
    wrap.appendChild(el);
    wrap.appendChild(document.createTextNode(label));
    return wrap;
  }

  function imageField(label, src, onChange) {
    var box = document.createElement('div');
    box.className = 'image-field';
    var head = document.createElement('span');
    head.className = 'image-label';
    head.textContent = label;
    var preview = document.createElement('img');
    preview.alt = '';
    preview.className = 'preview';
    PADCMS.resolveSrc(src).then(function (url) {
      if (url) preview.src = url;
      else preview.removeAttribute('src');
    });
    var path = textInput(src, function (v) {
      onChange(v);
      PADCMS.resolveSrc(v).then(function (url) { preview.src = url || ''; });
    });
    path.placeholder = 'assets/photo.jpg or https://…';
    var file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      PADCMS.uploadFile(f, state.pin).then(function (stored) {
        path.value = stored;
        onChange(stored);
        markDirty();
        return PADCMS.resolveSrc(stored);
      }).then(function (url) {
        if (url) preview.src = url;
        setStatus('Image stored.', false);
      }).catch(function (err) {
        setStatus(err.message, true);
      });
    });
    var hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Upload a file, or paste a path / URL.';
    box.appendChild(head);
    box.appendChild(preview);
    box.appendChild(path);
    box.appendChild(file);
    box.appendChild(hint);
    return box;
  }

  function markDirty() {
    state.dirty = true;
    var el = document.getElementById('dirty');
    if (el) el.hidden = false;
  }

  function setStatus(msg, isError) {
    var el = document.getElementById('status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'status' + (isError ? ' err' : '');
  }

  function listEditor(items, factory, renderItem) {
    var wrap = document.createElement('div');
    wrap.className = 'list';
    function redraw() {
      wrap.innerHTML = '';
      items.forEach(function (item, i) {
        var card = document.createElement('article');
        card.className = 'card';
        var bar = document.createElement('div');
        bar.className = 'card-bar';
        var title = document.createElement('strong');
        title.textContent = String(i + 1).padStart(2, '0');
        var tools = document.createElement('div');
        tools.className = 'tools';
        function btn(label, fn) {
          var b = document.createElement('button');
          b.type = 'button';
          b.textContent = label;
          b.addEventListener('click', fn);
          return b;
        }
        tools.appendChild(btn('Up', function () {
          if (i === 0) return;
          items.splice(i - 1, 0, items.splice(i, 1)[0]);
          markDirty(); redraw();
        }));
        tools.appendChild(btn('Down', function () {
          if (i >= items.length - 1) return;
          items.splice(i + 1, 0, items.splice(i, 1)[0]);
          markDirty(); redraw();
        }));
        tools.appendChild(btn('Remove', function () {
          items.splice(i, 1);
          markDirty(); redraw();
        }));
        bar.appendChild(title);
        bar.appendChild(tools);
        card.appendChild(bar);
        card.appendChild(renderItem(item, i));
        wrap.appendChild(card);
      });
      var add = document.createElement('button');
      add.type = 'button';
      add.className = 'add';
      add.textContent = 'Add item';
      add.addEventListener('click', function () {
        items.push(factory());
        markDirty();
        redraw();
      });
      wrap.appendChild(add);
    }
    redraw();
    return wrap;
  }

  function section(id, title, nodes) {
    var sec = document.createElement('section');
    sec.id = id;
    sec.className = 'panel';
    var h2 = document.createElement('h2');
    h2.textContent = title;
    sec.appendChild(h2);
    nodes.forEach(function (n) { sec.appendChild(n); });
    return sec;
  }

  function grid(nodes) {
    var g = document.createElement('div');
    g.className = 'grid';
    nodes.forEach(function (n) { g.appendChild(n); });
    return g;
  }

  function buildEditor(c) {
    var brand = c.brand;
    var hero = c.hero;
    var story = c.story;
    var net = c.network;
    var map = c.map;
    var brands = c.brands;
    var inq = c.inquire;
    var team = c.teamPage;
    var foot = c.footer;
    var meta = c.meta;

    var root = document.createElement('div');

    root.appendChild(section('identity', 'Identity & SEO', [
      grid([
        field('Short name', textInput(brand.shortName, function (v) { brand.shortName = v; })),
        field('Name subtitle', textInput(brand.nameSub, function (v) { brand.nameSub = v; })),
        field('Legal name', textInput(brand.legalName, function (v) { brand.legalName = v; })),
        field('Preloader word', textInput(brand.preloaderWord, function (v) { brand.preloaderWord = v; })),
        field('Preloader tag', textInput(brand.preloaderTag, function (v) { brand.preloaderTag = v; })),
        field('Gallery ticker word', textInput(brand.ticker, function (v) { brand.ticker = v; })),
        field('Phone display', textInput(brand.phoneDisplay, function (v) { brand.phoneDisplay = v; })),
        field('Phone link (tel:)', textInput(brand.phoneHref, function (v) { brand.phoneHref = v; }))
      ]),
      imageField('Lion / mark', brand.lionSrc, function (v) { brand.lionSrc = v; }),
      field('Mobile menu address', textInput(c.menuFoot, function (v) { c.menuFoot = v; }, true)),
      grid([
        field('Home page title', textInput(meta.homeTitle, function (v) { meta.homeTitle = v; })),
        field('Home meta description', textInput(meta.homeDescription, function (v) { meta.homeDescription = v; }, true)),
        field('Leadership page title', textInput(meta.teamTitle, function (v) { meta.teamTitle = v; })),
        field('Leadership meta description', textInput(meta.teamDescription, function (v) { meta.teamDescription = v; }, true))
      ])
    ]));

    root.appendChild(section('nav', 'Navigation', [
      document.createTextNode(''),
      (function () {
        var p = document.createElement('p');
        p.className = 'lede';
        p.textContent = 'Home page links. Use #story for in-page sections, or team.html for other pages.';
        return p;
      })(),
      listEditor(c.nav.homeLinks, function () { return { label: 'New link', href: '#' }; }, function (item) {
        return grid([
          field('Label', textInput(item.label, function (v) { item.label = v; })),
          field('Href', textInput(item.href, function (v) { item.href = v; }))
        ]);
      }),
      (function () {
        var p = document.createElement('p');
        p.className = 'lede';
        p.textContent = 'Leadership page links (usually point back to index.html#…).';
        return p;
      })(),
      listEditor(c.nav.teamLinks, function () { return { label: 'New link', href: 'index.html#' }; }, function (item) {
        var box = document.createElement('div');
        box.appendChild(grid([
          field('Label', textInput(item.label, function (v) { item.label = v; })),
          field('Href', textInput(item.href, function (v) { item.href = v; }))
        ]));
        box.appendChild(checkInput(item.current, function (v) { item.current = v; }, 'Mark as current page'));
        return box;
      })
    ]));

    root.appendChild(section('hero', 'Hero', [
      grid([
        field('Kicker', textInput(hero.kicker, function (v) { hero.kicker = v; })),
        field('Headline', textInput(hero.headline, function (v) { hero.headline = v; })),
        field('Desktop subtitle (line breaks allowed)', textInput(hero.subtitleDesktop, function (v) { hero.subtitleDesktop = v; }, true)),
        field('Mobile subtitle', textInput(hero.subtitleMobile, function (v) { hero.subtitleMobile = v; }, true)),
        field('Image alt text', textInput(hero.imageAlt, function (v) { hero.imageAlt = v; }))
      ]),
      imageField('Hero photograph', hero.image, function (v) { hero.image = v; }),
      (function () {
        var p = document.createElement('p');
        p.className = 'lede';
        p.textContent = 'Bottom strip chips';
        return p;
      })(),
      listEditor(hero.strip, function () { return 'New chip'; }, function (item, i) {
        return field('Chip', textInput(item, function (v) { hero.strip[i] = v; }));
      })
    ]));

    root.appendChild(section('statement', 'Statement & stats', [
      field('Dark-band statement (line breaks become new lines)', textInput(c.statement.text, function (v) { c.statement.text = v; }, true)),
      listEditor(c.stats, function () { return { end: 0, suffix: '', group: false, label: 'New stat' }; }, function (item) {
        return grid([
          field('Number', numInput(item.end, function (v) { item.end = v; })),
          field('Suffix (+, %, etc.)', textInput(item.suffix, function (v) { item.suffix = v; })),
          field('Label', textInput(item.label, function (v) { item.label = v; })),
          checkInput(item.group, function (v) { item.group = v; }, 'Use thousands separator')
        ]);
      })
    ]));

    root.appendChild(section('gallery', 'Gallery', [
      grid([
        field('Title', textInput(c.gallery.title, function (v) { c.gallery.title = v; })),
        field('Subtitle', textInput(c.gallery.subtitle, function (v) { c.gallery.subtitle = v; }))
      ]),
      listEditor(c.gallery.items, function () {
        return { src: '', name: 'New frame', note: '' };
      }, function (item) {
        var box = document.createElement('div');
        box.appendChild(grid([
          field('Name', textInput(item.name, function (v) { item.name = v; })),
          field('Note', textInput(item.note, function (v) { item.note = v; }))
        ]));
        box.appendChild(imageField('Photograph', item.src, function (v) { item.src = v; }));
        return box;
      })
    ]));

    root.appendChild(section('story', 'Story', [
      grid([
        field('Eyebrow', textInput(story.eyebrow, function (v) { story.eyebrow = v; })),
        field('Title', textInput(story.title, function (v) { story.title = v; }, true)),
        field('Lead paragraph', textInput(story.lead, function (v) { story.lead = v; }, true)),
        field('Body', textInput(story.body, function (v) { story.body = v; }, true)),
        field('Caption left', textInput(story.captionLeft, function (v) { story.captionLeft = v; })),
        field('Caption right', textInput(story.captionRight, function (v) { story.captionRight = v; })),
        field('Image alt', textInput(story.imageAlt, function (v) { story.imageAlt = v; }))
      ]),
      imageField('Story photograph', story.image, function (v) { story.image = v; }),
      listEditor(story.facts, function () { return { label: 'Label', value: 'Value' }; }, function (item) {
        return grid([
          field('Label', textInput(item.label, function (v) { item.label = v; })),
          field('Value', textInput(item.value, function (v) { item.value = v; }))
        ]);
      })
    ]));

    root.appendChild(section('network', 'Network', [
      grid([
        field('Eyebrow', textInput(net.eyebrow, function (v) { net.eyebrow = v; })),
        field('Title', textInput(net.title, function (v) { net.title = v; }, true)),
        field('Body', textInput(net.body, function (v) { net.body = v; }, true)),
        field('Image alt', textInput(net.imageAlt, function (v) { net.imageAlt = v; }))
      ]),
      imageField('Network photograph', net.image, function (v) { net.image = v; }),
      (function () { var p = document.createElement('p'); p.className = 'lede'; p.textContent = 'Depots'; return p; })(),
      listEditor(net.depots, function () { return { idx: '04', place: 'Town', role: 'Depot' }; }, function (item) {
        return grid([
          field('Index', textInput(item.idx, function (v) { item.idx = v; })),
          field('Place', textInput(item.place, function (v) { item.place = v; })),
          field('Role', textInput(item.role, function (v) { item.role = v; }))
        ]);
      }),
      (function () { var p = document.createElement('p'); p.className = 'lede'; p.textContent = 'Route chips'; return p; })(),
      listEditor(net.routes, function () { return 'New route'; }, function (item, i) {
        return field('Route', textInput(item, function (v) { net.routes[i] = v; }));
      })
    ]));

    root.appendChild(section('map', 'Map copy', [
      grid([
        field('Title', textInput(map.title, function (v) { map.title = v; })),
        field('Intro', textInput(map.intro, function (v) { map.intro = v; }, true)),
        field('Map aria label', textInput(map.ariaLabel, function (v) { map.ariaLabel = v; }, true))
      ]),
      listEditor(map.legend, function () { return { kind: 'town', title: 'Title', text: 'Detail' }; }, function (item) {
        return grid([
          field('Kind (depot or town)', textInput(item.kind, function (v) { item.kind = v; })),
          field('Title', textInput(item.title, function (v) { item.title = v; })),
          field('Text', textInput(item.text, function (v) { item.text = v; }, true))
        ]);
      })
    ]));

    root.appendChild(section('brands', 'Principal brands', [
      grid([
        field('Eyebrow', textInput(brands.eyebrow, function (v) { brands.eyebrow = v; })),
        field('Title', textInput(brands.title, function (v) { brands.title = v; }, true)),
        field('Intro', textInput(brands.intro, function (v) { brands.intro = v; }, true)),
        field('Footnote', textInput(brands.note, function (v) { brands.note = v; }, true))
      ]),
      listEditor(brands.items, function () {
        return { idx: '00 / Principal', name: 'New brand', desc: '', caption: '', image: '', imageAlt: '' };
      }, function (item) {
        var box = document.createElement('div');
        box.appendChild(grid([
          field('Index line', textInput(item.idx, function (v) { item.idx = v; })),
          field('Name', textInput(item.name, function (v) { item.name = v; })),
          field('Caption on photo', textInput(item.caption, function (v) { item.caption = v; })),
          field('Description', textInput(item.desc, function (v) { item.desc = v; }, true)),
          field('Image alt', textInput(item.imageAlt, function (v) { item.imageAlt = v; }))
        ]));
        box.appendChild(imageField('Brand photograph', item.image, function (v) { item.image = v; }));
        return box;
      })
    ]));

    root.appendChild(section('inquire', 'Inquire', [
      grid([
        field('Eyebrow', textInput(inq.eyebrow, function (v) { inq.eyebrow = v; })),
        field('Title', textInput(inq.title, function (v) { inq.title = v; }, true)),
        field('Intro', textInput(inq.intro, function (v) { inq.intro = v; }, true)),
        field('Submit button', textInput(inq.submitLabel, function (v) { inq.submitLabel = v; })),
        field('Form note', textInput(inq.formNote, function (v) { inq.formNote = v; })),
        field('Success title', textInput(inq.successTitle, function (v) { inq.successTitle = v; })),
        field('Success body', textInput(inq.successBody, function (v) { inq.successBody = v; }, true))
      ]),
      listEditor(inq.details, function () { return { label: 'Label', html: 'Detail' }; }, function (item) {
        return grid([
          field('Label', textInput(item.label, function (v) { item.label = v; })),
          field('Value (HTML allowed, e.g. phone links)', textInput(item.html, function (v) { item.html = v; }, true))
        ]);
      })
    ]));

    root.appendChild(section('team', 'Leadership', [
      grid([
        field('Eyebrow', textInput(team.eyebrow, function (v) { team.eyebrow = v; })),
        field('Title', textInput(team.title, function (v) { team.title = v; }, true)),
        field('Intro', textInput(team.intro, function (v) { team.intro = v; }, true)),
        field('Crumb back link', textInput(team.crumbSite, function (v) { team.crumbSite = v; })),
        field('Crumb meta', textInput(team.crumbMeta, function (v) { team.crumbMeta = v; })),
        field('Footnote', textInput(team.note, function (v) { team.note = v; }, true)),
        field('CTA eyebrow', textInput(team.ctaEyebrow, function (v) { team.ctaEyebrow = v; })),
        field('CTA title', textInput(team.ctaTitle, function (v) { team.ctaTitle = v; })),
        field('CTA body', textInput(team.ctaBody, function (v) { team.ctaBody = v; }, true)),
        field('CTA button', textInput(team.ctaButton, function (v) { team.ctaButton = v; }))
      ]),
      listEditor(team.people, function () {
        return { initials: '', name: 'New person', role: '', bio: '', photo: '', photoAlt: '' };
      }, function (item) {
        var box = document.createElement('div');
        box.appendChild(grid([
          field('Initials (used if no photo)', textInput(item.initials, function (v) { item.initials = v; })),
          field('Name', textInput(item.name, function (v) { item.name = v; })),
          field('Role', textInput(item.role, function (v) { item.role = v; })),
          field('Bio', textInput(item.bio, function (v) { item.bio = v; }, true)),
          field('Photo alt', textInput(item.photoAlt, function (v) { item.photoAlt = v; }))
        ]));
        box.appendChild(imageField('Portrait (optional)', item.photo, function (v) { item.photo = v; }));
        return box;
      })
    ]));

    root.appendChild(section('footer', 'Footer & access', [
      grid([
        field('Footer brand line', textInput(foot.brand, function (v) { foot.brand = v; })),
        field('Footer meta line', textInput(foot.meta, function (v) { foot.meta = v; })),
        field('Editor PIN', textInput(c.settings.adminPin, function (v) { c.settings.adminPin = v; }))
      ]),
      (function () {
        var p = document.createElement('p');
        p.className = 'lede';
        p.textContent = 'Change the PIN after first use. Anyone who can open admin.html still needs this PIN.';
        return p;
      })()
    ]));

    return root;
  }

  function renderShell() {
    app.innerHTML = '';
    var header = document.createElement('header');
    header.className = 'top';
    header.innerHTML = '<a class="back" href="index.html">← View site</a><h1>Site editor</h1>';
    var meta = document.createElement('p');
    meta.className = 'server-flag';
    meta.id = 'serverFlag';
    header.appendChild(meta);

    var layout = document.createElement('div');
    layout.className = 'layout';
    var aside = document.createElement('nav');
    aside.className = 'toc';
    aside.setAttribute('aria-label', 'Sections');
    [
      ['identity', 'Identity'],
      ['nav', 'Navigation'],
      ['hero', 'Hero'],
      ['statement', 'Stats'],
      ['gallery', 'Gallery'],
      ['story', 'Story'],
      ['network', 'Network'],
      ['map', 'Map'],
      ['brands', 'Brands'],
      ['inquire', 'Inquire'],
      ['team', 'Leadership'],
      ['footer', 'Footer']
    ].forEach(function (pair) {
      var a = document.createElement('a');
      a.href = '#' + pair[0];
      a.textContent = pair[1];
      aside.appendChild(a);
    });

    var main = document.createElement('div');
    main.className = 'main';
    main.appendChild(buildEditor(state.content));

    var bar = document.createElement('div');
    bar.className = 'savebar';
    bar.innerHTML =
      '<p id="status" class="status"></p>' +
      '<p id="dirty" class="dirty" hidden>Unsaved changes</p>' +
      '<button type="button" id="saveBrowser">Save in this browser</button>' +
      '<button type="button" id="saveDisk" class="primary">Save to disk</button>' +
      '<button type="button" id="exportJson">Download JSON</button>' +
      '<button type="button" id="resetLocal">Clear browser overlay</button>';

    layout.appendChild(aside);
    layout.appendChild(main);
    app.appendChild(header);
    app.appendChild(layout);
    app.appendChild(bar);

    document.getElementById('serverFlag').textContent = state.server
      ? 'Disk save is available — photos write into assets/uploads.'
      : 'No editor server — saves stay in this browser. Run node server.js for disk + file uploads.';

    document.getElementById('saveBrowser').addEventListener('click', function () {
      PADCMS.saveLocal(state.content).then(function () {
        state.dirty = false;
        document.getElementById('dirty').hidden = true;
        setStatus('Saved in this browser. Refresh the public site to see it here.', false);
      });
    });
    document.getElementById('saveDisk').addEventListener('click', function () {
      PADCMS.saveRemote(state.content, state.pin).then(function () {
        state.dirty = false;
        document.getElementById('dirty').hidden = true;
        setStatus('Saved to content.json on disk.', false);
      }).catch(function (err) {
        setStatus(err.message + ' — saved in the browser instead if you use that button.', true);
      });
    });
    document.getElementById('exportJson').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(state.content, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'content.json';
      a.click();
    });
    document.getElementById('resetLocal').addEventListener('click', function () {
      localStorage.removeItem(PADCMS.STORAGE_KEY);
      setStatus('Browser overlay cleared. Reloading…', false);
      setTimeout(function () { location.reload(); }, 400);
    });
  }

  function renderGate() {
    app.innerHTML =
      '<div class="gate">' +
      '<p class="eyebrow">Panafrica Distributors</p>' +
      '<h1>Site editor</h1>' +
      '<p>Enter the editor PIN to change copy, photographs, brands, people and contact details.</p>' +
      '<form id="gateForm">' +
      '<label class="field"><span>PIN</span><input id="pin" type="password" autocomplete="current-password" required></label>' +
      '<button class="primary" type="submit">Open editor</button>' +
      '<p class="hint">Default PIN is <code>panafrica</code> until you change it in Footer &amp; access.</p>' +
      '</form>' +
      '<p id="gateErr" class="status err" hidden></p>' +
      '</div>';
    document.getElementById('gateForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var pin = document.getElementById('pin').value;
      if (pin !== (state.content.settings && state.content.settings.adminPin)) {
        var err = document.getElementById('gateErr');
        err.hidden = false;
        err.textContent = 'That PIN does not match.';
        return;
      }
      state.pin = pin;
      sessionStorage.setItem(PADCMS.PIN_KEY, '1');
      renderShell();
    });
  }

  Promise.all([PADCMS.loadContent(), PADCMS.probeServer()]).then(function (parts) {
    state.content = clone(parts[0]);
    state.server = parts[1];
    if (sessionStorage.getItem(PADCMS.PIN_KEY) === '1') {
      state.pin = state.content.settings.adminPin;
      renderShell();
    } else {
      renderGate();
    }
  }).catch(function (err) {
    app.innerHTML = '<p class="gate">Could not load content.json. ' + err.message + '</p>';
  });
})();
