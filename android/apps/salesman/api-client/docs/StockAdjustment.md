
# StockAdjustment

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **warehouseId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **productId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **qtyDelta** | [**java.math.BigDecimal**](java.math.BigDecimal.md) |  |  |
| **reasonCode** | [**inline**](#ReasonCode) |  |  |
| **batchId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **note** | **kotlin.String** |  |  [optional] |


<a id="ReasonCode"></a>
## Enum: reason_code
| Name | Value |
| ---- | ----- |
| reasonCode | damage, expiry, sample, internal_use, theft, count_fix, other |



