package com.greendms.salesman.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import org.openapitools.client.apis.*
import org.openapitools.client.infrastructure.ApiClient
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object ApiModule {
    @Provides
    @Singleton
    fun provideApiClient(): ApiClient = ApiClient()

    @Provides @Singleton fun provideAuthApi(c: ApiClient) = AuthApi(c)
    @Provides @Singleton fun provideToursApi(c: ApiClient) = ToursApi(c)
    @Provides @Singleton fun provideCustomersApi(c: ApiClient) = CustomersApi(c)
    @Provides @Singleton fun provideProductsApi(c: ApiClient) = ProductsApi(c)
    @Provides @Singleton fun provideOrdersApi(c: ApiClient) = OrdersApi(c)
    @Provides @Singleton fun provideGeofencesApi(c: ApiClient) = GeofencesApi(c)
}
