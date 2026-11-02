package com.greendms.salesman.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "products")
data class ProductEntity(
    @PrimaryKey val id: String,
    val code: String,
    val name: String,
    val price: Double = 0.0,
    val updatedAt: Long = System.currentTimeMillis()
)
    val barcode: String? = null,
