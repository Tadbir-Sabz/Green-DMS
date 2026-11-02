
# ProductUpdate

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **code** | **kotlin.String** |  |  [optional] |
| **name** | **kotlin.String** |  |  [optional] |
| **categoryId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **brandId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **baseUomId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **taxCodeId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **isBatchTracked** | **kotlin.Boolean** |  |  [optional] |
| **isExpiryTracked** | **kotlin.Boolean** |  |  [optional] |
| **shelfLifeDays** | **kotlin.Int** |  |  [optional] |
| **isReturnableContainer** | **kotlin.Boolean** |  |  [optional] |
| **requiresPermit** | **kotlin.Boolean** |  |  [optional] |
| **distributionKind** | [**inline**](#DistributionKind) |  |  [optional] |
| **minOrderQty** | [**java.math.BigDecimal**](java.math.BigDecimal.md) |  |  [optional] |
| **weightGr** | **kotlin.Int** |  |  [optional] |
| **volumeCm3** | **kotlin.Int** |  |  [optional] |
| **status** | [**inline**](#Status) |  |  [optional] |
| **rowVersion** | **kotlin.Int** | قفل خوش‌بینانه — مقدار فرستاده‌شده باید با مقدار فعلی سرور یکی باشد |  [optional] |


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



