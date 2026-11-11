# ごはん計画 — 献立・買い物Webアプリ

公開URL: https://juntainoue.github.io/test/meal-planner/

GitHub Pages向けの静的HTML / CSS / JavaScriptです。公開時のビルド、サーバーAPI、APIキーは不要です。編集対象はこのディレクトリ内に限定します。

## 機能

- 登録済み60品から3日 / 7日分の献立提案、日ごとの交換
- 人数1〜4人、和食 / 洋食 / 中華、辛さ、カロリー・たんぱく質の条件指定
- 1人分の暫定栄養値、人数に応じた材料・買い物数量
- 食材の合算、買い物チェック・コピー・チェック解除
- 料理名・材料検索、手順・保存目安・料理画像
- 既存の `gohan-keikaku-v1` localStorageデータを継続利用

画像の確認: [代表20品プレビュー](IMAGE_PREVIEW.md) / [今回の開発報告](DEVELOPMENT_REPORT.md)

## 構成

| ファイル | 役割 |
| --- | --- |
| `index.html` | 日本語UIと画面の構造 |
| `styles.css` | PC・スマホ向けの表示 |
| `data/recipes.json` | 全60品のレシピ・暫定栄養値・画像メタデータ |
| `js/app.js` | 保存、献立、買い物、画面操作 |
| `js/catalog.js` | データ検証・栄養条件の絞り込み |
| `js/images.js` | 画像の共通表示・遅延読み込み・代替表示 |
| `assets/images/` | 料理画像とプレースホルダー |
| `IMAGE_GUIDE.md` | 画像制作・権利・導入手順 |
| `tests/` | データ・条件・ブラウザ回帰テスト |

## 開発・検証

Node.js 22以降を推奨します。実行環境ではNode.js 24とChromiumを使用しました。

```sh
cd docs/meal-planner
npm ci
npm test
# Chromiumが/usr/bin/chromium以外ならCHROMIUM_PATHで指定
npm run test:browser
```

ブラウザテストはローカルHTTPサーバーを自動起動し、GitHub Pagesと同じ `/test/meal-planner/` 配下で検証します。Playwrightはテスト専用で公開サイトには配信・実行しません。スクリーンショットはgit管理外の `test-results/` に保存します。

手動確認:

```sh
python3 -m http.server 8000 --directory docs
# http://localhost:8000/meal-planner/
```

ES ModulesとJSONのfetchを使用するため、HTMLをfile://で直接開かずHTTP経由で確認してください。

## 100品以上への追加

`data/recipes.json` の `recipes` に同じ構造のレシピを追加します。件数に上限はなく、UI上の件数はデータから表示します。安定した一意の `id` を付け、既存IDは保存データとの互換性のため変更しません。

- `baseServings: 1`：材料・kcal・proteinの基準人数。
- `ingredients`：`[食材名, 数量, 単位, 売場カテゴリ]`。既存データの分量と単位を保持しています。
- `steps`：工程ごとの文字列。具体的な加熱・安全性を別途確認します。
- `nutrition.status: provisional`：現在は全品未検証。`source`、`edition`、`foodCalculations` は将来の食品成分表・食品コード・可食部g・重量変化・油や調味料の計算記録用の予約領域です。計算機能は未実装です。
- 脂質・炭水化物・食塩は不明値を `null` とし、0と表示しません。
- `image.status: pending`：画像未準備。画像と権利の確認後に `ready` に変更します。

追加後は `npm test` と `npm run test:browser` を実行します。100品のテストは複製したテスト用データによる構造検証で、実際の収録数は60品です。収録数変更時はテスト内の期待件数も更新します。

## 制約・次の作業

- 献立は登録済みレシピからの選択です。生成AIによる新規献立生成ではありません。
- 栄養値は食品成分表による未検証の概算です。PFC・予算計算・アレルギー対応は未実装です。
- 一部レシピの手順・調味料・水量は簡易版のままです。調理検証と食品安全確認が必要です。
- 条件一致が日数未満なら料理が重複します。辛口は優先条件で、辛口のみを保証しません。
- 条件に合う候補がない場合、条件を無視した生成はせずメッセージを表示し、直前の献立を保持します。
- 保存は端末・ブラウザ単位です。認証・同期・課金は未実装です。
- 自動検証はChromiumで実施します。iPhone Safari / Androidの実機検証は別途必要です。

## レシピを探す・お気に入り

料理名・食材の複数語検索（空白区切り）、ジャンル、15/20/30分以内の条件を組み合わせられます。調理時間順・たんぱく質順（暫定値）で並べ替えできます。「条件をクリア」で検索条件をまとめて解除します。これらの検索条件は献立作成の条件には影響しません。

料理カードの「♡ お気に入り」で保存し、「お気に入りだけ」で絞り込めます。保存キーは `gohan-keikaku-favorites-v1` です。保存はブラウザごとで、クラウド同期はありません。献立・買い物データの既存保存キーは維持しています。
