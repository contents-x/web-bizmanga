# github.md — BizManga リポジトリ Git 運用ルール

> **このファイルが BizManga の Git ルールの正本です。git 操作をするときは毎回ここを参照します。**
> 初めてこのリポジトリで作業する人は、最初に必ず一読してください。
> ContentsX リポジトリにも同じ内容の `github.md` があります（差分はリポジトリ名・デプロイ先・ビルドBotだけ）。

---

## ⛔ 絶対ルール（最優先・例外なし）

チーム開発なので、次の2つは必ず守る。**`main` で直接作業しない**ための土台。

1. **会話セッションを開いたら、毎回まずブランチを切る。**
   作業を始める前に、`main` ではなく作業ブランチにいる状態を作る（§3の命名で）。
2. **1つの機能を作る・コードを編集するときは、必ずブランチを切る。**
   「ちょっとした修正」でも `main` で直接編集・コミットしない。編集に着手する前にブランチを切る。

> Claude Code で作業する場合も同じ。**セッション冒頭と、コード編集に入る前に、この2ルールに従ってブランチを切ってから作業する。**

---

## 0. 大前提 — このリポジトリは「push＝即本番公開」

- `main` ブランチは **GitHub Pages で bizmanga.contentsx.jp に自動デプロイ**されます。
- **`main` に入った瞬間、世界中に公開されます。** 検証していないものを `main` に入れない。
- だからこそ「直接 `main` に push しない・PR経由でレビューしてからマージ」を徹底します（→ §4）。

---

## 1. 基本の流れ（毎回これ）

```
Issue を立てる  →  ブランチを切る  →  作業  →  push  →  PR を出す  →  レビュー承認  →  マージ  →  自動デプロイ
```

1. **Issue を立てる**（§2）— 何をやるか先に登録する
2. **`main` から新しいブランチを切る**（§3）— Issue番号を入れた名前で
3. **作業してこまめにコミット**（§6）
4. **リモートに push** して **PR を出す**（§4）
5. **相手のレビュー承認** をもらう
6. **マージ**（Squash推奨）→ 自動でデプロイ

> 小さな typo 修正でもこの流れに乗せます。「直接 main」の例外は作りません（唯一の例外はビルドBot、§4末尾）。

---

## 2. Issue — 課題ごとに1つ

**すべての作業は Issue から始めます。** 「何を・なぜ」を先に言語化することで、後から履歴を追える・二重作業を防げる・レビューしやすくなります。

- 作業を始める前に GitHub の **Issues** タブで新規Issueを作成（テンプレートあり）。
- 1 Issue = 1 つのまとまった作業。大きすぎるものは分割する。
- Issue番号（例 `#42`）を、このあとのブランチ名とPRに必ず紐づける。

**Issueを立てなくてよい例外**（それでも推奨はする）:
- 明らかに1行で終わる緊急の本番不具合（それでも後追いでIssue化する）

---

## 3. ブランチの切り方・名前の付け方

### 切り方

```bash
git checkout main
git pull origin main          # 必ず最新のmainから切る
git checkout -b feat/42-testimonials-restore
```

### 命名規則

```
<type>/<Issue番号>-<短い説明（英小文字・ハイフン区切り）>
```

例:
| ブランチ名 | 意味 |
|-----------|------|
| `feat/42-testimonials-restore` | お客様の声セクション復活（新機能） |
| `fix/45-android-text-scale` | Android文字拡大の被り修正 |
| `docs/routing-update` | ドキュメント更新（Issue無しでも可の軽微なもの） |
| `seo/50-mpc-lp-cluster` | SEO施策 |

### type の一覧

| type | 用途 |
|------|------|
| `feat` | 新機能・新セクション・新ページ |
| `fix` | バグ修正 |
| `style` | 見た目・CSSのみ（挙動を変えない） |
| `refactor` | 挙動を変えないコード整理 |
| `docs` | ドキュメント（SPEC.md / CLAUDE.md / *.md） |
| `seo` | SEO施策（メタ・スキーマ・LP・sitemap等） |
| `chore` | ビルド・設定・依存・雑務 |

