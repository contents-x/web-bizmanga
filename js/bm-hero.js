/**
 * BizManga Hero — 集英社スタイル マーキーカルーセル + 制作事例モーダル
 * ContentsX と全く同じ仕様:
 *   - 作品表紙が5行マーキーで横スクロール
 *   - クリックで制作事例モーダル（2カラム: 漫画カルーセル + 詳細）
 *   - 出す作品は WordPress の「ヒーローに出す」だけ（2026-11-04〜 直書きの代わりの作品は持たない）
 */
(function() {
  'use strict';

  var heroWorksBg = document.getElementById('bmHeroWorksBg');
  if (!heroWorksBg) return;

  /* 2026-11-04: ここにあった直書きの5作品（FALLBACK_WORKS）は撤去した。WordPress が8秒応答しないとき、
     ヒーローの設定を見ずにこの5作品を出し、しかも後から届いた WordPress のデータに入れ替わらなかったため、
     非表示にした作品が出ることがあった。今は「接続中」のまま WordPress から取り直し、届いたら設定どおりに出す（下の retryHeroData）。 */

  // ===== O(1) ルックアップ用マップ =====
  var worksMap = {};
  function rebuildMap(works) {
    worksMap = {};
    works.forEach(function(w) { worksMap[w.id] = w; });
  }

  // ===== デバイス別表示行数 =====
  // PC=3行 / タブレット=4行 / スマホ=5行（順番後ろの作品ほどスマホでだけ追加表示される）
  function getActiveRowCount() {
    var w = window.innerWidth;
    if (w >= 1024) return 3;
    if (w >= 768) return 4;
    return 5;
  }

  // ===== マーキーカルーセル構築 =====
  var allRowEls = [];
  function buildMarquee(works) {
    allRowEls = [
      document.getElementById('bmHeroRow1'),
      document.getElementById('bmHeroRow2'),
      document.getElementById('bmHeroRow3'),
      document.getElementById('bmHeroRow4'),
      document.getElementById('bmHeroRow5')
    ].filter(Boolean);
    if (allRowEls.length === 0 || works.length === 0) return;

    var numRows = Math.min(getActiveRowCount(), allRowEls.length);

    // 余った行は非表示（CSSメディアクエリで隠してたが、JS側でも明示）
    allRowEls.forEach(function(el, idx) {
      el.style.display = idx < numRows ? '' : 'none';
    });

    // 順番ベース round-robin で各行に均等振り分け
    // works は呼び出し元で hero_order_bm 昇順ソート済み
    var rows = [];
    for (var r = 0; r < numRows; r++) rows.push([]);
    works.forEach(function(w, i) {
      rows[i % numRows].push(w);
    });

    var rowEls = allRowEls.slice(0, numRows);

    rowEls.forEach(function(rowEl, ri) {
      var items = rows[ri];
      if (items.length === 0) return;
      rowEl.innerHTML = '';

      var frag = document.createDocumentFragment();
      var renderItems = items.concat(items, items, items);
      var itemCount = items.length;
      renderItems.forEach(function(item, idx) {
        var div = document.createElement('div');
        div.className = 'bm-hero-works-cover';
        div.dataset.workId = item.id;

        var img = document.createElement('img');
        img.alt = item.title_ja || item.title || '';
        /* CLS対策: width/height 明示（CSS で比率維持、object-fit: cover） */
        img.width = 200;
        img.height = 280;
        /* 最初の1セットだけeager、複製分はlazyで帯域節約 */
        var isFirstSet = idx < itemCount;
        img.loading = isFirstSet ? 'eager' : 'lazy';
        img.decoding = 'async';
        if (isFirstSet) img.fetchPriority = 'high';
        img.style.objectPosition = 'top center';

        // リスナーを先に付けてからsrcをセット（キャッシュ済みでも確実にキャッチ）
        (function(coverDiv, imgEl) {
          function markLoaded() { coverDiv.classList.add('img-loaded'); }
          imgEl.addEventListener('load', markLoaded, { once: true });
          imgEl.addEventListener('error', markLoaded, { once: true });
        })(div, img);

        img.src = item.thumbnail || 'https://contentsx.jp/material/manga/' + item.id + '/01.webp';

        div.appendChild(img);

        // スピナー（imgの後 = 上に表示される）
        var spinner = document.createElement('div');
        spinner.className = 'bm-cover-spinner';
        div.appendChild(spinner);
        frag.appendChild(div);

        // クリック → 制作事例モーダル
        div.addEventListener('click', function(e) {
          e.stopPropagation();
          openWorkDetail(item.id);
        });
      });
      rowEl.appendChild(frag);
    });

    rebuildMap(works);
    explodeGatherIntro();
  }

  // ===== 爆発→集合イントロ =====
  function explodeGatherIntro() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // reduced-motion: スキップしてすぐマーキー開始
      heroWorksBg.classList.add('hero-marquee-go');
      return;
    }

    var covers = heroWorksBg.querySelectorAll('.bm-hero-works-cover');
    if (covers.length === 0) return;

    // 1) 全カバーにランダムな初期位置を設定
    var viewW = window.innerWidth;
    var viewH = window.innerHeight;
    covers.forEach(function(cover, i) {
      var angle = Math.random() * Math.PI * 2;
      var dist = 500 + Math.random() * 600;
      var x = Math.cos(angle) * dist;
      var y = Math.sin(angle) * dist;
      var rot = (Math.random() * 360 - 180);
      cover.style.setProperty('--ex-x', x + 'px');
      cover.style.setProperty('--ex-y', y + 'px');
      cover.style.setProperty('--ex-r', rot + 'deg');
      cover.style.setProperty('--ex-dur', (0.8 + Math.random() * 0.6) + 's');
      cover.style.setProperty('--ex-delay', (i * 0.02) + 's');
      cover.classList.add('explode-init');
    });

    // 2) 次フレームで集合クラスを付与（transitionを発火）
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        covers.forEach(function(cover) {
          cover.classList.remove('explode-init');
          cover.classList.add('explode-gather');
        });

        // 3) 集合完了後にマーキー開始 + クラス除去
        var maxDelay = covers.length * 0.02 + 1.4; // 最大delay + duration
        setTimeout(function() {
          heroWorksBg.classList.add('hero-marquee-go');
          covers.forEach(function(cover) {
            cover.classList.remove('explode-gather');
            cover.style.removeProperty('--ex-x');
            cover.style.removeProperty('--ex-y');
            cover.style.removeProperty('--ex-r');
            cover.style.removeProperty('--ex-dur');
            cover.style.removeProperty('--ex-delay');
          });
        }, maxDelay * 1000);
      });
    });
  }

  // ===== 制作事例モーダル (ContentsX同様) =====
  var wdOverlay = document.getElementById('workDetailOverlay');
  var wdClose = document.getElementById('workDetailClose');
  var wdCarousel = document.getElementById('workDetailCarousel');
  var wdDots = document.getElementById('workDetailDots');
  var wdPrev = document.getElementById('workDetailPrev');
  var wdNext = document.getElementById('workDetailNext');
  var wdTitle = document.getElementById('workDetailTitle');
  var wdCategory = document.getElementById('workDetailCategory');
  var wdMedia = document.getElementById('workDetailMedia');
  var wdSpec = document.getElementById('workDetailSpec');
  var wdPoint = document.getElementById('workDetailPoint');
  var wdComment = document.getElementById('workDetailComment');
  var wdLink = document.getElementById('workDetailLink');

  var wdCurrentPage = 0;
  var wdTotalPages = 0;
  var wdLoader = document.getElementById('workDetailLoader');

  function showWdLoader() { if (wdLoader) wdLoader.classList.remove('hidden'); }
  function hideWdLoader() { if (wdLoader) wdLoader.classList.add('hidden'); }

  function openWorkDetail(workId) {
    if (!wdOverlay) return;
    var work = worksMap[workId];
    if (!work) return;
    showWdLoader();

    if (wdTitle) wdTitle.textContent = work.title_ja || '';
    if (wdCategory) wdCategory.textContent = work.category || '';
    var esc = window.bmSanitize ? window.bmSanitize.html : function(s){ return s || ''; };
    if (wdMedia) wdMedia.innerHTML = (work.media || []).map(function(m) { return '<li>' + esc(m) + '</li>'; }).join('');
    if (wdSpec) {
      var spec = work.spec || {};
      // spec.pages(WP手入力の表示文字列)より実galleryの枚数を優先する
      // (BUGS #049/#050と同種。bm-works-page.jsと同ロジック、必ず両方直す)
      var galleryLenForSpec = (work.gallery && work.gallery.length) || 0;
      var pagesV = esc(galleryLenForSpec > 0 ? (galleryLenForSpec + 'P') : (spec.pages || '—'));
      wdSpec.innerHTML = '<li>ページ数：' + pagesV + '</li><li>納期：' + esc(spec.period || '—') + '</li>';
    }
    if (wdPoint) wdPoint.textContent = work.point || '';
    if (wdComment) wdComment.textContent = work.comment || '';
    // 「詳細を見る」→ 個別作品ページ
    if (wdLink) wdLink.href = '/works/' + encodeURIComponent(work.id);

    // gallery実枚数があればwork.pages(WP手入力)より優先する(BUGS #049/#050と同種)
    var galleryLenForPreview = (work.gallery && work.gallery.length) || 0;
    var previewPages = Math.min(galleryLenForPreview > 0 ? galleryLenForPreview : (work.pages || 5), 5);
    wdTotalPages = previewPages;
    wdCurrentPage = 0;

    if (wdCarousel) {
      wdCarousel.innerHTML = '';
      wdCarousel.style.transform = 'translateX(0)';

      function buildPages(isVertical) {
        var frag = document.createDocumentFragment();
        var hasGallery = work.gallery && work.gallery.length > 0;
        for (var i = 1; i <= previewPages; i++) {
          var img = document.createElement('img');
          if (hasGallery && work.gallery[i - 1]) {
            img.src = work.gallery[i - 1];
          } else {
            img.src = 'https://contentsx.jp/material/manga/' + work.id + '/' + String(i).padStart(2, '0') + '.webp';
          }
          img.alt = (work.title_ja || '') + ' ' + i + 'ページ';
          // 1枚目のロード完了でローダーを非表示
          if (i === 1) {
            img.onload = hideWdLoader;
            img.onerror = hideWdLoader;
          }
          frag.appendChild(img);
        }
        wdCarousel.appendChild(frag);
      }

      // 縦読み判定: 1ページ目 or 2ページ目が縦長なら縦スクロール
      function applyVerticalMode() {
        wdCarousel.classList.add('vertical-scroll');
        if (wdCarousel.parentElement) wdCarousel.parentElement.classList.add('has-vertical-scroll');
        wdCarousel.style.transform = '';
        buildPages(true);
        if (wdDots) wdDots.style.display = 'none';
        if (wdPrev) wdPrev.style.display = 'none';
        if (wdNext) wdNext.style.display = 'none';
        // スマホ縦読みは上下2ペインに分割（漫画を読み切らないと詳細に届かない問題の解消）
        if (window.bmWdSplit) window.bmWdSplit.apply();
      }
      function applyCarouselMode() {
        wdCarousel.classList.remove('vertical-scroll');
        if (wdCarousel.parentElement) wdCarousel.parentElement.classList.remove('has-vertical-scroll');
        buildPages(false);
        if (wdDots) {
          wdDots.style.display = 'flex';
          wdDots.innerHTML = '';
          for (var j = 0; j < previewPages; j++) {
            var dot = document.createElement('div');
            dot.className = 'work-detail-dot' + (j === 0 ? ' active' : '');
            (function(idx) {
              dot.addEventListener('click', function() { goToPage(idx); });
            })(j);
            wdDots.appendChild(dot);
          }
        }
        if (wdPrev) wdPrev.style.display = '';
        if (wdNext) wdNext.style.display = '';
        // 横読みは従来どおり一体スクロール（前回の縦読みの分割状態を残さない）
        if (window.bmWdSplit) window.bmWdSplit.reset();
      }
      // 共通ヘルパーで判定（works.js / bm-works-page.js と同ロジック）
      if (window.bmViewType && window.bmViewType.isForcedVertical(work)) {
        applyVerticalMode();
      } else {
        // 即座にカルーセルモードで仮表示（体感速度向上）
        applyCarouselMode();

        // view_typeが未設定の旧データ向けフォールバック: 1ページ目の画像で判定
        var hasGallery = work.gallery && work.gallery.length > 0;
        var firstSrc = hasGallery && work.gallery[0] ? work.gallery[0] : 'https://contentsx.jp/material/manga/' + work.id + '/01.webp';
        if (window.bmViewType && window.bmViewType.probeVerticalByImage) {
          window.bmViewType.probeVerticalByImage(firstSrc).then(function(isV) {
            if (isV) applyVerticalMode();
          });
        }
      }
    }

    wdOverlay.classList.add('active');
    wdOverlay.scrollTop = 0;
    document.body.style.overflow = 'hidden';
  }

  function goToPage(idx) {
    wdCurrentPage = idx;
    if (wdCarousel) wdCarousel.style.transform = 'translateX(-' + (idx * 100) + '%)';
    if (wdDots) {
      var dots = wdDots.querySelectorAll('.work-detail-dot');
      for (var i = 0; i < dots.length; i++) {
        dots[i].classList.toggle('active', i === idx);
      }
    }
  }

  function closeModal() {
    if (wdOverlay) wdOverlay.classList.remove('active');
    document.body.style.overflow = '';
    hideWdLoader();
    if (window.bmWdSplit) window.bmWdSplit.reset();
  }

  if (wdPrev) wdPrev.addEventListener('click', function() {
    if (wdCurrentPage > 0) goToPage(wdCurrentPage - 1);
  });
  if (wdNext) wdNext.addEventListener('click', function() {
    if (wdCurrentPage < wdTotalPages - 1) goToPage(wdCurrentPage + 1);
  });
  if (wdClose) wdClose.addEventListener('click', closeModal);
  if (wdOverlay) wdOverlay.addEventListener('click', function(e) {
    if (e.target === wdOverlay) closeModal();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && wdOverlay && wdOverlay.classList.contains('active')) closeModal();
    if (wdOverlay && wdOverlay.classList.contains('active')) {
      if (e.key === 'ArrowLeft' && wdCurrentPage > 0) goToPage(wdCurrentPage - 1);
      if (e.key === 'ArrowRight' && wdCurrentPage < wdTotalPages - 1) goToPage(wdCurrentPage + 1);
    }
  });

  // グローバルに公開（他のスクリプトからも呼べるように）
  window.openWorkDetail = openWorkDetail;

  // ===== データ初期化 =====
  // WP接続待ちプレースホルダ
  var heroLoadingEl = document.getElementById('bmHeroLoading');
  var heroDataApplied = false;

  function hideHeroLoading() {
    if (heroLoadingEl) {
      heroLoadingEl.classList.add('bm-hero-loading--hidden');
    }
  }

  function applyHeroWorks(works) {
    if (heroDataApplied || !works || works.length === 0) return;
    heroDataApplied = true;
    hideHeroLoading();
    buildMarquee(works);
  }

  // 初期描画は行わない。WordPress のデータが届くまで「接続中」表示。
  var lastWorks = null;
  function rebuildHero() {
    if (!lastWorks) return;
    buildMarquee(lastWorks);
  }
  /* WordPress の作品一覧から、ヒーローに出すものを順番どおりに */
  function heroWorksFrom(allWorks) {
    // show_hero_site: 'both' or 'bizmanga' → BizMangaヒーローに表示
    // 後方互換: show_hero_site がない場合は show_hero フラグで判定
    return allWorks.filter(function(w) {
      if ('show_hero_site' in w) {
        return w.show_hero_site === 'both' || w.show_hero_site === 'bizmanga';
      }
      return w.show_hero !== false;
    }).slice().sort(function(a, b) {
      /* hero_order_bm 昇順。未設定(9999)は末尾 */
      var ao = typeof a.hero_order_bm === 'number' ? a.hero_order_bm : 9999;
      var bo = typeof b.hero_order_bm === 'number' ? b.hero_order_bm : 9999;
      return ao - bo;
    });
  }

  function onHeroData(allWorks) {
    var works = heroWorksFrom(allWorks);
    if (works.length > 0) {
      lastWorks = works;
      applyHeroWorks(works);
    } else {
      hideHeroLoading();   // 「ヒーローに出す」が1つも無い: 背景の作品なしで表示する
    }
  }

  /* WordPress から届かなかったとき: 「接続中」のまま、間をあけて取り直す（1回の待ちは bm-wp-config.js の timeout）。
     最後まで届かなければ「接続中」を消し、背景の作品なしで表示する（設定を見ない作品は出さない） */
  var RETRY_DELAYS = [2000, 5000, 10000, 20000];
  var retryStarted = false;
  function retryHeroData(n) {
    retryStarted = true;
    if (heroDataApplied) return;
    if (n >= RETRY_DELAYS.length || typeof window.bmApiFetch !== 'function') { hideHeroLoading(); return; }
    setTimeout(function() {
      window.bmApiFetch('/works').then(function(data) {
        if (Array.isArray(data) && data.length > 0) {
          window.BM_HERO_WORKS_DATA = data;
          onHeroData(data);
        } else {
          retryHeroData(n + 1);
        }
      });
    }, RETRY_DELAYS[n]);
  }

  window.addEventListener('bm-data-ready', function() {
    var allWorks = window.BM_HERO_WORKS_DATA || window.BM_WORKS_DATA || [];
    if (allWorks.length > 0) onHeroData(allWorks);
    else retryHeroData(0);
  });

  // bm-data-ready 自体が来ない（WP 連携が無効・読み込みの失敗）ときの保険: 8秒たっても何も無ければ取り直しを始める
  setTimeout(function() {
    if (!heroDataApplied && !retryStarted) retryHeroData(0);
  }, 8000);

  // ブレークポイントを跨ぐリサイズで再振り分け（debounce）
  var lastRowCount = getActiveRowCount();
  var resizeTimer = null;
  window.addEventListener('resize', function() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      var current = getActiveRowCount();
      if (current !== lastRowCount) {
        lastRowCount = current;
        rebuildHero();
      }
    }, 200);
  });
})();
