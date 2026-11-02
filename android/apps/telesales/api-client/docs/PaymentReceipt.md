
# PaymentReceipt

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **customerId** | [**java.util.UUID**](java.util.UUID.md) |  |  |
| **methodId** | [**java.util.UUID**](java.util.UUID.md) | از &#x60;payment_method&#x60; (نقد/کارت/چک/…) |  |
| **amount** | **kotlin.String** |  |  |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **docNumber** | **kotlin.String** |  |  [optional] [readonly] |
| **paidAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] |
| **posTerminalId** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] |
| **reference** | **kotlin.String** | شماره پیگیری/تراکنش |  [optional] |
| **allocations** | [**kotlin.collections.List&lt;PaymentReceiptAllocationsInner&gt;**](PaymentReceiptAllocationsInner.md) |  |  [optional] |
| **tourId** | [**java.util.UUID**](java.util.UUID.md) | برای تسویه تور |  [optional] |



