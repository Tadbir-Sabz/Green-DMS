
# Staff

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **personId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **branchId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **jobPositionCode** | **kotlin.String** |  |  [optional] |
| **employeeNo** | **kotlin.String** |  |  [optional] |
| **hireDate** | [**java.time.LocalDate**](java.time.LocalDate.md) |  |  [optional] |
| **supervisorId** | [**java.util.UUID**](java.util.UUID.md) | نسبت فروشنده به سرپرست |  [optional] |
| **vehicleId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **isField** | **kotlin.Boolean** | آیا میدانی است (رهگیری/تور) |  [optional] |
| **areaIds** | [**kotlin.collections.List&lt;java.util.UUID&gt;**](java.util.UUID.md) | حوزه‌های مجاز کار |  [optional] |
| **status** | [**inline**](#Status) |  |  [optional] |
| **createdAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] [readonly] |


<a id="Status"></a>
## Enum: status
| Name | Value |
| ---- | ----- |
| status | active, inactive |



