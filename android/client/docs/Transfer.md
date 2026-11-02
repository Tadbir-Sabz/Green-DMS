
# Transfer

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **fromWarehouseId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **toWarehouseId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **docNumber** | **kotlin.String** |  |  [optional] [readonly] |
| **status** | [**inline**](#Status) |  |  [optional] |
| **lines** | [**kotlin.collections.List&lt;TransferLinesInner&gt;**](TransferLinesInner.md) |  |  [optional] |


<a id="Status"></a>
## Enum: status
| Name | Value |
| ---- | ----- |
| status | draft, approved, in_transit, received, voided |



