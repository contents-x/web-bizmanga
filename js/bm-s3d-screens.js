// 3Dスマホ端末ギャラリー 制御 (GSAP ScrollTrigger 使用)
// 依存: https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/{gsap,ScrollTrigger}.min.js
(function() {
  'use strict';

  function init() {
    var section = document.getElementById('s3dSection');
    if (!section) return;

    var screens = section.querySelectorAll('.s3d-screen');
    screens.forEach(function(s, i) {
      setTimeout(function() { s.classList.add('is-ready'); }, 150 + i * 120);
    });

    // セクションが画面に入ったら、保留中の embed-viewer iframe に開始合図を送る
    // (ボイスコミックは自動再生せず、ユーザーが「動画を見る」ボタンを押した時に
    //  loadVoiceComic() で iframe を挿入する → そちらでバインドする)
    var iframeStartFired = false;
    function startEmbedIframes() {
      if (iframeStartFired) return;
      iframeStartFired = true;
      var iframes = section.querySelectorAll('.s3d-screen iframe');
      iframes.forEach(function(f) {
        try { f.contentWindow && f.contentWindow.postMessage('s3d-start', '*'); } catch (e) {}
      });
    }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function(entries) {
        entries.forEach(function(en) {
          if (en.isIntersecting) { startEmbedIframes(); io.disconnect(); }
        });
      }, { threshold: 0.15 });
      io.observe(section);
    } else {
      // 古いブラウザ向けフォールバック: 即時開始
      startEmbedIframes();
    }
    // iframe のロード完了タイミングがセクション到達後の場合に備え、load 後にも再送
    section.querySelectorAll('.s3d-screen iframe').forEach(function(f) {
      f.addEventListener('load', function() {
        if (iframeStartFired) {
          try { f.contentWindow && f.contentWindow.postMessage('s3d-start', '*'); } catch (e) {}
        }
      });
    });

    // ボイスコミック: 音声バーは初期から表示。ユーザーは「動画を見る」を押す前から
    //   ミュート/音量のプリファレンスを操作でき、iframe挿入後にその状態が反映される。
    // 「動画を見る」ボタンが押された時に iframe を挿入して再生開始。
    // ユーザー主導なのでブラウザは音ありautoplayを許可する → mute=0 で開始
    var facade = document.getElementById('s3dVideoFacade');
    var playBtn = document.getElementById('s3dVideoPlay');
    var voiceIframe = null;
    var voiceId = 'yLwkUfi6KfQ';   // WP の枠（bm-top-3d-voice）で選ばれていれば、下の loadSlots が差し替える

    // 音声コントロールは init 時点で常にバインド（iframe未挿入時もプリファレンスを保持）
    bindVoiceControls();

    if (facade && playBtn) {
      var loaded = false;
      function loadVoiceComic() {
        if (loaded) return;
        loaded = true;
        var screenEl = facade.closest('.s3d-screen--video');
        if (!screenEl) return;
        var iframe = document.createElement('iframe');
        iframe.id = 's3dVideoIframe';
        iframe.title = 'ボイスコミックサンプル';
        iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
        iframe.setAttribute('frameborder', '0');
        iframe.src = 'https://www.youtube-nocookie.com/embed/' + voiceId + '?autoplay=1&loop=1&playlist=' + voiceId + '&controls=0&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&fs=0&enablejsapi=1';
        screenEl.appendChild(iframe);
        voiceIframe = iframe;
        facade.classList.add('is-hidden');
        setTimeout(function() { if (facade && facade.parentNode) facade.parentNode.removeChild(facade); }, 350);
        // バーに保持されたプリファレンス(data-muted / volSlider.value)を iframe に反映
        applyAudioStateToIframe();
      }
      playBtn.addEventListener('click', loadVoiceComic);
      // ポスター画像のどこをタップしても再生開始
      facade.addEventListener('click', loadVoiceComic);
    }

    /* ---- WordPress で選んだ作品・動画に差し替える（2026-11-09）----
       「サイトの表示 → ビズマンガ → トップページ → 3D の紹介」の3つの枠（どれも1つまで）:
         GET /slots/bm-top-3d-yoko（左・横読み）・bm-top-3d-tate（真ん中・縦読み）・bm-top-3d-voice（右・ボイスコミック）。
       枠が空・読めない・メンテナンス中は index.html に書いてある中身のまま。読み方の合わない作品・YouTube 以外の動画は WP が返さない。
       ラベル（横読み・縦読み・ボイスコミックの説明文）は変えない。値は形を確かめてから setAttribute で入れる（HTML として解釈しない）。
       BM_WP_CONFIG（js/bm-wp-config.js）はこのファイルより後に読まれるので、ページの準備が整ってから問い合わせる。 */
    var SLOT_TIMEOUT = 5000;
    var MANGA_ID_RE = /^(?=[a-z0-9-]*[a-z0-9])[a-z0-9-]+$/;   // WP の /manga/{id} と同じ形（英数字とハイフン。英数字を1文字以上）
    var YT_ID_RE = /^[\w-]{6,20}$/;
    function setManga(idx, card, query) {
      var slug = String((card && card.slug) || '');
      var f = section.querySelector('.s3d-col[data-idx="' + idx + '"] .s3d-screen iframe');
      if (!f || !MANGA_ID_RE.test(slug)) return;
      var src = '/embed-viewer?manga=' + slug + query;
      if (f.getAttribute('src') !== src) f.setAttribute('src', src);
    }
    function setVoice(card) {
      var v = card && card.video;
      var id = v && v.provider === 'youtube' ? String(v.video_id || '') : '';
      if (!YT_ID_RE.test(id) || id === voiceId || voiceIframe) return;   // 再生を始めた後は差し替えない
      voiceId = id;
      var img = facade && facade.querySelector('.s3d-video-poster');
      if (!img) return;
      // WP で絵を指定していればそれ、無ければ YouTube の大きい絵（無い動画は小さい絵に落とす。index.html と同じ）
      var thumb = String(card.thumb || '');
      var custom = /^https:\/\/[^\s"'<>]+$/.test(thumb) && !/ytimg\.com\/vi\//.test(thumb);
      img.onerror = function() { this.onerror = null; this.src = 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'; };
      img.src = custom ? thumb : 'https://i.ytimg.com/vi/' + id + '/maxresdefault.jpg';
      var title = String(card.title || '').trim();
      if (title) img.alt = title;
    }
    function loadSlot(key, apply) {
      var cfg = window.BM_WP_CONFIG;
      if (!cfg || !cfg.apiBase || cfg.maintenance || !window.fetch) return;
      var ctrl = 'AbortController' in window ? new AbortController() : null;
      var timer = setTimeout(function() { if (ctrl) ctrl.abort(); }, SLOT_TIMEOUT);
      fetch(cfg.apiBase + '/slots/' + key, ctrl ? { signal: ctrl.signal } : {})
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(data) { if (data && Array.isArray(data.items) && data.items[0]) apply(data.items[0]); })
        .catch(function(e) { console.warn('[bm-s3d] /slots/' + key + ':', e.message); })
        .then(function() { clearTimeout(timer); });
    }
    function loadSlots() {
      loadSlot('bm-top-3d-yoko', function(c) { setManga(0, c, '&slides=1&manual=1'); });
      loadSlot('bm-top-3d-tate', function(c) { setManga(1, c, '&manual=1'); });
      loadSlot('bm-top-3d-voice', setVoice);
    }
    if (window.BM_WP_CONFIG) loadSlots();
    else document.addEventListener('DOMContentLoaded', loadSlots);

    // ボイスコミック 音声調節UI (YouTube IFrame API を postMessage で操作)
    // iframe 未挿入時もバインドし、状態(data-muted, slider value)を保持する。
    // iframe 挿入後は voiceIframe にコマンドが届くようになる。
    function ytCmd(func, args) {
      if (!voiceIframe || !voiceIframe.contentWindow) return;
      try {
        voiceIframe.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: func, args: args || '' }), '*');
      } catch (e) {}
    }
    function applyAudioStateToIframe() {
      var audioBar = document.getElementById('s3dAudioBar');
      var volSlider = document.getElementById('s3dAudioVol');
      if (!audioBar || !volSlider) return;
      var muted = audioBar.getAttribute('data-muted') === 'true';
      // iframeのloadタイミングがバラつくため数回リトライ
      [400, 1000, 1800].forEach(function(d) {
        setTimeout(function() {
          if (muted) {
            ytCmd('mute');
          } else {
            ytCmd('unMute');
            ytCmd('setVolume', [parseInt(volSlider.value, 10)]);
          }
        }, d);
      });
    }
    function bindVoiceControls() {
      var audioBar = document.getElementById('s3dAudioBar');
      var muteBtn = document.getElementById('s3dAudioMute');
      var volSlider = document.getElementById('s3dAudioVol');
      if (!audioBar || !muteBtn || !volSlider) return;
      function setMuted(muted) {
        audioBar.setAttribute('data-muted', muted ? 'true' : 'false');
        muteBtn.setAttribute('aria-label', muted ? '音声をオンにする' : '音声をオフにする');
        if (muted) {
          ytCmd('mute');
        } else {
          ytCmd('unMute');
          ytCmd('setVolume', [parseInt(volSlider.value, 10)]);
        }
      }
      muteBtn.addEventListener('click', function() {
        setMuted(audioBar.getAttribute('data-muted') !== 'true');
      });
      volSlider.addEventListener('input', function() {
        var v = parseInt(volSlider.value, 10);
        if (v === 0) {
          setMuted(true);
        } else {
          ytCmd('setVolume', [v]);
          if (audioBar.getAttribute('data-muted') === 'true') setMuted(false);
        }
      });
    }

    // ここから下はスクロール演出だけ（GSAP が必要）。CDN が読めない環境では演出をあきらめるが、
    // 上のボイスコミックの再生ボタン・音声バーは GSAP なしでも動くよう、この return より前で
    // 結び付けておく（Issue #88。以前はこの return が先にあり、ボタンが何もしなかった）。
    // 演出をあきらめるときは、演出の最後の状態（漫画 iframe を操作できる・見出し・ラベル・CTA が
    // 見える）にすぐ切り替える。CSS の初期値は透明・操作不可なので、何もしないと消えたままになる。
    if (!(window.gsap && window.ScrollTrigger)) {
      var staticGroup = document.getElementById('s3dScreens');
      if (staticGroup) staticGroup.classList.add('is-settled');
      section.querySelectorAll('.s3d-heading, .s3d-label, .s3d-heading-cta').forEach(function(el) {
        el.classList.add('is-shown');
      });
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    var wrap   = document.getElementById('s3dScreensWrap');
    var group  = document.getElementById('s3dScreens');
    var others = Array.prototype.slice.call(
      group.querySelectorAll('.s3d-screen:not(.s3d-screen--hero)')
    );
    var labels = Array.prototype.slice.call(document.querySelectorAll('.s3d-label'));
    var heading = document.getElementById('s3dHeading');
    var scrollHint = document.getElementById('s3dScrollHint');
    var cta = document.getElementById('s3dCta');

    // Revert animation transforms/triggers when the layout crosses the tablet boundary.
    var layoutMedia = gsap.matchMedia();
    layoutMedia.add({ stacked: '(max-width: 1024px)', wide: '(min-width: 1025px)' }, function(context) {
      var isSP = context.conditions.stacked;
      // PC/Tablet は中央スマホをでかく見せて zoom-in、SP は縦 Z 配置のため等倍からスタート
      var initScale = isSP ? 1 : 1.55;
      gsap.set(wrap, { scale: initScale, transformOrigin: '50% 0%' });
      // SP: 中央縦並びなので下からフェードイン
      // PC: 左右スマホは下から押し上げる + フェード + 縮小スタート
      if (isSP) {
        gsap.set(others, { opacity: 0, y: 32 });
      } else {
        gsap.set(others, { opacity: 0, scale: 0.55, y: 60 });
      }
      gsap.set(labels, { opacity: 0, y: -12 });
      // heading は flex フロー配置 (絶対配置を廃止) なので xPercent 不要
      if (heading) gsap.set(heading, { autoAlpha: 0, y: 12 });

      // 1.4秒 → 約2.7秒に伸ばし、各段階の余韻を作る
      var tl = gsap.timeline({ paused: true });
      if (isSP) {
        // SP: zoom-in なし。下からふわっとフェードイン
        tl.to(others, { opacity: 1, y: 0, ease: 'power3.out', duration: 0.9, stagger: 0.22 }, 0.3);
      } else {
        // (1) 中央スマホがゆっくり viewport サイズに収まる
        tl.to(wrap,    { scale: 1, ease: 'power3.out', duration: 1.6 }, 0);
        // (2) 左右スマホが少し遅れて、下から押し上がる + 拡大しながらフェードイン
        tl.to(others,  { opacity: 1, scale: 1, y: 0, ease: 'power3.out', duration: 1.1, stagger: 0.22 }, 0.55);
      }
      // (3) 各ラベルが上からふわっと
      tl.to(labels,  { opacity: 1, y: 0, ease: 'power2.out', duration: 0.7, stagger: 0.14 }, isSP ? 0.5 : 1.7);
      // (4) 見出しは下からふわり
      if (heading) tl.to(heading, { autoAlpha: 1, y: 0, ease: 'power2.out', duration: 0.8 }, isSP ? 0.2 : 1.5);
      // (5) iframe 操作可能化 / CTA 表示は最後に
      tl.call(function() { group.classList.add('is-settled'); }, null, isSP ? 1.4 : 2.3);
      if (cta) tl.call(function() { cta.classList.add('is-shown'); }, null, isSP ? 1.6 : 2.5);

      ScrollTrigger.create({
        trigger: '#s3dSection',
        // 80% (≒ 上端が viewport にちょっと顔を出した瞬間) でアニメ開始
        start: 'top 80%',
        once: true,
        onEnter: function() {
          if (scrollHint) scrollHint.classList.add('is-hidden');
          tl.play();
        }
      });
      return function() { tl.kill(); };
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
