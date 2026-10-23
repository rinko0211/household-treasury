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


## 月次収支・年間資金管理（v145）

「月次収支」タブで集計サイクルと支出の見方を切り替えられます。

- **給与サイクル**: 毎月の給与基準日から翌給与日前日。18日が土日なら直前の金曜日。2026年10月分は10月16日〜11月17日。
- **暦月**: 毎月1日から末日。明細・12期間比較・年間集計を同一サイクルで集計。
- **給与からの資金流出**: 銀行・現金で確認した生活費、固定費、カード引落、ローン・リボ返済、投資積立、特別費を含む。
- **消費支出**: カードは利用日基準。カード引落、ローン元金、投資への振替、ATM引出は消費と区別。
- **年間収支**: 12期間の給与・賞与実入金、総流出、返済、積立、消費、未照合予定を区分。未登録の収入・特別費は推定しない。
- **残高**: 銀行で記録された流動残高と「期間収入－期間流出」は別。給与予定は実績残高に足さない。
- **優先順位**: 銀行実績を最優先し、カード請求・見込・固定費・ローン・手入力予定が重なる場合は二重計上しない。
- **単発費**: 旧マスターの洗濯機、電動自転車、タイヤ購入は年次反復として自動計上しない。
- **留保**: 未取込の明細があれば年間総額は不完全。祝日による給与日変更は銀行実入金で確認。家族への送金と現金明細の重なりには警告。

自動集計は読み取り専用です。過去に二重登録されたカード原明細は自動削除しません。

回帰テスト: node tests/treasury-ledger-v145.test.js

## PDF修正画面の整理（v150）

旧「PDF明細の管理・削除 v146」と支出画面のショートカットは廃止しました。現在はImportの「原本照合済み明細の修正」（v149）とMDC PDF重複候補の点検機能を使用します。**保存済み取引や銀行データは削除しません。**

## 原本照合済み明細の個別修正（v149）

PDF更新で同一カード利用が異なる識別子として重複登録された場合の安全な対処です。

1. 照合済み修正パッチJSONを端末に保存します。氏名、店名、金額、購入IDは公開リポジトリに追加しません。
2. Import → 原本照合済み明細の修正 → 照合済み修正JSONを選ぶ。
3. 削除する旧行と残す新行のID、日付、金額、利用先、請求月、回数、元ファイルを厳密に確認します。
4. 明示的な確認後、端末復旧履歴を作成して重複行だけ削除します。銀行明細、他カード、資産残高、取込ハッシュは変更しません。
5. Settingsでクラウド同期の結果を確認してください。繰り返し適用しても重ねて削除しません。

**重要:** 通常の「バックアップ読込」は取込済み明細をマージする仕様で、修正済みJSONだけを読み込んでも既存の重複行が復活することがあります。専用の修正パッチ機能を使用してください。

対象データがすでに整合していれば削除せずに終了します。コード自体に利用者の家計取引データを埋め込みません。

## 支出の大分類と基本予算（v151）

「支出」タブの資金流出モードは、登録済みの家計明細を「通常の生活費（家族カード・現金など）」「固定費・通常ローン」「iDeCo」「その他の投資・積立」「特別費」に分類して表示します。各行をタップすると従来の意味カテゴリ／借入種類と個別明細まで開けます。消費・購入額モードでは利用日ベースの「通常生活費」と「特別費」を区別します。

「固定費・通常ローン」の内訳を開くと、既存固定費マスターの電気・ガス・水道・保険・ローン等を月額参考値として表示します。カード払いの固定費も参考表示だけであり、引落実績への再加算はしません。

「毎月の基本予算（マスターから・参考）」では、家族カードの配分と現金配分を通常生活費の計画額として合計し、固定費・通常ローン、iDeCo、その他積立を別表示します。**予算と実際の資金流出は決して加算しません**。基準月に紐づく月額マスターがなければ金額は推測しません。過去の例示画像の数値をアプリに固定入力しません。

旧v146のPDF管理画面は引き続き廃止。v149の検証済み修正JSONとv144のPDF重複点検は維持します。実データを変更せず、表示・分類の計算だけ更新します。

## ユーザー承認済みサブカテゴリ別の固定費／変動費分類（v152）

