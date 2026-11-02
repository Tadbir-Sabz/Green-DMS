
# ProductCreate

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **code** | **kotlin.String** |  |  |
| **name** | **kotlin.String** |  |  |
| **categoryId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **baseUomId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **brandId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **taxCodeId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **isBatchTracked** | **kotlin.Boolean** |  |  [optional] |
| **isExpiryTracked** | **kotlin.Boolean** |  |  [optional] |
| **shelfLifeDays** | **kotlin.Int** | فقط برای کالای انقضادار |  [optional] |
| **isReturnableContainer** | **kotlin.Boolean** |  |  [optional] |
| **requiresPermit** | **kotlin.Boolean** |  |  [optional] |
| **distributionKind** | [**inline**](#DistributionKind) |  |  [optional] |
| **minOrderQty** | [**java.math.BigDecimal**](java.math.BigDecimal.md) |  |  [optional] |
| **weightGr** | **kotlin.Int** |  |  [optional] |
| **volumeCm3** | **kotlin.Int** |  |  [optional] |


<a id="DistributionKind"></a>
## Enum: distribution_kind
| Name | Value |
| ---- | ----- |
| distributionKind | cold, warm, both |



