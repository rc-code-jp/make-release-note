# Make Release Note 

このGitHub Actionは、Gemini APIを使用してプルリクエストの変更内容からリリースノートを自動生成します。

## 機能

- プルリクエストの変更ファイルとコミットメッセージを分析
- Gemini APIを使用してインテリジェントなリリースノートを生成
- マークダウン形式での出力
- プルリクエストへのコメント投稿
- 多言語対応（英語、日本語、スペイン語、フランス語、ドイツ語）

## 使用方法

```yaml
name: Generate Release Notes
on:
  pull_request:
    types: [opened, synchronize]
    branches: [main]

jobs:
  generate-release-notes:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    
    steps:
      - name: Generate Release Notes
        uses: rc-code-jp/make-release-note@v1.0.0
        with:
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
          gemini-model: 'models/gemini-2.0-flash-lite'
          github-token: ${{ secrets.GITHUB_TOKEN }}
          pull-request-number: ${{ github.event.number }}
          language: 'ja'
```

## 入力パラメータ

| パラメータ | 説明 | 必須 | デフォルト |
|-----------|------|------|-----------|
| `gemini-api-key` | Gemini APIキー | ✅ | - |
| `gemini-model` | 使用するGeminiモデル | ❌ | `models/gemini-2.0-flash-lite` |
| `github-token` | GitHub トークン | ✅ | `${{ github.token }}` |
| `pull-request-number` | プルリクエスト番号 | ✅ | - |
| `language` | リリースノートの言語 | ❌ | `en` |

## 出力

| 出力 | 説明 |
|------|------|
| `release-notes` | 生成されたリリースノート（マークダウン形式） |

## セットアップ

1. **Gemini API キーの取得**
   - [Google AI Studio](https://makersuite.google.com/app/apikey)でAPIキーを取得
   - リポジトリのSecretsに`GEMINI_API_KEY`として保存

2. **GitHub トークンの設定**
   - デフォルトの`GITHUB_TOKEN`を使用するか、カスタムトークンを設定

## 生成されるリリースノートの例

```markdown
## 🚀 Release Notes

### 概要
このリリースでは、ユーザー認証機能の改善とバグ修正が含まれています。

### 新機能
- ✨ 2要素認証のサポートを追加
- 🔐 OAuth2.0による外部認証の実装

### バグ修正
- 🐛 ログイン時のセッション管理の問題を修正
- 🔧 パスワードリセット機能の不具合を解消

### 技術的改善
- ⚡ データベースクエリの最適化
- 📦 依存関係の更新
```

## ライセンス

ISC

## 開発

### 依存関係のインストール

```bash
npm install
```

### ビルド

```bash
npm run build
```

このコマンドは`@vercel/ncc`を使用してすべての依存関係を`dist/index.js`にバンドルします。
