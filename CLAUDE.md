# BizManga (bizmanga.contentsx.jp) — Claude Code 引き継ぎ資料

## リポジトリ
- GitHub: `contents-x/web-bizmanga`（2026-11-04 に `josawa2255/bizmanga` から組織へ移管・改名。DNS の `bizmanga` は `contents-x.github.io`）
- デプロイ先: GitHub Pages → bizmanga.contentsx.jp
- DNS: お名前.com（CNAME）

## 表示言語

- サイトは全ページ日本語固定。`<html lang="ja">` を維持する。
- `js/bm-nav.js` はリタイアした `bm-lang` の保存値のみを安全に削除し、言語を切り替えない。
- 動的データは日本語フィールドのみを表示に使う。WordPress API が保持する他言語フィールドはこのサイト側から参照しない。
- 共通ナビゲーションは `js/bm-nav.js` だけを `defer` で読み込む。

## ページ構成

⭐ **ページ一覧の正は [SPEC.md §1](SPEC.md) の表**（本表は主要ページの抜粋）。全HTML（27本）の構成・章立て・LP一覧はそちらを参照。全ページ共通で `bm-nav.js` を読込む（以下「主要JS」はページ固有分のみ）。

| ページ | ファイル | ページ固有の主要JS |
|--------|---------|--------|
| トップ | index.html | bm-home.js, bm-hero.js, bm-hero-fx.js, bm-pre-production.js, bm-s3d-screens.js, bm-campaign-month.js（キャンペーン見出しを日本時間で切替: 期間限定版〈#127 Google広告・11/20まで〉の期限切れで月限定版に戻し、「○月限定」を当月に更新） |
| 制作事例 | works.html | bm-works-page.js |
| ビズ書庫 | biz-library.html | works.js |
| 料金 | pricing.html | （なし。2プランカード型料金表〈フル漫画家/ハイブリッド〉、2026-08-19刷新） |
| FAQ | faq.html | （なし） |
| お問い合わせ | contact.html | bm-lead.js, bm-contact.js（JS未読込時は送信を無効化し、再読み込み・電話連絡の案内を表示） |
| 資料ダウンロード | download.html | bm-lead.js, bm-download.js（CRM の受信箱「資料DL」へ送信＋PDFをその場でダウンロード。PDF の差し替え手順・公開範囲は [SPEC.md §5.2](SPEC.md)） |
| お客様の声 | testimonials.html / testimonial-detail.html | bm-testimonials-page.js / bm-testimonial-detail.js |
| コラム一覧/詳細 | column.html / column-detail.html | bm-wp-api.js、詳細は bm-column-detail.js |
| ニュース | news.html / news-detail.html | bm-wp-api.js、詳細は bm-news-detail.js |
| 漫画制作会社 比較ガイド | manga-production-company.html | mpc.js, mpc-scale.js, bm-fuwa.js |
| 用途別LP 8本 | product/recruit/sales/training/company/inbound/ir-manga.html, manga-ad-lp.html | （**全8本v2デザイン統一済**: bm-lp-v2.css/js。lpv2-*構造・hero_LP流用ヒーロー・関連7枚。recruitが型の正本） |
| ビズストーリー 商談用LP | lp-bizstory/index.html | lp-bizstory/bizstory.js（2026-11-02 新設・Issue #117。サイト共通のJS・CSSは読まない。noindex・sitemap とナビに載せない。詳細は SPEC.md §1 の同行） |
| 強み | strength.html | （**2026-08-05 v2デザインへ統一**: bm-lp-v2.css/js + アドオン css/strength.css（`body.str-v2` スコープ）。ヒーローは product-manga / manga-ad-lp と同型。旧 bm-strength.js は廃止。画像プロンプトは docs/strength-image-prompts.md。**2026-08-19** 「5つの強み」をコマ割りパネル `.str-panels`、「お悩み」を数字中心の横並び行 `.str-pain` に刷新。**段組み依存の調整は `@media (min-width: 701px)/(1001px)` で囲う**（詳細は SPEC.md §1 の同行）） |
| マンガの種類 | manga-types.html | bm-manga-types.js（**2026-09-10 HEROのみ「MANGA MAGAZINE × BUSINESS BRAND」版へリデザイン**〈PC横4層: 左コピー／中央メイン人物／右の漫画コマ4枚／最右の黒7ジャンル索引。画像は `images/manga-types/hero-*`。旧3コマ予告編ヒーロー `.mt-hero-trailer`/`.mt-trailer-*` は全廃。索引は既存ID `#mt-founding` 等へリンクし、`bm-manga-types.js` の `select()` が章セレクタと双方向に同期。**HEROの仕様の正本は SPEC.md §1 の同行**〉。HERO以外は **2026-08-31 「企業の物語を上映する映画館」版**のまま〈PR #26、2026-09-03 レビュー修正込み〉: PROLOGUE〈3コマ予告編・実写〉→BRIDGE→CHAPTERS 01–07〈**2026-09-10 一覧カード型へリデザイン**: 7枚の縦カード + 下に詳細。カードは `button[data-mt-select]` のままでJS・ヒーロー索引同期・`#mt-*` 直リンクは無変更。2026-09-11 ブラッシュアップで selected/hover を分離（`aria-current` 付与）、カード説明を短縮、詳細エリアの画像を水彩 `type-*` からカードと同じ `chapter-*` に統一、CHAPTERラベル追加〉→**HOW TO EXPRESS〈表現カスタマイズ / 2026-09-14 新設〉**〈旧「4つの表現形式」`#formats` と旧「画風選び」`#styles` を削除して統合（PC高さ約-51%）。左=導入+案内キャラ+手描き風コピー+CTA / 右=STEP01 表現形式 → STEP02 画風の各4カード。カードは `button[aria-pressed]` で `bm-manga-types.js` の `initExpress()` が各グループ1つ選択。旧 `.mt-fmt-*`/`.mt-sty-*` CSS は削除、旧画像ファイルは残置〉→**HOW TO CHOOSE〈選び方ミニガイド / 2026-09-14 新設〉**〈`#how-to-choose`。強弱「弱」の短いまとめ: 見出し+手描き補助コピー / WHO×WHAT×WHERE の3カード（画像 `images/manga-types/choice-*` + ピル3つ、JSなし）/ 相談CTA。参考デザイン右下の女性キャラは使わない〉→**FAQ〈よくあるご質問 / 2026-09-14 リデザイン〉**〈旧 AFTER TALK `lpv2-faq` を置換。4問の single accordion（`button[aria-expanded]` + region、`initFaq()`、初期Q1展開、JS無効時は全表示）+ 下部テキストリンク `/contact`。画像なし。FAQPage JSON-LD は表示文言に同期〉→**FINAL CTA〈LET'S MAKE YOUR STORY / 2026-09-14 リデザイン〉**〈旧 NEXT PRODUCTION MEETING（ダーク背景+マスコット）を置換。生成り背景・中央揃えの「1メッセージ + 1CTA（`/contact`）」+ 安心ポイント3つ。装飾は四隅の桃色の円・網点・縦 BIZMANGA のみ（画像 `images/manga-types/final-cta-*`）。人物なし〉。CSSは `css/manga-types.css`（`body.mt-v2` スコープ）、新規画像8枚は `images/manga-types/`（webp配信・pngは768px縮小フォールバック、C2PAメタデータ除去済み）。**各セクションの仕様・実装上の注意（`#mt-*` ハッシュ深リンク／章セレクタと表現カスタマイズの矢印キー／画像の実寸 width・height）の正本は SPEC.md §1 の同行**。画像プロンプトは docs/manga-types-image-prompts.md（C節は差し替え前の記録）） |
| 活用場面 | use-cases.html | js/bm-use-cases.js（**2026-08-24 「10の接点を巡る」エディトリアル版へ全面刷新**: 未コミット・作業中〈ブランチ `feat/manga-types-redesign`〉。2026-08-21版のLP v2流用構成（統計バー+4問クイズ+3列カード`.uc-scene-grid`+KPIストリップ）を廃止し、先行実装した [[manga-types.html]] の「7つの物語を巡る」章選択UIと同じ設計思想でページ固有パーツを `css/use-cases.css`（`body.uc-v2` スコープ、`uc-*` 名前空間）に全面再実装。構成: Hero（左=コピー、右=公式キャラ）→TOUCHPOINTS 01–10（左に9場面の横長リスト `button.uc-scene-row`〈名刺/HP・LP(02–03)/SNS/採用面接/サプライズ/マニュアル/提案資料/メルマガ/展示会〉、右に選択中の詳細 `article.uc-scene-panel`。切替は `js/bm-use-cases.js` が `aria-pressed` + `aria-live="polite"` で担当、`#uc-meishi` 等のハッシュ深リンク対応、**JS無効時は9グループすべて縦並びで残る**設計は `js/bm-manga-types.js` と同じ）→ONE STORY, MANY TOUCHPOINTS（`.uc-spread`、中心の「1 STORY」から6接点へ細線で分岐する図）→WHY MANGA WORKS（`.uc-why`、効果データ `.uc-why-data` 付きの本文プローズ、BtoBコラム3本・比較ガイドへの内部リンクは維持）→FAQ(4問)→RELATED(用途別LP 8本)→END CTA `.uc-cta`。**白抜き文字を敷く面・小さいオレンジ文字（18.66px未満）はすべて `--uc-accent-deep` に統一**（`.uc-btn--primary`/選択中の場面行 `.uc-scene-row.is-active`/各種ラベル・番号・本文中リンク等。`--uc-accent` #e85500 に白文字だと3.95:1でWCAG AA未達のため、manga-types.html で確立した既存トークンで5.50:1を確保。このページ限定で `lpv2-guide__eyebrow`/`lpv2-related-card__num`/`__arrow` も `.uc-v2` スコープで上書き）。9シーンの挿絵 `material/images/use-cases/*.webp` は当初チビキャラ風の独自画風（既存画像を流用）だったが、他ページとのブランド統一のため水彩+ink画風（manga-types/strength/recruit-manga系）へ**作り直し予定**。画像プロンプトは docs/use-cases-image-prompts.md（9シーン: 名刺/HP・LP/SNS/採用面接/サプライズ/マニュアル/提案資料/メルマガ/展示会。ChatGPTでの生成はユーザーが実施）） |
| その他 | pricing / privacy-policy / 404 / embed-viewer | 各ページ固有JS |

