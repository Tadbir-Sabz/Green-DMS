
# ApprovalRequest

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **entityType** | **kotlin.String** |  |  [optional] |
| **entityId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **amount** | **kotlin.String** |  |  [optional] |
| **status** | [**inline**](#Status) |  |  [optional] |
| **currentStep** | **kotlin.Int** |  |  [optional] |
| **requestedBy** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **createdAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] |
| **closedAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] |
| **steps** | [**kotlin.collections.List&lt;ApprovalRequestStepsInner&gt;**](ApprovalRequestStepsInner.md) |  |  [optional] |


<a id="Status"></a>
## Enum: status
| Name | Value |
| ---- | ----- |
| status | pending, approved, rejected |



