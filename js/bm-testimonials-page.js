/**
 * BizManga — お客様の声 一覧ページ
 * 4列グリッドで全カードを表示
 * WP API + フォールバック
 */
(function () {
  'use strict';

  var grid = document.getElementById('bmTmListGrid');
  if (!grid) return;

  /* XSS対策ヘルパー */
  function esc(s) {
    if (window.bmSanitize && window.bmSanitize.html) return window.bmSanitize.html(s);
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function rich(s) {
    return (window.bmSanitize && window.bmSanitize.rich) ? window.bmSanitize.rich(s) : '<p>' + esc(String(s || '').replace(/<[^>]*>/g, '')) + '</p>';
  }
  function safePos(s) {
    s = String(s || 'center');
    return /^[a-zA-Z0-9% .-]+$/.test(s) ? s : 'center';
  }

  /* ---------- フォールバックデータ ---------- */
  var FALLBACK = [
    {
      id: 0,
      heading: '採用応募数が2倍に増加',
      excerpt: '漫画にしたことで、求職者に仕事の魅力がダイレクトに伝わるようになりました。面接でも「漫画を見て興味を持った」という声が増えています。',
      thumbnail: 'https://contentsx.jp/material/manga/bms-unso/01.webp',
      img_position: 'center',
      tag: '営業'
    },
    {
      id: 0,
      heading: '研修の理解度が大幅に向上',
      excerpt: 'テキストだけのマニュアルでは何度説明しても伝わらなかった内容が、漫画にした途端スッと理解してもらえるようになりました。',
      thumbnail: 'https://contentsx.jp/material/manga/diamond/01.webp',  // 研修の作品。2026-10-27 非公開にした life-school から差し替え（BUGS #085）
      img_position: 'center',
      tag: '研修'
    },
    {
      id: 0,
      heading: '商談がスムーズになった',
      excerpt: '漫画にしたことで、お客様との商談がスムーズになりました。紙面だけでは伝わらなかった住まいへの想いが伝わるようになったと感じています。',
      thumbnail: 'https://contentsx.jp/material/manga/ichinohe-home/01.webp',
      img_position: 'center',
      tag: '営業'
    },
    {
      id: 0,
      heading: 'SNSでの反応が3倍に',
      excerpt: '漫画コンテンツはSNSでの拡散力が段違いでした。広告費を抑えながら認知拡大ができ、費用対効果に大変満足しています。',
      thumbnail: 'https://contentsx.jp/material/manga/seko/01.webp',
      img_position: 'center',
      tag: 'プロモーション'
    }
  ];

  /* ---------- カード生成 ---------- */
  function buildCards(items) {
    grid.innerHTML = '';
    var frag = document.createDocumentFragment();

    items.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'bm-tm-list-card';

      var tagHtml = item.tag
        ? '<span class="bm-tm-list-tag">' + esc(item.tag) + '</span>'
        : '';

      /* 全フィールド esc()/safePos() でサニタイズ済み（XSS対策） */
      card.innerHTML =
        '<div class="bm-tm-list-cover">' +
          (item.thumbnail ? '<img src="' + esc(item.thumbnail) + '" alt="" loading="lazy" style="object-position:' + safePos(item.img_position) + ';">' : '') +
        '</div>' +
        '<div class="bm-tm-list-body">' +
          tagHtml +
          '<h3 class="bm-tm-list-title">' + esc(item.heading) + '</h3>' +
          '<p class="bm-tm-list-text">' + esc(item.excerpt) + '</p>' +
        '</div>';

      // クリックで詳細ページへ遷移
      if (item.id > 0) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', function () {
          location.href = 'testimonial-detail?id=' + item.id;
        });
      }

      frag.appendChild(card);
    });

    grid.appendChild(frag);
  }

  /* ---------- 全データ保持 (URL→item解決用) ---------- */
  var currentItems = [];
  var suppressHashChange = false;

  /* ---------- 詳細モーダル ---------- */
  function openDetail(id, item, skipHistory) {
    var modal = document.getElementById('bmTmPageModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bmTmPageModal';
      modal.className = 'bm-tm-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.innerHTML =
        '<div class="bm-tm-modal-overlay"></div>' +
        '<div class="bm-tm-modal-content">' +
          '<button class="bm-tm-modal-close" aria-label="閉じる">&times;</button>' +
          '<div class="bm-tm-modal-body"></div>' +
        '</div>';
      document.body.appendChild(modal);

      modal.querySelector('.bm-tm-modal-overlay').addEventListener('click', closeDetail);
      modal.querySelector('.bm-tm-modal-close').addEventListener('click', closeDetail);
    }

    /* URLハッシュ更新 (history に積む) */
    if (!skipHistory) {
      suppressHashChange = true;
      try {
        history.pushState({ bmTmId: id }, '', '#id=' + id);
      } catch(e) {}
      setTimeout(function(){ suppressHashChange = false; }, 50);
    }

    var body = modal.querySelector('.bm-tm-modal-body');
    body.innerHTML = '<p style="text-align:center;padding:40px;color:#999;">読み込み中…</p>';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    var apiBase = window.BM_WP_CONFIG ? window.BM_WP_CONFIG.apiBase : 'https://cms.contentsx.jp/wp-json/contentsx/v1';
    fetch(apiBase + '/testimonials/' + id)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        renderModalContent(body, data, item);
      })
      .catch(function () {
        renderModalContent(body, { heading: item.heading, content: '<p>' + (item.excerpt || '') + '</p>' }, item);
      });
  }

  /* ---------- モーダル本文描画 (シェア / CTA / 関連事例) ---------- */
  function renderModalContent(body, data, item) {
    /* 全フィールド esc()/safePos()/rich() でサニタイズ（XSS対策） */
    var tagHtml = item.tag ? '<span class="bm-tm-tag">' + esc(item.tag) + '</span>' : '';
    var shareUrl = location.origin + location.pathname + '#id=' + encodeURIComponent(data.id || item.id);
    var shareText = encodeURIComponent((data.heading || item.heading || '') + ' - BizManga 導入事例');
    var heroImg = item.thumbnail ? '<div class="bm-tm-hero"><img src="' + esc(item.thumbnail) + '" alt="' + esc(data.heading || item.heading) + '" style="object-position:' + safePos(item.img_position) + ';"></div>' : '';

    /* 関連事例 (同じタグ ≠ 自分) */
    var related = currentItems
      .filter(function(x) { return x.id !== (data.id || item.id) && x.tag === item.tag && x.id > 0; })
      .slice(0, 3);
    var relatedHtml = '';
    if (related.length > 0) {
      relatedHtml =
        '<div class="bm-tm-related">' +
          '<h3 class="bm-tm-related-title">関連事例</h3>' +
          '<div class="bm-tm-related-grid">' +
            related.map(function(r) {
              return '<a class="bm-tm-related-card" href="#id=' + encodeURIComponent(r.id) + '" data-id="' + esc(r.id) + '">' +
                (r.thumbnail ? '<img src="' + esc(r.thumbnail) + '" alt="" loading="lazy">' : '') +
                '<span>' + esc(r.heading) + '</span>' +
              '</a>';
            }).join('') +
          '</div>' +
        '</div>';
    }

    body.innerHTML =
      heroImg +
      '<div class="bm-tm-inner">' +
        tagHtml +
        '<h2 class="bm-tm-heading">' + esc(data.heading || item.heading) + '</h2>' +
        '<div class="bm-tm-content">' + (data.content ? rich(data.content) : '<p>' + esc(item.excerpt) + '</p>') + '</div>' +
        '<div class="bm-tm-cta">' +
          '<a href="/contact" class="bm-tm-cta-btn">無料相談する</a>' +
          '<a href="/works" class="bm-tm-cta-btn bm-tm-cta-btn--ghost">他の事例を見る</a>' +
        '</div>' +
        '<div class="bm-tm-share">' +
          '<span class="bm-tm-share-label">この事例をシェア</span>' +
          '<div class="bm-tm-share-btns">' +
            '<a href="https://twitter.com/intent/tweet?text=' + shareText + '&url=' + encodeURIComponent(shareUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="Xでシェア">X</a>' +
            '<a href="https://social-plugins.line.me/lineit/share?url=' + encodeURIComponent(shareUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="LINEでシェア">LINE</a>' +
            '<a href="https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(shareUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="Facebookでシェア">FB</a>' +
            '<button class="bm-tm-share-copy" aria-label="URLをコピー">URL</button>' +
          '</div>' +
        '</div>' +
        relatedHtml +
      '</div>';

    /* URL コピー */
    var copyBtn = body.querySelector('.bm-tm-share-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function() {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(shareUrl).then(function() {
            copyBtn.textContent = 'コピー済';
            setTimeout(function() { copyBtn.textContent = 'URL'; }, 2000);
          });
        }
      });
    }

    /* 関連事例クリック → 同モーダル内で差し替え */
    body.querySelectorAll('.bm-tm-related-card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        e.preventDefault();
        var rid = parseInt(card.getAttribute('data-id'), 10);
        var ritem = currentItems.find(function(x) { return x.id === rid; });
        if (ritem) openDetail(rid, ritem);
      });
    });
  }

  function closeDetail(skipHistory) {
    var modal = document.getElementById('bmTmPageModal');
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
    if (!skipHistory && location.hash.indexOf('#id=') === 0) {
      suppressHashChange = true;
      try {
        history.pushState({}, '', location.pathname);
      } catch(e) {}
      setTimeout(function(){ suppressHashChange = false; }, 50);
    }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeDetail();
  });

  /* popstate (戻るボタン) 対応 */
  window.addEventListener('popstate', function(e) {
    if (suppressHashChange) return;
    var m = location.hash.match(/^#id=(\d+)/);
    if (m) {
      var id = parseInt(m[1], 10);
      var item = currentItems.find(function(x) { return x.id === id; });
      if (item) openDetail(id, item, true);
    } else {
      closeDetail(true);
    }
  });

  /* 構造化データの Review / AggregateRating は出さない。自社サイト上の自社サービスへのレビューは Google の
     レビュー表示の対象外で、評価（全件5・平均4.9）にも根拠が無かった（2026-10-26 削除） */

  /* ---------- API取得 ---------- */
  function fetchFromAPI() {
    var apiBase = window.BM_WP_CONFIG ? window.BM_WP_CONFIG.apiBase : 'https://cms.contentsx.jp/wp-json/contentsx/v1';
    fetch(apiBase + '/testimonials?site=bizmanga')
      .then(function (r) {
        if (!r.ok) throw new Error('API error');
        return r.json();
      })
      .then(function (data) {
        if (data && data.length > 0) {
          currentItems = data;
          buildCards(data);
          openFromHash(); // WP データ到着後に URL ハッシュを解釈
        }
      })
      .catch(function () {
        currentItems = FALLBACK;
      });
  }

  /* ---------- URL ハッシュから初期モーダル開く ---------- */
  function openFromHash() {
    var m = location.hash.match(/^#id=(\d+)/);
    if (!m) return;
    var id = parseInt(m[1], 10);
    var item = currentItems.find(function(x) { return x.id === id; });
    if (item) openDetail(id, item, true);
  }

  /* ---------- 初期化 ---------- */
  currentItems = FALLBACK;
  buildCards(FALLBACK);
  fetchFromAPI();

})();
