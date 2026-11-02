# WarehousesApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**warehousesGet**](WarehousesApi.md#warehousesGet) | **GET** /warehouses | فهرست انبارها (مرکزی/شعبه/خودرو) |
| [**warehousesIdGet**](WarehousesApi.md#warehousesIdGet) | **GET** /warehouses/{id} | جزئیات انبار |
| [**warehousesIdPatch**](WarehousesApi.md#warehousesIdPatch) | **PATCH** /warehouses/{id} | به‌روزرسانی انبار |
| [**warehousesPost**](WarehousesApi.md#warehousesPost) | **POST** /warehouses | تعریف انبار (برای هر حوزه/شعبه یا وسیله نقلیه) |


<a id="warehousesGet"></a>
# **warehousesGet**
> WarehousesGet200Response warehousesGet(cursor, limit, kind, branchId)

فهرست انبارها (مرکزی/شعبه/خودرو)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = WarehousesApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val kind : kotlin.String = kind_example // kotlin.String | 
val branchId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : WarehousesGet200Response = apiInstance.warehousesGet(cursor, limit, kind, branchId)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling WarehousesApi#warehousesGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling WarehousesApi#warehousesGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **kind** | **kotlin.String**|  | [optional] [enum: main, vehicle, transit, damaged, quarantine, consignment] |
| **branchId** | **java.util.UUID**|  | [optional] |

### Return type

[**WarehousesGet200Response**](WarehousesGet200Response.md)

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

<a id="warehousesIdGet"></a>
# **warehousesIdGet**
> Warehouse warehousesIdGet(id)

جزئیات انبار

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = WarehousesApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : Warehouse = apiInstance.warehousesIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling WarehousesApi#warehousesIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling WarehousesApi#warehousesIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**Warehouse**](Warehouse.md)

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

<a id="warehousesIdPatch"></a>
# **warehousesIdPatch**
> Warehouse warehousesIdPatch(id, warehouse)

به‌روزرسانی انبار

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = WarehousesApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val warehouse : Warehouse =  // Warehouse | 
try {
    val result : Warehouse = apiInstance.warehousesIdPatch(id, warehouse)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling WarehousesApi#warehousesIdPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling WarehousesApi#warehousesIdPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **warehouse** | [**Warehouse**](Warehouse.md)|  | |

### Return type

[**Warehouse**](Warehouse.md)

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

<a id="warehousesPost"></a>
# **warehousesPost**
> Warehouse warehousesPost(warehouse)

تعریف انبار (برای هر حوزه/شعبه یا وسیله نقلیه)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = WarehousesApi()
val warehouse : Warehouse =  // Warehouse | 
try {
    val result : Warehouse = apiInstance.warehousesPost(warehouse)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling WarehousesApi#warehousesPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling WarehousesApi#warehousesPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **warehouse** | [**Warehouse**](Warehouse.md)|  | |

### Return type

[**Warehouse**](Warehouse.md)

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

