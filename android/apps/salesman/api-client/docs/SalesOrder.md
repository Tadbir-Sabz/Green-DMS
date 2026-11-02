
# SalesOrder

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **customerId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **orderDate** | [**java.time.LocalDate**](java.time.LocalDate.md) |  |  |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **branchId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **docNumber** | **kotlin.String** |  |  [optional] [readonly] |
| **fiscalYear** | **kotlin.Int** |  |  [optional] [readonly] |
| **requestId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **salespersonId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **tourId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **channel** | [**inline**](#Channel) |  |  [optional] |
| **deliveryDate** | [**java.time.LocalDate**](java.time.LocalDate.md) |  |  [optional] |
| **priceListId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **subtotal** | **kotlin.String** |  |  [optional] [readonly] |
| **discountTotal** | **kotlin.String** |  |  [optional] [readonly] |
| **taxTotal** | **kotlin.String** |  |  [optional] [readonly] |
| **grandTotal** | **kotlin.String** |  |  [optional] [readonly] |
| **settlementTermId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **status** | [**inline**](#Status) |  |  [optional] |
| **approvalRequestId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **note** | **kotlin.String** |  |  [optional] |
| **clientUuid** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **lines** | [**kotlin.collections.List&lt;SalesOrderLinesInner&gt;**](SalesOrderLinesInner.md) |  |  [optional] |


<a id="Channel"></a>
## Enum: channel
| Name | Value |
| ---- | ----- |
| channel | field, telesale, portal, walk_in |


<a id="Status"></a>
## Enum: status
| Name | Value |
| ---- | ----- |
| status | draft, pending_approval, approved, partially_delivered, delivered, invoiced, cancelled, rejected |



