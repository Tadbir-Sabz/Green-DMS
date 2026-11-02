
# Tour

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **tourDate** | [**java.time.LocalDate**](java.time.LocalDate.md) |  |  |
| **kind** | [**inline**](#Kind) |  |  |
| **salespersonId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **branchId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **docNumber** | **kotlin.String** |  |  [optional] [readonly] |
| **supervisorId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **routeId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **vehicleId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **warehouseId** | [**java.util.UUID**](java.util.UUID.md) | انبار سیار خودرو |  [optional] |
| **status** | [**inline**](#Status) |  |  [optional] |
| **plannedStartAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] |
| **startedAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] |
| **endedAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] |
| **note** | **kotlin.String** |  |  [optional] |


<a id="Kind"></a>
## Enum: kind
| Name | Value |
| ---- | ----- |
| kind | cold, warm, distribution, telesales |


<a id="Status"></a>
## Enum: status
| Name | Value |
| ---- | ----- |
| status | planned, active, settled, closed |



