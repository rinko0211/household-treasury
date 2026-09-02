# Household Treasury

個人向けの「資産管理 + 資金繰り + 投資余力」PWAです。

## 現在の構成
- GitHub Pagesで配信する静的PWA
- ローカル保存を基本とし、SupabaseでPC/スマホ間を同期
- Supabaseへ送信する前に AES-GCM + PBKDF2 で暗号化
- Supabase Row Level Security (RLS) により、ログイン本人の行だけ読み書き可能
- 公開リポジトリには実際の家計データを保存しない

## 初回利用
1. GitHub Pagesでこのリポジトリを公開
2. アプリを開く
3. Settings > 端末間同期
4. メールと8文字以上のログインパスワードでアカウント作成
5. 確認メールが届いた場合は認証後にサインイン
6. 8文字以上の暗号化パスフレーズを設定（ログインパスワードとは別推奨）
7. PCで PRIVATE IMPORT JSON を読み込む
8. 「この端末のデータを送信」
9. スマホでは同じアカウントと暗号化パスフレーズで「クラウドから取得」

## 重要
`Household_Treasury_PRIVATE_IMPORT.json` はこのリポジトリにアップロードしないでください。
