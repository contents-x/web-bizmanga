#!/usr/bin/env python3
"""
smoke-manga-wp.py — BizManga「漫画の表示」と「WordPress接続」のスモークテスト

目的（2026-09-15 平澤指示）: 漫画ビューア / ホームギャラリー / 制作事例モーダル / 埋込ビューア と
WP API 接続が「壊れていないか」を、人の目に頼らず機械的に確認する。
対応するチェックリスト: docs/REVIEW-MANGA-WP.md §1

使い方:
  python3 tools/smoke-manga-wp.py --serve .                              # 推奨: 内蔵サーバー(127.0.0.1:5500)で配信して検証
  python3 tools/smoke-manga-wp.py --base https://bizmanga.contentsx.jp  # 本番にも当てられる（マージ後の確認）
  python3 tools/smoke-manga-wp.py --api-only                             # WP API だけ（ブラウザを使わない）

ローカル検証の仕組み:
  - 内蔵サーバーはリポジトリ直下 serve.py の CleanURLHandler（拡張子なしURL対応）を再利用し、127.0.0.1 だけで
    待ち受ける。ディレクトリ一覧は GitHub Pages と同じく 404。`python -m http.server` は `biz-library?manga=` への
    サイト内遷移が 404 になるので使わない
  - WP プラグインの CORS 許可オリジンは 本番 + http://127.0.0.1:5500 + http://localhost:3000（contentsx-cms.php）。
    既定ポート 5500 なら**実際の CORS 設定のまま**通る。別ポートを指定したときだけ、Playwright で API 応答を中継して
    Access-Control-Allow-Origin を足す（その場合 CORS 設定そのものは検証されない）
  - http 配信では CSP frame-src（https: のみ）で 127.0.0.1 の埋込 iframe が拒否されるログが出る。そのローカル起因分だけ無視する
  - --api は Python 側の API 確認にだけ効く。ブラウザ側は常にサイト自身の js/bm-wp-config.js の apiBase を使う
    （ビズ書庫の js/works.js も、先に読む bm-wp-config.js の apiBase を WP_API_BASE として使う）
  - QR直リンク・埋込・スマホの確認には、手書きデータ（js/bm-fallback-works.js の BM_FALLBACK_WORKS。works.js の FALLBACK_WORKS と
    埋込ビューアが使う）に**無い**作品を選ぶ
    （ビズ書庫の一覧の初期表示と埋込ビューアは、WP に繋がらないとき手書きデータ・素材フォルダの画像を使うので、
    手書きデータにある作品だと開けたことが WP 接続の確認にならない）
  - QR直リンクは手書きデータでは開かない（Issue #71。2026-10-15 方針）。手書きデータにもある作品が WP のデータで開くことは
    別項目で、手書きデータで開いたときと見分けられる作品（WP のギャラリーがある＝1枚目が WP の画像になる・最終ページCTA が
    有効）を選んで確かめる（ページ数＝WP のギャラリー枚数、1枚目＝WP の画像、最終ページCTA＝WP の cta_enabled どおり）。
    期待値は --api ではなく、ブラウザが実際に使う API（js/works.js の WP_API_BASE）から取る
  - QR直リンクの分岐（WP が「作品が無い」と答えた／WP が止まっている→「表示に時間がかかっています」→WP が戻ると開く）は、
    ブラウザ側で API の応答を差し替えて確かめる。「作品が無い」の応答は、本番の API に存在しない ID を GET した実物を使う

終了コード: 全 PASS で 0、1つでも FAIL なら 1（例外で中断した区画も FAIL として集計）。
必要なもの: Python 3.9+、playwright（pip install playwright && python3 -m playwright install chromium）
"""
import argparse
import json
import os
import re
import sys
import threading
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

DEFAULT_API = "https://cms.contentsx.jp/wp-json/contentsx/v1"
DEFAULT_PORT = 5500
# WP プラグイン（contentsx-cms.php cxcms_allowed_origins）が許可しているローカルオリジン
CORS_ALLOWED_LOCAL_ORIGINS = {"http://127.0.0.1:5500", "http://localhost:3000"}
# エラー・404 を「自分の責任範囲」として数えるホスト（サイト自身 + WP + 素材置き場）
WATCH_HOST_SUFFIXES = ("contentsx.jp",)
RESULTS = []  # (name, ok, detail)
SKIPPED = []  # (name, reason)  前提の取得に失敗して確かめられなかった項目（前提の失敗は FAIL として RESULTS にある）


def rec(name, ok, detail=""):
    RESULTS.append((name, bool(ok), detail))
    print(("PASS  " if ok else "FAIL  ") + name + ("  — " + detail if detail else ""), flush=True)


def skip(name, reason):
    SKIPPED.append((name, reason))
    print(f"SKIP  {name}  — {reason}", flush=True)


