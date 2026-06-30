# Gemini Analyze Worker

`workers/gemini-analyze-worker.js` は、GitHub Pages から Gemini API キーを隠して呼び出すための Cloudflare Worker サンプルです。

## 後でデプロイするときに必要な設定

1. Cloudflare Worker を作成し、このファイルの内容を配置します。
2. Worker の環境変数または Secret に `GEMINI_API_KEY` を設定します。
3. 必要に応じて以下を設定します。
   - `GEMINI_MODEL`: 省略時は `gemini-1.5-flash`
   - `ALLOWED_ORIGIN`: GitHub Pages の URL。省略時は `*`
4. デプロイした Worker の URL を、リポジトリルートの `config.js` にある `geminiAnalyzeEndpoint` へ設定します。

## GitHub Pages 側の動作

- `geminiAnalyzeEndpoint` が空の場合、「Gemini解析用のAPI endpointが未設定です」と表示します。
- endpoint が設定されている場合、カードの動画情報と整理プロンプトを `POST` します。
- 成功レスポンスの `analysis`、またはレスポンス本文そのものを解析結果としてカードと localStorage に反映します。
