# SettingsApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**settingsGet**](SettingsApi.md#settingsGet) | **GET** /settings | تنظیمات مؤثر (عمومی + تفکیکی هر حوزه/شعبه) |
| [**settingsPatch**](SettingsApi.md#settingsPatch) | **PATCH** /settings | به‌روزرسانی تنظیمات (حوزه‌ها فقط برای خودشان) |


<a id="settingsGet"></a>
# **settingsGet**
> SettingsGet200Response settingsGet(scopeType, scopeId)

تنظیمات مؤثر (عمومی + تفکیکی هر حوزه/شعبه)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = SettingsApi()
val scopeType : kotlin.String = scopeType_example // kotlin.String | 
val scopeId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : SettingsGet200Response = apiInstance.settingsGet(scopeType, scopeId)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling SettingsApi#settingsGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling SettingsApi#settingsGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **scopeType** | **kotlin.String**|  | [optional] [enum: global, company, branch, area] |
| **scopeId** | **java.util.UUID**|  | [optional] |

### Return type

[**SettingsGet200Response**](SettingsGet200Response.md)

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

<a id="settingsPatch"></a>
# **settingsPatch**
> SettingsGet200Response settingsPatch(settingsPatchRequest)

به‌روزرسانی تنظیمات (حوزه‌ها فقط برای خودشان)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = SettingsApi()
val settingsPatchRequest : SettingsPatchRequest =  // SettingsPatchRequest | 
try {
    val result : SettingsGet200Response = apiInstance.settingsPatch(settingsPatchRequest)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling SettingsApi#settingsPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling SettingsApi#settingsPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **settingsPatchRequest** | [**SettingsPatchRequest**](SettingsPatchRequest.md)|  | |

### Return type

[**SettingsGet200Response**](SettingsGet200Response.md)

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

 - **Content-Type**: application/json
 - **Accept**: application/json

