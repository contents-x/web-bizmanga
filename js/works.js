// ===== Pre-production carousel state (must be declared early for direct mode) =====
var preCarouselTimers = [];
function pauseAllCarousels() { if (preCarouselTimers) preCarouselTimers.forEach(t => t.pause()); }
function resumeAllCarousels() { if (preCarouselTimers) preCarouselTimers.forEach(t => t.resume()); }

// ===== Global Image Cache Pool (Critical Optimization) =====
// Warms browser cache by loading images; browser will serve from disk/memory cache on subsequent requests
const imageCache = new Set();
function getCachedImage(src) {
  if (imageCache.has(src)) return Promise.resolve(src);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { imageCache.add(src); resolve(src); };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

// ===== Manga Page Loader Helpers =====
// srcをセットする「前に」呼ぶ。リスナーを先に付けてからsrcを変更する。
function prepareImgLoad(imgEl, containerEl) {
  if (!containerEl) return;
  containerEl.classList.remove('img-loaded');
  function markLoaded() { containerEl.classList.add('img-loaded'); }
  imgEl.addEventListener('load', markLoaded, { once: true });
  imgEl.addEventListener('error', markLoaded, { once: true });
}
// 後方互換
function watchImgLoad(imgEl, containerEl) { prepareImgLoad(imgEl, containerEl); }
function showMangaLoader() {}
function hideMangaLoader() {}

// ===== Header scroll effect =====
const header = document.getElementById('header');
if (header) {
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });
}

// ===== XSS対策ヘルパー（WP API由来の文字列をHTML連結する前に必ず通す） =====
function escHtml(s) {
  if (window.bmSanitize && window.bmSanitize.html) return window.bmSanitize.html(s);
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ===== Manga data registry =====
const mangaData = {};

// ===== 直リンク（QR: biz-library?manga=bms-unso）か =====
// 一覧の組み立て（下の「フォールバックデータで即座に構築」）より前に判定する。直リンクでは一覧を出さないので組み立てない
const params = new URLSearchParams(window.location.search);
const autoOpen = params.get('manga');

// ?manga= の値の末尾から取り除く文字: 空白・制御文字と、記号・句読点・かっこ（LINE・メールで URL の直後に続いた「。」「.」「)」
// 「」」、全角の句読点・空白など）。作品 ID に使いうる文字（英数字・ハイフン・下線と、日本語などの文字。「々」「〇」も）は残す。
// ⚠️ biz-library.html の <head> の direct-mode の判定も同じ文字の範囲を使う（変えるときは両方。食い違っても下で html の class を
//    この判定に合わせ直すので、ずれるのは最初の一瞬の表示だけ）
var DIRECT_KEY_TRAILING = /[\u0000-\u002c\u002e\u002f\u003a-\u0040\u005b-\u005e\u0060\u007b-\u00a0\u1680\u2000-\u206f\u3000-\u3004\u3008-\u3020\u3030\u3036\u3037\u303d-\u303f\ufe30-\ufe6f\ufeff\uff01-\uff0f\uff1a-\uff20\uff3b-\uff40\uff5b-\uff65]$/;
// ?manga= の値を整える: 前後の空白と、末尾に付いた上の文字を取り除く。小文字にはそろえない（照合は matchKey が大文字小文字を
// 区別せずに行う）
function normalizeDirectKey(v) {
  var s = String(v).trim();
  while (s && DIRECT_KEY_TRAILING.test(s)) s = s.slice(0, -1);
  return s;
}
// 直リンクの作品 ID（?manga= の値を normalizeDirectKey で整えたもの。例 ?manga=seko。→ seko）
var directKey = autoOpen === null ? '' : normalizeDirectKey(autoOpen);
// 直リンクか: 整えた値が空でないときだけ（?manga= の値が空・記号だけなら、通常のビズ書庫を表示する）
const isDirectMode = !!directKey;
// 書庫を隠す html.direct-mode（biz-library.html の <head> が先に付ける）を、この判定に合わせる
document.documentElement.classList[isDirectMode ? 'add' : 'remove']('direct-mode');

// ===== ページネーション状態（initLibraryUIより前に宣言が必要） =====
let gridCurrentPage = 1;
const ITEMS_PER_PAGE = 18; // 3列 × 6行
const gridPagination = document.getElementById('gridPagination');

// ===== ヘルパー: ギャラリーURL or パスから画像src取得 =====
function getImageSrc(data, pageIndex) {
  if (data.gallery && data.gallery.length > pageIndex) {
    return data.gallery[pageIndex];
  }
  return data.path + String(pageIndex + 1).padStart(2, '0') + '.webp';
}

// ===== フォールバック用ローカルデータ =====
// ビズ書庫の一覧の初期表示（WP の /library が届くまで）と、その間にカードを押したときに開くデータ（表紙は素材フォルダの画像）。
// /library が届いたら WP のデータに置き換わる。QR直リンクでは使わない。
// 作品の一覧は js/bm-fallback-works.js（window.BM_FALLBACK_WORKS。埋込ビューアと共通。載せてよい作品・ページ数の決まりもそこ）。
// WP の作品データと同じ形にして toMangaEntry() で変換する（表示モードの判定を window.bmViewType に任せる。BUGS #012/#013）
const FALLBACK_WORKS = (function() {
  // 読込順が崩れて bm-fallback-works.js がまだ実行されていないと、一覧が黙って空になる。エラーにして気づけるようにする
  // （tools/smoke-manga-wp.py は JS エラーで FAIL にし、WP が届く前の一覧の件数も確かめる）
  if (!Array.isArray(window.BM_FALLBACK_WORKS)) {
    console.error('[works] js/bm-fallback-works.js が works.js より前に読まれていません（手書きの作品データが空）');
  }
  var F = Array.isArray(window.BM_FALLBACK_WORKS) ? window.BM_FALLBACK_WORKS : [];
  var out = {};
  F.forEach(function(r) {
    out[r[0]] = toMangaEntry({ id: r[0], title_ja: r[1], pages: r[2], tags: [r[3]], category: r[3], view_type: r[4] });
  });
  return out;
})();

// ===== WP の作品データ（/library の1件・/manga/{id} の応答）→ mangaData の形 =====
// /library と /manga/{id}（QR直リンク）の両分岐で必ずこの関数を通す。分岐ごとに書くと
// ページ数・view_type・CTA 項目がずれる（BUGS #012/#013 の「両分岐を揃える」を構造で守る）。
// - ページ数: ギャラリーがあれば実際の画像枚数を正とする（WP側の pages 手入力ミスでズレても表示・読込枚数が
//   実データと一致するように。片方向補正だと gallery > pages（例: pages=25 なのに gallery=30枚）を見逃す）。
//   ギャラリーが空なら WP の pages、それも無ければ 1（0 だと見開きの組み立て・ページ表示が成り立たない）
// - タイトル: 空なら作品 ID（ビューアの見出し・画像の alt を空にしない）
// - path: ギャラリーが空のときの画像の置き場（getImageSrc が path + '01.webp' を作る。無いと 'undefined01.webp'）
// - view_type: WP の値を使い、強制縦読み（isForcedVertical）と縦読み専用＝切替不可（isVerticalOnly）の判定は
//   window.bmViewType に委譲する（自前で判定しない）。bm-view-type.js が読めなかったとき（window.bmViewType が無い）だけ、
//   縦読みの作品を見開きで開かない安全側に倒す: view_type が vertical / vertical_only なら縦読み、vertical_only なら切替不可
//   （bm-view-type.js 導入前の /library 側の書き方と同じ。縦読み専用の作品が 'vertical_only' のまま見開きの分岐に入るのを防ぐ）
// ページ数をギャラリー枚数に合わせるのはここだけ（openManga では直さない。他の登録経路〈制作過程のデータ〉も
// ギャラリーがあればその枚数をページ数にしている）
function toMangaEntry(w) {
  var galleryLen = (w.gallery && w.gallery.length) || 0;
  var wpPages = parseInt(w.pages, 10) || 0;
  var vt = window.bmViewType;
  var forcedVertical = vt ? vt.isForcedVertical(w) : (w.view_type === 'vertical' || w.view_type === 'vertical_only');
  var verticalOnly = vt ? vt.isVerticalOnly(w) : w.view_type === 'vertical_only';
  var entry = {
    title: w.title_ja || String(w.id || ''),
    pages: galleryLen > 0 ? galleryLen : (wpPages > 0 ? wpPages : 1),
    path: 'https://contentsx.jp/material/manga/' + w.id + '/',
    tags: w.tags && w.tags.length > 0 ? w.tags : [],
    category: w.category || '',
    viewType: forcedVertical ? 'vertical' : (w.view_type || 'spread'),
    verticalOnly: !!verticalOnly,
    tallCover: !!w.tall_cover,
    thumbnail: w.thumbnail || '',
    gallery: w.gallery || [],
    akapen_gallery: w.akapen_gallery || [],
    name_gallery: w.name_gallery || [],
    client_url: w.client_url || '',
    cta_label_ja: w.cta_label_ja || '',
    cta_enabled: !!w.cta_enabled
  };
  return entry;
}

// ===== カテゴリの絞り込みボタン =====
const worksFilter = document.getElementById('worksFilter');

function buildFilterButtons() {
  worksFilter.innerHTML = '';
  // 制作過程エントリはフィルタから除外
  const allWorks = Object.values(mangaData).filter(d => !d._isPreProduction);
  const categories = ['すべて'];
  allWorks.forEach(d => {
    if (d.category && !categories.includes(d.category)) categories.push(d.category);
  });
  const catCount = {};
  allWorks.forEach(d => {
    if (d.category) catCount[d.category] = (catCount[d.category] || 0) + 1;
  });
  catCount['すべて'] = allWorks.length;
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (cat === 'すべて' ? ' active' : '');
    btn.dataset.cat = cat;
    /* escHtml() 済み（XSS対策） */
    const labelJa = escHtml(cat);
    btn.innerHTML = `<span>${labelJa}</span> <span class="filter-count">${catCount[cat]}</span>`;
    btn.addEventListener('click', (e) => {
      filterWorks(cat, btn);
      // 利用者が押したときだけ、一覧の途中・下なら結果の先頭へ戻す（そのままだと結果が画面の上に外れて
      // 何も無いように見える）。一覧の先頭より上で押したときは動かさない（onlyIfBelow）。
      // ⚠️ WP データ到着時の再構築も、選んでいたカテゴリを戻すために同じボタンを .click() する。
      //    そのとき（isTrusted が false）に動かすと、読んでいる途中でページが一覧の先頭へ跳ねる（PR #78 再レビュー）
      if (e.isTrusted) scrollLibraryToGridTop(true);
    });
    worksFilter.appendChild(btn);
  });
}

// 一覧の先頭（1行目）を追従するフィルター帯（.works-filter）のすぐ下へ戻す。
// 送り先の計算（帯が貼り付いているときは帯の実際の高さを差し引く／追従しない画面はヘッダーの下 16px）は
// 全ページ共通の window.bmScrollBelowSticky（js/bm-nav.js。SPEC §0.6）。
// onlyIfBelow: true＝絞り込み（一覧より上にいるときは動かさない）／false＝ページ送り（常に送る）
function scrollLibraryToGridTop(onlyIfBelow) {
  if (window.bmScrollBelowSticky) window.bmScrollBelowSticky(worksGrid, worksFilter, { onlyIfBelow: onlyIfBelow });
}

function filterWorks(category, activeBtn) {
  worksFilter.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  activeBtn.classList.add('active');
  let visibleCount = 0;
  document.querySelectorAll('.work-card').forEach(card => {
    if (category === 'すべて' || card.dataset.category === category) {
      card.classList.remove('filter-hidden');
      visibleCount++;
    } else {
      card.classList.add('filter-hidden');
    }
  });
  document.getElementById('noResults').classList.toggle('visible', visibleCount === 0);
  gridCurrentPage = 1;
  updateGridPagination();
}

// ===== カード生成 =====
const worksGrid = document.getElementById('worksGrid');

function buildWorkCards() {
  worksGrid.innerHTML = '';
  const cardsFrag = document.createDocumentFragment();
  Object.entries(mangaData).forEach(([key, data]) => {
    // 制作過程（赤ペン・ネーム専用）エントリはカードに出さない
    if (data._isPreProduction) return;
    const card = document.createElement('div');
    card.className = 'work-card';
    card.setAttribute('data-manga', key);
    card.setAttribute('data-category', data.category);
    /* 以降の変数は全て escHtml() 済み（XSS対策） */
    const coverSrc = escHtml(data.thumbnail || getImageSrc(data, 0));
    const tallClass = data.tallCover ? ' tall-cover' : '';
    const title = escHtml(data.title);
    const cat = escHtml(data.category);
    card.innerHTML = `
      <div class="work-card-img-wrapper${tallClass}">
        <img class="work-card-img" src="${coverSrc}" alt="${title}" loading="lazy">
        ${data.category ? `<span class="work-card-category">${cat}</span>` : ''}
        <span class="work-card-page-count">${parseInt(data.pages, 10) || 0}P</span>
      </div>
      <div class="work-card-body">
        <div class="work-card-title">${title}</div>
        <div class="work-card-footer">
          <div class="work-card-arrow">→</div>
        </div>
      </div>
    `;
    cardsFrag.appendChild(card);
  });
  worksGrid.appendChild(cardsFrag);
}

// ===== UI構築（フォールバック → API上書き） =====
function initLibraryUI() {
  buildFilterButtons();
  buildWorkCards();
  gridCurrentPage = 1;
  updateGridPagination();
}

// ===== 表紙の縦長自動検出（カード表示修正用） =====
function probeCoverImages() {
  document.querySelectorAll('.work-card').forEach(function(card) {
    var key = card.dataset.manga;
    var data = mangaData[key];
    if (!data) return;
    var wrapper = card.querySelector('.work-card-img-wrapper');
    var img = card.querySelector('.work-card-img');
    if (!wrapper || !img) return;

    // WPでvertical指定済み → プローブ不要、tall-coverだけ確実に付ける
    if (data.tallCover) {
      wrapper.classList.add('tall-cover');
      return;
    }

    function checkTall() {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        var ratio = img.naturalHeight / img.naturalWidth;
        if (ratio > 1.8) {
          data.tallCover = true;
          data.verticalOnly = true;
          data.viewType = 'vertical';
          wrapper.classList.add('tall-cover');
        }
      }
    }
    if (img.complete && img.naturalWidth > 0) {
      checkTall();
    } else {
      img.addEventListener('load', checkTall);
    }
  });
}

