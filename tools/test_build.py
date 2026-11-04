"""Offline regression tests for builder boundaries and existing output contracts."""
from contextlib import redirect_stdout
from html.parser import HTMLParser
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from bm_build import output_batch, remove_file, render_template, replace_block, safe_slug, script_json, write_text
from bm_content import make_slug
from bm_html import _Sanitizer
import bm_pricing

ROOT = Path(__file__).resolve().parents[1]


def module(filename):
    spec = importlib.util.spec_from_file_location(filename.replace('-', '_'), ROOT / 'tools' / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def git_test_env():
    # Isolate test identities, config and signing from the user's setup.
    return dict(os.environ, GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull,
                GIT_AUTHOR_NAME='Test', GIT_AUTHOR_EMAIL='test@example.test',
                GIT_COMMITTER_NAME='Test', GIT_COMMITTER_EMAIL='test@example.test',
                GIT_TERMINAL_PROMPT='0', GIT_EDITOR='true')


def workflow_checkout_ref(workflow):
    source = (ROOT / '.github/workflows' / workflow).read_text(encoding='utf-8')
    checkout = re.search(r'uses: actions/checkout@[^\n]+\n((?: {8,}[^\n]*\n)*)', source)
    ref = re.search(r'^\s+ref: (.+)$', checkout[1], re.M)
    return ref[1].strip() if ref else None


class BuildTests(unittest.TestCase):
    def test_literal_marker_substitution(self):
        block = 'START backslash \\q and \\1 END'
        self.assertEqual(replace_block('START old END', 'START', 'END', block), (block, True))
        for value in ('START missing', 'START a END START b END'):
            with self.assertRaises(ValueError):
                replace_block(value, 'START', 'END', block, required=True)

    def test_slug_is_one_component(self):
        for slug in ('../outside', 'a/b', r'a\b', 'CON', 'nul', '', 'with space'):
            with self.assertRaises(ValueError):
                safe_slug(slug)
        self.assertEqual(safe_slug('manga-123'), 'manga-123')
        with redirect_stdout(io.StringIO()), patch('sys.stderr', io.StringIO()) as warning:
            self.assertEqual(make_slug({'id': 7, 'slug': '../outside'}), 'column-7')
        self.assertIn('::warning::', warning.getvalue(), 'a changed public URL must not be silent')

    def test_fetch_json_retries_only_transient_failures(self):
        import urllib.error
        import bm_build

        class Response(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        def http_error(code):
            return urllib.error.HTTPError('https://example.test', code, 'error', {}, None)

        with patch.object(bm_build.time, 'sleep') as sleep:
            with patch.object(bm_build.urllib.request, 'urlopen',
                              side_effect=[http_error(502), TimeoutError(), Response(b'[1]')]) as opened:
                self.assertEqual(bm_build.fetch_json('https://example.test'), [1])
            self.assertEqual(opened.call_count, 3)
            self.assertEqual(sleep.call_count, 2)
            with patch.object(bm_build.urllib.request, 'urlopen', side_effect=http_error(404)) as opened:
                with self.assertRaises(urllib.error.HTTPError):
                    bm_build.fetch_json('https://example.test')
            self.assertEqual(opened.call_count, 1, 'a 404 is final')
            with patch.object(bm_build.urllib.request, 'urlopen', side_effect=http_error(503)) as opened:
                with self.assertRaises(urllib.error.HTTPError):
                    bm_build.fetch_json('https://example.test')
            self.assertEqual(opened.call_count, bm_build.FETCH_ATTEMPTS)

    def test_only_bizmanga_works_are_validated(self):
        from bm_build import bizmanga_works
        works = [
            {'id': 'shown', 'show_site': 'both'},
            {'id': 'ContentX.Only', 'show_site': 'contentsx'},
            {'id': 'ContentX.Only', 'show_site': 'contentsx'},
        ]
        self.assertEqual([w['id'] for w in bizmanga_works(works)], ['shown'])
        # 2026-11-04: B だけ（bizmanga）・CSV・空（both 扱い）も B の作品。以前は both だけで、B だけの作品の個別ページが作られなかった
        more = [
            {'id': 'b-only', 'show_site': 'bizmanga'},
            {'id': 'csv', 'show_site': 'contentsx, bizmanga'},
            {'id': 'empty', 'show_site': ''},
            {'id': 'c-only', 'show_site': 'contentsx'},
            {'id': 'ichioshi-only', 'show_site': 'ichioshi'},
            {'id': 'none', 'show_site': 'none'},
        ]
        self.assertEqual([w['id'] for w in bizmanga_works(more)], ['b-only', 'csv', 'empty'])
        for bad in ([{'id': '../x', 'show_site': 'both'}],
                    [{'id': 'dup', 'show_site': 'both'}, {'id': 'dup', 'show_site': 'both'}],
                    [{'id': 'other', 'show_site': 'contentsx'}],
                    {'id': 'not-a-list'}):
            with self.assertRaises(ValueError):
                bizmanga_works(bad)

    def test_json_and_html_are_separate_contexts(self):
        value = 'quote " & newline\n</script>{{other}}'
        from html import escape
        template = '<h1>{{title}}</h1><script type="application/ld+json">{"name":"{{title}}"}</script>'
        result = render_template(template, {'{{title}}': escape(value), '{{other}}': 'wrong'})
        self.assertIn('<h1>' + escape(value) + '</h1>', result)
        payload = re.search(r'application/ld\+json">(.*?)</script>', result, re.S)[1]
        self.assertEqual(json.loads(payload)['name'], value)
        self.assertNotIn('</script>', script_json({'name': value}))

    def test_detail_templates_accept_real_json_strings(self):
        columns = module('build-columns.py')
        works = module('build-works.py')
        title = 'quoted " title\nsecond line & more </script>'
        outputs = [
            columns.build_detail_page(
                {'id': 1, 'slug': 'example', 'title_ja': title}, {'content': '<p>Body</p>'},
                columns.TEMPLATE_PATH.read_text(encoding='utf-8')),
            works.build_detail_page({'id': 'example', 'title_ja': title},
                                   works.TEMPLATE_PATH.read_text(encoding='utf-8')),
        ]
        for output in outputs:
            docs = [json.loads(m[1]) for m in re.finditer(
                r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', output, re.S)]
            self.assertTrue(any(d.get('headline', d.get('name')) == title for d in docs))

    def test_column_page_prefers_wp_seo_fields(self):
        # WP の「SEOタイトル」「SEO説明文」は検索・SNS 向けの欄にだけ使い、見出しは記事タイトルのまま
        columns = module('build-columns.py')
        template = columns.TEMPLATE_PATH.read_text(encoding='utf-8')
        base = {'id': 7, 'slug': 'seo-fields', 'title_ja': '記事タイトル', 'excerpt_ja': '一覧カードの抜粋'}

        def build(**fields):
            return columns.build_detail_page(dict(base, **fields), {'content': '<p>Body</p>'}, template)

        def article(page):
            return next(d for d in (json.loads(m[1]) for m in re.finditer(
                r'<script type="application/ld\+json">(.*?)</script>', page, re.S)) if d['@type'] == 'Article')

        page = build(seo_title='検索用タイトル', seo_description='検索用の<b>説明</b>\r\n文')
        for tag in ('<title>検索用タイトル | コラム | ビズマンガ</title>',
                    '<meta property="og:title" content="検索用タイトル | コラム | ビズマンガ">',
                    '<meta name="twitter:title" content="検索用タイトル | コラム | ビズマンガ">',
                    '<meta name="description" content="検索用の説明 文">',
                    '<meta property="og:description" content="検索用の説明 文">',
                    '<meta name="twitter:description" content="検索用の説明 文">',
                    '<h1 class="bm-col-static-title">記事タイトル</h1>'):
            self.assertIn(tag, page)
        self.assertEqual(article(page)['headline'], '記事タイトル')
        self.assertEqual(article(page)['description'], '検索用の説明 文')
        self.assertNotIn('一覧カードの抜粋', page)
        # 空欄なら従来どおり記事タイトルと抜粋
        page = build(seo_title=' ', seo_description='')
        self.assertIn('<title>記事タイトル | コラム | ビズマンガ</title>', page)
        self.assertIn('<meta name="description" content="一覧カードの抜粋">', page)
        # SEO欄にもブランド方針の正規化をかける（タグや改行をまたいでも）。説明文は個別の上書き（DESC_OVERRIDES）より優先
        self.assertIn('<meta name="description" content="独自の制作メソッドで作ります">',
                      build(seo_description='人間7割×<b>AI3割</b>で作ります'))
        self.assertIn('<title>独自の制作メソッドの漫画 | コラム | ビズマンガ</title>',
                      build(seo_title='人間7割×AI3割の漫画'))
        # サイト名はテンプレートが付ける。編集者が末尾に書いても並べない（C と共有する記事の「｜ContentsX」も外す）
        for written in ('検索用｜ビズマンガ', '検索用 | BizManga', '検索用｜コラム｜ビズマンガ', '検索用｜ContentsX'):
            self.assertIn('<title>検索用 | コラム | ビズマンガ</title>', build(seo_title=written), written)
        # WP は保存時に単独の「<」を &lt; に変える。検索結果に「&lt;」と出さない
        # 極端に長い値でもビルドが止まらない（先に1000字で切る。切らないと20万字で約20秒）
        self.assertIn('<title>| Contents X | Contents X', build(seo_title=' | Contents X' * 20000 + 'x'))
        page = build(seo_title='費用&lt;相場', seo_description='A&amp;B &lt; C')
        self.assertIn('<title>費用&lt;相場 | コラム | ビズマンガ</title>', page)
        self.assertIn('<meta name="description" content="A&amp;B &lt; C">', page)
        slug = next(iter(columns.DESC_OVERRIDES))
        self.assertIn('<meta name="description" content="WPの説明">', build(slug=slug, seo_description='WPの説明'))

    def test_void_tags_do_not_swallow_following_content(self):
        for tag in ('meta charset="utf-8"', 'link href="x"', 'base href="x"', 'embed src="x"'):
            parser = _Sanitizer()
            parser.feed('<p>before</p><' + tag + '><p>after</p>')
            parser.close()
            self.assertEqual(''.join(parser.out), '<p>before</p><p>after</p>')
        parser = _Sanitizer()
        parser.feed('<script>bad()</script><p onclick="bad()">safe</p>')
        self.assertEqual(''.join(parser.out), '<p>safe</p>')

    def test_rich_html_url_policy(self):
        class Attributes(HTMLParser):
            def handle_starttag(self, tag, attrs):
                if tag == case['tag']:
                    self.value = dict(attrs).get(case['attribute'])

        cases = json.loads((ROOT / 'tools/fixtures/rich-html-urls.json').read_text(encoding='utf-8'))
        for case in cases:
            with self.subTest(html=case['html']):
                sanitizer = _Sanitizer()
                sanitizer.feed(case['html'])
                sanitizer.close()
                output = Attributes()
                output.feed(''.join(sanitizer.out))
                self.assertEqual(output.value, case['expected'])

    def test_rich_html_rejects_literal_c0_and_del_in_urls(self):
        for codepoint in (*range(32), 127):
            for url in (chr(codepoint) + 'javascript:window.injected=true',
                        'java' + chr(codepoint) + 'script:window.injected=true'):
                with self.subTest(url=repr(url)):
                    sanitizer = _Sanitizer()
                    sanitizer.feed('<a href="' + url + '">probe</a>')
                    self.assertNotIn('href=', ''.join(sanitizer.out))

    def test_build_exception_keeps_original_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            original = root / 'old.html'
            original.write_text('original', encoding='utf-8')
            with self.assertRaises(RuntimeError):
                with output_batch(root):
                    write_text(original, 'changed')
                    write_text(root / 'new.html', 'new')
                    remove_file(original)
                    raise RuntimeError('render failed')
            self.assertEqual(original.read_text(encoding='utf-8'), 'original')
            self.assertFalse((root / 'new.html').exists())

    def test_commit_rollback_and_unchanged_mtime(self):
        import bm_build
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            a, b = root / 'a.html', root / 'b.html'
            a.write_text('before', encoding='utf-8')
            before = a.stat().st_mtime_ns
            with output_batch(root):
                write_text(a, 'before')
            self.assertEqual(before, a.stat().st_mtime_ns)
            atomic = bm_build._atomic_bytes

            def fail_second(path, data):
                if path == b:
                    raise OSError('disk failure')
                atomic(path, data)

            with patch.object(bm_build, '_atomic_bytes', side_effect=fail_second):
                with self.assertRaises(OSError):
                    with output_batch(root):
                        write_text(a, 'after')
                        write_text(b, 'new')
            self.assertEqual(a.read_text(encoding='utf-8'), 'before')
            self.assertFalse(b.exists())

    def test_output_cannot_escape_root(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                with output_batch(directory):
                    write_text(Path(directory).parent / 'outside.html', 'bad')

    def test_rollback_attempts_every_file_and_preserves_all_errors(self):
        import bm_build
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            a, b, c, d, new = (root / name for name in ('a', 'b', 'c', 'd', 'new'))
            for path in (a, b, c, d):
                path.write_bytes(b'before')
            commit_error = OSError('publish failed')
            restore_errors = {b: OSError('b is locked'), c: OSError('c is locked')}
            atomic = bm_build._atomic_bytes

            def fail_commit_and_restores(path, data):
                if path == d:
                    raise commit_error
                if data == b'before' and path in restore_errors:
                    raise restore_errors[path]
                atomic(path, data)

            with patch.object(bm_build, '_atomic_bytes', side_effect=fail_commit_and_restores):
                with self.assertRaises(ExceptionGroup) as raised:
                    with output_batch(root):
                        for path in (a, new, b, c, d):
                            write_text(path, 'after')
            self.assertEqual(raised.exception.exceptions,
                             (commit_error, restore_errors[c], restore_errors[b]))
            for path, error in restore_errors.items():
                self.assertIn(str(path), '\n'.join(error.__notes__))
                self.assertEqual(path.read_bytes(), b'after')
            self.assertEqual(a.read_bytes(), b'before', 'restore continues past failures')
            self.assertEqual(d.read_bytes(), b'before')
            self.assertFalse(new.exists(), 'new outputs are still removed')
            # Even an incomplete rollback must release the batch context.
            with output_batch(root):
                write_text(a, 'next build')
            self.assertEqual(a.read_bytes(), b'next build')

    def test_partial_column_fetch_does_not_publish(self):
        columns = module('build-columns.py')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            with patch.object(columns, 'COLUMN_DIR', root), patch.object(
                columns, 'fetch_column_detail', side_effect=OSError('offline')
            ):
                with self.assertRaises(RuntimeError):
                    with output_batch(root):
                        columns.generate_details([{'id': 1, 'slug': 'example'}])
            self.assertEqual(list(root.glob('*.html')), [])

    def test_column_grid_keeps_featured_card_first_for_mobile(self):
        # 一覧は静的カードが正（Issue #85）。特集記事も先頭カード（PCはCSSで隠す）として出し、他は1回ずつ
        columns = module('build-columns.py')
        items = [{'id': i, 'slug': f'col-{i}', 'title_ja': f'T{i}', 'category': 'BtoB戦略' if i % 2 else '',
                  'date': '2026.10.01', '_readtime': 3} for i in range(1, 5)]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / 'column.html').write_bytes((ROOT / 'column.html').read_bytes())
            with patch.object(columns, 'ROOT', root), redirect_stdout(io.StringIO()):
                columns.update_column_html(items)
            html = (root / 'column.html').read_text(encoding='utf-8')
        grid = html.split('<!-- BUILD:COLUMN_GRID -->', 1)[1].split('<!-- /BUILD:COLUMN_GRID -->', 1)[0]
        cards = re.findall(r'<a class="([^"]+)" href="([^"]+)" data-category="([^"]*)">', grid)
        self.assertEqual([href for _, href, _ in cards], [f'/column/col-{i}' for i in range(1, 5)])
        self.assertEqual([cls for cls, _, _ in cards],
                         ['bm-column-card bm-column-card--featured'] + ['bm-column-card'] * 3)
        self.assertEqual([cat for _, _, cat in cards], ['BtoB戦略', 'その他', 'BtoB戦略', 'その他'])
        self.assertEqual(grid.count('bm-column-card-readtime">3分<'), 4)
        data = json.loads(re.search(r'<script type="application/json" id="bm-column-data">(.*?)</script>', html, re.S)[1])
        self.assertEqual((data['total'], data['featured']['slug']), (4, 'col-1'))

    def test_all_eight_lps_are_v2(self):
        lp = module('build-lp-cases.py')
        self.assertEqual(len(lp.LP_CATEGORIES), 8)
        for slug in lp.LP_CATEGORIES:
            self.assertTrue(lp.is_v2_lp(slug), slug)

    def test_lp_rebuild_is_idempotent(self):
        lp = module('build-lp-cases.py')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            for name in lp.LP_CATEGORIES:
                path = root / (name + '.html')
                path.write_bytes((ROOT / path.name).read_bytes())
                section = lp.render_section(name, lp.LP_NAMES[name], [])
                with patch.object(lp, 'ROOT', root):
                    lp.patch_lp(name, section)
                    first = path.read_bytes()
                    self.assertFalse(lp.patch_lp(name, section))
                    self.assertEqual(first, path.read_bytes())

    def test_generated_pricing_matches_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / 'tools/templates').mkdir(parents=True)
            (root / 'js').mkdir()
            template = ROOT / 'tools/templates/bm-pricing.js.tpl'
            (root / 'tools/templates/bm-pricing.js.tpl').write_bytes(template.read_bytes())
            with patch.object(bm_pricing, 'ROOT', root):
                bm_pricing.write_browser_script()
            self.assertEqual((root / 'js/bm-pricing.js').read_text(encoding='utf-8'),
                             (ROOT / 'js/bm-pricing.js').read_text(encoding='utf-8'))

    def test_price_normalization_preserves_html_attributes(self):
        source = '<a href="/16,600円"><strong>1ページ</strong>16,600円〜</a>'
        result = bm_pricing.normalize_price_html(source)
        self.assertIn('href="/16,600円"', result)
        self.assertIn('25,740', result)
        self.assertEqual(result, bm_pricing.normalize_price_html(result))
        self.assertEqual(bm_pricing.normalize_price_text('116,600円'), '116,600円')

    def test_feed_uses_canonical_slug_and_valid_xml(self):
        from xml.etree import ElementTree
        feed = module('build-feed.py')
        result = feed.build_item({'id': 7, 'slug': '../outside', 'title_ja': 'A & B',
                                  'thumbnail': 'https://contentsx.jp/a?x=1&y="2"'}, 'column')
        item = ElementTree.fromstring(result)
        self.assertTrue(item.findtext('link').endswith('/column/column-7'))
        self.assertIsNone(item.find('pubDate'), 'no date is omitted, never filled with the clock')

    def test_indexnow_covers_entire_push_and_initial_push(self):
        indexnow = module('indexnow-ping.py')
        before, after = 'a' * 40, 'b' * 40
        with patch.dict('os.environ', {'INDEXNOW_BEFORE': before, 'INDEXNOW_AFTER': after}), \
                patch.object(indexnow.subprocess, 'check_output', return_value='index.html\nworks/test.html\nsitemap.xml\njs/test.js\n') as git:
            self.assertEqual(indexnow.get_changed_urls(), [
                'https://bizmanga.contentsx.jp/', 'https://bizmanga.contentsx.jp/works/test',
                'https://bizmanga.contentsx.jp/sitemap.xml'])
            self.assertEqual(git.call_args.args[0][-3:], [before, after, '--'])
        with patch.dict('os.environ', {'INDEXNOW_BEFORE': '0' * 40, 'INDEXNOW_AFTER': after}), \
                patch.object(indexnow.subprocess, 'check_output', return_value='index.html\n') as git:
            indexnow.get_changed_urls()
            self.assertEqual(git.call_args.args[0][1], 'ls-tree')

    def test_missing_artists_page_does_not_publish_data(self):
        artists = module('build-artists.py')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            data = root / 'artists-data.js'
            data.write_text('original', encoding='utf-8')
            with patch.object(artists, 'ROOT', root), patch.object(artists, 'DATA_PATH', data), \
                    patch.object(artists, 'HTML_PATH', root / 'missing.html'), \
                    patch.object(artists, 'fetch_artists', return_value=[{'title': 'Artist'}]):
                with self.assertRaises(FileNotFoundError):
                    artists.main()
            self.assertEqual(data.read_text(encoding='utf-8'), 'original')

    def test_xml_validation_prevents_publishing_invalid_feed(self):
        from xml.etree.ElementTree import ParseError
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'feed.xml'
            with self.assertRaises(ParseError):
                write_text(path, '<rss><unclosed></rss>')
            self.assertFalse(path.exists())


class StaticBuildIssue86Tests(unittest.TestCase):
    """Generated pages must follow the same copy, page-count, date and markup rules as the hand-written pages."""

    def test_ratio_copy_with_middle_dot_is_normalized(self):
        columns = module('build-columns.py')
        cases = {
            # The three published passages (comic-creation-tool-business, x-twitter-business-manga-2, 1koma-business-manga).
            '分担の目安は<strong>人間7割・AI3割</strong>で、': '分担の目安は<strong>独自の制作メソッド</strong>で、',
            '加えて、人間7割・AI3割のハイブリッド制作により、': '加えて、独自の制作メソッドにより、',
            '<strong>人間7割・AI3割のハイブリッド（次世代ニューマンガ）</strong>':
                '<strong>独自の制作メソッド（次世代ニューマンガ）</strong>',
            # The existing separators keep working.
            '「人間7割×AI3割」の体制': '独自の制作メソッド',
            '人の手7割xAI3割': '独自の制作メソッド',
        }
        for source, expected in cases.items():
            with self.subTest(source=source):
                self.assertEqual(columns.normalize_brand_text(source, prices=False), expected)
                self.assertEqual(columns.sanitize_content_html('<p>' + source + '</p>'), '<p>' + expected + '</p>')
                self.assertEqual(columns.normalize_brand_text(expected), expected, 'idempotent')
        prose = '裏を返すと、業として設計しても7割は人の作業として残ります。'
        self.assertEqual(columns.normalize_brand_text(prose), prose, 'only the ratio copy is replaced')

    def test_old_price_range_copy_is_normalized(self):
        excerpt = '営業資料・採用案内を「伝わる」コンテンツに。1ページ1万円台の高コスパ漫画制作サービスの活用法と2026年最新トレンドを解説。'
        result = bm_pricing.normalize_price_text(excerpt)
        self.assertIn('1ページ25,740円〜（税抜・原稿料別途）の高コスパ', result)
        self.assertNotIn('1万円台', result)
        self.assertEqual(bm_pricing.normalize_price_text(result), result, 'idempotent')
        # Market rates and other amounts are not BizManga's price.
        for text in ('1ページあたり1万円台から2万円台規模を中心に', '21ページ1万円台'):
            self.assertEqual(bm_pricing.normalize_price_text(text), text)
        # The excerpt reaches meta, OG, JSON-LD and the list card.
        columns = module('build-columns.py')
        column = {'id': 506, 'slug': 'business-manga-sales-recruiting', 'title_ja': 'T', 'excerpt_ja': excerpt}
        page = columns.build_detail_page(column, {'content': '<p>Body</p>'},
                                         columns.TEMPLATE_PATH.read_text(encoding='utf-8'))
        card = columns.build_card(column)
        for output in (page, card):
            self.assertNotIn('1万円台', output)
            self.assertIn('1ページ25,740円〜（税抜・原稿料別途）', output)
        article = next(d for d in (json.loads(m[1]) for m in re.finditer(
            r'<script type="application/ld\+json">(.*?)</script>', page, re.S)) if d['@type'] == 'Article')
        self.assertEqual(article['description'], result)
        self.assertIn(f'<meta property="og:description" content="{result}">', page)

    def test_page_count_prefers_real_gallery(self):
        from bm_build import work_page_count, work_pages_label
        gallery = [f'https://cms.contentsx.jp/p{i}.webp' for i in range(3)]
        work = {'id': 'sample', 'title_ja': 'Sample', 'category': '採用', 'gallery': gallery,
                'pages': 10, 'spec': {'pages': '10P', 'period': '1か月'}, 'show_site': 'both'}
        self.assertEqual((work_page_count(work), work_pages_label(work)), (3, '3P'))
        manual = dict(work, gallery=[])
        self.assertEqual((work_page_count(manual), work_pages_label(manual)), (10, '10P'), 'manual value without images')
        self.assertEqual((work_page_count({'pages': '?'}), work_pages_label({})), (0, ''))

        works = module('build-works.py')
        detail = works.build_detail_page(work, works.TEMPLATE_PATH.read_text(encoding='utf-8'))
        self.assertIn('<dd>3P</dd>', detail)
        self.assertNotIn('10P', detail)
        self.assertNotIn('全10ページ', detail)
        # The category modal data counts the full gallery even though only five images are embedded.
        long_work = dict(work, gallery=[f'https://cms.contentsx.jp/q{i}.webp' for i in range(7)])
        payload = json.loads(works.build_category_works_json([work, long_work]))
        self.assertEqual([(w['pages'], w['spec']['pages'], len(w['gallery'])) for w in payload],
                         [(3, '3P', 3), (7, '7P', 5)])

        lp = module('build-lp-cases.py')
        self.assertIn('採用 / 3P / 1か月', lp.render_card(work))
        self.assertEqual([w['id'] for w in lp.select_top([dict(work, id='few'), dict(long_work, id='many')], 2)],
                         ['many', 'few'], 'ties are ordered by the real page count')

    def test_lp_comment_is_quoted_once(self):
        lp = module('build-lp-cases.py')
        cases = {
            '「漫画にしたことで伝わりました。」': '「漫画にしたことで伝わりました。」',
            '漫画にしたことで伝わりました。': '「漫画にしたことで伝わりました。」',
            '  「前後に空白」\n': '「前後に空白」',
            '「A」と「B」': '「A」と「B」',
            '"手書き派"でも使える': '「&quot;手書き派&quot;でも使える」',
        }
        for comment, expected in cases.items():
            with self.subTest(comment=comment):
                card = lp.render_card({'id': 'sample', 'title_ja': 'Sample', 'comment': comment})
                quote = re.search(r'<blockquote class="lpv2-case__quote">(.*?)</blockquote>', card)[1]
                self.assertEqual(quote, expected)
                self.assertNotIn('「「', card)
        self.assertNotIn('blockquote', lp.render_card({'id': 'sample', 'title_ja': 'Sample', 'comment': '「」'}))

    def test_column_dates_are_shared_by_page_sitemap_and_feed(self):
        from xml.etree import ElementTree
        from bm_content import column_modified_ymd
        today = '2026-10-15'
        self.assertEqual(column_modified_ymd({'date_ymd': '2026-10-14', 'modified_ymd': '2026-10-05'}, today),
                         '2026-10-14', 'a scheduled post saved before publication')
        self.assertEqual(column_modified_ymd({'date_ymd': '2026-09-01', 'modified_ymd': '2026-10-05'}, today),
                         '2026-10-05')
        self.assertEqual(column_modified_ymd({'date_ymd': '2026-09-01', 'modified_ymd': today}, today),
                         '2026-09-01', 'a bulk "today" is not trusted')
        self.assertEqual(column_modified_ymd({'date_ymd': '2026-09-01'}, today), '2026-09-01')

        columns = module('build-columns.py')
        feed = module('build-feed.py')
        records = [
            {'id': 1, 'slug': 'scheduled', 'title_ja': 'Scheduled', 'date': '2026.10.14',
             'date_ymd': '2026-10-14', 'modified_ymd': '2026-10-05'},
            {'id': 2, 'slug': 'updated', 'title_ja': 'Updated', 'date': '2026.09.01',
             'date_ymd': '2026-09-01', 'modified_ymd': '2026-10-05'},
        ]
        template = columns.TEMPLATE_PATH.read_text(encoding='utf-8')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / 'sitemap.xml').write_text(
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>', encoding='utf-8')
            with patch.object(columns, 'ROOT', root), redirect_stdout(io.StringIO()), output_batch(root):
                columns.update_sitemap(records)
            sitemap = ElementTree.fromstring((root / 'sitemap.xml').read_text(encoding='utf-8'))
        ns = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
        lastmod = {e.findtext(ns + 'loc').rsplit('/', 1)[1]: e.findtext(ns + 'lastmod') for e in sitemap}
        for record in records:
            with self.subTest(slug=record['slug']):
                page = columns.build_detail_page(record, {'content': '<p>Body</p>'}, template)
                article = next(d for d in (json.loads(m[1]) for m in re.finditer(
                    r'<script type="application/ld\+json">(.*?)</script>', page, re.S)) if d['@type'] == 'Article')
                expected = column_modified_ymd(record)
                self.assertEqual(article['dateModified'], expected)
                self.assertEqual(lastmod[record['slug']], expected)
                self.assertGreaterEqual(lastmod[record['slug']], record['date_ymd'])
                self.assertIn(f'<meta property="article:modified_time" content="{expected}T00:00:00+09:00">', page)
        # The feed orders columns by the same date; news only has a dotted publication date.
        xml, count = feed.render_feed(records, [{'id': 9, 'date': '2026.10.12', 'title_ja': 'News'}])
        channel = ElementTree.fromstring(xml).find('channel')
        self.assertEqual([i.findtext('link').rsplit('/', 1)[1] for i in channel.findall('item')],
                         ['scheduled', 'news-detail?id=9', 'updated'])
        self.assertEqual(channel.findtext('lastBuildDate'), 'Wed, 14 Oct 2026 09:00:00 +0900',
                         'the newest article date, not the build time')
        self.assertEqual(channel.findall('item')[1].findtext('pubDate'), 'Mon, 12 Oct 2026 09:00:00 +0900')
        self.assertEqual(count, 3)

    def test_column_build_publishes_the_feed(self):
        source = (ROOT / '.github/workflows/build-columns.yml').read_text(encoding='utf-8')
        steps = re.split(r'\n      - ', source.split('\n    steps:\n', 1)[1])
        columns = next(i for i, s in enumerate(steps) if 'tools/build-columns.py' in s)
        feed = next(i for i, s in enumerate(steps) if 'tools/build-feed.py' in s)
        commit = next(i for i, s in enumerate(steps) if 'tools/commit-generated.py' in s)
        self.assertLess(columns, feed)
        self.assertLess(feed, commit)
        self.assertIn('continue-on-error: true', steps[feed], 'a feed failure must not stop the column pages')
        self.assertIn(' feed.xml', steps[commit].split('--message', 1)[1])

    def test_generator_steps_skip_while_wordpress_maintenance_is_on(self):
        # js/bm-wp-config.js の maintenance: true の間は WP から何も取り込まない（SPEC.md「WordPress 一時停止スイッチ」）。
        # ゲートより後ろの手順は全部 if: steps.gate.outputs.skip != 'true' を持つこと（feed の手順で漏れかけた。PR #95）
        for workflow in ('build-works.yml', 'build-columns.yml', 'build-lp-cases.yml'):
            with self.subTest(workflow=workflow):
                source = (ROOT / '.github/workflows' / workflow).read_text(encoding='utf-8')
                steps = re.split(r'\n      - ', source.split('\n    steps:\n', 1)[1])
                gate = next(i for i, s in enumerate(steps) if 'id: gate' in s)
                for step in steps[gate + 1:]:
                    self.assertIn("if: steps.gate.outputs.skip != 'true'", step, step.splitlines()[0])

    def test_hero_image_declares_its_real_ratio(self):
        works = module('build-works.py')
        base = 'https://cms.contentsx.jp/wp-content/uploads/2026/04/01-4'
        resized = {'thumbnail': base + '-192x300.webp'}
        self.assertEqual(works.hero_image_size(resized, base + '.webp'), (192, 300))
        self.assertEqual(works.hero_image_size(resized, base + '-192x300.webp'), (192, 300))
        for work, hero in (({'thumbnail': base + '-192x300.webp'}, base + '-other.webp'),
                           ({'thumbnail': base + '.webp'}, base + '.webp'), ({}, '')):
            self.assertEqual(works.hero_image_size(work, hero), works.HERO_FALLBACK_SIZE)
        page = works.build_detail_page(dict(resized, id='sample', title_ja='Sample', gallery=[base + '.webp']),
                                       works.TEMPLATE_PATH.read_text(encoding='utf-8'))
        hero = re.search(r'<div class="bm-work-detail-thumb">\s*(<img[^>]*>)', page)[1]
        self.assertIn('width="192" height="300"', hero)

    def test_templates_match_root_pages(self):
        def csp(text):
            return re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', text)[1]

        root_csp = csp((ROOT / 'works.html').read_text(encoding='utf-8'))
        for name in ('column-detail.html.tpl', 'work-detail.html.tpl', 'works-category.html.tpl'):
            with self.subTest(template=name):
                text = (ROOT / 'tools/templates' / name).read_text(encoding='utf-8')
                self.assertEqual(csp(text), root_csp)
                self.assertIn("gtag('config', 'AW-", text.replace("gtag('config','AW-", "gtag('config', 'AW-"))
                header = re.search(r'<header class="bm-header".*?</header>', text, re.S)[0]
                self.assertIn('<ul class="bm-cta-icons" aria-label="CTA">', header)
                self.assertIn('href="https://line.me/R/ti/p/@626kzaze', header)
                self.assertIn('href="tel:03-6261-0764"', header)
                self.assertNotIn('bm-nav-cta--line', text)
                for logo in re.findall(r'<img[^>]*class="bm-logo-img"[^>]*>', text):
                    self.assertIn('width="140" height="40"', logo)
                self.assertIn('<p class="bm-footer-company">Contents X 株式会社</p>', text)
                self.assertIn('href="/css/bizmanga.css"', text)
                self.assertIn('src="/js/bm-nav.js"', text)


class PublishTests(unittest.TestCase):
    """Exercise rebases against a local bare remote, never the project remote."""

    def test_generators_keep_pending_runs_and_checkout_latest_branch(self):
        for workflow in ('build-works.yml', 'build-columns.yml', 'build-lp-cases.yml'):  # rank-tracker.yml は不可侵領域のため対象外
            with self.subTest(workflow=workflow):
                source = (ROOT / '.github/workflows' / workflow).read_text(encoding='utf-8')
                concurrency = re.search(r'^concurrency:\n((?: {2}[^\n]+\n)+)', source, re.M)[1]
                self.assertIn('  group: bizmanga-generated-content\n', concurrency)
                self.assertIn('  cancel-in-progress: false\n', concurrency)
                self.assertIn('  queue: max\n', concurrency)
                self.assertEqual(workflow_checkout_ref(workflow), '${{ github.ref_name }}')

    def test_queued_sitemap_generators_preserve_both_updates(self):
        from xml.etree import ElementTree
        builders = {'works': module('build-works.py'), 'columns': module('build-columns.py')}

        def render(kind, root, date):
            record = {'id': 'review-work' if kind == 'works' else 7,
                      'slug': 'review-column', 'modified_ymd': date}
            with patch.object(builders[kind], 'ROOT', root), redirect_stdout(io.StringIO()):
                with output_batch(root):
                    builders[kind].update_sitemap([record])

        # Both schedules can start at the same SHA. Test either queue order.
        for first, second in (('works', 'columns'), ('columns', 'works')):
            with self.subTest(first=first), tempfile.TemporaryDirectory(prefix='bm-queue-test-') as directory:
                folder = Path(directory)
                remote, writer, queued = (folder / name for name in ('remote.git', 'writer', 'queued'))
                env = git_test_env()

                def git(cwd, *args):
                    return subprocess.check_output(['git', *args], cwd=cwd, env=env,
                                                   stderr=subprocess.STDOUT, text=True)

                def publish(cwd):
                    result = subprocess.run(
                        [sys.executable, '-B', str(ROOT / 'tools/commit-generated.py'),
                         '--message', 'generated sitemap', 'sitemap.xml'], cwd=cwd,
                        env=dict(env, GITHUB_ACTIONS='true', GITHUB_REF_NAME='main'),
                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                    )
                    self.assertEqual(result.returncode, 0, result.stdout)

                git(folder, 'init', '--bare', '--initial-branch=main', str(remote))
                git(folder, 'clone', str(remote), str(writer))
                (writer / 'sitemap.xml').write_text(
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>', encoding='utf-8')
                render('works', writer, '2026-01-01')
                render('columns', writer, '2026-01-01')
                git(writer, 'add', 'sitemap.xml')
                git(writer, 'commit', '-m', 'initial sitemap')
                git(writer, 'push', '-u', 'origin', 'main')
                git(folder, 'clone', str(remote), str(queued))
                event_sha = git(queued, 'rev-parse', 'HEAD').strip()
                render(first, writer, '2026-10-05')
                publish(writer)
                git(queued, 'fetch', 'origin', 'main')
                # Match checkout's explicit branch versus default event-SHA behavior.
                ref = workflow_checkout_ref(f'build-{second}.yml')
                git(queued, 'checkout', '--detach', 'origin/main' if ref == '${{ github.ref_name }}' else event_sha)
                self.assertEqual(git(queued, 'rev-parse', 'HEAD'), git(remote, 'rev-parse', 'main'))
                render(second, queued, '2026-10-06')
                publish(queued)
                xml = ElementTree.fromstring(git(remote, 'show', 'main:sitemap.xml'))
                ns = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
                dates = {entry.findtext(ns + 'loc'): entry.findtext(ns + 'lastmod') for entry in xml}
                urls = {'works': 'https://bizmanga.contentsx.jp/works/review-work',
                        'columns': 'https://bizmanga.contentsx.jp/column/review-column'}
                self.assertEqual(dates[urls[first]], '2026-10-05')
                self.assertEqual(dates[urls[second]], '2026-10-06')

    def test_rebase_preserves_independent_remote_change(self):
        self.exercise_push(conflict=False)

    def test_rebase_conflict_does_not_overwrite_remote(self):
        self.exercise_push(conflict=True)

    def exercise_push(self, *, conflict):
        with tempfile.TemporaryDirectory(prefix='bm-git-test-') as directory:
            folder = Path(directory)
            remote, writer, human = (folder / name for name in ('remote.git', 'writer', 'human'))
            env = git_test_env()

            def git(cwd, *args):
                return subprocess.check_output(['git', *args], cwd=cwd, env=env,
                                               stderr=subprocess.STDOUT, text=True)

            git(folder, 'init', '--bare', '--initial-branch=main', str(remote))
            git(folder, 'clone', str(remote), str(writer))
            (writer / 'generated.txt').write_text('base\n', encoding='utf-8')
            git(writer, 'add', 'generated.txt')
            git(writer, 'commit', '-m', 'initial')
            git(writer, 'push', '-u', 'origin', 'main')
            git(folder, 'clone', str(remote), str(human))
            human_file = 'generated.txt' if conflict else 'human.txt'
            (human / human_file).write_text('human\n', encoding='utf-8')
            git(human, 'add', human_file)
            git(human, 'commit', '-m', 'human edit')
            git(human, 'push')
            (writer / 'generated.txt').write_text('generated\n', encoding='utf-8')
            result = subprocess.run(
                [sys.executable, '-B', str(ROOT / 'tools/commit-generated.py'),
                 '--message', 'generated output', 'generated.txt'], cwd=writer,
                env=dict(env, GITHUB_ACTIONS='true', GITHUB_REF_NAME='main'),
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            )
            self.assertEqual(result.returncode == 0, not conflict, result.stdout)
            self.assertEqual(git(remote, 'show', 'main:generated.txt').strip(),
                             'human' if conflict else 'generated')
            if not conflict:
                self.assertEqual(git(remote, 'show', 'main:human.txt').strip(), 'human')
                # Re-running without generated changes makes no extra commit.
                before = git(remote, 'rev-parse', 'main')
                again = subprocess.run(result.args, cwd=writer,
                                       env=dict(env, GITHUB_ACTIONS='true', GITHUB_REF_NAME='main'),
                                       capture_output=True, text=True)
                self.assertEqual(again.returncode, 0, again.stdout + again.stderr)
                self.assertEqual(git(remote, 'rev-parse', 'main'), before)


if __name__ == '__main__':
    unittest.main()
