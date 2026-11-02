
# StockTake

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **warehouseId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **branchId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **status** | [**inline**](#Status) |  |  [optional] |
| **lines** | [**kotlin.collections.List&lt;StockTakeLinesInner&gt;**](StockTakeLinesInner.md) |  |  [optional] |


<a id="Status"></a>
## Enum: status
| Name | Value |
| ---- | ----- |
| status | draft, counting, review, approved, posted, voided |