- expense-nature-rules-v152.js に、ユーザーが指定した19カテゴリ内の68サブカテゴリすべてと、車ローン（プラド／ラパン／両車の夏冬ボーナス返済）・iDeCoの7マスターを明示的に登録。
- FIXED（固定費）、VARIABLE（変動費）、SPECIAL（特別費）、REVIEW（明細ごとに判断）。REVIEWは勝手に固定費・変動費へ振り分けない。明細に個別指定があれば優先する。
- 支出画面の消費・購入額は、利用日基準で固定費・変動費・特別費・要確認を表示し、カテゴリ・サブカテゴリ・明細のドリルダウンを維持。
- 資金流出はローン元金返済を固定費、iDeCoを固定拠出、カード引落を用途未配分、その他積立を投資として独立表示。カード引落は複数の利用先を含むため固定費／変動費へ推測按分しない。購入別の分類は消費モードで見る。
- 固定費マスターの参考表示は承認済み固定ルールに一致するものだけ。ボーナス返済等の年次・季節固定費は該当月に別枠参考表示し、通常月の予算には含めない。
- 固定／変動という費用の性質とeconomic_type（消費・元金返済・投資等）は独立。銀行残高や明細のcategory・subcategory・economic_type・spending_classは書き換えない。
- 明細の旧spending_classと新ルールが異なる場合、表示は今回の承認ルールを優先する。ただしREVIEWは既存の明細固有の選択を尊重する。
- 回帰テスト: node tests/expense-nature-rules-v152.test.js と従来のテスト。

## 2026年9月18日〜10月16日 経済支出・資金用途監査（v153）

- プライベート家計明細やバックアップは公開リポジトリに格納しません。ユーザー向けの監査修正済みJSONと厳密照合差分JSONは会話添付として配布します。
- `cycle-audit-reconciliation-v153.js` は当該過去給与サイクルの利用日基準の消費と、ローン・投資・送金・カード引落を別建てに集計する読取り専用ビューです。取引を個別集計し、受入値の金額はコードに固定していません。
- 2026年10月16日の給与は次のサイクル。現金購入の同日仮帰属分は指定の前サイクルに含みます。日付が未確定の2件は未確定のまま保持。日付原本が不足する4件は10月月帰属のみで、日を仮確定しません。
- 二重計上: 吸収済み現金を個別ID・カード購入IDで追跡して集計除外。混合払いは購入総額を消費に1回計上し、現金／商品券／ポイント内訳を別属性に保持。ATM出金やカード引落は資金移動、ローン元金は債務返済、iDeCoは投資。
- 一部の銀行手数料は指定受入集計と全銀行取引計上値が一致しないため、個別明細は公開せず、端末側だけで差額を明示して両方の数値を併記します。未解決の取引を削除または金額改変して数字合わせしません。
- `cycle-audit-reconciliation-v153.js` の専用Importは更新前のID・金額・取引内容を厳密照合し、1件でも食い違えば全件未適用で停止。保存前に端末復旧履歴を作り、再適用は全件無変更です。通常のバックアップ再読込で最新の端末状態を上書きしないでください。
- `card-cycle-v81.js` はSUPERSEDED / SUSPENDED_UNVERIFIEDの旧カード見込額を現行キャッシュフローから除外し、確認済み請求の実績を優先。
- `treasury-ledger-v145.js` は吸収済み現金とカード側チャージの消費計上を防止し、混合払いの購入総額を使用。日本語サブカテゴリ分類v152、v149のPDF修正、v144のJAL/DC PDF重複除外は維持。
- 自動テスト: `tests/cycle-audit-reconciliation-v153.test.js`（受入値、9月/10月日付別、病院二重、チャージ、ATM、元金、iDeCo、残差振替、再適用）および既存のv145/v148/v149/v152の回帰。

## 購入・使用ベースを「支出」の主集計に設定（v157）

