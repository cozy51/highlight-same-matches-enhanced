# Highlight Same Matches Enhanced 1.0.0

Obsidianで選択した文字列と同じ文字列を、開いているノートの本文とMarkdownの表で強調表示します。ライブプレビュー、ソースモード、閲覧モードに対応する設計です。

## インストール

1. ZIPを展開し、`highlight-same-matches-enhanced` フォルダを保管庫の `.obsidian/plugins/` にコピーします。フォルダの直下に `main.js`、`manifest.json`、`styles.css` があることを確認してください。
2. Obsidianを再起動します。
3. **設定 → コミュニティプラグイン**で、従来の **Highlight Same Matches** を無効にしてから **Highlight Same Matches Enhanced** を有効にします。

プラグインIDは `highlight-same-matches-enhanced` です。従来版（`highlight-matches`）とは別フォルダで管理します。

## 使い方

本文または表セルで文字列を選択すると、同じ文字列が薄い黄色で強調されます。選択元は選択表示と下線で区別します。選択を解除すると強調表示が消えます。ハイライト操作によるMarkdownファイルへの書き込みはありません。

| 設定 | 初期値 |
| --- | --- |
| ハイライトの背景色 | 薄い黄色 `#ffec99` |
| ハイライトの文字色 | 濃い茶色 `#211900` |
| 背景色の不透明度 | 85% |
| 最小選択文字数 | 2文字 |
| 大文字・小文字を区別する | オン |
| 完全な単語のみ一致させる | オン |
| 表内のハイライト | オン |
| 閲覧モードのハイライト | オン |

「完全な単語のみ」の判定では、Unicodeの文字、数字、結合記号、アンダースコアなどを単語の構成要素として扱います。日本語の文章中に連続して現れる語句や部品番号の一部も拾いたい場合は、この設定をオフにしてください。検索時に選択範囲の前後の空白を取り除き、括弧やプラスなどをそのままの文字として扱います。

## 確認用ノート

以下をテスト用ノートに貼り付け、表中の `Z067715030` をセル編集中にドラッグして選択します。選択元の1箇所、表の残り2箇所、本文2箇所が強調されます。本文から選択した場合や、ソースモードと閲覧モードに切り替えた場合も同様に確認できます。

~~~markdown
| No. | 部品番号   | 部品名称               |
| --- | ---------- | ---------------------- |
| 1   | Z067715030 | SW(PH) EX13A           |
| 2   | HJ1TA03741 | ASSY Sensor            |
| 3   | Z067715030 | SW(PH) EX13A           |
| 4   | HJ1TA04241 | ASSY Belt Loose Sensor |
| 5   | Z067715030 | SW(PH) EX13A           |

Z067715030

Z067715030
~~~

## ビルドと検証

GitHubリポジトリは [cozy51/highlight-same-matches-enhanced](https://github.com/cozy51/highlight-same-matches-enhanced) です。Node.js 24で確認しました。

~~~sh
npm ci
npm run build
npm test
~~~

`npm run build` は型を検査して `main.js` を生成します。`npm test` はビルド後に、Obsidianの表示構造を模したDOMで、本文・表セルの双方からの5箇所一致、編集中のセルの重複回避、遅延表示された行、設定切り替え、選択解除、ノート切り替えと無効化を検証します。DOMテストではObsidian API、CodeMirrorの更新通知、CSS Custom Highlightの登録機能を模擬しています。

## 実装と既知の制約

[Highlight Same Matches v1.0.4](https://github.com/ivgittest/Highlight-Same-Matches/tree/1.0.4) のMITライセンスと実装を調べました。従来版はメインエディターのMarkdownソースを検索し、CodeMirrorの `Decoration.mark` をソース上の位置に付けます。Obsidian 1.8.10のライブプレビューでは、表はブロックのウィジェットとして描画され、編集中のセルには別のCodeMirrorエディターが置かれます。

このプラグインは、表示されたテキストから一致範囲を求め、CSS Custom Highlight APIで描画します。CodeMirrorの更新とDOMの追加・置換を監視するので、画面外の行は描画された時点で強調されます。テキストに要素を挿入しないため、ハイライト自体はセルの幅や行高、フォーカスを変更しません。従来版のコードは再利用せず、新規に実装しています。

- 検索は表示中のノート本文が対象です。複数セル、複数段落やソース行をまたぐ文字列の照合と、別ノートの埋め込みは対象外です。
- 表を複数セルまとめて選択するObsidianの操作は、セル内の文字範囲を選択する操作と異なります。セル内を編集状態にして文字列を選択してください。
- CSS Custom Highlight APIが利用できるObsidian環境が必要です。Obsidian側の表のDOM構造が変わると、対応を見直す必要があります。
- 実機のObsidianは検証環境の制約で起動できなかったため、Minimalテーマでの実際の描画、マウスでの選択、スクロール、表編集とコピー・貼り付け、モバイルは未検証です。
