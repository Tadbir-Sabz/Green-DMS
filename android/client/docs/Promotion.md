
# Promotion

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **code** | **kotlin.String** |  |  |
| **title** | **kotlin.String** |  |  |
| **kind** | [**inline**](#Kind) |  |  |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **validFrom** | [**java.time.LocalDate**](java.time.LocalDate.md) |  |  [optional] |
| **validTo** | [**java.time.LocalDate**](java.time.LocalDate.md) |  |  [optional] |
| **priority** | **kotlin.Int** |  |  [optional] |
| **allowStacking** | **kotlin.Boolean** |  |  [optional] |
| **maxDiscountAmount** | **kotlin.String** |  |  [optional] |
| **maxPerCustomerPerDay** | **kotlin.String** |  |  [optional] |
| **conditions** | [**kotlin.collections.Map&lt;kotlin.String, kotlin.Any&gt;**](kotlin.Any.md) | شرایط احراز (کالا/کانال/حداقل مبلغ) |  [optional] |
| **benefit** | [**kotlin.collections.Map&lt;kotlin.String, kotlin.Any&gt;**](kotlin.Any.md) | منفعت (درصد/مبلغ/کالای جایزه) |  [optional] |
| **isActive** | **kotlin.Boolean** |  |  [optional] |


<a id="Kind"></a>
## Enum: kind
| Name | Value |
| ---- | ----- |
| kind | percent_line, amount_line, bundle, buy_x_get_y, gift_item, cash_discount, repeat_order, coupon, volume_tier |



