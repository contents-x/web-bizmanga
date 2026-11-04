"""Shared, standard-library-only helpers for the static site builders."""
from contextlib import contextmanager
from contextvars import ContextVar
import html
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
API_BASE = "https://cms.contentsx.jp/wp-json/contentsx/v1"
SITE_URL = "https://bizmanga.contentsx.jp"
_pending = ContextVar("build_outputs", default=None)


FETCH_ATTEMPTS = 3
FETCH_RETRY_DELAY = 2  # seconds; doubles on each retry


def _is_transient(error):
    """Timeouts, connection failures, 429 and 5xx; other HTTP errors are final."""
    if isinstance(error, urllib.error.HTTPError):
        return error.code == 429 or error.code >= 500
    return isinstance(error, (urllib.error.URLError, TimeoutError, ConnectionError))


def fetch_json(url, timeout=30, user_agent="BizManga-Builder/1.0"):
    """Fetch JSON, retrying transient failures so one blip does not fail a build."""
    request = urllib.request.Request(url, headers={"User-Agent": user_agent})
    for attempt in range(1, FETCH_ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as error:
            if attempt == FETCH_ATTEMPTS or not _is_transient(error):
                raise
            time.sleep(FETCH_RETRY_DELAY * 2 ** (attempt - 1))


def require_records(value, *, label="API response", key="id", allow_empty=False):
    """Reject partial/invalid identities before any output or stale-file removal."""
    if not isinstance(value, list) or (not value and not allow_empty):
        raise ValueError(f"{label}: expected a {'non-empty ' if not allow_empty else ''}list")
    seen = set()
    for item in value:
        if not isinstance(item, dict) or item.get(key) in (None, ""):
            raise ValueError(f"{label}: missing {key}")
        identity = str(item[key])
        if identity in seen:
            raise ValueError(f"{label}: duplicate {key}: {identity}")
        seen.add(identity)
    return value


def shows_on_bizmanga(work):
    """BizManga の制作事例に出す作品か。

    show_site は "both"（B と C）だけでなく、"bizmanga"（B だけ）や "bizmanga,contentsx" のような CSV もある
    （WP の掲載先は複数選べる。空は both 扱い。WP の cxcms_show_site_list と同じ判定）。
    2026-11-04: 以前は "both" だけを見ていたため、B だけに出す作品（bizsalesnavi）の個別ページが作られず、
    ヒーロー・制作事例の「詳細ページ」リンクが 404 になっていた。
    """
    site = str(work.get("show_site") or "both").strip()
    return site == "both" or "bizmanga" in [s.strip() for s in site.split(",")]


def bizmanga_works(value, *, label="works"):
    """Validate only works shown on BizManga (show_site "both" or a CSV containing "bizmanga").

    ContentX-only works never become BizManga files, so their IDs must not be
    able to stop the BizManga builds.
    """
    if not isinstance(value, list):
        raise ValueError(f"{label}: expected a list")
    works = [w for w in value if isinstance(w, dict) and shows_on_bizmanga(w)]
    require_records(works, label=f"BizManga {label}")
    for work in works:
        safe_slug(work["id"])
    return works


def work_page_count(work):
    """作品のページ数（整数。0 は不明）。

    WP の gallery（実際の画像）の枚数を優先し、無いときだけ手入力の pages を使う
    （BUGS #049/#050「ギャラリーの実枚数を優先」。手入力は画像の追加・削除に追従しない）。
    ページ数を出す・使う生成物（制作事例の詳細・カテゴリページのモーダル用データ・LP の事例）は必ずここを通す。
    """
    gallery = work.get("gallery") or []
    if gallery:
        return len(gallery)
    try:
        return max(0, int(work.get("pages") or 0))
    except (TypeError, ValueError):
        return 0


def work_pages_label(work):
    """ページ数の表示文字列（例 "8P"）。gallery の実枚数を優先し、無ければ手入力の spec.pages → pages。不明は ""。"""
    if work.get("gallery"):
        return f"{work_page_count(work)}P"
    manual = (work.get("spec") or {}).get("pages") or ""
    if manual:
        return manual
    count = work_page_count(work)
    return f"{count}P" if count else ""


def safe_slug(value):
    """A single URL/file component, never a path or a Windows device name."""
    value = str(value)
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", value):
        raise ValueError(f"Invalid slug: {value!r}")
    if re.fullmatch(r"(?:con|prn|aux|nul|com[1-9]|lpt[1-9])", value, re.I):
        raise ValueError(f"Reserved slug: {value!r}")
    return value


def script_json(value, **kwargs):
    """JSON for an HTML script element (including JSON-LD)."""
    return json.dumps(value, ensure_ascii=False, **kwargs).replace("<", "\\u003c")


def replace_block(source, start, end, block, *, required=False):
    """Replace one literal marker pair without interpreting backslashes in data."""
    pattern = re.compile(re.escape(start) + r"[\s\S]*?" + re.escape(end))
    matches = list(pattern.finditer(source))
    if len(matches) > 1 or source.count(start) > 1:
        raise ValueError(f"Duplicate build marker: {start}")
    if not matches:
        if required or start in source:
            raise ValueError(f"Missing or incomplete build marker: {start}")
        return source, False
    return pattern.sub(lambda _match: block, source, count=1), True


def render_template(template, replacements):
    """Render existing HTML substitutions, escaping JSON strings separately.

    HTML replacements have already been escaped by the caller. Within a JSON-LD
    string placeholder, undo that HTML escaping and use JSON's string rules.
    Substitutions are simultaneous, so user content containing {{...}} stays data.
    """
    token = re.compile(r"\{\{[a-zA-Z0-9_]+\}\}")

    def substitute(source, values):
        def value(match):
            if match[0] not in values:
                raise ValueError(f"Unknown template placeholder: {match[0]}")
            return values[match[0]]
        return token.sub(value, source)

    def json_block(match):
        raw = match[2]
        # Whole JSON documents, e.g. {{faq_jsonld}}, are already serialized.
        if raw.strip() in replacements:
            rendered = replacements[raw.strip()]
        else:
            values = {
                key: script_json(html.unescape(str(value)))[1:-1]
                for key, value in replacements.items()
            }
            rendered = substitute(raw, values)
        json.loads(rendered)
        return match[1] + rendered + match[3]

    pattern = re.compile(
        r'(<script\b[^>]*\btype="application/(?:ld\+)?json"[^>]*>)(.*?)(</script>)',
        re.S | re.I,
    )
    # Render the non-JSON segments separately so substituted content is never
    # parsed again as a template (or as a script element).
    parts, offset = [], 0
    for match in pattern.finditer(template):
        parts.append(substitute(template[offset:match.start()], replacements))
        parts.append(json_block(match))
        offset = match.end()
    parts.append(substitute(template[offset:], replacements))
    return "".join(parts)


def _atomic_bytes(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".bm-build-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(data)
        os.chmod(temporary, stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o644)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def write_text(path, content):
    if Path(path).suffix == ".xml":
        ET.fromstring(content)
    write_bytes(path, content.encode("utf-8"))


def write_bytes(path, data):
    path = Path(path).resolve()
    pending = _pending.get()
    if pending is not None:
        root, changes = pending
        if not path.is_relative_to(root):
            raise ValueError(f"Output escapes build root: {path}")
        changes[path] = data
    elif not path.exists() or path.read_bytes() != data:
        _atomic_bytes(path, data)


def remove_file(path):
    path = Path(path).resolve()
    pending = _pending.get()
    if pending is None:
        raise RuntimeError("Stale files must be removed inside output_batch")
    root, changes = pending
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError(f"Invalid stale output: {path}")
    changes[path] = None


@contextmanager
def output_batch(root=ROOT):
    """Publish completed renders; attempt every rollback and report all failures."""
    if _pending.get() is not None:
        raise RuntimeError("Nested build batches are not supported")
    changes = {}
    token = _pending.set((Path(root).resolve(), changes))
    try:
        yield
        originals = {path: path.read_bytes() if path.exists() else None for path in changes}
        applied = []
        try:
            # Publish generated files before removing obsolete ones.
            for path, data in sorted(changes.items(), key=lambda item: item[1] is None):
                if originals[path] == data:
                    continue
                if data is None:
                    path.unlink()
                else:
                    _atomic_bytes(path, data)
                applied.append(path)
        except BaseException as commit_error:
            rollback_errors = []
            for path in reversed(applied):
                try:
                    if originals[path] is None:
                        path.unlink(missing_ok=True)
                    else:
                        _atomic_bytes(path, originals[path])
                except BaseException as rollback_error:
                    rollback_error.add_note(f"Could not restore output: {path}")
                    rollback_errors.append(rollback_error)
            if rollback_errors:
                raise BaseExceptionGroup(
                    "Build commit failed and rollback was incomplete",
                    [commit_error, *rollback_errors],
                ) from None
            raise
    finally:
        _pending.reset(token)
