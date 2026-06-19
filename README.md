# 動画仕分けボード

YouTube動画を視聴前に整理するための、GitHub Pages対応の軽量静的Webアプリです。気になるチャンネルや動画を手動で登録し、要約・重要ポイント・視聴判断・40代のリアル向けの発信価値をカード形式で確認できます。

## アプリ概要

- HTML / CSS / JavaScriptのみで動作します。
- 動画データは `videos.json` で管理します。
- スマホでも見やすいカード型UIです。
- ダークネイビー基調のデザインです。
- 以下の条件で絞り込みできます。
  - 視聴判断別
  - 深掘り候補あり
  - 投稿化候補あり

## `videos.json` の編集方法

`videos.json` は動画オブジェクトの配列です。新しい動画を追加する場合は、既存のオブジェクトをコピーして末尾に追加し、各項目を書き換えてください。

```json
{
  "channelName": "チャンネル名",
  "title": "動画タイトル",
  "url": "https://www.youtube.com/watch?v=...",
  "publishedDate": "2026-05-12",
  "summary": "動画の要約",
  "keyPoints": [
    "重要ポイント1",
    "重要ポイント2",
    "重要ポイント3"
  ],
  "fortiesInsight": "40代のリアル向け示唆",
  "decision": "A",
  "deepDive": true,
  "postCandidate": "note"
}
```

### 入力ルール

- `decision` は以下のいずれかを入力します。
  - `A`: 全部見る
  - `B`: 該当箇所だけ見る
  - `C`: 要約で十分
  - `D`: 保留
- `deepDive` は深掘り候補なら `true`、候補でなければ `false` を入力します。
- `postCandidate` は `X` / `note` / `YouTube` / `なし` のいずれかを入力します。
- JSONの最後の項目にはカンマを付けないようにしてください。

## GitHub Pagesでの公開方法

1. このリポジトリをGitHubにプッシュします。
2. GitHubのリポジトリ画面で **Settings** を開きます。
3. **Pages** を選択します。
4. **Build and deployment** の **Source** で `Deploy from a branch` を選びます。
5. **Branch** で公開したいブランチと `/ (root)` を選び、保存します。
6. 数分後に表示されるGitHub PagesのURLへアクセスします。

`index.html`、`style.css`、`app.js`、`videos.json` がリポジトリ直下にあるため、追加ビルドなしでそのまま公開できます。

## 今後の拡張案

- YouTube Data APIとの連携による動画情報の半自動取得
- 視聴メモや視聴済みステータスの追加
- タグ・キーワード検索の追加
- ローカルストレージを使ったブラウザ上での簡易編集
- 投稿化候補ごとの下書きテンプレート生成
- 要約や重要ポイントのAI支援入力
