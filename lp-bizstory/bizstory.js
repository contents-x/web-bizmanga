/* ビズストーリー LP（lp-bizstory/）: 事例のタブ・一覧・見る窓。
   事例は共用 WordPress（cms.contentsx.jp）から読むだけ（書き込まない）。
   - マンガ: GET /works?site=bizmanga（ビズマンガのサイトと同じ並び）
   - アニメ・ビデオ: GET /bizanime-videos（WP「ビズアニメ・ビズビデオ動画」）
   WP の値は HTML として扱わない（textContent だけで描く）。画像・動画の URL は決まった場所のものだけ使い、
   動画は ID から youtube-nocookie の URL を作り直す（WP の embed 値をそのまま iframe に入れない）。
   ビズマンガのサイトの共通部品（bm-wp-api.js・works.js など）は読み込まない・書き換えない。 */
(function () {
  'use strict';

  var API = 'https://cms.contentsx.jp/wp-json/contentsx/v1';
  var TIMEOUT_MS = 8000;
  var IMAGE_HOSTS = ['https://cms.contentsx.jp/', 'https://i.ytimg.com/'];
  var YT_ID = /^[A-Za-z0-9_-]{6,20}$/;
  var YT_LIST = /^[A-Za-z0-9_-]{10,64}$/;
  var MANGA_ID = /^[A-Za-z0-9_-]{1,80}$/;
  var ANIME_LABEL = { ADVERTISING: '広告', VTUBER: 'VTuber', MUSIC_VIDEO: 'MV', IP: 'オリジナルIP', VFX: 'VFX', OTHER: '作品' };

  var lastFocus = null;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null && text !== '') node.textContent = String(text);
    return node;
  }

  function safeImage(url) {
    if (typeof url !== 'string') return '';
    for (var i = 0; i < IMAGE_HOSTS.length; i++) {
      if (url.indexOf(IMAGE_HOSTS[i]) === 0 && !/[\s"'<>\\]/.test(url)) return url;
    }
    return '';
  }

  function getJSON(path) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
    return fetch(API + path, { credentials: 'omit', signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  /* ---------- タブ ---------- */
  function selectTab(name, focus) {
    $all('[data-bs-tab]').forEach(function (tab) {
      var on = tab.getAttribute('data-bs-tab') === name;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus();
    });
    $all('[data-bs-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-bs-panel') !== name;
    });
  }

  function initTabs() {
    var tabs = $all('[data-bs-tab]');
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { selectTab(tab.getAttribute('data-bs-tab'), false); });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') next = tabs[0];
        else if (e.key === 'End') next = tabs[tabs.length - 1];
        if (!next) return;
        e.preventDefault();
        selectTab(next.getAttribute('data-bs-tab'), true);
      });
    });
    $all('[data-bs-tab-link]').forEach(function (link) {
      link.addEventListener('click', function () { selectTab(link.getAttribute('data-bs-tab-link'), false); });
    });
  }

  /* ---------- 見る窓 ---------- */
  function openModal(title, body) {
    var modal = $('[data-bs-modal]');
    var holder = $('[data-bs-modal-body]', modal);
    lastFocus = document.activeElement;
    $('#bs-modal-title').textContent = title;
    holder.textContent = '';
    holder.appendChild(body);
    holder.scrollTop = 0;
    modal.hidden = false;
    document.body.classList.add('bs-modal-open');
    $('.bs-modal__close', modal).focus();
  }

  function closeModal() {
    var modal = $('[data-bs-modal]');
    if (modal.hidden) return;
    modal.hidden = true;
    $('[data-bs-modal-body]', modal).textContent = ''; // 動画を止める
    document.body.classList.remove('bs-modal-open');
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  function initModal() {
    var modal = $('[data-bs-modal]');
    $all('[data-bs-close]', modal).forEach(function (btn) { btn.addEventListener('click', closeModal); });
    document.addEventListener('keydown', function (e) {
      if (modal.hidden) return;
      if (e.key === 'Escape') { closeModal(); return; }
      if (e.key !== 'Tab') return;
      var items = $all('button, a[href], iframe, [tabindex]:not([tabindex="-1"])', $('.bs-modal__dialog', modal))
        .filter(function (n) { return n.offsetParent !== null; });
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  function videoFrame(src, title) {
    var wrap = el('div', 'bs-video');
    var frame = document.createElement('iframe');
    frame.src = src;
    frame.title = title;
    frame.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    wrap.appendChild(frame);
    return wrap;
  }

  function mangaReader(work) {
    var wrap = el('div', 'bs-reader');
    var pages = el('div', 'bs-reader__pages');
    (Array.isArray(work.gallery) ? work.gallery : []).forEach(function (url, i) {
      var src = safeImage(url);
      if (!src) return;
      var img = document.createElement('img');
      img.src = src;
      img.alt = work.title_ja + '（' + (i + 1) + 'ページ目）';
      img.loading = i < 2 ? 'eager' : 'lazy';
      img.decoding = 'async';
      pages.appendChild(img);
    });
    if (!pages.children.length) pages.appendChild(el('p', 'bs-status', 'このマンガのページを読み込めませんでした。'));

    var info = el('div', 'bs-reader__info');
    var dl = document.createElement('dl');
    [['お客様', work.client], ['用途', work.category], ['ページ数', pages.querySelectorAll('img').length ? pages.querySelectorAll('img').length + 'ページ' : '']]
      .forEach(function (row) {
        if (!row[1]) return;
        dl.appendChild(el('dt', '', row[0]));
        dl.appendChild(el('dd', '', row[1]));
      });
    info.appendChild(dl);
    if (work.point) info.appendChild(el('p', 'bs-reader__point', work.point));
    if (MANGA_ID.test(work.id || '')) {
      var more = el('a', 'bs-reader__more', 'ビズ書庫で見開きで読む →');
      more.href = '/biz-library?manga=' + encodeURIComponent(work.id);
      more.target = '_blank';
      more.rel = 'noopener';
      info.appendChild(more);
    }
    wrap.appendChild(pages);
    wrap.appendChild(info);
    return wrap;
  }

  /* ---------- カード ---------- */
  function card(opts) {
    var li = document.createElement('li');
    var btn = el('button', 'bs-card');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'dialog');
    var thumb = el('span', 'bs-card__thumb');
    var src = safeImage(opts.image);
    if (src) {
      var img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      thumb.appendChild(img);
    }
    if (opts.badge) thumb.appendChild(el('span', 'bs-card__badge', opts.badge));
    if (opts.play) thumb.appendChild(el('span', 'bs-card__play'));
    btn.appendChild(thumb);
    btn.appendChild(el('span', 'bs-card__title', opts.title));
    if (opts.meta) btn.appendChild(el('span', 'bs-card__meta', opts.meta));
    btn.addEventListener('click', opts.onOpen);
    li.appendChild(btn);
    return li;
  }

  /* 商談で一覧が長くなりすぎないよう、最初は FIRST_SHOWN 件だけ出して「もっと見る」で残りを出す */
  var FIRST_SHOWN = { manga: 10, anime: 8, video: 8 };

  function fillGrid(name, cards) {
    var grid = $('[data-bs-grid="' + name + '"]');
    var more = $('[data-bs-more="' + name + '"]');
    var limit = FIRST_SHOWN[name] || cards.length;
    grid.textContent = '';
    cards.forEach(function (c, i) {
      if (i >= limit) c.hidden = true;
      grid.appendChild(c);
    });
    if (!more) return;
    more.hidden = cards.length <= limit;
    $('button', more).onclick = function () {
      var first = null;
      cards.forEach(function (c) { if (c.hidden && !first) first = c; c.hidden = false; });
      more.hidden = true;
      if (first) $('button', first).focus();
    };
  }

  function setCount(name, n) {
    var badge = $('[data-bs-count="' + name + '"]');
    if (badge) badge.textContent = n ? String(n) : '';
  }

  function setStatus(name, text, link) {
    var status = $('[data-bs-status="' + name + '"]');
    if (!status) return;
    status.textContent = text || '';
    if (link) {
      status.appendChild(document.createTextNode(' '));
      var a = el('a', '', link.label);
      a.href = link.href;
      a.target = '_blank';
      a.rel = 'noopener';
      status.appendChild(a);
    }
  }

  /* ---------- マンガ ---------- */
  function renderManga(works) {
    var list = (Array.isArray(works) ? works : []).filter(function (w) {
      return w && w.show_library !== false && typeof w.title_ja === 'string' && w.title_ja;
    });
    setCount('manga', list.length);
    if (!list.length) {
      setStatus('manga', '表示できるマンガの事例がありません。', { label: '制作事例のページを見る', href: '/works' });
      return;
    }
    setStatus('manga', '');

    var cats = [];
    list.forEach(function (w) { if (w.category && cats.indexOf(w.category) < 0) cats.push(w.category); });

    function draw(cat) {
      fillGrid('manga', list.filter(function (w) { return !cat || w.category === cat; }).map(function (w) {
        return card({
          image: w.thumbnail,
          badge: w.category,
          title: w.title_ja,
          meta: w.client,
          onOpen: function () { openModal(w.title_ja, mangaReader(w)); }
        });
      }));
    }

    var filter = $('[data-bs-filter="manga"]');
    if (cats.length > 1) {
      [''].concat(cats).forEach(function (cat) {
        var b = el('button', '', cat || 'すべて');
        b.type = 'button';
        b.setAttribute('aria-pressed', cat === '' ? 'true' : 'false');
        b.addEventListener('click', function () {
          $all('button', filter).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
          draw(cat);
        });
        filter.appendChild(b);
      });
      filter.hidden = false;
    }
    draw('');
  }

  /* ---------- アニメ・ビデオ ---------- */
  function videoItem(v, type) {
    if (!v || typeof v.title !== 'string' || !v.title) return null;
    if (v.provider === 'youtube' && YT_ID.test(v.video_id || '')) {
      return {
        key: 'v:' + v.video_id,
        title: v.title,
        image: v.poster || ('https://i.ytimg.com/vi/' + v.video_id + '/hqdefault.jpg'),
        badge: ANIME_LABEL[v.category] || (type === 'bizvideo' ? '映像' : ''),
        src: 'https://www.youtube-nocookie.com/embed/' + v.video_id + '?autoplay=1&rel=0'
      };
    }
    if (YT_LIST.test(v.playlist_id || '')) {
      return {
        key: 'p:' + v.playlist_id,
        title: v.title,
        image: v.poster,
        badge: '再生リスト',
        src: 'https://www.youtube-nocookie.com/embed/videoseries?list=' + v.playlist_id + '&rel=0'
      };
    }
    return null; // YouTube 以外（mp4・Drive）はこの LP では扱わない
  }

  function renderVideos(name, items, fallback) {
    var seen = {};
    var list = items.filter(function (x) {
      if (!x || seen[x.key]) return false;
      seen[x.key] = true;
      return true;
    });
    setCount(name, list.length);
    if (!list.length) {
      setStatus(name, '表示できる動画の事例がありません。', fallback);
      return;
    }
    setStatus(name, '');
    fillGrid(name, list.map(function (x) {
      return card({
        image: x.image,
        badge: x.badge,
        title: x.title,
        play: true,
        onOpen: function () { openModal(x.title, videoFrame(x.src, x.title)); }
      });
    }));
  }

  function byType(arr, type) {
    return (Array.isArray(arr) ? arr : []).filter(function (x) { return x && x.type === type; });
  }

  function load() {
    var animeLink = { label: 'ビズアニメのページを見る', href: '/bizanime' };

    getJSON('/works?site=bizmanga').then(renderManga).catch(function () {
      setStatus('manga', '事例を読み込めませんでした。', { label: '制作事例のページを見る', href: '/works' });
    });

    getJSON('/bizanime-videos').then(function (data) {
      data = data || {};
      var anime = byType(data.viewer, 'bizanime').concat(Array.isArray(data.cases) ? data.cases : [], byType(data.playlists, 'bizanime'))
        .map(function (v) { return videoItem(v, 'bizanime'); });
      var video = byType(data.viewer, 'bizvideo').concat(byType(data.playlists, 'bizvideo'))
        .map(function (v) { return videoItem(v, 'bizvideo'); });
      renderVideos('anime', anime, animeLink);
      renderVideos('video', video, null);
    }).catch(function () {
      setStatus('anime', '事例を読み込めませんでした。', animeLink);
      setStatus('video', '事例を読み込めませんでした。', null);
    });
  }

  function init() {
    initTabs();
    initModal();
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