> 注: 旧 `pre-production.html` / `gallery.html` / `production-flow.html` は廃止済み（index.html に統合 or 削除）。存在しないので新規リンクしないこと。

## FAQ アコーディオン（faq.html）
- 複数項目の同時開きに対応済み（`classList.toggle('open')`）
- 以前: 一つ開くと他が閉じる排他パターン → 現在: 各項目独立で開閉

## 制作事例モーダル（works.html + index.html）
- タイトル+カテゴリタグ: `.work-detail-title-row` でflexbox横並び
- カルーセル: 1ページ目の縦横比で縦読み(vertical-scroll)/カルーセル切替
- フィルター: カテゴリ別絞り込み + カウント表示
- ⚠️ **同じDOMが index.html と works.html の2箇所にあり、動かすJSは別**（index=`js/bm-hero.js` / works=`js/bm-works-page.js`）。挙動を変えるときは**必ず両方**直す
- **スマホ縦読みは上下2ペイン分割**（上=漫画/下=詳細、読んでいる側が広がる）。`js/bm-wd-split.js` が担当。詳細は [SPEC.md §8.1](SPEC.md)

## 漫画ビューア（js/works.js）
- 見開き(spread)/縦スクロール(vertical)/強制縦(vertical_only) の3モード
- PCデフォルト: spread、SPデフォルト: vertical
- ページ送り: `waitForImage()` で画像読み込み完了を待ってからフラグ解除
- `isSpreadAnimating` フラグでクリック入力をゲート

