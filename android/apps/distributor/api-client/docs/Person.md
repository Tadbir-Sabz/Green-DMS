
# Person

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **code** | **kotlin.String** | کد شخص در شرکت (قید یکتای company_id+code) |  |
| **legalType** | [**inline**](#LegalType) |  |  |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **firstName** | **kotlin.String** | برای شخص حقیقی |  [optional] |
| **lastName** | **kotlin.String** | برای شخص حقیقی |  [optional] |
| **legalName** | **kotlin.String** | برای شخص حقوقی (legal) |  [optional] |
| **nationalId** | **kotlin.String** |  |  [optional] |
| **economicCode** | **kotlin.String** | برای شخص حقوقی |  [optional] |
| **isActive** | **kotlin.Boolean** |  |  [optional] |
| **createdAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] [readonly] |


<a id="LegalType"></a>
## Enum: legal_type
| Name | Value |
| ---- | ----- |
| legalType | natural, legal |



