# Orca Pod

stablyai/orca の個人用フォーク。Orca Mobile に island ホームタブを加えたもの。アプリ ID は `com.spade3.orcapod`。ベースブランチは `orcapod`。

## リモートプッシュ通知

届かない。Orca のプッシュ配信サービスは公式の bundle id `com.stably.orca.mobile` 宛てに送るため、このフォークのアプリ ID には届かない。

## 上流への追従

1. Mac の Orca のバージョンを確認する: `orca --version`
2. そのバージョンに対応する上流タグへ `orcapod` を rebase する
3. `mobile/` で island の検証を行う: `pnpm vitest run src/island`、`pnpm lint`、`pnpm typecheck`

## island のコード

`mobile/src/island/` に置く。Hermes に無い配列メソッドは使わない（`toSorted`、`toReversed`、`toSpliced`、`with`）。Node 上のテストは通っても、実機で `undefined is not a function` になるため。

ガードは `mobile/.oxlintrc.json` の `eslint/no-restricted-properties`（island 用の overrides）で、`pnpm lint` が違反を検出する。`scene/`（WebView 内で動く）、`*.generated.ts`、テストは対象外。

## 実機ビルド

```sh
cd mobile
pnpm exec expo prebuild -p ios
xcodebuild ... -allowProvisioningUpdates   # チーム ZXL9PZ4629。自動署名がプッシュ対応のプロファイルを作る
xcrun devicectl device install app ...
```