- **支出の初期表示は「消費・購入額（利用日ベース）」**。現金・商品券等は `cashExpenses.purchase_total ?? amount`、カード利用は `purchaseEvents.purchase_date/original_amount`、銀行直接消費は `cashTransactions` の実費から一回だけ集計する。支払手段は明細属性であり、費目にしない。
- 通常の消費・生活費、特別費、車ローン元金、iDeCo、その他投資を大分類とし、消費小計・資金用途合計・確認済み収入・収支を同時に表示する。固定費／変動費の承認済みサブカテゴリはドリルダウンに利用する。
- `auditMigrations.period_start/period_end` と `audit_cycle`・`cycle_start/cycle_end`・`provisional_attribution` によって特定済みの監査サイクルへ支出を帰属する。日付なしの現金購入は給与サイクルにのみ帰属させ、暦月や実購入日の捏造をしない。サイクル最終日の新給与は次期収入。
- ATM出金・口座間送金・カード引落は通常支出へ加算しない。引落日ベースの銀行残高管理は、独立した **「口座資金流出（引落日ベース）」** にのみ表示し、収入に対する割合を消費率と呼ばない。
- `NEEDS_REVIEW` や `REVIEW` は明細の警告フラグであり、金額費目の「要確認」にはしない。通常費または特別費と同時に要確認となる。レビュー操作で金額は変えない。
- `reconciliation_disputed_difference` のある銀行手数料は元の銀行明細を削除せず、認定対象と未解決額を分離して表示する。
- 個人のバックアップJSONと実際の取引情報を公開GitHubへコミットしない。v157は既存明細を変更しない表示・集計修正のみ。
- 回帰テスト `tests/purchase-usage-v157.test.js` では、受入数値に一致する**架空の匿名明細**を使い、日付なし・仮記帳・ATM・カード引落・ローン・iDeCo・要確認フラグ・暦月との区別を検証する。既存の台帳・分類・修正パッチのテストも継続。


## v158 固定費・変動費の購入実績分類
- 支出画面の「通常の消費・生活費」を、購入実績ベースの「通常費（固定費）」「通常費（変動費）」「通常費（固定・変動未確定）」に分割。通常費小計は1度だけ表示し、割合グラフの金額には含めない（重複加算しない）。
- サブカテゴリごとの固定/変動/特別費は、従来の v152 ユーザー承認ルールに従い、元の「通常費/特別費」分類と直交して保持する。未分類を変動費に勝手に入れず、見える形で保留する。
- ケースごとの判断が指定されたサブカテゴリで、明細が実在の固定費マスターへ明示リンク済みのときは固定費として区分する。選択済みの「コンタクトは変動費」「駐車場は変動費」等を上書きしない。
- 車ローンとiDeCoは固定性を表示しても、経済区分を維持し、それぞれ債務元金返済と投資として消費小計から分離する。
- 銀行取込時に UNKNOWN/EXPENSE に戻された過去に確認済みの同一受取先は、最新の過去照合済みレコードと支払元/受取先/（ローンなら）金額が一致するときに限って資金移動/債務返済と表示する。銀行原本は書き換えない。
- 添付の個人データはGitHubへ入れず、元取引・銀行残高・二重計上防止を維持。v157の監査済み購入総額は分類表示変更だけでは増減しない。

## v159 混合支払CSV・明細別の固定費／変動費の個別指定

- 「現金支出CSV」と同じ列構成でも、「支払方法」列または内容の末尾の［現金］［クレジット］［PayPay］［交通系IC］を判定する。現金だけ `cashExpenses`、それ以外は `purchaseEvents` に取り込む。カード不明を既知カードへ推測割当しない。
- カードの領収書から取得した購入はカード明細との突合を要する `receipt_reconciliation_pending` を保持。明細取込による自動重複判定が完全ではないため、後からカード明細が来たら候補照合をする。請求が未確定の領収書に対して、引落実績を捏造しない。
- 支出の明細編集で「通常／特別」と独立して「固定費／変動費／未確定／分類ルールに従う」を指定できる。指定は個別明細に保存し、サブカテゴリの既定ルールより優先する。金融上の `economic_type` は変えない。
- **既存の誤取込済み明細の修正**: 「Import → 購入時の支払方法修正（v159）」から、ChatGPT等で生成した専用 `HOUSEHOLD_TREASURY_PAYMENT_RECLASS_V159` JSONを選択。明細の旧ID・日付・内容・金額・元ファイル・支払方法が厳密に一致したときだけ、古い現金明細を除去し購入イベントへ移す。元銀行明細・口座残高・カード請求を変更しない。適用前に端末復旧履歴を作り、再適用は変更なし。
- **通常のバックアップ読込に修正後JSONを渡さないこと**。通常の取込は古い現金明細をマージし直すため、専用パッチで修正する。個人データと修正パッチはGitHubへコミットしない。
- テスト: `node tests/payment-reclass-v159.test.js`（架空の明細のみ）。


## 家族向け変動費共有 v160（ログイン不要・閲覧専用）