// フォールバックデータで即座に構築（WP の /library が届くまでの一覧の表示）。
// 直リンクでは一覧を出さず、作品も WP のデータで開く（下の「QR直リンクの開き方」）ので、
// ここでは手書きデータを登録しない
if (!isDirectMode) {
  Object.assign(mangaData, FALLBACK_WORKS);
  initLibraryUI();
  probeCoverImages();  // 表紙の縦長自動検出
}

// ===== WP API（/library と QR直リンクの /manga/{id} で共用）=====
// API の場所は js/bm-wp-config.js の apiBase（ビズ書庫〈biz-library.html。works.js を読む唯一のページ〉は bm-wp-config.js を
// works.js より前に読む。tools/check-site.py の依存表で確かめる）。読めなかったときだけ既定の場所を使う。
// 時間切れは bm-wp-config.js の timeout を使わず、QR直リンクの取得ごとに決める（下の DIRECT_FETCH_TIMEOUT_MS）
var WP_API_BASE = (window.BM_WP_CONFIG && typeof window.BM_WP_CONFIG.apiBase === 'string' && window.BM_WP_CONFIG.apiBase) ||
  'https://cms.contentsx.jp/wp-json/contentsx/v1';

// WP API を GET して { status, data } を返す（data は応答本文の JSON。JSON として読めなければ null）。
// timeoutMs を渡すと、本文の読み込みまで含めてその時間で中断する（AbortError で reject。AbortController を使う）。
// controller（AbortController）を渡すと、呼び出し側が好きなときに中断できる（QR直リンクの /library。startDirectFlow）。
// 通信の失敗も reject。AbortController が無い古いブラウザでは中断だけ効かない
function wpApiGet(endpoint, timeoutMs, controller) {
  if (!controller && timeoutMs > 0 && typeof AbortController === 'function') controller = new AbortController();
  var timer = (controller && timeoutMs > 0) ? setTimeout(function() { controller.abort(); }, timeoutMs) : null;
  function stopTimer() { if (timer) clearTimeout(timer); }
  return fetch(WP_API_BASE + endpoint, controller ? { signal: controller.signal } : undefined)
    .then(function(res) {
      return res.text().then(function(text) {
        var data = null;
        try { data = JSON.parse(text); } catch (e) { /* JSON でない（HTML のエラーページ等） */ }
        return { status: res.status, data: data };
      });
    })
    .then(function(result) { stopTimer(); return result; },
          function(err) { stopTimer(); throw err; });
}

// ===== /library（ビズ書庫の作品一覧）=====
// 作品の配列を返す。取得の失敗・WP 以外の応答・空（0件）・中断なら null（0件は WP の異常として扱い、一覧は手書きデータのまま、
// QR直リンクは必要なら取り直す）。時間では中断しない（中断したいときは controller を渡す。wpApiGet と同じ）
function fetchLibrary(controller) {
  return wpApiGet('/library', 0, controller).then(function(r) {
    return (r.status >= 200 && r.status < 300 && Array.isArray(r.data) && r.data.length > 0) ? r.data : null;
  }, function(err) {
    console.warn('WP API（/library）を取得できません:', (err && err.name === 'AbortError') ? '時間切れ' : err);
    return null;
  });
}

// /library の作品を mangaData に登録し、一覧を作り直す（直リンクでは登録だけ）。QR直リンクの /library の取得でも呼ぶ
function applyLibrary(works) {
  if (!works) return;

  // APIの並び順を尊重するため、漫画作品は一度全削除してAPI順で再登録（プリプロ関連データ _isPreProduction は保持）。
  // 表示中のビューアは開いたときのデータ（見開き/縦読みの切替は currentMangaData、最終ページCTA は currentCtaData）を使うので、
  // 開いている作品のデータをここで差し替えても・消しても（/library に無い QR限定公開の作品など）表示は変わらない
  Object.keys(mangaData).forEach(function(k) {
    if (!mangaData[k]._isPreProduction) delete mangaData[k];
  });
  works.forEach(function(w) {
    // /manga/{id}（QR直リンク）と同じ関数で変換する（BUGS #012/#013）
    mangaData[w.id] = toMangaEntry(w);
  });

  // 一覧から WP の到着前に開いた作品（手書きデータ FALLBACK_WORKS で開いている）は、届いた WP のデータを次の見開き/縦読みの
  // 切替から使う（表示中のページは開き直さない）。QR直リンクは開いたときの WP のデータのまま
  if (!isDirectMode && currentMangaData && !currentMangaData._isPreProduction && mangaModal.classList.contains('open') &&
      Object.prototype.hasOwnProperty.call(mangaData, currentMangaKey)) {
    currentMangaData = mangaData[currentMangaKey];
  }

  if (isDirectMode) {
    // 直リンクでは一覧・制作過程カルーセルが隠れているので作り直さない（表紙の縦長判定もしない）。
    // 制作過程の直リンク（pre-red-* / pre-name-*）だけは、/library の作品の赤ペン・ネームを pre-red-{作品ID} 等で
    // 登録する（buildPreDataFromAPI）。/preproduction の項目は startDirectFlow が /library と並行して取って登録する
    // （ここで rebuildPreCarousels() を呼ぶと /preproduction をもう一度取りに行くので呼ばない。Issue #84）
    if (isPreProductionKey(directKey)) buildPreDataFromAPI();
    return;
  }

  // フィルター状態とページを保持してUI再構築
  var activeFilter = worksFilter.querySelector('.filter-btn.active');
  var savedCategory = activeFilter ? activeFilter.dataset.cat : 'すべて';
  var savedPage = gridCurrentPage;
  initLibraryUI();
  // フィルターを復元
  if (savedCategory !== 'すべて') {
    var targetBtn = worksFilter.querySelector('.filter-btn[data-cat="' + savedCategory + '"]');
    if (targetBtn) {
      targetBtn.click();
      gridCurrentPage = savedPage;
      updateGridPagination();
    }
  } else {
    gridCurrentPage = savedPage;
    updateGridPagination();
  }
  probeCoverImages();  // WP APIデータでも表紙の縦長自動検出

  // 赤ペン・ネームカルーセルも再構築（/library の作品の赤ペン・ネームを pre-red-{作品ID} 等で登録する）
  if (typeof rebuildPreCarousels === 'function') rebuildPreCarousels();
}

// 一覧の /library。時間切れで中断しない（遅れて届いても一覧と mangaData を WP のデータに更新する）。
// QR直リンクは一覧を出さず、/library を直リンク用の時間切れつきで取る（下の「Direct access mode」の startDirectFlow）
if (!isDirectMode) {
  fetchLibrary().then(applyLibrary).catch(function(err) {
    console.warn('WP API（/library）のデータを反映できませんでした:', err);
  });
}

// Event delegation for card clicks + hover preloading
worksGrid.addEventListener('click', (e) => {
  const card = e.target.closest('.work-card');
  if (card) {
    const key = card.dataset.manga;
    openManga(key);
  }
});

// Hover preloading: start loading first 4 pages immediately on hover
worksGrid.addEventListener('mouseenter', (e) => {
  const card = e.target.closest('.work-card');
  if (card) {
    const key = card.dataset.manga;
    const data = mangaData[key];
    if (data) {
      const preloadSrcs = [];
      for (let i = 0; i < Math.min(4, data.pages); i++) {
        preloadSrcs.push(getImageSrc(data, i));
      }
      preloadSrcs.forEach(src => getCachedImage(src));
    }
  }
}, true);

// ===== Card Grid Pagination =====

function updateGridPagination() {
  const visibleCards = Array.from(document.querySelectorAll('.work-card:not(.filter-hidden)'));
  const totalItems = visibleCards.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));

  if (gridCurrentPage > totalPages) gridCurrentPage = 1;
  if (!(gridCurrentPage >= 1)) gridCurrentPage = 1; // 0・負数・NaN（範囲外）は1ページ目へ（Issue #84）

  // Show/hide cards based on current page
  visibleCards.forEach((card, idx) => {
    const pageForCard = Math.floor(idx / ITEMS_PER_PAGE) + 1;
    card.classList.toggle('page-hidden', pageForCard !== gridCurrentPage);
  });

  // Build pagination bar
  const frag = document.createDocumentFragment();
  if (totalPages <= 1) {
    const singleBtn = mkPgBtn('1', () => {});
    singleBtn.classList.add('active');
    frag.appendChild(singleBtn);
    gridPagination.innerHTML = '';
    gridPagination.appendChild(frag);
    return;
  }

  // Previous
  // 端のボタンは disabled 属性で止める（class だけだと pointer-events は止まってもキーボードの Enter で押せ、
  // ページが 0 や総ページ数+1 になってグリッドが空になる。Issue #84）。押された場合も範囲内に収める
  const prevBtn = mkPgBtn('‹ Previous', () => { gridCurrentPage = Math.max(1, gridCurrentPage - 1); updateGridPagination(); });
  if (gridCurrentPage <= 1) { prevBtn.classList.add('disabled'); prevBtn.disabled = true; }
  frag.appendChild(prevBtn);

  // Page numbers
  const pages = generatePageNumbers(gridCurrentPage, totalPages);
  pages.forEach(p => {
    if (p === '...') {
      const el = document.createElement('span');
      el.className = 'pg-ellipsis';
      el.textContent = '...';
      frag.appendChild(el);
    } else {
      // 一覧の先頭へ戻すスクロールは下の gridPagination のクリック（‹ Previous・Next › と共通）で行う
      const btn = mkPgBtn(p, () => { gridCurrentPage = p; updateGridPagination(); });
      if (p === gridCurrentPage) btn.classList.add('active');
      frag.appendChild(btn);
    }
  });

  // Next
  const nextBtn = mkPgBtn('Next ›', () => { gridCurrentPage = Math.min(totalPages, gridCurrentPage + 1); updateGridPagination(); });
  if (gridCurrentPage >= totalPages) { nextBtn.classList.add('disabled'); nextBtn.disabled = true; }
  frag.appendChild(nextBtn);

  gridPagination.innerHTML = '';
  gridPagination.appendChild(frag);
}

function mkPgBtn(label, onClick) {
  const btn = document.createElement('button');
  btn.className = 'pg-btn';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function generatePageNumbers(current, total) {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  if (current > 4) pages.push('...');
  const start = Math.max(2, current - 2);
  const end = Math.min(total - 1, current + 2);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 3) pages.push('...');
  pages.push(total);
  return pages;
}

// ページ送り（番号・‹ Previous・Next ›）で一覧の先頭を追従する帯のすぐ下へ戻す（PR #78 再レビュー:
// 以前は番号だけが戻し、Previous/Next は下の位置のまま次のページが出た）。
// 各ボタンの処理（ページの切り替え・ボタンの作り直し）が済んだ後に、バブリングでここに届く。
// 押したボタンが「今のページ」（active）・端で押せない（disabled）なら、ページが変わらないので動かさない
// （作り直す前のボタンの状態で判定する）。
gridPagination.addEventListener('click', (e) => {
  const btn = e.target.closest('.pg-btn');
  if (!btn || btn.classList.contains('active') || btn.classList.contains('disabled')) return;
  scrollLibraryToGridTop(false);
});

// Initial pagination render
updateGridPagination();

// ===== Manga Modal (Vertical Scroll — vertical.html style) =====
const mangaModal = document.getElementById('mangaModal');
const modalManga = document.getElementById('modalManga');
const modalProgress = document.getElementById('modalProgress');
const modalPage = document.getElementById('modalPage');
const modalTitle = document.getElementById('modalTitle');
const modalHeader = document.getElementById('modalHeader');
const modalThumbSidebar = document.getElementById('modalThumbSidebar');
const modalSideIndicator = document.getElementById('modalSideIndicator');
const modalBackToTop = document.getElementById('modalBackToTop');
const modalZoomControls = document.getElementById('modalZoomControls');
const modalFooter = document.getElementById('modalFooter');

// Cache DOM refs for show/hide optimization
const docsToToggle = {
  modalManga,
  modalThumbSidebar,
  modalZoomControls,
  modalSideIndicator,
  modalBackToTop,
  modalProgress,
  modalFooter
};

let modalTotalPages = 0;
let modalPageEls = [];
let modalThumbItems = [];
let modalDots = [];
let modalLastScrollY = 0;
let modalHeaderVisible = true;
let modalScrollTimer = null;
let modalPrevPage = -1;
let verticalObserver = null;

// --- Zoom ---
const MODAL_ZOOM_DEFAULT = 500;
const MODAL_ZOOM_STEP = 100;
const MODAL_ZOOM_MIN = 300;
const MODAL_ZOOM_MAX = 1000;
let modalCurrentZoom = MODAL_ZOOM_DEFAULT;
const modalZoomLabel = document.getElementById('modalZoomLabel');
const modalZoomIn = document.getElementById('modalZoomIn');
const modalZoomOut = document.getElementById('modalZoomOut');
const modalZoomReset = document.getElementById('modalZoomReset');

function modalApplyZoom() {
  modalManga.style.maxWidth = modalCurrentZoom + 'px';
  const pct = Math.round((modalCurrentZoom / MODAL_ZOOM_DEFAULT) * 100);
  modalZoomLabel.textContent = pct + '%';
  modalZoomOut.disabled = modalCurrentZoom <= MODAL_ZOOM_MIN;
  modalZoomIn.disabled = modalCurrentZoom >= MODAL_ZOOM_MAX;
}

modalZoomIn.addEventListener('click', () => {
  modalCurrentZoom = Math.min(MODAL_ZOOM_MAX, modalCurrentZoom + MODAL_ZOOM_STEP);
  modalApplyZoom();
});
modalZoomOut.addEventListener('click', () => {
  modalCurrentZoom = Math.max(MODAL_ZOOM_MIN, modalCurrentZoom - MODAL_ZOOM_STEP);
  modalApplyZoom();
});
modalZoomReset.addEventListener('click', () => {
  modalCurrentZoom = MODAL_ZOOM_DEFAULT;
  modalApplyZoom();
});

