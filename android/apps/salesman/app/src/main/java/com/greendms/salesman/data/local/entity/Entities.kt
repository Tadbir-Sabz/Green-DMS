package com.greendms.salesman.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "tour")
data class TourEntity(
    @PrimaryKey val id: String,
    val tourDate: String,
    val routeId: String? = null,
    val status: String = "planned",
    val synced: Boolean = true
)

@Entity(tableName = "customer")
data class CustomerEntity(
    @PrimaryKey val id: String,
    val code: String,
    val name: String,
    val routeId: String? = null,
    val visitSequence: Int? = null,
    val geoLat: Double? = null,
    val geoLng: Double? = null,
    val creditLimit: Double = 0.0,
    val debt: Double = 0.0,
    val phone: String? = null,
    val address: String? = null,
    val synced: Boolean = true
)

@Entity(tableName = "product_pack")
data class ProductPackEntity(
    @PrimaryKey val id: String,
    val productId: String,
    val uomId: String,
    val uomCode: String,
    val uomTitle: String,
    val factorToBase: Double,
    val price: Double = 0.0,
    val barcode: String? = null,
    val isSalesDefault: Boolean = false,
    val synced: Boolean = true
)

@Entity(tableName = "outbox_order")
data class OutboxOrderEntity(
    @PrimaryKey val clientUuid: String,
    val customerId: String,
    val tourId: String? = null,
    val linesJson: String,
    val note: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val status: String = "pending",
    val retryCount: Int = 0
)
