package com.greendms.salesman

import android.app.Application
import android.util.Log
import androidx.work.Configuration
import com.greendms.salesman.sync.SyncWorkerFactory
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class GreenDmsApp : Application(), Configuration.Provider {
    @Inject
    lateinit var workerFactory: SyncWorkerFactory

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setMinimumLoggingLevel(Log.INFO)
            .setWorkerFactory(workerFactory)
            .build()
}