// --- Get current page from scroll using binary search (optimized) ---
function modalGetCurrentPage() {
  const center = window.innerHeight * 0.4;
  let left = 0, right = modalPageEls.length - 1;
  let result = 0;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const rect = modalPageEls[mid].getBoundingClientRect();
    if (rect.top <= center) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return result;
}

// --- Modal scroll handler with RAF throttle ---
let modalScrollRAFId = null;
function onModalScroll() {
  if (modalScrollRAFId) return;

  modalScrollRAFId = requestAnimationFrame(() => {
    modalScrollRAFId = null;

    const scrollY = mangaModal.scrollTop;
    const docH = mangaModal.scrollHeight - mangaModal.clientHeight;
    const progress = docH > 0 ? (scrollY / docH) * 100 : 0;
    modalProgress.style.width = progress + '%';

    const currentPage = modalGetCurrentPage();
    modalPage.textContent = (currentPage + 1) + ' / ' + modalTotalPages;

    // Side indicator
    modalDots.forEach((d, i) => d.classList.toggle('active', i === currentPage));

    // Thumbnail sidebar update (only on change)
    if (currentPage !== modalPrevPage) {
      modalThumbItems.forEach((t, i) => t.classList.toggle('active', i === currentPage));
      if (modalThumbItems[currentPage]) {
        modalThumbItems[currentPage].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      modalPrevPage = currentPage;
    }

    // Auto-hide header
    if (scrollY > modalLastScrollY && scrollY > 100) {
      if (modalHeaderVisible) { modalHeader.classList.add('hidden'); modalHeaderVisible = false; }
    } else {
      if (!modalHeaderVisible) { modalHeader.classList.remove('hidden'); modalHeaderVisible = true; }
    }
    modalLastScrollY = scrollY;

    // Side indicator visibility
    modalSideIndicator.classList.add('visible');
    clearTimeout(modalScrollTimer);
    modalScrollTimer = setTimeout(() => modalSideIndicator.classList.remove('visible'), 1500);

    // Back to top
    modalBackToTop.classList.toggle('visible', scrollY > window.innerHeight);

    // 縦スクロール時の最終ページCTA: 末尾まで近づいたら表示、離れたら隠す
    if (modalTotalPages > 0) {
      if (currentPage >= modalTotalPages - 1 || progress >= 92) {
        scheduleMangaCta();
      } else {
        hideMangaCta();
      }
    }
  });
}

mangaModal.addEventListener('scroll', onModalScroll, { passive: true });
modalBackToTop.addEventListener('click', () => mangaModal.scrollTo({ top: 0, behavior: 'smooth' }));

// Helper function to show/hide vertical viewer elements (optimized)
function showVerticalElements() {
  modalManga.style.display = 'block';
  modalThumbSidebar.style.display = 'flex';
  modalZoomControls.style.display = 'flex';
  modalSideIndicator.style.display = 'flex';
  modalBackToTop.style.display = 'flex';
  modalProgress.style.display = 'block';
  modalFooter.style.display = 'block';
}

function hideVerticalElements() {
  modalManga.style.display = 'none';
  modalThumbSidebar.style.display = 'none';
  modalZoomControls.style.display = 'none';
  modalSideIndicator.style.display = 'none';
  modalBackToTop.style.display = 'none';
  modalProgress.style.display = 'none';
  modalFooter.style.display = 'none';
}

// Open vertical scroll viewer
function openVerticalViewer(key, data) {
  modalTitle.textContent = data.title;
  modalTotalPages = data.pages;
  currentMangaGallery = (data.gallery && data.gallery.length > 0) ? data.gallery : null;
  currentMangaData = data;
  currentMangaKey = key;
  setupMangaCta(data);
  modalPage.textContent = `1 / ${data.pages}`;
  modalProgress.style.width = '0%';

  const isWide = ['about-bizmanga'].includes(key);
  modalManga.className = 'modal-manga' + (isWide ? ' wide' : '');

  // Reset zoom
  modalCurrentZoom = MODAL_ZOOM_DEFAULT;
  modalApplyZoom();

  // Clear modal DOM cleanly
  while (modalManga.firstChild) modalManga.removeChild(modalManga.firstChild);
  while (modalThumbSidebar.firstChild) modalThumbSidebar.removeChild(modalThumbSidebar.firstChild);
  while (modalSideIndicator.firstChild) modalSideIndicator.removeChild(modalSideIndicator.firstChild);

  modalPageEls = [];
  modalThumbItems = [];
  modalDots = [];

  // Create shared IntersectionObserver for all vertical images (optimized)
  if (verticalObserver) verticalObserver.disconnect();
  verticalObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('loaded');
        verticalObserver.unobserve(entry.target);
      }
    });
  }, { rootMargin: '200px 0px', root: mangaModal });

  // Build page images with DocumentFragment
  const pagesFrag = document.createDocumentFragment();
  for (let i = 1; i <= data.pages; i++) {
    const img = document.createElement('img');
    img.src = getImageSrc(data, i - 1);
    img.alt = `${data.title} - ${i}ページ`;
    img.loading = i <= 3 ? 'eager' : 'lazy';
    img.onerror = function() { this.style.display = 'none'; };
    pagesFrag.appendChild(img);
    verticalObserver.observe(img);
    modalPageEls.push(img);
  }
  modalManga.appendChild(pagesFrag);

  // Build thumbnail sidebar with DocumentFragment
  const thumbsFrag = document.createDocumentFragment();
  for (let i = 0; i < data.pages; i++) {
    const img = document.createElement('img');
    img.className = 'modal-thumb-item' + (i === 0 ? ' active' : '');
    img.src = getImageSrc(data, i);
    img.alt = 'P' + (i + 1);
    const idx = i;
    img.addEventListener('click', () => {
      modalPageEls[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    thumbsFrag.appendChild(img);
    modalThumbItems.push(img);
  }
  modalThumbSidebar.appendChild(thumbsFrag);

  // Build side indicator dots with DocumentFragment
  const dotsFrag = document.createDocumentFragment();
  for (let i = 0; i < data.pages; i++) {
    const dot = document.createElement('div');
    dot.className = 'modal-side-dot' + (i === 0 ? ' active' : '');
    const idx = i;
    dot.addEventListener('click', () => {
      modalPageEls[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    dotsFrag.appendChild(dot);
    modalDots.push(dot);
  }
  modalSideIndicator.appendChild(dotsFrag);

  // Reset state
  modalLastScrollY = 0;
  modalHeaderVisible = true;
  modalPrevPage = -1;
  modalHeader.classList.remove('hidden');
  modalBackToTop.classList.remove('visible');

  mangaModal.scrollTop = 0;
}

// --- Preload helper: enhanced with cache ---
function preloadImages(srcs, timeout) {
  timeout = timeout || 3000;
  var promises = srcs.map(function(src) {
    return getCachedImage(src);
  });
  return Promise.race([
    Promise.all(promises),
    new Promise(function(resolve) { setTimeout(resolve, timeout); })
  ]);
}

// --- ビューアを開く処理（proceedOpen・見開きの組み立て）で例外が出たとき ---
// 画像の読込後・rAF の中で動くので、呼び出し元（QR直リンクの openDirect の try）では捕まえられない。
// QR直リンクでは読み込み表示を残さず、まだ漫画を表示できていなければ「表示に時間がかかっています」と
// 再読み込みボタンを出す（showDirectOpenFailed。暗い画面とスピナーのまま止めない）
function failOpen(err) {
  console.error('[works] 漫画を開けませんでした:', err);
  if (isDirectMode) showDirectOpenFailed();
}

// --- Open manga (dispatch to correct viewer) ---
// ページ数はギャラリー枚数に合わせて登録済み（WP のデータは toMangaEntry、制作過程も同じ）なので、ここでは直さない
function openManga(key) {
  const data = mangaData[key];
  if (!data) return;

  // 1枚目の画像をプローブして縦長判定 → 自動でverticalに切り替え
  const firstSrc = getImageSrc(data, 0);
  const probe = new Image();
  probe.src = firstSrc;

  function proceedOpen() {
    // 縦長自動検出: 共通ヘルパーで閾値一元管理
    if (window.bmViewType && window.bmViewType.isVerticalByRatio(probe.naturalWidth, probe.naturalHeight)) {
      data.viewType = 'vertical';
      data.tallCover = true;
      data.verticalOnly = true; // 見開き不可
    }
    // WPでvertical_only指定の場合もロック
    if (data.verticalOnly) {
      data.viewType = 'vertical';
    }

    // viewTypeに基づいてビューアモードを決定
    // スマホではspreadタイプも縦スクロールで表示
    const dataMode = data.viewType || 'spread';
    const mode = (!isPC() && dataMode === 'spread') ? 'vertical' : dataMode;
    currentViewMode = mode;

    // Set mode class for CSS background switching
    mangaModal.classList.remove('mode-vertical', 'mode-spread');
    mangaModal.classList.add('mode-' + mode);
    modalTitle.textContent = data.title;
    currentMangaKey = key; // トグルボタン用に早期セット
    currentMangaData = data;

    // 切り替えボタンの表示制御（PC + 非verticalOnlyのみ）
    updateViewToggle(mode, data.verticalOnly);

    // Pause pre-production carousels while modal is open
    if (typeof pauseAllCarousels === 'function') pauseAllCarousels();

    // Preload first pages then open viewer immediately with loading state
    // 先読みは最大4ページ・作品のページ数まで（以前は必ず2ページ目を読み、1ページの作品で存在しない 02.webp が 404 になった。
    // Issue #84）。ページ数は登録時にギャラリー枚数へ直してある（上のコメント）ので、ここでは data.pages をそのまま使う
    var firstPages = [];
    for (var fp = 0; fp < Math.min(4, data.pages); fp++) firstPages.push(getImageSrc(data, fp));

    // Show modal immediately with loading indicator
    showMangaLoader();
    mangaModal.classList.add('open');
    hideDirectLoader();  // QR直リンクで作品データを待つ間の読み込み表示（ビューアが開いたので外す）
    document.body.style.overflow = 'hidden';

    if (mode === 'vertical') {
      showVerticalElements();
      hideSpreadElements();
      openVerticalViewer(key, data);
    } else {
      hideVerticalElements();
      showSpreadElements();
      // Double rAF ensures layout is fully computed before reading dimensions
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          try {
            openSpreadViewer(key, data);
          } catch (e) {
            failOpen(e);
          }
        });
      });
    }

    // Preload in background, hide loader when first pages ready
    preloadImages(firstPages, 2000).then(function() {
      hideMangaLoader();
    });
  }

  function proceedOpenSafely() {
    try {
      proceedOpen();
    } catch (e) {
      failOpen(e);
    }
  }

  // 画像がキャッシュ済みなら即座に、そうでなければロード後に判定
  if (probe.complete && probe.naturalWidth > 0) {
    proceedOpenSafely();
  } else {
    probe.onload = proceedOpenSafely;
    probe.onerror = proceedOpenSafely;
  }

  // Library mode: push history so browser back closes manga
  if (!isDirectMode) {
    history.pushState({ manga: true }, '');
  }
}

// Show spread viewer elements - clear inline styles so CSS classes take control
function showSpreadElements() {
  document.getElementById('bookArea').style.display = '';
  document.getElementById('bottomNav').style.display = '';
  document.getElementById('mobileView').style.display = '';
}

// Hide spread viewer elements
function hideSpreadElements() {
  document.getElementById('bookArea').style.display = 'none';
  document.getElementById('bottomNav').style.display = 'none';
  document.getElementById('mobileView').style.display = 'none';
}

// ======================================================
// ===== BOOK-STYLE MANGA VIEWER (Two-page spread) =====
// ======================================================

const book = document.getElementById('book');
const bookArea = document.getElementById('bookArea');
const bookSpine = document.getElementById('bookSpine');
const pageRight = document.getElementById('pageRight');
const pageLeft = document.getElementById('pageLeft');
const imgRight = document.getElementById('imgRight');
const imgLeft = document.getElementById('imgLeft');
const navScrubber = document.getElementById('navScrubber');
const navThumbs = document.getElementById('navThumbs');
const navPageInfo = document.getElementById('navPageInfo');
const navPrev = document.getElementById('navPrev');
const navNext = document.getElementById('navNext');
const hintLeft = document.getElementById('hintLeft');
const hintRight = document.getElementById('hintRight');

let currentViewMode = 'spread';
let currentMangaKey = '';
let currentMangaPath = '';
let currentMangaGallery = null; // WP API gallery URLs
// 開いている作品のデータ（開いたときのもの）。見開き/縦読みの切替はこれを使う（mangaData[currentMangaKey] を引き直さない。
// /library の到着で mangaData の作品が差し替わったり、/library に無い QR限定公開の作品が mangaData から消えたりしても、
// 表示中の作品は開いたときのデータのまま）。最終ページCTA も開いたときのデータ（currentCtaData）を使う。
// 例外: 一覧から WP の到着前に開いた作品（手書きデータ）は、/library が届いたら applyLibrary() が WP のデータに差し替える
// （次の切替から WP のページ数・表示モード・CTA になる）
let currentMangaData = null;
let spreadTotalPages = 0;
let currentSpread = 0;
let spreads = [];
let isSpreadAnimating = false;
let currentMobilePage = 0;

// Pre-compute padStart strings for spread sources
const padStartCache = new Map();
function spreadPageSrc(path, num) {
  // ギャラリーURLがあればそちらを優先
  if (currentMangaGallery && currentMangaGallery.length >= num) {
    return currentMangaGallery[num - 1];
  }
  const key = path + num;
  if (!padStartCache.has(key)) {
    padStartCache.set(key, path + String(num).padStart(2, '0') + '.webp');
  }
  return padStartCache.get(key);
}

var thanksPageSrc = 'https://contentsx.jp/material/manga/thanks_v02.webp';

// Helper: get correct image source for a page number (handles 'thanks')
function getPageSrc(path, pageNum) {
  return pageNum === 'thanks' ? thanksPageSrc : spreadPageSrc(path, pageNum);
}

function buildSpreads(total) {
  const arr = [];
  for (let i = 1; i <= total; i += 2) {
    if (i + 1 <= total) {
      arr.push([i, i + 1]);
    } else {
      // 奇数ページ: 最後にthanks画像を挿入
      arr.push([i, 'thanks']);
    }
  }
  return arr;
}

function buildSpreadThumbnails() {
  const thumbsFrag = document.createDocumentFragment();
  for (let i = 0; i < spreads.length; i++) {
    const thumb = document.createElement('div');
    thumb.className = 'nav-thumb' + (i === 0 ? ' active' : '');
    thumb.dataset.spread = i;

    const img = document.createElement('img');
    img.src = spreadPageSrc(currentMangaPath, spreads[i][0]);
    img.alt = `${spreads[i][0]}P`;
    img.loading = 'lazy';
    thumb.appendChild(img);

    thumb.addEventListener('click', () => {
      if (!isSpreadAnimating) showSpread(i);
    });
    thumbsFrag.appendChild(thumb);
  }
  navThumbs.innerHTML = '';
  navThumbs.appendChild(thumbsFrag);
}

// 画像ロード完了を待つヘルパー（タイムアウト付き）
function waitForImage(imgEl, callback, timeout) {
  if (imgEl.complete && imgEl.naturalWidth > 0) {
    callback();
    return;
  }
  var done = false;
  function finish() {
    if (done) return;
    done = true;
    imgEl.onload = null;
    imgEl.onerror = null;
    callback();
  }
  imgEl.onload = finish;
  imgEl.onerror = finish;
  // 安全策: 最大待ち時間
  setTimeout(finish, timeout || 3000);
}

function showSpread(index, onReady) {
  if (index < 0 || index >= spreads.length) return;
  currentSpread = index;
  const spread = spreads[index];
  const rightNum = spread[0];
  const leftNum = spread[1];

  const areaHeight = Math.max(bookArea.clientHeight - 40, 200);
  const areaWidth = Math.max(bookArea.clientWidth - 60, 200);
  const pageH = Math.min(areaHeight, 700);
  const pageW = Math.round(pageH * 0.707);

  if (leftNum === null) {
    book.classList.add('single-page');
    pageRight.style.display = 'flex';
    pageRight.style.width = pageW + 'px';
    pageRight.style.height = pageH + 'px';
    pageLeft.style.display = 'none';

    // リスナーを先に付けてからsrcをセット
    prepareImgLoad(imgRight, pageRight);
    imgRight.src = spreadPageSrc(currentMangaPath, rightNum);
    imgRight.alt = `${modalTitle.textContent} - ${rightNum}ページ`;
  } else {
    book.classList.remove('single-page');
    pageRight.style.display = 'flex';
    pageLeft.style.display = 'flex';

    const twoPageW = Math.min(pageW, Math.floor((areaWidth - 6) / 2));
    const adjustedH = Math.min(pageH, Math.round(twoPageW / 0.707));

    pageRight.style.width = twoPageW + 'px';
    pageRight.style.height = adjustedH + 'px';
    pageLeft.style.width = twoPageW + 'px';
    pageLeft.style.height = adjustedH + 'px';

    // リスナーを先に付けてからsrcをセット
    prepareImgLoad(imgRight, pageRight);
    prepareImgLoad(imgLeft, pageLeft);
    imgRight.src = spreadPageSrc(currentMangaPath, rightNum);
    imgRight.alt = `${modalTitle.textContent} - ${rightNum}ページ`;
    // thanks画像の場合は専用パスを使う
    if (leftNum === 'thanks') {
      imgLeft.src = thanksPageSrc;
      imgLeft.alt = '最後まで読んでいただきありがとうございます';
    } else {
      imgLeft.src = spreadPageSrc(currentMangaPath, leftNum);
      imgLeft.alt = `${modalTitle.textContent} - ${leftNum}ページ`;
    }
  }

  // Preload next 3 spreads ahead (optimized)
  for (let s = Math.max(0, index - 1); s <= Math.min(spreads.length - 1, index + 3); s++) {
    if (s !== index) {
      getCachedImage(getPageSrc(currentMangaPath, spreads[s][0]));
      if (spreads[s][1]) getCachedImage(getPageSrc(currentMangaPath, spreads[s][1]));
    }
  }

  updateSpreadUI();

  // 画像ロード完了コールバック（goNext/goPrev で isSpreadAnimating 解除に使用）
  if (typeof onReady === 'function') {
    if (leftNum === null || pageLeft.style.display === 'none') {
      // 右ページのみ
      waitForImage(imgRight, onReady);
    } else {
      // 両ページのロード待ち
      var count = 2;
      function check() { if (--count <= 0) onReady(); }
      waitForImage(imgRight, check);
      waitForImage(imgLeft, check);
    }
  }
}

function updateSpreadUI() {
  if (!isPC()) {
    const pageNum = currentMobilePage + 1;
    modalPage.textContent = `${pageNum} / ${spreadTotalPages}`;
    navPageInfo.textContent = `${pageNum} / ${spreadTotalPages}`;
    navScrubber.value = currentSpread;
    // モバイルは縦スクロールのためボタン無効化不要
  } else {
    const spread = spreads[currentSpread];
    const rightNum = spread[0];
    const leftNum = spread[1];

    if (leftNum) {
      modalPage.textContent = `${rightNum}-${leftNum} / ${spreadTotalPages}`;
      navPageInfo.textContent = `${rightNum}-${leftNum} / ${spreadTotalPages}`;
    } else {
      modalPage.textContent = `${rightNum} / ${spreadTotalPages}`;
      navPageInfo.textContent = `${rightNum} / ${spreadTotalPages}`;
    }

    navScrubber.value = currentSpread;
    navPrev.classList.toggle('disabled', currentSpread >= spreads.length - 1);
    navNext.classList.toggle('disabled', currentSpread <= 0);
  }

  navThumbs.querySelectorAll('.nav-thumb').forEach((t, i) => {
    t.classList.toggle('active', i === currentSpread);
  });

  const activeThumb = navThumbs.querySelector('.nav-thumb.active');
  if (activeThumb) {
    activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  updateScrubberFill();

  // 最終ページ到達時にCTAを表示／離脱時に非表示
  if (currentViewMode === 'spread' && spreads.length > 0) {
    if (currentSpread >= spreads.length - 1) {
      scheduleMangaCta();
    } else {
      hideMangaCta();
    }
  }
}

function openSpreadViewer(key, data) {
  currentMangaKey = key;
  currentMangaPath = data.path;
  currentMangaGallery = (data.gallery && data.gallery.length > 0) ? data.gallery : null;
  currentMangaData = data;
  setupMangaCta(data);
  spreadTotalPages = data.pages;
  currentSpread = 0;
  spreads = buildSpreads(spreadTotalPages);

  navScrubber.min = 0;
  navScrubber.max = spreads.length - 1;
  navScrubber.value = 0;

  buildSpreadThumbnails();
  currentMobilePage = 0;

  if (isPC()) {
    showSpread(0);
    hintLeft.style.opacity = '1';
    hintRight.style.opacity = '1';
    setTimeout(() => {
      hintLeft.style.opacity = '0';
      hintRight.style.opacity = '0';
    }, 3000);
  } else {
    var mp = document.getElementById('mobilePage');
    mp.src = spreadPageSrc(currentMangaPath, 1);
    watchImgLoad(mp, mobileContainer);
    updateSpreadUI();
  }
}

const flipOverlay = document.getElementById('flipOverlay');
const flipFrontImg = document.getElementById('flipFrontImg');
const flipBackImg = document.getElementById('flipBackImg');
const pageShadowLeft = document.getElementById('pageShadowLeft');
const pageShadowRight = document.getElementById('pageShadowRight');
const FLIP_DURATION = 500;

function goNext() {
  if (isSpreadAnimating || currentSpread >= spreads.length - 1) return;
  isSpreadAnimating = true;

  const nextIndex = currentSpread + 1;
  const nextSpr = spreads[nextIndex];
  const currentSpr = spreads[currentSpread];

  flipOverlay.classList.remove('flip-next', 'flip-prev');
  flipOverlay.classList.add('flip-prev');

  flipFrontImg.src = currentSpr[1]
    ? getPageSrc(currentMangaPath, currentSpr[1])
    : getPageSrc(currentMangaPath, currentSpr[0]);
  flipBackImg.src = getPageSrc(currentMangaPath, nextSpr[0]);

  flipOverlay.style.transition = 'none';
  flipOverlay.style.transform = 'rotateY(0deg)';
  flipOverlay.classList.add('active');

  pageShadowRight.classList.add('active');

  const halfDuration = FLIP_DURATION * 0.45;
  setTimeout(() => {
    imgRight.src = getPageSrc(currentMangaPath, nextSpr[0]);
    if (nextSpr[1]) {
      pageLeft.style.display = 'flex';
      imgLeft.src = getPageSrc(currentMangaPath, nextSpr[1]);
    } else {
      pageLeft.style.display = 'none';
    }
  }, halfDuration);

  pageShadowRight.style.transition = 'none';
  pageShadowRight.style.opacity = '0';
  setTimeout(() => {
    pageShadowRight.style.transition = `opacity ${FLIP_DURATION * 0.3}ms ease`;
    pageShadowRight.style.opacity = '0.6';
  }, FLIP_DURATION * 0.15);
  setTimeout(() => {
    pageShadowRight.style.opacity = '0';
  }, FLIP_DURATION * 0.65);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      flipOverlay.style.transition = `transform ${FLIP_DURATION}ms cubic-bezier(0.3, 0.0, 0.2, 1)`;
      flipOverlay.style.transform = 'rotateY(180deg)';
    });
  });

  setTimeout(() => {
    flipOverlay.classList.remove('active', 'flip-prev');
    flipOverlay.style.transition = 'none';
    flipOverlay.style.transform = '';
    pageShadowRight.classList.remove('active');
    pageShadowRight.style.transition = 'none';
    pageShadowRight.style.opacity = '';

    showSpread(nextIndex, function() {
      isSpreadAnimating = false;
    });
  }, FLIP_DURATION + 30);
}

