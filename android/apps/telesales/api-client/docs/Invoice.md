
# Invoice

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **customerId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **invoiceDate** | [**java.time.LocalDate**](java.time.LocalDate.md) |  |  |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **branchId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **docNumber** | **kotlin.String** |  |  [optional] [readonly] |
| **fiscalYear** | **kotlin.Int** |  |  [optional] [readonly] |
| **salesOrderId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **waybillId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **dueDate** | [**java.time.LocalDate**](java.time.LocalDate.md) |  |  [optional] |
| **subtotal** | **kotlin.String** |  |  [optional] [readonly] |
| **discountTotal** | **kotlin.String** |  |  [optional] [readonly] |
| **taxTotal** | **kotlin.String** |  |  [optional] [readonly] |
| **grandTotal** | **kotlin.String** |  |  [optional] [readonly] |
| **paidAmount** | **kotlin.String** |  |  [optional] [readonly] |
| **status** | [**inline**](#Status) |  |  [optional] |
| **returnStatus** | [**inline**](#ReturnStatus) |  |  [optional] |
| **moadianStatus** | [**inline**](#MoadianStatus) |  |  [optional] |
| **lines** | [**kotlin.collections.List&lt;InvoiceLinesInner&gt;**](InvoiceLinesInner.md) |  |  [optional] |


<a id="Status"></a>
## Enum: status
| Name | Value |
| ---- | ----- |
| status | draft, posted, partially_paid, paid, voided |


<a id="ReturnStatus"></a>
## Enum: return_status
| Name | Value |
| ---- | ----- |
| returnStatus | none, partial, full,  |


<a id="MoadianStatus"></a>
## Enum: moadian_status
| Name | Value |
| ---- | ----- |
| moadianStatus | not_sent, queued, sent, accepted, rejected, corrected,  |