- メインアプリ Settings → **家族用・変動費メーター**から、変動費予算を保存し、ランダムな256-bit閲覧URLを作成する。
- 奥さんには `https://rinko0211.github.io/household-treasury/family/#<64桁の秘密トークン>` を送る。奥さんのアカウント作成・ログインは不要。
- 通常の給与サイクル（利用日基準）における変動費、予算残額、カテゴリ別合計、分類未確定額、最終更新だけを共有する。銀行残高・給与・投資・ローン・加盟店原文・個別明細は共有しない。
- メインアプリのクラウド同期が成功した後、既存の利用日台帳・費目区分をローカル集計して、要約のみSupabase Edge Function経由で共有テーブルに送信する。閲覧側は機密の元台帳もログイン用パスワードも受け取らない。
- URLのフラグメント `#` にのみ秘密キーを保持し、閲覧時にHTTPSリクエストの `x-share-token` ヘッダーで送る。秘密トークン本体はDBに保存せずSHA-256ハッシュで照合する。
- ログイン不要の代償として、URLを知る第三者は見られる。URLを失ったとき／漏えいしたときは「リンクを再発行」で旧URLを無効にする。「共有停止」で即時無効化できる。
- v159の支払方法移行が未完了なら、共有額にも未修正・未分類額が残りうる。データ確定までは警告に従う。
- 予算は家計アプリの固定費マスターとは別の、家族共有専用の金額。デフォルトは0円（未設定）であり、現金手渡し額を自動的に予算扱いしない。
- 実行済みSupabaseスキーマ: `public.family_variable_shares`（RLS有効、匿名・認証ユーザー双方に直アクセス権なし）。Edge Function: `family-variable-share`（owner操作はSupabase JWTを検証、閲覧は256bitトークン検証）。
- 共有データは、本人がURLを発行して最初の同期結果を公開するまで存在しない。公開リポジトリにはトークンや家計データをコミットしない。

テスト: `node tests/family-share-v160.test.js`


## 支出画面の整理・明細修正共通窓口（v161）

- 支出画面は新しい月次支出サマリーのみを表示する。旧 v130 支出一覧・編集パネルと、旧9〜10月専用監査サマリーの重複表示を廃止。既存の取引・監査データは削除しない。
- 固定費／変動費／未確定／特別費等の行をタップすると、**その行の直下**に費目別内訳を表示。費目をタップすると、**その費目の直下**に購入日・支払方法・明細編集ボタンを表示。金額は従来の購入日基準・二重計上防止ロジックをそのまま利用。
- `Import → 明細の修正（共通窓口）→ 修正ファイルを読み込む（JSON）` を唯一の修正入口とする。元の銀行・カード・現金CSV/TSVインポートや通常バックアップ読込とは別。
- 過去の支払方法の現金誤分類修正、原本照合済みカード重複修正、期間監査差分修正を、JSONの `format` から自動識別して既存の厳密照合エンジンで処理する。各修正エンジンが持つ安全確認、冪等性、復旧履歴、同期は維持。
- 今後の修正形式は `window.householdUnifiedRepairDeskV161.register({format,label,preview,apply})` に追加する。**新しいインポート欄を増やさない**。
- 専用の旧パッチJSONが必要な場合は引き続き使用できるが、各バージョン専用のインポートカードは表示しない。カード明細PDF取込など通常業務用の画面には変更を加えない。

回帰テスト：`node tests/expense-unified-v148.test.js`、`node tests/unified-repair-v161.test.js`


## v162 — 支出を中カテゴリ → 小カテゴリ → 個別明細に展開

- 「通常費（固定費）」「通常費（変動費）」「未確定」「特別費」などの行を開いた直下に、まず**中カテゴリ（食費、日用品、子ども等）とそれぞれの合計額**を表示する。
- 中カテゴリを開くと、**小カテゴリ（食料品、カフェ、衣類、生活用品等）とその合計額**を表示し、さらに小カテゴリを開くと、**個々の取引日・支払元・金額・編集ボタン**を表示する。
- 以前の緑色の大きなパネルや小カテゴリ別の大型カードを廃止。現行サマリーの暗色基調、細い区切り線、控えめな選択色、45px程度のタップ領域に統一。
- 表示上のグループ化のみを変更し、元取引、費目・小分類、支払方法、利用日基準の集計、固定／変動の判定、二重計上防止処理を一切変更しない。
- `categoryGroups()` は同じ明細を一度ずつ中カテゴリに割り当て、既存 `subgroups()` から小分類を作る。通常費・特別費などの集計合計額とは独立して加算しない。
- テスト `node tests/expense-unified-v148.test.js` では、食費と日用品の例、衣類と生活用品への分解、階層のDOM順序と合計整合を検証。