function goPrev() {
  if (isSpreadAnimating || currentSpread <= 0) return;
  isSpreadAnimating = true;

  const prevIndex = currentSpread - 1;
  const prevSpr = spreads[prevIndex];
  const currentSpr = spreads[currentSpread];

  flipOverlay.classList.remove('flip-next', 'flip-prev');
  flipOverlay.classList.add('flip-next');

  flipFrontImg.src = getPageSrc(currentMangaPath, currentSpr[0]);
  flipBackImg.src = prevSpr[1]
    ? getPageSrc(currentMangaPath, prevSpr[1])
    : getPageSrc(currentMangaPath, prevSpr[0]);

  flipOverlay.style.transition = 'none';
  flipOverlay.style.transform = 'rotateY(0deg)';
  flipOverlay.classList.add('active');

  pageShadowLeft.classList.add('active');

  const halfDuration = FLIP_DURATION * 0.45;
  setTimeout(() => {
    imgRight.src = getPageSrc(currentMangaPath, prevSpr[0]);
    if (prevSpr[1]) {
      pageLeft.style.display = 'flex';
      imgLeft.src = getPageSrc(currentMangaPath, prevSpr[1]);
    } else {
      pageLeft.style.display = 'none';
    }
  }, halfDuration);

  pageShadowLeft.style.transition = 'none';
  pageShadowLeft.style.opacity = '0';
  setTimeout(() => {
    pageShadowLeft.style.transition = `opacity ${FLIP_DURATION * 0.3}ms ease`;
    pageShadowLeft.style.opacity = '0.6';
  }, FLIP_DURATION * 0.15);
  setTimeout(() => {
    pageShadowLeft.style.opacity = '0';
  }, FLIP_DURATION * 0.65);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      flipOverlay.style.transition = `transform ${FLIP_DURATION}ms cubic-bezier(0.3, 0.0, 0.2, 1)`;
      flipOverlay.style.transform = 'rotateY(-180deg)';
    });
  });

  setTimeout(() => {
    flipOverlay.classList.remove('active', 'flip-next');
    flipOverlay.style.transition = 'none';
    flipOverlay.style.transform = '';
    pageShadowLeft.classList.remove('active');
    pageShadowLeft.style.transition = 'none';
    pageShadowLeft.style.opacity = '';

    showSpread(prevIndex, function() {
      isSpreadAnimating = false;
    });
  }, FLIP_DURATION + 30);
}

function isPC() { return window.innerWidth >= 769; }

const mobilePage = document.getElementById('mobilePage');
const mobileContainer = document.getElementById('mobileContainer');
const mobileFlipOverlay = document.getElementById('mobileFlipOverlay');
const mobileFlipFrontImg = document.getElementById('mobileFlipFrontImg');
const mobileFlipBackImg = document.getElementById('mobileFlipBackImg');
const mobileFlipShadow = document.getElementById('mobileFlipShadow');
const mobileView = document.getElementById('mobileView');

