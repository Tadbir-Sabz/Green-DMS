# TrackingApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**trackingLocationsGet**](TrackingApi.md#trackingLocationsGet) | **GET** /tracking/locations | موقعیت‌های زنده کارکنان میدانی برای نقشه رهگیری |
| [**trackingLocationsPost**](TrackingApi.md#trackingLocationsPost) | **POST** /tracking/locations | ارسال نمونه موقعیت از اپ فروشنده/موزع (batch) |
| [**trackingRoutesGet**](TrackingApi.md#trackingRoutesGet) | **GET** /tracking/routes | طرح‌های مسیر محاسبه‌شده |
| [**trackingRoutesPost**](TrackingApi.md#trackingRoutesPost) | **POST** /tracking/routes | محاسبه «بهترین مسیر‌بندی با یک کلیک» برای اپ فروشنده/موزع |


<a id="trackingLocationsGet"></a>
# **trackingLocationsGet**
> TrackingLocationsGet200Response trackingLocationsGet(staffId, since)

موقعیت‌های زنده کارکنان میدانی برای نقشه رهگیری

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = TrackingApi()
val staffId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val since : java.time.OffsetDateTime = 2013-10-20T19:20:30+01:00 // java.time.OffsetDateTime | 
try {
    val result : TrackingLocationsGet200Response = apiInstance.trackingLocationsGet(staffId, since)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling TrackingApi#trackingLocationsGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling TrackingApi#trackingLocationsGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **staffId** | **java.util.UUID**|  | [optional] |
| **since** | **java.time.OffsetDateTime**|  | [optional] |

### Return type

[**TrackingLocationsGet200Response**](TrackingLocationsGet200Response.md)

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

<a id="trackingLocationsPost"></a>
# **trackingLocationsPost**
> trackingLocationsPost(trackingLocationsPostRequest)

ارسال نمونه موقعیت از اپ فروشنده/موزع (batch)

اپ موقعیت‌ها را در صف آفلاین نگه می‌دارد و دسته‌ای می‌فرستد؛ سرور &#x60;is_mocked&#x60; و &#x60;accuracy_m&#x60; را ثبت و با رویداد زنده &#x60;location.update&#x60; به نقشه مدیریت پخش می‌کند. 

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = TrackingApi()
val trackingLocationsPostRequest : TrackingLocationsPostRequest =  // TrackingLocationsPostRequest | 
try {
    apiInstance.trackingLocationsPost(trackingLocationsPostRequest)
} catch (e: ClientException) {
    println("4xx response calling TrackingApi#trackingLocationsPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling TrackingApi#trackingLocationsPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **trackingLocationsPostRequest** | [**TrackingLocationsPostRequest**](TrackingLocationsPostRequest.md)|  | |

### Return type

null (empty response body)

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

<a id="trackingRoutesGet"></a>
# **trackingRoutesGet**
> TrackingRoutesGet200Response trackingRoutesGet(staffId, planDate)

طرح‌های مسیر محاسبه‌شده

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = TrackingApi()
val staffId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val planDate : java.time.LocalDate = 2013-10-20 // java.time.LocalDate | 
try {
    val result : TrackingRoutesGet200Response = apiInstance.trackingRoutesGet(staffId, planDate)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling TrackingApi#trackingRoutesGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling TrackingApi#trackingRoutesGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **staffId** | **java.util.UUID**|  | [optional] |
| **planDate** | **java.time.LocalDate**|  | [optional] |

### Return type

[**TrackingRoutesGet200Response**](TrackingRoutesGet200Response.md)

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

<a id="trackingRoutesPost"></a>
# **trackingRoutesPost**
> RoutePlan trackingRoutesPost(trackingRoutesPostRequest)

محاسبه «بهترین مسیر‌بندی با یک کلیک» برای اپ فروشنده/موزع

مشتریان مسیر (یا ایستگاه‌های انتخاب‌شده) می‌آیند؛ سرور با ارائه‌دهنده مسیریابی (نشان/map.ir یا OSRM داخلی) بهترین ترتیب و هندسه را برمی‌گرداند و طرح برای استفاده بعدی ذخیره می‌شود (ماژول ۶ §۶.۳). 

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = TrackingApi()
val trackingRoutesPostRequest : TrackingRoutesPostRequest =  // TrackingRoutesPostRequest | 
try {
    val result : RoutePlan = apiInstance.trackingRoutesPost(trackingRoutesPostRequest)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling TrackingApi#trackingRoutesPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling TrackingApi#trackingRoutesPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **trackingRoutesPostRequest** | [**TrackingRoutesPostRequest**](TrackingRoutesPostRequest.md)|  | |

### Return type

[**RoutePlan**](RoutePlan.md)

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

