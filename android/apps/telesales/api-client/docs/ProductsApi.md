# ProductsApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**productCategoriesGet**](ProductsApi.md#productCategoriesGet) | **GET** /product-categories | فهرست دسته‌بندی‌های کالای همان شرکت (برای فرم کالا و گزارش‌ها) |
| [**productsGet**](ProductsApi.md#productsGet) | **GET** /products | فهرست کالاها (جست‌وجوی فازی کد/نام، فیلتر دسته/برند/وضعیت) |
| [**productsIdDelete**](ProductsApi.md#productsIdDelete) | **DELETE** /products/{id} | حذف نرم کالا (deleted_at؛ ردیف برای ممیزی مالی باقی می‌ماند) |
| [**productsIdGet**](ProductsApi.md#productsIdGet) | **GET** /products/{id} | جزئیات کالا |
| [**productsIdPatch**](ProductsApi.md#productsIdPatch) | **PATCH** /products/{id} | به‌روزرسانی کالا (قفل خوش‌بینانه با row_version) |
| [**productsPost**](ProductsApi.md#productsPost) | **POST** /products | تعریف کالای جدید |
| [**unitsGet**](ProductsApi.md#unitsGet) | **GET** /units | فهرست واحدهای اندازه‌گیری (داده مرجع سراسری، مشترک همه شرکت‌ها) |


<a id="productCategoriesGet"></a>
# **productCategoriesGet**
> ProductCategoriesGet200Response productCategoriesGet()

فهرست دسته‌بندی‌های کالای همان شرکت (برای فرم کالا و گزارش‌ها)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ProductsApi()
try {
    val result : ProductCategoriesGet200Response = apiInstance.productCategoriesGet()
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ProductsApi#productCategoriesGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ProductsApi#productCategoriesGet")
    e.printStackTrace()
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**ProductCategoriesGet200Response**](ProductCategoriesGet200Response.md)

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

<a id="productsGet"></a>
# **productsGet**
> ProductsGet200Response productsGet(cursor, limit, q, categoryId, brandId, status)

فهرست کالاها (جست‌وجوی فازی کد/نام، فیلتر دسته/برند/وضعیت)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ProductsApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val q : kotlin.String = q_example // kotlin.String | 
val categoryId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val brandId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val status : kotlin.String = status_example // kotlin.String | 
try {
    val result : ProductsGet200Response = apiInstance.productsGet(cursor, limit, q, categoryId, brandId, status)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ProductsApi#productsGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ProductsApi#productsGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **q** | **kotlin.String**|  | [optional] |
| **categoryId** | **java.util.UUID**|  | [optional] |
| **brandId** | **java.util.UUID**|  | [optional] |
| **status** | **kotlin.String**|  | [optional] |

### Return type

[**ProductsGet200Response**](ProductsGet200Response.md)

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

<a id="productsIdDelete"></a>
# **productsIdDelete**
> productsIdDelete(id)

حذف نرم کالا (deleted_at؛ ردیف برای ممیزی مالی باقی می‌ماند)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ProductsApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    apiInstance.productsIdDelete(id)
} catch (e: ClientException) {
    println("4xx response calling ProductsApi#productsIdDelete")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ProductsApi#productsIdDelete")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

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

 - **Content-Type**: Not defined
 - **Accept**: application/json

<a id="productsIdGet"></a>
# **productsIdGet**
> Product productsIdGet(id)

جزئیات کالا

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ProductsApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : Product = apiInstance.productsIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ProductsApi#productsIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ProductsApi#productsIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**Product**](Product.md)

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

<a id="productsIdPatch"></a>
# **productsIdPatch**
> Product productsIdPatch(id, productUpdate)

به‌روزرسانی کالا (قفل خوش‌بینانه با row_version)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ProductsApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val productUpdate : ProductUpdate =  // ProductUpdate | 
try {
    val result : Product = apiInstance.productsIdPatch(id, productUpdate)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ProductsApi#productsIdPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ProductsApi#productsIdPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **productUpdate** | [**ProductUpdate**](ProductUpdate.md)|  | |

### Return type

[**Product**](Product.md)

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

<a id="productsPost"></a>
# **productsPost**
> Product productsPost(productCreate)

تعریف کالای جدید

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ProductsApi()
val productCreate : ProductCreate =  // ProductCreate | 
try {
    val result : Product = apiInstance.productsPost(productCreate)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ProductsApi#productsPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ProductsApi#productsPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **productCreate** | [**ProductCreate**](ProductCreate.md)|  | |

### Return type

[**Product**](Product.md)

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

<a id="unitsGet"></a>
# **unitsGet**
> UnitsGet200Response unitsGet()

فهرست واحدهای اندازه‌گیری (داده مرجع سراسری، مشترک همه شرکت‌ها)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ProductsApi()
try {
    val result : UnitsGet200Response = apiInstance.unitsGet()
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ProductsApi#unitsGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ProductsApi#unitsGet")
    e.printStackTrace()
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**UnitsGet200Response**](UnitsGet200Response.md)

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