function mobileFlipTo(index, direction) {
  if (isSpreadAnimating || index < 0 || index >= spreadTotalPages || index === currentMobilePage) return;
  isSpreadAnimating = true;

  const goForward = direction === 'forward';
  const currentSrc = spreadPageSrc(currentMangaPath, currentMobilePage + 1);
  const targetSrc = spreadPageSrc(currentMangaPath, index + 1);

  if (goForward) {
    mobileFlipOverlay.style.transformOrigin = 'left center';
    mobileFlipFrontImg.src = currentSrc;
    mobileFlipBackImg.src = targetSrc;
    mobilePage.src = targetSrc;
    mobileFlipShadow.style.background = 'linear-gradient(to right, rgba(0,0,0,0.35), transparent 50%)';

    mobileFlipOverlay.style.transition = 'none';
    mobileFlipOverlay.style.transform = 'rotateY(0deg)';
    mobileFlipOverlay.classList.add('active');
    mobileFlipShadow.classList.add('active');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        mobileFlipOverlay.style.transition = `transform ${FLIP_DURATION}ms cubic-bezier(0.3, 0.0, 0.2, 1)`;
        mobileFlipOverlay.style.transform = 'rotateY(-180deg)';
      });
    });
  } else {
    mobileFlipOverlay.style.transformOrigin = 'left center';
    mobileFlipFrontImg.src = targetSrc;
    mobileFlipBackImg.src = currentSrc;
    mobilePage.src = targetSrc;
    mobileFlipShadow.style.background = 'linear-gradient(to left, rgba(0,0,0,0.35), transparent 50%)';

    mobileFlipOverlay.style.transition = 'none';
    mobileFlipOverlay.style.transform = 'rotateY(-180deg)';
    mobileFlipOverlay.classList.add('active');
    mobileFlipShadow.classList.add('active');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        mobileFlipOverlay.style.transition = `transform ${FLIP_DURATION}ms cubic-bezier(0.3, 0.0, 0.2, 1)`;
        mobileFlipOverlay.style.transform = 'rotateY(0deg)';
      });
    });
  }

  mobileFlipShadow.style.transition = 'none';
  mobileFlipShadow.style.opacity = '0';
  setTimeout(() => {
    mobileFlipShadow.style.transition = `opacity ${FLIP_DURATION * 0.3}ms ease`;
    mobileFlipShadow.style.opacity = '0.6';
  }, FLIP_DURATION * 0.15);
  setTimeout(() => {
    mobileFlipShadow.style.opacity = '0';
  }, FLIP_DURATION * 0.65);

  setTimeout(() => {
    mobileFlipOverlay.classList.remove('active');
    mobileFlipOverlay.style.transition = 'none';
    mobileFlipOverlay.style.transform = '';
    mobileFlipShadow.classList.remove('active');
    mobileFlipShadow.style.transition = 'none';
    mobileFlipShadow.style.opacity = '';

    currentMobilePage = index;
    mobilePage.src = spreadPageSrc(currentMangaPath, currentMobilePage + 1);
    watchImgLoad(mobilePage, mobileContainer);
    currentSpread = currentMobilePage === 0 ? 0 : Math.ceil(currentMobilePage / 2);
    updateSpreadUI();
    isSpreadAnimating = false;
  }, FLIP_DURATION + 30);
}

function mobileNext() { mobileFlipTo(currentMobilePage + 1, 'forward'); }
function mobilePrev() { mobileFlipTo(currentMobilePage - 1, 'backward'); }

function nextPage() { if (isPC()) goNext(); else mobileNext(); }
function prevPage() { if (isPC()) goPrev(); else mobilePrev(); }

// PC: Left click = next
document.getElementById('clickLeft').addEventListener('click', (e) => {
  e.preventDefault();
  goNext();
});

// PC: Right click = prev
document.getElementById('clickRight').addEventListener('click', (e) => {
  e.preventDefault();
  goPrev();
});

pageRight.addEventListener('click', (e) => {
  e.stopPropagation();
  goNext();
});
pageLeft.addEventListener('click', (e) => {
  e.stopPropagation();
  goPrev();
});

bookArea.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  goPrev();
});

// Mobile: tap areas
document.getElementById('tapLeft').addEventListener('click', mobileNext);
document.getElementById('tapRight').addEventListener('click', mobilePrev);

// Mobile: touch/swipe
let touchStartX = 0, touchStartY = 0, touchStartTime = 0, swiping = false;

mobileView.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchStartTime = Date.now();
  swiping = false;
}, { passive: true });

mobileView.addEventListener('touchmove', (e) => {
  const dx = e.touches[0].clientX - touchStartX;
  const dy = e.touches[0].clientY - touchStartY;
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) swiping = true;
}, { passive: true });

mobileView.addEventListener('touchend', (e) => {
  if (!swiping) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  const elapsed = Date.now() - touchStartTime;
  const velocity = Math.abs(dx) / elapsed;
  if (Math.abs(dx) > 50 || velocity > 0.3) {
    if (dx < 0) mobileNext();
    else mobilePrev();
  }
});

// Bottom nav buttons (Japanese manga reads right-to-left: ◀ = next page, ▶ = prev page)
navPrev.addEventListener('click', nextPage);
navNext.addEventListener('click', prevPage);

// Scrubber fill color update
function updateScrubberFill() {
  const min = parseInt(navScrubber.min) || 0;
  const max = parseInt(navScrubber.max) || 1;
  const val = parseInt(navScrubber.value) || 0;
  const pct = ((val - min) / (max - min)) * 100;
  // RTL: right side = read pages (orange), left side = unread (gray)
  navScrubber.style.background =
    'linear-gradient(to left, #EB5200 ' + pct + '%, rgba(255,255,255,0.15) ' + pct + '%)';
}

navScrubber.addEventListener('input', () => {
  const val = parseInt(navScrubber.value);
  if (!isSpreadAnimating && val !== currentSpread) {
    if (isPC()) {
      showSpread(val);
    } else {
      const targetPage = val === 0 ? 0 : val * 2 - 1;
      currentMobilePage = Math.min(targetPage, spreadTotalPages - 1);
      mobilePage.src = spreadPageSrc(currentMangaPath, currentMobilePage + 1);
      currentSpread = val;
      updateSpreadUI();
    }
  }
});

// Resize handler
window.addEventListener('resize', () => {
  if (!mangaModal.classList.contains('open')) return;
  if (!mangaModal.classList.contains('mode-spread')) return;
  if (isPC()) {
    currentSpread = currentMobilePage === 0 ? 0 : Math.ceil(currentMobilePage / 2);
    showSpread(currentSpread);
  } else {
    const spr = spreads[currentSpread];
    currentMobilePage = spr[0] - 1;
    mobilePage.src = spreadPageSrc(currentMangaPath, currentMobilePage + 1);
    updateSpreadUI();
  }
});

// Keyboard: route to spread viewer when in spread mode
function handleSpreadKeyboard(e) {
  if (!mangaModal.classList.contains('mode-spread')) return;
  if (e.key === 'ArrowLeft') nextPage();
  if (e.key === 'ArrowRight') prevPage();
}

function closeManga() {
  // ダイレクトモード: 前のページに戻るか、ホームへ遷移
  if (isDirectMode) {
    if (document.referrer && document.referrer.indexOf(location.hostname) !== -1) {
      history.back();
    } else {
      location.href = './';
    }
    return;
  }

  // Clean up modal DOM
  while (modalManga.firstChild) modalManga.removeChild(modalManga.firstChild);

  // Disconnect vertical observer
  if (verticalObserver) {
    verticalObserver.disconnect();
    verticalObserver = null;
  }

  // Clear references
  modalPageEls = [];
  modalThumbItems = [];
  modalDots = [];

  mangaModal.classList.remove('open');
  document.body.style.overflow = '';
  hideMangaLoader();
  hideMangaCta();

  // Resume pre-production carousels from same position
  if (typeof resumeAllCarousels === 'function') resumeAllCarousels();
}

// ===== 最終ページCTA（クライアント公式サイトへ送客） =====
var ctaOverlay = document.getElementById('mangaCtaOverlay');
var ctaBtn = document.getElementById('mangaCtaBtn');
var ctaTextEl = document.getElementById('mangaCtaText');
var ctaShowTimer = null;
var currentCtaData = null;
var ctaShownForKey = null;

var CTA_DEFAULT_LABEL = '公式サイトを見る →';

function isValidCtaUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
}

function getCtaLabel(data) {
  if (!data) return null;
  var label = data.cta_label_ja;
  return label && label.trim() ? label.trim() : CTA_DEFAULT_LABEL;
}

function hideMangaCta() {
  if (ctaShowTimer) { clearTimeout(ctaShowTimer); ctaShowTimer = null; }
  if (!ctaOverlay) return;
  ctaOverlay.classList.remove('visible');
  ctaOverlay.hidden = true;
  ctaShownForKey = null;
}

// 最終ページ到達時にCTAを0.6秒後にフェードイン
function scheduleMangaCta() {
  if (!ctaOverlay || !currentCtaData) return;
  if (ctaShownForKey === currentMangaKey && ctaOverlay.classList.contains('visible')) return;

  var data = currentCtaData;
  if (!isValidCtaUrl(data.client_url)) return;
  var label = getCtaLabel(data);

  if (ctaShowTimer) clearTimeout(ctaShowTimer);
  ctaShowTimer = setTimeout(function() {
    ctaShowTimer = null;
    ctaBtn.href = data.client_url;
    ctaTextEl.textContent = label;
    ctaOverlay.hidden = false;
    requestAnimationFrame(function() {
      ctaOverlay.classList.add('visible');
    });
    ctaShownForKey = currentMangaKey;
  }, 600);
}

// 漫画オープン時にCTA設定を保存（制作過程は除外）
function setupMangaCta(data) {
  hideMangaCta();
  currentCtaData = null;
  if (!data || data._isPreProduction) return;
  if (!data.cta_enabled) return; // CMSチェックボックスがOFFなら無効
  if (!isValidCtaUrl(data.client_url)) return; // URL未入力 or 無効はリンク不能なので除外
  currentCtaData = data;
}

// クリック時GA4送信
if (ctaBtn) {
  ctaBtn.addEventListener('click', function() {
    if (typeof gtag === 'function' && currentCtaData) {
      gtag('event', 'manga_cta_click', {
        manga_slug: currentMangaKey || '',
        client_url: currentCtaData.client_url || '',
        language: 'ja'
      });
    }
  });
}

// ===== View Toggle Button (PC: spread ⇔ vertical) =====
var viewToggleBtn = document.getElementById('viewToggle');
var viewToggleIcon = document.getElementById('viewToggleIcon');
var viewToggleLabel = document.getElementById('viewToggleLabel');

function updateViewToggle(mode, verticalOnly) {
  if (!viewToggleBtn) return;
  // スマホ or verticalOnly → ボタン非表示
  if (!isPC() || verticalOnly) {
    viewToggleBtn.style.display = 'none';
    return;
  }
  viewToggleBtn.style.display = 'flex';
  if (mode === 'vertical') {
    viewToggleIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="8" height="18" rx="1"/><rect x="14" y="3" width="8" height="18" rx="1"/></svg>';
    viewToggleLabel.textContent = '見開き';
  } else {
    viewToggleIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="1"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="14" y2="16"/></svg>';
    viewToggleLabel.textContent = '縦読み';
  }
}

if (viewToggleBtn) {
  viewToggleBtn.addEventListener('click', function() {
    var data = currentMangaData; // 開いている作品のデータ（mangaData から引き直さない。上の currentMangaData の説明）
    if (!currentMangaKey || !data) return;
    if (data.verticalOnly) return; // 切り替え不可

    // 現在のモードを切り替え
    var newMode = (currentViewMode === 'spread') ? 'vertical' : 'spread';
    currentViewMode = newMode;

    // CSS class 切り替え
    mangaModal.classList.remove('mode-vertical', 'mode-spread');
    mangaModal.classList.add('mode-' + newMode);

    // ボタンラベル更新
    updateViewToggle(newMode, false);

    // ビューア切り替え
    if (newMode === 'vertical') {
      showVerticalElements();
      hideSpreadElements();
      openVerticalViewer(currentMangaKey, data);
    } else {
      hideVerticalElements();
      showSpreadElements();
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          openSpreadViewer(currentMangaKey, data);
        });
      });
    }
  });
}

document.getElementById('modalClose').addEventListener('click', () => {
  // QR経由はそもそもボタンがCSSで非表示なのでここは通らない想定
  if (isQrMode) return;
  // ホーム等からの内部遷移: パラメータ無しのビズ書庫へ
  if (isDirectMode) {
    location.href = 'biz-library';
    return;
  }
  history.back(); // triggers popstate → closeManga
});
document.addEventListener('keydown', (e) => {
  if (!mangaModal.classList.contains('open')) return;
  if (e.key === 'Escape') {
    if (isQrMode) return;
    if (isDirectMode) {
      location.href = 'biz-library';
      return;
    }
    history.back();
  }
  // Spread mode keyboard handling
  if (mangaModal.classList.contains('mode-spread')) {
    if (e.key === 'ArrowLeft') nextPage();
    if (e.key === 'ArrowRight') prevPage();
  }
});

// Browser back closes manga (library mode)
window.addEventListener('popstate', () => {
  if (mangaModal.classList.contains('open') && !isDirectMode) {
    closeManga();
  }
});

// ===== Direct access mode (QR code: biz-library?manga=bms-unso) =====
// params / autoOpen / isDirectMode はファイル先頭（mangaData の直後）で宣言済み
// 同一オリジン(ホームギャラリー等)からの内部遷移かどうか
// 「表示に時間がかかっています」の再読み込みボタン（location.reload）で読み込み直すと、ブラウザは referrer をこのページ自身に
// する（Chromium で確認）。そのまま判定すると QR経由でも内部遷移になって qr-mode が外れる（BUGS #010）ので、読み込み直す前の
// 判定をこのタブに残して引き継ぐ（DIRECT_RELOAD_KEY。showDirectStalled のボタンが保存する）。引き継げなかったとき（保存できない
// ブラウザ）は、このページ自身からの referrer を QR経由として扱う（書庫へ降ろさない側に倒す）
const DIRECT_RELOAD_KEY = 'bm-direct-reload';
const isInternalReferrer = (function() {
  try {
    var saved = JSON.parse(sessionStorage.getItem(DIRECT_RELOAD_KEY) || 'null');
    sessionStorage.removeItem(DIRECT_RELOAD_KEY);
    if (saved && saved.url === location.href) return !!saved.internal;
  } catch (e) { /* 保存できないブラウザ・壊れた値 */ }
  try {
    if (!document.referrer) return false;
    var ref = new URL(document.referrer);
    if (ref.host !== location.host) return false;
    return !(ref.pathname === location.pathname && ref.search === location.search);
  } catch (e) { return false; }
})();
// QRコード経由 = URL パラメータあり かつ 同一オリジンからの遷移ではない
// ホームギャラリー経由の場合は isQrMode=false になり、閉じるボタンで書庫に降りられる
const isQrMode = isDirectMode && !isInternalReferrer;
if (isQrMode) document.documentElement.classList.add('qr-mode');

