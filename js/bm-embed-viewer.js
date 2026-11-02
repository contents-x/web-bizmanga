(function() {
    'use strict';

    var params = new URLSearchParams(location.search);
    var mangaId = params.get('manga') || '';
    var speed = parseFloat(params.get('speed') || '0.5'); // px/frame
    // ltr=1: 横カルーセルをLTR方向(左→右)に流す（右タイル用）
    var ltr = params.get('ltr') === '1' || params.get('reverse') === '1';
    // slides=1: 1ページずつフェード遷移する slideshow モード
    var slidesMode = params.get('slides') === '1';
    var slideInterval = parseInt(params.get('interval') || '2000', 10);
    // manual=1: 自動再生(縦スクロール/スライド)を止め、矢印ボタン + 手動操作にする
    var manual = params.get('manual') === '1';
    // hold=1: 親から postMessage('s3d-start') を受け取るまで自動再生を保留する
    var holdMode = params.get('hold') === '1';
    var holdReleased = !holdMode;
    var pendingStarter = null;
    if (holdMode) {
      window.addEventListener('message', function(e) {
        var d = e && e.data;
        if (!d) return;
        if (d === 's3d-start' || d.type === 's3d-start') {
          holdReleased = true;
          if (pendingStarter) { var fn = pendingStarter; pendingStarter = null; fn(); }
        }
      });
    }
    function gateStart(fn) {
      if (holdReleased) fn();
      else pendingStarter = fn;
    }

    // ============ 手動操作UI: 矢印ボタン + 操作ガイド ============
    var CHEVRON = {
      left:  'M15 18l-6-6 6-6', right: 'M9 18l6-6-6-6',
      up:    'M6 15l6-6 6 6',   down:  'M6 9l6 6 6-6'
    };
    var SVGNS = 'http://www.w3.org/2000/svg';
    function makeNav(modifier, dir, label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ev-nav ev-nav--' + modifier;
      b.setAttribute('aria-label', label);
      var svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2.4');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      var path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', CHEVRON[dir]);
      svg.appendChild(path);
      b.appendChild(svg);
      return b;
    }
    // 横読み用 左右タップゾーン（side=配置, chevronDir=向きヒント）
    function makeTapZone(side, chevronDir, label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ev-tap ev-tap--' + side;
      b.setAttribute('aria-label', label);
      var svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2.4');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      var path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', CHEVRON[chevronDir]);
      svg.appendChild(path);
      b.appendChild(svg);
      return b;
    }

    if (!mangaId) {
      document.getElementById('loading').textContent = 'NO MANGA ID';
      return;
    }

    var loading = document.getElementById('loading');
    var viewer  = document.getElementById('viewer');
    var vStack  = document.getElementById('vStack');
    var hStrip  = document.getElementById('hStrip');
    var sSlides = document.getElementById('sSlides');

    var WP_API = 'https://cms.contentsx.jp/wp-json/contentsx/v1';

    function render(data) {
      if (!data || !data.gallery || data.gallery.length === 0) {
        showFinal('NO PAGES');
        return;
      }
      loading.style.display = 'none';

      if (slidesMode) {
        renderSlides(data);
        return;
      }
      var isVertical = data.view_type === 'vertical_only' || data.view_type === 'vertical';
      if (isVertical) renderVertical(data);
      else renderHorizontal(data);
    }

    // ============ スライドショー: 1ページずつ interval 秒でフェード切替 ============
    function renderSlides(data) {
      viewer.classList.add('is-slides');
      sSlides.style.display = '';
      vStack.style.display = 'none';
      hStrip.style.display = 'none';

      data.gallery.forEach(function(src, i) {
        var img = document.createElement('img');
        img.src = src;
        img.alt = (data.title_ja || mangaId) + ' p' + (i + 1);
        img.loading = i < 2 ? 'eager' : 'lazy';
        img.decoding = 'async';
        if (i === 0) img.className = 'is-active';
        sSlides.appendChild(img);
      });
      if (manual) { waitImages(sSlides, setupSlidesManual); return; }
      waitImages(sSlides, function() { gateStart(startSlides); });
    }

    // 手動スライド: 画面の左半分タップ=次 / 右半分タップ=前（右綴じ漫画式）
    var slidesManualDone = false;
    function setupSlidesManual() {
      if (slidesManualDone) return;
      slidesManualDone = true;
      var imgs = sSlides.querySelectorAll('img');
      if (!imgs.length) return;
      var idx = 0;
      var last = imgs.length - 1;
      // 左ゾーン=次へ進む、右ゾーン=前へ戻る
      var zoneNext = makeTapZone('left', 'right', '次のページへ');  // 左半分・chevron右向き
      var zonePrev = makeTapZone('right', 'left', '前のページへ');  // 右半分・chevron左向き
      function show(n) {
        // ループしない: 1ページ目より前 / 最終ページより後ろには進まない
        var clamped = Math.max(0, Math.min(last, n));
        if (clamped === idx) return;
        imgs[idx].classList.remove('is-active');
        idx = clamped;
        imgs[idx].classList.add('is-active');
        zoneNext.disabled = idx === last; // 最終ページでは「次」無効
        zonePrev.disabled = idx === 0;     // 1ページ目では「前」無効
      }
      zonePrev.disabled = true;            // 初期は1ページ目
      zoneNext.disabled = last === 0;
      zoneNext.addEventListener('click', function() { show(idx + 1); });
      zonePrev.addEventListener('click', function() { show(idx - 1); });
      document.body.appendChild(zoneNext);
      document.body.appendChild(zonePrev);
      // 漫画の上に「漫画を読む」開始ボタン。タップ後に左右タップゾーンで操作開始
      addReadOverlay();
      // 操作ガイドは親ページ側で端末の直下に表示する（iframe内には出さない）
    }

    var slidesStarted = false;
    function startSlides() {
      if (slidesStarted) return;
      slidesStarted = true;
      var imgs = sSlides.querySelectorAll('img');
      if (imgs.length <= 1) return;
      var idx = 0;
      setInterval(function() {
        imgs[idx].classList.remove('is-active');
        idx = (idx + 1) % imgs.length;
        imgs[idx].classList.add('is-active');
      }, slideInterval);
    }

    // ============ 縦スクロール: 縦に自動スクロール ============
    function renderVertical(data) {
      viewer.classList.add('is-vertical');
      vStack.style.display = '';
      hStrip.style.display = 'none';

      // 自動スクロールは無限ループ用に2セット複製。手動は1セットのみ。
      var reps = manual ? 1 : 2;
      for (var rep = 0; rep < reps; rep++) {
        data.gallery.forEach(function(src, i) {
          var img = document.createElement('img');
          img.src = src;
          img.alt = (data.title_ja || mangaId) + ' p' + (i + 1);
          img.loading = rep === 0 ? 'eager' : 'lazy';
          img.decoding = 'async';
          vStack.appendChild(img);
        });
      }
      if (manual) { waitImages(vStack, setupVerticalManual); return; }
      waitImages(vStack, function() { gateStart(startVerticalScroll); });
    }

    // 漫画の上に「漫画を読む」開始ボタンを表示。タップでオーバーレイ除去＋onStart実行。
    // 縦読み・横読み共通（タップという明確なジェスチャーを起点に操作可能化する）
    function addReadOverlay(onStart) {
      var overlay = document.createElement('button');
      overlay.type = 'button';
      overlay.className = 'ev-read-overlay';
      overlay.setAttribute('aria-label', '漫画を読む');

      var pill = document.createElement('span');
      pill.className = 'ev-read-btn';
      var svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'currentColor');
      svg.setAttribute('aria-hidden', 'true');
      var path = document.createElementNS(SVGNS, 'path');
      // 見開き本のアイコン
      path.setAttribute('d', 'M3 4a2 2 0 0 0-2 2v12a1 1 0 0 0 1 1h8a1 1 0 0 1 1 1 1 1 0 0 0 2 0 1 1 0 0 1 1-1h8a1 1 0 0 0 1-1V6a2 2 0 0 0-2-2h-6a3 3 0 0 0-3 1.2A3 3 0 0 0 9 4H3zm8 3.5V18a3 3 0 0 0-1-.17H3V6h6a2 2 0 0 1 2 1.5zm2 0A2 2 0 0 1 15 6h6v11.83h-7a3 3 0 0 0-1 .17V7.5z');
      svg.appendChild(path);
      var label = document.createElement('span');
      label.textContent = '漫画を読む';
      pill.appendChild(svg);
      pill.appendChild(label);
      overlay.appendChild(pill);

      overlay.addEventListener('click', function() {
        overlay.remove();
        try { viewer.focus({ preventScroll: true }); } catch (e) { try { viewer.focus(); } catch (e2) {} }
        if (typeof onStart === 'function') onStart();
      });
      document.body.appendChild(overlay);
    }

    // 手動縦スクロール: 「漫画を読む」タップ後、指/ホイールで自由スクロール
    var verticalManualDone = false;
    function setupVerticalManual() {
      if (verticalManualDone) return;
      verticalManualDone = true;
      // スクロールできるよう viewer をフォーカス可能に
      viewer.setAttribute('tabindex', '0');
      viewer.style.outline = 'none';

      // 入れ子iframe＋角丸mask環境ではネイティブの縦スクロールが効かないことがあるため、
      // ドラッグ/ホイールで scrollTop を直接動かして確実にページ送りできるようにする
      var lastY = 0;
      viewer.addEventListener('touchstart', function(e) {
        lastY = e.touches[0].clientY;
      }, { passive: true });
      viewer.addEventListener('touchmove', function(e) {
        var y = e.touches[0].clientY;
        viewer.scrollTop -= (y - lastY);
        lastY = y;
        e.preventDefault(); // ネイティブと二重に動かさない
      }, { passive: false });
      viewer.addEventListener('wheel', function(e) {
        viewer.scrollTop += e.deltaY;
        e.preventDefault();
      }, { passive: false });

      addReadOverlay();
      // 操作ガイドは親ページ側で端末の直下に表示する（iframe内には出さない）
    }

    var vStarted = false;
    function startVerticalScroll() {
      if (vStarted) return;
      vStarted = true;
      var halfHeight = viewer.scrollHeight / 2;
      var paused = false;
      var hoverPause = false;
      var resumeTimer = null;

      viewer.addEventListener('mouseenter', function() { hoverPause = true; });
      viewer.addEventListener('mouseleave', function() { hoverPause = false; });
      document.addEventListener('mouseover', function() { hoverPause = true; });
      document.addEventListener('mouseout', function(e) {
        if (!e.relatedTarget) hoverPause = false;
      });
      viewer.addEventListener('wheel', function() {
        paused = true;
        clearTimeout(resumeTimer);
        resumeTimer = setTimeout(function() { paused = false; }, 2000);
      }, { passive: true });

      function tick() {
        if (!paused && !hoverPause) {
          viewer.scrollTop += speed;
          if (viewer.scrollTop >= halfHeight) viewer.scrollTop -= halfHeight;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    // ============ 横カルーセル ============
    // 通常モード: 右→左へ流れる(左タイル用)。初期表示は p1 が左端。
    // ltr モード: 左→右へ流れる(右タイル用)。初期表示は p1 が右端。
    //   DOM を gallery.reverse() にすることで、各セットの右端が p1 になる。
    //   strip 全体を [pN, pN-1, ..., p1, pN, pN-1, ..., p1] の2セット複製。
    //   scroll は pos 減算(strip 右シフト)で LTR 方向。
    function renderHorizontal(data) {
      viewer.classList.add('is-horizontal');
      hStrip.style.display = '';
      vStack.style.display = 'none';

      var pages = ltr ? data.gallery.slice().reverse() : data.gallery;

      for (var rep = 0; rep < 2; rep++) {
        pages.forEach(function(src, i) {
          var img = document.createElement('img');
          img.src = src;
          // ltr時は reverse 後のインデックス i からオリジナルページ番号を逆算
          var origIdx = ltr ? (pages.length - i) : (i + 1);
          img.alt = (data.title_ja || mangaId) + ' p' + origIdx;
          img.loading = rep === 0 ? 'eager' : 'lazy';
          img.decoding = 'async';
          hStrip.appendChild(img);
        });
      }
      waitImages(hStrip, function() { gateStart(startHorizontalScroll); });
    }

    var hStarted = false;
    function startHorizontalScroll() {
      if (hStarted) return;
      hStarted = true;

      var halfWidth = hStrip.scrollWidth / 2;
      var firstImg = hStrip.querySelector('img');
      var pageW = firstImg ? firstImg.offsetWidth : 0;
      var viewW = viewer.clientWidth;

      var paused = false;
      var hoverPause = false;
      var resumeTimer = null;

      // 初期位置:
      //   通常(右→左): pos=0 → p1 が viewport 左端
      //   LTR(左→右): pos=halfWidth-viewW → 各セット右端の p1 が viewport 右端
      var pos = ltr ? Math.max(0, halfWidth - viewW) : 0;
      hStrip.style.transform = 'translateX(' + (-pos) + 'px)';

      viewer.addEventListener('mouseenter', function() { hoverPause = true; });
      viewer.addEventListener('mouseleave', function() { hoverPause = false; });
      document.addEventListener('mouseover', function() { hoverPause = true; });
      document.addEventListener('mouseout', function(e) {
        if (!e.relatedTarget) hoverPause = false;
      });
      viewer.addEventListener('wheel', function() {
        paused = true;
        clearTimeout(resumeTimer);
        resumeTimer = setTimeout(function() { paused = false; }, 2000);
      }, { passive: true });
      viewer.addEventListener('touchstart', function() {
        paused = true;
        clearTimeout(resumeTimer);
        resumeTimer = setTimeout(function() { paused = false; }, 2500);
      }, { passive: true });

      function tick() {
        if (!paused && !hoverPause) {
          if (ltr) {
            // LTR: strip 右シフト = pos 減算 = translateX 増加
            pos -= speed;
            if (pos < 0) pos += halfWidth;
          } else {
            pos += speed;
            if (pos >= halfWidth) pos -= halfWidth;
          }
          hStrip.style.transform = 'translateX(' + (-pos) + 'px)';
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    // ============ 画像ロード完了待ち ============
    function waitImages(container, callback) {
      var imgs = container.querySelectorAll('img');
      if (imgs.length === 0) { callback(); return; }
      var loaded = 0;
      function check() { if (++loaded === imgs.length) callback(); }
      imgs.forEach(function(img) {
        if (img.complete) check();
        else {
          img.addEventListener('load',  check, { once: true });
          img.addEventListener('error', check, { once: true });
        }
      });
      setTimeout(callback, 1500); // 保険
    }

    // ============ データ取得 ============
    // WP が「作品が無い」と答えたか（/manga/{id} のデータ以外の応答）。ビズ書庫の QR直リンク（js/works.js の readMangaAnswer が
    // 'gone' とする応答）と同じ判定: 404 で本文がプラグインの形（{"error":"not found"} のように error があり code が無い。
    // 無い作品・完全非公開 cx_private の作品）か、410 で本文がプラグインか WP の形（{"code":"...","message":"..."}）。
    // それ以外（5xx・401/403・WP の rest_no_route・JSON でない応答）は「作品が無い」とは見なさない（手書きデータにある作品だけ素材フォルダの画像で表示し、無い作品は取り直して待つ。onWpUnavailable）
    function isPluginErrorBody(d) {
      return !!d && typeof d === 'object' && !Array.isArray(d) && typeof d.error === 'string' &&
        !Object.prototype.hasOwnProperty.call(d, 'code');
    }
    function isWpErrorBody(d) {
      return !!d && typeof d === 'object' && !Array.isArray(d) && typeof d.code === 'string' && typeof d.message === 'string';
    }
    function isMangaGone(status, body) {
      if (status === 404) return isPluginErrorBody(body);
      if (status === 410) return isPluginErrorBody(body) || isWpErrorBody(body);
      return false;
    }
    // 「作品が無い」の目印（render に渡すデータと区別する）
    var MANGA_GONE = {};
    // 素材フォルダ（contentsx.jp/material/manga/{id}/NN.webp）の画像で表示してよい作品＝ビズ書庫の手書きデータ
    // （js/bm-fallback-works.js。公開中の作品だけを載せる一覧）。ページ数・表示モード・タイトルもそこから取る。
    // WP がエラーを返した・通信できない・メンテナンス中のとき、一覧に無い ID は推測で表示しない（非公開にした作品の素材画像を
    // 出さない。ルート BUGS.md #085）。WP が公開中と答えた作品は、ギャラリーが空なら一覧に無くても素材フォルダで表示する
    function knownWork(id) {
      var rows = window.BM_FALLBACK_WORKS || [];
      for (var i = 0; i < rows.length; i++) {
        if (rows[i][0] === id) return rows[i];
      }
      return null;
    }
    // 素材フォルダの画像で表示する。ページ数は手書きデータ（素材の実際の枚数）→ WP の pages → 30 の順
    function renderMaterial(row, data) {
      var wpPages = data ? parseInt(data.pages, 10) : 0;
      var pages = row ? row[2] : (wpPages > 0 ? wpPages : 30);
      var gallery = [];
      for (var i = 1; i <= pages; i++) {
        gallery.push('https://contentsx.jp/material/manga/' + mangaId + '/' + (i < 10 ? '0' + i : '' + i) + '.webp');
      }
      render({
        title_ja: (data && data.title_ja) || (row ? row[1] : ''),
        view_type: (data && data.view_type) || (row ? row[4] : 'spread'),
        gallery: gallery
      });
    }
    // 読み込み中の印（くるくる）を止めて、最後の文言だけを残す（NO PAGES・一時停止・取り直しをあきらめた）
    function showFinal(text) {
      loading.textContent = text;
      loading.classList.add('is-final');
    }
    // 一覧に無い作品は、WP が戻るまで取り直して待つ（取り直すたびに間隔と1回の時間切れを延ばし、待ち時間の合計 10 分まで。
    // ビズ書庫の QR直リンク〈js/works.js の DIRECT_RETRY_MS・DIRECT_FETCH_TIMEOUT_MS〉と同じ考え方）
    var RETRY_MS = [5000, 10000, 20000, 40000, 60000];
    var FETCH_TIMEOUT_MS = [5000, 10000, 20000];
    var RETRY_LIMIT_MS = 10 * 60 * 1000;
    var retryCount = 0;
    var waitedMs = 0;
    function onWpUnavailable() {
      var row = knownWork(mangaId);
      if (row) { renderMaterial(row, null); return; }
      var delay = RETRY_MS[Math.min(retryCount, RETRY_MS.length - 1)];
      if (waitedMs + delay > RETRY_LIMIT_MS) {
        showFinal('ただいま表示に時間がかかっています。しばらくしてから再度ご覧ください');
        return;
      }
      loading.textContent = 'ただいま表示に時間がかかっています';
      retryCount++;
      waitedMs += delay;
      setTimeout(load, delay);
    }
    // WP の作品データか（オブジェクトで、配列でなく、id がある。js/works.js の requestManga と同じ条件）
    function isWorkData(d) {
      return !!d && typeof d === 'object' && !Array.isArray(d) && !!d.id;
    }
    // WP の答えに応じて表示する（ここで起きた例外は WP 障害ではないので、取り直さずに console.error で知らせる）
    function onAnswer(data) {
      // WP が「作品が無い」と答えた: 素材フォルダの画像を推測して出すと、WP で完全非公開にした作品が見えてしまうので
      // 推測せず「NO PAGES」にする（Issue #84。以前は 01〜30.webp を推測していた）
      if (data === MANGA_GONE) { render(null); return; }
      // WP のエラー（5xx・401/403 など。「作品が無い」とは分からない）・作品の形でない応答・通信失敗・時間切れ
      if (!isWorkData(data)) { onWpUnavailable(); return; }
      if (Array.isArray(data.gallery) && data.gallery.length > 0) render(data);
      else renderMaterial(knownWork(mangaId), data);  // WP が公開中と答えたがギャラリーが空
    }
    function load() {
      var timeout = FETCH_TIMEOUT_MS[Math.min(retryCount, FETCH_TIMEOUT_MS.length - 1)];
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = controller ? setTimeout(function() { controller.abort(); }, timeout) : null;
      fetch(WP_API + '/manga/' + encodeURIComponent(mangaId), controller ? { signal: controller.signal } : undefined)
        .then(function(r) {
          if (r.ok) return r.json();
          return r.text().then(function(text) {
            var body = null;
            try { body = JSON.parse(text); } catch (e) { /* JSON でない（HTML のエラーページ等） */ }
            return isMangaGone(r.status, body) ? MANGA_GONE : null;
          });
        })
        .then(function(data) { if (timer) clearTimeout(timer); return data; },
              function() { if (timer) clearTimeout(timer); return null; })  // 通信失敗・時間切れ・JSON でない 200
        .then(onAnswer)
        .catch(function(e) { console.error('[embed-viewer] 表示できませんでした', e); });
    }

    // WP の作品 ID の形（英数字とハイフン。英数字を1文字以上。WP プラグインの /manga/{id} のルートと同じ）でない値は、
    // 問い合わせても作品は無いので「NO PAGES」（打ち間違いを10分取り直さない）
    if (!/^[A-Za-z0-9-]+$/.test(mangaId) || !/[A-Za-z0-9]/.test(mangaId)) {
      render(null);
    } else if (window.BM_WP_CONFIG && window.BM_WP_CONFIG.maintenance) {
      // メンテナンス中（bm-wp-config.js の maintenance）は WP に取りに行かない。一覧にある作品は素材フォルダの画像で表示する
      // （ページ数・表示モードが一覧どおりなので崩れない）
      var row = knownWork(mangaId);
      if (row) renderMaterial(row, null);
      else showFinal('ただいま表示を一時停止しています');
    } else {
      load();
    }
  })();
