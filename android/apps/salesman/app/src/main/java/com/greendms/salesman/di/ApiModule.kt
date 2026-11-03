package com.greendms.salesman.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import com.greendms.api.client.apis.*
import com.greendms.api.client.infrastructure.ApiClient
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object ApiModule {
    //baseUrl پیش‌فرض: روی امولاتور اندروید، 10.0.2.2 به localhost میزبان نگاشت
    // می‌شود؛ پیشوند /api/v1 مطابق سرورِ openapi.yaml. با BuildConfig یا
    // -DapiBaseUrl در زمان ساخت قابل بازنویسی است.
    private const val DEFAULT_BASE_URL = "http://10.0.2.2:4000/api/v1"

    @Provides
    @Singleton
    fun provideApiClient(): ApiClient = ApiClient(DEFAULT_BASE_URL)

    @Provides @Singleton fun provideAuthApi(c: ApiClient) = AuthApi(c)
    @Provides @Singleton fun provideToursApi(c: ApiClient) = ToursApi(c)
    @Provides @Singleton fun provideCustomersApi(c: ApiClient) = CustomersApi(c)
    @Provides @Singleton fun provideProductsApi(c: ApiClient) = ProductsApi(c)
    @Provides @Singleton fun provideOrdersApi(c: ApiClient) = OrdersApi(c)
    @Provides @Singleton fun provideGeofencesApi(c: ApiClient) = GeofencesApi(c)
}