## ⛔ 漫画表示・WP接続は絶対に壊さない（2026-09-15 平澤指示・レビュー必須領域）

- 対象: ビューア（`biz-library.html` `js/works.js` `js/bm-view-type.js` …）、ホーム（`index.html` `js/bm-hero.js` `js/bm-home.js`）、制作事例（`works.html` `js/bm-works-page.js` `js/bm-work-modal.js` …）、埋込（`embed-viewer.html`）、WP接続（`js/bm-wp-api.js` `js/bm-wp-config.js` `js/bm-sanitize.js`）、WP由来データを描くページ、静的ビルド（`tools/build-*.py` `tools/templates/` `.github/workflows/build-*.yml`）、`sw.js`。正確な一覧は [.claude/pr-gate-paths.txt](.claude/pr-gate-paths.txt)
- これらを触ったPRは PRレビューゲート（`~/.claude/hooks/pr-review-gate.sh`）が自動で HIGH にし、`gh pr merge` を止める。**確認手順の正本は [docs/REVIEW-MANGA-WP.md](docs/REVIEW-MANGA-WP.md)**
- 必ず `python3 tools/smoke-manga-wp.py --serve .`（内蔵サーバー 127.0.0.1:5500 で配信。`python -m http.server` は不可）を全 PASS にしてから、結果を添えて平澤さんのOKをもらい `--approve human` でマージ。**この領域は `--approve ai-clean` 不可**（ゲート側でも拒否）。`works/category/*.html` の事例モーダル（`js/bm-work-modal.js`）と3D画面はテストが見ないので目視
- 重要ファイルを増やしたら `.claude/pr-gate-paths.txt` にも足す（足し忘れるとゲートが素通りする）

