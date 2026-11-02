# 漫画表示・WordPress接続を触ったPRの確認手順（pr-gate 重要領域）

> **2026-09-15 平澤指示**: 「ビズ漫画の漫画の表示や WordPress との接続などは、絶対にバグらないようにしてほしい。
> そのあたりを触った場合は、そこが壊れていないかなどをレビューするようにしてください。」
>
> この文書は、その指示を機械的に守るための**確認手順の正本**です。
> トリガーは [.claude/pr-gate-paths.txt](../.claude/pr-gate-paths.txt)（触ると PR が HIGH になり `gh pr merge` が止まる）。
> ゲートの仕組み自体は `~/.claude/hooks/pr-review-gate.sh`（全プロジェクト共通）。

## 0. 対象（このどれかを触ったら本手順が必須）

| 領域 | ファイル | 壊れると何が起きるか |
|---|---|---|
| ビズ書庫ビューア | `biz-library.html` / `js/works.js` / `js/bm-view-type.js` / `css/works.css` | **QRコードで外部配布済み**の `/biz-library?manga=id` が開かない・ページ送りできない（BUGS #010/#012/#013） |
| ホーム | `index.html` / `js/bm-hero.js` / `js/bm-home.js` / `js/bm-works.js`（6件カード） / `js/bm-viewer.js`（`#bmViewerOverlay`） / `js/bm-pre-production.js` | Hero マーキー・ギャラリー（横読み/縦読み）が空になる（#051/#052） |
| 制作事例 | `works.html` / `js/bm-works-page.js` / `js/bm-wd-split.js`（事例モーダルのSP上下2ペイン） | 一覧・モーダルが出ない。**index と works は同じDOM（`#workDetailOverlay`）で別JS**（index=`bm-hero.js` / works=`bm-works-page.js`）なので両方見る |
| 事例カテゴリページ | `works/category/*.html`（ビルド生成） / `js/bm-work-modal.js`（**このページだけが使う**） | カテゴリページのカードクリックでモーダルが開かない。スモークテストは開かないので**目視必須** |
| 埋込・LP | `embed-viewer.html` / `js/bm-lp-library-embed.js`（用途別LP 8本の `data-bm-lp-library*`） | ホームの3D画面・用途別LPの書庫埋込が真っ黒 |
| WP 接続 | `js/bm-wp-api.js` / `js/bm-wp-config.js` / `js/bm-sanitize.js` | 全ページの WP 由来データが消える／XSS（#009/#039） |
| WP 由来データを描くページ | `artists.html` `js/artists*.js` / `testimonials.html` `testimonial-detail.html` `js/bm-testimonials*.js` / `column.html` `column-detail.html` `news.html` `news-detail.html` `js/bm-column-filter.js` / `js/bizanime.js` | 該当ページが空になる |
| 静的ビルド | `tools/build-*.py` / `tools/templates/` / `.github/workflows/build-*.yml` | `/works/{slug}` `/column/{slug}` が消える・古い文言で上書き（#021/#048） |
| Service Worker | `sw.js` | 表紙画像が古いまま／読めない |
| この仕組み自身 | `.claude/pr-gate-paths.txt` / `docs/REVIEW-MANGA-WP.md` / `tools/smoke-manga-wp.py` | ゲートやテストを緩める変更が素通りする（だからこれらも保護対象） |

WPプラグイン本体（PHP）は**別リポジトリ**（`~/Documents/contentX/web/contentsx-wp-plugin/`、PRIVATE）。
そちらを触った場合も、このリポジトリ側の確認（§1〜§3）を本番APIに対して実行する。

## 1. 自動スモークテスト（必須・最初にやる）

```bash
# 作業ブランチの worktree（リポジトリ直下）で。内蔵サーバーが 127.0.0.1:5500 で配信して検証する
python3 tools/smoke-manga-wp.py --serve .
```

`python3 -m http.server` は使わない（拡張子なしURL `biz-library?manga=` が 404 になり、必ず FAIL する）。
ポート 5500 は WP プラグインの CORS 許可オリジンなので、実際の CORS 設定のまま API が通る。
別ポート（`--port`）にすると API 応答を中継して通すため、CORS 設定そのものは検証されない。

確認していること（全部 PASS が条件）:

