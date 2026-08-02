# Job Match App

茅ヶ崎駅から片道150分以内で通える求人を中心に、履歴書・職務経歴書と希望条件から求人のおすすめ度を0〜100点で評価する、iPhone向けPWAです。

## 現在の状態

ローカルで動く個人利用版を実装済みです。履歴書・職務経歴書の端末内解析、手動求人取込、許可を確認したRSS / Atomフィード取込、ルールベース採点、PWA通知設定に対応しています。

## 起動

```powershell
npm.cmd install
npm.cmd start
```

起動後に `http://localhost:4173` を開きます。既定では同じPCだけから接続できます。iPhoneで使う本番公開には、HTTPS対応のホスティングと認証を追加してください。

## iPhone向け公開

Dockerイメージで任意のHTTPS対応ホスティングに載せられます。公開環境では、必ず長いランダムな値を設定します。

```powershell
docker build -t job-match .
docker run -p 4173:4173 -e APP_PASSWORD="任意の長いパスワード" -e SESSION_SECRET="十分に長いランダム文字列" job-match
```

`APP_PASSWORD` を設定すると、APIと保存データは30日間のHttpOnlyセッションで保護されます。本番のリバースプロキシではHTTPS終端を行い、`X-Forwarded-Proto: https` を渡してください。HTTPS URLをiPhoneのSafariで開き、「共有」→「ホーム画面に追加」を選ぶとPWAとして利用できます。

### Docker Compose（推奨）

` .env.example` を `.env` にコピーして、二つの値を長くランダムな文字列に置き換えます。その後、次で起動できます。Dockerボリュームに求人・設定・通知鍵が永続保存されます。

```powershell
Copy-Item .env.example .env
docker compose up -d --build
```

死活確認は `GET /healthz` です。mainブランチへの反映時にはGitHub Actionsが構文チェックとDockerビルドを行い、成功すれば `ghcr.io/shodai123456-creator/job-match:latest` へイメージを公開します。

## Cloudflare Workers公開版

Workers + D1 + Cron Triggers版も同梱しています。Dockerサーバーを維持せず、無料枠でHTTPS・永続保存・毎朝通知を使うための公開版です。D1のデータベースIDとシークレットはGitへ保存しません。

```powershell
npm.cmd run build:worker
npx.cmd wrangler login
npx.cmd wrangler d1 create job-match
# 出力された database_id を wrangler.jsonc の database_id に設定
npx.cmd wrangler d1 migrations apply job-match --remote
npx.cmd wrangler secret put APP_PASSWORD
npx.cmd wrangler secret put SESSION_SECRET
npx.cmd wrangler deploy
```

デプロイ後に表示される `workers.dev` のHTTPS URLをiPhoneのSafariで開き、ホーム画面へ追加します。Cron Triggerは毎時実行され、設定した日本時間の朝に通知対象を送信します。Cloudflareの静的アセット、D1、Cron Trigger、Node互換モードを利用しています。

## 設計原則

- 初期運用費は0円。有料AI APIを使わない
- iPhoneのホーム画面から利用できるPWAとする
- 履歴書原本はブラウザ内で解析し、クラウドへ保存しない
- 求人サイトの利用規約、robots.txt、API条件を守る
- 取得許可が確認できないサイトは自動収集しない
- RSS / AtomはHTTPS、承認済み、最小60分間隔でのみ取得する
- 推薦点だけでなく、加点・減点理由と情報の確度を表示する

## ドキュメント

- [要件定義](docs/requirements.md)
- [基本アーキテクチャ](docs/architecture.md)
- [画面設計](docs/screens.md)
- [データモデル](docs/data-model.md)
- [実装WBS](docs/wbs.md)
