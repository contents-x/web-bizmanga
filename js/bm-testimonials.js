/**
 * BizManga — お客様の声（CMS連携）
 * - WP API からデータ取得 → カードグリッド生成
 * - クリックで詳細モーダル（WPエディタの本文を表示）
 * - フォールバック: API失敗時は静的データで表示
 */
(function () {
  'use strict';

  var grid = document.getElementById('bmTestimonialsGrid');
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
  /* object-position 値は英数字・%・スペース等のみ許可 */
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

  /* ---------- タグ英訳マップ ---------- */
  /* ---------- カード生成 ---------- */
  function buildCards(items) {
    grid.innerHTML = '';
    var frag = document.createDocumentFragment();

    items.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'bm-testimonial-card';
      if (item.id) card.id = 'testimonial-' + item.id;
      var tagHtml = item.tag
        ? '<span class="bm-testimonial-tag">' + esc(item.tag) + '</span>'
        : '';

      /* 全フィールド esc()/safePos() 済み（XSS対策） */
      card.innerHTML =
        '<div class="bm-testimonial-cover" style="' + (item.img_position ? 'overflow:hidden;' : '') + '">' +
          (item.thumbnail ? '<img src="' + esc(item.thumbnail) + '" alt="" loading="lazy" style="object-position:' + safePos(item.img_position) + ';">' : '') +
        '</div>' +
        tagHtml +
        '<h3 class="bm-testimonial-title">' + esc(item.heading) + '</h3>' +
        '<p class="bm-testimonial-text">' + esc(item.excerpt) + '</p>';

      // クリックで詳細ページへ遷移（API IDがある場合のみ）
      if (item.id > 0) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', function () {
          location.href = 'testimonial-detail?id=' + item.id;
        });
      }

      frag.appendChild(card);
    });

    grid.appendChild(frag);

    // URLハッシュでお客様の声にスクロール（ディープリンク）
    if (window.location.hash && window.location.hash.startsWith('#testimonial-')) {
      var target = document.getElementById(window.location.hash.slice(1));
      if (target) {
        setTimeout(function() {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.style.boxShadow = '0 0 0 3px var(--bm-accent)';
          setTimeout(function() { target.style.boxShadow = ''; }, 2000);
        }, 300);
      }
    }


  }

  /* ---------- 詳細モーダル ---------- */
  function openDetail(id, item) {
    // モーダルがすでにあれば再利用
    var modal = document.getElementById('bmTestimonialModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bmTestimonialModal';
      modal.className = 'bm-tm-modal';
      modal.innerHTML =
        '<div class="bm-tm-modal-overlay"></div>' +
        '<div class="bm-tm-modal-content">' +
          '<button class="bm-tm-modal-close">&times;</button>' +
          '<div class="bm-tm-modal-body"></div>' +
        '</div>';
      document.body.appendChild(modal);

      modal.querySelector('.bm-tm-modal-overlay').addEventListener('click', closeDetail);
      modal.querySelector('.bm-tm-modal-close').addEventListener('click', closeDetail);
    }

    var body = modal.querySelector('.bm-tm-modal-body');
    body.innerHTML = '<p style="text-align:center;padding:40px;color:#999;">読み込み中…</p>';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // APIから本文を取得
    var apiBase = window.BM_WP_CONFIG ? window.BM_WP_CONFIG.apiBase : 'https://cms.contentsx.jp/wp-json/contentsx/v1';
    fetch(apiBase + '/testimonials/' + id)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var tagHtml = item.tag ? '<span class="bm-tm-tag">' + esc(item.tag) + '</span>' : '';
        /* 本文はWPリッチHTMLなので rich() でサニタイズ、他は esc() */
        body.innerHTML =
          (item.thumbnail ? '<div class="bm-tm-hero"><img src="' + esc(item.thumbnail) + '" alt="" style="object-position:' + safePos(item.img_position) + ';"></div>' : '') +
          '<div class="bm-tm-inner">' +
            tagHtml +
            '<h2 class="bm-tm-heading">' + esc(data.heading || item.heading) + '</h2>' +
            '<div class="bm-tm-content">' + (data.content ? rich(data.content) : '<p>' + esc(item.excerpt) + '</p>') + '</div>' +
          '</div>';
      })
      .catch(function () {
        body.innerHTML =
          '<div class="bm-tm-inner">' +
            '<h2 class="bm-tm-heading">' + esc(item.heading) + '</h2>' +
            '<p>' + esc(item.excerpt) + '</p>' +
          '</div>';
      });
  }

  function closeDetail() {
    var modal = document.getElementById('bmTestimonialModal');
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  // ESCキーで閉じる
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeDetail();
    }
  });

  /* ---------- ドラッグスクロール ---------- */
  function enableDragScroll() {
    var wrapper = document.querySelector('.bm-testimonials-scroll');
    if (!wrapper) return;
    var isDragging = false, startX, scrollLeft;

    wrapper.addEventListener('mousedown', function (e) {
      isDragging = true;
      wrapper.style.cursor = 'grabbing';
      startX = e.pageX - wrapper.offsetLeft;
      scrollLeft = wrapper.scrollLeft;
    });
    wrapper.addEventListener('mouseleave', function () {
      isDragging = false;
      wrapper.style.cursor = '';
    });
    wrapper.addEventListener('mouseup', function () {
      isDragging = false;
      wrapper.style.cursor = '';
    });
    wrapper.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      e.preventDefault();
      var x = e.pageX - wrapper.offsetLeft;
      wrapper.scrollLeft = scrollLeft - (x - startX);
    });
  }

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
        }
      })
      .catch(function () {
        // フォールバックのまま
      });
  }

  /* ---------- 初期化 ---------- */
  var currentItems = FALLBACK;
  buildCards(FALLBACK);
  enableDragScroll();
  fetchFromAPI(); // WP /testimonials エンドポイント有効化済み

})();
