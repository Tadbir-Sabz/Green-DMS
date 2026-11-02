
# ReturnRequestLinesInner

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **productId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **qty** | [**java.math.BigDecimal**](java.math.BigDecimal.md) |  |  [optional] |
| **batchId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **disposition** | [**inline**](#Disposition) | تعیین تکلیف نهایی کالا (فقط در receive) |  [optional] |


<a id="Disposition"></a>
## Enum: disposition
| Name | Value |
| ---- | ----- |
| disposition | restock, damaged, scrap, return_to_supplier,  |



