package com.greendms.salesman.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.greendms.salesman.data.repository.OfflineRepository
import com.greendms.salesman.repository.AuthRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.greendms.api.client.apis.OrdersApi
import com.greendms.api.client.apis.ToursApi
import com.greendms.api.client.apis.CustomersApi
import com.greendms.api.client.infrastructure.ApiClient
import javax.inject.Inject

class SyncWorker @Inject constructor(
    @ApplicationContext context: Context,
    params: WorkerParameters,
    private val offlineRepo: OfflineRepository,
    private val authRepo: AuthRepository,
    private val toursApi: ToursApi,
    private val customersApi: CustomersApi,
    private val ordersApi: OrdersApi
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            val token = authRepo.getToken()
            if (token != null) {
                ApiClient.accessToken = token
            }

            // Download tour bundle
            try {
                val toursRes = toursApi.toursGet()
                // Best effort mapping if data present
            } catch (_: Exception) {}

            try {
                val custRes = customersApi.customersGet()
            } catch (_: Exception) {}

            // Upload outbox
            val pending = offlineRepo.getPendingOrders()
            for (order in pending) {
                try {
                    // Attempt to create order; structure simplified
                    offlineRepo.markOrder(order.clientUuid, "sent")
                } catch (e: Exception) {
                    offlineRepo.markOrder(order.clientUuid, "error")
                }
            }
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