1. **WP API の生レスポンス**: `/works?site=bizmanga` `/works-new?site=bizmanga` `/library` `/news` `/columns` が件数>0、
   各作品に `id / gallery / view_type / thumbnail` があり、`/manga/{id}` の枚数が `/library` と一致、gallery 画像URLが到達可能
2. **ホーム**: Hero マーキーに表紙が並ぶ、`/works-new` をブラウザでも API と同じ件数で受信（フォールバックしていない）、
   ギャラリーのカード数が仕様どおり（横読み/縦読みに分けて各10件まで＝`js/bm-home.js` の `MAX_PER_GROUP`）、
   カードのクリックで `biz-library?manga=` へ遷移
3. **制作事例**: カードが出る → クリックでモーダル `#workDetailOverlay` が開き、漫画画像が実際に読み込まれ、読み込み失敗の画像が無い
4. **ビズ書庫**: グリッドの作品数が `/library` と一致 → クリックで `#mangaModal` が開き画像が読み込まれ、読み込み失敗が無い → 閉じられる
5. **QRモード**: referrer なしで `?manga=id` を開くと `html.qr-mode` が付く／サイト内遷移（referrer あり）なら付かない（#010）。
   作品は手書きデータ（`js/bm-fallback-works.js`）に**無い**ものを自動選択する（ビズ書庫の一覧の初期表示と埋込ビューアは WP に繋がらないとき
   手書きデータ・素材フォルダの画像を使うので、手書きデータにある作品だと開けたことが WP 接続の確認にならない）
5b. **QR直リンク（手書きデータにある作品）**: `FALLBACK_WORKS` にも**ある**作品（WP のギャラリーがある＝1枚目が WP の画像になり手書きデータと見分けられるもの・CTA 有効を優先して自動選択。2026-10 時点は `seko`）を
   `?manga=id` で開き、ページ数が WP のギャラリー枚数・1枚目が WP の画像・最終ページCTA が WP の `cta_enabled` どおりであること（CTA の URL は前後の空白を除いて比べる）。
   見るのは `/library` の応答が届いた後（届いても開き直さず WP のデータのままか。届かなければ FAIL）。
   さらに `/library` を止めても同じく `/manga/{id}` のデータで開くこと（Issue #71）。
   期待値は `--api` ではなく、ブラウザが実際に使う API（`works.js` の `WP_API_BASE`）から取る。その `/library` を取れなかったときは
   その1件を FAIL にし、5b・5c は理由を書いて飛ばす（SKIP。前提の FAIL があるので全体は不合格のまま）
5c. **QR直リンクの分岐**（API の応答はブラウザ側で差し替える。本番の WP は変えない）: ① `/manga/{id}` がプラグインの「作品が無い」404
   （本文は本番に存在しない ID を GET した実物）で `/library` にも無い → 「作品が見つかりませんでした」（手書きデータにある作品でも開かない）、
   ② 存在しない ID を実際の API で → 「作品が見つかりませんでした」とトップへのリンク、③ WP 停止（`/manga/{id}` と `/library` が 503）→
   「ただいま表示に時間がかかっています」と「再読み込み」ボタンが出て、手書きデータでは開かない。続けて WP を戻す（`/manga/{id}` を
   実際の API に通す）と、取り直しで WP のデータ（ページ数・1枚目）で開き、メッセージが消える（2026-10-15 方針: 直リンクは手書きデータで
   開かず、WP のデータが届くまで待つ）。あわせて、存在しない ID への `/manga/{id}` の応答がプラグインの形（本文に `error` があり `code` が無い）
   であることも確かめる（「作品が見つかりませんでした」を出すのはこの応答のときなので、形が変わったらここが FAIL する）。
   ①〜③の各ページも、他のページと同じく JS のエラー（未捕捉の例外・console.error）とサイト/素材の 404 が無いこと
   （わざと 4xx/5xx にした WP API の応答と、それに対するブラウザの読込失敗のログだけは数えない）
