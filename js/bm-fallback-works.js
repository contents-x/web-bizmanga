// ビズ書庫の手書きの作品データ（公開中の作品だけ）。WP に繋がらないときに素材フォルダの画像で表示してよい作品の一覧を兼ねる。
// 読むところ: js/works.js（ビズ書庫の一覧の初期表示・WP が届く前に押した作品。FALLBACK_WORKS）と
//            js/bm-embed-viewer.js（埋込ビューアで WP がエラー・通信できないとき。この一覧に無い作品は画像を推測しない）
// ⛔ 非公開にした（WP から消した）作品・ビズ書庫の一覧に出さない作品は載せない（載せると WP が届くまで、/library が失敗・
//    0件ならその間ずっとビズ書庫の一覧に出て開け、埋込ビューアでも WP 障害中に素材フォルダの画像が出る）。
//    tools/smoke-manga-wp.py が「ここの作品はすべて /library にある」を確かめる（ルート BUGS.md #085）。
// タグ・カテゴリは WordPress の manga_category タクソノミーと統一（営業 / 採用 / 研修 / 集客 / 紹介 / ブランド / IP）。
// ページ数は WP の値ではなく、素材フォルダ（contentsx.jp/material/manga/{id}/01.webp〜）に実際にある枚数
// ＝このデータで開いたときに表示できる枚数（WP のギャラリーの方が多い作品もある。WP に合わせると素材フォルダに無いページが
// 404 になる。2026-10-16 ContentsX の main で数えた値）。表示モードは WP の /library に合わせる（WP 側で変えたらここも直す）。
// 列: 作品 ID・タイトル・ページ数・カテゴリ・表示モード（WP の view_type と同じ値: 'spread'＝見開き / 'vertical_only'＝縦読み専用）。
window.BM_FALLBACK_WORKS = [
    ['diamond','DIAMOND シャンパンコール',11,'研修','spread'],
    ['ichinohe-home','一戸ホーム',22,'営業','spread'],
    ['omatome-ninja','おまとめ忍者 見つけてみせる！トレンドの兆し',15,'紹介','spread'],
    ['omatome-ninja-2','おまとめ忍者 手間な議事録をこっそり要約',9,'紹介','spread'],
    ['omatome-ninja-3','おまとめ忍者 地獄のまとめ作業 拙者におまかせ！',8,'紹介','spread'],
    ['omatome-ninja-4','おまとめ忍者 手書き派の悩み 拙者にお任せ！',10,'紹介','spread'],
    ['omatome-ninja-5','おまとめ忍者 長時間会議も怖くない！',11,'紹介','spread'],
    ['omatome-ninja-rohto','おまとめ忍者 忍者参上！！欠席者をお助けいたす！',19,'紹介','spread'],
    ['omatome-ninja-english','おまとめ忍者（海外版）',15,'紹介','spread'],
    ['seko','瀬古恭介 始まりのものがたり',25,'ブランド','spread'],
    ['life-buzfes','バズフェス',25,'集客','spread'],
    ['bms-unso','BMS運送',10,'採用','spread'],
    ['torutoru-kun','トルトルくん',21,'採用','spread'],
    ['hamada-masatada','濱田将匡 信頼を、つなぐ。',20,'ブランド','spread'],
    ['asobi-kyary','ASOBI SYSTEM×きゃりーぱみゅぱみゅ',6,'IP','spread'],
    ['uike-law','正義の価値',8,'ブランド','vertical_only'],
    ['lady-column','レディーコラム',4,'紹介','vertical_only']
];
