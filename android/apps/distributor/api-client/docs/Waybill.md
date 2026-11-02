
# Waybill

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **salesOrderId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **warehouseId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **branchId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **docNumber** | **kotlin.String** |  |  [optional] [readonly] |
| **fiscalYear** | **kotlin.Int** |  |  [optional] [readonly] |
| **customerId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **issuedAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] [readonly] |
| **status** | [**inline**](#Status) |  |  [optional] |
| **note** | **kotlin.String** |  |  [optional] |
| **lines** | [**kotlin.collections.List&lt;WaybillLinesInner&gt;**](WaybillLinesInner.md) |  |  [optional] |


<a id="Status"></a>
## Enum: status
| Name | Value |
| ---- | ----- |
| status | draft, issued, delivered, voided |



