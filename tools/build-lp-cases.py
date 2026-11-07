#!/usr/bin/env python3
"""
LP事例自動注入スクリプト
- WP API /works から事例を取得
- 各 LP の対象カテゴリで filter（categories 配列対応 + 旧カテゴリマッピング）
- WP の「サイトの表示 → ビズマンガ → 用途別 LP」で LP ごとに選んだ作品（/slots/bm-lp-{LP}。3作品まで）。
  枠が空の LP は、カテゴリが合う作品をヒーローの順番で上位3件（2026-11-07 より前と同じ選び方）
- <!-- BUILD:LP-CASES:BEGIN/END --> マーカー間に静的HTML注入
- LP 内で AI / Bot 可視性を確保（JS 実行不要）

GitHub Actions で毎日（03:15 JST）+ 手動実行。実行後は git commit & push。
"""
from bm_build import API_BASE, SITE_URL
from bm_build import bizmanga_works, fetch_json as _fetch_json, output_batch, work_page_count, write_text
import re
import urllib.error
import sys
from pathlib import Path
from datetime import date

ROOT = Path(__file__).resolve().parent.parent  # BizManga/
SITE = SITE_URL
WP_API = API_BASE + '/works'

# 各 LP のターゲットカテゴリ（複数可。順序は優先度）
LP_CATEGORIES = {
    "product-manga":  ["商品紹介", "紹介"],
    "recruit-manga":  ["採用"],
    "manga-ad-lp":    ["広告", "集客", "IP"],
    "company-manga":  ["会社紹介", "企業紹介", "ブランド"],
    "sales-manga":    ["営業資料", "営業"],
    "training-manga": ["研修"],
    "inbound-manga":  ["インバウンド", "英語版", "海外版", "多言語", "集客"],
    "ir-manga":       ["IR"],
}

LP_NAMES = {
    "product-manga":  "商品紹介マンガ",
    "recruit-manga":  "採用マンガ",
    "manga-ad-lp":    "マンガ広告",
    "company-manga":  "会社紹介マンガ",
    "sales-manga":    "営業資料マンガ",
    "training-manga": "研修マンガ",
    "inbound-manga":  "インバウンド漫画",
    "ir-manga":       "IR漫画・周年史マンガ",
}

MAX_CASES_PER_LP = 3


def fetch_works():
    """Fetch and validate all work identities before updating any LP."""
    cb = int(date.today().strftime("%Y%m%d"))
    # /works/{slug}.html は show_site=both の作品にしか無いので、検証もその作品だけにかける
    return bizmanga_works(_fetch_json(f"{WP_API}?per_page=100&_cb={cb}"), label="LP works")


def get_work_categories(w):
    """categories 配列を取得（fallback: category 単数 → リスト化）。"""
    cats = w.get("categories")
    if cats and isinstance(cats, list):
        return cats
    cat = w.get("category")
    return [cat] if cat else []


def has_static_detail(work):
    """/works/{slug}.html が存在するか。
    存在しないと 404→/biz-library?manga={id} (漫画ビューア) にリダイレクトされてしまうため、
    LP の CASE STUDY にはここを通った作品だけを出す。"""
    slug = work.get("id", "")
    if not slug:
        return False
    return (ROOT / "works" / f"{slug}.html").exists()


def filter_for_lp(works, lp_slug):
    """LP のターゲットカテゴリにマッチし、かつ静的詳細ページが存在する作品を返す。"""
    targets = set(LP_CATEGORIES[lp_slug])
    matched = []
    for w in works:
        wcats = set(get_work_categories(w))
        if not (wcats & targets):
            continue
        if not has_static_detail(w):
            # show_site!=both 等で /works/{slug}.html が無い作品は CASE STUDY から除外
            continue
        matched.append(w)
    return matched


