
# Warehouse

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **code** | **kotlin.String** |  |  |
| **name** | **kotlin.String** |  |  |
| **kind** | [**inline**](#Kind) |  |  |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **branchId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **parentWarehouseId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **vehicleId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **areaId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **allowNegative** | **kotlin.Boolean** |  |  [optional] |
| **isActive** | **kotlin.Boolean** |  |  [optional] |


<a id="Kind"></a>
## Enum: kind
| Name | Value |
| ---- | ----- |
| kind | main, vehicle, transit, damaged, quarantine, consignment |