## v163 — 妻用共有メーターを本体と同じ階層UIに統一

- 妻用の閲覧URL（`/family/#<token>`）、ログイン不要・閲覧専用、予算/残額/変動費の集計方式はそのまま。
- デザインをメインの支出一覧と同じダーク基調・細い区切り線に変更。カテゴリは「**変動費 → 中カテゴリ（例：日用品） → 小カテゴリ（例：衣類・生活用品） → 利用日別の金額**」で開閉可能。
- 中カテゴリ・小カテゴリの集計は本体の `householdExpenseUnifiedV148.usageBuckets()/categoryGroups()` を共有し、明細の再計算や二重計上を行わない。
- 利用日別には日付・金額・件数のみを集約。店舗名、カード情報、明細原文、口座・給与・投資などの機密データは妻用スナップショットに送らない。細目を開いたときも編集はできない。
- Supabaseの既存共有テーブルと暗号化された台帳には変更なし。Edge Functionの `cleanSnapshot` は中カテゴリ/小カテゴリ/日別合計を厳密検算し、登録済みコードから表示ラベルを生成する。未知の自由記述コードを拒否。
- 旧v160の集計だけのスナップショットも表示可能。「最新の変動費を反映」または自動同期後、下位カテゴリを展開できる。**既存の共有URLを再発行する必要はない。**
- GitHub Pagesのページ配信と、独立したSupabase Edge Functionを共に更新する。プライベートな実データはGitHubへ保存しない。

テスト：`node tests/family-share-v160.test.js` と `node tests/family-share-v163.test.js`


## v164 — 妻用画面を明色化／旧形式の自動更新を修復

- 妻用のログイン不要・閲覧専用ページを、白系カード・淡いミント・読みやすい濃色文字に変更。中カテゴリ → 小カテゴリ → 利用日の開閉、給与サイクル予算・残額は維持。
- **原因**: v163導入後に旧版の管理アプリタブが旧形式の共有データを再投稿でき、またクラウド同期がUI初期化後に完了すると、共有の自動送信が行われないことがあった。
- 共有スナップショットに `schema_version: 2` を追加。サーバーは旧版アプリからの `publish` を409で拒否し「管理アプリを再読み込み」と表示。**閲覧時は既存v160のデータ形式も引き続き受信する**ので、既存共有URL・予算・過去の共有行は維持する。
- 管理アプリは、同期の完了イベントを受け取ったときに共有ステータスが未取得なら取得し、すでに共有中だった場合に中・小カテゴリと利用日別合計の新版スナップショットを自動投稿する。タップでの明示的「最新の変動費を反映」も従来どおり可能。
- 旧形式データの妻用閲覧画面では、データが更新されるまで黄色い案内を表示する。
- 共有データはカテゴリー・サブカテゴリー・利用日別件数と金額だけ。店舗名、決済情報、給与、資産、投資、明細IDは送信しない。

**反映方法**：v164のGitHub Pages配信に成功したら、管理アプリを完全に再読み込み（古いタブやホーム画面インスタンスを終了して再起動）し、Settings → 家族用・変動費メーターで「最新の変動費を反映」を1回押す。以降は管理アプリの同期後に自動更新される。閲覧リンクの再発行は不要。

回帰：`tests/family-share-v160.test.js`、`tests/family-share-v163.test.js`、`tests/family-viewer-v163.test.js`、`tests/family-sync-v164.test.js`

 
## v165 — 要確認の明細をその場で編集・解消

