# Biz-Ops Calendar Agent — デモ動画台本

> **収録日**: 2026-02-13
> **提出先**: Agents League @ TechConnect — Track 3: Enterprise Agents
> **推奨尺**: 3〜5 分

---

## 事前準備チェックリスト

- [ ] M365 Copilot Chat (Teams Web or Desktop) にログイン済み
- [ ] Biz-Ops Calendar Agent が公開済み（最新版）
- [ ] M365 表示言語 → 日本語（日本語デモの場合）
- [ ] 画面解像度: 1920x1080 推奨、ブラウザズーム 100-125%
- [ ] 不要な通知をオフ（Teams / Windows）
- [ ] テスト用の予定が今日/来週のカレンダーに入っている

---

## デモ構成（4 シーン）

### Scene 0 — イントロ（~30秒）

**画面**: README.md のアーキテクチャ図 or スライド

**トーク**:

> 「Biz-Ops Calendar Agent は、Copilot Studio で構築した M365 Copilot エージェントです。
> Connected Agents パターンで Calendar Sub-Agent と Email Sub-Agent に自動委任し、
> スケジュール確認・他人の空き時間検索・会議作成・メール管理まで一気通貫で行えます。
> DLP 制約で Microsoft MCP Servers が使えなかったため、
> Power Automate Bridge パターンで Graph API を標準コネクタ経由で呼び出す工夫をしています。」

**見せるポイント**:

- アーキテクチャ図（Orchestrator → Sub-Agents → Tools/Flows）
- DLP Challenge & Solution の表

---

### Scene 1 — 今日の予定を確認（~45秒）

**画面**: M365 Copilot Chat → Biz-Ops Calendar Agent を選択

**入力**:

```
今日の予定を教えて
```

**期待される動作**:

1. Orchestrator が Calendar Sub-Agent にルーティング
2. 会議管理 MCP サーバー → `GetCalendarViewOfMeetings` を実行
3. 今日の予定一覧を JST で表示

**トーク**:

> 「まず基本的な自分のスケジュール確認です。
> 裏では Orchestrator が Calendar Sub-Agent に自動委任し、
> Office 365 Outlook コネクタの GetCalendarViewOfMeetings で予定を取得しています。」

**補足**: 応答が返ったら内容を軽く読み上げて正確性を確認

---

### Scene 2 — 他人の空き時間を確認（~60秒）

**入力**:

```
alice@contoso.com の明日の空き時間を確認して
```

> ※ テスト用のアカウントに適宜変更

**期待される動作**:

1. Calendar Sub-Agent が GetSchedule Flow（Power Automate）を呼び出す
2. Graph API `getSchedule` → availabilityView を返却
3. 空き時間サマリを JST で表示（Free ✅ / Busy ❌ / Tentative ⚠️）

**トーク**:

> 「次に他人の空き時間確認です。これは Office 365 Outlook コネクタの
> 'HTTP 要求を送信します' アクションを Power Automate から呼び出して、
> Graph API の getSchedule を実行しています。
> DLP で Microsoft MCP Servers がブロックされたので、
> Power Automate を Graph API のブリッジとして使う工夫です。」

**補足**: availabilityView の数値 (0/1/2/3/4) がどう解釈されるか軽く触れる

---

### Scene 3 — E2E 会議スケジューリング ⭐（~90秒）

**これがメインデモ。候補提示→ユーザー選択→会議作成の 3 ステップ。**

**入力**:

```
2/23の週で、30分のミーティングができる空き時間を教えて
```

> **注意**: 「空きスロット」は `openAISexual` モデレーションで誤ブロックされるため「空き時間」を使うこと
> **注意**: 「来週」等の相対日付より `2/23` のような具体日付の方が安定する

**期待される動作**:

1. GetSchedule Flow → 自分 (or 相手) の空き時間取得
2. GetCalendarViewOfMeetings → 自分の予定を取得
3. 共通の空き時間候補を計算・提示
   - 📅 候補1: 2/16 (月) 10:00 - 10:30 JST
   - 📅 候補2: 2/17 (火) 14:00 - 14:30 JST
   - 📅 候補3: 2/18 (水) 11:00 - 11:30 JST

