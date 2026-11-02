
# Device

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [readonly] |
| **deviceUuid** | **kotlin.String** | شناسه سخت‌افزاری/نصب اپ (از سوی اپ ارسال می‌شود) |  |
| **platform** | [**inline**](#Platform) |  |  |
| **appKind** | [**inline**](#AppKind) |  |  |
| **isTrusted** | **kotlin.Boolean** | با تأیید کد پیامکی (device_bind) true می‌شود؛ تا آن زمان دستگاه مجاز نیست |  |
| **createdAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [readonly] |
| **appVersion** | **kotlin.String** |  |  [optional] |
| **osVersion** | **kotlin.String** |  |  [optional] |
| **pushToken** | **kotlin.String** |  |  [optional] |
| **lastSeenAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] |
| **revokedAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) | باطل‌شده؟ null یعنی فعال؛ ردیف برای ممیزی می‌ماند |  [optional] |


<a id="Platform"></a>
## Enum: platform
| Name | Value |
| ---- | ----- |
| platform | android |


<a id="AppKind"></a>
## Enum: app_kind
| Name | Value |
| ---- | ----- |
| appKind | sales, delivery, telesales |