- 「要確認」「確認待ち」は、すでに支出に含まれている行の**分類・取込状態の警告**。追加支出でも独立費目でもない。
- 管理アプリ `支出 → 要確認：N件` を開くと、明細ごとに取引日・支払方法・金額と、確認理由（取込時の未確認、固定/変動未確定、通常/特別相違、プリペイドチャージ疑い）を表示する。
- 各明細の「この明細を確認・編集」から、同一の元取引を指す既存の分類編集ダイアログを開く。支出/資金移動、通常/特別、固定/変動、カテゴリ/小カテゴリを保存できる。原本取引を別に作らず、修正前に復旧履歴を記録しクラウド同期する。
- プリペイドチャージ疑いには三択（保留、買い物・支出と確定、チャージ・資金移動と確定）を追加。**保留時は警告を保持**。買い物の確定時だけトップアップ疑いを解除、チャージの確定時は元取引の `economic_type=TRANSFER` とし支出集計から除外する。
- 「未確定・要確認」の個別分類は、固定/変動を実際に選択しない限り警告が残る可能性がある。単なる「保存」だけで曖昧な取引を確定扱いにしない。
- 妻用のログイン不要・閲覧専用の警告には「管理アプリの支出→要確認から編集できる」と案内する。妻用では編集機能を付けない。
- v165では取引の単位・請求引落し・収支集計・バックアップ構造を変更しない。過去データの一括修正は行わない。

Regression: `node tests/expense-unified-v148.test.js`、GitHub Pages配信テスト。


## v166 — JAL PDFと過去CSV/購入記録の重複照合

- JAL/MDCのPDFは、同じPDFの再取込だけでなく、先に読み込んだ家計CSV、カード領収書、旧カード明細や、現金として誤登録された購入とも重複しうる。**ファイル名や元PDFハッシュだけでは判別できない。**
- PDFの「確認して取り込む」前に、既存のCSV・購入記録と**利用日・税込金額**が一致する候補を表示し、警告と確認を求める。購入先が一致しない場合や現金扱いの明細は誤検出の可能性が高く、決して自動的に同一取引と断定しない。
- 既存の `Import → MDC PDF 重複登録の点検` の下に「CSV・購入記録とJAL PDFの重複照合」を置く。入力窓口は増設しない。
- 双方の店舗表記、利用日、金額、カード情報を人が確認し、1対1で選択した組だけ**旧明細側に `count_in_spending=false` と `reconciliation_status=ABSORBED_DUPLICATE` を設定**。JAL PDF側の購入イベントは保持する。
- 元CSV/現金/PDFの原本明細は削除せず、JAL PDFの証跡との対応と照合日を記録する。実データ変更前に復旧スナップショットを作成し、保存後に通常クラウド同期・支出再計算を行う。
- 既存PDFどうしの別カード識別や同じ店舗・同じ金額の本当に別の購入は、人が判断するまで変更しない。別カードの可能性があるときも自動で名寄せしない。
- `purchase-usage-ledger-v157` / `treasury-ledger-v145` がすでに対応している `count_in_spending=false` を使うので、正確に確認できた重複だけ購入日基準支出から除外する。カード請求・銀行引落し・資産残高は一切変更しない。
- 安全テスト: `node tests/mdc-cross-source-v166.test.cjs`。実データに対する自動一括変更は行わない。


## v167 — 明細編集の連続操作・画面位置を保持

- 管理アプリの支出サマリーで中カテゴリ/小カテゴリ/明細を開いて編集・保存するとき、保存後に上部へ戻らず、展開中の行・スクロール位置を維持。
- 取引編集ダイアログに「**保存して次へ**」を追加。現在表示されている明細の次の1件を、一覧に戻らずに編集。元の明細IDを事前確保するため、カテゴリ変更で一覧上の行が移動しても次を失わない。
- 最後の行では「保存して次へ」を隠す。通常の「保存」はダイアログを閉じ、直前の明細位置に復帰。「保存して記憶」は従来どおり。
- 「要確認」のアコーディオンも保存後の再描画で開いた状態を維持する。編集対象が特別費等へ移動した場合、元カテゴリがなくなった場合に限ってそのカテゴリは閉じる。
- 明細タブからの編集でもリスト位置を保持し、次の明細を直接開くことができる。
- 金額、元取引、カード明細、集計定義、資産や支出の計上処理は一切変更しない。従来の復旧履歴と同期を維持。

QA: `node tests/expense-unified-v148.test.js`、`node tests/continuous-transaction-editor-v167.test.cjs`。


## v168 — 支払方法つき16列CSV・JAL PDFの同一購入吸収

