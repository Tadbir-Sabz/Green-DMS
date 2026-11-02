
# Cheque

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **direction** | [**inline**](#Direction) |  |  |
| **amount** | **kotlin.String** |  |  |
| **dueDate** | [**java.time.LocalDate**](java.time.LocalDate.md) |  |  |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **personId** | [**java.util.UUID**](java.util.UUID.md) | صادرکننده/گیرنده |  [optional] |
| **bankAccountId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **chequeNumber** | **kotlin.String** |  |  [optional] |
| **bankName** | **kotlin.String** |  |  [optional] |
| **status** | [**inline**](#Status) |  |  [optional] |
| **clearedAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] |


<a id="Direction"></a>
## Enum: direction
| Name | Value |
| ---- | ----- |
| direction | received, issued |


<a id="Status"></a>
## Enum: status
| Name | Value |
| ---- | ----- |
| status | pending, cleared, bounced, returned |



