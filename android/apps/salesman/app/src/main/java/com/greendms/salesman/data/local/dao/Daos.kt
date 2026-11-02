package com.greendms.salesman.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.greendms.salesman.data.local.entity.*
import kotlinx.coroutines.flow.Flow

@Dao
interface TourDao {
    @Query("SELECT * FROM tour ORDER BY tourDate DESC")
    fun getAll(): Flow<List<TourEntity>>
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(list: List<TourEntity>)
}

@Dao
interface CustomerDao {
    @Query("SELECT * FROM customer WHERE routeId = :routeId ORDER BY visitSequence ASC")
    fun getByRoute(routeId: String): Flow<List<CustomerEntity>>
    @Query("SELECT * FROM customer ORDER BY name ASC")
    fun getAll(): Flow<List<CustomerEntity>>
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(list: List<CustomerEntity>)
}

@Dao
interface ProductPackDao {
    @Query("SELECT * FROM product_pack WHERE productId = :productId")
    fun getByProduct(productId: String): Flow<List<ProductPackEntity>>
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(list: List<ProductPackEntity>)
}

@Dao
interface OutboxDao {
    @Query("SELECT * FROM outbox_order WHERE status = 'pending' ORDER BY createdAt ASC")
    suspend fun getPending(): List<OutboxOrderEntity>
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(order: OutboxOrderEntity)
    @Query("UPDATE outbox_order SET status = :status, retryCount = retryCount + 1 WHERE clientUuid = :id")
    suspend fun updateStatus(id: String, status: String)
}
