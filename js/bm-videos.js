/**
 * bm-videos.js — ホーム対談・動画セクション
 * 初期表示はサムネイル(<button.bm-video-thumb>)のみで、クリックされた時に
 * youtube-nocookie の iframe を生成して差し替える（初回ロードを重くしないため。
 * bizanime.js と同じ遅延方針）。
 */
(function () {
  'use strict';

  var ID_RE = /^[\w-]{6,20}$/; // YouTube動画IDは英数・-・_のみ

  /* ---- WordPress で選んだ動画に差し替える（2026-11-07）----
     「サイトの表示 → ビズマンガ → トップページ → 対談・インタビューの動画」（GET /slots/bm-top-videos。YouTube だけ・1本）。
     枠が空・読めない・メンテナンス中は index.html に書いてある対談動画のまま。
     差し替えたときは、WP に無い情報（話題の箇条書き・再生時間・章立て）を外し、構造化データ（#interview-video）も同じ動画の内容に書き換える。
     文字はすべて textContent / setAttribute で入れる（HTML として解釈しない）。 */
  var SLOT_TIMEOUT = 5000;
  function applySlot(card) {
    var v = card && card.video;
    var id = v && v.provider === 'youtube' ? String(v.video_id || '') : '';
    var section = document.getElementById('videos');
    var btn = section && section.querySelector('.bm-video-thumb');
    if (!ID_RE.test(id) || !btn || btn.getAttribute('data-video-id') === id) return;
    var title = String(card.title || '').trim();
    var desc = String(card.description || '').trim();
    var thumb = /^https:\/\/[^\s"'<>]+$/.test(String(card.thumb || '')) ? card.thumb : 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
    var watch = 'https://www.youtube.com/watch?v=' + id;
    btn.setAttribute('data-video-id', id);
    btn.setAttribute('aria-label', '動画を再生: ' + title);
    var img = btn.querySelector('img');
    if (img) { img.src = thumb; img.alt = '動画: ' + title; }
    var dur = btn.querySelector('.bm-video-duration');
    if (dur) dur.remove();
    var h = section.querySelector('.bm-video-title');
    if (h) h.textContent = title;
    var d = section.querySelector('.bm-video-desc');
    if (d) { d.textContent = desc; d.hidden = !desc; }
    var topics = section.querySelector('.bm-video-topics');
    if (topics) topics.remove();
    var link = section.querySelector('.bm-video-yt-link');
    if (link) link.href = watch;
    document.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) {
      var data;
      try { data = JSON.parse(s.textContent); } catch (e) { return; }
      if (!data || data['@type'] !== 'VideoObject' || !/#interview-video$/.test(String(data['@id'] || ''))) return;
      data.name = title;
      data.description = desc || title;
      data.thumbnailUrl = thumb;
      data.contentUrl = watch;
      data.embedUrl = 'https://www.youtube-nocookie.com/embed/' + id;
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(card.date || ''))) data.uploadDate = card.date;
      delete data.duration;
      delete data.hasPart;
      delete data.keywords;
      s.textContent = JSON.stringify(data);
    });
  }
  (function loadSlot() {
    var cfg = window.BM_WP_CONFIG;
    if (!cfg || !cfg.apiBase || cfg.maintenance || !window.fetch || !document.getElementById('videos')) return;
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, SLOT_TIMEOUT);
    fetch(cfg.apiBase + '/slots/bm-top-videos', ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        // 再生中（サムネイルが iframe に替わった後）は差し替えない
        if (data && Array.isArray(data.items) && data.items[0]) applySlot(data.items[0]);
      })
      .catch(function (e) { console.warn('[bm-videos] /slots/bm-top-videos:', e.message); })
      .then(function () { clearTimeout(timer); });
  })();

  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.bm-video-thumb') : null;
    if (!btn) return;

    var id = btn.getAttribute('data-video-id') || '';
    if (!ID_RE.test(id)) return;

    var ifr = document.createElement('iframe');
    ifr.className = 'bm-video-frame';
    ifr.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0';
    ifr.title = btn.getAttribute('aria-label') || 'YouTube video';
    ifr.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    ifr.setAttribute('allowfullscreen', '');
    ifr.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    btn.replaceWith(ifr);
  });
})();
