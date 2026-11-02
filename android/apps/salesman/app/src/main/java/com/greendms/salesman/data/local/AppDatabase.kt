package com.greendms.salesman.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.greendms.salesman.data.local.dao.*
import com.greendms.salesman.data.local.entity.*

@Database(
    entities = [ProductEntity::class, TourEntity::class, CustomerEntity::class, ProductPackEntity::class, OutboxOrderEntity::class],
    version = 3,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun productDao(): ProductDao
    abstract fun tourDao(): TourDao
    abstract fun customerDao(): CustomerDao
    abstract fun productPackDao(): ProductPackDao
    abstract fun outboxDao(): OutboxDao
}