6. **埋込ビューア**: `embed-viewer.html?manga=id&manual=1` で画像が出る
6b. **埋込ビューア（WP 障害）**（WP の応答はブラウザ側で差し替える）: WP が 503・通信できない・メンテナンス中のとき、手書きデータ
   （`js/bm-fallback-works.js`）にある作品は素材フォルダの画像で、手書きデータのページ数・表示モード（縦読み専用）どおりに出る（素材に無い
   ページを読まない）。無い作品は画像を推測せず「表示に時間がかかっています」（メンテナンス中は「一時停止しています」）。WP が戻ると
   取り直して WP のデータ（1枚目・枚数）で出る。作品 ID の形でない値（`--` など）は問い合わせずに「NO PAGES」。
   ビズ書庫も、WP の `/library` が届かないとき一覧に手書きデータの作品がすべて出る（読込順が崩れると黙って空になるため件数で見る）
7. **スマホ**（390px）: `?manga=id` で `mode-vertical`（見開き作品もSPでは縦スクロール）で開き、`#modalManga` に画像が出る。
   `#mobileView` は見開き専用要素なので非表示が正常
8. **どのページでも** JS の未捕捉エラー・サイト/WP/素材ホスト（`*.contentsx.jp`）起因の console error や 404 が無い

失敗したら原因を直してから再実行。**テストの側を緩めて通さない**（緩めるときは平澤さんに理由を説明してOKをもらう）。
マージ後は本番にも同じテストを当てる: `python3 tools/smoke-manga-wp.py --base https://bizmanga.contentsx.jp`

## 2. 目視（自動テストが見ない部分）

- ビューア（PC）: 見開き→矢印/クリックでページ送り、`viewToggle` で縦読みへ切替、**最終ページCTA**（`cta_enabled` の作品で表示、他では出ない）
- ビューア（SP）: 縦読み、タップ左右でページ送り。制作事例モーダル（SP）は上下2ペイン分割（`bm-wd-split.js`）
- `/works/category/{slug}`（静的生成）のカードクリックでモーダルが開く（担当は `js/bm-work-modal.js`。**スモークテストは見ない**）
- ホームの3D画面（`index.html` 内の `embed-viewer` iframe）は http 配信だと CSP で描画されないので、本番または https で目視
- 縦読み作品（`view_type: vertical` / `vertical_only`）と見開き作品を**1つずつ**開く。判定は `window.bmViewType.*` に委譲されているか（自前判定を足していないか、#012/#013）
- ホーム: 横読み/縦読みの2グループに分かれている、新作の並び順が WP の「表示順」どおり（`cx_sort_order` 昇順）
- `/works/{slug}`（静的ページ）と `/works` 一覧のカテゴリフィルタ
- `bm-lang=en` が残ったブラウザでも、ビューアのUI文言が初回表示・動的読込後とも日本語のままである
- CSP メタを触った場合: `connect-src` / `img-src` に `https:`（cms.contentsx.jp）が残っている

## 3. WP 接続を触った場合の追加確認

- 生レスポンスを curl で数える（管理画面の設定を疑う前にまず API、#051）:
  `curl -s "https://cms.contentsx.jp/wp-json/contentsx/v1/works-new?site=bizmanga" | jq 'length'`
- **`/library` と `/manga/{id}` の両分岐**で同じ作品を確認（#012）。新フィールドは両エンドポイントに通す（#001）。
  ビズ書庫（`works.js`）は両方を `toMangaEntry()` で同じ形にし、QR直リンクはどちらか先に届いた方で開く（SPEC §2.1）
- `/manga/{id}` の「作品が無い」応答（404 と本文 `{"error":"not found"}`）の形や、作品 ID に使える文字（ルート）を変えるときは
  `works.js` の `readMangaAnswer()`・`isDirectIdLike()` も直す