def fetch_chosen_ids(lp_slug):
    """WP の LP の事例の枠（/slots/bm-lp-{LP}）で選んだ作品ID（並び順）。空なら []。

    枠の住所が無い（404。プラグインを上げる前）ときも [] として今までの選び方にする。
    それ以外の失敗は例外のまま止める（たまたま読めなかった日に LP の事例が別の作品に入れ替わらないように。
    止まれば LP は書き換えず、前回の出力が残る）。WP は、制作事例の一覧に出ていない作品を返さない（needs_works）。"""
    cb = int(date.today().strftime("%Y%m%d"))
    try:
        data = _fetch_json(f"{API_BASE}/slots/bm-lp-{lp_slug}?_cb={cb}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return []
        raise
    items = data.get("items") if isinstance(data, dict) else None
    if not isinstance(items, list):
        raise ValueError(f"/slots/bm-lp-{lp_slug}: items が配列ではありません")
    return [str(c.get("slug") or "") for c in items if isinstance(c, dict) and c.get("kind") == "manga" and c.get("slug")]


def pick_cases(works, lp_slug, n):
    """枠で選んだ作品（作品ページがあるものだけ・選んだ順）。1つも無ければ今までの選び方。"""
    by_id = {str(w.get("id")): w for w in works if has_static_detail(w)}
    chosen = [by_id[i] for i in fetch_chosen_ids(lp_slug) if i in by_id][:n]
    if chosen:
        return chosen, "枠"
    return select_top(filter_for_lp(works, lp_slug), n), "ヒーローの順番"


def select_top(works, n):
    """hero_order_bm の昇順、なければページ数（gallery の実枚数優先）の降順、で上位 n 件。"""
    def key(w):
        order = w.get("hero_order_bm") or w.get("hero_order_cx") or 9999
        return (order, -work_page_count(w))
    return sorted(works, key=key)[:n]


def html_escape(s):
    if s is None:
        return ""
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def strip_outer_quotes(text):
    """WP のコメントが既に「…」で囲まれていれば外す（カードで「」を付けるので「「…」」にしない、Issue #86）。"""
    text = str(text or "").strip()
    if len(text) >= 2 and text.startswith("「") and text.endswith("」"):
        return text[1:-1].strip()
    return text


def render_card(work):
    """1事例分の静的 HTML カード（.lpv2-* クラス）。"""
    wid = work.get("id", "")
    title = html_escape(work.get("title_ja", ""))
    subtitle = html_escape(work.get("subtitle_ja", "") or "")
    client = html_escape(work.get("client", ""))
    # gallery の実枚数を優先（BUGS #049/#050。制作事例ページと同じ規則）
    pages = work_page_count(work)
    spec = work.get("spec") or {}
    period = html_escape(spec.get("period", ""))
    point = html_escape(work.get("point", ""))
    comment = html_escape(strip_outer_quotes(work.get("comment")))
    media_list = work.get("media", []) or []
    media = " / ".join(html_escape(m) for m in media_list[:3])
    thumb = work.get("thumbnail") or ""
    cats_display = " / ".join(html_escape(c) for c in get_work_categories(work))

    # サムネ ALT 文言: 作品名 + クライアント
    alt = f"{work.get('title_ja', '')}（{work.get('client', '')}）" if client else work.get("title_ja", "")

    parts = ['          <article class="lpv2-case">']
    if thumb:
        parts.append(
            f'            <a class="lpv2-case__thumb" href="/works/{wid}" aria-label="{title} の詳細を見る">'
        )
        parts.append(
            f'              <img src="{html_escape(thumb)}" alt="{html_escape(alt)}" loading="lazy" width="240" height="300">'
        )
        parts.append("            </a>")
    parts.append('            <div class="lpv2-case__body">')
    parts.append(
        f'              <p class="lpv2-case__meta">{cats_display}'
        + (f" / {pages}P" if pages else "")
        + (f" / {period}" if period else "")
        + "</p>"
    )
    parts.append(f'              <h3 class="lpv2-case__title"><a href="/works/{wid}">{title}</a></h3>')
    if client:
        parts.append(
            f'              <p class="lpv2-case__client">クライアント: {client}'
            + (f"／媒体: {media}" if media else "")
            + "</p>"
        )
    if point:
        parts.append(f'              <p class="lpv2-case__point">{point}</p>')
    if comment:
        parts.append(
            f'              <blockquote class="lpv2-case__quote">「{comment}」</blockquote>'
        )
    parts.append(f'              <a class="lpv2-case__more" href="/works/{wid}">この事例を詳しく見る →</a>')
    parts.append("            </div>")
    parts.append("          </article>")
    return "\n".join(parts)


# CHAPTER 番号は LP ごとに固定（採用LP は 04、他は未設定）。
LP_V2_CHAPTER_NUM = {
    "recruit-manga": "04",
}


def render_section(slug, lp_name, works):
    """LP 用の事例セクション全体（.lpv2-* マークアップ）。"""
    chapter_num = LP_V2_CHAPTER_NUM.get(slug, "04")
    if not works:
        return (
            "\n    <!-- BUILD:LP-CASES:BEGIN (auto-generated by tools/build-lp-cases.py) -->\n"
            f'    <section class="lpv2-section lpv2-cases" id="chapter-04-cases" aria-label="{lp_name}の制作事例">\n'
            '      <div class="lpv2-container">\n'
            '        <header class="lpv2-section-head">\n'
            f'          <span class="lpv2-chapter-num">{chapter_num}</span>\n'
            f'          <span class="lpv2-chapter-mark">CHAPTER {chapter_num} &middot; CASE STUDY</span>\n'
            '          <h2 class="lpv2-h2">制作事例</h2>\n'
            '          <p class="lpv2-lead lpv2-lead--center">該当ジャンルの事例は現在準備中です。<a href="/works">全作品一覧</a>または<a href="/biz-library">ビズ書庫</a>から関連作品をご覧ください。</p>\n'
            '        </header>\n'
            "      </div>\n"
            "    </section>\n"
            "    <!-- BUILD:LP-CASES:END -->\n"
        )
    cards = "\n".join(render_card(w) for w in works)
    return (
        "\n    <!-- BUILD:LP-CASES:BEGIN (auto-generated by tools/build-lp-cases.py) -->\n"
        f'    <section class="lpv2-section lpv2-cases" id="chapter-04-cases" aria-label="{lp_name}の制作事例">\n'
        '      <div class="lpv2-container">\n'
        '        <header class="lpv2-section-head">\n'
        f'          <span class="lpv2-chapter-num">{chapter_num}</span>\n'
        f'          <span class="lpv2-chapter-mark">CHAPTER {chapter_num} &middot; CASE STUDY</span>\n'
        '          <h2 class="lpv2-h2">制作事例</h2>\n'
        f'          <p class="lpv2-lead lpv2-lead--center">{lp_name}として実際に納品した事例から、抜粋してご紹介します。</p>\n'
        '        </header>\n'
        '        <div class="lpv2-cases-grid">\n'
        f"{cards}\n"
        '        </div>\n'
        '        <p class="lpv2-cases-foot"><a href="/works" class="lpv2-btn lpv2-btn--ghost">制作事例の一覧を見る →</a></p>\n'
        "      </div>\n"
        "    </section>\n"
        "    <!-- BUILD:LP-CASES:END -->\n"
    )


def is_v2_lp(slug):
    """LP HTML 内に <!-- LP-DESIGN:v2 --> マーカーがあるか。"""
    path = ROOT / f"{slug}.html"
    if not path.exists():
        return False
    try:
        head = path.read_text(encoding="utf-8")
    except Exception:
        return False
    return "LP-DESIGN:v2" in head


def patch_lp(slug, section_html):
    path = ROOT / f"{slug}.html"
    src = path.read_text(encoding="utf-8")
    original = src
    starts = src.count("<!-- BUILD:LP-CASES:BEGIN")
    ends = src.count("<!-- BUILD:LP-CASES:END -->")
    if starts != ends or starts > 1:
        raise ValueError(f"{slug}: malformed or duplicate LP cases markers")

    # 1. 既存の動的「CASE STUDY 制作事例」セクション (data-bm-lp-cases) を削除
    pat_dynamic = re.compile(
        r'\s*(?:<!-- ===== 5\. 制作事例[^\n]*\n)?'
        r'\s*<section\s[^>]*\bdata-bm-lp-cases\b[^>]*>.*?</section>\s*\n',
        re.DOTALL | re.IGNORECASE,
    )
    src = pat_dynamic.sub("\n", src, count=1)

    # 2. 既存 BUILD:LP-CASES マーカー区間を削除（毎回ビズ書庫埋込の直前に配置し直す）
    pat_existing = re.compile(
        r"\n\s*<!-- BUILD:LP-CASES:BEGIN[^>]*-->.*?<!-- BUILD:LP-CASES:END -->\n",
        re.DOTALL,
    )
    src = pat_existing.sub("\n", src)

    def insert_at(position):
        # Canonical boundary whitespace prevents every rebuild adding blank lines.
        return (src[:position].rstrip() + "\n" + section_html.strip("\n") +
                "\n\n    " + src[position:].lstrip())

    # 3. 配置位置を確定
    #   v2 LP: CHAPTER 05 LIBRARY (id="chapter-05-library") の直前
    #   旧 LP: ビズ書庫埋込 (id="library") のセクション開始タグ直前
    m_v2 = re.search(r'(\s*<!--[^\n]*CHAPTER 05[^\n]*-->\s*\n)?(\s*<section[^>]*\bid="chapter-05-library")', src)
    m = re.search(r'(\s*<!--[^\n]*ビズ書庫埋込[^\n]*-->\s*\n)?(\s*<section[^>]*\bid="library")', src)
    if m_v2:
        start = m_v2.start()
        new_src = insert_at(start)
    elif m:
        # マッチ全体（コメント+セクション開始）の前に section_html を挿入
        start = m.start()
        new_src = insert_at(start)
    else:
        # フォールバック: 制作フロー直前
        anchor_flow = re.compile(r'(\n    <!-- ===== 制作フロー[^>]*-->)')
        if not anchor_flow.search(src):
            raise ValueError(f"{slug}: LP cases anchor not found")
        new_src = insert_at(anchor_flow.search(src).start())

    if new_src == original:
        return False
    write_text(path, new_src)
    return True


def _build():
    try:
        works = fetch_works()
    except Exception as e:
        print(f"ERROR fetching works: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Fetched {len(works)} works from WP API")

    summary = {}
    for slug in LP_CATEGORIES:
        matched = filter_for_lp(works, slug)
        top, how = pick_cases(works, slug, MAX_CASES_PER_LP)
        if not is_v2_lp(slug):
            # 旧 pm-* 用CSSは削除済み。印が無いLPに事例を差し込むと崩れるので止める
            raise ValueError(f"{slug}.html: missing <!-- LP-DESIGN:v2 --> marker")
        section = render_section(slug, LP_NAMES[slug], top)
        ok = patch_lp(slug, section)
        summary[slug] = {
            "matched": len(matched),
            "shown": len(top),
            "how": how,
            "patched": ok,
            "titles": [w.get("title_ja") for w in top],
        }

    print("\n=== 各LPへの注入結果 ===")
    for slug, info in summary.items():
        print(f"  {slug}: {info['how']} matched={info['matched']}, shown={info['shown']}, patched={info['patched']}")
        for t in info["titles"]:
            print(f"      - {t}")


def main():
    with output_batch(ROOT):
        return _build()


if __name__ == "__main__":
    main()
