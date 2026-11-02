
# CustomerRequest

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **customerId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **channel** | [**inline**](#Channel) |  |  |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **branchId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **requestedBy** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **tourId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **requestDate** | [**java.time.LocalDate**](java.time.LocalDate.md) |  |  [optional] |
| **requestedDeliveryDate** | [**java.time.LocalDate**](java.time.LocalDate.md) |  |  [optional] |
| **note** | **kotlin.String** |  |  [optional] |
| **status** | [**inline**](#Status) |  |  [optional] |
| **salesOrderId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **clientUuid** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |


<a id="Channel"></a>
## Enum: channel
| Name | Value |
| ---- | ----- |
| channel | field, telesale, portal, walk_in |


<a id="Status"></a>
## Enum: status
| Name | Value |
| ---- | ----- |
| status | draft, submitted, converted, rejected, cancelled |