// ----- QR直リンクの開き方（Issue #71。2026-10-15 方針: 手書きの作品データでは開かず、WP のデータが届くまで待つ）-----
// 直リンクのキー（directKey。ファイル先頭で ?manga= の値を整えたもの）は次の3種類:
//   - 作品（WP の作品 ID の形〈isDirectIdLike〉）: /manga/{id}（1作品）と /library（一覧）のどちらか先に「その作品のデータ」を
//     返した方で1回だけ開く（どちらも WP のデータで、toMangaEntry() で同じ形にする）
//   - 作品（ID の形に合わない値。例 seko_2・日本語の ID）: /manga/{id} には問い合わせず、/library の作品 ID と照合して開く
//   - 制作過程（pre-red-* / pre-name-*）: 手書きの制作過程データ（FALLBACK_PRE_DATA）にあれば即開く。無ければ /library
//     （作品の赤ペン・ネーム → pre-red-{作品ID} 等。buildPreDataFromAPI）と /preproduction（専用 API → pre-red-wp{投稿ID} 等。
//     registerPreproductionItems）を並行して取り、どちらかで登録されたら開く（制作過程は /manga/{id} に無い。Issue #84）。
//     旧形式 pre-red-{数字}（2026-10 までホームの制作過程スライドが渡していた /preproduction の投稿ID）は pre-red-wp{数字} と読み替える
// 結果は次の3つだけ:
//   1. 開く: WP のデータが届いた
//   2. 「作品が見つかりませんでした」: 届いた /library にその作品（制作過程）が無い。ID の形の作品は、さらに /manga/{id} も
//      「作品が無い」と答えた（readMangaAnswer）ときだけ。制作過程は /library と /preproduction の両方が配列で届いて、
//      どちらにも無いときだけ
//   3. それ以外（WP が応答しない・エラー・時間切れ・/library の失敗や0件・/preproduction の失敗など。/preproduction の
//      0件〈200 の空配列〉は今の正常な状態なので失敗にしない）: 待ち続ける（取り直し方は startDirectFlow）。
//      ビューアを表示できないまま、ページを開いてから DIRECT_SLOW_MS（開く処理を始めた後は、始めてから DIRECT_OPEN_SLOW_MS）
//      たったら「ただいま表示に時間がかかっています」と再読み込みボタンを出す。後から表示できたらメッセージを消す
// 手書きの作品データ（FALLBACK_WORKS）では開かない（WP と違う古いページ数・画像で壊れた表示にしない）。
// 待っている間は読み込み中の表示（スピナー）を出し、ビューアが開いたら・「見つかりませんでした」を出したら消す

// WP の作品 ID の形か（/manga/{id} で問い合わせられる形: 英数字とハイフン。英数字を1文字以上含む）。WP の作品 ID も
// 制作過程のキー（pre-red-* / pre-name-*）もふつうはこの形。合わない値は /manga/{id} に問い合わせず、/library で照合する
function isDirectIdLike(key) {
  return /^[A-Za-z0-9-]+$/.test(key) && /[A-Za-z0-9]/.test(key);
}

// 開いた（開く処理を始めた）作品の mangaData のキー。開くのは1回だけ（同じ作品を2回開くと、どちらのデータが最後に
// 描かれるかが画像の読込と API 到着の順番で変わる）
var directOpenKey = null;
var directNotFoundShown = false;
var directLoaderEl = null;
var directStalledEl = null;

// 「表示に時間がかかっています」を出すまでの時間（ページを開いてから。まだ開く処理を始めていないとき）
var DIRECT_SLOW_MS = 5000;
// 開く処理を始めてから、ビューアを表示できないまま「表示に時間がかかっています」を出すまでの時間（1枚目の画像の読込が
// 終わらないときなど）
var DIRECT_OPEN_SLOW_MS = 8000;
// 取り直すまでの間隔（ミリ秒。/manga/{id} と /library のそれぞれで、失敗の後に順に使い、最後の値を繰り返す）
var DIRECT_RETRY_MS = [2000, 5000, 10000, 20000, 30000];
// 1回ごとの取得の時間切れ（ミリ秒。/manga/{id} と /library のそれぞれで1回目から順に使い、最後の値を繰り返す）。
// WP がいつも遅くても、取り直すたびに長く待つので、いずれ届く
var DIRECT_FETCH_TIMEOUT_MS = [5000, 10000, 20000];
// 待つ上限（ミリ秒。タブを表示していた時間で数える）。超えたら取り直しを止め、スピナーを外して
// 「表示に時間がかかっています」と再読み込みボタンだけを残す（タブを放置しても WP に問い合わせ続けない）
var DIRECT_RETRY_LIMIT_MS = 10 * 60 * 1000;

// 一覧 list の n 番目（0始まり）。n が範囲の外なら最後の値（上の取り直しの間隔・時間切れの表を引く）
function nthOrLast(list, n) {
  return list[Math.min(n, list.length - 1)];
}

// 登録キーの一覧から URL の値に当たるキーを探す: まず完全一致、無ければ大文字小文字を区別せずに照合する。無ければ null
function matchKey(keys, raw) {
  if (!raw) return null;
  if (keys.indexOf(raw) !== -1) return raw;
  var lower = raw.toLowerCase();
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i]).toLowerCase() === lower) return keys[i];
  }
  return null;
}

// 直リンクのキーが制作過程（赤ペン・ネーム）か。制作過程のキーは手書きのデータ（FALLBACK_PRE_DATA）も
// /library・/preproduction から作るものも必ず pre-red-* / pre-name-*。WP の作品 ID が「pre-」で始まるだけ
// （例: pre-sales）なら作品として開く
function isPreProductionKey(key) {
  return /^pre-(red|name)-/i.test(key);
}

// 応答本文がプラグインのエラーの形（{"error":"not found"} のように error があり code が無い）か
function isPluginErrorBody(d) {
  return !!d && typeof d === 'object' && !Array.isArray(d) && typeof d.error === 'string' &&
    !Object.prototype.hasOwnProperty.call(d, 'code');
}
// 応答本文が WordPress の REST API のエラーの形（{"code":"...","message":"..."}）か
function isWpErrorBody(d) {
  return !!d && typeof d === 'object' && !Array.isArray(d) && typeof d.code === 'string' && typeof d.message === 'string';
}

// WP の形のエラーのうち、/manga/{id} の判定に使う code（これ以外の code は「作品が無い」と見なさない）
// - rest_no_route: その URL のルートが無い。/library が届いて（WP が応答している）その作品が無いときだけ「作品が無い」とする
//   （startDirectFlow）
var WP_CODE_NO_ROUTE = 'rest_no_route';

// /manga/{id} の応答の読み分け（データ〈200〉以外）。WP が「作品が無い」と答えたと言えるときだけ 'gone' / 'noRoute'、
// それ以外は null（「WP が応答できない」扱いで待つ・取り直す）:
// - 'gone': 404 で本文がプラグインの形（プラグインの「作品が無い」の答え {"error":"not found"}。無い作品・完全非公開の作品）
//   か、410（もう無い）で本文がプラグインか WP の形
// - 'noRoute': 404 で本文が WP の形の rest_no_route（上の WP_CODE_NO_ROUTE）
// - null: それ以外。401/403 は本文が WP の形でも「作品が無い」と見なさない（認証・アクセス制限の code は、作品の有無ではなく
//   一時的に遮られているだけ）。JSON でない応答（HTML のエラーページ等）は WP の応答ではない
function readMangaAnswer(r) {
  if (r.status === 404) {
    if (isPluginErrorBody(r.data)) return 'gone';
    if (isWpErrorBody(r.data) && r.data.code === WP_CODE_NO_ROUTE) return 'noRoute';
    return null;
  }
  if (r.status === 410 && (isPluginErrorBody(r.data) || isWpErrorBody(r.data))) return 'gone';
  return null;
}

// 読み込み中の表示（暗い背景の上の白とオレンジのスピナー。見た目は bizmanga.css の .bm-manga-loader、位置は css/works.css）
function showDirectLoader() {
  if (directLoaderEl) return;
  directLoaderEl = document.createElement('div');
  directLoaderEl.className = 'bm-manga-loader-wrap bm-direct-loader';
  directLoaderEl.setAttribute('role', 'status');
  directLoaderEl.setAttribute('aria-label', '作品を読み込んでいます');
  var spinner = document.createElement('span');
  spinner.className = 'bm-manga-loader';
  directLoaderEl.appendChild(spinner);
  document.body.appendChild(directLoaderEl);
}
// 読み込み中の表示を外す（「表示に時間がかかっています」も一緒に消える）
function hideDirectLoader() {
  if (!directLoaderEl) return;
  if (directLoaderEl.parentNode) directLoaderEl.parentNode.removeChild(directLoaderEl);
  directLoaderEl = null;
  directStalledEl = null;
}

// 「ただいま表示に時間がかかっています」と再読み込みボタン（読み込み中の表示の中、スピナーの下）。
// failed = 待っても開かない（開く処理が失敗した・待つ上限に達した）: スピナーを外して再読み込みを案内する。
// failed でなければ、ビューアがもう開いている（読み込み中の表示を外した後）なら出さない
function showDirectStalled(failed, message) {
  if (directNotFoundShown) return;
  if (!directLoaderEl) {
    if (!failed) return;
    showDirectLoader();
  }
  if (failed) {
    var spinner = directLoaderEl.querySelector('.bm-manga-loader');
    if (spinner) directLoaderEl.removeChild(spinner);
    directLoaderEl.removeAttribute('aria-label');
  }
  if (directStalledEl) return;
  directStalledEl = document.createElement('div');
  directStalledEl.className = 'bm-direct-stalled';
  directStalledEl.setAttribute('role', 'alert');
  var text = document.createElement('p');
  text.className = 'bm-direct-stalled__text';
  text.textContent = message || 'ただいま表示に時間がかかっています';
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bm-direct-stalled__btn';
  btn.textContent = '再読み込み';
  btn.addEventListener('click', function() {
    // 読み込み直した後も QR経由／サイト内遷移の判定（qr-mode）を変えない（上の isInternalReferrer）
    try {
      sessionStorage.setItem(DIRECT_RELOAD_KEY, JSON.stringify({ url: location.href, internal: isInternalReferrer }));
    } catch (e) { /* 保存できないブラウザ: 読み込み直した後は QR経由として扱われる */ }
    location.reload();
  });
  directStalledEl.appendChild(text);
  directStalledEl.appendChild(btn);
  directLoaderEl.appendChild(directStalledEl);
}

// 開く処理（openManga）で例外が出たとき（failOpen から）: すでに漫画のページを表示できていればそのまま
// （読み込み中の表示だけ外す）。まだなら開きかけのビューアを閉じ、「表示に時間がかかっています」と再読み込みボタン
function showDirectOpenFailed() {
  if (directNotFoundShown) return;
  if (mangaModal.classList.contains('open') && (modalManga.querySelector('img') || imgRight.getAttribute('src'))) {
    hideDirectLoader();
    return;
  }
  mangaModal.classList.remove('open');
  showDirectStalled(true);
}

// 直リンクのビューアを表示できたか（openManga の proceedOpen がビューアを開いた。開く処理を始めただけでは false）
function isDirectViewerShown() {
  return mangaModal.classList.contains('open');
}

// 直リンクの作品を開く（1回だけ）。開く処理の例外は failOpen() へ（「見つかりませんでした」にはしない）
function openDirect(key) {
  if (directOpenKey || directNotFoundShown || !Object.prototype.hasOwnProperty.call(mangaData, key)) return;
  directOpenKey = key;
  try {
    openManga(key);
  } catch (e) {
    failOpen(e);
  }
}

// 「作品が見つかりませんでした」画面（ページ本体を置き換える）。開いた（開く処理を始めた）ビューアがあるときは出さない
function showDirectNotFoundOnce() {
  if (directOpenKey || directNotFoundShown) return;
  directNotFoundShown = true;
  hideDirectLoader();
  var box = document.createElement('div');
  box.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100vh;color:#fff;background:#1a1a1a;font-size:16px;text-align:center;padding:24px;';
  var link = document.createElement('a');
  link.href = '/';
  link.style.color = '#eb5200';
  link.textContent = 'トップページへ戻る';
  box.appendChild(document.createTextNode('作品が見つかりませんでした。'));
  box.appendChild(document.createElement('br'));
  box.appendChild(document.createElement('br'));
  box.appendChild(link);
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  document.body.appendChild(box);
}

// 直リンクの処理で想定外の例外が出たとき: まだ開いていなければ「表示に時間がかかっています」と再読み込みボタン
// （暗い画面とスピナーのまま止めない。「作品が見つかりませんでした」は WP が「作品が無い」と答えたときだけ）。
// 呼ぶのは、下の「if (isDirectMode)」の同期の try/catch と、startDirectFlow の取得の後の処理（Promise）の catch
function directFlowFailed(err) {
  console.error('[direct-mode] 直リンクの処理で例外:', err);
  if (!directOpenKey) showDirectStalled(true);
}

