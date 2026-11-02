
# Product

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [readonly] |
| **code** | **kotlin.String** |  |  |
| **name** | **kotlin.String** |  |  |
| **categoryId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **baseUomId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **isBatchTracked** | **kotlin.Boolean** |  |  |
| **isExpiryTracked** | **kotlin.Boolean** |  |  |
| **isReturnableContainer** | **kotlin.Boolean** | کالای برگشت‌پذیر (بشکه/سیلندر) |  |
| **requiresPermit** | **kotlin.Boolean** |  |  |
| **distributionKind** | [**inline**](#DistributionKind) | نوع توزیع (سرد/گرم/هر دو) |  |
| **minOrderQty** | [**java.math.BigDecimal**](java.math.BigDecimal.md) | حداقل سفارش (رشته اعشاری از دیتابیس به عدد سریالایز می‌شود) |  |
| **status** | [**inline**](#Status) |  |  |
| **createdAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [readonly] |
| **rowVersion** | **kotlin.Int** | قفل خوش‌بینانه — PATCH با این مقدار مغایرت &#x3D; 409 version_conflict |  [readonly] |
| **brandId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **taxCodeId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **shelfLifeDays** | **kotlin.Int** | null یعنی کالای انقضادار نیست |  [optional] |
| **weightGr** | **kotlin.Int** |  |  [optional] |
| **volumeCm3** | **kotlin.Int** |  |  [optional] |


<a id="DistributionKind"></a>
## Enum: distribution_kind
| Name | Value |
| ---- | ----- |
| distributionKind | cold, warm, both |


<a id="Status"></a>
## Enum: status
| Name | Value |
| ---- | ----- |
| status | active, blocked, discontinued |



