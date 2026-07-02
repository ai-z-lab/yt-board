# Gemini Analyze Worker

`workers/gemini-analyze-worker.js` は、GitHub Pages から Gemini API キーを隠して呼び出すための Cloudflare Worker です。

このリポジトリには Wrangler 用の `wrangler.toml` が含まれているため、Cloudflare の管理画面で Worker を作成できない場合でも CLI からデプロイできます。

## Wrangler でのデプロイ手順

### 1. Cloudflare にログインする

リポジトリルートで以下を実行し、ブラウザで Cloudflare にログインします。

```bash
npx wrangler login
```

ログイン状態を確認する場合は以下を実行します。

```bash
npx wrangler whoami
```

### 2. Gemini API キーを Secret として登録する

`GEMINI_API_KEY` は公開されない Secret として登録します。

```bash
npx wrangler secret put GEMINI_API_KEY
```

コマンド実行後にプロンプトが表示されたら、Gemini API キーを貼り付けて Enter を押してください。

### 3. GitHub Pages の Origin を設定する

`ALLOWED_ORIGIN` は `wrangler.toml` の `[vars]` で設定済みです。

```toml
[vars]
ALLOWED_ORIGIN = "https://ai-z-lab.github.io"
```

別の GitHub Pages URL から呼び出す場合は、`wrangler.toml` の値を変更してから再デプロイしてください。

### 4. Worker をデプロイする

以下を実行すると、`wrangler.toml` の設定に従って Worker 名 `naoki-gemini`、エントリポイント `workers/gemini-analyze-worker.js` でデプロイされます。

```bash
npx wrangler deploy
```

デプロイが成功すると、Wrangler の出力に以下のような `workers.dev` の URL が表示されます。

```text
https://naoki-gemini.<your-subdomain>.workers.dev
```

## GitHub Pages 側の設定

デプロイ後に発行された `workers.dev` の URL を、リポジトリルートの `config.js` にある `geminiAnalyzeEndpoint` へ設定します。

```js
window.YT_BOARD_CONFIG = {
  geminiAnalyzeEndpoint: 'https://naoki-gemini.<your-subdomain>.workers.dev',
};
```

`config.js` を更新して GitHub Pages に反映すると、フロントエンドから Worker 経由で Gemini 解析を呼び出せます。

## GitHub Pages 側の動作

- `geminiAnalyzeEndpoint` が空の場合、「Gemini解析用のAPI endpointが未設定です」と表示します。
- endpoint が設定されている場合、カードの動画情報と整理プロンプトを `POST` します。
- 成功レスポンスの `analysis`、またはレスポンス本文そのものを解析結果としてカードと localStorage に反映します。

## 任意の追加設定

- `GEMINI_MODEL`: 省略時は `gemini-1.5-flash` です。必要な場合は `wrangler.toml` の `[vars]` に追加してください。
