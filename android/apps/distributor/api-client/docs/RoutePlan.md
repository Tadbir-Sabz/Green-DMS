
# RoutePlan

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **tourId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **staffId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **planDate** | [**java.time.LocalDate**](java.time.LocalDate.md) |  |  [optional] |
| **provider** | [**inline**](#Provider) |  |  [optional] |
| **objective** | [**inline**](#Objective) |  |  [optional] |
| **stopCount** | **kotlin.Int** |  |  [optional] |
| **totalDistanceM** | **kotlin.Int** |  |  [optional] |
| **totalDurationS** | **kotlin.Int** |  |  [optional] |
| **geometry** | [**GeoLineString**](GeoLineString.md) |  |  [optional] |
| **stops** | [**kotlin.collections.List&lt;RoutePlanStopsInner&gt;**](RoutePlanStopsInner.md) | ترتیب بهینه‌شده توقف‌ها |  [optional] |


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



