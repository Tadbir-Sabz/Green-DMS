package com.greendms.salesman.ui.screens.sync

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.greendms.salesman.sync.SyncScheduler
import dagger.hilt.android.EntryPointAccessors

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncScreen() {
    val context = LocalContext.current
    val scheduler = EntryPointAccessors.fromApplication(context, SyncEntryPoint::class.java).syncScheduler()
    Scaffold(topBar = { TopAppBar(title = { Text("همگام‌سازی") }) }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("بارگذاری بسته آفلاین و ارسال سفارشات")
            Button(onClick = { scheduler.enqueueSync() }) { Text("همگام‌سازی دستی") }
        }
    }
}

@dagger.hilt.EntryPoint
@dagger.hilt.InstallIn(dagger.hilt.components.SingletonComponent::class)
interface SyncEntryPoint {
    fun syncScheduler(): SyncScheduler
}
