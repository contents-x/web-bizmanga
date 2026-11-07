#!/usr/bin/env python3
"""
BizManga 漫画家紹介（/artists）の静的ビルダー

WP API `/artists` から漫画家を取得し、以下を自動生成する:
  1. js/artists-data.js  … CREATORS 配列（artists.js が読む）
  2. artists.html 内の <!-- BUILD:ARTISTS_GRID --> マーカー間に静的カードを展開
  3. artists.html head に ItemList JSON-LD を挿入

使い方:
    cd BizManga
    python3 tools/build-artists.py

実行タイミング:
    - WordPress で漫画家を追加・更新・並べ替えした後
    - 毎日 03:10 JST に自動（.github/workflows/build-artists.yml。2026-11-07〜）＋手動実行

Why:
    artists.html は JS で描画する構成のため、Googlebot の JS レンダリング前は
    空ページ扱いになり、AI クローラーも読めない（works.html と同じ問題）。
    事前に静的HTMLを生成して SEO/AI 可読性を担保する。

    ⚠️ WP が空・不通のときは既存の出力を残す（消さない）。
       ビルド失敗でページが空になる事故を防ぐため。
"""

from bm_build import API_BASE, SITE_URL
from bm_build import fetch_json as _fetch_json, output_batch, write_text, script_json
from bm_build import replace_block
import html
import json
import pathlib
import sys
import urllib.error
import urllib.request

API = API_BASE + '/artists'
SITE = SITE_URL
ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML_PATH = ROOT / "artists.html"
DATA_PATH = ROOT / "js" / "artists-data.js"

TIMEOUT = 20

# WP のタグ分類キー → artists.js 側のプロパティ名
TAG_MAP = {
    "style": "styleTags",
    "usecase": "usecaseTags",
    "genre": "genreTags",
    "audience": "audienceTags",
    "medium": "mediaTags",
}


def esc(s):
    return html.escape(str(s if s is not None else ""), quote=True)


def fetch_artists():
    return _fetch_json(API, timeout=TIMEOUT, user_agent="bizmanga-build/1.0")


def to_creator(a, index):
    """WP のレスポンスを artists.js の CREATORS 1件の形に変換する。"""
    tags = a.get("tags") or {}
    # 記号が空なら順番から A, B, C… を割り当てる（WP側の入力漏れ対策）
    symbol = (a.get("symbol") or "").strip() or chr(65 + index % 26)

    item = {
        "id": symbol,
        "slug": a.get("slug") or "",
        "title": a.get("title") or "",
        "summary": a.get("summary") or "",
        "thumbnail": a.get("thumbnail") or "",
        "gallery": [
            {"src": u, "alt": f"{a.get('title','')}の作例{i+1}"}
            for i, u in enumerate(a.get("gallery") or [])
        ],
        "detail": a.get("detail") or "",
        "works": a.get("works") or [],
        "yearsActive": a.get("years") or "",
    }
    for wp_key, js_key in TAG_MAP.items():
        item[js_key] = tags.get(wp_key) or []
    return item


def build_data_js(creators):
    body = json.dumps(creators, ensure_ascii=False, indent=2)
    return (
        "/* 自動生成ファイル — 直接編集しないこと。\n"
        "   WordPress の「漫画家」を編集して tools/build-artists.py を実行すると更新されます。\n"
        f"   生成元: {API} */\n"
        f"window.BM_ARTISTS = {body};\n"
    )


def build_card(c, index):
    """artists.js の renderCards() と同じ構造の静的カードを吐く。
    JS が動く環境では再描画されるが、クローラーはこの静的HTMLを読む。"""
    label = esc(c["id"])
    return (
        f'        <button type="button" class="art-card" data-creator-id="{label}" aria-haspopup="dialog">\n'
        f'          <span class="art-card__label" aria-hidden="true">{label}</span>\n'
        f'          <span class="art-card__media">'
        f'<img class="art-card__img" src="{esc(c["thumbnail"])}" alt="{esc(c["title"])}の作例" '
        f'loading="lazy" decoding="async" width="400" height="300"></span>\n'
        f'          <span class="art-card__body">\n'
        f'            <span class="art-card__title">{esc(c["title"])}</span>\n'
        f'            <span class="art-card__summary">{esc(c["summary"])}</span>\n'
        f'            <span class="art-card__more">この作家を詳しく見る</span>\n'
        f'          </span>\n'
        f'        </button>\n'
    )


def build_jsonld(creators):
    items = [
        {
            "@type": "ListItem",
            "position": i + 1,
            "name": c["title"],
        }
        for i, c in enumerate(creators)
    ]
    return {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "@id": f"{SITE}/artists#artistlist",
        "name": "ビズマンガ 在籍漫画家一覧",
        "numberOfItems": len(creators),
        "itemListElement": items,
    }


def _build():
    try:
        raw = fetch_artists()
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as e:
        print(f"[build-artists] WP API に接続できません: {e}", file=sys.stderr)
        print("[build-artists] 既存の出力を保持して終了します（ページは空になりません）")
        return 1
    except json.JSONDecodeError as e:
        print(f"[build-artists] レスポンスがJSONではありません: {e}", file=sys.stderr)
        return 1

    if not isinstance(raw, list) or not raw:
        # 0件で上書きすると公開ページが空になるため、ここで止める
        print("[build-artists] WP から0件。既存の出力を保持して終了します", file=sys.stderr)
        return 1

    creators = [to_creator(a, i) for i, a in enumerate(raw)]

    # 1) データJS
    write_text(DATA_PATH, build_data_js(creators))
    print(f"[build-artists] {DATA_PATH.relative_to(ROOT)} を更新（{len(creators)}名）")

    # 2) 静的カード + JSON-LD
    s = HTML_PATH.read_text(encoding="utf-8")

    cards = "".join(build_card(c, i) for i, c in enumerate(creators))
    start, end = "<!-- BUILD:ARTISTS_GRID -->", "<!-- /BUILD:ARTISTS_GRID -->"
    s, ok = replace_block(s, start, end, f"{start}\n{cards}      {end}")
    if not ok:
        if '<div class="art-grid" id="artGrid">' not in s:
            raise ValueError("Missing artists grid")
        s = s.replace(
            '<div class="art-grid" id="artGrid">',
            f'<div class="art-grid" id="artGrid">\n      {start}\n{cards}      {end}',
            1,
        )

    ld = script_json(build_jsonld(creators), indent=2)
    ld_block = f'<script type="application/ld+json" id="artistsItemList">\n{ld}\n</script>'
    s, ok = replace_block(
        s,
        '<script type="application/ld+json" id="artistsItemList">',
        "</script>",
        ld_block,
    )
    if not ok:
        if "</head>" not in s:
            raise ValueError("Missing artists head")
        s = s.replace("</head>", f"  {ld_block}\n</head>", 1)

    write_text(HTML_PATH, s)
    print(f"[build-artists] artists.html を更新（カード{len(creators)}枚 + JSON-LD）")
    return 0


def main():
    with output_batch(ROOT):
        return _build()


if __name__ == "__main__":
    sys.exit(main())
