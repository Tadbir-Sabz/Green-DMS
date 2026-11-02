package com.greendms.salesman.sync

import android.content.Context
import androidx.work.Configuration
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Provider

class SyncWorkerFactory @Inject constructor(
    private val workerFactory: Provider<SyncWorker>
) : androidx.work.WorkerFactory() {
    override fun createWorker(
        appContext: Context,
        workerClassName: String,
        workerParameters: androidx.work.WorkerParameters
    ): androidx.work.ListenableWorker? {
        return if (workerClassName == SyncWorker::class.java.name) {
            workerFactory.get()
        } else null
    }
}