### ブランチは短命に

- **数日で終わるサイズに保つ。** 長生きするブランチは `main` と乖離して事故のもと。
- マージが済んだブランチは削除する（PR画面の "Delete branch" ボタン）。

---

## 4. Pull Request（PR）

### ルール

- **`main` への直接 push は禁止。必ず PR 経由。**（GitHub側のブランチ保護で強制、→ §5）
- PR には **相手（もう1人）のレビュー承認が1件必要**。
- PR本文はテンプレートに沿って埋める（変更概要 / 対応Issue / チェックリスト）。
- **`Closes #42`** を PR 本文に書くと、マージ時にそのIssueが自動でクローズされます。

### マージ方式

- **Squash and merge を推奨**（1PR＝1コミットにまとまり、`main` の履歴がきれいになる）。
- マージ後はブランチを削除。

### マージの実行者（2026-07-19 運用変更）⭐

- **マージ操作は Claude Code が実行する**（人間がGitHub画面でマージボタンを押す運用から変更）。
- ただし **Claude は必ず事前に依頼者（またはリポジトリ所有者）へ「マージしてよいか」を確認し、明示的な許可を得てからマージを実行する。許可なしのマージは絶対禁止**。レビュー承認とマージ許可は別物（承認が付いていても、マージ実行前にあらためて許可を取る）。
- マージ後は Claude がブランチ削除・Issue自動クローズの確認・本番反映（GitHub Pagesデプロイ）の確認まで行う。
- このルールは招待メンバーを含む**全チーム共通**（ContentsX_HP / bizmanga 両リポジトリ同一運用）。人間による手動マージも従来通り可能だが、基本フローはClaude実行に統一する。

### 重要領域（漫画表示・WP接続）を触ったPR（2026-09-15 平澤指示）⭐

- `.claude/pr-gate-paths.txt` に載っているファイル（ビューア / ホームギャラリー / 制作事例 / 埋込ビューア / WP APIクライアント / 静的ビルド）を触ったPRは、AIエージェントのレビューゲートが自動で **重要度 HIGH** にし、レビュー記録が無いと `gh pr merge` が止まる。
- マージ前に **[docs/REVIEW-MANGA-WP.md](docs/REVIEW-MANGA-WP.md)** の手順（`tools/smoke-manga-wp.py` の自動テスト＋目視）を実行し、結果を添えて所有者のOKをもらう。この領域は「AIレビュー指摘ゼロ」での自動承認を使わない。
- 人がGitHub画面から直接マージする場合も、同じ手順を済ませてからにする（ゲートはAIエージェントの操作にしか効かない）。

### ⚠️ ビルドBotだけは直接pushする（正常）

このリポジトリでは、以下の **GitHub Actions が自動で `main` に commit/push** します。これは仕様であり、止めてはいけません。

| ワークフロー | 何をするか |
|------------|-----------|
| `build-works.yml` | WPの作品データから静的ページを毎日生成 |
| `build-columns.yml` | WPのコラムから静的ページとRSS（`feed.xml`）を生成 |
| `build-lp-cases.yml` | LP用事例を生成 |
| `rank-tracker.yml` | GSC順位を毎朝記録 |

→ ブランチ保護を設定する際は、これらの Bot（`github-actions[bot]`）を**例外として許可**します（§5参照）。人間だけがPR必須になるよう設定します。

---

## 5. ブランチ保護の設定（管理者＝リポジトリ所有者が1回だけ実施）

> これは平澤（リポジトリ所有者）が GitHub の Web 画面で1回設定する作業です。設定後は全員がPRフローに従うことになります。

**Settings → Branches → Add branch ruleset**（または旧UI: Branch protection rules）で `main` に対して:

