# StaffApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**staffGet**](StaffApi.md#staffGet) | **GET** /staff | فهرست پرسنل (ویزیتور سرد/گرم، موزع، انباردار…) با فیلتر سمت و سرپرست |
| [**staffIdGet**](StaffApi.md#staffIdGet) | **GET** /staff/{id} | جزئیات پرسنل |
| [**staffIdPatch**](StaffApi.md#staffIdPatch) | **PATCH** /staff/{id} | به‌روزرسانی پرسنل (تغییر سرپرست، وسیله، حوزه) |
| [**staffPost**](StaffApi.md#staffPost) | **POST** /staff | تعریف پرسنل (نسبت‌دادن شخص به سمت و سرپرست) |


<a id="staffGet"></a>
# **staffGet**
> StaffGet200Response staffGet(cursor, limit, jobPositionCode, supervisorId, isField)

فهرست پرسنل (ویزیتور سرد/گرم، موزع، انباردار…) با فیلتر سمت و سرپرست

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = StaffApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val jobPositionCode : kotlin.String = jobPositionCode_example // kotlin.String | 
val supervisorId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val isField : kotlin.Boolean = true // kotlin.Boolean | فقط میدانی‌ها
try {
    val result : StaffGet200Response = apiInstance.staffGet(cursor, limit, jobPositionCode, supervisorId, isField)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling StaffApi#staffGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling StaffApi#staffGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **jobPositionCode** | **kotlin.String**|  | [optional] |
| **supervisorId** | **java.util.UUID**|  | [optional] |
| **isField** | **kotlin.Boolean**| فقط میدانی‌ها | [optional] |

### Return type

[**StaffGet200Response**](StaffGet200Response.md)

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

<a id="staffIdGet"></a>
# **staffIdGet**
> Staff staffIdGet(id)

جزئیات پرسنل

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = StaffApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : Staff = apiInstance.staffIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling StaffApi#staffIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling StaffApi#staffIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**Staff**](Staff.md)

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

<a id="staffIdPatch"></a>
# **staffIdPatch**
> Staff staffIdPatch(id, staff)

به‌روزرسانی پرسنل (تغییر سرپرست، وسیله، حوزه)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = StaffApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val staff : Staff =  // Staff | 
try {
    val result : Staff = apiInstance.staffIdPatch(id, staff)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling StaffApi#staffIdPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling StaffApi#staffIdPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **staff** | [**Staff**](Staff.md)|  | |

### Return type

[**Staff**](Staff.md)

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

<a id="staffPost"></a>
# **staffPost**
> Staff staffPost(staff)

تعریف پرسنل (نسبت‌دادن شخص به سمت و سرپرست)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = StaffApi()
val staff : Staff =  // Staff | 
try {
    val result : Staff = apiInstance.staffPost(staff)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling StaffApi#staffPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling StaffApi#staffPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **staff** | [**Staff**](Staff.md)|  | |

### Return type

[**Staff**](Staff.md)

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