**ユーザー入力（候補選択）**:

```
2/23の09:00～09:30でミーティングを作成して。タイトルは「チームSync」でお願い
```

**期待される動作（会議作成）**:

- CreateMeeting 実行
- Teams オンライン会議リンク付きで作成
- 「✅ 会議を作成しました」と確認メッセージ

**トーク**:

> 「ここがメインのシナリオです。空きスロット検索から候補提示、
> ユーザー確認、会議作成まで一連の E2E フローを実行します。
> Instructions で '必ず候補を提示してユーザー確認を取ってから作成する'
> という 3 ステップワークフローを定義しています。」

**注意**:

- 会議が作成されたら「Teams リンクも生成されている」ことを強調
- 作成後に Outlook カレンダーで実際に会議が入っていることを見せると効果的

---

### Scene 4 — メール操作（オプション、~30秒）

**入力**:

```
未読メールを5件表示して
```

**期待される動作**:

1. Orchestrator が Email Sub-Agent にルーティング
2. メール管理 MCP サーバー → `ListEmails` 実行
3. 差出人・件名・受信日を表示

**トーク**:

> 「Email Sub-Agent への自動ルーティングも動作します。
> カレンダーと同様に Office 365 Outlook コネクタ経由です。」

---

## まとめ（~15秒）

**トーク**:

> 「以上が Biz-Ops Calendar Agent のデモでした。
> Connected Agents による自動委任、Power Automate Bridge による DLP 対応、
> Instruction Engineering による確実なワークフロー制御がポイントです。
> ありがとうございました。」

---

## トラブルシューティング

| 症状                                     | 対処法                                                              |
| ---------------------------------------- | ------------------------------------------------------------------- |
| ContentFiltered エラー                   | モデレーション → 低 に設定済みか確認                                |
| 「どのカレンダーID？」と聞かれる         | Sub-Agent Instructions で `calendar_id="Calendar"` を指示           |
| 日付が古い（2/2 等）                     | Orchestrator が日付を解決して Sub-Agent に渡すフロー確認            |
| 英語入力→日本語応答                      | M365 ロケール制約。日本語ロケール環境では日本語デモ推奨             |
| GetSchedule Flow エラー                  | Power Automate のフロー実行履歴を確認。接続の再認証が必要な場合あり |
| Sub-Agent が応答しない                   | Copilot Studio でエージェントを再公開                               |
| 「空きスロット」で openAISexual ブロック | 「空き時間」に言い換えること                                        |

---

## リハーサル結果（2026-02-13 07:18 JST）

| シーン    | 入力                                                                             | 結果                                              |
| --------- | -------------------------------------------------------------------------------- | ------------------------------------------------- |
| Scene 1   | 「今日の予定を教えて」                                                           | **PASS** — 3件取得（LT, SkillUp AI, TechConnect） |
| Scene 3-1 | 「2/23の週で、30分のミーティングができる空き時間を教えて」                       | **未テスト** — 具体日付に変更済み                 |
| Scene 3-2 | 「2/23の09:00～09:30でミーティングを作成して。タイトルは『チームSync』でお願い」 | **未テスト** — 具体日付に変更済み                 |

**注意**: 作成されたテスト会議は録画前に削除すること

---

## 技術的アピールポイント（審査向け）

| 評価項目                                | 実装                                              |
| --------------------------------------- | ------------------------------------------------- |
| **Connected Agents (15pts)**            | Calendar Sub-Agent + Email Sub-Agent の2つ        |
| **M365 Copilot Chat Agent (Pass/Fail)** | Copilot Studio → Teams/Web に公開済み             |
| **Custom MCP Server (8pts)**            | TypeScript 製 calendar-mcp-server（リポジトリ内） |
| **DLP 対応 (Innovation)**               | Power Automate Bridge パターン                    |
| **Instruction Engineering**             | 3-step 確認フロー、言語マッチング、日付解決       |
| **Business Value**                      | 日程調整は全社員が毎日使う普遍的ペインポイント    |