// 直リンクの処理（上の「結果は次の3つだけ」）。取り直し方:
// - /manga/{id}: 答えがデータでも「作品が無い」でもなければ、間隔をあけて取り直す（「作品が無い」の答えは変わらないので取り直さない）
// - /library: 失敗・0件のとき、判定に要る場合だけ取り直す（libraryNeeded。制作過程・ID の形でない値は /library だけが頼り。
//   ID の形の作品は /manga/{id} が「作品が無い」・ルートが無いと答えた後だけ）。それ以外は /manga/{id} だけを取り直す
//   （WP が応答しない間に、重い一覧を取り直し続けない）
// - 1回ごとの時間切れは取り直すたびに延ばす（DIRECT_FETCH_TIMEOUT_MS）。/library の時間切れは判定に /library が要るときだけ
//   効かせる（要らない間は中断せず、遅れて届いた /library でも開く。armLibraryTimeout）
// - タブが非表示の間は取り直さず、表示に戻ったら続ける。表示していた時間で DIRECT_RETRY_LIMIT_MS たったら取り直しを止める
function startDirectFlow() {
  var preKey = isPreProductionKey(directKey);
  var askManga = !preKey && isDirectIdLike(directKey);  // /manga/{id} に問い合わせる（WP の作品 ID の形のときだけ）

  var mangaAnswer;           // /manga/{id} の最後の答え（undefined＝まだ、'failed'＝応答できない、'gone'＝作品が無い、'noRoute'＝ルートが無い）
  var noRouteCounts = false; // 'noRoute' を「作品が無い」に数えるか（/library が失敗していない間に返った答えだけ数える。数えない答えは、
                             // /library が届いた後に /manga/{id} へ問い合わせ直して確かめる）
  var mangaAttempts = 0;     // /manga/{id} を取りに行った回数
  var mangaBusy = false;     // /manga/{id} を取得中
  var mangaSeq = 0;          // /manga/{id} の取り直しの予定の番号（問い合わせ直したら、それまでの予定を無効にする）
  var libraryWorks;          // /library の最後の結果（undefined＝まだ、null＝失敗・0件、配列＝届いた）
  var libraryAttempts = 0;   // /library を取りに行った回数
  var libraryBusy = false;   // /library を取得中か、取り直しを予定している
  var libraryFetch = null;   // 取得中の /library（{ started, timeout, controller, timer }。時間切れの見張りに使う）
  var preItems;              // 制作過程のキーのとき: /preproduction の最後の結果（undefined＝まだ、null＝失敗、配列＝届いた〈空も正常〉）
  var preAttempts = 0;       // /preproduction を取りに行った回数
  var gaveUp = false;        // 待つ上限に達した

  function finished() { return !!directOpenKey || directNotFoundShown; }

  // ---- 取り直しの予定（/manga/{id} と /library で共用）。タブが非表示の間は取り直さず、表示に戻ったら続ける ----
  // 上限（DIRECT_RETRY_LIMIT_MS）はタブを表示していた時間で数える（非表示の間は数えない）
  var visibleSpent = 0;  // 非表示になる前までに表示していた時間の合計
  var visibleSince = document.visibilityState === 'hidden' ? null : Date.now();
  var waitingForVisible = [];  // 非表示の間に予定の時刻が来た取り直し
  function visibleMs() { return visibleSpent + (visibleSince === null ? 0 : Date.now() - visibleSince); }
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
      if (visibleSince !== null) { visibleSpent += Date.now() - visibleSince; visibleSince = null; }
      return;
    }
    if (visibleSince === null) visibleSince = Date.now();
    var run = waitingForVisible;
    waitingForVisible = [];
    run.forEach(runRetry);
  });
  function runRetry(request) {
    if (finished() || gaveUp) return;
    if (visibleMs() >= DIRECT_RETRY_LIMIT_MS) { giveUp(); return; }
    if (document.visibilityState === 'hidden') { waitingForVisible.push(request); return; }
    request();
  }
  function retryLater(request, wait) {
    if (finished() || gaveUp) return;
    setTimeout(function() { runRetry(request); }, wait);
  }
  // 上限に達した: 取り直しを止め、スピナーを外して「表示に時間がかかっています」と再読み込みボタンだけを残す
  // （取得中の応答が後から届いたら、そのデータで開く）
  function giveUp() {
    gaveUp = true;
    console.warn('[direct-mode] WP から作品のデータを取得できないため、取り直しを止めました');
    showDirectStalled(true);
  }

  // ---- 開く ----
  // 開く処理を始めた後も、ビューアを表示できるまで見張る（1枚目の画像の読込が終わらないときなど）: 始めてから
  // DIRECT_OPEN_SLOW_MS で「表示に時間がかかっています」と再読み込みボタン、待つ上限でスピナーを外す。
  // 後から表示できたら openManga（proceedOpen の hideDirectLoader）がメッセージごと消す
  function open(key) {
    if (finished()) return;
    openDirect(key);
    if (!directOpenKey) return;
    setTimeout(function() {
      if (!isDirectViewerShown()) showDirectStalled(false);
    }, DIRECT_OPEN_SLOW_MS);
    (function untilLimit() {
      if (isDirectViewerShown() || directNotFoundShown) return;
      var rest = DIRECT_RETRY_LIMIT_MS - visibleMs();
      if (rest > 0) { setTimeout(untilLimit, rest); return; }
      console.warn('[direct-mode] ビューアを表示できないまま待つ上限に達しました');
      showDirectStalled(true);
    })();
  }
  // 制作過程の登録キー（手書きの制作過程データ、届いた /library から buildPreDataFromAPI() が登録したもの、届いた
  // /preproduction から registerPreproductionItems() が登録したもの）から探す。まず ?manga= の値のまま照合し、無ければ
  // 旧形式 pre-red-{数字} / pre-name-{数字}（大文字小文字を区別しない）を pre-red-wp{数字} / pre-name-wp{数字} と読み替えて照合する
  // （2026-10 までホームの制作過程スライド〈js/bm-pre-production.js〉が /preproduction の投稿ID をそのまま付けて開いていた。Issue #84）
  function findPreKey() {
    var keys = Object.keys(mangaData).filter(function(k) { return mangaData[k]._isPreProduction; });
    var key = matchKey(keys, directKey);
    if (key) return key;
    var legacy = directKey.match(/^pre-(red|name)-(\d+)$/i);
    return legacy ? matchKey(keys, 'pre-' + legacy[1] + '-wp' + legacy[2]) : null;
  }

  // ---- データが届いていないときの判断（/library の答えがそろってから）----
  function decide() {
    if (finished() || libraryWorks === undefined) return;
    if (!libraryWorks) return;  // /library が失敗・0件: 判定に要るなら取り直して確かめる（retryLibraryIfNeeded）
    // 制作過程は /preproduction も配列で届くまで決めない（まだ・失敗なら取り直して確かめる。onPreproduction）
    if (preKey && !preItems) return;
    // 2. 「作品が見つかりませんでした」: 届いた /library にその作品（制作過程）が無い（ここに来るのは無かったとき）。
    //    ID の形の作品は /manga/{id} も「作品が無い」と答えたときだけ。制作過程は /preproduction にも無かったときだけ
    if (!askManga || mangaAnswer === 'gone' || (mangaAnswer === 'noRoute' && noRouteCounts)) {
      showDirectNotFoundOnce();
      return;
    }
    // ルートが無いという答えが /library の失敗中だった（WP が止まっていたかもしれない）: /library が届いた今、問い合わせ直す
    if (mangaAnswer === 'noRoute') askMangaAgain();
  }

  // ---- /library ----
  // 判定に /library が要るか（要らないときは、失敗・0件でも取り直さない）
  function libraryNeeded() {
    return !askManga || mangaAnswer === 'gone' || mangaAnswer === 'noRoute';
  }
  function retryLibraryIfNeeded() {
    if (finished() || gaveUp || libraryBusy || libraryWorks !== null || !libraryNeeded()) return;
    libraryBusy = true;
    retryLater(requestLibrary, nthOrLast(DIRECT_RETRY_MS, libraryAttempts - 1));
  }
  function requestLibrary() {
    var timeout = nthOrLast(DIRECT_FETCH_TIMEOUT_MS, libraryAttempts);  // 取り直すたびに長く待つ
    libraryAttempts++;
    libraryBusy = true;
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    libraryFetch = { started: Date.now(), timeout: timeout, controller: controller, timer: null };
    armLibraryTimeout();
    fetchLibrary(controller).then(onLibrary).catch(directFlowFailed);
  }
  // 取得中の /library の時間切れ: 判定に /library が要る（libraryNeeded）ときだけ、取りに行ってから timeout で中断して
  // 取り直しに回す（要るようになった時点で過ぎていれば、すぐ中断する）。要らない間（/manga/{id} の答えを待っている間）は
  // 中断しない（/manga/{id} が応答しない間に遅れて届いた /library でも開ける。取り直しはしないので一覧を取り続けることもない）
  function armLibraryTimeout() {
    var f = libraryFetch;
    if (!f || f.timer || !f.controller || !libraryNeeded()) return;
    f.timer = setTimeout(function() { f.controller.abort(); }, Math.max(0, f.started + f.timeout - Date.now()));
  }
  // 届いた /library にその作品（制作過程）があれば、/manga/{id} を待たずに開く（作品は applyLibrary() が mangaData に登録する。
  // 制作過程は applyLibrary() から呼ぶ buildPreDataFromAPI() が pre-red-{作品ID} 等で登録する）
  function onLibrary(works) {
    if (libraryFetch && libraryFetch.timer) clearTimeout(libraryFetch.timer);
    libraryFetch = null;
    libraryBusy = false;
    if (works) applyLibrary(works);
    if (finished()) return;
    libraryWorks = works;
    if (works) {
      var key = preKey ? findPreKey() : matchKey(works.map(function(w) { return w.id; }), directKey);
      if (key) {
        open(key);
        return;
      }
    } else {
      // /library も取れない＝WP が止まっていたかもしれないので、それまでのルートが無いという答えは「作品が無い」に数えない
      noRouteCounts = false;
    }
    decide();
    retryLibraryIfNeeded();
  }

  // ---- /preproduction（制作過程のキーのときだけ。/library と並行して取る。Issue #84）----
  // 赤ペン・ネーム専用の API。項目は registerPreproductionItems() が pre-red-wp{投稿ID} / pre-name-wp{投稿ID} で登録する。
  // 200 の配列なら届いた（空配列も正常。今の WP は項目が無く [] を返す）。それ以外（エラー・JSON でない・時間切れ・通信の失敗）は
  // 失敗として、間隔をあけて取り直す（DIRECT_RETRY_MS。1回ごとの時間切れは DIRECT_FETCH_TIMEOUT_MS で延ばす）
  function requestPreproduction() {
    var timeout = nthOrLast(DIRECT_FETCH_TIMEOUT_MS, preAttempts);  // 取り直すたびに長く待つ
    preAttempts++;
    wpApiGet('/preproduction', timeout).then(function(r) {
      if (r.status >= 200 && r.status < 300 && Array.isArray(r.data)) return r.data;
      console.warn('[direct-mode] /preproduction: HTTP ' + r.status);
      return null;
    }, function(err) {
      console.warn('[direct-mode] /preproduction を取得できません:', (err && err.name === 'AbortError') ? '時間切れ（' + timeout + 'ms）' : err);
      return null;
    }).then(onPreproduction).catch(directFlowFailed);
  }
  function onPreproduction(items) {
    if (items) registerPreproductionItems(items);
    if (finished()) return;
    preItems = items;
    if (items) {
      var key = findPreKey();
      if (key) {
        open(key);
        return;
      }
    } else {
      retryLater(requestPreproduction, nthOrLast(DIRECT_RETRY_MS, preAttempts - 1));
    }
    decide();
  }

  // ---- /manga/{id} ----
  function requestManga() {
    var timeout = nthOrLast(DIRECT_FETCH_TIMEOUT_MS, mangaAttempts);  // 取り直すたびに長く待つ
    mangaAttempts++;
    mangaBusy = true;
    wpApiGet('/manga/' + encodeURIComponent(directKey), timeout).then(function(r) {
      mangaBusy = false;
      if (finished()) return;
      if (r.status === 200 && r.data && typeof r.data === 'object' && !Array.isArray(r.data) && r.data.id) {
        var key = String(r.data.id);  // 開くキー＝登録したキー（応答の id。?manga=SEKO でも seko）
        mangaData[key] = toMangaEntry(r.data);
        open(key);
        return;
      }
      console.warn('[direct-mode] /manga/{id}: HTTP ' + r.status);
      onMangaAnswer(readMangaAnswer(r) || 'failed');
    }, function(err) {
      mangaBusy = false;
      console.warn('[direct-mode] /manga/{id} を取得できません:', (err && err.name === 'AbortError') ? '時間切れ（' + timeout + 'ms）' : err);
      onMangaAnswer('failed');
    }).catch(directFlowFailed);
  }
  // データ以外の答え: 'gone' は取り直さない（答えは変わらない）。'noRoute'・'failed' は間隔をあけて取り直す
  function onMangaAnswer(answer) {
    if (finished()) return;
    mangaAnswer = answer;
    if (answer === 'noRoute') noRouteCounts = libraryWorks !== null;
    armLibraryTimeout();  // 「作品が無い」・ルートが無い: 取得中の /library が要るようになった
    if (answer !== 'gone') {
      var seq = ++mangaSeq;
      retryLater(function() { if (seq === mangaSeq) requestManga(); }, nthOrLast(DIRECT_RETRY_MS, mangaAttempts - 1));
    }
    decide();
    retryLibraryIfNeeded();
  }
  // 予定を待たずに /manga/{id} に問い合わせ直す（取得中ならその答えを待つ）。それまでの取り直しの予定は無効にする
  function askMangaAgain() {
    if (mangaBusy) return;
    var seq = ++mangaSeq;
    runRetry(function() { if (seq === mangaSeq) requestManga(); });
  }

  // ---- 始める ----
  setTimeout(function() {
    if (finished()) return;  // 開く処理を始めた後は open() が見張る
    showDirectStalled(false);
  }, DIRECT_SLOW_MS);
  // 制作過程は、手書きの制作過程データにあれば WP を待たずに開く
  var preFound = preKey ? findPreKey() : null;
  if (preFound) {
    open(preFound);
    return;
  }
  requestLibrary();
  if (preKey) requestPreproduction();
  if (askManga) requestManga();
}

function startDirectMode() {
  showDirectLoader();
  // メンテナンス中（bm-wp-config.js の maintenance）は WP を取り直し続けず、すぐに一時停止の文言を出す（QR配布先向け）
  if (window.BM_WP_CONFIG && window.BM_WP_CONFIG.maintenance) {
    showDirectStalled(true, 'ただいま表示を一時停止しています。しばらくしてから再度ご覧ください。');
    return;
  }
  startDirectFlow();
}

// 制作過程のフォールバックデータを先に登録（pre-red-*, pre-name-* のダイレクトアクセス用）
// FALLBACK_PRE_DATA を直接 mangaData に登録
(function() {
  var fb = {
    red: [
      { key: 'pre-red-bms', title: 'BMS 運送 赤入れ', path: 'https://contentsx.jp/material/pre/red/bms-unso-red/', pages: 8 },
        { key: 'pre-red-ichinohe', title: '一戸ホーム 赤入れ', path: 'https://contentsx.jp/material/pre/red/ichinohe-red/', pages: 20 }
    ],
    name: [
      { key: 'pre-name-fax', title: 'BMS FAX ネーム', path: 'https://contentsx.jp/material/pre/name/bmsfax/', pages: 9 },
      { key: 'pre-name-ichinohe', title: '一戸ホーム ネーム', path: 'https://contentsx.jp/material/pre/name/ichinohe-name/', pages: 20 }
    ]
  };
  [].concat(fb.red, fb.name).forEach(function(item) {
    if (!mangaData[item.key]) {
      mangaData[item.key] = {
        title: item.title, pages: item.pages, path: item.path,
        gallery: [], tags: [], category: '制作過程',
        viewType: 'vertical', _isPreProduction: true
      };
    }
  });
})();

