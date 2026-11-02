
# Delivery

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **waybillId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **plannedDate** | [**java.time.LocalDate**](java.time.LocalDate.md) |  |  |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **branchId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **docNumber** | **kotlin.String** |  |  [optional] [readonly] |
| **tourId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **courierStaffId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **status** | [**inline**](#Status) |  |  [optional] |
| **deliveredAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] |
| **failureReason** | **kotlin.String** |  |  [optional] |
| **receiverName** | **kotlin.String** | نام امضاکننده |  [optional] |
| **signatureUrl** | [**java.net.URI**](java.net.URI.md) |  |  [optional] |
| **photoUrl** | [**java.net.URI**](java.net.URI.md) | عکس ممیزی تحویل |  [optional] |


<a id="Status"></a>
## Enum: status
| Name | Value |
| ---- | ----- |
| status | planned, dispatched, delivered, partial, failed, cancelled |