## 公開範囲（2026-10-14 セキュリティ強化）⭐
- ⛔ **このリポジトリは PUBLIC。顧客情報・インフラ構成・未対応の弱点リスト・認証の手順をコミットしない**（ContentsX で内部資料が本番から取得できた件 = ContentX_HP/BUGS.md #067）。
- 本番に出るのは `tools/build-site-artifact.py` の**許可リスト**（HTML・CSS・JS・画像・動画・PDF・sitemap/feed と、名前を指定した `CNAME` `robots.txt` `llms.txt` `manifest.json` と検索エンジンの所有確認ファイル）だけ。`*.md`・`docs/`・`tools/`・`_archive/`・`serve.py` は公開しない。**新しい種類のファイルを公開したいときは許可リストに足す**（足さないと本番で 404）。検査は `tools/test_site_artifact.py`。
- デプロイは `.github/workflows/pages.yml`。**Settings → Pages → Source が「GitHub Actions」のときだけ**デプロイする（legacy＝ブランチから公開のままだと、従来型の公開処理がリポジトリ全体を同時に公開して競合する）。
- ⚠️ 自動ビルド（GITHUB_TOKEN での push）は push イベントでデプロイを起動しないため、`pages.yml` は `workflow_run`（コラム・LP事例・制作事例のビルド完了）でもデプロイする。**本番のファイルを書き換える自動ビルドを足したら `workflow_run.workflows` にも足す**。
- 公開範囲を変えたら `python3 tools/build-site-artifact.py && python3 tools/smoke-manga-wp.py --serve _site` で漫画表示を確認する（2026-10-14: 48 PASS）。

## 外部サービス
- HubSpot: Portal 48367061（ContentsXと共通）
- WordPress API: `https://cms.contentsx.jp/wp-json/contentsx/v1`（bm-wp-config.js）

本文のURLサニタイズはブラウザの `js/bm-sanitize.js` と静的生成の `tools/bm_html.py` で共通の方針を使う。
制御文字を拒否し、用途別にスキームを許可する。記事中の外部リンクは維持するため、
自社ドメインに制限する `bmSanitize.url` とは区別する。ニュースの「リンクURL」など外部サイトへのリンク先は、
同じスキーム規則の `bmSanitize.linkUrl` を使う（SPEC §12）。仕様と回帰検証は [SPEC.md §16.2](SPEC.md) を参照。

## GSC日次ランク追跡（2026-04-20〜稼働）
- 毎朝 JST 09:00 に `.github/workflows/rank-tracker.yml` が自動発火
- `tools/rank-tracker.py` が GSC Search Analytics API を叩き、ターゲットKW（新設時12件→現在約40件。BtoBマンガ/ビジネスマンガ 制作/採用マンガ/漫画制作会社など）の順位を取得
- 結果は `tools/rank-history.jsonl` に1行追記されて自動commit
- B + C 両サイト対応（`SITES` に両URL登録）
- 必要Secrets: `GSC_CLIENT_ID` / `GSC_CLIENT_SECRET` / `GSC_REFRESH_TOKEN`（登録済み）
- 追跡KW追加は `TARGET_QUERIES` 配列を編集

## 履歴メモ
- CORS は **解決済み**（WP API は本番からアクセス可。詳細は memory `project_cors_issue`）
- 最新の仕様・変更履歴は [SPEC.md](SPEC.md)、過去バグと再発防止は [../BUGS.md](../BUGS.md) を参照
