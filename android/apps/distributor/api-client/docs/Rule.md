
# Rule

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **code** | **kotlin.String** |  |  |
| **title** | **kotlin.String** |  |  |
| **entity** | **kotlin.String** |  |  |
| **event** | **kotlin.String** |  |  |
| **effect** | [**inline**](#Effect) |  |  |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **priority** | **kotlin.Int** |  |  [optional] |
| **messageFa** | **kotlin.String** |  |  [optional] |
| **conditions** | [**kotlin.collections.Map&lt;kotlin.String, kotlin.Any&gt;**](kotlin.Any.md) | شرط اجرای قاعده |  [optional] |
| **validFrom** | [**java.time.LocalDate**](java.time.LocalDate.md) |  |  [optional] |
| **validTo** | [**java.time.LocalDate**](java.time.LocalDate.md) |  |  [optional] |
| **isActive** | **kotlin.Boolean** |  |  [optional] |


<a id="Effect"></a>
## Enum: effect
| Name | Value |
| ---- | ----- |
| effect | block, warn |



