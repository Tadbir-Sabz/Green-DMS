# IntegrationsApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**integrationsGet**](IntegrationsApi.md#integrationsGet) | **GET** /integrations | وضعیت یکپارچه‌سازی‌ها (مؤدیان، پوز، پیامک، درگاه) |
| [**integrationsKeyTestPost**](IntegrationsApi.md#integrationsKeyTestPost) | **POST** /integrations/{key}/test | آزمون اتصال سرویس بیرونی (فقط ادمین) |


<a id="integrationsGet"></a>
# **integrationsGet**
> IntegrationsGet200Response integrationsGet()

وضعیت یکپارچه‌سازی‌ها (مؤدیان، پوز، پیامک، درگاه)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = IntegrationsApi()
try {
    val result : IntegrationsGet200Response = apiInstance.integrationsGet()
    println(result)
} catch (e: ClientException) {
    println("4xx response calling IntegrationsApi#integrationsGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling IntegrationsApi#integrationsGet")
    e.printStackTrace()
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**IntegrationsGet200Response**](IntegrationsGet200Response.md)

### Authorization


Configure bearerAuth statically:
```kotlin
ApiClient.accessToken = ""
```
Configure bearerAuth dynamically:
```kotlin
apiInstance.accessTokenProvider = { "" }
```

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

<a id="integrationsKeyTestPost"></a>
# **integrationsKeyTestPost**
> IntegrationStatus integrationsKeyTestPost(key)

آزمون اتصال سرویس بیرونی (فقط ادمین)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = IntegrationsApi()
val key : kotlin.String = key_example // kotlin.String | 
try {
    val result : IntegrationStatus = apiInstance.integrationsKeyTestPost(key)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling IntegrationsApi#integrationsKeyTestPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling IntegrationsApi#integrationsKeyTestPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **key** | **kotlin.String**|  | [enum: moadian, pos, sms, gateway] |

### Return type

[**IntegrationStatus**](IntegrationStatus.md)

### Authorization


Configure bearerAuth statically:
```kotlin
ApiClient.accessToken = ""
```
Configure bearerAuth dynamically:
```kotlin
apiInstance.accessTokenProvider = { "" }
```

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

