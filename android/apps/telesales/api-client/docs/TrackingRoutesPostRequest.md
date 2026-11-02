
# TrackingRoutesPostRequest

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **customerIds** | [**kotlin.collections.List&lt;java.util.UUID&gt;**](java.util.UUID.md) |  |  |
| **planDate** | [**java.time.LocalDate**](java.time.LocalDate.md) |  |  [optional] |
| **provider** | [**inline**](#Provider) |  |  [optional] |
| **objective** | [**inline**](#Objective) |  |  [optional] |


<a id="Provider"></a>
## Enum: provider
| Name | Value |
| ---- | ----- |
| provider | neshan, mapir, osrm_selfhosted |


<a id="Objective"></a>
## Enum: objective
| Name | Value |
| ---- | ----- |
| objective | min_duration, min_distance |