- `Import` の既存CSV入力で、`利用日, 店舗, 内容, カテゴリ, 区分, 購入金額_円, 現金支払_円, その他決済_円, 支払方法, カード, 決済識別子末尾, 請求予定日, 取込先, 重複キー, 計上状態, 備考` の**16列構造化CSV**を安全に扱う（新たな独立取込窓口は作らない）。
- `現金` は `cashExpenses`、`QUICPay / MUFG/DC/JAL` は `purchaseEvents` のカード購入（`payment_method=QUICPAY`）として保存。請求予定日（例: 12/10）は未確定予定として記録し、カード引落を新規消費に再加算しない。
- 旧5列CSVでカード購入を現金扱いした場合は、**利用日＋金額＋加盟店**で一意な旧明細だけを二重計上対象外にし、元記録を削除せず新しいカード購入と関連付ける。すでにカード購入または同日付近のJAL PDF明細が存在するならそれを更新して二重登録しない。候補が複数なら自動処理を拒否する。
- 同じ16列CSVを2回以上取り込んでも支出は増えない。現金とカードの支払方法の合計が取引額と一致しないときは取込前に拒否する。
- 将来のJAL PDFで、**購入日±3日・税込金額・加盟店ブランド名・MUFG/DC/JALカード**が一致するQUICPay領収書が一意に存在すれば、新規購入を作らず既存 `purchaseEvents` にPDF証跡（PDF原本ファイル、PDF側利用日、店名、請求月、PDF識別子、明細署名）を追加。元の領収書の購入日・店名・ファイル名は保存する。
- 同じPDFをもう一度読み込んでも、保存したPDF署名から重複と判定し、追加支出は0。**同額・同店の別購入か判定できない場合はMDC-R18で取込を止める**（誤って2回の取引を1件に潰さない）。
- データ更新前に復旧スナップショットを作成。ローカルデータとクラウド同期は従来どおり。実ユーザーのCSV・バックアップ・カード末尾番号・店舗情報はGitHubに保存しない。

テスト：`node tests/structured-payment-and-pdf-v168.test.cjs`。


## v169–170: Modern UI and a household-budget-led card planning model

- v169 modernizes the main app UI and removes the retired expense renderer. Existing users' fixed-payment masters can display debt principal in the recurring outgoing budget without counting it again as economic consumption.
- v170 replaces **historical-mean card baseline suggestions** with a budget-driven workflow: planned shared-family card purchases plus planned travel spending are allocated among cards, then recurring fixed charges actually assigned to each card are added. Card installments and settlements never become new consumption transactions.
- The shared-family budget and three-card allocation are **editable projections, not a hard household spending cap**. Unknown distribution cannot be inferred from old billing history.
- The public repository deliberately contains **no personal income figures, real card budget allocations, receipts or account details**. A per-user JSON file using the `HOUSEHOLD_TREASURY_CARD_BUDGET_PLAN_V170` format can be loaded from Settings. The file stays on the user's device; the resulting private master remains in local encrypted cloud sync.
- Schema: `{format, family_daily_budget, homecoming_card_budget, by_card: {rakuten,jal,dcard}, fixed_projection_overrides?: {masterId: projectedAmount}, fixed_card_assignments?: {masterId: 'rakuten'|'jal'|'dcard'|'direct'}}`. `by_card` must sum to the two family reference budgets; this is a math integrity check, not a spending limit.
- Each card forecast is **allocated family purchases + active monthly ordinary fixed expenses planned for that card**. Settings exposes a future payment-card selector and a projected amount for each recurring fixed master. A selection changes only the forecast (not the source fixed master). Annual expenses, non-consumption transfers and car loan principal are never counted as card consumption. `fixed_projection_overrides` adjust the *projection only*; the original fixed-expense master is unchanged.
- An import/entry only previews the impact. Writing card monthly standard estimates requires explicit confirmation, a recovery snapshot, and usual local/cloud sync. Confirmed bills, explicit month overrides, underlying receipts, settlement history and account balances are preserved. Revolving card configurations and ambiguous card identities block applying recommendations.
- Regression: `node tests/card-budget-allocation-v170.test.cjs`, `node tests/expense-unified-v148.test.js`, plus Pages CI. Settings has one budget-planning panel; outdated historic-mean UI and source removed.


- v170 displays **「固定費・ローン」** as a single usage bucket with both regular fixed consumption and debt principal in its amount. Drilldown separates major categories of ordinary fixed bills from 「ローン・借入返済（消費外）」 and then individual loan lines; the economic consumption subtotal remains unchanged. The monthly reference-budget summary likewise combines the two in one fixed-commitments line, without adding principal twice.
