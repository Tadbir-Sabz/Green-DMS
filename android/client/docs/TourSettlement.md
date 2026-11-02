
# TourSettlement

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **tourId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **expectedCash** | **kotlin.String** | مجموع وصول‌های نقدی تور |  [optional] |
| **receivedCash** | **kotlin.String** | نقد واقعاً تحویلی موزع |  [optional] |
| **varianceAmount** | **kotlin.String** | مغایرت (مثبت&#x3D;کسری) |  [optional] |
| **commissionTotal** | **kotlin.String** | پورسانت محاسبه‌شده |  [optional] |
| **status** | [**inline**](#Status) |  |  [optional] |


<a id="Status"></a>
## Enum: status
| Name | Value |
| ---- | ----- |
| status | open, reconciled, closed |



