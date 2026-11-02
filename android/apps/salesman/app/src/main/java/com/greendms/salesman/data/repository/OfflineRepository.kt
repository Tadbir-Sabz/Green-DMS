package com.greendms.salesman.data.repository

import com.greendms.salesman.data.local.dao.*
import com.greendms.salesman.data.local.entity.*
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OfflineRepository @Inject constructor(
    private val tourDao: TourDao,
    private val customerDao: CustomerDao,
    private val productPackDao: ProductPackDao,
    private val outboxDao: OutboxDao
) {
    fun getTours(): Flow<List<TourEntity>> = tourDao.getAll()
    fun getCustomers(routeId: String): Flow<List<CustomerEntity>> = customerDao.getByRoute(routeId)
    fun getAllCustomers(): Flow<List<CustomerEntity>> = customerDao.getAll()
    fun getPacks(productId: String): Flow<List<ProductPackEntity>> = productPackDao.getByProduct(productId)

    suspend fun saveTours(list: List<TourEntity>) = tourDao.insertAll(list)
    suspend fun saveCustomers(list: List<CustomerEntity>) = customerDao.insertAll(list)
    suspend fun savePacks(list: List<ProductPackEntity>) = productPackDao.insertAll(list)
    suspend fun enqueueOrder(order: OutboxOrderEntity) = outboxDao.insert(order)
    suspend fun getPendingOrders(): List<OutboxOrderEntity> = outboxDao.getPending()
    suspend fun markOrder(id: String, status: String) = outboxDao.updateStatus(id, status)
}