if (isDirectMode) {
  // Hide library entirely
  // biz-library.html uses .bm-header; works.html uses .header — handle both
  const headerEl = document.querySelector('.bm-header') || document.querySelector('.header');
  if (headerEl) headerEl.style.display = 'none';
  const pageHeroEl = document.querySelector('.page-hero');
  if (pageHeroEl) pageHeroEl.style.display = 'none';
  const worksSectionEl = document.querySelector('.works-section');
  if (worksSectionEl) worksSectionEl.style.display = 'none';
  const preSection = document.querySelector('.pre-section');
  if (preSection) preSection.style.display = 'none';
  const footerEl = document.querySelector('.footer');
  if (footerEl) footerEl.style.display = 'none';

  // 想定外の例外でも暗い画面とスピナーのまま止めない（directFlowFailed）。ここで拾うのは同期の例外（startDirectMode の中で
  // すぐ起きたもの）。取得の後の処理（Promise の中）の例外は、startDirectFlow の各取得の catch が同じく directFlowFailed へ渡す
  try {
    startDirectMode();
  } catch (e) {
    directFlowFailed(e);
  }
}

// ===== Pre-production Carousels (赤ペン・ネーム) =====
// pauseAllCarousels / resumeAllCarousels はファイル先頭で宣言済み

// フォールバック用の赤ペン・ネームデータ
const FALLBACK_PRE_DATA = {
  red: [
    { key: 'pre-red-bms', title: 'BMS 運送 赤入れ', path: 'https://contentsx.jp/material/pre/red/bms-unso-red/', pages: 8 },
    { key: 'pre-red-ichinohe', title: '一戸ホーム 赤入れ', path: 'https://contentsx.jp/material/pre/red/ichinohe-red/', pages: 20 }
  ],
  name: [
    { key: 'pre-name-fax', title: 'BMS FAX ネーム', path: 'https://contentsx.jp/material/pre/name/bmsfax/', pages: 9 },
    { key: 'pre-name-ichinohe', title: '一戸ホーム ネーム', path: 'https://contentsx.jp/material/pre/name/ichinohe-name/', pages: 20 }
  ]
};

// 現在有効な preData（API取得後に上書きされる可能性あり）
let preData = FALLBACK_PRE_DATA;

// WP APIデータから赤ペン・ネームデータを構築
function buildPreDataFromAPI() {
  const apiRed = [];
  const apiName = [];
  Object.entries(mangaData).forEach(function([key, data]) {
    if (data._isPreProduction) return;
    if (data.akapen_gallery && data.akapen_gallery.length > 0) {
      const akapenKey = 'pre-red-' + key;
      apiRed.push({
        key: akapenKey,
        title: data.title + ' 赤入れ',
        path: '',
        pages: data.akapen_gallery.length,
        gallery: data.akapen_gallery
      });
      // mangaDataに登録してopenManga()で開けるようにする
      mangaData[akapenKey] = {
        title: data.title + ' 赤入れ',
        pages: data.akapen_gallery.length,
        path: '',
        gallery: data.akapen_gallery,
        tags: [],
        category: '制作過程',
        viewType: 'vertical',
        _isPreProduction: true
      };
    }
    if (data.name_gallery && data.name_gallery.length > 0) {
      const nameKey = 'pre-name-' + key;
      apiName.push({
        key: nameKey,
        title: data.title + ' ネーム',
        path: '',
        pages: data.name_gallery.length,
        gallery: data.name_gallery
      });
      mangaData[nameKey] = {
        title: data.title + ' ネーム',
        pages: data.name_gallery.length,
        path: '',
        gallery: data.name_gallery,
        tags: [],
        category: '制作過程',
        viewType: 'vertical',
        _isPreProduction: true
      };
    }
  });
  if (apiRed.length > 0 || apiName.length > 0) {
    preData = {
      red: apiRed.length > 0 ? apiRed : FALLBACK_PRE_DATA.red,
      name: apiName.length > 0 ? apiName : FALLBACK_PRE_DATA.name
    };
  }
}

// /preproduction（赤ペン・ネーム専用の API）の項目を mangaData に登録し、カルーセルの preData も差し替える。
// 一覧のカルーセル（rebuildPreCarousels）と QR直リンク（startDirectFlow の /preproduction）の両方がこの関数を通る。
// - キーは pre-red-wp{投稿ID} / pre-name-wp{投稿ID}。⚠️ ホームの制作過程スライド（js/bm-pre-production.js）が
//   biz-library?manga= に渡すキーと同じ形にする（以前ホームは wp の付かない pre-red-{投稿ID} で開き、ビズ書庫で
//   「作品が見つかりませんでした」になった。Issue #84。旧形式の URL は直リンクの findPreKey が読み替える）
// - ページ数は WP 手入力の pages ではなく実際のギャラリー枚数を正とする（BUGS #049/#050。手入力ミスでズレると
//   カルーセルに壊れた画像URLや欠落が出る）
// 専用APIのデータがあればフォールバック＋manga_work データ（buildPreDataFromAPI）を上書きする
function registerPreproductionItems(data) {
  var apiRed = [];
  var apiName = [];
  data.forEach(function(item) {
    if (!item || typeof item !== 'object') return;
    var key = 'pre-' + (item.type === 'akapen' ? 'red' : 'name') + '-wp' + item.id;
    var galleryLen = (item.gallery && item.gallery.length) || 0;
    // 画像の無い項目は登録しない（path も無いので開くと空のビューアで /01.webp が 404 になる。
    // 登録しなければ直リンクは「作品が見つかりませんでした」、カルーセルにも出ない）
    if (galleryLen === 0) return;
    var pages = galleryLen;
    var entry = {
      key: key,
      title: item.title,
      path: '',
      pages: pages,
      gallery: item.gallery
    };
    if (item.type === 'akapen') {
      apiRed.push(entry);
    } else {
      apiName.push(entry);
    }
    // mangaDataに登録してビューアで開けるようにする
    mangaData[key] = {
      title: item.title,
      pages: pages,
      path: '',
      gallery: item.gallery,
      tags: [],
      category: '制作過程',
      viewType: 'vertical',
      _isPreProduction: true
    };
  });
  if (apiRed.length > 0) preData.red = apiRed;
  if (apiName.length > 0) preData.name = apiName;
}

function registerFallbackPreData() {
  Object.values(preData).flat().forEach(item => {
    if (!mangaData[item.key]) {
      mangaData[item.key] = {
        title: item.title,
        pages: item.pages,
        path: item.path,
        gallery: item.gallery || [],
        tags: [],
        category: '制作過程',
        viewType: 'vertical',
        _isPreProduction: true
      };
    }
  });
}

(function() {
  // フォールバックデータを登録
  registerFallbackPreData();

  function initCarousel(type) {
    const track = document.getElementById(type + 'Track');
    const dotsContainer = document.getElementById(type + 'Dots');
    if (!track || !dotsContainer) return null;

    const items = preData[type];
    if (!items || items.length === 0) return null;
    const slidesPerView = window.innerWidth <= 768 ? 1 : 3;
    let current = 0;
    let autoTimer = null;
    let carouselRAFId = null;

    // Build slides — ALL pages from ALL works, each page is a slide
    const allSlides = [];
    items.forEach((item) => {
      for (let p = 1; p <= item.pages; p++) {
        if (item.gallery && item.gallery.length >= p) {
          // galleryに実画像があればそれを使う
        } else if (!item.path) {
          // pathが無い(=API由来。BUGS #049と同種)のに実画像も無いページは
          // 壊れたURL(例: "09.webp")を生成しないようスキップする
          continue;
        }
        const src = (item.gallery && item.gallery.length >= p)
          ? item.gallery[p - 1]
          : item.path + String(p).padStart(2, '0') + '.webp';
        allSlides.push({
          key: item.key,
          title: item.title,
          page: p,
          totalPages: item.pages,
          src: src
        });
      }
    });

    const slidesFrag = document.createDocumentFragment();
    allSlides.forEach((s) => {
      const slide = document.createElement('div');
      slide.className = 'pre-carousel-slide';

      const imgWrap = document.createElement('div');
      imgWrap.className = 'pre-slide-img-wrap';
      const img = document.createElement('img');
      img.src = s.src;
      img.alt = s.title + ' ' + s.page + 'P';
      img.loading = 'lazy';
      imgWrap.appendChild(img);

      const title = document.createElement('div');
      title.className = 'pre-slide-title';
      title.textContent = s.title + '（' + s.page + '/' + s.totalPages + '）';

      slide.appendChild(imgWrap);
      slide.appendChild(title);
      slide.addEventListener('click', () => openManga(s.key));
      slidesFrag.appendChild(slide);
    });
    track.appendChild(slidesFrag);

    const totalSlides = allSlides.length;
    const maxIndex = Math.max(0, totalSlides - slidesPerView);

    // Calculate slide width in pixels (recalculated each move for resize safety)
    function getSlideWidth() {
      return track.parentElement.offsetWidth / slidesPerView;
    }

    function goTo(index) {
      current = Math.max(0, Math.min(index, maxIndex));
      var px = current * getSlideWidth();
      track.scrollTo({ left: px, behavior: 'smooth' });
    }

    var autoStep = 1;  // 自動スライドで1ページ分
    var btnStep = 3;   // 矢印ボタンで3ページスキップ
    function autoNext() {
      var next = current + autoStep;
      goTo(next > maxIndex ? 0 : next);
    }
    function btnNext() {
      var next = current + btnStep;
      goTo(next > maxIndex ? 0 : next);
    }
    function btnPrev() {
      var prev = current - btnStep;
      goTo(prev < 0 ? maxIndex : prev);
    }

    // Sync current index when user scrolls manually (touch/mouse drag)
    var scrollSyncTimer = null;
    track.addEventListener('scroll', function() {
      clearTimeout(scrollSyncTimer);
      scrollSyncTimer = setTimeout(function() {
        var sw = getSlideWidth();
        if (sw > 0) {
          current = Math.round(track.scrollLeft / sw);
          current = Math.max(0, Math.min(current, maxIndex));
        }
      }, 150);
    }, { passive: true });

    // Buttons
    const carousel = track.parentElement;
    carousel.querySelector('.prev').addEventListener('click', (e) => { e.stopPropagation(); btnPrev(); resetAuto(); });
    carousel.querySelector('.next').addEventListener('click', (e) => { e.stopPropagation(); btnNext(); resetAuto(); });

    // Auto-slide: use requestAnimationFrame instead of setInterval
    var paused = false;
    var lastAutoTime = 0;
    const AUTO_INTERVAL = 2500;

    function scheduleAutoSlide() {
      if (paused || !autoTimer) return;
      const now = Date.now();
      const timeSinceLastSlide = now - lastAutoTime;

      if (timeSinceLastSlide >= AUTO_INTERVAL) {
        lastAutoTime = now;
        autoNext();
      }
      carouselRAFId = requestAnimationFrame(scheduleAutoSlide);
    }

    function startAuto() {
      if (!paused) {
        lastAutoTime = Date.now();
        autoTimer = true;
        carouselRAFId = requestAnimationFrame(scheduleAutoSlide);
      }
    }
    function stopAuto() {
      if (carouselRAFId) cancelAnimationFrame(carouselRAFId);
      autoTimer = null;
    }
    function resetAuto() { stopAuto(); startAuto(); }
    // 直リンク（?manga=）ではカルーセルが隠れていて、ビューアだけを表示するので自動送りを始めない
    if (!isDirectMode) startAuto();

    // Mouse wheel: passive で縦スクロールを絶対にブロックしない
    // トラックパッドの横スワイプはブラウザの overflow-x: auto が自動処理
    track.addEventListener('wheel', function() {
      resetAuto();
    }, { passive: true });

    // Pause on hover
    carousel.addEventListener('mouseenter', () => stopAuto());
    carousel.addEventListener('mouseleave', () => startAuto());

    // Register for global pause/resume (modal open/close)
    preCarouselTimers.push({
      pause: function() { paused = true; stopAuto(); },
      resume: function() { paused = false; startAuto(); }
    });

    return { goTo, btnNext, btnPrev };
  }

  try { initCarousel('red'); } catch(e) { console.error('Red carousel error:', e); }
  try { initCarousel('name'); } catch(e) { console.error('Name carousel error:', e); }

  // カルーセル再描画の共通処理
  function doRebuild() {
    preCarouselTimers.forEach(function(t) { t.pause(); });
    preCarouselTimers = [];
    ['red', 'name'].forEach(function(type) {
      var track = document.getElementById(type + 'Track');
      if (track) track.innerHTML = '';
    });
    try { initCarousel('red'); } catch(e) { console.error('Red carousel rebuild error:', e); }
    try { initCarousel('name'); } catch(e) { console.error('Name carousel rebuild error:', e); }
  }

  // API取得後にカルーセルを再構築するためのグローバル関数
  window.rebuildPreCarousels = function() {
    // まず既存のmanga_workデータから赤ペン・ネームを構築
    buildPreDataFromAPI();
    registerFallbackPreData();

    // 次に専用APIからも取得して統合
    var apiBase = window.BM_WP_CONFIG ? window.BM_WP_CONFIG.apiBase : 'https://cms.contentsx.jp/wp-json/contentsx/v1';
    fetch(apiBase + '/preproduction')
      .then(function(r) {
        if (!r.ok) throw new Error('API error');
        return r.json();
      })
      .then(function(data) {
        if (!Array.isArray(data) || data.length === 0) { doRebuild(); return; }
        registerPreproductionItems(data);
        doRebuild();
      })
      .catch(function() {
        doRebuild();
      });
  };
})();
