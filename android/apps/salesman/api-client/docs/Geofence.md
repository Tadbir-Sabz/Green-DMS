
# Geofence

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **name** | **kotlin.String** |  |  |
| **kind** | [**inline**](#Kind) |  |  |
| **area** | [**GeoPolygon**](GeoPolygon.md) |  |  |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **branchId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **customerId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **warehouseId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **isActive** | **kotlin.Boolean** |  |  [optional] |


<a id="Kind"></a>
## Enum: kind
| Name | Value |
| ---- | ----- |
| kind | area, customer, warehouse |



