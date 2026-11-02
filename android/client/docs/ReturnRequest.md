
# ReturnRequest

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **customerId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **reasonCode** | [**inline**](#ReasonCode) |  |  |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **branchId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **docNumber** | **kotlin.String** |  |  [optional] [readonly] |
| **invoiceId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **tourId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **status** | [**inline**](#Status) |  |  [optional] |
| **creditNoteId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **requestedAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] [readonly] |
| **approvedAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] [readonly] |
| **note** | **kotlin.String** |  |  [optional] |
| **lines** | [**kotlin.collections.List&lt;ReturnRequestLinesInner&gt;**](ReturnRequestLinesInner.md) |  |  [optional] |


<a id="ReasonCode"></a>
## Enum: reason_code
| Name | Value |
| ---- | ----- |
| reasonCode | damaged, expired, wrong_item, shortage, customer_refusal, promotion_error, other |


<a id="Status"></a>
## Enum: status
| Name | Value |
| ---- | ----- |
| status | draft, submitted, approved, partially_approved, rejected, posted, closed |