1. ☑ **Require a pull request before merging**
   - ☑ Require approvals → **1**
2. ☑ **Require status checks to pass**（任意。ビルド系チェックがあれば）
3. ☐ **Do NOT** enable "Include administrators" を強制しすぎない
   — ただし所有者も基本はPRに従う運用にする
4. **ビルドBotの例外**:
   - Ruleset の **Bypass list** に `Repository admin` と、Actions が使う `github-actions[bot]` 相当を追加する
   - 旧UIの場合: `github-actions[bot]` は `GITHUB_TOKEN` で push するため、"Allow specified actors to bypass required pull requests" に追加、もしくは各ビルドワークフローの push 先を保護対象から外れるよう運用で担保する
   - **設定後、必ず `build-works` 等を手動実行（workflow_dispatch）してBotのpushが通ることを確認する**

> 設定でBotのpushがブロックされると、作品・コラムの静的ページ更新が止まります。設定変更の翌日は反映を必ず確認してください。

---

## 6. コミットのルール

### メッセージ形式

```
<type>: <日本語で何をしたか（現在形・簡潔に）>

（必要なら本文で「なぜ」を説明）

Closes #42
```

例:
```
fix: Android文字拡大でヒーロー見出しが被る問題を修正

text-size-adjust:100% を追加。iPhone確認だけでは検知できなかった。

Closes #45
```

- `type` はブランチのtypeと揃える（`feat` / `fix` / `docs` …）。
- 1コミット＝1つの意味のまとまり。「あれもこれも」を1コミットに詰めない。
- **こまめにコミットする**（作業の区切りごと）。

### Claude Code で作業する場合

Claude がコミットする際は、末尾に共同作成者行を付けます（プロジェクト規約）:
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

---

## 7. 仕様書の同時更新（このプロジェクト必須ルール）⭐

機能追加・動作変更・URLパラメータ追加・共通コンポーネント変更などを行ったら、**同じPR内で対象の仕様書も更新する**こと。「後でまとめて」は禁止。

- どのmdを更新するかは [../docs/MD-UPDATE-ROUTING.md](../docs/MD-UPDATE-ROUTING.md) を参照。
- BizManga の変更 → [SPEC.md](SPEC.md) または [CLAUDE.md](CLAUDE.md)。
- バグ修正・再発防止 → ルートの [BUGS.md](../BUGS.md) の索引に1行、本文はルートの `docs/bugs/` の分野別ファイルに追記（手順は BUGS.md 末尾）。

PRテンプレートのチェックリストにこの項目が入っています。

---

## 8. やってはいけないこと（禁止事項）

- ❌ **`main` への直接 push / force push**（Botを除く）
- ❌ 検証していない変更を `main` にマージ（＝即本番公開される）
- ❌ `/biz-library` URL の変更（QRコードで外部配布済み・変更禁止）
- ❌ ビルドBotの Actions を止める・保護でブロックする
- ❌ 他人のブランチに勝手に force push する
- ❌ 仕様書更新をサボる（§7）

---

## 9. 困ったときのクイックリファレンス

```bash
# 最新のmainから作業ブランチを切る
git checkout main && git pull origin main
git checkout -b fix/45-android-text-scale

# 作業 → コミット
git add -A
git commit -m "fix: ..."

# push（初回は -u で上流を設定）
git push -u origin fix/45-android-text-scale
# → 表示されるURLからPRを作成

# mainが進んだので取り込みたい（コンフリクト前に）
git checkout main && git pull
git checkout fix/45-android-text-scale
git merge main            # またはお好みで rebase

# マージ済みブランチの掃除
git checkout main && git pull
git branch -d fix/45-android-text-scale
```

---

**関連ドキュメント**: [CLAUDE.md](CLAUDE.md)（開発仕様） / [SPEC.md](SPEC.md)（機能仕様） / [../docs/OPERATIONS.md](../docs/OPERATIONS.md)（運用全体像）
