
# Visit

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **tourId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **customerId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **checkInAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] |
| **checkOutAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] |
| **geoIn** | [**GeoPoint**](GeoPoint.md) |  |  [optional] |
| **geoOut** | [**GeoPoint**](GeoPoint.md) |  |  [optional] |
| **accuracyInM** | [**java.math.BigDecimal**](java.math.BigDecimal.md) |  |  [optional] |
| **distanceM** | **kotlin.String** | فاصله از موقعیت ثبت‌شده مشتری (متر) |  [optional] |
| **result** | [**inline**](#Result) |  |  [optional] |
| **noOrderReason** | **kotlin.String** |  |  [optional] |
| **isMocked** | **kotlin.Boolean** | GPS جعلی تشخیص داده شد |  [optional] [readonly] |
| **clientUuid** | [**java.util.UUID**](java.util.UUID.md) | یکتای آفلاین — ثبت تکراری &#x3D; 409 |  [optional] |


<a id="Result"></a>
## Enum: result
| Name | Value |
| ---- | ----- |
| result | ordered, no_order, customer_absent,  |



