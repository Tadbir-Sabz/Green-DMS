# ToursApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**toursGet**](ToursApi.md#toursGet) | **GET** /tours | فهرست تورها (سرد/گرم، توزیع، تلفنی) با فیلتر تاریخ و فروشنده |
| [**toursIdGet**](ToursApi.md#toursIdGet) | **GET** /tours/{id} | جزئیات تور (بارگیری، بازدیدها، فروش) |
| [**toursIdPatch**](ToursApi.md#toursIdPatch) | **PATCH** /tours/{id} | به‌روزرسانی تور (شروع/پایان، یادداشت) |
| [**toursIdSettlementGet**](ToursApi.md#toursIdSettlementGet) | **GET** /tours/{id}/settlement | تسویه تور — نقد دریافتی، مغایرت و پورسانت |
| [**toursPost**](ToursApi.md#toursPost) | **POST** /tours | شروع/تخصیص تور (دریافت تور توسط فروشنده یا تخصیص مدیر) |


<a id="toursGet"></a>
# **toursGet**
> ToursGet200Response toursGet(cursor, limit, tourDate, kind, salespersonId, status)

فهرست تورها (سرد/گرم، توزیع، تلفنی) با فیلتر تاریخ و فروشنده

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ToursApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val tourDate : java.time.LocalDate = 2013-10-20 // java.time.LocalDate | 
val kind : kotlin.String = kind_example // kotlin.String | 
val salespersonId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val status : kotlin.String = status_example // kotlin.String | 
try {
    val result : ToursGet200Response = apiInstance.toursGet(cursor, limit, tourDate, kind, salespersonId, status)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ToursApi#toursGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ToursApi#toursGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **tourDate** | **java.time.LocalDate**|  | [optional] |
| **kind** | **kotlin.String**|  | [optional] [enum: cold, warm, distribution, telesales] |
| **salespersonId** | **java.util.UUID**|  | [optional] |
| **status** | **kotlin.String**|  | [optional] |

### Return type

[**ToursGet200Response**](ToursGet200Response.md)

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

<a id="toursIdGet"></a>
# **toursIdGet**
> Tour toursIdGet(id)

جزئیات تور (بارگیری، بازدیدها، فروش)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ToursApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : Tour = apiInstance.toursIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ToursApi#toursIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ToursApi#toursIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**Tour**](Tour.md)

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

<a id="toursIdPatch"></a>
# **toursIdPatch**
> Tour toursIdPatch(id, tour)

به‌روزرسانی تور (شروع/پایان، یادداشت)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ToursApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val tour : Tour =  // Tour | 
try {
    val result : Tour = apiInstance.toursIdPatch(id, tour)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ToursApi#toursIdPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ToursApi#toursIdPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **tour** | [**Tour**](Tour.md)|  | |

### Return type

[**Tour**](Tour.md)

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

<a id="toursIdSettlementGet"></a>
# **toursIdSettlementGet**
> TourSettlement toursIdSettlementGet(id)

تسویه تور — نقد دریافتی، مغایرت و پورسانت

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ToursApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : TourSettlement = apiInstance.toursIdSettlementGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ToursApi#toursIdSettlementGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ToursApi#toursIdSettlementGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**TourSettlement**](TourSettlement.md)

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

<a id="toursPost"></a>
# **toursPost**
> Tour toursPost(tour)

شروع/تخصیص تور (دریافت تور توسط فروشنده یا تخصیص مدیر)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ToursApi()
val tour : Tour =  // Tour | 
try {
    val result : Tour = apiInstance.toursPost(tour)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ToursApi#toursPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ToursApi#toursPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **tour** | [**Tour**](Tour.md)|  | |

### Return type

[**Tour**](Tour.md)

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