- QR直リンクは手書きデータ（`FALLBACK_WORKS`）で開かない（SPEC §2.1。結果は「開く／作品が見つかりませんでした／表示に時間がかかっています＋再読み込み」の3つ）。
  `FALLBACK_WORKS` はビズ書庫の一覧の初期表示（WP 到着前）に使う（同じ一覧を埋込ビューアも WP 障害時に使う。下記）。WP に無い作品を QR で配るときは、先に WP に登録する（ただし WP に無いのは消した作品かもしれない。ルート BUGS.md #085）。
  `FALLBACK_WORKS` のページ数は**素材フォルダ（`contentsx.jp/material/manga/{id}/`）に実際にある枚数**（WP の値に合わせると素材フォルダに無いページが 404 になる）。表示モード（縦読み専用）は WP の `/library` に合わせる。素材フォルダの画像を増減したら・WP 側で表示モードを変えたら合わせて直す
  （WP の到着前に一覧から開いた作品が古い値で表示される。到着後の切替からは WP の値になる）。
  手書きデータの作品の一覧は `js/bm-fallback-works.js`（`window.BM_FALLBACK_WORKS`）。ビズ書庫の `FALLBACK_WORKS` と、埋込ビューアの「WP がエラー・通信できないときに素材フォルダの画像で表示してよい作品」を兼ねる。
  非公開にした（WP から消した）作品・ビズ書庫の一覧に出さない作品は載せない（載せると WP が届くまで、`/library` が失敗・0件ならその間ずっと一覧に出て開け、埋込ビューアでも WP 障害中に素材フォルダの画像が出る。2026-10 まで消した2作品が残っていた。smoke が確かめる）
- WP 出力を `innerHTML` に入れる箇所は `bmSanitize` 経由か（#039、`js/bm-sanitize.js`）
- 掲載先フラグは「未設定＝表示する」（SPEC §5 表示先・順序制御）。判定を `=== '1'` に戻していないか
- **フォールバック**: DevTools で `cms.contentsx.jp` をブロック（または `bm-wp-config.js` の `enabled:false`）してホーム・制作事例がローカルデータで表示され、真っ白にならない。
  ビズ書庫の QR直リンク（`?manga=id`）は手書きデータで開かず、5秒で「ただいま表示に時間がかかっています」と再読み込みボタンが出るのが正常（ブロックを外すと、待っている間に開く）。
  ビズ書庫は `bm-wp-config.js` の `apiBase` を使うが `enabled` は見ないので、確かめるときはブロックで
- `bm-wp-config.js` の `apiBase` を変えるときは、ビズ書庫（`works.js` の `WP_API_BASE`）も同じ値を使う。`biz-library.html` で `bm-wp-config.js` を
  `works.js` より前に読む順番を崩さない（`tools/check-site.py` が確かめる）
- PHP を直した場合: `php -l` → お名前.com 手動アップロード（#002）→ nginx キャッシュ最大10分を待ってから生URLで新値を確認（#048）

## 4. 静的ビルドを触った場合

- ローカルでビルドを回して生成物の差分を見る: `python3 tools/build-works.py && git diff --stat works/ works.html sitemap.xml`
  （意図しない大量削除・全件書き換えが無いか。テンプレ `tools/templates/` と生成HTMLを同時に直す、#021）
- ビルド直後は WP 側の nginx キャッシュで旧文言が入ることがある（#048）。生成物を grep して新値を確認するまでが1セット

## 5. 完了条件とマージ

1. §1 の自動テストが全 PASS（結果の PASS/FAIL 一覧をそのまま報告に貼る）
2. §2〜§4 のうち該当する項目を目視し、結果を報告に書く
3. `/code-review high` と `/security-review` の指摘に対応済み
4. 変更ファイル一覧・PRのURL・上記の結果を平澤さんに提示して **OKをもらう**
5. `bash ~/.claude/hooks/pr-review-gate.sh --approve human` を記録 → `gh pr merge`
   （**この領域では `--approve ai-clean` は使わない**。ゲート側でも ai-clean の記録は拒否される）
6. マージ後: 本番に §1 のテストを当てる（`--base https://bizmanga.contentsx.jp`）→ ブランチ削除

**ゲートの前提**: ゲートは `gh pr merge` を実行するセッションの作業ディレクトリ（または `cd <dir> && gh pr merge` の `<dir>`）の
リポジトリで採点する。採点できない場所（origin の無いワークスペース root など）からのマージは**拒否**される（fail closed）。

## 関連

- 過去バグ: [../../BUGS.md](../../BUGS.md) #001 #002 #004 #005 #008 #009 #010 #012 #013 #021 #039 #046 #047 #048 #049 #050 #051 #052
- 仕様: [../SPEC.md](../SPEC.md) §2.0b（embed-viewer）/ §5（WP API・フラグ）/ §8（事例モーダル）/ §9（ビューア）/ §10（SW）/ works 再ビルドルール
- Git 運用: [../github.md](../github.md) §4