def get_json(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": "bm-smoke/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def get_text(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": "bm-smoke/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def get_status_json(url, timeout=25):
    """(状態コード, JSON か None) を返す。4xx/5xx でも例外にしない"""
    req = urllib.request.Request(url, headers={"User-Agent": "bm-smoke/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    try:
        return status, json.loads(raw.decode("utf-8"))
    except Exception:
        return status, None


def url_ok(url, timeout=15):
    for method in ("HEAD", "GET"):
        try:
            req = urllib.request.Request(url, method=method, headers={"User-Agent": "bm-smoke/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return 200 <= r.status < 400
        except urllib.error.HTTPError as e:
            if method == "HEAD" and e.code in (403, 405):
                continue
            return False
        except Exception:
            return False
    return False


def img_url(entry):
    """gallery の要素は文字列URL か {url|src|full} の dict のどちらでも受ける"""
    if isinstance(entry, str):
        return entry
    if isinstance(entry, dict):
        for k in ("url", "src", "full", "large"):
            if entry.get(k):
                return entry[k]
    return ""


# ------------------------------------------------------- Built-in server
def make_handler(directory):
    """リポジトリ直下の serve.py（クリーンURL）を再利用。無ければ同等の最小実装で代替"""
    base_cls = SimpleHTTPRequestHandler
    if os.path.isfile(os.path.join(directory, "serve.py")):
        try:
            sys.path.insert(0, directory)
            import serve  # noqa: E402  (BizManga/serve.py)
            base_cls = serve.CleanURLHandler
        except Exception:
            base_cls = SimpleHTTPRequestHandler
        finally:
            if sys.path and sys.path[0] == directory:
                sys.path.pop(0)

    class Handler(base_cls):
        def translate_path(self, path):
            full = super().translate_path(path)
            # serve.py が無いときの保険: /foo → foo.html（ディレクトリより .html を優先）
            if not os.path.exists(full) and not os.path.splitext(full)[1] and os.path.isfile(full + ".html"):
                return full + ".html"
            return full

        def list_directory(self, path):
            # GitHub Pages はディレクトリ一覧を出さない（index.html が無ければ 404）
            self.send_error(404, "Not Found")
            return None

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def log_message(self, *a):
            pass

    return Handler


def start_server(directory, port):
    handler = partial(make_handler(directory), directory=directory)
    httpd = ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


# ---------------------------------------------------------------- API
def check_api(api):
    data = {"works": [], "works_new": [], "library": [], "manga_one": None, "api": api}
    try:
        works = get_json(f"{api}/works?site=bizmanga")
        data["works"] = works if isinstance(works, list) else []
        rec("API /works?site=bizmanga 件数>0", len(data["works"]) > 0, f"{len(data['works'])}件")
        bad = [w.get("id") for w in data["works"]
               if not (w.get("id") and isinstance(w.get("gallery"), list) and w["gallery"]
                       and w.get("view_type") and w.get("thumbnail"))]
        rec("API /works 各作品に id/gallery/view_type/thumbnail", not bad, f"欠落: {bad[:5]}" if bad else "")
        vts = sorted({str(w.get("view_type")) for w in data["works"]})
        rec("API /works view_type が既知の値", set(vts) <= {"spread", "vertical", "vertical_only"}, ", ".join(vts))
    except Exception as e:
        rec("API /works?site=bizmanga", False, str(e)[:140])

    try:
        new = get_json(f"{api}/works-new?site=bizmanga")
        data["works_new"] = new if isinstance(new, list) else []
        rec("API /works-new?site=bizmanga 件数>0", len(data["works_new"]) > 0, f"{len(data['works_new'])}件")
    except Exception as e:
        rec("API /works-new?site=bizmanga", False, str(e)[:140])

    try:
        lib = get_json(f"{api}/library")
        data["library"] = lib if isinstance(lib, list) else []
        rec("API /library 件数>0", len(data["library"]) > 0, f"{len(data['library'])}件")
        bad = [w.get("id") for w in data["library"]
               if not (w.get("id") and isinstance(w.get("gallery"), list) and w["gallery"])]
        rec("API /library 各作品に gallery あり", not bad, f"欠落: {bad[:5]}" if bad else "")
    except Exception as e:
        rec("API /library", False, str(e)[:140])

    first = data["library"][0] if data["library"] else None
    if first and first.get("id"):
        try:
            one = get_json(f"{api}/manga/{first['id']}")
            data["manga_one"] = one
            n_lib = len(first.get("gallery") or [])
            n_one = len(one.get("gallery") or []) if isinstance(one, dict) else -1
            rec(f"API /manga/{first['id']} の枚数が /library と一致", n_lib == n_one, f"library={n_lib} manga={n_one}")
            imgs = [img_url(x) for x in (one.get("gallery") or [])[:2]] if isinstance(one, dict) else []
            ok = bool(imgs) and all(url_ok(u) for u in imgs)
            rec("API gallery 画像URLが到達可能（先頭2枚）", ok, "" if ok else ", ".join(imgs)[:200])
        except Exception as e:
            rec(f"API /manga/{first['id']}", False, str(e)[:140])

    for ep in ("/news?site=bizmanga&per_page=50", "/columns?site=bizmanga&per_page=50"):
        try:
            d = get_json(api + ep)
            n = len(d) if isinstance(d, list) else -1
            rec(f"API {ep.split('?')[0]} 件数>0", n > 0, f"{n}件")
        except Exception as e:
            rec(f"API {ep}", False, str(e)[:140])
    return data


# ビズ書庫の手書きの作品データ（window.BM_FALLBACK_WORKS。works.js の FALLBACK_WORKS と埋込ビューアが使う）
FALLBACK_JS = "js/bm-fallback-works.js"


def pick_wp_only_id(base, lib):
    """手書きデータ（FALLBACK_JS）に無い作品IDを選ぶ（WP 接続が生きていないと開けない作品）"""
    ids = [w["id"] for w in lib if w.get("id")]
    if not ids:
        return None, "library が空"
    try:
        fallback = set(fallback_works_hand(get_text(f"{base}/{FALLBACK_JS}")))
    except Exception as e:
        return ids[0], f"{FALLBACK_JS} を取得できず先頭を使用（{str(e)[:60]}）"
    for i in ids:
        if i not in fallback:
            return i, "FALLBACK_WORKS に無い作品"
    return ids[0], "全作品が FALLBACK_WORKS にあるため先頭を使用（WP 接続の確認としては弱い）"


def fallback_works_hand(src):
    """手書きデータ（FALLBACK_JS の window.BM_FALLBACK_WORKS）の {作品ID: 手書きのページ数}。
    例: ['seko','瀬古恭介 始まりのものがたり',25,'ブランド','spread'] → {'seko': 25}"""
    return {m.group(1): int(m.group(2))
            for m in re.finditer(r"\[\s*'([a-z0-9-]+)'\s*,\s*'(?:[^'\\]|\\.)*'\s*,\s*(\d+)\s*,", src)}


def fallback_works_vertical(src):
    """手書きデータのうち縦読み専用（'vertical_only'）の作品ID"""
    return [m.group(1) for m in re.finditer(
        r"\[\s*'([a-z0-9-]+)'\s*,\s*'(?:[^'\\]|\\.)*'\s*,\s*\d+\s*,\s*'[^']*'\s*,\s*'vertical_only'\s*\]", src)]


def pick_fallback_id(base, lib):
    """手書きデータ（FALLBACK_JS）に**ある**作品を選ぶ（QR直リンクが手書きデータではなく WP のデータで開くかの確認用）。
    手書きデータで開くと1枚目が素材フォルダの画像になり、最終ページCTA も出ないので、WP のギャラリーがある（1枚目の画像で
    見分けられる）→ 最終ページCTA が有効 → 手書きのページ数と WP のギャラリー枚数が違う、の順に優先する（手書きデータの
    ページ数は素材フォルダの枚数なので、WP のギャラリーの方が多い作品もある）。
    戻り値: (作品ID, 手書きのページ数, 理由)"""
    try:
        src = get_text(f"{base}/{FALLBACK_JS}")
    except Exception as e:
        return None, None, f"{FALLBACK_JS} を取得できない（{str(e)[:60]}）"
    hand = fallback_works_hand(src)
    both = [w for w in lib if w.get("id") in hand]
    if not both:
        return None, None, "FALLBACK_WORKS と /library の両方にある作品が無い"

    def rank(w):
        differs = len(w.get("gallery") or []) != hand[w["id"]]
        return (0 if w.get("gallery") else 1, 0 if w.get("cta_enabled") else 1, 0 if differs else 1)

    w = sorted(both, key=rank)[0]
    differs = len(w.get("gallery") or []) != hand[w["id"]]
    why = ("WP のギャラリーあり（1枚目の画像で見分けられる）" if w.get("gallery") else "WP のギャラリーなし（見分けとしては弱い）") + \
          ("・CTA 有効" if w.get("cta_enabled") else "") + \
          ("・手書きと WP のページ数が違う" if differs else "")
    return w["id"], hand[w["id"]], why


# ------------------------------------------------------------- Browser
# ホーム/制作事例: bm-wp-api.js は 1段目(/works)で bm-data-ready、2段目(/works-new 等)完了で bm-all-data-ready を出す。
# ホームのギャラリーは /works-new を使うので、全データ到着まで待つ
WAIT_ALL = """() => new Promise(res => {
  if (window.BM_NEW_WORKS_DATA) return res('already');
  const t = setTimeout(() => res('timeout'), 25000);
  window.addEventListener('bm-all-data-ready', () => { clearTimeout(t); res('event'); }, { once: true });
})"""

IMG_LOADED = """sel => {
  const imgs = [...document.querySelectorAll(sel)];
  return imgs.some(i => i.complete && i.naturalWidth > 0);
}"""

# ビズ書庫ビューアの表示状態（ページ表示・1枚目の画像・最終ページCTA の設定先）
VIEWER_STATE = """() => {
  const m = document.getElementById('mangaModal');
  const spread = m.classList.contains('mode-spread');
  const first = spread ? document.getElementById('imgRight') : document.querySelector('#modalManga img');
  return { page: (document.getElementById('modalPage') || {}).textContent || '', spread: spread,
           first: first ? first.getAttribute('src') : null,
           cta: (typeof currentCtaData !== 'undefined' && currentCtaData) ? currentCtaData.client_url : null };
}"""

LIBRARY_URL_RE = re.compile(r"/wp-json/contentsx/v1/library(?:[?#]|$)")
WP_API_PATH = "/wp-json/contentsx/v1/"


def watch_library(pg):
    """このページの /library の応答を集める（goto より前に呼ぶ。読み込み中に届いた応答も逃さない）"""
    box = []
    pg.on("response", lambda r: box.append(r) if LIBRARY_URL_RE.search(r.url) else None)
    return box


def wait_library_ok(pg, box, timeout_ms=25000):
    """/library の 200 の応答が届き、本文を受け取り終えるまで待つ。戻り値: (届いたか, 説明)"""
    waited = 0
    while waited < timeout_ms:
        ok = [r for r in box if r.status == 200]
        if ok:
            try:
                ok[0].finished()  # 本文の受信完了まで
            except Exception:
                pass
            return True, f"HTTP 200（{waited}ms 待った）"
        pg.wait_for_timeout(100)
        waited += 100
    return False, (f"{timeout_ms}ms 以内に 200 が届かない（届いた応答: " +
                   (", ".join(str(r.status) for r in box) or "無し") + "）")


# 読み込みを試みた（complete）のに幅ゼロ＝壊れている画像。未着手の lazy 画像は数えない
BROKEN_IMGS = """sel => [...document.querySelectorAll(sel)]
  .filter(i => i.complete && i.getAttribute('src') && i.naturalWidth === 0)
  .map(i => i.currentSrc || i.src).slice(0, 5)"""


class PageProbe:
    """1ページぶんのエラー・404の記録。
    expected_api_failures=True: WP API の応答をわざと 4xx/5xx にしたページ用。その応答に対してブラウザが出す読込失敗のログ
    （"Failed to load resource" で、場所が WP API の URL）と、WP API の 4xx/5xx を数えない。console.error・未捕捉の例外・
    サイト/素材の 404 は他のページと同じく数える"""

    def __init__(self, ctx, host, local_http=False, expected_api_failures=False, **kw):
        self.page = ctx.new_page(**kw)
        self.host = host
        self.local_http = local_http
        self.expected_api_failures = expected_api_failures
        self.errors, self.bad = [], []
        self.page.on("pageerror", lambda e: self.errors.append("pageerror: " + str(e)[:160]))
        self.page.on("console", self._on_console)
        self.page.on("response", self._on_response)

    def _watched(self, url):
        h = urlparse(url).netloc
        return bool(h) and (h == self.host or h.endswith(WATCH_HOST_SUFFIXES))

    def _on_console(self, m):
        if m.type != "error":
            return
        loc = (m.location or {}).get("url", "") if isinstance(m.location, dict) else ""
        text = m.text
        # http 配信のときだけ: 127.0.0.1 の埋込 iframe に対する CSP frame-src 違反は配信方式の差なので無視
        if self.local_http and "Content Security Policy" in text and ("127.0.0.1" in text or "localhost" in text):
            return
        # わざと 4xx/5xx にした WP API の応答に対する、ブラウザの読込失敗のログ（JS の console.error ではない）
        if self.expected_api_failures and text.startswith("Failed to load resource") and WP_API_PATH in loc:
            return
        # 自サイト・WP・素材ホスト起因（または場所不明）のエラーだけ数える。GA/Clarity/HubSpot 等は無視
        if (not loc) or self._watched(loc):
            self.errors.append("console: " + text[:160])

    def _on_response(self, r):
        if self.expected_api_failures and WP_API_PATH in r.url:
            return
        if self._watched(r.url) and r.status >= 400:
            self.bad.append(f"{r.status} {r.url}")

    def finish(self, label):
        rec(f"{label}: JSエラー無し", not self.errors, "; ".join(self.errors)[:300])
        rec(f"{label}: サイト/WP/素材への 404 無し" + ("（わざと失敗させた WP API の応答を除く）" if self.expected_api_failures else ""),
            not self.bad, "; ".join(self.bad)[:300])
        try:
            self.page.close()
        except Exception:
            pass


def check_browser(base, data):
    import logging
    from playwright.sync_api import sync_playwright
    # コンテキストを閉じた後に届いた中継の残りを asyncio が ERROR ログ（Traceback）として吐くが判定には無関係
    logging.getLogger("asyncio").setLevel(logging.CRITICAL)

    parsed = urlparse(base)
    host = parsed.netloc
    local_http = parsed.scheme == "http"
    use_relay = local_http and base not in CORS_ALLOWED_LOCAL_ORIGINS
    lib = data.get("library") or []
    n_new = len(data.get("works_new") or [])
    wp_id, why = pick_wp_only_id(base, lib)
    print(f"== ブラウザ: {base}  CORS: {'中継（ACAO付与。CORS設定そのものは検証しない）' if use_relay else '実際の許可オリジンのまま'}  検証作品: {wp_id}（{why}）", flush=True)

    def relay_cors(route, request):
        try:
            resp = route.fetch()
            headers = dict(resp.headers)
            headers["access-control-allow-origin"] = "*"
            route.fulfill(response=resp, headers=headers)
        except Exception:
            try:
                route.abort()
            except Exception:
                pass

    def new_ctx(browser, **kw):
        ctx = browser.new_context(**kw)
        if use_relay:
            ctx.route("https://cms.contentsx.jp/**", relay_cors)
        return ctx

    def close_ctx(ctx):
        try:
            ctx.unroute_all(behavior="ignoreErrors")
        except Exception:
            pass
        try:
            ctx.close()
        except Exception:
            pass

    def probe(ctx):
        return PageProbe(ctx, host, local_http=local_http)

    site = {}

    def site_api():
        """ブラウザ（js/works.js）が実際に使う WP API の場所と、そこから取った /library。
        QR直リンクの確認項目の期待値はここから取る（--api は Python 側の API 確認用で、ブラウザとずれうるため）。
        戻り値: (API の場所, /library の配列, 取れなかった理由)。取れなかったときは最初の1回だけ FAIL を記録し、
        API の場所か /library が None になる（呼び出し側は理由つきで飛ばす。2回目以降は同じ結果を返す）"""
        if "done" not in site:
            site["done"] = True
            site["api"], site["library"], site["why"] = None, None, None
            api_b = None
            try:
                ctx = new_ctx(browser, viewport={"width": 1440, "height": 900})
                pg = ctx.new_page()
                try:
                    pg.goto(f"{base}/biz-library.html", wait_until="domcontentloaded")
                    api_b = pg.evaluate("() => (typeof WP_API_BASE === 'string') ? WP_API_BASE : null")
                finally:
                    close_ctx(ctx)
            except Exception as e:
                site["why"] = f"ビズ書庫を開けない（{type(e).__name__}: {str(e)[:100]}）"
            rec("ブラウザの WP API の場所（works.js の WP_API_BASE）を読める", bool(api_b), str(api_b if api_b else site["why"]))
            if not api_b:
                site["why"] = site["why"] or "WP_API_BASE を読めない"
                return None, None, site["why"]
            site["api"] = api_b
            try:
                lib_b = get_json(f"{api_b}/library")
                if not isinstance(lib_b, list):
                    raise ValueError(f"配列でない応答（{type(lib_b).__name__}）")
                site["library"] = lib_b
                rec("ブラウザの WP API から /library を取得できる（QR直リンクの期待値）", True, f"{len(lib_b)}件")
            except Exception as e:
                site["why"] = f"{api_b}/library を取得できない（{type(e).__name__}: {str(e)[:100]}）"
                rec("ブラウザの WP API から /library を取得できる（QR直リンクの期待値）", False, site["why"])
        return site["api"], site["library"], site["why"]

    def section(label, fn):
        """区画ごとに例外を隔離: 途中で落ちても残りを続け、落ちた区画は FAIL として残す"""
        try:
            fn()
        except Exception as e:
            rec(f"{label}: 検証が例外で中断", False, f"{type(e).__name__}: {str(e)[:200]}")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        desktop = new_ctx(browser, viewport={"width": 1440, "height": 900})

        def home():
            pr = probe(desktop)
            pg = pr.page
            pg.goto(f"{base}/index.html", wait_until="load")
            how = pg.evaluate(WAIT_ALL)
            pg.wait_for_timeout(800)
            hero = pg.locator("#bmHeroWorksBg .bm-hero-works-cover").count()
            rec("ホーム: Hero マーキーに表紙がある", hero > 0, f"{hero}枚 (data:{how})")
            cards = pg.locator(".bm-gallery-card").count()
            # ページ本体（js/bm-home.js）と同じ計算: /works-new を 横読み/縦読み に分け、各グループ MAX_PER_GROUP(10) 件まで
            calc = pg.evaluate("""() => {
              const d = window.BM_NEW_WORKS_DATA || [];
              const isV = x => !!(window.bmViewType && window.bmViewType.isForcedVertical(x));
              const v = d.filter(isV).length, m = d.length - v;
              return { got: d.length, expected: Math.min(10, m) + Math.min(10, v), manga: m, vertical: v };
            }""")
            rec("ホーム: /works-new をブラウザでも同じ件数で受信（フォールバックしていない）", calc["got"] == n_new and n_new > 0, f"ブラウザ={calc['got']} API={n_new}")
            rec("ホーム: ギャラリーのカード数が仕様どおり（横読み/縦読み 各10件まで）", cards == calc["expected"] and cards > 0,
                f"画面={cards} 期待={calc['expected']}（横読み{calc['manga']}件・縦読み{calc['vertical']}件）")
            if not use_relay:
                rec("ホーム: WP API を実際の CORS 許可設定のまま取得できた", calc["got"] == n_new and n_new > 0, base)
            if cards:
                pg.locator(".bm-gallery-card").first.scroll_into_view_if_needed()
                pg.locator(".bm-gallery-card").first.click()
                try:
                    pg.wait_for_url("**/biz-library?manga=*", timeout=10000)
                    rec("ホーム: ギャラリーカードのクリックで biz-library?manga= へ遷移", True, pg.url.split("/")[-1])
                except Exception:
                    rec("ホーム: ギャラリーカードのクリックで biz-library?manga= へ遷移", False, pg.url)
            pr.finish("ホーム")

        def works():
            pr = probe(desktop)
            pg = pr.page
            pg.goto(f"{base}/works.html", wait_until="load")
            pg.evaluate(WAIT_ALL)
            pg.wait_for_timeout(800)
            sel = "#bmWorksGrid .bm-works-card, #bmWorksGrid [data-build-static]"
            n_cards = pg.locator(sel).count()
            rec("制作事例: カードが表示される", n_cards > 0, f"{n_cards}件")
            if n_cards:
                card = pg.locator(sel).first
                card.scroll_into_view_if_needed()
                card.click()
                try:
                    pg.wait_for_selector("#workDetailOverlay.active", timeout=10000)
                    opened = True
                except Exception:
                    opened = False
                rec("制作事例: カードクリックでモーダルが開く", opened)
                if opened:
                    try:
                        pg.wait_for_function(IMG_LOADED, arg="#workDetailCarousel img", timeout=20000)
                        rec("制作事例: モーダル内の漫画画像が読み込まれる", True)
                    except Exception:
                        rec("制作事例: モーダル内の漫画画像が読み込まれる", False, "20秒以内に naturalWidth>0 の画像が無い")
                    pg.wait_for_timeout(1500)
                    broken = pg.evaluate(BROKEN_IMGS, "#workDetailCarousel img")
                    rec("制作事例: モーダル内に読み込み失敗の画像が無い", not broken, "; ".join(broken)[:300])
                    pg.locator("#workDetailClose").click()
                    pg.wait_for_timeout(500)
                    rec("制作事例: モーダルを閉じられる", pg.locator("#workDetailOverlay.active").count() == 0)
            pr.finish("制作事例")

        def library():
            pr = probe(desktop)
            pg = pr.page
            pg.goto(f"{base}/biz-library.html", wait_until="load")
            # works.js は自前で /library を取得し BM_* グローバルもイベントも出さないので、カード数の到達で待つ
            try:
                pg.wait_for_function("n => document.querySelectorAll('#worksGrid > *').length === n", arg=len(lib), timeout=25000)
            except Exception:
                pass
            n_grid = pg.locator("#worksGrid > *").count()
            rec("ビズ書庫: グリッドの作品数が /library と一致（全カードが DOM にある）", n_grid == len(lib) and n_grid > 0, f"画面={n_grid} API={len(lib)}")
            # 手書きデータ（FALLBACK_WORKS）には /library にある作品だけを載せる。非公開にした作品・ビズ書庫に出さない作品が
            # 残ると、WP が届くまで（/library が失敗・0件ならその間ずっと）一覧に出て、素材フォルダの画像で開ける（BUGS #085）
            try:
                hand_ids = set(fallback_works_hand(get_text(f"{base}/{FALLBACK_JS}")))
                extra = sorted(hand_ids - {w.get("id") for w in lib})
                rec("ビズ書庫: 手書きデータの作品はすべて /library にある（非公開にした作品が残っていない）",
                    bool(hand_ids) and not extra, f"/library に無い={extra}" if extra else f"手書き={len(hand_ids)}件")
            except Exception as e:
                rec("ビズ書庫: 手書きデータの作品はすべて /library にある（非公開にした作品が残っていない）", False, str(e)[:120])
            if n_grid:
                pg.locator("#worksGrid > *").first.click()
                try:
                    pg.wait_for_selector("#mangaModal", state="visible", timeout=10000)
                    opened = True
                except Exception:
                    opened = False
                rec("ビズ書庫: クリックでビューアが開く", opened)
                if opened:
                    try:
                        pg.wait_for_function(IMG_LOADED, arg="#mangaModal img", timeout=20000)
                        rec("ビズ書庫: ビューアの漫画画像が読み込まれる", True)
                    except Exception:
                        rec("ビズ書庫: ビューアの漫画画像が読み込まれる", False, "20秒以内に画像が読み込まれない")
                    pg.wait_for_timeout(1500)
                    broken = pg.evaluate(BROKEN_IMGS, "#mangaModal img")
                    rec("ビズ書庫: ビューア内に読み込み失敗の画像が無い", not broken, "; ".join(broken)[:300])
                    qr = pg.evaluate("() => document.documentElement.classList.contains('qr-mode')")
                    rec("ビズ書庫: サイト内クリックでは qr-mode にならない", not qr)
                    pg.locator("#modalClose").click()
                    pg.wait_for_timeout(600)
                    rec("ビズ書庫: ビューアを閉じられる", not pg.locator("#mangaModal").is_visible())
            pr.finish("ビズ書庫")

        def library_without_wp():
            """WP の /library が届かないとき、ビズ書庫の一覧は手書きデータ（FALLBACK_JS）の作品をすべて出す
            （bm-fallback-works.js の読込順が崩れると一覧が黙って空になるので、件数で確かめる）"""
            try:
                n_hand = len(fallback_works_hand(get_text(f"{base}/{FALLBACK_JS}")))
            except Exception:
                n_hand = 0
            ctx = new_ctx(browser, viewport={"width": 1440, "height": 900})
            try:
                ctx.route("**/wp-json/contentsx/v1/library*", lambda route: route.abort())
                pr2 = PageProbe(ctx, host, local_http=local_http, expected_api_failures=True)
                pg = pr2.page
                pg.goto(f"{base}/biz-library.html", wait_until="domcontentloaded")
                try:
                    pg.wait_for_function("n => document.querySelectorAll('#worksGrid > *').length === n", arg=n_hand, timeout=15000)
                except Exception:
                    pass
                n_grid = pg.locator("#worksGrid > *").count()
                rec("ビズ書庫(WP が届かない): 一覧に手書きデータの作品がすべて出る", n_hand > 0 and n_grid == n_hand, f"画面={n_grid} 手書き={n_hand}")
                pr2.finish("ビズ書庫(WP が届かない)")
            finally:
                close_ctx(ctx)

        def qr_direct():
            qr_ctx = new_ctx(browser, viewport={"width": 1440, "height": 900})
            pr = probe(qr_ctx)
            pg = pr.page
            pg.goto(f"{base}/biz-library.html?manga={wp_id}", wait_until="load")
            try:
                pg.wait_for_selector("#mangaModal", state="visible", timeout=15000)
                pg.wait_for_function(IMG_LOADED, arg="#mangaModal img", timeout=20000)
                rec(f"QR直リンク ?manga={wp_id}: ビューアが自動で開き画像が出る", True)
            except Exception:
                rec(f"QR直リンク ?manga={wp_id}: ビューアが自動で開き画像が出る", False)
            qr = pg.evaluate("() => document.documentElement.classList.contains('qr-mode')")
            rec("QR直リンク: referrer 無しなら qr-mode になる（BUGS #010）", qr)
            pr.finish("QR直リンク")
            close_ctx(qr_ctx)

        def qr_fallback_work():
            """手書きデータ（FALLBACK_WORKS）にある作品の QR直リンクも、WP のデータで開く（Issue #71）。
            期待値はブラウザと同じ API（works.js の WP_API_BASE）から取る"""
            api_b, lib_b, why = site_api()
            if lib_b is None:
                skip("QR直リンク(手書きデータにある作品)", why)
                return
            fb_id, hand_pages, fb_why = pick_fallback_id(base, lib_b)
            label = f"QR直リンク(手書きデータにある作品) ?manga={fb_id}"
            if not fb_id:
                rec("QR直リンク(手書きデータにある作品): 検証する作品を選べる", False, fb_why)
                return
            print(f"   手書きデータにある作品: {fb_id}（手書き {hand_pages}P・{fb_why}）", flush=True)
            one = get_json(f"{api_b}/manga/{fb_id}")
            gallery = [img_url(x) for x in (one.get("gallery") or [])]
            n_wp = len(gallery) or int(one.get("pages") or 0)
            cta_url = (one.get("client_url") or "").strip()
            want_cta = bool(one.get("cta_enabled")) and bool(re.match(r"^https?://", cta_url, re.I))
            ctx = new_ctx(browser, viewport={"width": 1440, "height": 900})
            pr = probe(ctx)
            pg = pr.page
            lib_box = watch_library(pg)
            pg.goto(f"{base}/biz-library.html?manga={fb_id}", wait_until="load")
            try:
                pg.wait_for_selector("#mangaModal", state="visible", timeout=15000)
                pg.wait_for_function(IMG_LOADED, arg="#mangaModal img", timeout=20000)
                opened = True
            except Exception:
                opened = False
            rec(f"{label}: ビューアが自動で開き画像が出る", opened)
            if opened:
                # /library の到着後も開き直されず WP のデータのままであることを見るため、/library の応答（ネットワーク）を待つ。
                # 直リンクでは一覧（#worksGrid）を作らないので、グリッドの作品数では待てない
                lib_ok, lib_why = wait_library_ok(pg, lib_box)
                rec(f"{label}: /library の応答が届く（届いた後もそのまま WP のデータで表示されているかを見る前提）", lib_ok, lib_why)
                pg.wait_for_timeout(1000)
                st = pg.evaluate(VIEWER_STATE)
                rec(f"{label}: ページ数が WP（/manga/{{id}} のギャラリー枚数）どおり", st["page"].endswith(f"/ {n_wp}") and n_wp > 0,
                    f"表示={st['page']} WP={n_wp}P 手書き={hand_pages}P")
                if gallery:
                    rec(f"{label}: 1枚目が WP のギャラリーの画像", st["first"] == gallery[0], f"表示={str(st['first'])[-60:]}")
                rec(f"{label}: 最終ページCTA の設定が WP の cta_enabled どおり",
                    ((st["cta"] or "").strip() == cta_url) if want_cta else (st["cta"] is None),
                    f"WP: cta_enabled={bool(one.get('cta_enabled'))} → 期待={'有' if want_cta else '無'} / 画面の設定={st['cta'] or '無'}")
                # 最終ページへ進めて、CTA が実際に出る（出ない）ことを見る
                if st["spread"]:
                    pg.evaluate("""() => { const s = document.getElementById('navScrubber');
                        s.value = s.max; s.dispatchEvent(new Event('input', { bubbles: true })); }""")
                else:
                    pg.evaluate("() => { const m = document.getElementById('mangaModal'); m.scrollTop = m.scrollHeight; }")
                    pg.wait_for_timeout(300)
                    pg.evaluate("() => { const m = document.getElementById('mangaModal'); m.scrollTop = m.scrollHeight; m.dispatchEvent(new Event('scroll')); }")
                pg.wait_for_timeout(1500)
                shown = pg.evaluate("""() => { const o = document.getElementById('mangaCtaOverlay');
                    return !!(o && !o.hidden && o.classList.contains('visible')); }""")
                rec(f"{label}: 最終ページで CTA が{'出る' if want_cta else '出ない'}", shown == want_cta, f"表示={'有' if shown else '無'}")
            pr.finish("QR直リンク(手書きデータにある作品)")
            close_ctx(ctx)

            # /library を止めても（データの出どころが /manga/{id} だけでも）WP のページ数・CTA で開く。
            # 手書きデータで先に開いて /library の到着で開き直す形（Issue #71 の原因）に戻ると、ここが手書きのページ数になる。
            # /library を止めたことによる読込失敗のログは出るので、このページは JSエラー・404 の集計に入れない
            ctx2 = new_ctx(browser, viewport={"width": 1440, "height": 900})
            ctx2.route("**/wp-json/contentsx/v1/library*", lambda route: route.abort())
            pg2 = ctx2.new_page()
            pg2.goto(f"{base}/biz-library.html?manga={fb_id}", wait_until="load")
            try:
                pg2.wait_for_selector("#mangaModal", state="visible", timeout=15000)
                pg2.wait_for_function(IMG_LOADED, arg="#mangaModal img", timeout=20000)
                pg2.wait_for_timeout(1500)
                st2 = pg2.evaluate(VIEWER_STATE)
            except Exception as e:
                st2 = {"page": f"開かない（{type(e).__name__}）", "cta": None}
            cta_ok = ((st2["cta"] or "").strip() == cta_url) if want_cta else (st2["cta"] is None)
            rec(f"{label}: /library を止めても /manga/{{id}} のデータ（WP のページ数・CTA）で開く",
                st2["page"].endswith(f"/ {n_wp}") and n_wp > 0 and cta_ok,
                f"表示={st2['page']} WP={n_wp}P 手書き={hand_pages}P / CTA の設定={'有' if st2['cta'] else '無'}（期待={'有' if want_cta else '無'}）")
            close_ctx(ctx2)

        def qr_branches():
            """QR直リンクの分岐（Issue #71。2026-10-15 方針）。API の応答はブラウザ側で差し替える（本番の WP は変えない）。
            ① /manga/{id} がプラグインの「作品が無い」404 で /library にも無い → 「作品が見つかりませんでした」
              （手書きデータにある作品でも開かない）
            ② 存在しない ID（差し替えなし・実際の API）→ 「作品が見つかりませんでした」
            ③ WP が止まっている（/manga/{id} と /library が 503）→ 「表示に時間がかかっています」と再読み込みボタンが出て、
              手書きデータ（FALLBACK_WORKS）では開かない。WP が戻る（/manga/{id} が応答する）と WP のデータで開く
            API の 4xx/5xx はわざと起こしているので、その応答（と、それに対するブラウザの読込失敗のログ）だけは数えず、
            JS のエラー（未捕捉の例外・console.error）とサイト/素材の 404 は他の区画と同じく PageProbe で見る"""
            api_b, lib_b, why = site_api()
            if lib_b is None:
                skip("QR直リンクの分岐(作品が無い・WP 停止)", why)
                return
            fb_id, hand_pages, fb_why = pick_fallback_id(base, lib_b)
            if not fb_id:
                rec("QR直リンクの分岐: 検証する作品（手書きデータにある作品）を選べる", False, fb_why)
                return
            missing_id = "bm-smoke-no-such-work"
            st404, body404 = get_status_json(f"{api_b}/manga/{missing_id}")
            plugin_shape = (st404 == 404 and isinstance(body404, dict) and isinstance(body404.get("error"), str)
                            and "code" not in body404)
            rec("API /manga/{存在しない ID} がプラグインの「作品が無い」404（本文に error があり code が無い）",
                plugin_shape, f"HTTP {st404} {json.dumps(body404, ensure_ascii=False)[:120]}")
            if not plugin_shape:
                return
            json_headers = {"content-type": "application/json; charset=UTF-8", "access-control-allow-origin": "*"}
            NOT_FOUND = "() => document.body.textContent.indexOf('作品が見つかりませんでした') !== -1"

            def open_page(routes, mid):
                ctx = new_ctx(browser, viewport={"width": 1440, "height": 900})
                for pattern, handler in routes:
                    ctx.route(pattern, handler)
                pr = PageProbe(ctx, host, local_http=local_http, expected_api_failures=True)
                pr.page.goto(f"{base}/biz-library.html?manga={mid}", wait_until="domcontentloaded")
                return ctx, pr

            # ① プラグインの 404（実物の本文）・/library からもその作品を外す
            lib_without = [w for w in lib_b if w.get("id") != fb_id]
            ctx, pr = open_page([
                ("**/wp-json/contentsx/v1/manga/**",
                 lambda route: route.fulfill(status=404, headers=json_headers, body=json.dumps(body404))),
                ("**/wp-json/contentsx/v1/library*",
                 lambda route: route.fulfill(status=200, headers=json_headers, body=json.dumps(lib_without, ensure_ascii=False))),
            ], fb_id)
            pg = pr.page
            try:
                pg.wait_for_function(NOT_FOUND, timeout=15000)
                nf = True
            except Exception:
                nf = False
            opened = pg.evaluate("() => { const m = document.getElementById('mangaModal'); return !!(m && m.classList.contains('open')); }")
            rec(f"QR直リンク ?manga={fb_id}: WP が「作品が無い」と答え /library にも無ければ「作品が見つかりませんでした」（手書きデータで開かない）",
                nf and not opened, f"見つかりません={'有' if nf else '無'} ビューア={'開いた' if opened else '無'}")
            pr.finish("QR直リンク(「作品が無い」)")
            close_ctx(ctx)

            # ② 存在しない ID（実際の API。差し替えなし）
            ctx, pr = open_page([], missing_id)
            pg = pr.page
            try:
                pg.wait_for_function(NOT_FOUND, timeout=15000)
                nf = True
            except Exception:
                nf = False
            link = pg.evaluate("() => { const a = document.querySelector('body > div > a'); return a ? a.getAttribute('href') : null; }") if nf else None
            rec(f"QR直リンク ?manga={missing_id}（存在しない ID）: 「作品が見つかりませんでした」とトップへのリンク",
                nf and link == "/", f"見つかりません={'有' if nf else '無'} リンク={link}")
            pr.finish("QR直リンク(存在しない ID)")
            close_ctx(ctx)

            # ③ WP が止まっている（/manga/{id}・/library とも 503）→ 「表示に時間がかかっています」と再読み込みボタン。
            #   手書きデータでは開かない。その後 WP が戻ると（/manga/{id} を取り直したときに応答する）WP のデータで開く
            wp_state = {"down": True}
            one = get_json(f"{api_b}/manga/{fb_id}")  # WP が戻った後の期待値（ブラウザと同じ API）
            n_wp = len(one.get("gallery") or []) or int(one.get("pages") or 0)
            wp_first = img_url((one.get("gallery") or [None])[0]) if one.get("gallery") else None

            def down_or_through(route):
                if wp_state["down"]:
                    route.fulfill(status=503, headers=json_headers, body='{"code":"service_unavailable"}')
                else:
                    route.fallback()  # 実際の API へ（別ポートのときは CORS の中継へ）
            ctx, pr = open_page([
                ("**/wp-json/contentsx/v1/manga/**", down_or_through),
                ("**/wp-json/contentsx/v1/library*", down_or_through),
            ], fb_id)
            pg = pr.page
            label3 = f"QR直リンク ?manga={fb_id}: WP が止まっている（/manga/{{id}}・/library が 503）とき"
            try:
                pg.wait_for_selector(".bm-direct-stalled", state="visible", timeout=12000)
                stalled = pg.evaluate("""() => { const s = document.querySelector('.bm-direct-stalled');
                    const b = s && s.querySelector('button');
                    return { text: s && s.querySelector('p') ? s.querySelector('p').textContent : '', button: b ? b.textContent : null,
                             open: document.getElementById('mangaModal').classList.contains('open') }; }""")
            except Exception as e:
                stalled = {"text": f"出ない（{type(e).__name__}）", "button": None, "open": None}
            rec(f"{label3}は「表示に時間がかかっています」と再読み込みボタンが出て、手書きデータでは開かない",
                "表示に時間がかかっています" in stalled["text"] and stalled["button"] == "再読み込み" and stalled["open"] is False,
                f"メッセージ={stalled['text'][:40]} ボタン={stalled['button']} ビューア={'開いた' if stalled['open'] else '無'}")
            wp_state["down"] = False
            try:
                pg.wait_for_selector("#mangaModal", state="visible", timeout=40000)
                pg.wait_for_function(IMG_LOADED, arg="#mangaModal img", timeout=20000)
                pg.wait_for_timeout(1000)
                st3 = pg.evaluate(VIEWER_STATE)
                st3["stalled"] = pg.locator(".bm-direct-stalled").count()
            except Exception as e:
                st3 = {"page": f"開かない（{type(e).__name__}）", "first": None, "stalled": None}
            rec(f"{label3}、WP が戻ると WP のデータ（ページ数・画像）で開き、メッセージが消える",
                st3["page"].endswith(f"/ {n_wp}") and n_wp > 0 and (wp_first is None or st3.get("first") == wp_first) and st3.get("stalled") == 0,
                f"表示={st3['page']} WP={n_wp}P 手書き={hand_pages}P / 1枚目={str(st3.get('first'))[-50:]}")
            pr.finish("QR直リンク(WP 停止→復旧)")
            close_ctx(ctx)

        def internal_nav():
            pr = probe(desktop)
            pg = pr.page
            pg.goto(f"{base}/biz-library.html?manga={wp_id}", wait_until="load", referer=f"{base}/index.html")
            pg.wait_for_timeout(1500)
            qr = pg.evaluate("() => document.documentElement.classList.contains('qr-mode')")
            rec("サイト内遷移 ?manga=: referrer ありなら qr-mode にならない", not qr)
            pr.finish("サイト内遷移")

        def embed():
            pr = probe(desktop)
            pg = pr.page
            pg.goto(f"{base}/embed-viewer.html?manga={wp_id}&manual=1", wait_until="load")
            try:
                pg.wait_for_function(IMG_LOADED, arg="#viewer img", timeout=20000)
                rec("埋込ビューア embed-viewer?manga=&manual=1: 画像が出る", True)
            except Exception:
                rec("埋込ビューア embed-viewer?manga=&manual=1: 画像が出る", False)
            pr.finish("埋込ビューア")

        def embed_wp_down():
            """埋込ビューアの WP 障害時の表示（WP の応答はブラウザ側で差し替えるので、WP の状態に左右されない）。
            WP がエラー（503）・通信できない（abort）・メンテナンス中のとき: 手書きデータ（FALLBACK_JS）にある作品だけ素材フォルダの
            画像で表示し（ページ数・表示モードも手書きデータどおり＝素材に無いページを読まない）、無い作品（非公開にした作品など）は
            推測で表示しない。WP 障害では「表示に時間がかかっています」と出して取り直し、WP が戻ったら WP のデータで表示する。
            作品 ID の形でない値は問い合わせずに「NO PAGES」。ルート BUGS.md #085"""
            try:
                fsrc = get_text(f"{base}/{FALLBACK_JS}")
                hand = fallback_works_hand(fsrc)
                verticals = fallback_works_vertical(fsrc)
            except Exception:
                hand, verticals = {}, []
            known = next(iter(hand), None)
            rec(f"埋込ビューア: 手書きデータ（{FALLBACK_JS}）を読める", bool(known), f"{len(hand)}件・縦読み専用 {len(verticals)}件")
            if not known:
                return
            json_headers = {"content-type": "application/json; charset=UTF-8", "access-control-allow-origin": "*"}
            LOADING_TEXT = "() => (document.getElementById('loading') || {}).textContent || ''"

            def open_embed(mid, mode, label, check, extra_routes=()):
                """WP の /manga を mode（'503'・'通信できない'・'通る'、切り替え用の dict）にして embed-viewer を開き、check(pg) を呼ぶ"""
                ctx = new_ctx(browser, viewport={"width": 1440, "height": 900})
                try:
                    def handler(route):
                        m = mode["now"] if isinstance(mode, dict) else mode
                        if m == "503":
                            route.fulfill(status=503, headers=json_headers, body='{"code":"service_unavailable"}')
                        elif m == "通信できない":
                            route.abort()
                        else:
                            route.fallback()  # 実際の API へ（別ポートのときは CORS の中継へ）
                    ctx.route("**/wp-json/contentsx/v1/manga/**", handler)
                    for pattern, h in extra_routes:
                        ctx.route(pattern, h)
                    pr2 = PageProbe(ctx, host, local_http=local_http, expected_api_failures=True)
                    try:
                        pr2.page.goto(f"{base}/embed-viewer.html?manga={mid}&manual=1", wait_until="domcontentloaded")
                        check(pr2.page)
                    except Exception as e:
                        rec(f"{label}: 検証が例外で中断", False, f"{type(e).__name__}: {str(e)[:100]}")
                    pr2.finish(label)
                finally:
                    close_ctx(ctx)

            def viewer_imgs(pg):
                return pg.evaluate("() => [...document.querySelectorAll('#viewer img')].map(i => i.src)")

            def check_material(mid, label):
                def check(pg):
                    pg.wait_for_function(IMG_LOADED, arg="#viewer img", timeout=20000)
                    pg.wait_for_timeout(1500)  # 素材に無いページ（404）を読みに行かないかを finish で見る
                    srcs = viewer_imgs(pg)
                    n = len(set(srcs))
                    ok = bool(srcs) and all(f"/material/manga/{mid}/" in u for u in srcs) and n == hand[mid]
                    rec(f"{label}: 手書きデータにある作品は素材フォルダの画像で、手書きデータのページ数どおり表示する",
                        ok, f"画像={n}種類（手書き {hand[mid]}P） 1枚目={(srcs or [''])[0][-45:]}")
                return check

            def check_waiting(text, label):
                def check(pg):
                    pg.wait_for_function(f"() => ({LOADING_TEXT})().indexOf('{text}') !== -1", timeout=10000)
                    st = pg.evaluate(f"() => ({{ imgs: document.querySelectorAll('#viewer img').length, text: ({LOADING_TEXT})() }})")
                    rec(f"{label}: 手書きデータに無い作品は推測で表示せず「{text}」",
                        st["imgs"] == 0, f"画像={st['imgs']}枚 表示={st['text'][:30]}")
                return check

            for mode in ("503", "通信できない"):
                open_embed(known, mode, f"埋込ビューア ?manga={known}（WP が{mode}）",
                           check_material(known, f"埋込ビューア ?manga={known}（WP が{mode}）"))
                open_embed("bm-smoke-no-such-work", mode, f"埋込ビューア ?manga=bm-smoke-no-such-work（WP が{mode}）",
                           check_waiting("表示に時間がかかっています", f"埋込ビューア ?manga=bm-smoke-no-such-work（WP が{mode}）"))

            if verticals:
                vid = verticals[0]
                label = f"埋込ビューア ?manga={vid}（縦読み専用・WP が503）"

                def check_vertical(pg, label=label, vid=vid):
                    check_material(vid, label)(pg)
                    vertical = pg.evaluate("() => document.getElementById('viewer').classList.contains('is-vertical')")
                    rec(f"{label}: 手書きデータどおり縦読みで表示する", vertical, f"縦読み={'はい' if vertical else 'いいえ'}")
                open_embed(vid, "503", label, check_vertical)

            # メンテナンス中（bm-wp-config.js の maintenance を true に差し替え）: 一覧の作品は素材フォルダの画像、無い作品は「一時停止」
            try:
                cfg = get_text(f"{base}/js/bm-wp-config.js")
            except Exception:
                cfg = ""
            if "maintenance: false" in cfg:
                cfg_on = cfg.replace("maintenance: false", "maintenance: true", 1)
                mroute = [("**/js/bm-wp-config.js", lambda route: route.fulfill(
                    status=200, headers={"content-type": "application/javascript; charset=utf-8"}, body=cfg_on))]
                open_embed(known, "通る", f"埋込ビューア ?manga={known}（メンテナンス中）",
                           check_material(known, f"埋込ビューア ?manga={known}（メンテナンス中）"), mroute)
                open_embed("bm-smoke-no-such-work", "通る", "埋込ビューア ?manga=bm-smoke-no-such-work（メンテナンス中）",
                           check_waiting("一時停止しています", "埋込ビューア ?manga=bm-smoke-no-such-work（メンテナンス中）"), mroute)
            else:
                skip("埋込ビューア(メンテナンス中)", "bm-wp-config.js に maintenance: false が無い（今がメンテナンス中か書式が変わった）")

            # 作品 ID の形でない値は WP に問い合わせず「NO PAGES」
            label = "埋込ビューア ?manga=--（作品 ID の形でない）"

            def check_invalid(pg, label=label):
                pg.wait_for_function(f"() => ({LOADING_TEXT})() === 'NO PAGES'", timeout=5000)
                rec(f"{label}: 問い合わせずに「NO PAGES」", True)
            open_embed("--", "503", label, check_invalid)

            # 手書きデータに無い作品は、WP が戻ると取り直して WP のデータで表示する（取り直しの最初の間隔は5秒）
            api_e, lib_e, _why = site_api()
            wp_only = next((w for w in (lib_e or []) if w.get("id") and w["id"] not in hand and w.get("gallery")), None)
            if not wp_only:
                skip("埋込ビューア(WP 503→復旧)", "手書きデータに無く WP のギャラリーがある作品が /library に無い")
                return
            rid = wp_only["id"]
            one = get_json(f"{api_e}/manga/{rid}")
            gallery = [img_url(g) for g in (one.get("gallery") or [])]
            state = {"now": "503"}
            label = f"埋込ビューア ?manga={rid}（手書きデータに無い作品・WP 503→復旧）"

            def check_retry(pg, label=label):
                pg.wait_for_function(f"() => ({LOADING_TEXT})().indexOf('時間がかかっています') !== -1", timeout=10000)
                state["now"] = "通る"
                pg.wait_for_function(IMG_LOADED, arg="#viewer img", timeout=30000)
                srcs = viewer_imgs(pg)
                ok = bool(srcs) and bool(gallery) and srcs[0] == gallery[0] and len(set(srcs)) == len(gallery) \
                    and not any("/material/manga/" in u for u in srcs)
                rec(f"{label}: 「表示に時間がかかっています」の後、WP が戻ると取り直して WP のデータで表示する",
                    ok, f"画像={len(set(srcs))}種類（WP {len(gallery)}枚） 1枚目={(srcs or [''])[0][-45:]}")
            open_embed(rid, state, label, check_retry)

        def mobile():
            ctx = new_ctx(browser, viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                          user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
            pr = probe(ctx)
            pg = pr.page
            pg.goto(f"{base}/biz-library.html?manga={wp_id}", wait_until="load")
            try:
                pg.wait_for_selector("#mangaModal", state="visible", timeout=15000)
                pg.wait_for_function(IMG_LOADED, arg="#mangaModal img", timeout=20000)
                rec("スマホ(390px) ?manga=: ビューアが開き画像が出る", True)
            except Exception:
                rec("スマホ(390px) ?manga=: ビューアが開き画像が出る", False)
            # works.js: PC以外で見開き(spread)作品を開くと縦スクロール(mode-vertical)に切り替わる（SPデフォルト）。
            # #mobileView は見開き専用の要素なので、縦スクロール時は非表示が正しい。
            mode = pg.evaluate("() => { const c=document.getElementById('mangaModal').classList; return c.contains('mode-vertical') ? 'vertical' : (c.contains('mode-spread') ? 'spread' : 'none') }")
            rec("スマホ(390px): 縦スクロールモード(mode-vertical)で開く（SPデフォルト）", mode == "vertical", f"mode={mode}")
            try:
                pg.wait_for_function(IMG_LOADED, arg="#modalManga img", timeout=15000)
                rec("スマホ(390px): 縦スクロール枠(#modalManga)に画像が出る", True)
            except Exception:
                rec("スマホ(390px): 縦スクロール枠(#modalManga)に画像が出る", False)
            # ビズ書庫の一覧（?manga= なし）の中身が画面より広くはみ出していないかを body.scrollWidth（切り取る前の中身の幅）で
            # 見る（SPEC §0.6）。直リンク表示は一覧・フッターを隠す（html.direct-mode）ので、一覧のはみ出しは一覧の表示でしか測れない。
            # ⚠️ documentElement.scrollWidth に変えない: html/body の overflow-x: clip で切った後の幅なので常に画面幅になり、
            #    画面からはみ出して切り取られた（見えなくなった）内容を見逃す。ビズ書庫は 390px で body.scrollWidth = 390
            pg.goto(f"{base}/biz-library.html", wait_until="load")
            try:
                pg.wait_for_function("n => document.querySelectorAll('#worksGrid > *').length === n", arg=len(lib), timeout=25000)
            except Exception:
                pass
            sw = pg.evaluate("() => [document.body.scrollWidth, window.innerWidth, document.querySelectorAll('#worksGrid > *').length]")
            rec("スマホ(390px): ビズ書庫の一覧に横スクロール無し", sw[2] > 0 and not (sw[0] > sw[1]),
                f"body.scrollWidth={sw[0]} innerWidth={sw[1]} カード={sw[2]}")
            pr.finish("スマホ")
            close_ctx(ctx)

        section("ホーム", home)
        section("制作事例", works)
        section("ビズ書庫", library)
        section("ビズ書庫(WP が届かない)", library_without_wp)
        if wp_id:
            section("QR直リンク", qr_direct)
        section("QR直リンク(手書きデータにある作品)", qr_fallback_work)
        section("QR直リンクの分岐(作品が無い・WP 停止)", qr_branches)
        if wp_id:
            section("サイト内遷移", internal_nav)
            section("埋込ビューア", embed)
        section("埋込ビューア(WP 障害)", embed_wp_down)
        close_ctx(desktop)
        if wp_id:
            section("スマホ", mobile)
        browser.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default=f"http://127.0.0.1:{DEFAULT_PORT}", help="確認対象のサイトURL（末尾スラッシュ無し）")
    ap.add_argument("--api", default=DEFAULT_API, help="WP API のベースURL（Python 側の確認にだけ効く）")
    ap.add_argument("--api-only", action="store_true", help="WP API の確認だけ行う（ブラウザを使わない）")
    ap.add_argument("--serve", metavar="DIR", help="このディレクトリを内蔵サーバーで配信して検証する（--base より優先）")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"--serve のポート（既定 {DEFAULT_PORT}＝WP の CORS 許可オリジン）")
    args = ap.parse_args()
    base = args.base.rstrip("/")
    httpd = None
    if args.serve:
        try:
            httpd = start_server(os.path.abspath(args.serve), args.port)
        except OSError as e:
            print(f"内蔵サーバーを 127.0.0.1:{args.port} で起動できません（{e}）。--port で別ポートを指定するか、使用中のプロセスを止めてください", file=sys.stderr)
            sys.exit(2)
        base = f"http://127.0.0.1:{args.port}"

    print(f"== WP API: {args.api}")
    data = check_api(args.api)
    if not args.api_only:
        try:
            check_browser(base, data)
        except ImportError:
            rec("playwright が見つからない", False, "pip install playwright && python3 -m playwright install chromium")
        except Exception as e:
            rec("ブラウザ検証を開始できない（Chromium 未導入・起動失敗など）", False, f"{type(e).__name__}: {str(e)[:200]}")
        finally:
            if httpd:
                httpd.shutdown()
    elif httpd:
        httpd.shutdown()

    n_fail = sum(1 for _, ok, _ in RESULTS if not ok)
    print("\n== 結果: {} PASS / {} FAIL".format(len(RESULTS) - n_fail, n_fail) +
          (f" / {len(SKIPPED)} 区画を飛ばした（前提の取得に失敗）" if SKIPPED else ""))
    for name, ok, detail in RESULTS:
        if not ok:
            print(f"   FAIL {name}" + (f"  — {detail}" if detail else ""))
    for name, reason in SKIPPED:
        print(f"   SKIP {name}  — {reason}")
    sys.exit(1 if n_fail else 0)


if __name__ == "__main__":
    main()
