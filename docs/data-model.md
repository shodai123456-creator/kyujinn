# データモデル

## 1. 主要エンティティ

| テーブル | 用途 |
| --- | --- |
| `users` | ユーザー基本情報 |
| `auth_credentials` | Passkey公開鍵とカウンター |
| `profiles` | 匿名化済みプロフィール |
| `experiences` | 職歴 |
| `skills` | スキル辞書 |
| `profile_skills` | ユーザーのスキルと経験年数 |
| `preferences` | 希望条件、必須条件、評価重み |
| `sources` | 求人情報源 |
| `connector_policies` | 規約・robots・取得可否の審査記録 |
| `companies` | 企業の正規化情報 |
| `jobs` | 正規化済み求人 |
| `job_sources` | 求人と原文ソースの対応 |
| `job_skills` | 求人の必須・歓迎スキル |
| `job_scores` | 総合点、内訳、確度、評価バージョン |
| `commute_checks` | 茅ヶ崎駅からの確認済み通勤時間 |
| `job_user_states` | 保存・除外・応募状態・メモ |
| `push_subscriptions` | Web Push購読情報 |
| `notifications` | 通知履歴と重複防止 |
| `collection_runs` | 収集実行履歴 |

## 2. `jobs` の主要項目

```text
id
company_id
title
description_normalized
employment_types_json
industry_code
location_text
prefecture
city
nearest_station
remote_policy
relocation_required
salary_min
salary_max
salary_period
work_hours_text
overtime_text
posted_at
expires_at
content_fingerprint
first_seen_at
last_seen_at
status
created_at
updated_at
```

求人原文全体を保存できるかはソースポリシーに従う。保存不可の場合は、必要最小限の正規化項目、短い根拠断片、原文URLだけを保持する。

## 3. `job_scores` の主要項目

```text
id
user_id
job_id
total_score
confidence_score
eligibility_status       # eligible / excluded / needs_review
skill_score
salary_score
content_score
workstyle_score
growth_score
stability_score
commute_score
reasons_json
missing_fields_json
scoring_version
calculated_at
```

## 4. `connector_policies` の主要項目

```text
id
source_id
terms_url
terms_checked_at
robots_url
robots_checked_at
access_mode              # api / feed / public_page / manual_only
personal_use_allowed
public_product_allowed
content_storage_policy   # full / normalized_only / link_only
minimum_interval_seconds
decision                 # approved / rejected / review_required
decision_reason
policy_version
```

コネクタ実行時は `decision = approved` と、現在の利用モードに対応する許可フラグを必須にする。

## 5. 重複判定

優先順に次を使用する。

1. 同一ソースの外部求人ID
2. canonical URL
3. 企業正規化ID＋職種正規化名＋勤務地
4. 説明文の指紋類似度

統合後もすべての原文ソースを `job_sources` に保持し、応募状態は統合求人側へ結び付ける。

## 6. 保持期間

- 求人：掲載終了後12か月を初期値とし変更可能
- 通知履歴：重複防止に必要な期間を保持
- 収集ログ：個人情報を含めず90日
- 履歴書原本：サーバー保持0日
- 削除要求：関連するユーザーデータを論理削除後、バックアップ保持期間内に物理削除

