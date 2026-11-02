# BizManga 仕様書

**ドメイン**: bizmanga.contentsx.jp
**リポジトリ**: [josawa2255/bizmanga](https://github.com/josawa2255/bizmanga)
**デプロイ**: GitHub Pages（CNAME: お名前.com）
**最終更新**: 2026-05-13

> このファイルは BizManga 単体の仕様を記録します。忘れがちな特殊動作・URLパラメータ・共通コンポーネント・外部連携を一箇所に集約しておき、将来のメンテ時に参照します。

---

## 0. レイアウト原則 ⭐絶対 (2026-05-14 追加)

「端末ごとに見た目が崩れる/位置が飛ぶ」を構造的に防ぐためのルール。新規セクション・LP 作成時はこのルールに準拠する。

### 0.1 サイジング: media query ではなく `clamp()`
- **font-size / padding / margin / gap / min-width / height** は原則 `clamp(SP値, viewport連動値, PC上限)` で記述
- `@media (max-width:768px) { font-size: 14px }` のような **px の上書き分岐** は禁止 (`clamp(14px, 1.2vw, 16px)` に置換)
- 共通スケールは `:root` の `--fs-xs` 〜 `--fs-4xl` / `--sp-xs` 〜 `--sp-2xl` / `--section-py` を参照
- 高さは `aspect-ratio` で固定する (画像・スマホタイル・カードのカバー)

### 0.2 配置: `position: absolute` はコンテンツに使わない
- 見出し・ラベル・本文・ボタンなどユーザーが読む要素は **必ず flex/grid のフローに乗せる**
- 絶対配置は装飾 (notch, glow, ribbon, ::before/::after) と モーダルオーバーレイのみ
- 過去事例: s3d showcase の heading/labels を absolute にしたら、タイル拡大時に重なって表示崩れ → 2026-05-14 に flex-column に修正

### 0.3 media query で許される 3 ケース
1. **レイアウト構造の切替** (`grid-template-columns: 1fr 1fr` → `1fr`)
2. **要素の表示/非表示** (`display: none ↔ block`)
3. **方向の切替** (`flex-direction: row` → `column`)

それ以外で「PC では 24px、SP では 18px」のような px 上書きが出てきたら **clamp に統合する**。

### 0.4 標準デザイントークン (css/bizmanga.css :root)
```
--fs-xs .. --fs-4xl    : 11px → 56px までの 8段階フォントスケール
--sp-xs .. --sp-2xl    : 6px → 100px までの 6段階スペーシング
--section-py           : セクションの上下パディング (clamp(56px, 7vw, 96px))
--container-max / --container-pad : コンテナ幅
```

### 0.5 参考実装 (この原則で動いている既存セクション)
- `.s3d-section` (3Dスマホ showcase) — タイル幅 `clamp(260px, 19vw, 320px)` + gap `clamp(40px, 8vw, 220px)`
- `.bm-about` — `padding: var(--section-py)`、SP は layout (grid→block) のみ media query で切替
- `.bm-whatis-fold-*` — 見出し/バッジ/本文/リストすべて clamp、SP の media query は 2列→1列のみ

### 0.6 横溢れ防止は `clip`。sticky を殺さない（2026-10-14 / Issue #73・PR #78）
- `html` と `body` の横溢れ防止は **`overflow-x: hidden; overflow-x: clip;` の2行**。clip に対応したブラウザでは後の clip が勝ち、未対応の古いブラウザ（Safari 15 以前など）は hidden が残る（横スクロールは止まり、sticky だけ効かない＝修正前と同じ）。
  - 書く場所は **`css/bizmanga.css` と `css/works.css`（ビズ書庫）の2か所だけ**で、**値は必ず同じにする**。ビズ書庫（biz-library.html）は bizmanga.css を非同期（preload → onload）で読むので、届くのが遅い・読み込みに失敗した・切り替えが動かないときも横溢れを止めるため、同期で読む works.css にも置く（PR #78 再レビュー。bizmanga.css を止めて幅 2000px の要素を足すと、works.css に無い版は 320〜1920px の12幅すべてで横に動き、ある版は動かないことを実測）。
  - ⚠️ works.css は biz-library.html で bizmanga.css より後に書かれて勝つ。値がずれると bizmanga.css を直しても効かない（Issue #73 で works.css だけ hidden のまま残り、ビズ書庫のフィルターが追従しなかった原因）。
  - ⛔ それ以外のCSSには html/body の `overflow-x` を書かない。
- **理由**: `hidden`（`auto`/`scroll` も）はスクロールコンテナを作る。body が「一度もスクロールしない箱」になり、その中の `position: sticky` が追従しなくなる。2026-10-14 まで body が hidden だったため、コラム一覧・制作事例・ビズ書庫のフィルターと資料DLのフォームは sticky と書いてあっても追従していなかった。clip は横にはみ出した分を切り取る効果は同じで、スクロールコンテナを作らない。
- ⛔ **ページごとに html/body を clip で打ち消す書き方はしない**（以前の bizanime.css / use-cases.css / bizanime.js の打ち消しは共通側を直したので削除済み）。sticky を使う要素の祖先に `overflow: hidden` を足さない。切り取りたいときは `overflow: clip` か `clip-path: inset(0)`。
- **ヘッダーの高さは変数 `--bm-header-height`**（`css/bizmanga.css` の `:root` で 72px、`.bm-header { height: var(--bm-header-height) }`）。ヘッダー直下に貼り付ける帯・位置の計算はこの変数から: 帯は `top: var(--bm-header-height, 72px)`（コラム・制作事例・ビズ書庫のフィルター、LP の目次 `.lpv2-toc`、コラム詳細のプレビューバナー）、カード型（資料DLフォーム）は `top: calc(var(--bm-header-height, 72px) + 24px)`（=96px）。旧ヘッダー用の 56/60/68/80px を書かない。予備値の 72px は、変数を定義する bizmanga.css が届く前（ビズ書庫などは非同期で読む）や、別ファイル・インライン指定から読むときのため。各HTMLの head のインラインCSS（`.bm-header{…height:72px}`）は bizmanga.css が届くまでの仮の値で、同じ 72px。
  - **例外: bizanime のスマホ（1024px 以下）だけヘッダー 56px**。`css/bizanime.css` が **`body.ba-page` に `--bm-header-height: 56px`** を書き、ヘッダー本体（`.bm-header` の height と `.bm-header-inner`）、ヘッダー内のドロワー（`.bm-nav.open` の top）、Hero の余白（`.ba-hero` の margin-top・`.ba-scroll-wrap` の padding-top）がこの変数を読む。⚠️ 上書きを `.bm-header` の中に書かない（以前はそうなっていて、ヘッダーの外の帯や JS が読む値は 72px のままだった。PR #78 再レビュー）。bizanime には今のところ追従する帯は無い（変更前後でヘッダーの見た目は 320〜1920px の7幅でスクリーンショットが1画素も変わらないことを確認）。
  - JS で値を読むときは `:root`（documentElement）ではなく、使う要素（帯など）の `getComputedStyle` から読む（bizanime のスマホでは :root は 72px のまま）。
- **追従させない画面（帯が画面を覆いすぎる）**。目安: 貼り付いたとき、ヘッダー（72px）＋帯＋画面下の追従ボタン（`.bm-fab`、769px 以上 72px・768px 以下 56px。ビズ書庫・資料DLには無い）で画面の高さの約半分以上が埋まる画面では追従させない。値は実測で決めた（PR #78 レビュー）。
  - 制作事例（`.bm-category-filter`）とビズ書庫（`.works-filter`）: 追従は**共通クラス `.bm-sticky-filter`**（`css/bizmanga.css` に1回だけ定義。works.html・biz-library.html の両方のフィルターに付ける）で付け、`position: sticky; top: var(--bm-header-height, 72px)` と `@media (max-width: 768px), (max-height: 620px)` の `position: static` をまとめて持つ。⚠️ 各フィルターのクラスに position / top を書かない（works.css は bizmanga.css より後に書かれて勝つので、そこに sticky を書くと共通クラスの static を打ち消す）。ビズ書庫は bizmanga.css を非同期で読むので、届くまでの一瞬はフィルターが追従しない（普通の位置に置かれるだけで害は無い）。768px 以下は3〜4行（124〜356px）になり、ヘッダー込みだけで画面の約2〜7割（320px幅の制作事例で67%）。769px 以上でも10カテゴリで2行（制作事例 168px・ビズ書庫 160px）。制作事例は 72＋168＋72＝312px が 1024×600 で 52%・932×430 で 73%・844×390 で 80% を埋める。高さ 621px 以上（1366×768 のノートPCの表示域 約630〜660px で 47〜50%弱、1280×800 で 39%）は追従させる。ビズ書庫は追従ボタンが無いぶん少し余裕がある（ヘッダー込み 232px が 1024×600 で 39%・844×390 で 59%）が、同じ形のフィルターなので条件をそろえる。カテゴリが増えて3行になったら測り直す。
  - コラム（`.bm-column-filter`）: `@media (max-height: 430px)`（スマホ横向き）で `position: static`。帯は1行の横スクロール（54〜68px）と低いが、72＋68＋72＝212px が 844×390 で 54%・932×430 で 49% を埋め、本文が見えるのは 180〜220px だけになる。高さ 431px 以上（1024×600 で 35%、縦持ちスマホ 390×844 で 22%）は全幅で追従させる。
  - 資料DLフォーム（`.bm-dl-card`）: `@media (min-width: 861px) and (min-height: 940px)` のときだけ追従。カード（805〜820px）が画面より高いまま貼り付くと、貼り付いている間は送信ボタンが画面の下に隠れたまま動かないため（940px = 96 + 820 + 下の余白 24）。
- **追従する範囲**: sticky は親の箱の中でしか動かない。コラムは column.html の `.bm-column-listing`（フィルター帯・特集記事・一覧を包む箱。`BUILD:COLUMN_GRID` マーカーの外）で包み、一覧を過ぎたら CTA・フッターの上に残らないようにしている（以前は body 直下でフッターまで貼り付いていた）。制作事例は `.bm-container`、ビズ書庫は `.works-section` の中だけ。
- **帯の背景は不透明の白（`#fff`）で `backdrop-filter` は付けない**。以前の「白95%＋blur(8px)」は裏が5%しか透けず見た目はほぼ白なのに、スクロールのたびにぼかしを計算し直していた（外した前後の帯の画像の差は各色 最大 2〜5/255）。
- **一覧の先頭を帯のすぐ下へ戻すスクロールは、全ページ共通の `window.bmScrollBelowSticky(target, bar, options)`（`js/bm-nav.js` 末尾の独立IIFE）1つで計算する**（PR #78 再レビューで3か所の重複を統合）。呼び出し元の JS は bm-nav.js より後に defer で読む（`tools/check-site.py` の `DEPENDENCIES` で順序を検査）。
  - 送り先: 帯が追従している画面（帯の position が sticky）は「帯が貼り付き始める位置」＝ target の上端 − 帯の top − 帯の高さ − 帯の margin-bottom（帯の下に本来の余白を挟んで一覧の先頭が来る。帯の高さは行数で変わるので毎回実際の値を読む）。帯が追従しない画面（768px 以下・低い画面）は**固定ヘッダーの下端から 16px 下**に一覧の先頭。
  - `options.onlyIfBelow: true` は、今の位置が送り先より上（一覧の先頭より上にいる）なら動かさない。絞り込みのボタンで使う。ページ送りは常に送る。
  - 動きを減らす設定（`prefers-reduced-motion: reduce`）では瞬時に移動する。`behavior: 'auto'` は html の `scroll-behavior: smooth` に従ってしまう（ビズ書庫は works.css の smooth が bizmanga.css の reduced-motion 用 `auto` より後に書かれて勝つ）ので、html の scroll-behavior を一時的に auto にしてから `scrollTo(0, y)` する。
  - 使う場所: コラムのチップ（`js/bm-column-filter.js`、onlyIfBelow。先頭は表示中の特集記事、無ければカード一覧）／制作事例のページ送り（`js/bm-works-page.js`、常に）と「すべて」・カテゴリページの無いカテゴリのボタン（その場で絞り込む `<button>`、onlyIfBelow。カテゴリページのあるカテゴリは `<a>` でページ遷移なので対象外）／ビズ書庫のチップ（`js/works.js`、onlyIfBelow）とページ送り（番号・‹ Previous・Next ›、常に。`#gridPagination` へのクリック委譲で1か所。押したボタンが今のページ・押せない端なら動かさない）。
  - ⚠️ ビズ書庫のチップは**利用者が押したとき（`event.isTrusted`）だけ**スクロールする。WP の `/library` が届いたときの再構築は、選んでいたカテゴリを戻すために同じボタンを `.click()` する（isTrusted が false）ので、そこで動かすと一覧を読んでいる途中でページが跳ねた（PR #78 再レビュー。修正後は到着時のスクロール命令が0回）。
  - 以前との差（判断材料）: ビズ書庫の 768px 以下・低い画面（帯が追従しない）のページ送りは、以前の `worksGrid.offsetTop - 120`（一覧の先頭がヘッダーの下 48px）から「ヘッダーの下 16px」になり、一覧の先頭が **32px 上**に来る（制作事例と同じ）。以前は番号のボタンだけ戻り、‹ Previous・Next › は戻らなかった。今のページの番号を押したときは、以前は戻ったが今は動かない（ページが変わらないため）。
- コラム詳細のプレビューバナー（`?preview=1`、`js/bm-column-detail.js` がインラインで sticky を付ける）は `top: var(--bm-header-height, 72px)` と **`z-index: 999`（ヘッダーの 1000 より下）**。`top:0` だとヘッダーの上に重なりスマホでハンバーガーの中心が押せず、`z-index: 9999` だとヘッダーの重なり順の中にある PC のメガメニュー・1024px 以下のドロワーの先頭を覆い、PC ではメニューへポインタを下ろす途中でバナーに乗ってメニューが閉じ、押せなかった（いずれも実測）。
- 既知の制限（別 Issue）: ドロワー・モーダルを開いている間のスクロール止め（`body.bm-nav-locked` や `document.body.style.overflow = 'hidden'`）は body をスクロールコンテナに戻すため、開いている間だけ帯の追従が外れる（帯は本来の位置へ移り画面外に出る。閉じると元の位置に戻り、スクロール位置は変わらない）。ドロワー（ヘッダーの下を白で覆う）とビズ書庫のビューア（不透明）では見えない。制作事例のモーダル（黒85%の幕）では、幕の裏で帯が消えるのがうっすら見える。止める対象を html に移す修正は works.js・bm-hero.js・artists.js・bm-work-modal.js・bm-works-page.js・bm-nav.js にまたがるため別 Issue。
- 副作用（見た目は変わらない）: body は独立した配置の区切り（BFC）ではなくなったので、body の最初の子の `margin-top` が body の外に出る（LP・FAQ・料金などで `document.body.getBoundingClientRect().top` が 68〜72px になる）。html に背景が無く body の背景はキャンバスに描かれるため、表示は同じ（変更前後でスクロール位置0のスクリーンショットを比較し、差は同じ版どうしでも出る揺らぎのみと確認）。
- **横スクロールの判定は目的で使い分ける**（PR #78 再レビュー）。
  - 実際に横へ動くか（全ページ共通の検査。`tools/check-browser.py` 等）: `document.documentElement.scrollWidth <= innerWidth + 1`。html/body の clip で切った後の幅なので、はみ出して切り取られた内容があっても画面幅のまま＝この式では見つからない。`document.body.scrollWidth` は全ページ共通の検査に使わない（トップ・コラム一覧のスマホ幅では、変更前から innerWidth を超えるが横には動かない）。
  - 画面からはみ出して切り取られる内容が無いか（より厳しい）: `document.body.scrollWidth <= innerWidth`（切り取る前の中身の幅）。ビズ書庫の確認（`tools/smoke-manga-wp.py` のスマホ 390px「ビズ書庫の一覧に横スクロール無し」）はこちら（ビズ書庫は 390px で body.scrollWidth = 390。直リンク表示は一覧を隠すので、`?manga=` なしの一覧の表示で測る）。⚠️ documentElement に変えると、切り取られた内容を見逃す。

---

## 1. ページ構成

| ページ | ファイル | 主要JS | 説明 |
|---|---|---|---|
| トップ | `index.html` | bm-nav, bm-home, bm-hero, bm-hero-fx, bm-cta, bm-testimonials, bm-videos | Hero + ギャラリー + 制作過程 + 対談動画 + CTA |
| 制作事例 | `works.html` | bm-works-page | カード一覧 + モーダル（ページング20件） |
| ビズ書庫 | `biz-library.html` | works.js | 全漫画アーカイブ + ブックビューア |
| **ビズアニメ**（AI動画制作） | `bizanime.html` | `bm-nav` + `bizanime.js` | **Hero のみ実装（作業中）**。AI動画技術×クリエイターの演出力で、広告・VTuber・MV・IPまで手掛ける動画制作サービスの紹介ページ。詳細は §1b |
| **漫画家・作品紹介** | `artists.html` | `bm-nav` + `bm-kinsoku` + `artists.js` | **2026-08-29 新規作成**。**カード＝漫画家1人**（A〜Kの11名）。画風・用途・ジャンル等は**カードの単位ではなく絞り込みの軸**として使う。作家名は出さず記号で指名する運用（営業資料『ContentsX_漫画家作品紹介』に準拠）。詳細は §1c |
| 料金 | `pricing.html` | —（共通JSのみ） | **2026-08-19 全面刷新**: 2プランカード型料金表（フル漫画家プラン ¥33,660/ページ〜・原稿料別途33,660円/10P目安約37.0万円／ハイブリッドプラン ¥25,740/ページ〜・原稿料別途25,740円/10P目安約28.3万円、いずれも税抜）+ 3バッジ + プラン別本数割引ミニ表2枚（7P基準。フル漫画家: 1本33,660/3本30,320/5本28,260円/P、ハイブリッド: 1本25,740/3本23,200/5本21,600円/P。原稿料は各プラン単価と同額を別途）+ 特徴ストリップ4項目 + 比較ガイドaside。カードCTAは `/contact?plan=full\|hybrid`（§2.2のプリフィル連携）。旧3プラン体系（ライト/スタンダード/プレミアム、2026-07-02版）は廃止。「業界最安値級」表現は削除し「大手の約1/5の価格」に統一（値上げに伴う訴求見直し）。Service JSON-LDのOfferは表示価格と同期（lowPrice 25740 / highPrice 33660） |
| マンガの種類 | `manga-types.html` | `bm-nav` + `bm-kinsoku` + `bm-lp-v2.js` + **`bm-manga-types.js`** | **2026-08-31 「企業の物語を上映する映画館」版へ全面リデザイン（PR #26、2026-09-03 レビュー修正込み）**。2026-08-24版のヒーロー（公式キャラ+吹き出し+`.mt-hero-index`索引帯）を廃止し、予告編→本編→上映形式→上映後トーク→上映作品→次回作の制作会議、という上映体験に統一。CSSは共通 `css/bm-lp-v2.css` のトークンの上に `css/manga-types.css`（`body.mt-v2` スコープ、`mt-*` 名前空間）。基調は白 / 生成り / オレンジだが、**最終CTAだけはダーク（`--mt-ink`）の全幅セクション**（黒背景不使用の原則の例外）。<br>構成: **①HERO**（`.mt-hero` — **2026-09-10「MANGA MAGAZINE × BUSINESS BRAND」版へ全面リデザイン**。旧3コマ予告編ヒーロー〈`.mt-hero-trailer`/`.mt-trailer-*`/`.mt-hero-frame`/`.mt-hero-label`/`.mt-hero-sub`〉は全廃）。`.mt-hero-stage` を **PC横4層**のグリッドで組む: `grid-template-columns: 40fr 26fr 24fr` ＋ 最右の黒ジャンル索引は `position:absolute` で stage 右端に固定（stage の `padding-right: var(--mt-hero-nav)` と同幅）。高さは `min-height: clamp(700px, calc(100svh - 72px), 950px)`（`min-height` なので中身が増えても切れない）。<br>**［1］左コピー** `.mt-hero-copy`: アイブロウ `.mt-hero-eyebrow`（MANGA / CHANGES / BUSINESS. の3行、オレンジ・uppercase・`letter-spacing:.42em`、上に56pxのオレンジ罫）→ **H1「伝わるって、／こんなに強い。」**（`clamp(44px, 5vw, 92px)` / `line-height:1.02` / `letter-spacing:-.04em` / `word-break:keep-all`＋`overflow-wrap:break-word`）→ SEOキッカー `.mt-hero-kicker`（**「ビジネス漫画の種類・7ジャンルの選び方ガイド」を可視テキストで必ず維持**。H1がページ主題を含まなくなったため、これが検索意図との接点）→ リード3行 `.mt-hero-lead` → **USP3点** `.mt-hero-usp`（丸アウトラインのインラインSVG＋「最短/2週間納品」「1ページ/から対応」「シナリオ/制作無料」。絵文字不使用）→ 主CTA `.mt-hero-cta`（既存 `.mt-btn--primary.mt-btn--xl` を流用、`href="#chapters"` で `html{scroll-behavior:smooth}` により②へスムーススクロール）。<br>**［2］中央メイン人物＋背景装飾** `.mt-hero-figure`（`aria-hidden`、`grid-column:1/4` でコピー列〜コマ列を覆い、**装飾のクリップはこの要素の内側だけで行う**＝`.mt-hero` 自体に `overflow` を掛けない）。z順は 街並み `.mt-hero-city`(opacity .12) → オレンジブラシ `.mt-hero-brush` → 人物 `.mt-hero-man`（`height:96%` / `bottom:0` / `left:54%`＋`translateX(-50%)`、頭頂がHERO上部・腰から下がHERO下端で切れる。薄い `drop-shadow` のみ）→ 白筆文字 `.mt-hero-lettering`（ジャケット上。**≤1240px では非表示**）→ コマ（`z-index:4`）。人物がコピー列に食い込むため `.mt-hero-copy::before` に**可読性スクリム**を敷く（HEROと同じ地色＋網点を `mask-image` の放射グラデでフェード。単なる半透明板だと縁が四角く見える）。<br>**［3］右の漫画コマ4枚** `.mt-hero-panels`＝`.mt-hero-panel--1〜4`（縦flex・`justify-content:center`、幅 `min(100%, 268px, 27svh)`、4px黒枠、`rotate(-2/1.2/-1/2deg)` と `margin-right` 3/21/0/17% で「切り抜いて重ねた」ずらし、`margin-top:-3%` で微オーバーラップ）。各コマは 4:3 の `.mt-hero-panel__art` に `hero-panel-{recruit,engineer,presentation,executive}` を `object-fit:cover`、**コピーは画像に焼き込まず** `.mt-hero-panel__cap`（白地＋2px黒枠、わずかに回転）をコマ上に重ねる（1,3は左下／2,4は右下）。hoverは `translateY(-4px) scale(1.01)` のみ。<br>**［4］最右の黒7ジャンル索引** `.mt-hero-genres`（背景 #151515、幅 `clamp(126px, 10.4vw, 178px)`、HERO全高）。`a.mt-hero-genre`×7＝番号／英字／日本語名で、リンク先は**既存ID `#mt-{founding,recruit,casestudy,howto,product,training,profile}`**（新URLを作らない）。01が初期active、activeは番号オレンジ＋左3pxオレンジ縦ライン＋白文字。<br>**［2026-09-10 ブラッシュアップ］**: (a) `.mt-hero-copy::before` の可読性スクリムが x≈871 まで伸びて人物のシャツ・ネクタイ・胸元まで白く飛ばしていたため、**実測したコピー右端（H1 2行目 544px／リード 527px）に合わせて「x≈430まで不透明・x≈565で消滅」まで縮小**（`inset` の右を -70%→-8%、マスクを `radial-gradient(66% 52% at 28% 50%, #000 0 75%, transparent 96%)` へ）。顔（x 640–800）と胸元は半径の外＝完全に無加工。影も `drop-shadow(0 8px 16px rgba(0,0,0,.08))` まで落とした。(b) ブラシは 56%→48%（約14%縮小）・右上へ移動・`opacity .9→.72` で「背景の勢い」に後退（優先順位 H1 > 人物 > コマ > ブラシ）。(c) 筆文字は `left:51%/top:59%/width:15%` でジャケットの暗部に収め、地色へのはみ出しを解消。(d) 都市は `bottom:-1%→6%` で固定CTAの上に上端を出す。(e) **コマは4枚とも `--w`（幅）と `--ar`（縦横比）を個別化**して「カード一覧」感を解消: 01 `5/4`・02 `3/2`・03 `1/1`・04 `7/5`。**元画像は全て4:3なので、`--ar` を 4/3 からずらして初めて `object-fit:cover` のトリミングが効く**（小さい=左右を切る／大きい=上下を切る）。03 は `1/1` で横25%を落として左右端の中途半端な人物を除去。角度は ±1.5deg 以内（-1 / 0.5 / -0.5 / 1deg）、重なりは 7px、枠 4px `#111`、影は `2px 3px 0 rgba(10,10,10,.10)` まで削減。キャプションは `width:max-content` で内容なりの幅に。(f) **HERO主CTAのみ面色をブランドオレンジ `var(--lpv2-accent)` #e85500 に**（ページ内の他CTAは AA のため `--lpv2-accent-deep` のまま）。#e85500 に白文字は 3.66:1 なので、**ラベルを 19px/900 に上げて「大きい文字」(≥18.66px+bold → 3:1) の基準に載せている**。小さいオレンジ文字（アイブロウ・キッカー 12–13px）は生成り地で 3.95:1 になるため `--mt-accent-deep` のまま＝**面と罫線はブランドオレンジ／小さい文字は deep** という使い分け。(g) USPはアイコン30px統一・アイコン⇔文字9px・項目gap均等・補助文字10.5px・両行 `line-height:1.5` でベースライン一致。(h) z-index を HERO内で整理（figure 1〈都市2→ブラシ3→人物4→筆文字5〉→ コマ 3 → コピー 4 → GENRES 5）。(i) **縦積みの適用範囲を `(max-width:767px), (max-width:1100px) and (orientation:portrait)` へ拡大**: iPad縦(820×1180)等では HERO高が 900px まで伸びる一方で横が狭く、高さ基準の人物が幅600px超になってコピー列を覆い（USP「制作無料」がネクタイ上で 2.05:1）頭頂も切れていた。600px以上の縦長タブレット向けに人物枠 560px・コマ gap 20px・キャプション 12px の専用調整を追加。(j) tablet(≤1100px 横長)は人物 `left:56%→60%`（ネクタイが USP 3項目目の下に来て 3.60:1 になるため、スクリムを広げず人物を逃がした）＋コマ寸法を再調整（絞りすぎるとキャプションが3行になりコマを覆う）。(k) **［最終微調整］** 筆文字を右下へ(+25px/+26px)・7%縮小して白シャツから完全にジャケット側へ／コマの横位置を右→左→右→左のジグザグに（1440px実測の右端 01=1258 / 02=1193 / 03=1278 / 04=1227、振れ幅 66→85px。角度・サイズは据え置き）／`.mt-hero-panels` に `margin-right:13px` を入れて**黒ナビとの間に約12pxの地色を残す**（ナビ側は不変。縦積みでは `margin:26px 0 0` で打ち消す）／都市を `bottom:6%→9%`（約23px上）で固定CTAの上に出す。(l) **［参考デザイン合わせ / 2026-09-10］** 提示されたHEROデザイン画像に寄せて: **コマを「4枚の独立カード」から「斜めのコマ割りで連続した1枚の漫画ページ」へ**。`.mt-hero-panels` を `align-self:stretch` + 天地の負マージンでHERO全高に裁ち落とし、各 `.mt-hero-panel` は `flex:1`、`.mt-hero-panel__art` を `clip-path: polygon(0 var(--mt-sl), 100% 0, 100% calc(100% - var(--mt-sl)), 0 100%)` の平行四辺形にし、隣接コマに `margin-top: calc(var(--mt-gut) - var(--mt-sl))` を掛けて**太さ一定の斜めの溝**を作る（先頭は上辺・最後は下辺だけ水平にしてHERO端で断ち切る）。コマの縦横比が可変になったため、トリミングは `--ar` ではなく `--z`（`transform:scale`）+ `object-position` で制御。**キャプションは clip の外＝`.mt-hero-panel` 直下に置く**ので、参考デザインどおり 02/03 をコマ左端から張り出せる。あわせて H1 を明朝→**太ゴシック `var(--lpv2-font-sans)`**、USPを**アイコン上・文字下＋項目間の細い縦罫**、CTA下に `— MANGA FOR A BRIGHTER TOMORROW`（`.mt-hero-tagline`）、黒ナビ下部に `BUSINESS STORIES…`（`.mt-hero-genres__foot`）を追加、列比は 40/26/24→**39/25/26**。**踏んだ落とし穴3点**: ①`.mt-v2 .mt-hero-panel + .mt-hero-panel`(0,3,0) は `.mt-v2 .mt-hero-panel--2`(0,2,0) に勝つので、縦積み側で**同じ隣接セレクタ形で `margin-top:0` を明示**しないと2枚目だけ14px高くなりキャプションがコマ外に出る。②ナビ下部英字はナビ幅が clamp 下限に寄る **1360px未満で5行に折り返して「07 PROFILE」と衝突**するため、その帯域では非表示（縦積みでは横並びで入るので再表示）。③タグラインは**固定CTAバー(.bm-fab)に隠れる**ため `min-width:1101px and min-height:860px` でのみ表示し、都市スカイラインに重なるので色は `--mt-ink`（`--mt-mute` では 2.78:1）。都市は 0.16→**0.13**（0.16 だと1920pxでタグライン背後が 4.07:1）。なお参考デザインの左下 `STORIES MOVE PEOPLE.` は固定CTAバーと必ず重なるため**不採用**。<br>**検証（コントラスト計測の注意）**: 背景色を測るとき `.mt-hero-copy` を `visibility:hidden` にすると**可読性スクリム `::before` ごと消えて**偽陽性が出る（USPが2.01:1 と誤検出）。文字だけ `color:transparent` にして測ること。この方法で 320〜1920px を再計測し、HEROコピーは最悪 **6.40:1**、全てAA達成／横スクロールなし／コマ→ナビ間隔14px。<br>**登場アニメーション**は JS ではなく CSS `@keyframes`＋`animation-fill-mode:both`（コピー→人物→コマ（右上から stagger）→索引、0.66〜0.9s / `cubic-bezier(.22,.68,.24,1)`）。**JSが落ちても要素が透明のまま残らない**のが `.is-visible` 方式との違い。`prefers-reduced-motion:reduce` で全アニメ／transition／hover変形を無効化。**レスポンシブ**: ≤1240px 筆文字を隠す（セレクタは `.mt-v2 .mt-hero-figure > .mt-hero-lettering` にすること。`.mt-v2 .mt-hero-figure > picture` の `display:block` が (0,2,1) で `.mt-v2 .mt-hero-lettering` (0,2,0) に勝つ）／≤1100px はナビを細く・コマを縮小し、**H1は `clamp(36px, 5.7vw, 68px)`**（6.6vw だと「こんなに強い。」7文字（約6.72em）がコピー列＝`(100vw - nav - padding)×46/94` に入らず `keep-all` が破れて「。」が孤立行になる）／≤767px は stage を縦 flex にして **コピー→人物→コマ→索引** の順に積み、索引は横スクロール＋`scroll-snap`（`scroll-padding-left:20px` が無いと先頭「01」が画面端に貼り付く）、コマは2列グリッド（<360pxで1列）。**`align-items:stretch` の明示が必須**（PCグリッドの `align-items:center` が残ると、中身が絶対配置だけの `.mt-hero-figure` が幅0になり、索引が936px幅のまま左右にはみ出す）。**下パディング `--mt-hero-pb` は `clamp(76px, 9vh, 104px)`**＝画面下端固定の `.bm-fab`（下から72px占有）に主CTAが潜り込まないための逃げ。**英語は `日本語固定表示` で `clamp(36px, 4.1vw, 74px)` に縮小**（同級数だと1行の文字数が減って4行になりCTAがファーストビューから落ちる。`bm-nav.js` が `documentElement.lang` を切り替えるのを利用）→**①b BRIDGE**（`.mt-bridge`。「PROLOGUE END — 7つの物語から、本編を選ぶ」の1行のみ。※ヒーローが「PROLOGUE」を名乗らなくなったので文言の見直し余地あり）→**②CHAPTERS 01–07**（`#chapters`。**2026-09-10 一覧カード型へリデザイン**。旧「左に横長の行一覧 `mt-chapter-row`×7 / 右に詳細（sticky）」の2カラムを廃止し、**上に7枚の縦カードを横一列、その下に選択中の章の詳細**という構成にした。<br>**見出し** `.mt-sel-head` は3段組（左=`Manga changes business.` / 中央=H2「**7つの物語を巡る。**」`clamp(38px,6vw,110px)` の太ゴシック + オレンジの補助コピー「ビジネスの課題に、最適なストーリーを。」+ 2行の説明 / 右=`Find your story.` と「気になる章からお選びください」+ 手描き矢印 `chapter-arrow-handdrawn`）。1100px以下は中央1段組にし、左右の英字は1行に畳んで横並びにする。<br>**カード** `ul.mt-chapter-cards` は `grid-template-columns: repeat(7, minmax(0,1fr))`。中身は **`button.mt-chapter-card[data-mt-select]` のまま**なので、`bm-manga-types.js` の章セレクタ・**ヒーロー右端のジャンル索引との双方向同期**・`aria-pressed`/`aria-live`・↑↓←→キー・`#mt-*` の直リンク・JS無効時の7章縦並びは**すべて変更なしで動く**。カードは画像(4:5) + 番号/ジャンル名/説明/丸チェブロン、枠1px・角丸なし、選択中と hover で上辺に4pxのオレンジバー。<br>**詳細** `.mt-chapter-detail` はカードの下に回ったので `position:sticky` を解除し、`max-width:980px` で中央寄せ。760px以上では `.mt-chapter-panel` を「左=挿絵 / 右=本文」の見開き2カラムにした（**`.mt-chapters-layout.is-js .mt-chapter-panel.is-active{display:block}` と同詳細度(0,5,0)なので、この上書きは必ずその後ろに置くこと**）。パネル7本の中身と `type-*.png` は無変更。<br>**背景**: セクション地をHEROと同じクリーム+網点にし、下端に `chapter-cityscape`(opacity .12)、左下に `chapter-orange-brush`(opacity .42) を敷く（`.mt-sel-bg`、560px以下でブラシは非表示）。<br>**画像**: `images/manga-types/chapter-{origin,recruit,case-study,howto,product,training,profile}.webp/png`（webp 540px q80 / png 432px 256色。合計約390KB、すべて `loading="lazy"`）+ 装飾3枚。**画像内に縦組み英字は入っていないため、HTML側でも追加していない**（番号・ジャンル名・説明はすべてHTMLテキスト）。<br>**レスポンシブ**: 7列 →1240px:4列 →900px:3列 →680px:2列 →339px:1列（**360/375/390pxは2列を維持**。1列にするとセクションが5000px超になり一覧として機能しないため）。<br>**注意**: カード本文は `bm-kinsoku.js` の SELECTORS に `.mt-chapter-card__desc` を追加した上で、CSSで `word-break:normal; overflow-wrap:break-word; line-break:strict` を明示すること。グローバルの `word-break:keep-all` + `overflow-wrap:anywhere`（bizmanga.css）が効いていると**文全体が1語扱いになって任意位置で折れ、word joiner が無視され末尾の「。」が1文字だけ落ちる**。<br>**［2026-09-11 ブラッシュアップ］**: (a) **selected と hover を明確に分離**。hover は浮き上がり(-4px)のみで枠色を変えず、selected は「2pxのブランドオレンジ枠 + 上辺4pxオレンジライン + 地色 #fffaf4 + 番号をオレンジ + 丸矢印をオレンジ塗り + 画像 `saturate(1.08)`」。**番号は 18px だと白地で 3.53:1 で AA 未達のため、選択中だけ `clamp(19px,1.45vw,22px)` に上げて「大きい文字」(≥18.66px+bold → 3:1)の基準に載せている**。JS側で `aria-current="true"` も付与（`aria-pressed` と併用）。(b) **カード説明文を短縮**し、`<br>` で2行構成に（`HTML本文` 付き）。7列で「共感と信頼を生み出します。」13文字が1行に入るよう、コンテナ 1360→**1440px**・gap `clamp(10px,1vw,14px)`・本文の左右padding `clamp(8px,0.72vw,11px)`・本文上限 **11.5px** に調整し、**1241px以上で最大3行**に収めた（文字を極端に縮めず、文言側で解決）。(c) **詳細エリアの画像を水彩タッチの `type-*` からカードと同じ `chapter-*` に統一**（カードと同一ファイル＝追加リクエストなし）。カードは4:5、詳細は `aspect-ratio: 1/1` でトリミングし、**主役が切れないよう `#mt-* .mt-chapter-panel__illust img` に章ごとの `object-position` を指定**（05は `48% 34%` で表情＋タブレット、02は桜、03は工場、07は都市背景を残す）。webp は詳細表示(約428px)に耐えるよう 820px q78 へ再生成。(d) **章ラベル `.mt-chapter-panel__label`**「CHAPTER 05 / PRODUCT」をタイトル上に追加（mono・`letter-spacing:.26em`・`--mt-accent-deep`・左に26pxのオレンジ罫）。大きな番号 `__num` は `z-index:0` / `rgba(232,85,0,.09)` に落として背面の装飾に徹させ、ラベル・見出しは `z-index:1`。(e) **カード→詳細の接続**として、選択中カード下端に小さなオレンジ三角 `::after` を出す。**7列＝1行で並ぶ 1241px 以上に限定**（複数行のときは隣の行を指してしまうため）。(f) 章切替に `mt-chapter-in`（opacity+8px上げ / 0.32s）を追加し、カードクリック時のみ `revealDetail()` で詳細が画面外なら寄せる（ヒーロー索引・ハッシュ経由は既存のスクロールに任せる）。`prefers-reduced-motion` で無効。(g) 詳細 `.mt-chapter-stage` の余白を `clamp(26px,3.4vw,48px)` に広げ、雑誌記事の1ページらしくした。<br>**TOPボタン（`.bm-back-to-top` / bizmanga.css）**: 問い合わせCTAと同じ塗りオレンジで優先順位が並んでいたため、**白地＋オレンジ枠＋濃オレンジ文字・小型化（padding 16/48→11/20、font 16→13px）**に変更。`#EB5200` も `--bm-accent-hover`(#d44900, 4.42:1) も白地13pxでAA未達なので、**`--bm-accent-deep: #b94100` を bizmanga.css の `:root` に追加**（値は `--lpv2-accent-deep` と同じサイト既存色）して 5.50:1 を確保。**このボタンは `bm-nav.js` が `.str-hero/.uc-hero/.mt-hero` を持つページにだけ生成するため、影響範囲は manga-types と use-cases の2ページ**。→**③相談セクション**（**2026-09-14 削除**。見出し「次のチャプターに迷ったら、課題だけ聞かせてください。」の `.mt-consult`〈ラベル INTERMISSION / STORY CONSULTATION、数値3件、導線3つ〈`/contact` + LINE + `tel:`〉、`character-cta.webp` + 吹き出し `.mt-bubble`〉をHTML・CSS（`.mt-consult*` と、このセクション専用だった `.mt-bubble*`）とも撤去。画像ファイルは残置。現在は ④HOW TO EXPRESS → ④b HOW TO CHOOSE → ⑤AFTER TALK の順）→**④HOW TO EXPRESS — 表現カスタマイズ**（`#express`。**2026-09-14 新設**。ページを短くするため、旧「4つの表現形式」`#formats`（`.mt-formats`/`.mt-fmt-*`）と旧「画風選び」`#styles`（`.mt-styles`/`.mt-sty-*`）を**削除して1セクションに統合**。両セクションとも内部リンク・他ページからの参照は無し。旧CSS（manga-types.css 5 / 5b、計658行）は manga-types.html 専用だったので削除、`bm-kinsoku.js` の `.mt-sty-point__text` も `.mt-exp-step__desc` に差し替え。旧画像 `format-*`/`style-*` は参照ゼロになったが**ファイルは残置**。旧 `#formats` 末尾の「1ページから発注可能です。…料金ページ」注記も旧セクションと一緒に削除された。高さは PC1440px で 1865→約920px（-51%）、1024px で 4016→1178px（-71%）、390px で 7220→1895px（-74%）。<br>**強弱**: 「7つの物語を巡る」より弱い中間セクション。幅は `.mt-sel-container`（7つの物語と同じ max 1440px）を共用。<br>**余白と画像の高さ（2026-09-14 追加調整）**: 上下 padding は上 `clamp(14px, 2.6vh, 36px)`・下 `clamp(16px, 2.4vh, 28px)`（旧 `clamp(64px, 8vh, 104px)`。下の余った余白を削除）、STEP箱・見出し・矢印・カード内マージンも縮小。一時は画面の高さで画像を削る `max-height`（`100svh` 基準）を掛けて一画面に収めたが、**カード画像が見切れて見づらいという指摘で撤去**し、画像枠を縦に広げた: **STEP01 は `aspect-ratio:1/1`**（1コマ=上端合わせで人物+吹き出し全体、4コマ=正方形素材でノートリミング、**ストーリー型だけ `object-fit:contain` + 枠の背景を白**〈4:3素材を正方形に cover すると左右のテキストボックスが切れるため〉、縦読み=上端合わせで端末の上半分）、**STEP02 は `aspect-ratio:4/3` + `object-position: 50% 0%`**（16:10 では吹き出しが切れていた。少年漫画調のみ `45% 0%`）。その分セクションは下に伸びる（1440x900 で約844px、STEP下端は画面内だが固定CTAにかかる）。<br>**左** `.mt-exp-intro`（`28fr`）= `__text`（`How to express` / H2「どう見せるかでも、／印象は変わる。」`clamp(26px,2.85vw,42px)` / オレンジ「4つの形式 × 4つの画風」/ 説明4行）+ `__aside`（案内キャラ `expression-guide-character`〈透過PNG、`aspect-ratio:1/1` + `object-position:50% 0` で上半身のみ〉と**手描き風コピー `.mt-exp-guide__note`（HTMLテキスト、`rotate(-9deg)`、`::before/::after` の短線、顔横に `.mt-exp-guide__spark` の集中線3本）** / CTA「最適な組み合わせを相談する →」白地+オレンジ枠ピル / 補助ポイント3つ〈吹き出し・電球・人の線画アイコン、`<br>` で2行〉）。<br>**右** `.mt-exp-steps`（`72fr`）= `STEP 01 表現形式を選ぶ`（1コマ/4コマ/ストーリー型/縦読み、画像 `aspect-ratio:4/3`、タグ=用途）→ 下向きオレンジ矢印 `.mt-exp-arrow` → `STEP 02 画風を選ぶ`（ビジネス・王道/少年漫画調/劇画・重厚/ポップ・親しみ系、画像 `16/10` で顔まわり、タグ=印象）。各STEPは `div[role=group][aria-labelledby][data-mt-exp-group]`、見出し h3 に sr-only の「STEP 01 」、タグ前に sr-only の「用途：」「印象：」。<br>**選択UI**: カードは `button.mt-exp-card[data-mt-exp-option][aria-pressed]`。初期選択は **1コマ × ビジネス・王道**（HTMLに直書き＝JS無効でも表示）。`bm-manga-types.js` の `initExpress()` がグループ内で1つだけ `aria-pressed="true"` にする（送信・診断・16通りの表は持たない）。見た目は CSS が `[aria-pressed="true"]` で切替: オレンジ枠（`border` + `box-shadow:0 0 0 1px` で実質2px）/ 右上のオレンジ丸チェック `.mt-exp-card__check`（`opacity`+`scale`）/ 名前を `--mt-accent-deep`。hover は `translateY(-3px)` + 弱い影のみで枠色は変えない。<br>**画像トリミング**: 1コマ `50% 16%`（人物+吹き出し）/ 4コマ・ストーリー `50% 50%`（構成全体）/ 縦読み `50% 0%`（端末上部のノッチと両側ベゼルでスマホと分かる。全体を contain にすると端末が小さくなりすぎるため）/ 画風は `50% 16%`（少年漫画調のみ `40% 20%`）。<br>**タグの1段化**: PC4列でも「商品紹介・SNS」「使い方・ハウツー」が1段に入るよう、カード padding `6px 5px`・タグ padding `3px 7px`・gap 4px・級数 `clamp(9.5px,0.64vw,11px)`。<br>**日本語改行**: 説明文系に `word-break: normal; word-break: auto-phrase;`（非対応ブラウザは normal）。<br>**レスポンシブ**: **1279px以下**で左右→上下（`.mt-exp-intro` 自体を2カラム=左テキスト/右キャラ・CTA、STEPは全幅で4列。1280px未満の左右2カラムではカードが約170pxまで痩せタグが2段に崩れるため）、900px以下カード2列、700px以下は導入を1列、560px以下でSTEP説明を見出し下へ、379px以下で補助ポイント1列、339px以下でカード1列。<br>**④b HOW TO CHOOSE — 選び方ミニガイド**（`#how-to-choose`。**2026-09-14 新設**。表現カスタマイズの直後に置く短いまとめで、ページ内の強弱は「弱」＝大型化しない）。CSSは `css/manga-types.css` の「5b. HOW TO CHOOSE」、JSなし・登場アニメなし。背景は表現カスタマイズと同じ生成り＋網点を継承（上端に `--mt-line` の細罫）、padding `clamp(48px,5vw,76px)`、幅は `.mt-sel-container`。見出し: `How to choose` ラベル → H2「迷ったら、この3つだけ。」（`clamp(24px,2.4vw,36px)`＝前セクションH2より小さく。「3つ」は `<em>` で `--mt-accent`・1.2em〈大きな太字なので3:1基準〉）→ 説明1文。右上に**手描き風の補助コピー**「まだ決まっていなくても／大丈夫です！／私たちが一緒に／整理します！」（HTMLテキスト、`rotate(-8deg)`＋擬似要素の短い線2本）と、薄い透かし英字 `.mt-choose__watermark`（aria-hidden、≤1179pxで非表示）。**カード3枚** `ol.mt-choose-list`（01 WHO 誰に伝える？ / 02 WHAT 何を伝える？ / 03 WHERE どこで使う？）: 番号は大きな `--mt-accent`、英字は薄いオレンジ（aria-hidden。h3内に読み上げ用「01 WHO」）、画像 `images/manga-types/choice-{who-team,what-message,where-media}`（背景透過。**透明余白を切り詰めて760px幅に縮小**し、webp配信＋同名pngは256色に最適化して上書き）を `aspect-ratio:760/540` の枠に `object-fit:contain`（WHOは枠いっぱいに描かれているので92%・下端合わせでボリュームを揃える）、背後に `--mt-accent-tint` の半円、下にピル3つ。カード間の「×」は `li + li::before` の2本のグラデーション線（テキストではないので読み上げない）。カード内に本文は置かない。**相談CTA** `.mt-choose-cta`（薄いオレンジ枠）: 左=「最適なマンガの／ご提案は、私たちにお任せください。」＋小さな説明2文、右=既存 `.mt-btn--primary`（面色 `--mt-accent-deep`、影なし）「あなたに合うマンガを相談する →」`/contact` ＋ 補助3点（表現カスタマイズと同じ線画SVGアイコンを再利用）。**参考デザイン右下の女性キャラは使わない**（右列をボタン＋補助3点の中央揃えにして余白として処理）。レスポンシブ: ≥1180px 3列（1180pxでもピル1段）/ **≤1179px 縦積み**＋カードは「見出し＋ピル | 画像」の横長、「×」は縦の流れ / ≤560px カードは縦（見出し→画像→ピル）、CTAは中央揃えで改行を外し補助3点はアイコン上・文字下。高さの目安: 1440x900 で約890px、768x1024 で約1445px、390x844 で約1780px。`bm-kinsoku.js` の SELECTORS に `.mt-choose__lead` を追加。<br>**検証**: 320〜1920pxの17サイズで横スクロールなし・JSエラーなし・H2全幅2行・STEP見出し1行・PC4列でタグ1段・カードからのはみ出しなし・集中線とコピーの重なりなし。クリック/Space/Enter で各グループ1つだけ選択、JS無効時は初期選択を表示、reduced-motion でアニメ・transition 無効、EN切替確認済み。新規テキストは全てAA達成（STEP番号「01」は27px＝大文字基準3.60:1、チェックは非テキスト3.66:1））
| 活用場面 | `use-cases.html` | `bm-nav` + `bm-kinsoku` + `bm-lp-v2.js` + `js/bm-use-cases.js` | **2026-08-24 「10の接点を巡る」エディトリアル版へ全面刷新**（未コミット・作業中、ブランチ `feat/manga-types-redesign`）。2026-08-21版のLP v2流用構成（統計バー`.lpv2-hero-stats-bar`+4問クイズ`.lpv2-related-card`流用+3列カード`.uc-scene-grid`+KPIストリップ`.lpv2-kpi-strip`）を廃止し、先行実装した manga-types.html（「7つの物語を巡る」章選択UI）と同じ設計思想でページ固有パーツを `css/use-cases.css`（`body.uc-v2` スコープ、`uc-*` 名前空間）に全面再実装。構成: Hero（左=コピー、右=公式キャラ）→TOUCHPOINTS 01–10（左に9場面の横長リスト`button.uc-scene-row`〈名刺/HP・LP(02–03)/SNS/採用面接/サプライズ/マニュアル/提案資料/メルマガ/展示会〉、右に選択中の詳細`article.uc-scene-panel`。切替は`js/bm-use-cases.js`が`aria-pressed`+`aria-live="polite"`で担当、`#uc-meishi`等のハッシュ深リンク対応、**JS無効時は9グループすべて縦並びで残る**設計はmanga-types.jsと同じ）→ONE STORY, MANY TOUCHPOINTS（`.uc-spread`、中心の「1 STORY」から6接点へ細線で分岐する図）→WHY MANGA WORKS（`.uc-why`、旧末尾インラインstyle長文を効果データ`.uc-why-data`付きの本文プローズに再構成、BtoB系コラム3本・比較ガイドへの内部リンクは維持）→FAQ(4問、既存FAQPage JSON-LDと同一文言)+比較ガイドaside→RELATED(用途別LP 8本、manga-types等と同一ブロック)→END CTA `.uc-cta`。**白抜き文字を敷く面・小さいオレンジ文字（18.66px未満）はすべて`--uc-accent-deep`に統一**（`.uc-btn--primary`/選択中の場面行`.uc-scene-row.is-active`/各種ラベル・番号・本文中リンク等。`--uc-accent` #e85500に白文字だと3.95:1でWCAG AA未達のため、manga-types.htmlで確立した既存トークンで5.50:1を確保。このページ限定で`lpv2-guide__eyebrow`/`lpv2-related-card__num`/`__arrow`も`.uc-v2`スコープで上書き。ただし関連LPカードの hover 中〈黒地 #0a0a0a〉だけは番号を `--uc-accent`〈#e85500, 5.40:1〉に戻す＝accent-deep のままだと3.60:1に落ちるため〈2026-10-15 Issue #82〉）。9シーンの挿絵`material/images/use-cases/*.webp`は当初チビキャラ風の独自画風（既存画像を流用）だったが、他ページとのブランド統一のため水彩+ink画風（manga-types/strength/recruit-manga系）へ作り直し予定。生成プロンプトは[docs/use-cases-image-prompts.md](docs/use-cases-image-prompts.md)（ChatGPTでの生成はユーザーが実施）。 |
| 強み | `strength.html` | `bm-nav` + `bm-kinsoku` + `bm-lp-v2.js` | **2026-08-05 LP v2 デザインへ全面刷新**（旧 Bento グリッド `str-*` 独自デザインと `js/bm-strength.js` は廃止）。ヒーローは product-manga / manga-ad-lp と完全同型（`recruit-hero-v2` 全面背景 + 左コピー + pill CTA 2本）。構成: Hero→強みインデックス5枚→CH01 PROBLEM(3 pain)→BRIDGE→CH02 MECHANISM(merit 5枚・5枚目のみ横長)→CH03 PROOF(ネーム→完成 Before/After + 3 KPI)→CH04 COMPARISON(他社比較表)→CH05 FAQ(6問)+比較ガイドaside→RELATED(用途別LP 8本)→END CTA。CSS は `css/bm-lp-v2.css` + `css/strength.css`（全セレクタを `body.str-v2` でスコープ、他LPに非干渉）。**本文は他LPよりワンサイズ大きい**（悩み15.5px / 仕組み15.5px / FAQ15.5px、行長38em上限）— 読ませる文章量が多いページのため。**中央揃えの字送り補正あり**: `letter-spacing` は末尾文字の後ろにも効くため中央寄せテキストが ls/2 だけ左にズレる（SOLUTION / TO BE CONTINUED で実測 −3.0px）。`padding-left` に同量を足して相殺（`text-indent` と違い2行目以降にも効く）。**この症状は8本のLP全部に存在するが、未修正**。画像13枚は `images/strength/` に配置済み（ChatGPT Image 2.0 生成、水彩＋線画でrecruit系に統一。生成プロンプトと画風の正本は [docs/strength-image-prompts.md](docs/strength-image-prompts.md)）。**2026-08-19 セクション刷新**: 「5つの強み」はFORMATSカード型から `.str-panels`（PC上段2枚+下段3枚／タブレット2列／SP1列）のコマ割りへ変更。「お悩み」は `.str-pain`（大きな数値を主役にした横並び行）へ変更し、黒/オレンジの斜め割りバナーを追加。**旧「常時表示の本文」は `.str-pain__detail`（開閉）へ移動**し、行末の締め文3つと導入の「この3つに集約されます」は削除（2026-09-16 レビューで記録）。見出し横の半分カット吹き出しと集中線は日本語固定表示に伴い常時表示する。レイアウト依存の調整は各段組でのみ適用する。パネルの浮き上がりは `@media (hover: hover)` と `prefers-reduced-motion` でガード。料金表記は現行の1ページ25,740円〜を維持。 |
| FAQ | `faq.html` | — | 複数項目同時開閉対応 |
| お問い合わせ | `contact.html` | — | HubSpot Forms API連携 |
| 資料ダウンロード | `download.html` | `bm-nav` + `bm-tracking` + `js/bm-download.js` + CRM `inbound-v1.js` | 2026-09-28 新設。フォーム入力でサービス資料PDFをその場でダウンロード、CRM の受信箱「資料DL」へ届ける。詳細は §5.2 |
| 制作過程カルーセル | `index.html`（プリプロ枠） | bm-pre-production | 旧 `pre-production.html` は廃止し index.html に統合（`bm-pre-production.js` は index.html のみ読込）。`works.js` の `_isPreProduction` フラグはビューア内の制作過程データ識別に現役。スライドのクリックは `biz-library?manga={キー}` へ遷移し、`/preproduction` の項目のキーは `pre-red-wp{投稿ID}` / `pre-name-wp{投稿ID}`（`works.js` の `registerPreproductionItems()` と同じ形。2026-10 / Issue #84。§2.1）。ページ数はギャラリー枚数を優先（手入力の pages の方が多くても存在しない画像を読まない） |
| お客様の声 | `testimonials.html` | bm-testimonials-page | WP連携 |
| 制作フロー | `index.html#flow` セクション | bm-flow | トップページのギャラリー後に統合。旧 `production-flow.html`（リダイレクト用HTML）は削除済み・sitemapにも無し |
| プライバシーポリシー | `privacy-policy.html` | — | 個人情報保護法準拠。11条構成（事業者情報・取得情報・利用目的・第三者提供・外部サービス連携・安全管理措置・開示請求・Cookie・未成年・改定・窓口）。日本語固定表示対応。全ページフッターからリンク |
| ニュース | `news.html` / `news-detail.html` | bm-wp-api | WP連携。一覧は `bm-wp-api.js` が `/news?site=bizmanga` を描き、取得が終わった合図（`bm-news-ready`）で「読み込み中...」を消す。0件は「現在、お知らせはありません。」、取得失敗（3秒のタイムアウト含む）・WP接続が無効なときは「ニュースを読み込めませんでした。時間をおいて再度お試しください。」を同じ位置に出す（2026-10-15 Issue #85。以前は漫画事例の取得完了で空の一覧を出し、失敗時は何も出なかった）。各行のリンク先は WP の「リンクURL」（`cx_news_url`、外部サイト可）→ 本文があれば `/news-detail?id=` → どちらも無ければリンクなし。リンクURLは `bmSanitize.linkUrl`（http/https/相対のみ。§12）で確かめ、不正なら使わない |
| コラム一覧 | `column.html` | 静的ビルド + bm-column-filter（bm-wp-api は予備） | カードグリッド3列。**カードは `tools/build-columns.py` が `BUILD:COLUMN_GRID` マーカー間に書き出す静的HTMLが正**（`per_page=100`・`data-category`・読了時間つき。特集枠・カテゴリチップの件数は同じビルドの埋込JSON `#bm-column-data`）。**静的カードが1枚でもあれば `bm-wp-api.js` は `/columns` を取得せず、一覧も作り直さない**（2026-10-15 Issue #85。作り直すと特集記事の重複・カテゴリ色と読了時間の消失・51件目以降の欠落・選択中のチップの解除が起きていた）。静的カードが無いときだけ WP から描く。特集の記事は先頭カード `bm-column-card--featured` としてもグリッドに出し、PC（769px〜）は特集枠で見せてこのカードを隠す／スマホ（〜768px）は特集枠を隠してこのカードを見せる（css/bizmanga.css。#74 と同じ方式）。新しく WP に公開したコラムが一覧に出るのは次のビルド後（詳細ページ `/column/{slug}` と同じタイミング）。ホームにも横スクロール枠あり（こちらは bm-wp-api が最新8件を描画） |
| コラム詳細(動的) | `column-detail.html` | `js/bm-column-detail.js` | `?id={post_id}` で WP API `/columns/{id}` から取得。目次自動生成・関連記事・日本語固定・OGP動的更新。Editorial Magazineデザイン。目次の飛び先（本文の `h2#sec-N`）は `scroll-margin-top: calc(var(--bm-header-height, 72px) + 28px)`＝100px（`css/bm-column-detail.css`。固定ヘッダーの下に28px空けて出す。静的コラムの `css/bm-column-static.css` と同じ値。2026-10-15 まで無く、見出しがヘッダーの下に隠れていた。Issue #88） |
| コラム詳細(静的SEO) | `column/{slug}.html` | GitHub Actions | `tools/build-columns.py` で自動生成。Article JSON-LD・OGP・GA4完備。毎日3時（JST）+ 手動実行。**検索結果・SNS 向けのタイトルと説明文**（`<title>`・`og:title`・`twitter:title`／`description`・`og:description`・`twitter:description`・JSON-LD の `description`）は、WP のコラム編集画面の「SEOタイトル」「SEO説明文」（API の `seo_title` / `seo_description`）を優先し、空なら記事タイトル／`DESC_OVERRIDES`・抜粋・本文の冒頭を使う。見出し h1・JSON-LD の `headline`・パンくず・一覧カードは記事タイトルと抜粋のまま（カードの文と検索結果の説明文を別々に書ける）。2欄とも先に1000字で切り（極端に長い値でビルドが止まらないように）、タグを外し、WP が保存時に変えた `&lt;` などを文字に戻し、空白をまとめてから `normalize_brand_text()` をかける。SEOタイトルの末尾に編集者が書いたサイト名（「｜ビズマンガ」「｜ContentsX」「｜コラム」など）は外す（サイト名はテンプレートが「 | コラム | ビズマンガ」を付ける。C と共有する記事でも二重にしない）。SEO説明文は200字で切る（2026-10-26 Issue #110。それまで欄は保存されるのに使われていなかった）。この2欄は管理画面でだけ入れられる（REST からは書けない）。**目次自動生成**: 本文の `<h2>` をパースして `id="sec-N"` 付与+`<nav class="bm-col-toc">` を hero 直下に挿入。h2が2個未満なら目次非表示。CSSは [tools/templates/column-detail.html.tpl](tools/templates/column-detail.html.tpl) 内、番号は `decimal-leading-zero`(01,02..)。2026-04-29 追加 |
| **用途別LP 8本** | `product-manga.html` / `recruit-manga.html` / `manga-ad-lp.html` / `company-manga.html` / `sales-manga.html` / `training-manga.html` / `inbound-manga.html` / `ir-manga.html` | `bm-nav` + WP API | 2026-04-26 公開。SEO中核。**v2 デザインシステム `css/bm-lp-v2.css` + `js/bm-lp-v2.js`（`lpv2-*` クラス）で8本すべて稼働**（2026-05-13 `recruit-manga.html` でパイロット導入→全LPへ展開。旧 `css/bm-lp-template.css`（`pm-*`）は削除済み）。各LPは Hero→Manifest(KPI 3 strip)→Chapter 01 PROBLEM→Bridge→Chapter 02 STRENGTH→Chapter 03 FORMATS→Chapter 04 CASE STUDY(WP API動的)→Chapter 05 LIBRARY(ビズ書庫埋込)→Chapter 06 PRODUCTION FLOW(8 Step, HowTo Schema)→Chapter 07 FAQ(12問, FAQPage Schema)→NEXT ISSUE(関連LP7本)→TO BE CONTINUED(Ending) の構成。JSON-LD 5種: WebPage + Service + BreadcrumbList(2階層) + FAQPage、`@id` で相互参照、`inLanguage: ja-JP`、`datePublished/dateModified` を最新化、Service に `url` + `audience` + `offers(/contact)`。FAQ は共通6問+LP固有2問の計8問構成（v2 LPは12問）。1位獲得が目標で `tools/rank-tracker.py` でKW追跡中 |
| **漫画制作会社 比較ガイド** | `manga-production-company.html` | `bm-nav` + `mpc.js` + `bm-fuwa` | 2026-04-27 公開、SEOブルーオーシャンKW「漫画制作会社」(月3,000-8,000検索)専用LP。専用CSS `css/mpc.css`。構成: Hero→Logoマーキー→PAIN(失敗の3パターン)→8選定基準→比較表(主要5社+ビズマンガ)→各社プロフィール→用途別マップ→FAQ(12問)→最終CTA。左sticky目次(1280px+)。JSON-LD 4種: Article + ItemList(6社) + BreadcrumbList + FAQPage。**2026-04-29 Xserver18項目に基づき可読性強化**: `mpc-mark`(マーカー強調)、`mpc-keyfacts`(業界数値の冒頭callout)、`mpc-pain-examples`(失敗パターン具体例リスト3行ずつ)、`mpc-summary`(比較表後の3行要約) を追加。**2026-05-12 SEO内部リンクハブ化**: 公開後ナビ登録のみで本文中リンクゼロ→Google重要度低判定→順位獲得未達という分析を踏まえ、pricing/faq/works/8用途LP の計11 HTML から `.bm-related-guide` aside で本文中アンカーテキスト付き内部リンクを集中投下。各LP固有のKW（採用マンガ対応の〜/IR漫画対応の〜 等）でアンカー多様化、ペナルティ回避と複合KW強化を両立。共通CSSは `css/bizmanga.css` 末尾。**ホーム(index.html)のバナー(`.bm-home-comparison-banner`)はCV重視で `/strength`（強み5選ページ）に流す方針** — 比較ガイド本体のコンテンツ完成度を訪問者向けに磨き上げるまで、検索流入経由でしか比較ガイドに到達しない設計にして他社情報経由のCV離脱を防ぐ。**2026-05-26 デザイン全面刷新 進行中(editorial路線へピボット)**: オレンジ全面のポップ路線から、アイボリー地＋黒セリフ見出し＋オレンジ差し色の上品なエディトリアル路線へ転換する方針。キービジュアルは手描きスケッチ調の天秤(¥コインvs時計)＋薄いマンガ絵コンテ背景(=ユーザーが用意した別デザイン、ビズちゃんは不使用)。**ヒーロー(TOP)から着手済み**。**一度作ったビズちゃん版①「漫画制作会社は何で選べばいいのか」セクション(mpc-choose)とそのCSSは削除済み**。**比較表(主要5社)は削除方針は維持**。**2026-05-26 ヒーローv3に全面刷新済み(`.mpc-hero-v3`、旧 `.mpc-hero-v2`+ビズちゃんbg/B案は廃止)**: editorial構成 = 比較ガイドpill→H1「漫画制作会社 比較ガイド」(SEO優先で漢字)→リード→**インタラクティブ天秤**→4比較ポイント(業界最安値/最短2週間/8用途/料金透明性)カードリスト→オレンジCTA「無料で比較してみる」→サブリンク。**天秤はユーザー生成の手描きスケッチ画像をパーツ分離して使用**(支柱固定/横棒回転/左右皿が上下、¥コイン・時計は皿画像に内包され連動)。素材は `material/images/mpc/scale-{stand,beam,pan-yen,pan-clock}-crop.webp`(4レイヤーをCSS%で絶対配置、配置座標はPython合成で確定→%化、横棒の `transform-origin:50% 27.8%`=支点)。※元画像 `images/scale_*_transparent_verified.png` 等はアルファ無し(透過プレビューを市松ごとRGB焼込み)だったため、こちらで「明るい・低彩度画素を透明化」(白ヒーロー上でコイン面/時計盤は白く見える)処理して webp 化。挙動JS=`js/mpc-scale.js`(`.comparison-scale`にホバー/タップで `is-tilt-left/right`、離脱で中央、初回0.6sアイドルスイング `is-idle-swing`、`prefers-reduced-motion`配慮、`(hover:hover)`でPC/スマホ分岐)。傾き角±7deg・transition `cubic-bezier(.2,.8,.2,1)`。色 #FF6A00/#111/#E8E1D8。CSSは `css/mpc.css` 末尾。**全サイズ崩れない設計**: 枠 `.comparison-scale` を `aspect-ratio:840/760` 固定＋内部は全%/deg なので、画面比率に関係なく相対配置(鎖↔皿連結)を維持し拡縮するだけ(320px〜超ワイドで検証済)。ヒーロー背景に薄いマンガ絵コンテ素材(白地に馴染む)を**PC/スマホで出し分け**: PCは縦長素材の中央スケッチ帯を切り出した横長版 `hero-bg-sketch-pc.webp` を `100% auto/center top`(左右のスケッチが天秤を挟む。**2026-06-01 `center`→`center top` に変更: 4ポイントQ&Aアコーディオン展開でヒーローが縦に伸びても背景が再センタリングされてズレないよう上端基準に固定**)、スマホ(≤640px)は縦長素材 `hero-bg-sketch.webp` を `100% auto/center top`(上部にスケッチを表示。元から上端基準で不動)。**※旧 `.mpc-hero-v2-*` CSS(~330行)と未使用画像 `material/images/mpc/hero-bg-{pc,sp}.webp` はデッドコード化(要掃除)**。**2026-05-27 ②セクション実装＝旧PAIN(失敗の3パターン)と旧8選定基準セクションをHTMLごと削除し、editorialの「依頼先を判断する基準」セクション(`#sec-choose`/`.mpc-choose`)に統合**: client-logos直下に配置。eyebrow `HOW TO CHOOSE`→H2「依頼先は、<em>何で見極めるか</em>」→リード→(keyfacts数値バンドは2026-05-27に削除)→`.mpc-choose-list`(付箋チェックリストの`<ol>`6項目=①料金が公開されているか ②用途への専門性 ③「伝わる構成」設計力 ④契約条件の明文化 ⑤サンプル&レスポンス速度 ⑥実績&アフターサポート)→末尾に比較表(`#comparison`)への導線。各項目末尾に `.mpc-choose-check`(「見極めポイント」callout)。CSSは `css/mpc.css` の旧criteria直後に `.mpc-choose-*` を追加(各項目は付箋カード(`#fffdf6`+影+折れ角dog-ear)で、チェックボックス `.mpc-choose-tick` を持つ。≤600pxは48px→38px列に縮小。**ワイド画面(≥881px)はコンテナ幅を `clamp(880px,76vw,1440px)` で画面幅連動拡大＋見出し/本文/余白も clamp+vw でスケールし、モニターでの左右余白を圧縮（単一列維持・チェック演出はそのまま）**)。**※クラス名 `mpc-choose` は旧ビズちゃん版から再利用だが完全に別物(editorialの判断基準セクション)**。アニメは見出し/keyfacts/本文=共通 `data-fuwa-auto`(bm-fuwa.js→`.is-fuwa-in`)、`.mpc-choose-item`=`data-fadeup`(mpc.js→`.is-visible`)で既存criteriaと同じ二重リビールパターン。**チェックは別系統**: `js/mpc.js` の `initChecklist()` が IntersectionObserver(`rootMargin:-45% 0 -40%`=画面中央の薄い帯)でカードが中央付近に来た時に `.is-checked` を付与→チェックボックスがオレンジに塗られチェックが弾けて出る。スクロールで上から1枚ずつ点く演出(フェードアップとは分離。IO非対応は全チェックfallback)。**旧 `.mpc-pain-*`/`.mpc-criteria-*` CSSはデッドコード化(要掃除)**。**現フロー: Hero→Logoマーキー→依頼先を判断する基準(NEW)→ビズマンガはどうなのか(NEW)→比較表→用途別マップ→FAQ→最終CTA**。**2026-05-27「では、ビズマンガはどうなのか」セクション追加**(`#sec-bizanswer`、判断基準と比較表の間): 判断基準6項目に1つずつ"答える"構成。**ビズちゃん(マスコット)＋参考イラストで分かりやすく**＝トップの `bm-reasons` コンポーネント(`.bm-reason-card` Z字交互カード)を流用し、`material/images/reasons/reason-0X-*.webp`(既存8枚から6枚)を各基準に割当(①料金=01-price/②用途=07-use-cases/③構成=08-artists/④契約=06-copyright/⑤速度=02-speed/⑥実績=04-multimedia)。各カードに `.bm-reason-kicker`「見極め基準｜◯◯」を追加し判断基準と1対1対応。**editorial路線の中でこの1セクションのみビズちゃん復活**(ユーザー指示)。背景は `.mpc-bizanswer` で白固定に上書き。CSSは `css/mpc.css` の choose 直後**。**2026-05-27 比較表(`#comparison`)を刷新**: 旧「主要5社(A〜E社)＋ビズマンガ」の6列横長表(`.mpc-table`)を廃止し、`/strength`の「まとめると!」と同じ **`bm-pricing-table`(他社 vs ビズマンガ の2列)** に置換。行は上の判断基準6項目(料金の透明性/用途への専門性/「伝わる構成」設計力/契約条件/サンプル・レスポンス速度/実績・アフター)に統一し、チェックリスト→比較表の流れを接続。「一般的な制作会社」列はグレー地、「ビズマンガ」列は薄オレンジ地＋オレンジ太字。`bm-pricing-table`はbizmanga.css共通クラス(pricing/strengthと共用)。**※2026-05-27に各社プロフィール(`#sec-profiles`、競合5社個別紹介セクション)を削除。整合のためJSON-LD ItemList(6社)も併せて除去**。旧 `.mpc-table*` CSSと `mpc.js initStickyTable`(if(!table)return でno-op)はデッドコード化(要掃除)。**2026-06-01 ヒーロー4ポイント(`.mpc-hero-v3-points`、業界最安値クラス/最短2週間納品/8用途の専門編集/料金の透明性)を「クリックでその場にQ&A展開」するアコーディオンに変更**: 旧 `<a href="#comparison">`(4枚とも比較表ジャンプ・末尾→)を廃止し、各行を `<button class="mpc-hero-v3-point" aria-expanded>` ＋直下の回答パネル `.mpc-hero-v3-panel`(`.mpc-hero-v3-item` で包む)に。末尾の→は開閉シェブロン `.mpc-hero-v3-point-toggle`(aria-expanded=trueで180°回転)。パネル内は質問 `.mpc-hero-v3-panel-q`(オレンジ)＋回答 `.mpc-hero-v3-panel-a`＋深掘りリンク `.mpc-hero-v3-panel-link`(価格→#comparison/速度→#sec-bizanswer/用途→#sec-usecase/透明性→/pricing)で、即答とナビ導線を両立。開閉JSは `js/mpc.js` の `initHeroPoints()`(max-height transition＋hidden属性トグル、prefers-reduced-motion配慮)。複数同時開き可。日本語固定表示は日本語の表示内容。**2026-06-01「8用途の専門編集」Q&Aは8用途を省略せず列挙(採用・IR・研修・商品紹介・営業・インバウンド・会社紹介・広告)し、文中の各用途語を専用LPへの文中インラインリンク `.mpc-hero-v3-inlink`(オレンジ下線)に**(採用=/recruit-manga, IR=/ir-manga, 研修=/training-manga, 商品紹介=/product-manga, 営業=/sales-manga, インバウンド=/inbound-manga, 会社紹介=/company-manga, 広告=/manga-ad-lp)。※当初チップ(`.mpc-hero-v3-panel-uses`)で実装→ユーザー要望で文字リンクに変更。パネル max-height はPC460/SP560 |

## 1b. ビズアニメ（BIZ ANIME / AI動画制作）⭐進行中

**AI動画技術 × クリエイターの演出力**で、アイデアを動くコンテンツに変える動画制作サービスの紹介ページ。
対応領域は**広告・VTuber・MV・IP**。ビズマンガのブランド × 映像制作スタジオのシネマティック感で見せる。他ページと違い**このページだけ黒基調**。
**アクセントカラーは黄色**（BLACK / CHARCOAL / **YELLOW #ffc400系** / WHITE。2026-08-30 指示でオレンジから変更）。
- 色は `css/bizanime.css` の `--ba-accent*` に集約（rgbaは `--ba-accent-rgb`）。**直書き禁止**
- 黄色塗りの上の文字は必ず `--ba-on-accent`（暗色）。白文字はコントラスト不足
- フレーム素材の焼き込みオレンジ発光は `hue-rotate(24deg)` で黄色に寄せている。
  キャラ（オレンジ制服）と背景webpは画像のため対象外（差し替えは素材再生成が必要）

⚠️ **ボイスコミックとは別サービス**。当初「漫画に声を入れた動画＝ボイスコミック」と誤解して実装し、
2026-08-29 にコピー・メタ情報を全面差し替えた。ボイスコミックは料金ページ等にある動画化オプションで、
ビズアニメはAI動画制作サービス。**混同しないこと**。

**現状: Hero セクションのみ実装。PC・スマホとも対応済み。**

### ファイル
| 種別 | パス | 備考 |
|---|---|---|
| HTML | `bizanime.html` | URL は `/bizanime` |
| CSS | `css/bizanime.css` | 全セレクタ `.ba-*` / 黒地は `body.ba-page` にスコープし他ページへ非干渉 |
| JS | `js/bizanime.js` | 画像ロード後に `.ba-anim` を付与して登場演出を開始するだけ。GSAPは不使用 |
| 画像 | `material/images/biz-anime/hero-{character,player,bg}.webp` | 生成PNGをトリム＋WebP化（計約540KB） |

### グリッド
**PC 3列 / SP 2列**（720px以上=3列、それ未満=2列）。
4列も試したが1枚が小さく作例が見比べづらいため3列に戻した（2026-08-29）。
スマホは1列にすると1枚が大きすぎて比較にならないので**2列を維持**し、
400px以下では余白と文字だけ詰める。

### Hero 構成（3レイヤーの重なり）
左コピー（BIZ ANIME / キャッチ / CTA / 媒体）→ 中央キャラクター → 右動画プレイヤー。
単純な3カラムにせず absolute で意図的に重ねる。
※ 右下にあった VOICE / MUSIC / SFX / MOTION の4機能カードは **2026-08-29 に削除**（HTML・CSSとも撤去済み）。内容はHeroより下のセクションで扱う。

### 目標デザインへの寄せ込み（2026-08-22）
初回実装は各要素が小さく independent に並び、Hero内に黒い空白が多かった。
完成デザイン画像から座標を実測し、1640×920 を基準に一致させた。実測値は以下（Hero比）:

| 要素 | 目標 | 合わせ方 |
|---|---|---|
| キャラ 頭頂 | 10.1%H | `top: 9%` で固定（`bottom` 基準は高さがHeroを超えると破綻する） |
| キャラ 幅 | 33.9%W | `width: 34%` ＝ 高さ約1368px。**Hero高を超えて脚が切れるのが正** |
| キャラ 左端 | 32.1%W | `left: 27.5%`（吹き出しを隠さない位置を優先して目標より左） |
| モニター | y12.6〜87.2% | `width: min(56%, 990px)` / `top: 12%` / `right: -1.5%` |
| 機能UI | モニター直下 | `top: 82%` ＋ 半透明の暗いUI帯（4枚のカードには見せない） |

- **キャラは幅基準で指定する**。高さ基準だとHero高に依存して構図が崩れる
- **吹き出し「伝えたい想いが、動画で動き出す！」は隠さない**。作品のメッセージそのもの
- **ゴーストCTAの背景は不透明の黒**（`rgba(9,9,9,.9)`）。スカートが透けて文字が沈むため
- メインコピーは Noto Serif JP。太さで押さず字面で見せる

### 実装上の必須ルール（触る前に読む）
- **テキストは画像化しない**。BIZ ANIME・キャッチ・CTA はすべてHTML。画像素材はキャラ・プレイヤー・背景・波形装飾のみ（SEO/a11y/レスポンシブのため）
- **キャラの高さは `%` で指定する**。`clamp(...px)` を混ぜると Hero が低い幅で急に小さくなり、頭の位置が下がって左コピーと重なる（実測: 92% → 69% に落ちた）
- **`BIZ ANIME` は `17cqw` で1行維持**。実測で font-size 100px 時の文字幅が 572px = 17.4cqw が上限。`vw` 基準だと親（`.ba-copy` 34%）と噛み合わず2行に折り返す。`.ba-copy` の `container-type: inline-size` とセット
- **ヘッダーは他ページと完全に共通**（2026-08-22 ユーザー指示）。白背景・通常ロゴ・標準ナビ配色・追従CTA(`.bm-fab`)をそのまま使う。
  当初は黒地Heroに合わせて透明化＋ロゴ白反転＋FAB非表示にしていたが、サイト全体の統一を優先して**全ての上書きを削除**した。
  ⚠️ `body.ba-page` でヘッダーを上書きしないこと。このページだけ見た目が変わる
- **ヘッダーは `position: fixed`**。Heroに `margin-top: var(--ba-header-h)`(72px) を入れないと、キャラの頭が白いバーの下に潜る
- **ヘッダーにサービス名を足さない**。ナビ項目・CTA・アイコンで余白がない。要素を差し込むとナビが溢れる。`.ba-header-brand` は実装済みだが `display:none` で封印してある
- **左コピーの下端は追従CTA(`.bm-fab`)と近接する**。`.ba-copy` の `top` を下げすぎると媒体表示（YouTube/SNS/Web）に重なる
- キャラの脚は画像幅の93%まで及ぶので、バッジ列を余白で逃がすことはできない。`z-index` と `text-shadow` で可読性を確保する

### スマホ・タブレット（〜1024px）2026-08-22 実装済み
PCの「左コピー＋中央キャラ＋右モニター」の重なりは幅が足りず成立しないため、縦積みに組み替えている。

**表示順（重要）**: 見出し → メインコピー → 説明文 → **動画** → 媒体表示
（**VOICE/MUSIC/SFX/MOTION の4機能カードは 2026-08-29 に完全削除**。HTML・CSSとも撤去済み。内容はHeroより下のセクションで扱う）
動画をファーストビュー直後に見せるのが狙い。HTMLの並びは「コピー(CTA/媒体を内包) → 動画 → …」だが、
`.ba-copy` を `display: contents` にして子を親のflexへ引き上げ、`order` で並べ替えている
（**HTMLを書き換えずに順序だけ変える**手法。PCの構図には影響しない）。

- ⚠️ `display: contents` にすると `.ba-copy` の**矩形が0になる**。左右余白と `container-type` は子要素側へ移すこと
- **Hero内のCTA 2本はスマホでは非表示**（ユーザー指示）。ビジュアルに集中させる
- **追従CTA(`.bm-fab`)もスマホでは非表示**。Heroのスクロール量が少なく、画面下に固定表示するとHero末尾の要素に重なるため（当時は4機能カードが被った。余白調整では回避不能と実測で確認）。連絡手段はハンバーガー内のLINE/電話で確保。`/contact` `/biz-library` にも同じ前例あり
- **ヘッダーはスマホだけ黒・56px**にして Hero と一体化させ、ロゴ横に「BIZ ANIME」を併記する（PCはナビと衝突するため非表示のまま）
- **キャラは上半分の右側・腰から下をマスクでフェード**。全身は見せない

- **キャラは `width` 基準・`z-index: 2`**。高さ基準だと縦長画面で巨大化する。またコピー(z-index:5)より奥に置き、**文字を絶対に隠さない**
- **`BIZ ANIME` に `text-size-adjust: 100%`**。Androidの文字拡大(1.3〜1.6倍)で折り返してブランド表記が壊れるため（鉄則3 / BUGS #045）。**本文には使わない**
- **CTAは `height: auto` + `min-height`**。文字拡大で中身が膨らんでも溢れないようにする
- **Heroの下paddingは詰めすぎない**。PCでは共通の追従CTA(`.bm-fab`)が画面下に固定されるため、削るとHero末尾の要素が隠れる
- `.ba-title` の `cqw` は**パディングを含む幅**を返す。左右paddingを引いてから係数を掛けないと折り返す
- 検証: 320〜1024px の16幅（境界の直上・直下を含む）＋ 文字拡大1.3/1.5倍 ×4幅で、横スクロール・折り返し・文字の覆い・4列の均等・タップ44pxを実測

### スクロール演出＋CASE STUDIES（2026-08-29 実装）
- **iPad内動画→フルスクリーン演出**: 受領した透過フレーム素材の「画面の穴」（四隅を実測し `clip-path`）に動画レイヤーを重ね、`position:sticky` + transform でスクロール連動。Three.js/GSAP不使用・スクロールは奪わない。動画はWP APIから取得し、0/1/2/3件すべて対応（0件は静止画Hero）
- **区間内フェーズ配分（1本あたり t=0〜1）**: `0.00-0.58`移動・拡大 → `0.58-0.70`フレーム消滅 → **`0.70-0.88`フルスクリーン静止滞在** → `0.88-1.00`縮小（最後の動画は縮小なし）。vhは1本目180vh／2本目以降170vh（2026-08-30、150vh→170vhに拡張）。**静止滞在区間はフレーム消滅直後に新設**：以前はフレーム消滅(16%)の直後に縮小(18%)へ入り、「普通の枠になった瞬間すぐ次へ流れてほぼ見れない」状態だった（ユーザー指摘で発覚）。滞在中は `grow=1,fade=1,shrink=0` を完全固定し、スクロールしても動画位置・サイズが一切動かない「止め」を作る。詳細コメントは `js/bizanime.js` の `render()` 内
- **CASE STUDIES**: PC3列/SP2列。一覧はサムネのみ、クリックでモーダル生成・閉じると破棄（ESC/背面クリック/focus trap対応）
- ⚠️ ハマりどころ（再発防止）:
  - `html` と **`body` 両方**の `overflow-x:hidden` が sticky を殺す → 2026-10-14（Issue #73）に共通CSS側を `clip` に直したので、このページ専用の打ち消し（bizanime.css の `html:has(body.ba-page)`/`body.ba-page` と bizanime.js のインライン指定）は削除済み。§0.6
  - 登場アニメの `animation` はインライン transform より強い → 演出中は `animation:none`
  - スマホの `.ba-device` に `transform:none` を書くと演出が全滅（CSS変数合成を打ち消すため）→ 変数の初期値で調整する
  - CSSコメントの閉じ忘れは**ブレース数が合っていても**メディアクエリを飲み込む → 検査はコメント除去後に行う
- WP側: 管理画面「ビズアニメ動画」（D&D並び替え・URL貼るだけ・provider自動判定）+ GET/POST API（POSTは要認証）。実体は `contentsx-wp-plugin/contentsx-cms/bizanime-videos.php`（デプロイはお名前.com手動・BUGS #002）

### 追加4セクション（2026-08-30 実装）
Hero下に USE CASE / WHY BIZ ANIME / PRODUCTION RANGE / FAQ を追加。
**FAQ以外の3セクションはWP動画APIのデータ駆動**（動画をハードコードしない）。FAQ は静的HTML。

- 共通: poster first・activeのみプレイヤー生成・**ページ全体で自動プレビュー同時1本**
  （previewマネージャで強制）・セクション画面外でプレビュー破棄・Hero動画も画面外で一時停止・
  hoverは `(hover:hover) and (pointer:fine)` のみ・reduced-motion/saveDataは自動プレビュー無し
- USE CASE: 4パネル（広告/VTuber/MV/IP）。activeがflex-growで拡幅・160ms遅延プレビュー・
  クリックでロック。**動画が無いカテゴリは静的パネル**（架空動画は出さない。
  現在 ADVERTISING/VTUBER が空 → CoolGirl等の登録で自動的に埋まる）。SPは2×2セレクタ＋下部ステージ
- WHY: editorial split(40/60)。3軸=式法戦線OP(AI技術)/I eye(演出)/カミツギ(マルチフォーマット)、
  割当は正規表現＋カテゴリfallbackで設定変更可。補助サムネ2枚でステージ差替。stickyは不採用
- RANGE: 実在カテゴリのみのチップ＋大小タイルのモニターウォール。
  **フォーマット表記(16:9/VERTICAL等)は断定しない**（全ソース16:9のため。フォーマット情報が
  入ったら差し替え）。フィルタは減光方式（レイアウト移動なし）
- FAQ: 30/70の静かなアコーディオン(WAI-ARIA・1つだけopen)。回答は断定できる事項のみ断定、
  条件依存は「ご相談」。末尾に主CTA1つ(/contact)。
  **`initFaq()` は起動時に1回だけ呼ぶ**（動画APIの応答・失敗・5秒タイムアウトを待たない。二重に呼んでも
  フラグで2回目は何もしない＝クリック処理が二重に付いて開いてすぐ閉じるのを防ぐ）。2026-10-15 まで
  API 待ちの中で呼んでいたため、応答が遅い・返らないと出現演出の `.is-in` が付かず、FAQ が透明で押せなかった（Issue #88）
- 調整ノブ: CSS変数(:root `--uc-active-grow` `--range-tile-gap` 等) + `window.BA_TUNE`
  (USECASE_PREVIEW_DELAY / WHY_TRANSITION_MS / RANGE_MAX_TILES / FAQ_ANIMATION_MS 等)

### 未実装（次にやること）
- Hero より下のセクション全体
- 制作事例（動画）一覧のWP連携。**運用方針は決定済み**: WPに専用投稿タイプを新設し、YouTube URL を貼るだけで一覧に増える。カード内でそのまま再生（YouTubeへ遷移させない）。プラグインは別リポジトリ(PRIVATE)＋お名前.com手動アップロードが必要（[BUGS #002](../BUGS.md)）
  ※ 当初は「ボイスコミック一覧」として設計したが、サービス定義の訂正によりAI動画の制作事例一覧として作り直す
- **Hero内CTA「制作事例を見る」の遷移先が仮**（現在 `/contact`）。旧定義の名残で `/biz-library`（漫画ギャラリー）を指していたため暫定変更。制作事例セクション or 動画一覧ページができたら差し替える
- **Heroのタブレット画像が漫画のまま**。AI動画サービスの実態に合う素材へ差し替えたい（`material/images/biz-anime/hero-player.webp`）
- ~~ナビへの導線追加~~ → ✅ 2026-08-22 完了。`js/bm-nav.js` の `NAV_ITEMS` でビズ書庫の直後に配置（全27ページ共通）

### ナビ8項目化に伴うヘッダー調整（2026-08-22）⚠️
ビズアニメ追加でナビが7→**8項目**になり、リンク列が `.bm-nav` の箱から溢れて
**FAQ がヘッダーナビに重なる**状態になった（全ページで発生。BUGS #003/#014 と同じ壊れ方）。
`css/bizmanga.css` の `.bm-nav` の `gap` を **24px→14px**（EN は 18px→12px）に詰めて解消。

- 溢れ量は実測で JA 59px / EN 25px。gap 8箇所ぶんで回収している
- **これ以上ナビ項目を増やす余地はほぼ無い**。次に増やすならメガメニューへ入れるか、既存項目を畳むこと
- **2026-08-30 追記**: 「制作事例」を**ビズ書庫のメガメニューへ統合**し、独立項目を廃止（9→8項目）。
  ビズ書庫にホバーすると「漫画を読む（ビズ書庫/制作事例一覧）」＋「目的から事例を探す（カテゴリ7本）」が開く。
  ⚠️ **メガメニューはモバイルでは既存のアコーディオン（`.bm-nav-dropdown.is-open`）に載せること**。
  PCはホバーで開くが、モバイルはホバーが無く親リンクのタップもトグル処理に吸われるため、
  CSSで `.bm-nav.open .bm-nav-dropdown.is-open .bm-nav-megamenu { display:block }` を当てないと
  **子ページが一切到達不能になる**（サービス配下も同じ状態だったのを併せて解消）。
  操作は「1タップ目で展開 → 2タップ目で親ページへ遷移」で既存ドロップダウンと同じ。
  さらに **第3階層**（`children`）に対応: 「制作事例（一覧）」にホバーすると
  右側にカテゴリ7本のサブメニューが開く。項目自体はリンクのままなので押せば `/works` へ行ける。
  **ヘッダーとカードの隙間**: `.bm-nav-dropdown` に `padding-bottom:24px`（ホバーブリッジ）が
  あるため `top:100%` だとヘッダー下端より9px下から始まり、隙間が見えていた。
  `top: calc(100% - 9px)` でヘッダー下端に密着させている（ブリッジ自体は残す）。

  **開閉の速度は非対称にする**: 開くのは速く(0.25s)、閉じるのは遅く(0.45s)。
  ゆっくり消えることでカードへ手を伸ばす時間を稼ぐ。開くのまで遅くすると反応が鈍く感じる。
  JS側の待機(`MEGA_CLOSE_DELAY`)は160msに抑え、待機を長くするのではなく
  フェードを長くして体感を作っている（待機が長いと「閉じない」と感じるため）。
  実装は `css/bizmanga.css` の **`.bm-nav-megamenu` 本体の `transition`＝閉じる側（0.45s / opacity 0.4s）**と、
  `.bm-nav-megamenu-wrap.is-mega-open .bm-nav-megamenu` 側＝開く側（0.25s / opacity 0.18s）。
  ⚠️ 2026-10-15 まで 0.45s は未使用の `.bm-nav-dropdown-menu` にだけ書かれ、メガメニューは 0.25s で閉じていた（Issue #82 で修正）。

  **メガメニュー自体の閉じ遅延**: カーソルが外れた瞬間に閉じ始めると狙って動かす必要があり使いづらい
  （実測: 外して60msで3分の1まで消えていた）。`js/bm-nav.js` の `MEGA_CLOSE_DELAY`（当初300ms、2026-08-30 に上記の配分で 160ms）で、
  離れてから0.16秒は開いたまま保持する。一瞬外して戻れば閉じない／別のメニューへ移れば前のは閉じる。
  ⚠️ **CSSの `.bm-nav-megamenu-wrap:hover` は入れないこと**。入れると外れた瞬間に閉じ始めて
  JS側の遅延が効かなくなる（`:focus-within` はキーボード操作用に残す）。

  **カード幅は中身に追従させる**: `width: max-content` + `grid-auto-columns: 265px`。
  以前は固定 900px だったため、1列しかないビズ書庫では右に635pxの空白ができ、
  カードが左に寄って見えるうえホバー判定も無駄に広がっていた（2026-08-30 修正）。
  サービス(3列=901px)は従来どおり。

  **ホバーの操作性**: 項目からサブメニューへ「斜めに」カーソルを動かすと閉じてしまうため、
  `js/bm-nav.js` で①閉じるのを320ms遅らせる ②**三角形（prediction cone）判定** ③開いている間は
  親メガメニューに `is-mega-open` を付けて保持する、の3点で対処。
  ②は Amazon のメガドロップダウンで知られる手法で、現在位置とサブメニュー手前側の上下の角で
  三角形を作り、その内側へ動いていれば「向かっている」とみなして開いたままにする
  （途中で別項目の上を通っても閉じない）。矩形＋余白だけの判定より誤爆が少ない。
  参考: https://bjk5.com/post/44698559168/breaking-down-amazons-mega-dropdown
  ⚠️ ③が要るのは、メガメニューが `max-height + overflow:hidden` でアニメーションしており、
  カーソルが本体から離れると縮んで**中のサブメニューごと切り取られる**ため
  （実測でカテゴリ7件中5件がクリック不能、うち1件は別ページへ誤遷移した）。
  ⚠️ 実装時の落とし穴2点:
  ①メガメニューは `overflow: hidden` + `max-height` でアニメーションしているため、
  **開いた状態のルールに `overflow: visible` を足さないとサブメニューが枠外で切れる**。
  ②モバイルの字下げ指定は `.bm-nav.open .bm-nav-dropdown-item`（padding-left:44px）より
  **後ろに書くこと**。前に置くと同詳細度で負けて親子が同じ位置に並ぶ。
- **2026-08-29 追記**: 「漫画家紹介」追加で9項目になり JA が13px 再度溢れた。
  gap(14→11px / EN 12→9px)でも足りず、**`.bm-header-inner` を 1200→1280px に拡張**して解消。
  文字サイズは15pxのまま維持（削ると可読性が落ちるため）。本文コンテナ1200pxは変えていない。
  ⚠️ **溢れ判定は nav 要素の幅ではなく「各リンクの右端が `.bm-header-right` の左端を越えていないか」で見ること**。
  nav の幅だけ見ると余裕があるように誤検出する（実際にこれで見落とした）
- 変更後は 7ページ×4幅(1280/1440/1600/1920)×日本語=28通りで溢れゼロ、
  スマホ3幅×3ページでハンバーガー開閉を実測済み

## 1c. 漫画家・作品紹介（/artists）2026-08-29 新規

### このページの立ち位置
**カードは「漫画家1人＝1枚」**。画風・用途・ジャンル・読者層・媒体は
**カードの単位ではなく、あくまで絞り込みの軸**として使う（ここを取り違えないこと）。

作家名（ペンネーム）は出さず、**A〜K の記号で指名してもらう**運用。
営業資料『ContentsX_漫画家作品紹介_11名版.pdf』と同じ記号体系で、資料とページで指名が食い違わないようにしている。

### ファイル
| 種別 | パス | 備考 |
|---|---|---|
| HTML | `artists.html` | URL は `/artists`。ヘッダー/フッターは product-manga と同型 |
| CSS | `css/artists.css` | 全セレクタ `.art-*` / `body.art-page` にスコープし他ページへ非干渉 |
| JS | `js/artists.js` | `CREATORS` 配列 + カード/フィルタ描画 + モーダル。DOMは `createElement`+`textContent`（`innerHTML` 不使用＝CRM文字列が来てもXSSにならない） |
| 画像 | `material/images/artists/` | Hero 1枚 + 作家11名 ×（サムネ1 + 作例3）＝45枚。約4MB |

### WordPress 連携（2026-08-29 追加）⭐
WP から追加・編集・並べ替えできる。**方式は works/column と同じ「静的ビルド」**。

| 層 | 実体 |
|---|---|
| WP CPT | `cx_artist`（ビズマンガ親メニュー配下）。タイトル=画風の見出し、アイキャッチ=カードのサムネ |
| WP タグ | `cx_artist_tag` を階層化し 親=分類(画風/用途/ジャンル/読者層/媒体) 子=実タグ |
| WP メタ | 記号(A〜K) / 表示順 / 一言説明 / 特徴 / 代表作 / 活動歴 / 作例画像 |
| API | `GET /wp-json/contentsx/v1/artists`（タグは分類ごとに振り分けて返す） |
| ビルド | `tools/build-artists.py` → `js/artists-data.js` 生成 + `artists.html` に静的カードと ItemList JSON-LD を展開 |
| 読み込み | `artists-data.js`（`window.BM_ARTISTS`）を `artists.js` より先に読む。空なら内蔵データにフォールバック |

**並べ替え**: 編集画面の「表示順」に数値を入れる（10,20,30…）。
同じ番号を入れると以降を自動で1つずつ後ろにずらすので、手で振り直す必要はない。
管理画面の一覧にも「順」「記号」列を出し、既定の並びを表示順に揃えてある。

⚠️ **ビルドは WP が空・不通のとき既存の出力を残して正常終了する**（終了コード0）。
ビルド失敗で公開ページが空になる事故を防ぐため。0件で上書きしない。

⚠️ **プラグインの本番反映は git push では行われない**。お名前.comのファイルマネージャーで
`contentsx-cms.php` を手動アップロードする（BUGS #002）。リポジトリは
`~/Documents/contentX/web/contentsx-wp-plugin/`（**このワークスペース外・PRIVATE**）。

移行スクリプト: `tools/migrate-artists-to-wp.py`（内蔵データ11名と画像44枚をWPへ一括登録。
`--dry-run` あり。同じ記号があれば更新するので再実行しても重複しない）。

### データ構造（差し替えポイント）⭐
作家データは `js/artists.js` の **`CREATORS` 配列だけに閉じている**。
1件のスキーマ: `id`(A〜K) / `slug` / `title` / `summary` / `thumbnail` / `gallery[]` /
`styleTags[]` / `genreTags[]` / `audienceTags[]` / `mediaTags[]` / `usecaseTags[]` /
`works[]` / `yearsActive` / `detail`

**CRM（Supabase）との対応**: tag 4種は `creator_tags.category` の
`style` / `genre` / `audience` / `medium` にそのまま対応する。
**`usecaseTags`（用途）だけは CRM に存在しない**ため、営業資料の記述から手で付与している。
CRM連携するなら用途列の追加が必要。

将来 CRM から流し込む場合は、同じ形の配列を **`window.bmArtists.setData(list)`** に渡す。

### カードに出す情報
記号(A〜K) / サムネ / 画風の見出し / 一言説明 / 「この作家を詳しく見る」のみ。
**タグはカードに出さず、詳細モーダル内にだけ表示する**（2026-08-29 変更）。
一覧は絵と見出しで見比べる場所に寄せ、タグの読み込みは詳細を開いてからにする。
見出しは2行ぶん・説明文は3行ぶんの高さを確保し、**全カードの高さを揃える**
（揃えないと下端の「詳しく見る」の位置がばらつく）。

### 件数表示の出し分け ⚠️
**絞り込み無しのときは総数を出さない**（「該当する漫画家 11 名」と出すと
"11人しかいない" と読まれてしまうため。営業資料も「本資料は抜粋です」と断っている）。
- 絞り込み無し → 「在籍作家の一部を掲載しています」
- 絞り込み中   → 「条件に合う作家 N 名を表示中」（何件ヒットしたか分からないと使えないため）

リード文・下部CTAでも「掲載は一部」「ここにない画風も相談可」と明示している。
掲載人数を増減させても文言の修正が要らない作りにしてある。

### 絞り込みの仕様
- 軸は5本（画風／用途／ジャンル／読者層／媒体）。各軸1行で、左に軸ラベルを固定表示
- **同じ軸の中は OR、軸をまたぐと AND**（「画風=アニメ調」かつ「用途=採用」の直感に合わせる）
- ⚠️ AND のため**組み合わせ次第で0件になりやすい**（例: 画風=リアル・劇画調 × 用途=採用 は0件）。
  0件時は空表示＋「絞り込みを解除」ボタンを出して復帰させている
- チップはデータに実在する値だけを `CREATORS` の出現順で生成する
- **既定は各軸6件まで**表示し、超える分は「すべて見る（+N）」で開く（`VISIBLE_CHIPS = 6`）。
  タグを全部出すとジャンル19件で画面が埋まり、カードが下に押し出されるため。
  ⚠️ **畳んだ状態でも選択中のタグは必ず表示する**（選んだものが隠れると何で絞ったか分からなくなる）

### Hero ⚠️高さの決め方に注意
**素材はPC/SPで2枚を `<picture>` で出し分ける**（2026-09-16 差し替え）:

| 表示 | ファイル | 寸法 | 構図 |
|------|----------|------|------|
| PC（900px以上） | `hero-artists-2026.webp` | 1600×800（2:1） | 左が余白、右にキャラ群 |
| SP（899px以下） | `hero-artists-sp-2026.webp` | 828×1472（縦長） | 上が余白、下にキャラ群 |

`<source media="(max-width: 899px)">` で切替。**`<link rel="preload">` も同じ media で2本用意する**
（media を付けないと両方DLして無駄になる）。

⚠️ **切替点(899/900px)は3箇所で必ず揃える**: picture の `media` / preload の `media` /
白グラデ `.art-hero__bg::after` の向き。ずらすと中間幅で
「縦長画像に横グラデ」の組み合わせが出てコピーが読めなくなる。

**白グラデはコピーを読ませるための必須要素**。PCは左→右、SPは上→下。
⚠️ **不透明域は本文（`.art-hero__sub`）の下端まで残す**こと。実測で本文の下端は
Hero の 57〜64%（幅390〜860px）に来るので、66%までは `.86` 以上の白を保ってから抜く。
浅くすると本文がキャラの線画と重なって読めなくなる（逆に深すぎると絵が死ぬ）。

**高さの決め方**:
- PC: `height: calc(min(100vw * 800 / 1600, 76vh) + 72px)`（72px = 固定ヘッダー分）。
  2:1 は旧素材(3:1)より縦に長く、上限を付けないとワイド画面で Hero だけで1画面を超える
- SP: `height: clamp(620px, 100vw * 1472 / 828, 720px)`。
  下限620pxは**320px幅でも eyebrow がヘッダーに潜り込まず**、CTA下に絵の帯が残る実測値。
  上限720pxは幅が広い端末で余白帯が間延びしないため
- SPの `object-position` は **`center top`**。`bottom` にするとキャラ密集部がコピーの背面に来て
  本文が読めなくなる

ここは4回踏み抜いたので理由を残す:
- `min-height` を大きめに置くと `contain` の上下に余白が出る（画像480pxに対し枠682px）
- `.art-hero__bg` を `position: relative` に変えると **bg と inner の高さが足し算**され、
  Hero が倍近く（1170px）に伸びる。**bg は absolute のまま**にすること
- `aspect-ratio` と `height` を併記すると競合して画像が潰れる（480px→405px）
- ヘッダーは `position: fixed` なので、72px ぶん `padding-top` で押し下げないと
  Hero 上部がヘッダーに隠れる
- SPの高さを詰めすぎる（88vh等）と eyebrow・見出しがヘッダーに潜り込み、CTA下の絵も消える

旧素材 `hero-artists.webp`（2000×666）はロールバック用に残置。参照はしていない。

### 追従CTA（.bm-fab）の縮小
共通CTA（`js/bm-nav.js` が全ページに生成）は幅200px×3個=600pxあり、
カードの1列目に被って作例が見えない。このページでは
**既定をアイコンのみの丸ボタン（56px）に畳み、トグルで開く**。
- CSSは `body.art-page` にスコープ済み＝**他26ページの .bm-fab は一切変わらない**
  （前例: `css/bizanime.css` の `body.ba-page .bm-fab`）
- トグルは `js/artists.js` が生成。`.bm-fab` は bm-nav.js が load 後に body へ挿すため、
  **MutationObserver で待ってから**差し込む（即時 querySelector だと取り逃す）

### 画像の作り方（再現手順）
営業資料PDFから `pdfimages -png` で抽出している。注意点:
- **PDFの表示ページ番号と物理ページ番号が1ずれる**（表紙が0扱い）。
  記号の割り当ては `pdftotext` でページ内の記号を読んで確定させること（推測すると作家が入れ替わる）
- **偶数番号のファイル（-002/-004/-006）はアルファマスクで中身が白紙**。
  `Image.mode == 'RGB'` で判定して除外する（`L` モードはマスク）
- 縦長の原稿は上端に手書き注釈が入ることがあるので、上部を落としてから 4:3 に切り出す
- ⚠️ **抽出した画像には資料スライドの黒背景が帯として焼き込まれていることがある**。
  CSS の `object-fit: cover` では消せない（画像の中身なので）。
  書き出し後に外周の暗い行・列を走査して除去すること（2026-08-29 に全44枚を再処理）

### 公開状況（2026-08-30 本番公開済み）
ナビ登録 / sitemap.xml 追加 / 内部リンク / 専用OG画像（`og-artists.webp`）はすべて完了。
- ナビ: 「ビズ書庫」のメガメニュー内ではなく**独立項目**として追加した（§1b の通り項目数に余裕が無く、
  ヘッダー幅を 1200→1280px に広げて収めている）
- 内部リンク: index / strength / manga-production-company の**本文中**に各1本。
  ナビ・フッターだけだと孤立扱いになるため（memory `feedback_new_lp_internal_link_required`）
- OG画像: `material/images/og/og-artists.webp`。既存 `og-biz-library` と同じ型
  （上下7pxのオレンジ帯 + ロゴ + 英語名 + 日本語名）

## 1a. 用途別LP デザインシステム v2（2026-05-13）⭐進行中

8本の用途別LPは「Editorial Magazine」(pm-* / `bm-lp-template.css`) を共通テンプレとして 2026-04-26 に同時公開した。1位を狙うSEO中核ページであるため、ブランド体験・滞在時間・CV率を底上げする目的で、より大胆な「MANGA MAGAZINE × BRAND SITE」コンセプトの v2 デザインシステムに移行中。

### 2026-06-14 SEO改善（8LP一括・seo-page診断より）
- **H1にKW挿入**: 各H1はキャッチコピー主体でKW欠落だったため、H1末尾に視覚非表示の `<span class="lpv2-sr-only" 日本語の表示内容>` でページKW句（例: 採用マンガ・採用漫画の制作）を補完。`.lpv2-sr-only` ユーティリティを `bm-lp-v2.css` 冒頭に新設（clip-rect方式・画面表示は不変）。eyebrowはSPで `display:none` のためH1のKW補完がモバイル評価上も有効。
- **FAQ汎用4問にKW冠**: 全8本で文言完全一致だった汎用質問（制作期間/費用の相場/修正回数/英語版多言語）の先頭にページKWを付与（例「採用マンガの費用の相場はいくらですか？」）。表示`<summary>`とFAQPageスキーマ`name`を同時更新。ロングテール「{用途}マンガ 費用 相場」獲得＋ページ間重複解消。後半6問は元々用途特化済み（計12問）。
- **title短縮**: recruit/company/inbound の `<title>` がSERP切れ（38-40全角）だったため28-31全角に短縮（KW＋ブランドは保持、`og:title`/`twitter:title`は社内SNS用に長文維持で意図的diverge）。
- **meta description短縮**: 最長3本（inbound/ir/recruit）の末尾共通ボイラープレート「125項目品質チェック…」等を削りモバイル切れ回避（91-95全角）。description+og+twitter+schema同期。
- **ヒーローLCPは変更なし**: `<picture>`(AVIF/WebP)+SP専用版(≤720px)+`fetchpriority="high"`+寸法指定で最適化済みのためpreloadは冗長と判断し見送り。

### v2 の構成ファイル
| ファイル | 役割 |
|---|---|
| `css/bm-lp-v2.css` | 新デザインシステム（`lpv2-*` クラス、約760行）。冒頭に `.lpv2-sr-only`(SEO/a11y視覚非表示)ユーティリティ |
| `js/bm-lp-v2.js` | スクロールスパイ目次 + 折りたたみパネル + reveal-on-scroll |
| HTMLマーカー | `<!-- LP-DESIGN:v2 -->` を `<head>` 直後に置くと v2 判定される |
| `body` 属性 | `class="lpv2-page"` + `data-lp-v2` |

### v2 ビジュアル原則
- 黒（#0a0a0a） × クリーム（#fff8ed） × オレンジ（#e85500、ブランドアクセント） × イエロー（#ffd54a、ハイライト）の4色制
- 太枠（3pxソリッド黒）+ ドロップシャドウ（`8px 8px 0 黒`）の漫画コマ風カード
- ハーフトーンドット（`radial-gradient` SVG）、雑誌の刷り感
- Hero: 黒ベース全面写真 + マグ誌風メタ帯（VOL/ISSUE）+ ハーフトーンオーバーレイ + 写真フレーム
- Hero eyebrow（`.lpv2-hero-eyebrow`）: 2026-05-31 改修。JPキーワードを黒地白文字バッジ（`.lpv2-hero-eyebrow-ja`、コマ枠オレンジ影 `4px 4px 0 accent`）、その下にENを `.lpv2-hero-eyebrow-en`（mono・アクセント色・letter-spacing 0.34em）で縦積み。recruit-manga は「採用マンガ／RECRUIT MANGA」。旧 `::before` 横線＋middot一行型は廃止。SPでは従来通り非表示（`display:none`）
- Hero SP調整（2026-05-31 recruit-manga）: CTA行はスマホで必ず縦並び（`flex-direction:column`）＋内容幅・左寄せ（全幅にしない）。リード文・H1の改行は `<br class="sp-br">` でSP専用に制御。キャラ画像はSPで `.lpv2-hero-bg img { height:135%; margin-top:0 }`（上詰め配置）。被り回避はH1の3行化（見出しを左カラムに収める）で担保
- 全章に章番号（CHAPTER 01..07）を導入し、雑誌のような章立てに

### v2 章立て
| 章 | セクション | クラス | id |
|---|---|---|---|
| Hero | カバー誌風 | `.lpv2-hero` | — |
| TOC | スティッキー章目次（スクロールスパイ） | `.lpv2-toc` | `#lpv2Toc` |
| Manifest | 宣言文 + KPI 3パネル | `.lpv2-manifest` | — |
| 01 | PROBLEM（3パネル、illust + 番号バッジ） | `.lpv2-problem` | `#chapter-01-problem` |
| Bridge | 全画面ブラック・宣言 | `.lpv2-bridge` | — |
| 02 | STRENGTH（4-koma風 2×2 + クリック展開） | `.lpv2-merit` | `#chapter-02-merit` |
| 03 | FORMATS（4カラム媒体カード） | `.lpv2-formats` | `#chapter-03-formats` |
| 04 | CASE STUDY（WP API、`tools/build-lp-cases.py` v2マークアップ対応） | `.lpv2-cases` | `#chapter-04-cases` |
| 05 | LIBRARY（ビズ書庫埋込、生成りBG〈`--lpv2-cream`〉。`js/bm-lp-library-embed.js` が `/library` から描く作品カード `.bm-lp-lib-item/-cover/-pages/-title` と読み込み中・空表示 `.bm-lp-lib-loading/-empty`〈グリッド全幅・`--lpv2-ink-mute`〉は `bm-lp-v2.css` §12 で指定。旧 `bm-lp-template.css` の指定を 2026-10-15 に移植〈Issue #82〉） | `.lpv2-library` | `#chapter-05-library` |
| 06 | PRODUCTION FLOW（8パネル、巨大番号アウトライン、**フリップカード**） | `.lpv2-flow` | `#chapter-06-flow` |
| 07 | FAQ（Q/Aセリフバッジ、`<details>`） | `.lpv2-faq` | `#chapter-07-faq` |
| Related | NEXT ISSUE（他7LPカード） | `.lpv2-related` | — |
| End | TO BE CONTINUED + CTA2本 | `.lpv2-end` | — |

### 移行ステータス
| LP | 移行状況 |
|---|---|
| `recruit-manga.html` | ✅ v2 移行済（2026-05-13、パイロット） |
| `product-manga.html` / `manga-ad-lp.html` / `company-manga.html` / `sales-manga.html` / `training-manga.html` / `inbound-manga.html` / `ir-manga.html` | ✅ v2 移行済（PR #58 で8本とも v2 構造に統一） |

### 旧テンプレ（`pm-*`）の扱い（2026-10-07 更新）
- 旧 `css/bm-lp-template.css`（`pm-*`）は全LPの v2 移行に伴い削除済み。以下の箇条は移行期の記録
- 共通の`bm-nav.js` / `bm-nav.js` / `bm-lp-library-embed.js` / `bm-sanitize.js` / `bm-kinsoku.js` はそのまま利用
- `tools/build-lp-cases.py` は `lpv2-*` だけを出力する。LP に `<!-- LP-DESIGN:v2 -->` マーカーが無い場合は、崩れた事例欄を出さないようエラーで停止する
- **2026-05-19 追記**: `tools/build-lp-cases.py` は実装上まだ `pm-cases-grid` / `pm-case-card` を出力するため、recruit-manga.html では `pm-case-*` が未スタイル状態になっていた。`bm-lp-v2.css` 末尾（セクション19）に `pm-case-*` を v2 トークン整合で再定義し、**CASE STUDYカードを横並び**（`grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))`、SPは160px）に修正。`bm-lp-v2.css` は recruit-manga.html のみが読込むため他7LPには影響しない
- **2026-05-24 追記（PRODUCTION FLOW フリップカード化）**: 制作フロー8パネル(`.lpv2-flow-step`)を以下のインタラクションに刷新。
  - **連結グリッド**: `.lpv2-flow-grid` を `gap: 3px` + `background: ink` にし、隙間に黒を覗かせて全カードがくっついた「罫線共有」表現（二重線にならない）。通常時は影なしフラット
  - **ホバー時のみ立体**: `.lpv2-flow-step__inner` を `translate(-4px,-4px)` + `box-shadow: 9px 9px 0 ink` で浮かせる（従来の常時影を廃止し、立体感はホバー時だけ）
  - **クリックでフリップ**: `<button>` 化し、JS(`bindFlowFlip` in `bm-lp-v2.js`)が `.is-flipped` をトグル。`__inner` を `rotateY(180deg)` で裏返し、表(`__front`=番号+名前+**説明文**+「イメージを見る +」)→裏(`__back`=**作例画像のみ**、`__pic`を全面cover、**オレンジ3px枠**)を表示。`preserve-3d` + `backface-visibility:hidden` + `perspective:1200px`
  - **裏面画像**: 営業資料マンガ(product/sales系)制作フローのMVP作例画像 `material/images/flow/step{N}_{slug}.{avif,webp}` を流用。8ステップ完全対応（step1_hearing〜step8_nouhin）、同一キャラで物語が通しになっている。`<picture>`はavif優先+webpフォールバック(pngは無い)
  - **遅延読込しない**: 裏面は `transform: rotateY(180deg)` + `backface-visibility:hidden` で隠れているため `loading="lazy"` だとフリップしても画像が読み込まれない（ビューポート判定が効かない）。`loading`属性を付けず確実に表示させる
  - `material/images/flow/` を削除すると裏面が壊れる点に注意
  - **HTML構造**: `button.lpv2-flow-step > span.__inner > (span.__face.__front[num/name/desc/hint] / span.__face.__back[picture.__pic])`。フェイスは絶対配置のためセル高さ固定（説明文を載せる分やや高め: PC268px / ≤1000px 230px / ≤560px 210px）
  - `aria-expanded` を同期、`prefers-reduced-motion` で `__inner` のtransition無効化（フリップは即時・機能維持）
  - 影響範囲: `bm-lp-v2.css`を読むrecruit-manga.htmlのみ。フロー区画は他LP未導入

## 2. URL パラメータ・特殊モード

### 2.0a コラムの2系統URL（制作事例と同パターン）

| URL系統 | 例 | 用途 | 即時性 | ターゲット |
|---|---|---|---|---|
| **`?id=xxx`** | `column-detail?id=483` | 動的取得（JS）。WP公開直後から動作 | ✅ 即時 | フォールバック・プレビュー |
| **`/column/{slug}`** | `/column/why-business-manga` | SEO向け静的ページ（JSON-LD付き） | ❌ 週1ビルド後（or 手動実行） | Google / AI検索 / SNSシェア |

- ホーム・一覧ページのカードリンクは `/column/{slug}` を使用
- ビルド: `tools/build-columns.py` + `.github/workflows/build-columns.yml`
- RSS（`/feed.xml`）も同じワークフローで `tools/build-columns.py` の後に `tools/build-feed.py` が生成し、`feed.xml` もコミット対象（2026-10-15、Issue #86。それまでどのワークフローにも無く 2026-04-25 から更新されていなかった。#75 と同じ方式）。
  - コラムは `build-columns.py` と同じ一覧（`bm_content.COLUMNS_API`、per_page=100）・同じslug（`make_slug`）で `/column/{slug}` を指す。ニュースは `news-detail?id=`（日付 `YYYY.MM.DD` も読む）。
  - 並びは記事が最後に変わった日の新しい順で最大30件。`lastBuildDate` はその先頭の日付の 09:00 JST（実行時刻ではない＝記事が変わらなければ feed.xml は同じで、空のコミットを作らない）。日付が読めない記事は `pubDate` を省く。
  - コラム0件・ID欠落は書かずに失敗し既存の feed.xml を残す。ワークフローではフィードの失敗でコラムの公開を止めない（`continue-on-error`）。
- **コラムの更新日は1か所で決める**（`tools/bm_content.py` の `column_modified_ymd`。2026-10-15、Issue #86）: 記事ページ（`dateModified`・`article:modified_time`・`last-modified`）、sitemap の `lastmod`、RSS の並び順が同じ値を使う。WP の `modified_ymd` が公開日より前（予約投稿など）または「今日」（一括更新の可能性）のときは公開日 `date_ymd` にする。以前は sitemap だけ WP の値をそのまま使い、公開日より前の lastmod が出ていた。

### 2.0b embed-viewer のパラメータ（埋込ビューア）

`embed-viewer.html` は iframe 埋込専用の漫画ビューア。主なクエリ:

| パラメータ | 役割 |
|---|---|
| `manga=id` | 表示する漫画ID（WP API `/manga/{id}` から取得）。**WP が「作品が無い」と答えたとき（404 で本文がプラグインの形 `{"error":...}`〈`code` が無い〉、または 410 で本文がプラグインか WP の形）は画像を推測せず「NO PAGES」**（無い作品・完全非公開の作品。判定はビズ書庫の `works.js` の `readMangaAnswer()` が「作品が無い」とする応答と同じ。2026-10 / Issue #84。以前は `contentsx.jp/material/manga/{id}/01〜30.webp` を推測して出していた）。それ以外のエラー（5xx・401/403・WP の `rest_no_route`・JSON でない応答）と通信の失敗のときは、**ビズ書庫の手書きデータ（`js/bm-fallback-works.js`）にある作品だけ**素材フォルダの画像で表示する（ページ数・表示モードも手書きデータどおり）。無い作品は推測せず「ただいま表示に時間がかかっています」と出して `/manga/{id}` を取り直し（間隔を 5→10→20→40→60 秒、1回の時間切れを 5→10→20 秒と延ばし、待ち時間の合計10分まで。あきらめたら読み込み中の印を止めて「しばらくしてから再度ご覧ください」）、WP が戻ったら表示する。作品の形をした応答（オブジェクトで `id` がある）だけを作品として扱い、作品 ID の形でない値（英数字とハイフン以外・英数字を含まない）は問い合わせずに「NO PAGES」。⚠️ トップの3D画面の縦読みサンプル（`omatome-ninja-new`）は素材が P1.jpg 形式で手書きデータに載せられないので、WP 障害中は「表示に時間がかかっています」になる（以前の推測表示も 404 で壊れていた）（非公開にした作品の素材画像を出さない。2026-10-29、ルート BUGS.md #085。以前は 01〜30.webp／01〜10.webp を推測していた）。WP が返した作品のギャラリーが空のときは素材フォルダの画像（ページ数は手書きデータ → WP の pages → 30 の順） |
| `slides=1` | 1ページずつのスライド表示（横読み向け）。`interval`で自動切替間隔(ms) |
| `speed=0.5` | 縦/横自動スクロール速度(px/frame) |
| `hold=1` | 親から`postMessage('s3d-start')`を受けるまで自動再生を保留 |
| **`manual=1`** ⭐ | **自動再生を止め手動操作にする。操作ガイド`.ev-guide`はスマホ最下部にドッキングする横長バー。2026-05-22 追加・改訂、ホームs3dで採用**<br>・横読み(slides)=**画面左半分タップ＝次 / 右半分タップ＝前**（右綴じ漫画式、`.ev-tap`左右ゾーン）。端で停止(ループ無し)、端のゾーンは無効。**矢印/スワイプ/ホイールは廃止**。ガイドは4.2秒でフェード<br>・縦読み=指スクロール＋ホイール(`overflow-y:auto`ネイティブ)＋右下の上下矢印`.ev-nav`(複製1セット)。ガイド「スクロールして読めます」は常時表示(`makeGuide(text,true)`) |

### 2.0 制作事例の2系統URL（重要）

BizManga には**目的の異なる2種類の作品URL**が並列で存在する。使い分け必須。

| URL系統 | 例 | 用途 | 即時性 | ターゲット |
|---|---|---|---|---|
| **`?manga=id`** | `biz-library?manga=diamond` | 漫画ビューアを全画面で直接開く（QR/直リンク共有） | ✅ WP公開直後から動作 | 人間（顧客・商談先・QR経由） |
| **`/works/{slug}`** | `/works/diamond` | SEO向け静的な作品説明ページ（説明・ギャラリー・CTA） | ❌ 週1ビルド後（日曜03:00 JST） | Google / ChatGPT / Perplexity |

**動作メカニズム:**
- `?manga=id`: `biz-library.html` の `js/works.js` が URLSearchParams を読んで `isDirectMode` 分岐。作品は WP API の `/manga/{id}` と `/library` のどちらか先に届いた WP のデータで開く（手書きデータでは開かない。WP が応答しない間は「表示に時間がかかっています」と再読み込みボタンを出して待つ。§2.1）。新作品にも即時対応。
- `/works/{slug}`: [tools/build-works.py](tools/build-works.py) が WP API `/works` を叩いて事前生成する静的HTML。`.github/workflows/build-works.yml` で毎週日曜 03:00 JST 自動ビルド。
- **ページ一覧（漫画プレビュー）の表示上限**: 詳細ページ下部 `.bm-work-detail-gallery` は抜粋プレビューとして **最大4ページ** のみ表示（`build-works.py` の `MAX_GALLERY_PAGES = 4` で `gallery[:4]` スライス）。全ページ閲覧は `/biz-library` の漫画ビューアで行う想定。2026-05-21導入
- **個別ページ title に検索KWを含める（2026-08-04追加）⭐SEO**: 旧 title は `{{title_ja}} | 制作事例 | ビズマンガ` で**作品名のみ＝検索KWが1語も入らず検索面で不可視**だった（[docs/content/KEYWORD-VOLUME.md](../docs/content/KEYWORD-VOLUME.md) の実測調査で判明）。`{{title_ja}}｜{{category_kw}}の制作事例｜ビズマンガ` に変更し、20本すべてに用途KWを付与。`category_kw` は `build-works.py` の **`CATEGORY_TITLE_KW`** 辞書でカテゴリ名→実際に検索される語形に変換する（例: `IP`→`IPコラボ漫画`、`紹介`→`サービス紹介漫画`）。**カテゴリ名の素直な連結は「IP漫画」「紹介漫画」など検索されない語になるため辞書経由が必須**。未定義カテゴリは `ビジネス漫画` にフォールバック。**作品名自体がKWを含む場合（例: 作品名「採用漫画」）は重複を避けて `ビジネス漫画` に置換**。表記は**漢字を優先**（実測: 採用漫画は採用マンガの約23倍、漫画制作はマンガ制作の約80倍）。og:title / twitter:title / keywords も同じKWで統一。

**運用ルール:**
- 新作品を顧客・商談で共有する時 → `?manga=id` を使う（即時）
- SEO流入を狙う時 → `/works/{slug}` が自動生成されるのを待つ or Actions から Run workflow で手動ビルド
- 両方のURLは恒久的に並列存在。どちらかに統合する予定はない

**よくある誤解:**
- ❌「新作品追加したら `/works/{slug}` も即使える」→ 日曜ビルドまで404
- ❌「`?manga=id` は旧仕様で廃止予定」→ 現役、QR運用の中核
- ✅「`works.html` の一覧は常に最新」→ JS が WP API から毎回取得するので新作品も即表示（ただしGoogleが読むのは日曜ビルド後）

### 2.0b 制作事例の用途別カテゴリページ（2026-04-28追加）⭐SEO

`/works/category/{slug}` で**用途別の事例集約ページ**を提供。legika型「showcase/category/」の戦略を踏襲し、用途別KWで個別URLとしてGoogleに認識させる。

| URL | ターゲットKW | 集約データカテゴリ |
|---|---|---|
| `/works/category/recruit` | 採用マンガ制作（title は2026-08-04に「採用**漫画**の制作事例〜」へ変更＝漢字が約23倍） | 採用 |
| `/works/category/product` | 商品紹介マンガ制作 | 商品紹介 + 紹介 |
| `/works/category/sales` | 営業マンガ制作 | 営業 |
| `/works/category/company` | 会社紹介マンガ制作 | ブランド + 紹介 |
| `/works/category/training` | 研修マンガ制作 | 研修 |
| `/works/category/ad` | マンガ広告制作 | 集客 + IP |
| `/works/category/ir` | IR漫画制作 | IR |

**動作メカニズム:**
- [tools/build-works.py](tools/build-works.py) の `CATEGORY_PAGES` 定義に基づき [tools/templates/works-category.html.tpl](tools/templates/works-category.html.tpl) から静的HTML生成
- 該当作品0件のカテゴリは生成スキップ（thin content 回避、sitemap にも含めない）
- 用途別LP（`/recruit-manga` 等）への内部リンクと、本ページ間の相互カテゴリナビを完備

**SEO構成（各ページ共通）:**
- title/H1 にKW完全一致を配置
- BreadcrumbList / CollectionPage / ItemList / FAQPage / Organization の5種JSON-LD
- 該当作品グリッド + カテゴリ解説200-300字 + FAQ 4問 + CTA 3ボタン
- canonical: `https://bizmanga.contentsx.jp/works/category/{slug}`

**`/works` のフィルターボタン:**
- `js/bm-works-page.js` の `buildFilter()` を改修。「すべて」以外のカテゴリボタンは `<a href="/works/category/{slug}">` リンクとして描画
- JS フィルター動作は廃止（同URL内での絞り込みはGoogleに別ページとして認識されないため）
- `CATEGORY_SLUG` マップで JA カテゴリ名 → slug 変換
- 例外としてその場で絞り込む `<button>` は2種類: 「すべて」（絞り込み解除）と、`CATEGORY_SLUG` に無い（カテゴリページの無い）カテゴリ（保険）。どちらも一覧の途中・下で押したら一覧の先頭を追従する帯のすぐ下へ戻す（`window.bmScrollBelowSticky`、§0.6）

**ビルド統合:**
- 個別作品ビルド (`generate_details`) と同じパイプラインで `generate_category_pages` を実行
- sitemap.xml に `BUILD:WORKS_CATEGORIES` ブロックで自動追記
- 週1ビルド（日曜03:00 JST、`.github/workflows/build-works.yml`）で更新

### 2.0c 制作事例のクリック挙動統一（2026-07-30）

**課題:** カテゴリページ新設時（2.0b）にモーダル層を載せ忘れていたため、`/works` と `/` はカードクリックでモーダル、カテゴリページだけ個別ページへ直行という不統一が発生していた。

**統一後の挙動（全ページ共通）:**
1. カードクリック → 制作事例モーダル（カード）を表示
2. モーダル最下部の「詳細を見る」ボタン → 個別作品ページ `/works/{id}` へ遷移

| ページ | モーダル実装 |
|---|---|
| `/`（トップ） | `js/bm-hero.js` |
| `/works` | `js/bm-works-page.js` |
| `/works/category/{slug}` | `js/bm-work-modal.js`（本対応で新設） |

**`/works` のカード（2026-10-15 Issue #85）:** 静的カード（`build-works.py` の `build_card`）も、WP 取得後に `js/bm-works-page.js` が描き直すカード（20件ずつのページ送り）も、中身を `<a class="bm-works-card-link" href="/works/{id}">` で包む。普通のクリックは `preventDefault()` してモーダル、Cmd/Ctrl/Shift+クリック・中クリックはリンク本来の動き（新しいタブ・ウィンドウで個別ページ。判定は `bm-work-modal.js` と同じ）。以前は描き直したカードにリンクが無く、新しいタブで開けなかった。`show_site` が `bizmanga` だけの作品は静的な個別ページが無いので、リンク先は「詳細を見る」と同じく 404 ページ経由で `/biz-library?manga={id}` になる

**`js/bm-work-modal.js`（静的ページ用の汎用モーダル）:**
- 作品データは `<script type="application/json" id="bmWorksModalData">` からビルド時同梱で読む（カテゴリページはWP APIを読み込まないため。`build_category_works_json()` が生成、gallery は5枚まで）
- `window.BM_WORKS_DATA` / `bm-data-ready` があればそれで上書き（API併用ページでも動く）
- `.bm-works-card[data-work-id]` を自動 hydrate。カードは `<a href="/works/{id}">` のまま残し `preventDefault()` で抑止 → 内部リンクのクロール性・Cmd/Ctrl/中クリックの新規タブを維持
- 縦読み/見開き判定は `window.bmViewType` に委譲（BUGS #012/#013 再発防止）
- 公開API: `window.bmWorkModal = { open, close, setWorks, hydrate }`
- 読込順は `bm-view-type.js` → `bm-work-modal.js`

**「詳細を見る」ボタン:** `#workDetailLink`（`.work-detail-cta`）。3ページのモーダルHTMLに追加。href は各 `openWorkDetail()` が `/works/{id}` にセット。日本語固定表示 は 日本語の表示内容。

### 2.1 QR コード用ダイレクトモード ⭐重要
```
https://bizmanga.contentsx.jp/biz-library?manga={manga-id}
```
- QRコードで直接特定の漫画を開くモード
- **動作**: 書庫UIを全て非表示 → 漫画ビューアのみ表示
- **制御**:
  - [biz-library.html](biz-library.html) の `<head>` — 即座に `<html class="direct-mode">` を付与（フリッカ防止）。**`?manga=` の値が空・記号だけ（`?manga=`・`?manga=。` など、末尾の記号を除くと空になる値）のときは付けず、通常のビズ書庫を表示する**（`js/works.js` も読込後に同じ判定で付け外しする。この場合は qr-mode も付かない）
  - [css/works.css](css/works.css) の `html.direct-mode` ルールでヘッダー/フッター/書庫UI非表示（ヘッダーは `<header class="bm-header">` なので `.bm-header` を指定する。2026-10 まで存在しない `.header` を指定していて、`works.js` が動くまでヘッダーが見えていた / Issue #84）
  - [js/works.js](js/works.js) `isDirectMode` フラグで分岐
- **QR経由 vs 内部遷移の判別**: `document.referrer` が同一オリジンなら内部遷移（ホームギャラリー等）、そうでなければ QR 経由。後者は `<html class="qr-mode">` を付与。「表示に時間がかかっています」の再読み込みボタンで読み込み直したときは、読み込み直す前の判定を引き継ぐ（ブラウザは再読み込みの referrer をこのページ自身にするため。引き継げないブラウザでは QR 経由として扱う）
- **閉じるボタン (✕)**:
  - QR経由 (`qr-mode`): CSS `display:none` で非表示。JSクリック/ESCも無効 → 書庫に降りられない（元の仕様維持）
  - 内部遷移 (ホームギャラリー等): 表示。クリック/ESC で `biz-library`(パラメータなし) に遷移してライブラリを見せる
- **history.pushState**: ダイレクトモードでは呼ばない → ブラウザ戻る = 書庫ではなく前のページへ
- **開き方（2026-10-14 / Issue #71。2026-10-15 平澤さんの方針で変更）⭐**: 作品は **WP のデータでだけ・1回だけ**開く（`openDirect()` が2回目以降を無視）。ページ数・画像・最終ページCTA（BUGS #037）が WP と一致する。**手書きの `FALLBACK_WORKS` では開かない**（WP と違う古いページ数・画像で壊れた表示にしない）。非公開にした（WP から消した）作品は `FALLBACK_WORKS` にも載せない（`tools/smoke-manga-wp.py` が「手書きデータの作品はすべて /library にある」を確かめる）。`life-school`・`sixtones` は 2026-04 に非公開にした作品で（04-17 に sitemap、04-19 にホーム・制作事例・ヒーローの手書きデータから外した）、ビズ書庫の手書きデータとお客様の声の予備画像に残っていたのを 2026-10-27 に外した。QR直リンクは「作品が見つかりませんでした」になる。⚠️ WP に無い作品を「未登録」と決めつけて登録しない（消した作品かもしれない。`git log -S '<作品ID>'` で経緯を確かめる）
  - 以前は `FALLBACK_WORKS` にある作品（手書き19件）を手書きデータで即オープンし、`/library` 到着時に開き直し・CTA の貼り直しをしていた（#037 の継ぎ当て）。このため読込の順番次第で手書きのページ数・画像のまま残り（例: `seko` 手書き25P／WP 30P、`lady-column` 手書き8P・見開き／WP 5P・縦読みで 05〜08.webp が 404）、同じ作品を2回開くこともあった
  - **どちらか先に届いた WP のデータで開く**: `/manga/{id}`（1作品）と `/library`（一覧）の**どちらか先に「その作品のデータ」を返した方**で開く（どちらも同じ WP のデータ）。`?manga=` の値が作品 ID の形（英数字とハイフン）でないとき（例 `seko_2`・日本語の ID）は `/manga/{id}` に問い合わせず、`/library` の作品 ID と照合して開く。`/library` に無い作品（QR 限定公開など）は `/manga/{id}` を待つ。後から届いた方では開き直さない。表示中のビューアは開いたときのデータを使う（`/library` が後から届いても、最終ページCTA・見開き/縦読み切替は開いたときのデータのまま。`/library` に無い作品も切り替えられる）
  - **結果は次の3つだけ**:
    1. **開く**: `/manga/{id}` か `/library` から作品のデータが届いた
    2. **「作品が見つかりませんでした」**（トップへ戻るリンク）: `/library` が届いていてその作品が無く、**かつ** WP の `/manga/{id}` も「その作品は無い」と答えた（`/library` がまだなら届くまで待つ。`/library` が失敗・0件・時間切れなら取り直して確かめる）。作品 ID の形でない値は `/library` に無ければこの画面。制作過程（`pre-red-*` / `pre-name-*`）は `/library` と `/preproduction` の両方に無いときだけ（下の「制作過程」）
    3. **「ただいま表示に時間がかかっています」＋「再読み込み」ボタン**: それ以外（WP が応答しない・エラー・時間切れ・アクセスの一時的な制限・`/library` の失敗や0件等）。**すぐには打ち切らずに待つ**: ページを開いてから5秒（`DIRECT_SLOW_MS`）たってもビューアを出せていなければ、スピナーの下にメッセージとボタン（`location.reload()`）を出す。作品のデータが届いて開く処理を始めた後も、1枚目の画像の読込が終わらないなどでビューアを表示できないまま8秒（`DIRECT_OPEN_SLOW_MS`）たてば同じメッセージを出す。後から表示できたらメッセージを消す
       - **取り直し**: `/manga/{id}` は間隔をあけて取り直す（`DIRECT_RETRY_MS`。2→5→10→20→30秒、以後30秒ごと。「作品が無い」と答えたら取り直さない）。`/library`（重い一覧）は失敗・0件・時間切れのとき、**判定に要る場合だけ**取り直す: 制作過程・作品 ID の形でない値（`/library` だけが頼り）と、`/manga/{id}` が「作品が無い」と答えた後（`/library` で確かめる）。それ以外（WP が応答しない間など）は `/manga/{id}` だけを取り直し、`/library` を取り直し続けない
       - **時間切れ**: `/manga/{id}` も `/library` も1回ごとの時間切れを取り直すたびに延ばす（`DIRECT_FETCH_TIMEOUT_MS`。5→10→20秒、以後20秒。WP がいつも遅くても届く）。`/library` の時間切れは判定に要るときだけ効かせる（要らない間＝`/manga/{id}` の答えを待っている間は中断せず、遅れて届いた `/library` にその作品があれば開く。要るようになった時点で時間が過ぎていれば、すぐ中断して取り直す）
       - タブが表示されていない間は取り直さず、表示に戻ったら続ける。表示していた時間で10分（`DIRECT_RETRY_LIMIT_MS`）たっても開けなければ（ビューアを表示できなければ）取り直しを止め、スピナーを外してメッセージと再読み込みボタンだけを残す
  - **WP の作品データ→mangaData の変換は `toMangaEntry(w)` 1つ**: `/library` と `/manga/{id}` の両分岐が同じ関数を通る（BUGS #012/#013 の「両分岐を揃える」を構造で守る）。ページ数はギャラリー枚数→WP の `pages`→1 の順（0 にしない。ギャラリー枚数への補正はここだけで、`openManga` では直さない）、タイトルが空なら作品 ID、`path` は `https://contentsx.jp/material/manga/{id}/`（ギャラリーが空のときの画像の置き場）、view_type は WP の値＋強制縦読み（`window.bmViewType.isForcedVertical`）・縦読み専用＝切替不可（`window.bmViewType.isVerticalOnly`）の判定を委譲（`bm-view-type.js` を読めなかったときは、縦読みの作品を見開きで開かない側に倒す）、CTA 項目（`client_url` / `cta_label_ja` / `cta_enabled`）・赤ペン/ネームのギャラリーも同じ
  - **API の場所と時間切れ**: ビズ書庫は `js/bm-wp-config.js` を `works.js` より前に読み（`tools/check-site.py` の依存表で確認）、`works.js` の `WP_API_BASE` はその `apiBase`（読めなかったときだけ既定の URL）。取得は `wpApiGet()`（AbortController の時間切れつき GET）1か所で、`/library` と `/manga/{id}` の両方が使う。時間切れは直リンク用に `works.js` で決める（上の `DIRECT_FETCH_TIMEOUT_MS`。`bm-wp-config.js` の `timeout` は使わない）。一覧（`?manga=` なし）の `/library` は中断しない（遅れて届いても使う）
  - **キーの照合**: `?manga=` の値は、前後の空白と**末尾に付いた句読点・記号・かっこ・空白**（LINE やメールで URL の直後に続いた「。」「.」「)」など。全角も含む）を取り除いてから使う（例 `?manga=seko。` → `seko`。英数字・ハイフン・下線と日本語などの文字は残す）。大文字小文字はそろえず、登録キー（`/library` の作品 ID・制作過程）と**まず完全一致、無ければ大文字小文字を区別せずに**照合する（`matchKey()`。例 `?manga=SEKO` → `seko`）。`/manga/{id}` で開くときは応答の `id` をキーにする
  - **待っている間は読み込み中の表示**（暗い背景の上の白とオレンジのスピナー。`showDirectLoader()`、見た目は `bizmanga.css` の `.bm-manga-loader`、位置とメッセージ・ボタンは `css/works.css` の `.bm-direct-loader` / `.bm-direct-stalled`）。ビューアが開いたら（`openManga` の `proceedOpen`）・「見つかりませんでした」を出したら消す
  - **開く処理の例外**（`openManga` 本体・画像読込後の `proceedOpen`・見開きの組み立て）: スピナーを残さない。まだ漫画のページを表示できていなければ開きかけのビューアを閉じ、スピナーを外して「表示に時間がかかっています」と再読み込みボタンを出す（`failOpen()`。「見つかりませんでした」にはしない）
  - **直リンクでは一覧を作らない**: 隠れている書庫の一覧（手書きデータでの初期表示・`/library` 到着時の作り直し・表紙の縦長判定）を省き、制作過程カルーセルの自動送り（rAF）も始めない（ビューアだけを表示するため）
  - **制作過程（赤ペン・ネーム）**: キーが `pre-red-*` / `pre-name-*` の形（大文字小文字を区別しない）なら制作過程として扱う（WP の作品 ID が `pre-` で始まるだけなら作品として開く）。手書きの制作過程データにあれば即開く。無ければ **`/library` と `/preproduction`（赤ペン・ネーム専用の API）を並行して** `wpApiGet()` で取り、どちらかで登録されたら開く（2026-10 / Issue #84）。制作過程は `/manga/{id}` に無いので取得しない
    - `/preproduction` の項目で画像（gallery）が無いものは登録しない（開くと空のビューアになるため。直リンクは「見つかりませんでした」）
    - 登録キー: `/library` の作品の赤ペン・ネームは `pre-red-{作品ID}` / `pre-name-{作品ID}`（`buildPreDataFromAPI()`。直リンクでは制作過程のキーのときだけ呼ぶ）、**`/preproduction` の項目は `pre-red-wp{投稿ID}` / `pre-name-wp{投稿ID}`**（`registerPreproductionItems()`。一覧のカルーセル `rebuildPreCarousels()` も同じ関数を通る）。⚠️ ホームの制作過程スライド（`js/bm-pre-production.js`）が `biz-library?manga=` に渡すキーも同じ `-wp` の形にする（**2つのファイルでキーの形を必ずそろえる**。2026-10 まではホームが `pre-red-{投稿ID}` で開き、ビズ書庫で必ず「作品が見つかりませんでした」になっていた）
    - 旧形式の URL: `pre-red-{数字}` / `pre-name-{数字}`（大文字小文字を区別しない）は、その値のままの登録キーが無ければ `pre-red-wp{数字}` / `pre-name-wp{数字}` と読み替えて照合する（`startDirectFlow` の `findPreKey()`）
    - **「作品が見つかりませんでした」は `/library` と `/preproduction` が両方とも配列で届き、どちらにもその制作過程が無いときだけ**。どちらかが失敗・時間切れ（`/library` は0件も）なら作品と同じく「表示に時間がかかっています」を出し、失敗した方を取り直して待つ（`/preproduction` も `DIRECT_RETRY_MS` の間隔・`DIRECT_FETCH_TIMEOUT_MS` の時間切れで取り直す）。`/preproduction` が 200 の空配列 `[]` なのは今の WP の正常な状態（項目が無い）なので失敗にしない
    - 直リンクでは `/library` の到着時に `rebuildPreCarousels()` を呼ばない（隠れたカルーセルを作り直さず、`/preproduction` を二重に取りに行かない）
  - **「作品が見つかりませんでした」は、開いた（開く処理を始めた）ビューアがあるときは出さない**（ページ本体を置き換えて消すため）
  - **想定外の例外**（直リンクの処理の中）: 暗い画面とスピナーのまま止めず、まだ開いていなければスピナーを外して「表示に時間がかかっています」と再読み込みボタンを出す
- **参考: 一覧（`?manga=` なし）から開くとき**: WP の `/library` が届くまでは手書きの `FALLBACK_WORKS`（作品の一覧は `js/bm-fallback-works.js` の `window.BM_FALLBACK_WORKS`。埋込ビューアと共通。`biz-library.html` で `works.js` より前に読む＝`tools/check-site.py` が確かめる）で一覧を表示し、その間に押した作品も手書きデータ（素材フォルダの画像）で開く。手書きデータのページ数は**素材フォルダに実際にある枚数**（WP の値に合わせると素材フォルダに無いページが 404 になる）、表示モード（縦読み専用）は WP に合わせてある（2026-10-16 時点。素材フォルダや WP 側の表示モードを変えたら `js/bm-fallback-works.js` も直す）。**WP の到着前に開いた作品は、`/library` が届いたら次の見開き/縦読みの切替から WP のデータ（ページ数・表示モード・最終ページCTA）を使う**（表示中のページは開き直さない）
- **closeManga()の挙動**: referrer が同一ホストなら back、なければ `./`（ホーム）へ
- **非公開作品のQRアクセス（限定公開運用）**: WP で全表示フラグを「表示しない」にしていても、`/manga/{id}` エンドポイント経由で取得可能
  - `/library` に無い作品は `/manga/{id}` の応答で開く（上記）
  - `/manga/{id}` が「作品が無い」と答え、`/library` にも無ければ「作品が見つかりませんでした」画面 + トップへ戻るリンク
  - これにより「ビズ書庫・ギャラリー・新作情報 全て非表示だがQR経由でだけ見せたい」運用が可能
- **完全非公開 (`cx_private`)**: WP管理画面の「🔒 完全非公開」で ON にすると、QR直リンクすらアクセス不可になる
  - `/works`, `/works-new`, `/library`, `/manga/{id}` すべてから除外
  - WP管理画面以外からは一切閲覧できない
  - 埋込ビューア（`embed-viewer.html`）も `/manga/{id}` が「作品が無い」と答えたら画像を推測せず「NO PAGES」（§2.0b。2026-10 / Issue #84）。WP がエラー・通信できないときは、手書きデータ（`js/bm-fallback-works.js`）にある作品だけ素材フォルダの画像で表示する
  - 運用: 制作中・お蔵入り・クライアント契約切れなどで完全に閉じたい時

### 2.2 プラン事前選択
```
https://bizmanga.contentsx.jp/contact?plan={full|hybrid}
```
- お問い合わせフォームのメッセージ欄に自動で「【〇〇プランについて】」プレースホルダ挿入
- `full`=フル漫画家プラン、`hybrid`=ハイブリッドプラン（2026-08-19 料金プラン刷新でキーを`light|standard|premium`から変更）
- [contact.html:236-245](contact.html) で処理

### 2.3 UTM / トラッキング
- `?utm_source=...` `?utm_medium=...` `?utm_campaign=...` `?source=...`
- contact フォーム送信時にメッセージ本文末尾に自動付加
- `[BizManga経由のお問い合わせ]` タグも必ず付与
- 行動ログ（`js/bm-tracking.js`）の「閲覧FAQ」は、FAQの質問部分のクリックを記録する。対象は `.lpv2-faq-item > summary`（faq・pricing）と `.ba-faq-q > button`（bizanime。番号 `.ba-faq-num` は除く）。FAQの構造を変えたらセレクタと `tools/test-bm-tracking.cjs` も直す

## 3. 共通 JS コンポーネント

| ファイル | 役割 | 呼び出し方 |
|---|---|---|
| `js/bm-cta.js` | 共通CTAセクション生成 | `<section id="bmCtaMount"></section>` を置く |
| `js/bm-nav.js` | ヘッダーナビ + ハンバーガー + 追従FAB + **Google広告「LINEお問い合わせ」「電話お問い合わせ」CV発火**（独立IIFE、`CONVERSIONS` 表。§5 Google Ads ③④）+ **一覧の先頭を追従する帯の下へ戻すスクロール `window.bmScrollBelowSticky`**（ファイル末尾の独立IIFE。§0.6） | 全ページで読込（defer） |
| `js/bm-nav.js` | 日本語固定表示エンジン | 全ページで読込（bm-nav.jsより先） |
| `js/bm-sanitize.js` | HTMLエスケープ + URL検証 | `window.bmSanitize.html()` / `.url()`（自社ドメインのみ）/ `.linkUrl()`（外部サイト可・スキームだけ確認。§12） |
| `js/bm-tracking.js` | ユーザー行動ログ | `window.bmGetTrackingNote()` で出力 |
| `js/bm-wp-api.js` | WP API クライアント | `window.BM_WORKS_DATA` 等をグローバル公開。**取得するのはそのデータを使う画面要素があるページだけ**（ファイル内の `USED_BY`。2026-10-15 Issue #85）: ホーム＝`/works`・`/works?site=bizmanga`・`/works-new`・`/news`・`/columns`、制作事例＝`/works?site=bizmanga`、ニュース＝`/news`、コラム一覧＝静的カードがあれば無し。`/library` はホームと制作事例でだけ先読みする（結果は使わない。ビズ書庫の `works.js` が同じURLを取得するので、WP の応答の max-age=300 でブラウザのキャッシュに載せておく。`BM_LIBRARY_DATA` は読む側が無いので廃止し、先読みは `bm-all-data-ready` を待たせない）。全部を同時に取りに行き、ニュース・コラムは漫画事例の取得を待たない。イベント: `bm-data-ready`（漫画事例の取得後。使わないページでは即時）/ `bm-news-ready`（ニュースの取得後。`detail = { ok, count }`）/ `bm-all-data-ready`（このページで取得したもの全部の後。失敗があっても出す） |
| `js/bm-wp-config.js` | WP設定 | API baseURL / cache TTL / メンテナンス表示スイッチ（§5「WordPress 一時停止スイッチ」）。ビズ書庫（`works.js`）も `apiBase` を使う（`works.js` より前に読む） |
| `js/bm-view-type.js` | 漫画ビュー縦読み/見開き判定 **一元管理** | `window.bmViewType.{isForcedVertical, isVerticalOnly, isVerticalByRatio, probeVerticalByImage}`。閾値・優先順を変えるときはこの1ファイルだけ触る |
| `sw.js` | Service Worker（表紙キャッシュ） | `index.html` / `biz-library.html` で登録 |

## 4. 表示言語

- 全ページは日本語で固定し、`<html lang="ja">` を使用する。
- 言語切り替えボタン、翻訳スクリプト、翻訳属性は置かない。`旧言語保存値` の旧保存値は共通ナビゲーションの初期化で削除する。
- WordPress API の既存の他言語フィールドは互換性のため保持するが、このフロントエンドは日本語フィールドのみを使用する。
- alternate language の `hreflang` は出力しない。canonical、日本語の OG・構造化データ、sitemap、feed の URL は維持する。

## 5. 外部連携

| サービス | 用途 | 設定値 |
|---|---|---|
| HubSpot Forms | お問い合わせ送信 | Portal `48367061` / Form `b6da14d0-d60d-4357-89fc-0015ed32b704`。⚠️ **部署（`busyo`）は HubSpot 側で必須**＝空だと送信が拒否される（B/C 共通フォーム）。そのため `contact.html`・`download.html` とも部署を必須にしている（`required`＋送信時に前後の空白を除いて空なら `setCustomValidity` で止める。HTML の `required` は空白だけの入力を通すため。2026-09-29） |
| Contents X CRM | お問い合わせをCRMの受信箱へ連携（2026-07-29 追加・2026-09-26 埋め込みスクリプト方式 inbound-v1 へ移行） | CRM の埋め込みスクリプト `https://contentsx-crm.vercel.app/embed/inbound-v1.js` を `contact.html` の `</body>` 直前で読み込み（`data-source-key`=`60235146e3d11473ea106ca2b89780df`・`data-auto="false"`・`async`）、同ページのインラインの送信処理で入力チェック通過後・HubSpot送信の直前に `window.BizcarteInbound.sendForm(form)` を1回呼ぶ。送信先は `/api/inbound/s/<公開キー>`。公開キーは**秘密ではない**（ブラウザに出る前提）。CRM側は**登録済みの送信元ドメイン（Origin）だけ**を受け付ける＝本番ドメイン `https://bizmanga.contentsx.jp` 以外（`www.` 付き・localhost 等）からの送信は拒否される（HPの受付には影響なし）。ドメインを変える・増やす時は CRM 側で許可ドメインの追加が必要。項目は5欄とも `data-crm-field` で明示（company→company_name / department / fullName→full_name / email / message。プレースホルダーやラベルの文言を変えても対応が崩れない）。ハニーポット `#bmWebsite` はスクリプトタグの `data-honeypot="#bmWebsite"` で明示し、値が入った送信は CRM 側が黙って破棄する。さらに `js/bm-contact.js` も、値が入った送信は HubSpot・CRM のどちらへも送らず、広告CV・`generate_lead` も発火させずに完了表示だけ出す（資料DLの `#dlWebsite` と同じ扱い。§5.2）。連投制限は送信元ごとに10分5件。`data-auto="false"` は必須（外すと、ページ全体の submit を拾う自動送信と手動の `sendForm` の両方が動き、**二重に届く**）。CSP は `script-src` に **`https://contentsx-crm.vercel.app/embed/inbound-v1.js`（このファイルだけ）** を追加（`connect-src` はもともと `https:` を許可しているので追加不要）。`sendForm` の呼び出しは try/catch と関数の存在確認で囲んである＝**外部スクリプトが読めない・壊れていても HubSpot 送信・完了表示・Google広告CVは従来どおり動く**（読めていないときはコンソールに警告）。⚠️ CRM を独自ドメイン（`crm.contentsx.jp` 等）へ移すときは、`contact.html` のスクリプトの `src` と CSP の `script-src` の**2箇所**を同時に直す（片方だけだとスクリプトが読めず、CRM にだけ届かなくなる）。本番での疎通確認は、フォームを送ると HubSpot 登録と広告CVが発生するため、本番ページのコンソールで `BizcarteInbound.send({...})` を呼んで CRM だけに送る。CRM側は受信箱に溜めるだけで、担当者が `/inbox` で承認して初めて会社・担当者・活動が作られる。⚠️ 2026-09-24 に CRM 側の仕組みが変わり、旧経路（`/api/inbound/web` への並行 POST・`CRM_ENDPOINT` / `CRM_TOKEN` / CRM側 `INBOUND_SECRET`）は受け付けられなくなった（この間 HubSpot には届き CRM には届いていなかった）。2026-09-26 に本方式へ移行し、**このサイトでは**旧トークンと同期ルールは不要になった（ContentsX・ビズ採用など他サイトが移行を終えるまで、CRM 側の `INBOUND_SECRET` と ContentX_HP の `crm-token-sync` フックは残る＝他サイトの移行後に CRM 側で廃止する） |
| Google Analytics 4 | アクセス解析 | 測定ID `G-Q1T3033Q3W`（全HTMLの `<head>` に `gtag.js`、2026-04-16 設置） |
| Google Ads | コンバージョン計測・リマケ | コンバージョンID `AW-18108125426`（GA4タグ直下に `gtag('config', 'AW-...')` 追加、2026-05-09 設置）。**CV計測イベント2種**: ①「お問合せフォーム到達」(`9tNKCNH49agcEPKh0LpD`) = `contact.html` head（onload内）で発火 / ②「送信完了サンクス」(`F13ECI3R3qgcEPKh0LpD`) = HubSpot送信成功 `.then()` 内で発火（2026-05-20 ラベル末尾を `…Cl…`→`…CI…` に是正） / ③「LINEお問い合わせ」(`LX7_CMndmO0cEPKh0LpD`) ④「電話お問い合わせ」(`Cf7LCMzdmO0cEPKh0LpD`)（いずれも 2026-09-03 Issue #27）= `js/bm-nav.js` 末尾の独立IIFEにある `CONVERSIONS` 表（selector→ラベル）。`document` の click を **capture** で委譲監視し、③は `a[href*="line.me/R/ti/p/"]`、④は `a[href^="tel:"]` に当たるクリックで `gtag('event','conversion')` を発火。対象はヘッダー丸アイコン／ハンバーガー末尾／追従FAB／共通CTA(bm-cta.js)／LP内ボタン／制作事例カテゴリなど**LINE公式URL・電話番号を指す全リンク**（静的HTML・JS生成・ビルド生成を問わず自動で対象。HTML側に onclick は付けない。CVを増やす時は表に1行足す）。LINEは `target="_blank"`・電話は `tel:` で元ページが残るため、Google例の「遷移を止めて `event_callback` で `window.location`」は使わず遷移はブラウザ標準に任せる（同等の関数は `window.bmReportConversion(sendTo, url)` として公開）。シェア用 `social-plugins.line.me` は対象外。**ラベルは管理画面の `send_to` をコピペ・手入力禁止**（BUGS #025） |
| WordPress REST API | 漫画事例 / ニュース / テスティモニアル / コラム | `https://cms.contentsx.jp/wp-json/contentsx/v1` |
| LINE 公式 | LINEで相談 | `https://line.me/R/ti/p/@626kzaze?oat_content=url&ts=01071831`（クリックは Google Ads CV③「LINEお問い合わせ」として計測。上記 Google Ads 行参照） |
| 電話 | ビズマンガ専用 | `tel:03-6261-0764`（2026-05-17〜 ヘッダー丸アイコンCTAに展開。クリックは Google Ads CV④「電話お問い合わせ」として計測、上記 Google Ads 行参照） |
| GitHub Pages | ホスティング | `bizmanga.contentsx.jp` (CNAME) |

### 5.1 お問い合わせフォームの二重送信ガード ⭐再発防止（2026-08-05 / BUGS #046）

- **フォーム単位のフラグ `bmIsSubmitting`** を送信ハンドラ先頭で判定し、送信中の再入は経路によらず `return`。**ボタンの `disabled` だけに頼らない**（`disabled` はボタン経由の連打しか塞げず、Enter や `requestSubmit()` はすり抜ける）
- フラグを false に戻すのは **`.catch` のみ**。成功時は戻さない＝完了画面から再送信されない
- **失敗時の文言で無条件に再送を促さない**: fetch の失敗は「応答が取れなかった」であって「届かなかった」ではない。送信直後の通信断ではサーバーに届いているため、「もう一度お試しください」と促すと重複する。現行文言は「送信結果を確認できませんでした／すでに送信が完了している場合があります」＋電話番号の案内

### 5.2 資料ダウンロード（`/download`・2026-09-28 新設）

会社名・氏名・メール等を入れると、その場でサービス資料（PDF）がダウンロードされるページ。**問い合わせ内容の欄は無い**。入力内容は CRM の受信箱「資料DL」の箱に届き、担当者が承認すると顧客として登録される。

| 項目 | 内容 |
|---|---|
| ファイル | `download.html` / `css/bm-download.css`（`.bm-dl-*`）/ `js/bm-download.js`。入力欄・送信ボタンはお問い合わせと同じ部品（`.bm-form-*` / `.cb-submit`） |
| 資料 | `material/docs/bizmanga-service-guide-202609.pdf`（全22ページ・約6.2MB。元は Canva 書き出しの 20.4MB。画像だけを JPEG q85 に置き換えて圧縮し、透明マスク・色空間は保持、全ページを元と描画比較して差が見えないことを確認）。表紙画像 `material/images/download/bizmanga-service-guide-cover.webp`、OG `material/images/og/og-download.webp` |
| 資料を差し替えるとき | `js/bm-download.js` の `PDF_URL` / `PDF_FILENAME`、`download.html` の `data-crm-document`（CRM に届く資料名）・ページ内の「全22ページ」「約6MB」「2026年9月版」・メタ説明を合わせて直す |
| PDF の公開範囲 | **フォームを通らない場所（ナビ・本文）に PDF への直接リンクを置かない**。URL は `js/bm-download.js` と送信後に出す「始まらない場合」リンクだけ。`robots.txt` で `/material/docs/` を全クローラーに Disallow、sitemap にも載せない（`/download` ページ自体は sitemap・llms.txt に掲載） |
| 項目 | 会社名（必須 `company`）/ お名前（必須 `name`）/ メール（必須 `type=email`）/ 電話（任意 `type=tel name=tel`）/ 部署名（**必須** `department`＝お問い合わせと同じ name。HubSpot 側で必須のため 2026-09-29 に任意→必須へ変更。§5 HubSpot 行参照）/ プライバシーポリシー同意（必須チェックボックス）/ ハニーポット `#dlWebsite`（`name="website"`＋`tabindex="-1"`、画面外）。各欄に `data-crm-field` を付けて CRM 側の項目判別を固定している |
| 入力チェック | ブラウザ標準（必須・`type=email`・同意）に加えて、`js/bm-download.js` がドメインに「.」の無いメール（`a@b`）を `setCustomValidity` で止める。二重送信ガードは §5.1 と同じフラグ方式。**フォームは `method="post"`、送信ボタンは HTML で `disabled` にしておき `js/bm-download.js` の初期化の最後（submit ハンドラー登録後）に有効にする**（JS の読み込み前・失敗時にブラウザ標準の GET 送信で入力内容が URL・GA4・Clarity に載るのを防ぐ） |
| 送信の順番 | 入力チェック通過後 ①HubSpot（`SEND_TO_HUBSPOT`）②CRM（`BizcarteInbound.sendForm(form)`。外部スクリプトなので try/catch と関数の存在確認で囲む）③PDF のダウンロード開始（`<a download>` をクリック）＋お礼と「始まらない場合」リンクを表示。**①②の応答は待たない**（失敗してもダウンロードは止めない）。ハニーポット `#dlWebsite` に値がある送信は①〜③をせずお礼だけ出す（HubSpot に迷惑なコンタクトを作らない） |
| CRM | `download.html` の `</body>` 直前で `https://contentsx-crm.vercel.app/embed/inbound-v1.js`（`data-source-key`＝本サイトの公開キー・`data-auto="false"`・`data-honeypot="#dlWebsite"`・`async`）を読み込む。フォームの目印 `<form id="download-form" data-crm-form="download" data-crm-document="ビズマンガ サービス資料（2026年9月版）">` により、送信本文に `form_kind: "download"` と資料名が付く（スクリプト v1.1 以降）。CSP は `download.html` の `script-src` に **`https://contentsx-crm.vercel.app/embed/inbound-v1.js`（このファイルだけ）** を追加（`connect-src` はもともと `https:` を許可）。CRM を独自ドメインへ移すときはスクリプトの `src` と CSP の2箇所を同時に直す。⚠️ **CRM 側の設定（設定＞プラグイン＞ホームページ連携）で「資料ダウンロード」がオンでないと受け付けられない** |
| HubSpot | お問い合わせと同じフォーム（Portal `48367061` / Form `b6da14d0-…`）に、**お問い合わせと同じ項目の組み合わせ**（company / busyo / lastname / firstname / email / message）で送る。HubSpot 側に「資料DL」を表す欄が無いため、`message` の先頭に `【資料ダウンロード】<資料名>` と電話番号・流入元を入れて区別する（`pageName` は `BizManga - 資料ダウンロード`）。HubSpot 廃止（2026年11月予定）時は `js/bm-download.js` の `SEND_TO_HUBSPOT` を `false` にする |
| 計測 | GA4・Google広告のコンバージョンは**付けていない**（付けるかは平澤さんの判断待ち。付けるなら②の直後で、お問い合わせの `generate_lead` と区別できる名前にする） |
| 導線 | ヘッダー（`js/bm-nav.js` が「お問い合わせ」の左に `.bm-nav-dl` を差し込む。1280px 以上は文字入り、1025〜1279px は丸アイコン＋吹き出し、769〜1024px は文字入り、768px 以下は非表示）／ハンバーガーメニュー末尾（`mobileCtas` の先頭）／フッターのリンク列（`bm-nav.js` が「お問い合わせ」の直後に差し込む）／共通CTA `bm-cta.js` の3つ目のボタン `.bm-cta-btn--dl`。ヘッダー・フッターは各HTMLとテンプレートに直書きのため、**JS から1か所で足している**（テンプレート＝レビュー必須領域を触らずに生成ページにも効く）。追従CTA（`.bm-fab`）はこのページでは出さない（§7.1） |
| レイアウト | PC（861px〜）: 左に表紙・形式と「この資料でわかること」、右にフォーム（sticky・`top: 96px`＝ヘッダー＋24px。**画面の高さ 940px 以上のときだけ**追従＝カード 805〜820px が画面より高いまま貼り付くと送信ボタンが隠れるため。フォームの項目を増やしたら測り直す。2026-10-14 まで共通CSSの overflow-x:hidden で効いていなかった → §0.6）。スマホ（〜860px）: 表紙 → フォーム → わかること の順（`grid-template-areas`。HTML も同じ順） |

### WP API エンドポイント
- `/works?site=bizmanga` — 全漫画事例
- `/works-new?site=bizmanga` — 新作漫画（ホームギャラリー用）
- `/library` — ビズ書庫全作品（`js/works.js`・`js/bm-lp-library-embed.js` が取得。`bm-wp-api.js` はホームと制作事例で先読みだけする）
- `/news?site=bizmanga&per_page=50` — ニュース一覧
- `/columns?site=bizmanga&per_page=50` — ホームのコラム枠（最新8件）。コラム一覧ページは静的カードがあればブラウザで取得しない（静的ビルド `tools/build-columns.py` が `per_page=100` で取得）
- `/columns/{id}` — コラム個別（本文含む）

### WordPress 一時停止スイッチ（メンテナンス表示・2026-10-22・Issue #101）⭐
WordPress 側の保守などで止めたいときに、**`js/bm-wp-config.js` の `maintenance: false` を `true` にしてmainへ反映するだけ**で次が一度に起きる。戻すときは `false` に戻して反映する。
- そのページから WordPress API（`https://cms.contentsx.jp/wp-json/`）へのアクセスを一切しない（`fetch` 自体を設定ファイルで止めるので、URLを直書きしている部品も止まる）。各部品は既存の「読み込めなかったとき」の表示に落ちる（ビズ書庫は `FALLBACK_WORKS`）
- 画面下に中立なお知らせ「ただいま一部の表示を一時停止しています。…」を出す（`css/bm-maintenance-notice.css`。どのセクションがWPかは名指ししない。×で閉じるとそのタブでは再表示しない。追従CTA・TOPへ戻るより上に置き、ビューア・ドロワーより下）。iframe（埋込ビューア）の中では出さない
- QR直リンク（`/biz-library?manga=`）は WP の取り直し（最大10分）を始めず、すぐに「ただいま表示を一時停止しています。…」と再読み込みボタンを出す（`js/works.js` の `startDirectMode`）
- 埋込ビューア（`embed-viewer`・用途別LP）は、手書きデータ（`js/bm-fallback-works.js`）にある作品だけ素材フォルダの画像で表示し（ページ数・表示モードも手書きデータどおりなので崩れない）、無い作品は「ただいま表示を一時停止しています」とだけ出す（`js/bm-embed-viewer.js`。以前は推測した 01〜10.webp が P1.webp系・縦読み作品で崩れるため、すべて出さなかった）
- ⚠️ メンテナンス中も `BM_WP_CONFIG.enabled` は `false` にしない（`bm-wp-api.js` が早期 return して WP のデータを一切読まなくなり、ニュース一覧などが「読み込めませんでした」になる。2026-10-15 の Issue #85 より前は /news が読み込み中のまま止まっていた）
- 自動ビルド3本（`build-columns` / `build-works` / `build-lp-cases`）はこの行を見て何もせず終わる（取り込み・コミットをしない）。`build-columns` の RSS（feed.xml）の生成も止まる。ゲートより後ろの手順はすべて `if: steps.gate.outputs.skip != 'true'` を持つ（`tools/test_build.py` で検査）
- ⚠️ WP を使うページは必ず `bm-wp-config.js` を **WPを読む部品より前**に読み込む（404.html は head の埋め込み処理より前に同期読込）。新しくWPを読むページ・部品を作ったら同じようにする
- ⚠️ 行の書式（`  maintenance: false`）を変えない。ワークフローが `grep` で判定している
- ⚠️ WordPress 画像（`/wp-content/uploads/`）は止めない（静的ファイルのため）
- ⚠️ これはサイト側の表示を守るだけで、WordPress サーバー自体は守らない。サーバー側の対応は非公開の運用手順で行う

### WP 管理画面メニュー（2026-06-12 再編）
- B専用コンテンツ（**お客様の声・赤ペン・ネーム**）はWP左メニューの「**ビズマンガ**」親メニュー配下に移動。共通コンテンツ（漫画事例・ニュース・コラム）は従来通り最上階層
- **ニュース・コラムの掲載先がチェックボックス複数選択に**（BizManga/ContentsX/イチオシ採用、2026-06-12。イチオシ採用は旧称リクルートX、2026-07-09にキー`recruitx`→`ichioshi`改名・旧キーは読み込み時正規化で互換）。旧値 `both`=B+Cの意味で固定なのでBの表示は不変。`?site=bizmanga` の返却結果も移行前後で完全一致を検証済み
- 新サービスのWP取り込み・メニュー追加はルートの jou-wp-service-onboard スキル（`.claude/skills/jou-wp-service-onboard/`）で実施

### WP 編集可能フィールド
- `cx_subtitle_ja`
  - ビズマンガの表示には日本語項目だけを使用する。WordPressと共有APIに残る英語用カスタムフィールドは、本サイトのフロントエンドから参照しない互換項目である。
- `cx_pages` / `cx_client` / `cx_point` / `cx_comment`
  - ⭐ `cx_pages`（手入力の総ページ数）と `cx_gallery`（実際の画像ID一覧、実枚数はカンマ区切りの要素数）は別フィールドでWP側は自動同期しない。**表示側は全経路で2026-08-19にgallery実枚数優先へ統一済み**（BUGS.md #049/#050）。とはいえ表記の正本はWPなので、ギャラリー画像を追加・削除したら `cx_pages` / `cx_spec_pages` も同じタイミングで更新する運用は継続する
    - `/biz-library`ビューア（`js/works.js`）: WP の作品データの登録（`toMangaEntry()`。`/library` と QR直リンクの `/manga/{id}` の両方）と赤ペン/ネーム（`/library` 由来・`/preproduction`〈`registerPreproductionItems()`〉）の登録で gallery優先。ホームの制作過程スライド（`js/bm-pre-production.js`）の `/preproduction` も gallery優先（2026-10 / Issue #84）。`openManga()` は登録済みのページ数を使う（2026-10-15 に補正を `toMangaEntry()` へ一本化。Issue #71）
    - 静的ビルドは `tools/bm_build.py` の `work_page_count()`（数）/ `work_pages_label()`（表示文字列「8P」）に一本化（2026-10-15、Issue #86）: gallery実枚数があればそれ、無ければWP手入力（`spec.pages` → `pages`）。使う箇所: 詳細ページのスペック表記・「この事例について」の「全Nページ」（`build-works.py`）、カテゴリページのモーダル用データ `pages` / `spec.pages`（gallery を5枚に絞る**前**の実枚数。`build_category_works_json`）、LP の CASE STUDY の「/ NP」と並び順（`build-lp-cases.py`）。それまでカテゴリページのデータとLP事例はWP手入力のままだった。ページ数を出す生成物を足すときもこの2関数を通す
    - works一覧・ホームのプレビューモーダル（`js/bm-works-page.js` / `js/bm-hero.js` の `previewPages`）: gallery実枚数を優先し、無ければ`work.pages`にフォールバック
    - 用途別LPのビズ書庫埋込（`js/bm-lp-library-embed.js` の「○P」表示）: gallery実枚数を優先し、無ければ`pages`（2026-10-15 Issue #85 で逆順だったのを統一）
- `cx_sort_order` — 表示順（**数字が小さい＝先に表示**）
- `cx_client_url` — ⭐ ビズ書庫最終ページCTA リンク先URL
- `cx_cta_label_ja` — ⭐ ビズ書庫最終ページCTAラベル（日本語、空欄＝デフォルト「公式サイトを見る →」）
- `cx_cta_enabled` — ⭐ ビズ書庫最終ページCTA表示ON/OFFチェックボックス（**唯一の表示制御**）
- 表示順の運用ルール: N番に新作を挿入するとき、元のN番以降を `+1` ずつずらす（下から順に変更）
- **クイック編集対応**: 漫画事例一覧の「サブタイトル」列＋クイック編集から日本語サブタイトルを直接編集可（contentsx-cms.php `quick_edit_custom_box` + inline-save 専用保存）

### WP 表示先・順序制御（4系統が独立フラグ）⭐

| 系統 | WPメタキー | API応答キー | 値 | データソース |
|---|---|---|---|---|
| **Hero マーキー** | `cx_show_hero_site` | `show_hero_site` | `both`/`bizmanga`/`contentsx`/`none` | `/works`（全件返却、フロントでフィルタ） |
| Hero 順序 | `cx_hero_order_bm` / `cx_hero_order_cx` | `hero_order_bm` / `hero_order_cx` | 整数（小さい順、未設定=9999末尾） | 同上、編集画面のドラッグUIで並べ替え可 |
| **ホームのギャラリー枠** | `cx_show_gallery_bizmanga` | （WP側でフィルタ済データを返却） | bool（**未設定=表示する** / `0`=表示しない） | `/works-new?site=bizmanga`（既にフィルタ済み専用EP） |
| ギャラリー枠 順序 | `cx_sort_order`（全リスト共通の「表示順」入力欄） | `sort_order` | 整数（小さい順、0=末尾） | 同上、WP側で `cx_sort_order` 昇順ソート済み |
| **ContentsX 新作情報** | `cx_show_new_contentsx` | （WP側でフィルタ済データを返却） | bool（**未設定=表示する** / `0`=表示しない） | `/works-new?site=contentsx` |
| **ビズ書庫** | `cx_show_library` | `show_library` | bool（**未設定=表示する**） | `/works` / `/library` |
| **サイト所属** | `cx_show_site` | `show_site` | `both`/`bizmanga`/`contentsx`（**未設定=`both`**） | works.html や `/works?site=` フィルタの基準 |

- 各系統は**完全独立**。「Heroだけ出す」「ギャラリーだけ出す」「ビズ書庫だけ出す」を自由に組合せ可能
- ⭐ **掲載先フラグは全て「未設定＝表示する」**（2026-08-05統一）。明示的に `0`（`cx_show_site` は `contentsx`）が入っているものだけ非表示になる。
  以前はギャラリーと新作情報だけ `=== '1'` の完全一致判定で、**新規登録した作品がフラグを手で立てるまでどこにも出ない**状態だった。
  WP側の判定は `cxcms_show_flag_meta_query()`（`!= '0'` OR `NOT EXISTS`）に集約されている
- ホームのギャラリー枠は **`BM_NEW_WORKS_DATA`（`/works-new` から取得）を優先**（[bm-home.js](js/bm-home.js#L112-L122)）。WP側でフィルタ済みなのでフロントは追加フィルタ不要
- 後方互換: `/works-new` が空 or 未取得時は `BM_WORKS_DATA` でフォールバック
- ギャラリーを WP データで描くのは `bm-all-data-ready`（`/works-new` の取得後）の1回だけ。それまでは `bm-home.js` 内の予備3作品。`bm-data-ready` では描かない（その時点では `/works-new` がまだ無く、ギャラリーに出さない設定の作品まで `BM_WORKS_DATA` で一瞬出ていた。2026-10-15 Issue #85）
- 順序制御: ギャラリー枠は `cx_sort_order` 昇順（同順位は `cx_added_date` 降順）。Heroと違って独立順序フィールドは持たず、編集画面の「表示順」入力欄が共通利用される

## 6. ヘッダー/ナビ仕様

### 6.1 モバイルヘッダー必須ルール ⭐再発防止
スマホでハンバーガーが押せない問題が過去に再発した履歴あり。**ヘッダー変更時は必ず以下を守る**:

1. `.bm-hamburger` に `order: 10` + `flex-shrink: 0` + `min-width/height: 48px` + `z-index: 99999`
2. 言語ボタンは `width: 40px; height: 32px` 程度に縮小
3. `.bm-header-right` は `flex-wrap: nowrap` + `min-width: 0`。gap は 12px（`css/bizmanga.css` の最終値。以前この行は 8px と書いていたが、2026-10 時点の実装と先読みCSS（§6.1c）は 12px。数字を変えるときは両方を揃える）
4. `.bm-header-inner` の padding は 16px 以下
5. `touchend` イベントも `click` と一緒に登録（iOS Safari対策）
6. **320px (iPhone SE) まで想定して計算**

### 6.1a ヘッダーCTA主従ルール（2026-05-13）
- **`.bm-nav-cta`（お問い合わせ）= プライマリ**: 塗り強調（`background: var(--bm-accent)` + 白文字）、padding `12px 26px`、font-size 15px、`min-height: 44px`
- **`.bm-nav-cta--line`（LINE相談）= セカンダリ**: 白背景+緑outline、padding `8px 16px`、font-size 13px、`min-height: 38px`
- モバイル(≤768px): `.bm-nav-cta--line` は `display: none`（追従CTA `.bm-fab` で代替）、`.bm-nav-cta` は常時可視（padding `10px 18px` に縮小）
- 過去の outline-only スタイルは廃止。プライマリCTAはサイト全体で塗り強調に統一
- ⚠️ 2026-10-15 時点の `css/bizmanga.css` はこの節と食い違っている: `.bm-nav-cta` はアウトライン（2.5px）＋ホバーで左から塗るスイープ、768px 以下ではヘッダーから非表示（`.bm-header-right .bm-nav-cta{display:none}`）。画面の表示は bizmanga.css のとおり。この節をどちらに揃えるかは未決定（#87 で先読みCSSを bizmanga.css に合わせた際に判明。§6.1c）

### 6.1b ヘッダーCTA ハイブリッド構成（お問い合わせ pill + LINE/電話 丸アイコン、2026-05-17）
- ヘッダー右上 `.bm-header-right` の構成: **`.bm-nav-cta`（お問い合わせ orange pill）→ `<ul class="bm-cta-icons">` 内に LINE + 電話 の丸アイコン** （[BizManga/css/bizmanga.css](css/bizmanga.css)）
- **お問い合わせ**: 旧 `.bm-nav-cta` 主従ルール（§6.1a）を継続。プライマリCTAとしてテキスト+オレンジpillで強調
- **LINE / 電話（`<ul class="bm-cta-icons">`）**:
  - **PC(≥769px)**: 44×44px 白丸 + box-shadow、ホバーで上に浮上+ブランドカラー塗り、ツールチップ(`.bm-cta-tooltip`)が**下**にポップ（上は画面外で見切れるため、2026-05-17修正）
    - LINE: `#06C755`(緑) / 電話: `#1a1a1a`(ダーク)
  - **モバイル(≤768px)**: `.bm-cta-icons { display:none }` でヘッダーから完全に非表示。お問い合わせボタンも 768px 以下では非表示（`.bm-header-right .bm-nav-cta{display:none}`。§6.1a の注記どおり。ヘッダーに残るのはロゴとハンバーガー）。LINE/電話はハンバーガーメニュー末尾の `.bm-nav-mobile-cta` に集約
- **電話CTA(`tel:03-6261-0764`)**: BizManga専用番号（2026-05-17 設定）、全25ページのヘッダーに展開済み
- **静的生成ページのテンプレート**（`tools/templates/column-detail.html.tpl` / `work-detail.html.tpl` / `works-category.html.tpl`）もルートページと同じヘッダー（お問い合わせ pill + `bm-cta-icons`、ロゴ `width="140" height="40"`、リンクは `/` 始まり）にする（2026-10-15、Issue #86。それまでコラム・制作事例詳細はアイコン無し、カテゴリは廃止済みの `.bm-nav-cta--line` のままだった）。CSP もルートページ（`works.html` 等）と同じ文字列にし、Google 広告（`AW-…`）用の `googleads.g.doubleclick.net` / `www.googleadservices.com` を含める。`tools/test_build.py` の `test_templates_match_root_pages` が検査する
- **モバイル ハンバーガーメニュー末尾 (`.bm-nav-mobile-cta`)**: [BizManga/js/bm-nav.js](js/bm-nav.js) がNAV_ITEMS生成後に **LINE + 電話** のCTAリンクを自動付加（2026-05-17）。LINE(`#06C755`緑)/電話(`var(--bm-accent)`オレンジ)。デスクトップでは `display:none`、`.bm-nav.open` のみ可視

### 6.1c 先読みCSS（インライン Critical CSS）のヘッダー部分（2026-10-15 #87）
- `css/bizmanga.css` は `<link rel="preload" ... onload>` で非同期に読むため、届くまでは `<head>` 内の `/* Critical CSS ... */` ブロックだけでヘッダーが描かれる。このブロックは `index.html` と次の12ページにある: biz-library / column / column-detail / contact / download / faq / news / news-detail / pricing / testimonial-detail / testimonials / works
- 12ページのヘッダー部分（`.bm-header` 〜 `.bm-hamburger`、`.bm-cta-icon*`、1100 / 1024 / 768px の切替）は、bizmanga.css が**最終的に効かせる値**（後ろのルール・詳細度で上書きされた後の値）と同じにしてある。CSS の読み込み前後でロゴ・お問い合わせボタン・丸アイコン・ハンバーガーが跳ねない
- ⚠️ **bizmanga.css のヘッダーの見た目を変えたら、この12ページのインラインCSSも同じ値に直す**（ページ間で同一のブロック）
- 足してよい指定は「bizmanga.css が同じセレクタで上書きするもの」か「読み込み後の計算値と同じもの」だけ。インラインCSSは bizmanga.css より前にあるので、bizmanga.css に無いプロパティは読み込み後も残る（例: `.bm-header{line-height:1.8}` は body の値と同じなので影響なし）。例外: `.bm-header-right{min-width:0}` と `.bm-hamburger{order:10}` は bizmanga.css に無いが、§6.1 のハンバーガーが押せなくなる再発防止（BUGS #003）の要件なので残す
- フッターのロゴ: ロゴの `.bm-logo-img{height:clamp(38px,4.4vw,58px)}` はフッターの `.bm-logo-img` にも当たるため、bizmanga.css と同じ `.bm-footer-brand .bm-logo-img{height:28px;margin-bottom:12px}` も置く（無いと CSS が届く前だけフッターのロゴが最大58pxになり、届くと28pxに縮んで跳ねる。本文を JS で描く短いページでフッターが画面内に入ると見える）
- 色は値で書く（お問い合わせボタン `#EB5200` = bizmanga.css の `--bm-accent`）。ブロック先頭の `:root` はヘッダー以外にも効くため触っていない
- 注意: bizmanga.css の 768px 以下の `.bm-header-inner{gap:10px;padding:0 14px}` と `.bm-header-right{gap:6px}` は、後ろにある基本ルールと 1100px 以下のルールに上書きされて効いていない（最終値は gap 12px・padding 0 12px）。インラインCSSは最終値に合わせている
- 対象外: `js/bm-nav.js` が作るナビ項目と資料DLボタン（`.bm-nav-dl`）。bizmanga.css より先に bm-nav.js が動くと、これらは装飾なしで一瞬見える（index.html も同じ）。`index.html` のブロックは触っていない（お問い合わせボタンの 14px・padding 12px 22px・outline 2px など細部は bizmanga.css と少し違う）
- 確認方法: Playwright で `css/bizmanga.css` と `js/bm-nav.js` を `page.route` で止めた表示と、bizmanga.css を読ませた表示のヘッダーを 375 / 390 / 768 / 1024 / 1100 / 1280px で比べる（位置・大きさ・スクリーンショットが一致すること）

### 6.2 ドロップダウン仕様
- PC: hover で展開
- モバイル: 1回目タップで展開、2回目タップで遷移（親リンクあり）
- ドロップダウン展開中は他のドロップダウンを自動で閉じる
- 現在ページの強調（`.active`）: `js/bm-nav.js` が現在のパスと各項目の href を正規化（先頭・末尾の `/` と `.html` を除去、ルートは `index`）し、**パス全体の完全一致**で判定する。メガメニュー内の項目・第3階層が一致したときは最上位の親（例: `/works/category/recruit` なら「採用マンガ」と「ビズ書庫」）も強調する。一致する項目が無いページ（`/works/{slug}`・`/column/{slug}` 等）は何も強調しない

### 6.3 共通フッター（2026-10-15 #87）
- ルートのページのフッターは `<footer class="bm-footer">`（`css/bizmanga.css` で装飾）。リンク列の「資料ダウンロード」は `js/bm-nav.js` が「お問い合わせ」の直後に差し込む（§5.2）
- リンクの構成は4通りある（2026-10-15 時点・未統一。どれを正とするかは運用判断）:
  1. 「強み」入り（ホーム / 制作事例 / ビズ書庫 / 料金 / 強み / FAQ / お問い合わせ / プライバシーポリシー＋ContentsX Corporate Site）: 用途別LP 8本・strength・artists・manga-types・use-cases・manga-production-company・testimonials・testimonial-detail の15ページ
  2. 「強み」なし: index・works・pricing・faq・contact・news・news-detail・download の8ページ
  3. 「コラム」入り: column・column-detail
  4. privacy-policy は自ページへのリンクなし
- `biz-library.html` だけは旧 `.footer`（`css/works.css` で装飾。QRダイレクトモードでは非表示 §2.1）
- testimonials / testimonial-detail は、works.css 依存の `.footer`（このページでは装飾なし）／リンク無しで崩れていたため、1. のマークアップ（strength.html などと同一）に置き換えた

## 7. ホームページ特殊動作

### 7.1 追従CTA（`.bm-fab`）— 全ページ共通
- `js/bm-nav.js` が `contact.html` / `biz-library.html` / `download.html` 以外の全ページで自動注入（2026-04-24〜。`download.html` は 2026-09-28 追加＝フォームに集中してもらうため）
  - `biz-library.html` は漫画ビューアが全画面で開くとFABが被って読書体験を阻害するため除外（[js/bm-nav.js:268](js/bm-nav.js#L268)）
- **漫画ビューア表示中は全ページで非表示**: `body:has(.manga-modal.open) .bm-fab { display: none }` を [css/bizmanga.css](css/bizmanga.css) に定義。index/works等から漫画モーダルを開いた際も必ずFABが消える
- **2ボタン構成**: LINEで相談（`#06C755`）/ お問い合わせ（`var(--bm-accent)`）
- スクロール中も常時表示
- **デスクトップ**: 左下に固定幅ピルボタン（`--bm-fab-w: 200px; --bm-fab-h: 52px`）を横並び
  - **ホバー演出（旧sticky-cta流用）**: テキストが上にスライドアウト → 下から大きめアイコン（26px）がスライドイン（`cubic-bezier(0.16,1,0.3,1) / 0.5s`）
  - 同時に **ボタン上部にtooltip** が出現（`::before` + `::after` で三角付き、`data-tooltip` 属性参照）
- **モバイル (~768px)**: 画面下部に固定バー（flex:1 で左右2等分、白 + `backdrop-filter`）。スライド演出とtooltipは無効化、テキストのみ表示
- back-to-top ボタンはモバイル時 `bottom: calc(72px + safe-area-inset-bottom)` に退避
- フッターが隠れないよう **モバイルで `body { padding-bottom: 60px + safe-area-inset-bottom }`**

### 7.1.4 3Dスマホ端末 showcase（`#s3dSection`）⭐新規
- 位置: ホームギャラリー（`#newWorks`）の直前
- 役割: 「さまざまな媒体・形式で制作しています」— カラー漫画 / Webtoon / ボイスコミック の3媒体を3つのiPhone型端末で showcase
- タイル構成（左→右）:
  - 横読み: `/embed-viewer?manga=ichinohe-home&slides=1&manual=1`（**画面左タップ＝次 / 右タップ＝前**）
  - 縦読み(中央・hero): `/embed-viewer?manga=omatome-ninja-new&manual=1`（漫画の上に出る「漫画を読む」ボタン`.ev-read-overlay`をタップ→オーバーレイ除去＋iframeにフォーカスして縦スクロールで読了。**上下矢印は廃止**。スクロールが初回ジェスチャー無しでは効かない問題の対策）
  - ボイスコミック: YouTube 埋込 `yLwkUfi6KfQ`（**ファサード方式・ユーザー主導再生**）。**初期はサムネ画像(`https://i.ytimg.com/vi/{id}/maxresdefault.jpg`) ＋ 「動画を見る」ボタン`#s3dVideoPlay`のファサード`#s3dVideoFacade`を表示**し、iframeはページ読込時に挿入しない。ボタン or ポスターどこかをタップした時点で `bm-s3d-screens.js#loadVoiceComic()` が iframe を動的生成（`autoplay=1&loop=1&playlist={id}&controls=0&modestbranding=1&playsinline=1&enablejsapi=1`、**mute=0でユーザージェスチャー由来の音ありautoplay**）して`.s3d-screen--video`に挿入し、ファサードはfade-out→DOM除去する。`.s3d-audio-bar`は**初期から表示**（他タイルのガイドピルと位置を揃えるため）し、iframe未挿入時もミュート/音量のプリファレンスを保持。iframe挿入後に `applyAudioStateToIframe()` で postMessage 反映される
- **操作仕様（2026-05-28 改訂）**: 3媒体とも**ユーザー主導の明示クリック開始**に統一。
  - 横読み=左右タップゾーン`.ev-tap`（端で停止/ループ無し）、縦読み=「漫画を読む」開始ボタン`.ev-read-overlay`タップ後にスクロール（上下矢印は廃止）、ボイス=「動画を見る」ボタン`#s3dVideoPlay`タップで iframe 挿入＋再生開始 → `.s3d-audio-bar`で音量調節（YouTube IFrame API `mute`/`unMute`/`setVolume`をpostMessage）
  - **操作ガイドは端末の直下に表示**（親ページ`index.html`の`.s3d-tile-guide`、白ピル）。iframe内には出さない。3端末ともラッパー`.s3d-col`で囲み、端末の兄弟要素として直下にガイド/音声バーを配置
  - 中央hero iframe は手動操作のため `is-settled` 後に `pointer-events: auto`（旧: 自動スクロール専用で `none` 固定だった）
  - 旧`.s3d-mute-toggle`（SP専用ボタン）は廃止し`.s3d-audio-bar`に統合
- iPhone UI 要素: 角丸44px + Dynamic Island(`.s3d-notch`) + ホームインジケータ(`.s3d-home-indicator`) + オレンジ光沢ベゼル
- ラベル位置: タイル直上(`bottom: 100% + 14px`)
- CTA: タイル直下に「詳しくはギャラリーで!」(`.s3d-cta` → `#newWorks`)
- **デバイス別 動的レイアウト**（2026-05-14 追加 / 同日改訂）:
  - **重なり対策**: stage を `flex-direction: column; justify-content: flex-start; padding-top: 120px` に変更し、heading → labels → screens を必ずフロー積み上げ。以前は heading/labels 双方 `position: absolute` でタイル高が伸びると衝突したが、絶対配置を全廃して物理的に重ならない構造に
  - PC / Tablet (>768px): 横3列。`--s3d-tile-w: clamp(260px, 19vw, 320px)` で原寸 280px 前後に追従。`--s3d-gap: clamp(40px, 8vw, 220px)` でワイドモニタほど gap を広げ 3 端末を edge-to-edge に伸ばす。アスペクト比 280:580 は維持。説明文 (`.s3d-label-desc`) は PC では非表示
  - SP (≤768px): 縦1列中央揃え。`.s3d-screens-wrap` を `display: grid; grid-template-columns: 1fr`、`.s3d-labels` と `.s3d-screens` を `display: contents` で展開、`order` でラベル→端末→ラベル→端末を縦に積む。タイル幅 `clamp(220px, 60vw, 300px)`
  - SP のラベルは title / sub に加え `.s3d-label-desc` で 1-2 文の補足説明を表示 (`<p>` 要素、JA/EN 両対応)
- スクロール演出（GSAP ScrollTrigger + pin）:
  - 初期: 中央1枚 scale 1.55（PC）/ 1（SP=Z字レイアウトでは zoom-in なし）
  - PC: scroll 進行で3分裂 → ラベル fade-in → 見出し表示
  - SP: zoom-in なし、左寄せ端末は左から、右寄せ端末は右からスライドイン
  - **単調増加のみ**: 最大到達 progress を保持、下→上スクロールで逆再生しない
  - `transform-origin: 50% 0%`（上端軸）でスマホ下端だけ伸縮、見出し衝突回避
- 依存: `https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/{gsap,ScrollTrigger}.min.js`
  - GSAP が読めない（CDN ブロック等）ときは**スクロール演出だけ**を省く。ボイスコミックの「動画を見る」ボタン・ポスターのクリック・音声バー（ミュート/音量）は GSAP の有無に関係なく動く（`bm-s3d-screens.js` で GSAP の確認より前に結び付ける。2026-10-15 まで確認の `return` が先にあり、GSAP なしではボタンが何もしなかった。Issue #88）。演出を省くときは演出の最後の状態にすぐ切り替える（`#s3dScreens` に `is-settled`＝漫画 iframe を操作可能に、見出し・ラベル・CTA に `is-shown`＝表示。CSS の初期値は透明・操作不可なので、付けないと消えたまま）
  - 見出し・ラベル・CTA の表示と、横読み/縦読み iframe の操作可能化（`is-settled`）は演出のタイムラインが行うので GSAP が必要
- 実装: [css/bm-s3d-screens.css](BizManga/css/bm-s3d-screens.css) / [js/bm-s3d-screens.js](BizManga/js/bm-s3d-screens.js)
- CSP: `script-src` に `https://cdnjs.cloudflare.com` 必須
- **クリック遷移なし**: 3D showcase は「こういう媒体がある」と見せるだけ。個別作品へは下のギャラリーで

### 7.1.4b ⛔ 「Webtoon」はユーザー可視テキストで使わない（商標）

- **Webtoon は NAVER の登録商標**（日・米・韓・欧・中）。**画面に出る日本語テキストでは使わない**
- 代わりに **「縦スクロール漫画」「縦読み」「縦スクロール形式」** を使う
- **CSS/JSの内部識別子（`data-group="webtoon"`、`bmGalleryGroupWebtoon` 等）は可視テキストではないので据え置きでよい**
- 発生源は **WP側のフィールド値**であることが多い（事例の `cx_point` 等）。静的HTMLだけ直しても**次のビルドで元に戻る**ので、必ずWPの値を直す → ビルド → 生成物をgrepで確認、の順で行う（[BUGS.md](../BUGS.md) #048）
- 例外: コラム本文で「Webtoonという呼称そのものを解説する」文脈（[column/vertical-manga-business.html](column/vertical-manga-business.html) 等）は説明上必要なため対象外
- 関連: コラムのビルドには `normalize_brand_text()` による禁止表現の自動正規化があるが（§下部 S1 参照）、**漫画事例のビルド（`build-works.py`）には正規化が無い**ため、WP側の値がそのまま出る

### 7.1.5 ホームギャラリーのタブフィルタ（`.bm-gallery-tabs`）
- `index.html` の `#newWorks` セクション内、ギャラリー見出し直下
- **3タブ**: 全て / Webtoon（縦読み） / 横読み
- 判定は `window.bmViewType.isForcedVertical(work)` に委譲（BUGS #013 の一元化ヘルパー）
  - Webtoon = `view_type in ['vertical_only','vertical']`
  - 横読み = それ以外
- タブ切替時は `bm-home.js` が `filterData()` → `buildGalleryCards()` で再描画、オートスクロールも再起動
- 該当作品0件時は `#bmGalleryEmpty` の「該当する作品がまだありません。」を表示

### 7.2 ヒーロー
- `.bm-hero` 背景: `#000 url(hp-material-1.webp) center/cover fixed`（ContentsXと共有）
- タグライン「マンガの力でビジネスを動かす」— 1文字ずつ波シャイン
- 漫画表紙カルーセル5行 + マウスパララックス（PC）

### 7.2b クライアントロゴ無限カルーセル（`.bm-client-logos`）⭐2026-05-13追加
- 位置: `.bm-hero` の直後、`.bm-about` の直前（2026-05-14に news の後ろから hero 直下へ移動）
- 役割: 取引/支援企業ロゴを横スクロールで自動再生し、信用補強。ContentsXトップと同じ構成・同じ社数（現在12社、`js/data/bm-client-logos.js` の `BM_CLIENT_LOGOS` 件数が正）
- データ: [js/data/bm-client-logos.js](js/data/bm-client-logos.js) の `BM_CLIENT_LOGOS` を編集すれば追加可
- 画像参照: ContentX側の `https://contentsx.jp/material/images/{clients,partners}/...` を絶対URLで参照（[[reference_bugs_md]] #020 同様、ContentX/material/ の画像を消すときは両サイトgrep必須）
- レンダリング: [js/client-logos.js](js/client-logos.js) が `BM_CLIENT_LOGOS` を6セット複製→`translateX(-16.6667%)` ループ
- CSS: [css/bizmanga.css](css/bizmanga.css) の `.bm-client-logos` セクション
- キャンペーン見出し（`.bm-campaign-link`）⭐2026-10-10 更新（#63）: 月桂冠SVG付きで「**○月限定 シナリオ制作無料キャンペーン**」を表示し `/contact` へリンク（9月末に「9月限定」→「Chatwork広告限定…実施中」(#52)、10月に再び月限定へ戻した）
  - **月は自動で切り替わる**: [js/bm-campaign-month.js](js/bm-campaign-month.js) が**日本時間（Asia/Tokyo）の当月**で `[data-bm-campaign-month]` の文字と、リンクの `aria-label` 先頭の「○月限定」を書き換える（閲覧者の端末の時刻帯には依存しない）。HTML には公開時点の月（現在「10月限定」）を書いておき、JS が動かない環境ではその表示が残る
  - ⚠️ 自動なので、**誰かが外すまで毎月キャンペーン表示が続く**。終了時は index.html の `.bm-campaign-link` ごと外し、`bm-campaign-month.js` の読込も消す。文言を変えるときは index.html の `<span>` と `aria-label` の2箇所（`aria-label` は「○月限定」で始める＝JSが先頭だけ置換する）
  - 改行: PC（769px〜）は1行（「○月限定」と「シナリオ…」の間に半角スペース）。SP（≤768px）は `.bm-campaign-br` で「○月限定／シナリオ制作無料／キャンペーン」の3行。「シナリオ制作無料キャンペーン」を1行にすると320〜375pxで月桂冠と合わせて入り切らないため。320〜360px×Android文字拡大1.4〜1.6倍では「シナリオ制作無料」が自然に折り返して4行になる（溢れ・月桂冠との重なりなし。Chromium/WebKit×320〜1440px×1.0/1.4/1.6倍で実測）
  - Chatworkロゴ画像 `material/images/campaign/chatwork-logo.webp`（背景透過・実寸350×70）は表示から外したがファイルは残置（Chatwork広告版に戻す場合に再利用）。`<title>`/OGの【シナリオ制作無料】は別管理

### 7.2c 対談・動画セクション（`.bm-videos` / `#videos`）⭐2026-08-29追加
- 位置: ニュース（`#news`）の直後、コラム（`#columns`）の直前
- 役割: YouTube公式チャンネルの対談動画をホームで訴求。初回はマクニカ元村氏との対談「BtoB営業で"漫画"が商談を生む理由」（`w_O3iaQKduQ`）1本
- **遅延埋め込み（LCP対策）**: 初期表示はサムネ（`https://i.ytimg.com/vi/{id}/maxresdefault.jpg`）＋再生ボタンの `<button.bm-video-thumb data-video-id>` のみ。クリック時に [js/bm-videos.js](js/bm-videos.js) が `youtube-nocookie.com/embed` の iframe（`.bm-video-frame`）に差し替える。bizanime.js と同じ方針
- レイアウト: PC=動画左（flex:1.25）+テキスト右の2カラム、860px以下で縦積み。文字サイズはclamp()連続スケール、flex子に `min-width:0`
- CSP: 既存の `frame-src https:` / `img-src https:` の範囲内のため変更不要
- CSS: [css/bizmanga.css](css/bizmanga.css) の「対談・動画セクション」ブロック（news直後）
- **GEO（AI検索最適化）が本セクションの主目的**（YouTube言及はAI引用と最強相関≒0.737、Ahrefs 2025-12調査。分析正本は [../docs/content/GEO-ANALYSIS.md](../docs/content/GEO-ANALYSIS.md)）:
  - **VideoObject JSON-LD**: index.html 末尾のJSON-LD群に `#interview-video` を追加（WebPage の `video` からも参照）。uploadDate/duration/contentUrl/embedUrl に加え、**チャプター13本を `hasPart` の Clip**（startOffset/endOffset/`&t=`URL）で記述し、対談の中身を機械可読化。AIクローラーはJS非実行のため、遅延iframe でも動画の存在はこのスキーマと静的HTMLで伝わる
  - **話題リスト `.bm-video-topics`**: 目に見える引用可能パッセージとして主要トピック4点を `<ul>` で列挙（日本語の表示内容対応）
  - **llms.txt**: 「対談・インタビュー動画（YouTube）」セクションに動画URL+要約を記載（v1.5）
  - **動画追加時は3点セット**: HTMLブロック複製 + VideoObject JSON-LD追加 + llms.txt追記

### 7.3 About セクション（`.bm-about`）レイアウト
- **PC（769px以上）**: 2カラムグリッド（`grid-template-columns: 1fr 1.1fr`、gap 72px）。左に heading「文章では届かない。マンガなら、届く。〜」、右に text 本文。`text-align: left`、heading下のアクセント線も左寄せ
- **SP（768px以下）**: 従来の縦積み中央寄せに戻す（`display: block; text-align: center`、アクセント線は `margin: auto`）
- 出典: 株式会社ファインズ e-tenki.co.jp のDX訴求セクション（2026-04-21 採用）
- CSS: [css/bizmanga.css:717-780](css/bizmanga.css)

## 8. 制作事例モーダル（works.html）

- **ページング**: 20件/ページ
- **モーダル操作**: クリック / スワイプ（スマホ）/ 矢印キー（PC）
- **縦読み判定**: `window.bmViewType` に一本化（WPの `view_type` が `vertical`/`vertical_only`、または1ページ目が `height/width > 1.8`）。**各JSで自前判定しないこと**（[BUGS.md](../BUGS.md) #012 / #013）
- **日本語固定表示**: モーダル内カテゴリ / メディア / UIテキストも日本語固定表示
- **DOMは index.html と works.html に同一のものが2つ存在**する。動かすJSはページごとに別（index=[js/bm-hero.js](js/bm-hero.js) / works=[js/bm-works-page.js](js/bm-works-page.js)）。**モーダルの挙動を変えるときは必ず両方に反映する**

### 8.1 スマホ縦読みの上下2ペイン分割 ⭐ 2026-08-06 追加

縦読み作品はスマホで漫画が非常に長く、一体スクロールだと「使用媒体 / 導入内容 / 演出ポイント」まで到達できず実質読まれなかったため、上下2ペインに分割する。

- **適用条件**: 画面幅768px以下 **かつ** 縦読み（`.work-detail-carousel.vertical-scroll`）のときだけ。横読みとPC（769px以上の左右2カラム）は従来どおりで一切変更しない
- **構造**: 上ペイン=漫画 / 下ペイン=詳細。各ペインが独立した `overflow-y: auto` を持ち、`overscroll-behavior: contain` で相手側にスクロールを伝播させない（下ペインを操作しても漫画は動かない）
- **比率の自動追従（読んでいる側に広さを譲る）**: CSS変数 `--wd-split` が上ペインの高さ比率
  | 状態 | `--wd-split` | 上:下 |
  |------|-------------|-------|
  | 開いた直後 / 漫画に触れた | 0.75 | 3:1 |
  | 詳細に触れた | 0.5 | 1:1 |
  | 詳細を読み進めた | 0.25 | 1:3 |
- **手動リサイズ**: ペイン境界の `.wd-split-handle` をドラッグ。上下とも最低1/4は残す
- **実装**: [js/bm-wd-split.js](js/bm-wd-split.js)（`window.bmWdSplit.apply()` / `.reset()`）。**縦読み判定の直後に `apply()`、モーダルを閉じる時とカルーセルモード時に `reset()`** を呼ぶ。CSSは [css/bizmanga.css](css/bizmanga.css) の `@media (max-width: 768px)` 内 `.wd-split` 配下
- **読込順（必須）**: `bm-view-type.js` → `bm-wd-split.js` → 各ページJS（`bm-hero.js` / `bm-works-page.js`）
- ⚠️ **比率変更はペイン高さを変え、それが `scrollTop` を押し戻して `scroll` イベントを再発火させる**。これを「ユーザーが読んでいる」と誤認すると比率が固まるフィードバックループになるため、変更後 420ms は `scroll` を意図とみなさない（`SETTLE_MS`）。`pointerdown`/`touchstart` は明示操作なのでガードしない

## 9. 漫画ビューア（works.js）

- **モード**: `spread`（見開き）/ `vertical`（縦スクロール）/ `vertical_only`（強制縦）
- **PCデフォルト**: spread
- **SPデフォルト**: vertical
- **ページ送り**: `waitForImage()` で画像読込完了を待ってからクリック解放
- **先読み（2026-10 / Issue #84）**: 開いた直後（`openManga()`）とカードのホバーで最大4ページを先読みする。**作品のページ数を超えて読まない**（`Math.min(4, data.pages)`。ページ数は登録時にギャラリー枚数へ直してある）。以前は開いた直後に必ず2ページ目を読み、1ページの作品で存在しない `02.webp` が 404 になっていた
- **書庫グリッドのページ送り**（18件/ページ、`updateGridPagination()`）: 端の「‹ Previous」「Next ›」は `disabled` 属性で止める（見た目は従来の `.disabled` クラス）。class だけだとマウスは止まってもキーボードの Enter で押せ、ページが 0 や総ページ数+1 になってグリッドが空になっていた（2026-10 / Issue #84）。押されたときもページ番号は 1〜総ページ数に収める
- **フッター（biz-library）**: 背景 `#222` に文字 `#aaa`（リンク）/ `#999`（会社情報）/ `#8f8f8f`（コピーライト）、いずれも 4.5:1 以上。2026-05-14 の灰色→`#000` 一括置換で黒地に黒文字になっていたのを 2026-10 に戻した（Issue #84）。⚠️ 灰色の一括置換をするときは背景が暗い箇所を除外する

### 9.1 最終ページCTA（クライアント送客） ⭐ 2026-04-22 追加
- **データソース**: WP CMS 漫画事例カスタムフィールド `cx_client_url` / `cx_cta_label_ja` / `cx_cta_enabled`
- **API公開キー**: `client_url`, `cta_label_ja`, `cta_enabled`（`/library`, `/manga/{id}` 共通）。共有APIに残る英語用キーはビズマンガでは参照しない。
- **表示条件**: 以下を全部満たした時のみ表示
  1. `cta_enabled === true`（**WP管理画面のチェックボックスがON、これが唯一の表示トグル**）
  2. `client_url` が `http(s)://` で始まる有効URL（リンク不能を防ぐ最低限のチェック）
  3. 漫画ビューアで最終ページに到達（spread: 最終見開き / vertical: 末尾90%以上スクロール）
  4. 制作過程ページ（`_isPreProduction`）でない
- **ラベル**: 日本語ラベルが空欄なら「公式サイトを見る →」を表示する。
- **アニメーション**: 最終ページ到達0.6秒後にフェードイン+下→上スライド
- **ホバーエフェクト**: ラベルテキストが上にスライドアウト → 「Let's go !!」（共通固定）が下からスライドイン（ホーム`bm-sticky-cta-btn`と同パターン）
- **カラー**: 背景 `var(--bm-accent)` (#EB5200) → ホバー `var(--bm-accent-hover)` (#C44400)、グロー演出付き
- **配置**: モーダル内 fixed、画面下部センター（PC見開き=bottom 96px、縦スクロール=bottom 28px、SP=bottom 20px）
- **リンク属性**: `target="_blank" rel="noopener"` のみ（nofollow/sponsoredは付けない＝編集リンクとしてSEOが両サイトに自然に流れる）
- **GA4イベント**: クリック時に `manga_cta_click` を送信、params: `{ manga_slug, client_url, language }`
- **モーダルを閉じる/別作品を開く時**: `hideMangaCta()` で確実にリセット
- **要素**: [biz-library.html#mangaCtaOverlay](biz-library.html) / JSロジック [js/works.js](js/works.js) / CSS [css/works.css](css/works.css) `.bm-manga-cta`
- **フラグ**: `isSpreadAnimating` でクリック入力をゲート

## 10. Service Worker

- [sw.js](sw.js) — Stale-While-Revalidate 戦略
- キャッシュ名: `bm-covers-v1`
- **キャッシュ対象**: `/material/manga/` / `/material/images/` / `/wp-content/uploads/`
- 初回: ネットワーク → キャッシュ保存、2回目以降: キャッシュから即返却

## 11. パフォーマンス最適化

- **Preload**: hero表紙6枚 (index), 3枚 (biz-library) を `<link rel="preload" as="image">`
- **works個別ページ**: ヒーロー画像を `<link rel="preload" as="image" fetchpriority="high">` + `<img fetchpriority="high" decoding="async">`。LCP候補を明示してクリティカルリクエストを先読み（2026-04-20導入）
- **works ヒーロー画像の解像度整合**（2026-04-21修正）: build-works.py で `gallery[0]`（フル解像度）を hero に使う。WPの `thumbnail` フィールドは 188x300 の自動生成サムネで、1200x630 として引き延ばすと画質劣化 + LCP要素として機能しないため避ける
- **works ヒーロー画像の width/height**（2026-10-15、Issue #86）: 以前は縦長の漫画ページに `width="1200" height="630"`（横長）を宣言していた。WP の gallery は URL だけで寸法が無いため、`build-works.py` の `hero_image_size()` が WP の縮小版 `thumbnail`（`…-212x300.webp`）が `gallery[0]` と同じ画像なら、その寸法（＝実画像の縦横比）を出す（2026-10 時点で31作品中26作品）。分からなければ一覧カードと同じ漫画1ページの標準比 `400x560`。**属性を外すと表示領域が確保されず、読み込み時に本文が大きくずれる**（1280x800 で CLS 0.006 → 0.53 を計測）ので外さない
- **ギャラリー画像**: `loading="lazy" decoding="async"` で非同期デコード（works 17ページ・2026-04-20導入）
- **dns-prefetch**: `cms.contentsx.jp`
- **preconnect**: フォント / WP API
- **Lazy load**: カルーセル複製分は `loading="lazy"`
- **CSS重複排除**: `/works/*.html` 17ページのインラインCSS（`.bm-work-detail-*` ブロック）を `bizmanga.css` へ集約（2026-04-20）。テンプレート `tools/templates/work-detail.html.tpl` も同期済み

## 12. セキュリティ対策

- [js/bm-sanitize.js](js/bm-sanitize.js) `window.bmSanitize`:
  - `html(s)` — HTMLエスケープ（テキスト・属性値用）
  - `url(s)` — URL検証。スキーム有無で分岐し、制御文字/空白/プロトコル相対(`//host`)を拒否、`http(s)` かつ `contentsx.jp` 系ドメインのみ通過。`javascript:`/`data:`/`vbscript:` は除去
  - `linkUrl(s)` — 外部サイトも許すリンク先（ニュースの「リンクURL」`cx_news_url`）。本文と同じスキーム規則（§16.2）で http/https/相対だけを通し、制御文字入り・それ以外のスキームは空文字。空なら呼び出し側はリンクにしない（2026-10-15 Issue #85。`url()` に通すと外部URLが `href=""` になり、クリックで再読み込みされていた）
  - `rich(s)` / `richHTML(s)`（同一・エイリアス） — WPリッチ本文用。script/iframe/style/form等の危険タグと on*属性・`javascript:`/`data:text/html` URIを除去
- **WP API由来の文字列を `innerHTML` に入れるときは必ず `html()`（テキスト/属性）か `rich()`（本文HTML）を通す**。素の `+ item.xxx +` 連結は禁止（2026-06-10 BUGS #039）
  - URLは `url()`、CSSの object-position 等は許可文字チェック（`/^[a-zA-Z0-9% .-]+$/`）、`href`に入れるIDは `encodeURIComponent`
- カード描画系（bm-wp-api.js / works.js 等）は `DocumentFragment` でバッチ追加し、scrollリスナーは `{passive:true}`
- **外部CDN（GSAP, index.html）は SRI で完全性検証**: `integrity`(sha384)＋`crossorigin="anonymous"`＋`referrerpolicy="no-referrer"`。cdnjs侵害時の任意JS実行を防止。**バージョン更新時はSRI再計算必須**（ハッシュ取得・残存リスク全体は [docs/operations/SECURITY.md](../docs/operations/SECURITY.md)）
- 🔐 **セキュリティの脅威モデル・残存リスク・運用チェックリストの正は [docs/operations/SECURITY.md](../docs/operations/SECURITY.md)**

## 13. 既知の注意点

| 事項 | 詳細 |
|---|---|
| hreflang | 全ページから出力しない（日本語固定の単一URL構成。sitemap.xml からも除外） |
| image alt | ホーム hero のキャラ画像に alt が無い → アクセシビリティ改善余地 |
| image width/height | 未指定 → CLS悪化要因 |
| description | 現状63文字で短い。推奨 120-160字 |
| Organization.sameAs | **2026-04-14 `https://x.com/Bizmanga_` 追加済**。`parentOrganization.foundingDate: 2026-03-03` も追加 |
| OG画像 | 全ページ共通で `bizmanga-logo.webp` を流用中。1200×630px の専用OGP画像が未作成（TODO） |
| **SPA詳細シェル (news-detail/testimonial-detail/column-detail)** | **2026-04-20 `<meta name="robots" content="noindex, follow">` 付与済**。単一URLに全記事を集約するSPA構造のため、インデックス重複を排除。sitemap.xml からも `news-detail` / `testimonial-detail?id=451` の単数URLを削除 |
| works OG画像個別化 | **2026-04-20 対応済**。`tools/templates/work-detail.html.tpl` に `{{og_image}}` プレースホルダを導入し、`tools/build-works.py` が WP API の `thumbnail` を og:image に展開。17作品すべて個別画像化 |

### 2026-08-19 料金プラン全面刷新（3プラン→2プラン）

- 旧プラン体系（ライト¥166,000〜/スタンダード¥181,000〜/プレミアム¥246,000〜、2026-07-02版）を廃止し、新2プラン体系に全面差し替え
  - **フル漫画家プラン**: 1ページ33,660円〜（原稿料別途33,660円、10P目安 約37.0万円）。プロ漫画家が全工程を手がける最上位プラン
  - **ハイブリッドプラン**: 1ページ25,740円〜（原稿料別途25,740円、10P目安 約28.3万円）。独自の制作メソッドでコストを抑えたプラン
  - 本数割引（7P基準・1ページ単価）: フル漫画家=1本33,660/3本30,320/5本以上28,260円、ハイブリッド=1本25,740/3本23,200/5本以上21,600円
  - 原稿料は総額込み表示（旧: 0円込み）から**別途表示**に変更
- `/contact?plan={light|standard|premium}` → `/contact?plan={full|hybrid}` にURLパラメータのキーを変更（[contact.html](contact.html)の`planNames`マップ、§2.2参照）
- pricing.html の Service+Offer JSON-LD を新2プランに更新（lowPrice 25740 / highPrice 33660 / offerCount 2）
- 「業界最安値級」という断定的な価格訴求表現を**削除**（値上げにより根拠確認済みの主張が困難になったため）。「大手の約1/5の価格」は業界相場比較として引き続き使用（index.html / pricing.html のバッジ・meta・JSON-LD）
- index.html・pricing.html・manga-production-company.html・strength.html・用途別LP群・works/category/recruit.html の料金言及箇所とJSON-LDを同期
- **⭐総額表記は「原稿料込み」に統一**: 「10P目安」等の総額は `ページ単価×ページ数＋原稿料` で算出する（例: ハイブリッド10P = 25,740×10＋25,740 = 約28.3万円）。
  pricing.html のカードのみ原稿料込みで、用途別LP8本・works/category/recruit.html の計22箇所が原稿料抜き（約25.7万円）になっており、**表示より実請求が高くなる不整合**が発生していたため統一（レビューで検出）。
  - ir-manga = 5〜10P 約15.4万〜28.3万円 / inbound-manga = 3言語込み10P 約36.7万円 / sales-manga = 3〜5P 約10.3万円・10P 約28.3万円
  - **pricing.html の本数割引表（7P基準・6セル）だけは原稿料「別」**。単価比較を主目的とする表のため金額は据え置き、各セルに「（原稿料別）」と明記して基準の混在を防ぐ
  - `tools/build-works.py` の `CATEGORY_PAGES["recruit"].faq` にも旧価格（1ページ16,600円・10P約17.4万円）が残っていたため修正。**生成物である works/category/*.html だけ直しても日次ビルドで戻る**ので、生成元の更新が必須
- **未対応（別Issue）**: 下記に残る旧料金表記（1ページ16,600円・1本19,800円等）は今回のスコープ外
  - `column/配下26ファイル` と `column.html`（カード抜粋）— いずれもWP本文がマスターの自動生成物。`tools/build-columns.py` の `normalize_policy()` に「14,700→16,600」の置換があり、ここを更新すれば一括補正できるが、「5本セットで」等の文脈依存記述が壊れるため要精査
  - `README.md` / `faq.html`（旧英語辞書の死んだエントリは翻訳資産削除に伴い対象外）

### 2026-04-24 全ページ メタタグにパワーワード注入（第2弾）

SERP CTR最大化のため、SEO×マーケ観点でパワーワードを各ページに戦略配分。

**パワーワード配分戦略**:
| ページ | 注入ワード | 狙い |
|---|---|---|
| index | 【業界最安値級】+ 大手の約1/5 | 価格訴求 × CTR最大化 |
| pricing | 【業界最安値級】+ 大手の約1/5 | 購買直前の背中押し |
| strength | 業界最安値級を実現する5つの理由 | 差別化根拠の権威化 |
| works | 実績多数 + 業界屈指 | 社会的証明 |
| biz-library | 【全作品無料公開】+ 業界屈指 | 参入障壁の除去 |
| contact | 【初回30分無料】 | 心理的負担ゼロ化 |
| column | プロ直伝の攻略法 | 情報価値の権威化 |
| testimonials | 採用応募増・研修効果UPの実証事例 | 社会的証明の強化 |
| manga-types | 完全ガイド + 7ジャンル徹底解説 | 網羅性アピール |
| use-cases | 10シーン実例付き徹底解説 | 具体性で刺す |
| faq | 発注前の不安を全解消 | 不安解消 |
| news | 最新トレンド・常時発信 | フレッシュネス |

**景品表示法対策**:
- 「業界最安値級」「大手の約1/5」は **業界相場（1P 40,000〜100,000円）との比較** を実根拠として成立（比較表の正本は `/manga-production-company` と `/strength`。pricing からは `.bm-related-guide` aside で誘導。2026-07-02のpricing刷新で他社比較の長文はpricingから撤去）
- 「級」表現により相対表現化（断定回避）→ 優良誤認リスク低減
- 「最安値」（断定）は使用禁止

**変更箇所**: 12ページの `<title>` / `meta description` / `og:title/description` / `twitter:title/description` / WebPage schema の `name` / `description`（1ページあたり8箇所 × 12ページ = 96箇所）

**期待効果（Google再クロール後）**:
- SERP CTR 1.5〜2倍見込み（【】付き + 強訴求ワード）
- On-Page SEO +2点 / Search Visibility 時間差で +5点可能性
- ブランドメッセージ一貫性UP（すべて「業界最安値級」のビズマンガ）

### 2026-04-24 全ページ メタタグ最適化（SEO×マーケ視点）

Google検索結果のタイトル/サイト名/ディスクリプションがmetaと食い違う現象（`ビズマンガ | BizManga — ビジネス漫画制作サービス` / サイト名 `contentsx.jp` / body文を勝手に抽出したdescription）を解消するため、12ページ全ての meta + schema を一括再設計。

**設計原則**:
- **タイトル 26-33文字**（日本語SERP幅最適化）
- **ディスクリプション 84-101文字**（SP/PC両方で切れないサイズ）
- **各ページ独自のプライマリKW**を左詰め（カニバリゼーション防止）
- 末尾「｜ビズマンガ」統一でブランド浸透
- **具体価格（19,800円・1/5の価格）をmetaから全削除**（Google景品表示法リスク回避 + 柔軟性確保）
- **「ビズマンガ」カタカナ統一**（英字「BizManga」「ビズマンガ（BizManga）」は meta/schema から全除去）
- 実績数字（125項目・2週間・5つの理由・10選・7ジャンル）は信頼性シグナルとして残す

**ページ別プライマリKW**:
| ページ | 主KW | ファネル |
|---|---|---|
| index | ビジネス漫画制作 | Top |
| works | ビジネス漫画 制作事例 | Mid |
| biz-library | ビジネス漫画 サンプル | Mid-Low |
| pricing | ビジネス漫画 料金 | Low |
| faq | ビジネス漫画 よくある質問 | Low |
| contact | 無料相談 | Bottom |
| column | ビジネス漫画 活用 | Top |
| testimonials | ビジネス漫画 導入事例 | Mid |
| manga-types | ビジネス漫画 種類 | Top |
| use-cases | ビジネス漫画 活用場面 | Top-Mid |
| strength | 選ばれる理由 | Mid |
| news | 最新情報 | — |

**対応内容**:
1. 全12ページの `<title>` / `<meta description>` / `<meta og:title/og:description>` / `<meta twitter:title/twitter:description>` を再設計
2. [index.html](index.html) に **WebSite schema** 追加（`name: "ビズマンガ"`）→ Google検索結果のサイト名を `contentsx.jp` → `ビズマンガ` に変更する見込み
3. 全HTMLの `Organization.name: "ビズマンガ（BizManga）"` → `"ビズマンガ"` に統一
4. WebPage schema の name/description を新meta値に同期（pricing / testimonials / biz-library / contact / faq / news / strength / works）
5. faq.html 本文内の「BizManga」日本語表記をカタカナに統一

**反映待ち**: Google再クロール後、検索結果の表示が新titleに書き換わるまで1〜2週間。WebSite schema認識まで1〜4週間（Google側タイミング依存）。

### 2026-04-20 日本語禁則処理をサイト全体に適用

日本語は単語境界が無いため、長い見出し（例: 「マーケティング研究所」）がコンテナに収まらないと末尾1文字だけ次行に落ちる「孤立文字」問題が発生する。両サイトの CSS に禁則処理ルールを一括追加。

- [css/bizmanga.css](css/bizmanga.css) 末尾に追記（`h1-h4`, `.bm-*-title`, `.bm-*-heading` 等）
- [ContentX/css/style.css](../ContentX/css/style.css) 末尾に追記（`h1-h4`, `.hero-title`, `.section-title`, `.news-heading` 等）
- 適用ルール:
  - `text-wrap: pretty` — Chrome 117+/Safari 17.4+/Firefox 121+ が末尾孤立文字を自動回避
  - `line-break: strict` — Japanese 伝統的禁則（句読点などの行頭禁止）
  - `word-break: auto-phrase` — Chrome 119+ のフレーズ認識改行（対応ブラウザのみ progressive enhancement）

### 2026-04-20 コラム一覧ページ Hero テキストオーバーレイ化

ui-ux-pro-max + frontend-design の editorial パターンに基づき、H1・eyebrow・divider を hero 画像上にオーバーレイ表示に変更。

- hero-strip 高さ 360px → 420px に拡張（テキスト領域確保）
- `.bm-column-hero-overlay` を左下に絶対配置、bottom=56px / left=5vw
- 画像中央の女の子イラストを避けるため、`::before` で **105deg の方向性 scrim**（左下スポットライト型: 暖黒 `rgba(17,10,5,...)` で画像の暖色と馴染ませる）
- **text-shadow は不採用**（scrim方式が editorial 標準、AI slop 回避）
- モバイル: scrim を `to top` の縦方向に切替、hero h=340px、テキスト bottom=28px
- Masthead から H1/eyebrow/divider を撤去し、リード段落のみ残す（縦スペース節約）
- fetchpriority も `low` → `high` に変更（LCP要素としての役割明確化）

### 2026-04-20 コラム一覧ページ Editorial Magazine 化

ui-ux-pro-max の「Swiss Modernism 2.0」+「Newsletter/Content First」パターンに基づきコラム一覧 ([column.html](column.html)) を BtoBマーケティング専門誌の Web 版 風に刷新。

**構造変更**
1. Hero を h=1019px の全面イラスト → h=360px のシネマスコープ帯（`.bm-column-hero-strip`）に圧縮。LCPを H1 テキストへシフト。新画像 `hero-column.webp` (2400×1018) に差替（旧版は `hero-column.old.webp` にバックアップ）
2. Editorial Masthead セクション追加: `EYEBROW · ISSUE N` → Noto Serif JP 900 の H1 超大サイズ（clamp 40-88px）→ 赤アクセント線 → リード段落
3. カテゴリフィルター帯 (`.bm-column-filter` sticky、チップUI) 追加。追従位置はヘッダー下端 `top: var(--bm-header-height, 72px)`（全幅共通。2026-10-14 に修正・§0.6）。追従する範囲はフィルター帯・特集記事・一覧を包む `.bm-column-listing` の中だけ（CTA・フッターの上には残らない）。一覧の途中・下でチップを押すと、絞り込んだ結果の先頭を帯のすぐ下へ戻す（`scrollToListTop()` → 共通の `window.bmScrollBelowSticky`。§0.6）。WP API の `data.category` から動的生成
4. Featured 記事セクション追加（最新1件を 21:9 大判＋右本文のグリッドで表示）。JS で `<script id="bm-column-data">` の JSON から注入。**スマホ（`@media max-width:768px`）では `.bm-column-featured` を `display:none !important` で非表示**（2026-06-04）。JS([bm-column-filter.js](js/bm-column-filter.js))のカテゴリ絞り込みは `style.display=""/"none"` を切替えるため、CSS側に `!important` を付けて優先させPCのみ表示
5. カードを `data-category` 属性 + 読了時間メタ表示対応に拡張

**カテゴリ運用**
- WP側の `column_category` taxonomy は既に実装済み ([contentsx-cms.php:2479](../ContentX/wordpress/contentsx-cms/contentsx-cms.php#L2479))
- cms.contentsx.jp の管理画面で各記事にカテゴリを設定すると次回ビルドで反映
- カテゴリ色分け（CSS）: LP最適化=#e85500 / BtoB戦略=#1f1f1f / プロット・制作=#8b5cf6 / SNS・採用=#10b981 / 効果・科学=#0ea5e9 / ジャンル=#f59e0b
- 未設定記事は「その他」バケット扱い

**新規ファイル**
- [js/bm-column-filter.js](js/bm-column-filter.js): フィルタチップ生成 + Featured注入 + カードフィルタリング

**改修ファイル**
- [tools/build-columns.py](tools/build-columns.py): `estimate_readtime()` 追加、build_card に `data-category` + readtime 注入、update_column_html で Featured+カテゴリ一覧を JSON埋め込み、main実行順を detail→column.html→sitemap に変更
- [column.html](column.html): Editorial Hero / Masthead / Filter / Featured セクションを body冒頭に追加
- [css/bizmanga.css](css/bizmanga.css): 新クラス群（hero-strip / masthead / filter / featured / card meta）と Noto Serif JP 読み込み追加

### 2026-04-20 Performance緊急対応 + E-E-A-T改善（第4弾）

**課題**: seo-audit スキル(6エージェント並列)による再計測で総合66/100と判明。特に **Performance 35/100** が致命的で、LCP 19.8s / TBT 19.28s を記録。原因は HubSpot トラッキングスクリプト `js-na2.hs-scripts.com/48367061.js` がメインスレッドを約18秒占有していたこと（全25ページ共通）。また Content 58/100、Schema 72/100 で著者シグナル・dateModified一律問題が指摘された。

**修正**

1. **[js/bm-hubspot.js](js/bm-hubspot.js) 新設** — HubSpotトラッキングの遅延ローダー。初回ユーザーインタラクション (mousemove/scroll/touchstart/keydown/click) or 4秒後に動的 `<script>` 挿入。フォーム送信は `fetch` で `api.hsforms.com` を直叩きしているため遅延ロードの影響なし

2. **全25ページの `<script id="hs-script-loader">` を置換**: `<script src="/js/bm-hubspot.js" defer></script>` に統一。[tools/templates/column-detail.html.tpl](tools/templates/column-detail.html.tpl) も同時更新して再ビルド時の回帰を防止。LCP/TBT 大幅改善の見込み（19.8s → 3s 前後）

3. **[index.html](index.html) お客様の声セクション復元**: 2026-04-16 にコメントアウトされていた `bm-testimonials` セクションを復活。Experience/Trust シグナル +8pt 見込み

4. **[tools/build-columns.py](tools/build-columns.py) の dateModified ロジック強化**: WP 側 `post_modified` が全記事一律「今日」になっているケースを検出して、date_ymd にフォールバック。これで全15記事の dateModified が各 datePublished と一致する正常状態に戻る。QRG「コンテンツ鮮度偽装」ペナルティ回避

5. **コラム手動修正3ファイル再ビルドでの上書き防止**: `business-manga-production-guide.html` / `business-manga-production-guide-2.html` / `btob-manga-lp-lead-generation.html` は第3弾で title/description/FAQ Schema を手修正済み。再ビルドで上書きされたため `git restore` で復旧し、HubSpot置換のみ再適用。WP 側 excerpt_ja が正しく入るまでは、この3ファイルを build-columns.py で再生成してはいけない

**次の必須対応**
- WP admin で上記3記事の excerpt_ja / 本文を正しく更新（現状は他記事のコピーが混在）
- WP 側 post_modified を実際の更新日で記録する運用フロー確立

### 2026-04-20 ターゲットKW #1狙い + 日次ランク追跡（第3弾）

**課題**: GSC 実測で `ビジネスマンガ 制作` = 14位（`column/business-manga-production-guide-2`）。ただし同ページは **title・H1・本文が「漫画著作権」なのに description だけ「ビジネスマンガ制作ガイド」** という混線状態。姉妹ページ `-guide`（2なし）も **description が「X Twitter」のまま** でコンテンツと不整合。

**修正 (B-1〜B-4)**

1. **[column/business-manga-production-guide.html](column/business-manga-production-guide.html)** を「ビジネスマンガ 制作」#1狙いのフラッグシップに整合化:
   - title: `ビジネスマンガ制作の完全ガイド｜7ステップと費用相場【1P11,300円〜】`
   - description / og / twitter / JSON-LD headline を全て制作ガイド向けに書き換え
   - FAQPage JSON-LD（5問: 費用/納期/流れ/二次利用/BtoB vs BtoC）を追加

2. **[column/business-manga-production-guide-2.html](column/business-manga-production-guide-2.html)** を著作権コラムに整合化:
   - description / og / twitter / JSON-LD を漫画著作権・SNS引用ルール・二次創作ガイドライン向けに書き換え
   - 本文「AI時代だからこそ大切にしたい、クリエイターの『想い』」セクションが2回重複していたため削除

3. **[column/btob-manga-lp-lead-generation.html](column/btob-manga-lp-lead-generation.html)** を「BtoBマンガ」#1狙いに強化:
   - title: `BtoBマンガ制作｜無形商材のLP離脱率を改善しCVR向上させる完全ガイド`
   - description を「BtoBマンガ制作のプロが解説...」に刷新
   - H1・Breadcrumb・OGP・Twitter・Article JSON-LD 全同期
   - FAQPage JSON-LD（5問: BtoBマンガとは/CVR効果/費用/対象業界/流れ）追加

4. **[index.html](index.html) bm-whatis セクション**: 「ビジネスマンガ制作サービス」「BtoBマンガ制作」にターゲットコラムへのキーワード内部リンクを追加。CSS `.bm-whatis-link` を [css/bizmanga.css](css/bizmanga.css) 末尾に新設

   **2026-05-14 拡張**: bm-whatis に8つの用途別LPへの導線カードを追加（`.bm-whatis-uses` / `.bm-whatis-use-card` クラス）。リード文を `.bm-whatis-lead` として9用途を網羅、続けて4×2グリッド（SPは1列）でLP一覧を提示。各カードは num / title / desc / arrow の3列2行 grid で、`<a>` 要素全体がクリッカブル。導線先: /product-manga, /recruit-manga, /sales-manga, /training-manga, /company-manga, /manga-ad-lp, /inbound-manga, /ir-manga

**日次ランク追跡 (A)**

5. **[tools/rank-tracker.py](tools/rank-tracker.py) 新設**: GSC Search Analytics REST API を直接叩き、ターゲットキーワードの position / clicks / impressions / CTR を `tools/rank-history.jsonl` に1行追記（BizManga + ContentsX 両サイト）。依存: `urllib` のみ、google-api-python-client 不要。**追跡KWは新設時12件→用途別LP/漫画制作会社KWを追加し現在約40件**（正確な件数は `TARGET_QUERIES` 配列を参照）

6. **[.github/workflows/rank-tracker.yml](.github/workflows/rank-tracker.yml) 新設**: 毎日 00:00 UTC (JST 09:00) に `rank-tracker.py` を実行 → `rank-history.jsonl` を自動コミット。Secrets 必須: `GSC_CLIENT_ID` / `GSC_CLIENT_SECRET` / `GSC_REFRESH_TOKEN`（OAuth リフレッシュトークン）

**初回データ (2026-04-11〜2026-04-18 window)**
- BizManga: データウィンドウ短すぎ、12ターゲットすべて no data
- ContentsX: `ビズマンガ` pos=8 (1 click), `contentsx` pos=1 (3 clicks)

### 2026-04-20 SEO採点反映改善 第2弾（86→92→95+目標）

- **`tools/build-works.py` / `tools/build-columns.py` の regex バグ修正**: マーカー `<!-- BUILD:WORKS (auto-generated by tools/build-works.py) -->` のコメント内追加テキストに対応できず、再実行のたびに sitemap.xml 末尾にブロックが累積していた。`<!-- BUILD:XXX[^>]*?-->` に変更して冪等化。既存の重複ブロックは再ビルドで解消
- **[tools/build-works-og.py](tools/build-works-og.py) 新設**: 作品個別の 1200×630 専用OG画像を Pillow で生成。左にWPサムネ、右にタイトル・カテゴリ・ブランド帯を合成。`material/images/og/works/{slug}.webp` に出力
- `build-works.py` の og_image 割当を変更: `material/images/og/works/{slug}.webp` 存在時はそれを採用、無ければ WP thumb にフォールバック
- テンプレに `og:image:width=1200` / `og:image:height=630` を復元 → summary_large_image カードが正しい寸法でレンダリング
- **画像 width/height 属性を77件追加**（CLS対策）: ヘッダーロゴ・フッターロゴ・flow 8枚・strength比較・pricing-hero・manga-types character など主要画像
- alt属性欠落: 0件を確認（空alt 72件はすべて `role="presentation"` 装飾画像 / JS動的代入 / WPコラム本文で問題なし）

### 2026-04-20 SEO採点反映改善（監査スコア 86/100 → 目標 90+）

- `news-detail.html` / `testimonial-detail.html` / `column/index.html` に `<meta name="robots" content="noindex, follow">` を追加（`column-detail.html` は既に付与済）。SPA詳細シェルが重複メタで1URL扱いされる問題を回避
- `sitemap.xml` から `news-detail` 単数URL・`testimonial-detail?id=451` 単数URLを削除（静的化するまでサイトマップに載せない方針）
- [tools/templates/work-detail.html.tpl](tools/templates/work-detail.html.tpl) の `og:image` / `twitter:image` を `{{og_image}}` プレースホルダに変更し、[tools/build-works.py](tools/build-works.py) が WP の `thumbnail` を注入するように改修 → 17作品すべて個別 og 画像化

### 2026-04-14 SEO改善実施

- hreflangタグを全HTML・sitemap.xmlから削除（誤実装解消）
- index.html のオフスクリーン h1（`left: -9999px`）を削除し、ヒーロータグライン `<p class="bm-hero-tagline">` を `<h1>` に昇格（視覚h1化）
- `<meta name="referrer" content="strict-origin-when-cross-origin">` を全ページに追加
- ルートに [llms.txt](llms.txt) を新設（AI検索エンジン向けサービス概要・主要ページ一覧）
- Organization スキーマに `sameAs: https://x.com/Bizmanga_` / `parentOrganization.foundingDate: 2026-03-03` を追加
- sitemap.xml に 4 ページ追加（strength / manga-types / use-cases / production-flow）
- pricing.html に `Service` + `Offer`（3プラン: 19,800 / 17,900 / 16,600円/P）JSON-LD を追加
- testimonials.html に `CollectionPage` JSON-LD を追加（レビューはJS動的描画のため AggregateRating は未付与）。2026-10-26 時点で Review / AggregateRating は出さない方針（下記）
- faq.html に `FAQPage` JSON-LD を追加（8 Q&A）
- 全ページに `BreadcrumbList` JSON-LD を追加
- **コラム個別ページ Article JSON-LD 拡張**（2026-04-20）: `/column/*.html` 15ページに `wordCount`（本文文字数）/ `inLanguage: "ja"` / `articleSection`（カテゴリ）を追加。AI検索エンジンへの記事規模・言語・カテゴリシグナル強化
- **column BreadcrumbList position 3 に `item` URL 追加**（2026-04-21）: 15コラムページ全件で最終ノードがリンクとして機能するよう修正。テンプレート `tools/templates/column-detail.html.tpl` も同期
- **works CreativeWork schema の `image` を `ImageObject` 形式化**（2026-04-21）: `{@type: ImageObject, url, width: 1200, height: 630}` で 1200x630 OG画像を参照。Google Discover のサムネイル候補化に寄与
- 全ページに `twitter:site: @Bizmanga_` を追加
- works.html にSEO用静的イントロ（h1 + カテゴリリスト）を追加してJS依存によるクロール損失を緩和
- **works 静的SSG化**（タスク4）:
  - [tools/build-works.py](tools/build-works.py) 新設: WP API `/works` から取得し、`works.html` のBUILDマーカー間に静的カードを展開＋ItemList JSON-LD を挿入
  - [tools/templates/work-detail.html.tpl](tools/templates/work-detail.html.tpl) 新設: 個別作品ページテンプレ（BreadcrumbList + CreativeWork JSON-LD 付）
  - `works/{slug}.html` を19ページ自動生成（URL例: `https://bizmanga.contentsx.jp/works/diamond`）
  - `sitemap.xml` の `<!-- BUILD:WORKS -->` ブロックに個別URL 19件を自動追記
  - [js/bm-works-page.js](js/bm-works-page.js) を修正: 静的カード検出時は `grid.innerHTML=''` を回避し、click→モーダル のハンドラのみ付与（Cmd/Ctrl+Clickは個別ページへ遷移）
  - [.github/workflows/build-works.yml](.github/workflows/build-works.yml) 新設: 毎週日曜 03:00 JST 自動実行 + 手動トリガー可

### works 再ビルドルール

WordPress で works を追加・更新したら以下いずれか:

- **自動**: 毎週日曜 03:00 JST に GitHub Actions が走る
- **手動（即時）**: GitHub の Actions タブから "Build works static pages" → "Run workflow"
- **ローカル**: `python3 tools/build-works.py && git add works.html works/ sitemap.xml && git commit -m "chore(works): update" && git push`

## 14. 参照ドキュメント

| ファイル | 内容 |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Claude Code 引き継ぎ資料 |
| [../docs/specs/SPEC.md](../docs/specs/SPEC.md) | プロジェクト全体仕様（B/C横断） |
| [../docs/specs/STYLE-GUIDE.md](../docs/specs/STYLE-GUIDE.md) | デザインルール |
| [../docs/specs/COMPONENT.md](../docs/specs/COMPONENT.md) | 再利用UIパーツ |
| [../docs/content/SEO.md](../docs/content/SEO.md) | SEOメタデータ一覧 |
| [../docs/operations/CHECKLIST.md](../docs/operations/CHECKLIST.md) | 公開前チェックリスト |
| [docs/REVIEW-MANGA-WP.md](docs/REVIEW-MANGA-WP.md) | **漫画表示・WP接続を触ったPRの確認手順**（pr-gate 重要領域、`tools/smoke-manga-wp.py`） |

## 15. よくある落とし穴（Gotchas）

1. **WP側で漫画事例を編集しても反映されない** → `/works` と `/works-new` は別エンドポイント。ホームギャラリーは `/works-new` 優先で、空・未取得のときだけ `/works?site=bizmanga`（[bm-home.js](js/bm-home.js) の `refreshFromWp`。§5 表示先・順序制御）
2. 旧の言語保存値で表示が崩れる → `bm-nav.js` が安全にキーを削除しているか、動的表示が日本語フィールドのみを参照するかを確認
3. **モバイルでハンバーガー押せない** → §6.1 のチェックリスト
4. **QRダイレクトモードでの閉じるボタン** → §2.1 参照。閉じる/ESCは `biz-library` 遷移、history.pushState は呼ばない
5. **表示順の重複** → `cx_sort_order` が同数字だと投稿日順になって不安定 → §5 の運用ルール参照
6. **CTAセクション変更** → [js/bm-cta.js](js/bm-cta.js) 1箇所を編集すれば全ページ反映
7. **⭐ サブディレクトリからのリンクは必ず絶対パス（/始まり）を使う** → `column/{slug}.html` や `works/{slug}.html` のサブディレクトリ内ページで `href="contact"` のような相対パスを使うと `/column/contact` に解決されて404になる。HTML・JS・テンプレート問わず、全リンクは `href="/contact"` のように `/` 始まりにする。2026-04-17に bm-nav.js / bm-cta.js / bm-pricing-quiz.js / bm-testimonials-page.js / 両テンプレートで発生・修正済み
8. **⭐ 住所は「東京都目黒区中目黒1-8-8 目黒F2ビル1F」に統一 / 郵便番号は `153-0061`** → 旧住所「目黒2-11-15 8階」を 2026-04-21 に統一。同日に郵便番号も `153-0042 / 153-0051 / 153-0063` の3系統混在を `153-0061`（中目黒1丁目の正式番号）に統一。新規ページ追加時は必ず新住所 + 日本語の表示内容 + 正しい郵便番号を記述。NAP一貫性 (Name/Address/Phone) は Trust / Local SEO 直結
9. **⭐ works ヒーロー画像は `gallery[0]` を使う（`thumbnail` フィールドは使わない）** → WP API の `thumbnail` は 188x300 の自動生成サムネが返ることがあり、1200x630 として引き延ばすと画質劣化 + LCP要素として Lighthouse に認識されない。2026-04-21 に build-works.py を `gallery[0]` 優先に修正
10. **⭐ 空のお客様コメントは「—」ではなくセクション自体を非表示に** → WP側に `comment` が未入力の場合は `<section>お客様コメント</section>` 全体をレンダリングしない。空欄ダミーは SEO (Helpful Content / E-E-A-T) 減点要因。2026-04-21 build-works.py で条件分岐化
11. **⭐ メガメニューはモバイルで `position: static` に上書き必須** → `.bm-nav-megamenu` はデスクトップで `position: absolute` + `:hover/:focus-within` 展開。モバイルドロワー（`.bm-nav.open`）では絶対配置のままだと他ナビ項目（料金/コラム/FAQ）に被さってスクロールできない。`@media (max-width: 880px)` 内で `.bm-nav.open .bm-nav-megamenu` を `position: static; display: none;`、`.is-open` 時に `display: block` で展開し、`:hover/:focus-within` 由来のフロート展開を打ち消すこと。2026-04-26 修正
12. **⭐ LP CASE STUDY は静的詳細を持つ作品だけに絞る** → `tools/build-lp-cases.py` が `/works/{slug}` リンクで CASE STUDY カードを生成するが、`build-works.py` は `show_site=="both"` の作品しか静的詳細ページを作らない。それ以外（`shohin-shokai` / `merumaga` 等）を CASE STUDY に出すと、404→`404.html` 内の自動リダイレクトで `/biz-library?manga={slug}` (漫画ビューア) に飛ばされる。`build-lp-cases.py` の `filter_for_lp` で `has_static_detail()` を必ず通すこと。2026-04-27 修正
13. **⭐ CSS Grid 親要素の子に新タグを追加する時は必ず `grid-area` を指定** → `manga-production-company.html` の `.mpc-pain-entry` は `grid-template-areas: "num quote" / "num body"` の2カラム3行Grid。子に `<ul>` を追加した際、`grid-area` 未指定で auto-placement により細い `num` 列(96px)に配置されてレンダリング崩壊した。Grid親に追加する子要素は (1) `grid-template-areas` を拡張 (2) 子に `grid-area: <name>` を必ず付与の2点セット。2026-04-29 修正
14. **⭐ `<ul>` の直接の子に `<p>` を置かない** → 同じく 2026-04-29 mpc改善時、`<ul>` 直下に `<p class="mpc-pain-examples-title">` を置いて HTML仕様違反 + ブラウザの暗黙閉じタグでレイアウト崩れ。リスト見出しは `<ul>` の外側 `<div>` でラップして `<span>` か `<p>` で配置すること
15. **⭐ `transform: scale` はレイアウトボックスに反映されない** → `index.html` のトップ3D showcase (`#s3dSection`) で、JS が `gsap.set(wrap, {scale: 2.8})` で中央スマホを拡大していたが、`min-height: 100vh` の stage 内で `align-items: center` が **元のboxサイズ(208px)** を中央配置するため、スマホ実機で **News末尾→巨大白空白(約400px)→拡大スマホの一部→白空白→ギャラリー** という崩れた表示になっていた。修正: スマホ用に `.s3d-stage { min-height: auto; padding: 80px 0 60px; }` で stage を最終状態(scale 1)コンテンツに合わせる。初期 scale 2.8 のはみ出し分は `overflow: hidden` で見切れて自然な演出になる。2026-04-29 修正
15. **⭐ LP の SP アコーディオンで開く要素は `grid-column: 1 / -1` 必須**（`bm-lp-template.css` は削除済みだが、2列Grid＋暗黙配置の教訓として残す） → 当時の `bm-lp-template.css` の `.pm-pain-item` / `.pm-merit-item` は `grid-template-columns: auto 1fr` の2列Grid（番号列 + 本文列）。`.is-open` で出てくる `.pm-*-detail` に `grid-column` 指定がないと auto-placement で「番号」列(auto=狭い)に押し込まれ、本文が1文字ずつ縦書き状に折り返される。`.pm-format-detail` と同じく `grid-column: 1 / -1` を必ず付ける。Gotcha #13 と同じパターン（Grid親 + 子の暗黙配置）。2026-04-29 修正、BUGS.md #019

## 15.1 セキュリティ・既知のリスク

WP管理者が信頼前提で運用しているが、将来的に侵害された場合に持続的XSSが成立する経路が以下に存在する。優先度順に対応予定。

| # | 場所 | リスク | 対応方針 |
|---|------|--------|---------|
| ~~S1~~ | [tools/build-columns.py](tools/build-columns.py) `build_detail_page` の `{{content_html}}` | WP本文をエスケープなしでビルド時テンプレ流入 → script注入で静的コラムページXSS | ✅ **解消(2026-06-10 BUGS #039)** 標準ライブラリ製allowlistサニタイザ `sanitize_content_html()` を追加（新規依存なし）。本文を生成HTMLに流す前に通す。実コラム25本で正規タグ無損失を検証。再ビルドは週次cronで適用。さらに同経路に `normalize_brand_text()`（冪等）を組込み、禁止コピー「人間7割×AI3割」系（区切りが「・」の「人間7割・AI3割」も、2026-10-15 Issue #86）→「独自の制作メソッド」・旧料金14,700→16,600 をビルド時に自動正規化（BUGS #040。WP本文がマスターのままでも公開HTMLを方針準拠に保つ防壁） |
| S2 | [tools/templates/column-detail.html.tpl](tools/templates/column-detail.html.tpl):80-87 / [work-detail.html.tpl](tools/templates/work-detail.html.tpl):60-86 | `{{title_ja}}` 等が `html.escape(quote=True)` 経由でJSON-LD内に挿入。`\` や `\n` が含まれるとJSON構文破壊リスク | JSON-LD自体を build側で `json.dumps` してテンプレに `{{json_ld}}` で1ブロック差し込む設計に変更 |
| ~~S3~~ | ランタイムJS全般（bm-wp-api.js / works.js / bm-testimonials*.js / bm-works-page.js / column-detail.html / testimonial-detail.html） | WP由来文字列を未エスケープで `innerHTML` 連結。`column-detail.html` は `richHTML` typoで本文サニタイズ自体が無効だった | ✅ **解消(2026-06-10 BUGS #039)** 全描画を `bmSanitize.html()`/`rich()`/`url()`＋`safePos` 経由に統一、Playwrightでペイロード注入検証済み |
| S4 | 全HTMLヘッダー | CSP / HSTS / Permissions-Policy ヘッダなし（GitHub Pages制約） | `<meta http-equiv="Content-Security-Policy">` で許容範囲のCSPを meta タグで追加 |

### 既に対応済み（2026-04-21）

- [tools/build-works-og.py](tools/build-works-og.py) `load_thumb`: SSRF対策。`THUMB_ALLOWED_HOSTS = {cms.contentsx.jp, contentsx.jp, bizmanga.contentsx.jp}` + scheme=https のみ許可
- [tools/rank-tracker.py](tools/rank-tracker.py) `get_access_token`: client_id等のlength出力を `DEBUG_OAUTH` 環境変数指定時のみに制限

### Pythonツール変更ログ（2026-04-21）

- **build-columns.py**: WP API fetch を `ThreadPoolExecutor(max_workers=5)` で並列化。約20秒→6-10秒に短縮。`_fetch_detail_safe` でエラーは個別 stderr 出力に統一
- 定数定義位置と `from datetime import date` をモジュール先頭に整理

## 16. 回帰テスト

### 16.1 モバイルヘッダー（ハンバーガー）回帰テスト

[tools/test_mobile_nav.py](tools/test_mobile_nav.py) — Playwright でハンバーガーの表示/クリック可/開閉/ESC/scroll lock を6ページ分検証。

**実行**（cwd は BizManga/ 直下）:
```bash
python3 ~/.claude/skills/webapp-testing/scripts/with_server.py \
    --server "python3 serve.py" --port 8000 \
    -- python3 tools/test_mobile_nav.py
```

**いつ走らせるか**:
- ヘッダー・ナビのHTMLやCSSを変更したとき
- [js/bm-nav.js](js/bm-nav.js) を変更したとき
- 新ページ追加時（`TARGET_PAGES` に追加してから）

過去に「ハンバーガー押せない」問題が複数回再発したため必須チェック化。


### 16.2 共通チェックと自動生成（2026-10-05）

- `tools/check-site.py`: 全HTML/テンプレートのローカルJS・CSS参照、依存順、JSON-LD、Python/JavaScript構文を検証。
- `tools/test_build.py`: 出力の巻き戻し、マーカー、slug、料金変換、サニタイズ、JSON/XML、LPの再生成、IndexNowのpush範囲を検証。Issue #86 分（`StaticBuildIssue86Tests`）: 「人間7割・AI3割」の正規化、旧料金「1ページ1万円台」の正規化（meta・OG・JSON-LD・一覧カード）、ページ数の gallery 実枚数優先（gallery 3枚・手入力10ページ）、LPコメントの「」の二重化防止、コラム更新日の記事ページ・sitemap・RSS での一致、build-columns.yml の RSS 生成とコミット対象、制作事例ヒーロー画像の縦横比、テンプレートの CSP・ヘッダー・ロゴ寸法・フッター社名がルートページと揃っていること。
- `tools/test-runtime.cjs`: Service Workerのキャッシュ所有範囲・更新完了、フォームの共通送信処理を検証。計測は既存の `tools/test-bm-tracking.cjs` を併用。
- `tools/check-browser.py`: 外部通信をすべてモックし、お問い合わせ・資料DL・詳細ページ・8本のLPを検証。実際の送信は行わない。
- 本文URLの回帰ケースは `tools/fixtures/rich-html-urls.json` をPython・ブラウザで共有する。`check-browser.py --browser webkit` でWebKitも検証できる（事前に `python -m playwright install webkit` を実行）。
- `.github/workflows/checks.yml` で上記をPR時・main更新時に実行。実行コマンド・依存の導入はREADMEを参照。
- ブラウザ検査（`browser` ジョブ）は `ubuntu-24.04` に固定（2026-10-25 に ubuntu-latest が 26.04 になり、Playwright 1.58 が Chromium を入れられず全PRで失敗したため）。Playwright を 26.04 対応の版に上げたら ubuntu-latest に戻してよい。
- `tools/check-builds.py`: 公開WPから読み取り、一時ディレクトリでworks/columns/artists/feed/LPを各2回生成。生成JSONと再実行時の安定性（feed.xml も実行時刻に依存しないので完全一致）を検証し、作業ツリーは更新しない。

生成処理の共通部は `tools/bm_build.py`（HTTP・JSON・テンプレート・マーカー・ファイル出力）、
`tools/bm_html.py`（本文サニタイズ）、`tools/bm_content.py`（コラムslug）へ集約。
本文URLはブラウザの `js/bm-sanitize.js` と同じ方針で検証する。C0制御文字・DELはトリム前に拒否し、
相対URLとhttp(s)を許可する。リンクのhrefに限りmailto/tel、imgのsrcに限りPNG/GIF/JPEG/WebP/AVIF/BMP/ICOのbase64 data URLも許可する。
srcsetは各候補を検証し、カンマ区切りと曖昧になるdata URLを許可しない。本文の外部リンクは許可し、自社ドメイン限定の `bmSanitize.url` とは分ける。
描画がすべて成功してから出力を反映し、通常の書き込み例外では適用済みの変更も巻き戻す。
復元中に失敗しても残りの復元を続け、元の書き込みエラーと全復元エラー（対象パス付き）をまとめて報告する。
WP APIの取得は、タイムアウト・接続失敗・429・5xxに限り間隔を空けて最大3回まで試す（`bm_build.fetch_json`）。
再試行しても失敗したコラム詳細、不正なslug・JSON/XML・必須マーカー欠落はビルド失敗として扱う（既存ページは残る）。
作品IDの検証・重複チェックは BizManga に出す作品（`show_site == "both"`）だけにかける（`bm_build.bizmanga_works`）。ContentX専用作品のIDでBizMangaの生成を止めないため。
コラムのWP slugが安全なURLの条件（小文字英数字・`_`・`-`）に合わない場合は別URLへ切り替え、Actionsの画面に警告を出す（公開URLが変わるのでWP側のslugを直す）。
プロセスの強制終了やOS停止まで含む複数ファイルの原子的な更新ではない。

料金ルールは `tools/bm_pricing_rules.py`、ブラウザ向けの生成テンプレートは
`tools/templates/bm-pricing.js.tpl`。`js/bm-pricing.js` は生成物として扱う。
自動生成3ワークフロー（columns / works / lp-cases）は共通のconcurrency groupと `queue: max` で待機ジョブを保持して直列化し、
待機後のcheckoutでは `github.ref_name` を指定してブランチの最新状態から生成する。
`tools/commit-generated.py` で指定された生成物だけをコミットする。push前にrebaseし、競合はジョブ失敗として残す。
GSC日次ランクトラッカー（`rank-tracker.yml` / `tools/rank-tracker.py`）は不可侵領域のため対象外で、従来どおり単独でコミットする（日付入りメッセージ）。
IndexNowはpushのbefore〜after全体を対象とする。beforeが取得できない場合（強制push後など）は直前コミットとの差分で通知し、警告を出す。

### 16.3 ページ固有ファイルの配置（2026-10-05）

- お問い合わせ: `js/bm-contact.js`。資料DLと共通のHubSpot項目・送信先は `js/bm-lead.js`。お問い合わせの成功待ちと資料DLの非同期送信の違いは維持。
- お問い合わせフォームは `method="post"` と送信ボタンの初期無効化でJS未読込時のGET送信を防ぎ、ハンドラー登録後に有効化する。共通送信JSの未読込・同期例外も失敗案内と状態復旧の対象とし、入力内容を保持する。完了表示・広告CVはHubSpotの受理成功時だけ行う（例外: ハニーポット `#bmWebsite` に値がある送信は、どこへも送らず広告CVも発火させずに完了表示だけ出す。資料DLと同じ）。本物の利用者の送信が消えないよう、ハニーポットには `autocomplete="off"` に加えてパスワード管理ツールの除外指定（`data-1p-ignore` / `data-lpignore="true"` / `data-bwignore="true"` / `data-form-type="other"`）を付ける（2026-10-26。`#dlWebsite` も同じ）。
- 送信機能の準備中はHTML内の `#bmContactStatus` に再読み込み・電話連絡の案内を表示し、初期化成功後に隠す。フォームJSの読込失敗時とJavaScript無効時にも案内を残す。
- お客様の声の詳細では、共通サニタイザーが利用できない場合に読込表示を終了してエラーを表示し、未処理の本文は挿入しない。
- お客様の声（一覧・詳細）は構造化データの `Review` / `AggregateRating` を出さない（2026-10-26 削除）。自社サイト上の自社サービスへのレビューは Google のレビュー表示の対象外で、評価（全件5・平均4.8/4.9）にも根拠が無かった。評価を外しただけの Review は必須項目不足のエラーになるので、Review ごと出さない。パンくず等ほかの構造化データは残す。（それ以前は詳細の Review に閲覧日を `datePublished` として入れていた問題もあった。Issue #88）
- 動的詳細: `js/bm-column-detail.js`、`js/bm-news-detail.js`、`js/bm-testimonial-detail.js`。本文のブラウザサニタイズは `bm-sanitize.js` を使用。
- 埋込ビューア: `js/bm-embed-viewer.js` と `css/bm-embed-viewer.css`。URL・DOM・実行順は維持。
- ページCSS: `css/bm-{column-detail,news-detail,testimonial-detail,privacy-policy}.css`。静的コラムの共通CSSは `css/bm-column-static.css`（テンプレートも同期）。Critical CSSは初期描画のためインラインで維持。
- ロゴ表示: `js/client-logos.js` が2種類のデータ・クラス名を扱う。`js/data/` のデータは従来どおり分離。
- 8本のLPはHTML全体のv2マーカーを判定して事例セクションを生成。繰り返し実行しても空行を増やさない。
- LP事例は最大3件、カード幅は最大340pxで中央配置し、件数に応じて空の列を残さない。0件時は準備中の案内と制作事例・ビズ書庫へのリンクを表示する。
- LP事例のお客様コメントはカード側で「」で囲む。WP のコメントが既に「…」で囲まれていれば外してから囲む（`strip_outer_quotes`。2026-10-15、Issue #86。以前は company/ir/product/sales の4LPで「「…」」になっていた）。
- 参照がなくなっていた `js/bm-flow.js`、`js/bm-product-manga.js`、`css/production-flow.css`、`css/bm-lp-template.css` は削除。画像の元データは保持。
- Service Workerは `bm-covers-` 系の旧キャッシュだけを削除し、背景の再取得・キャッシュ保存を `waitUntil` で完了させる。
