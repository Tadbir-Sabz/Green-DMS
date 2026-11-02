
# Customer

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **personId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **code** | **kotlin.String** |  |  |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **branchId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **areaId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **routeId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **salespersonId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **channel** | **kotlin.String** | کانال فروش (سرد/گرم/پورتال) |  [optional] |
| **priceListId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **settlementTermId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **visitSequence** | **kotlin.Int** | ترتیب در مسیر |  [optional] |
| **geo** | [**GeoPoint**](GeoPoint.md) |  |  [optional] |
| **geoAccuracyM** | [**java.math.BigDecimal**](java.math.BigDecimal.md) |  |  [optional] |
| **geoSource** | [**inline**](#GeoSource) |  |  [optional] |
| **geoCapturedAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] [readonly] |
| **creditLimit** | **kotlin.String** | سقف اعتبار (رشته اعشاری) |  [optional] |
| **status** | [**inline**](#Status) |  |  [optional] |
| **createdAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] [readonly] |


<a id="GeoSource"></a>
## Enum: geo_source
| Name | Value |
| ---- | ----- |
| geoSource | gps, map_pick, geocode, import |


<a id="Status"></a>
## Enum: status
| Name | Value |
| ---- | ----- |
| status | active, suspended, blocked, closed |



