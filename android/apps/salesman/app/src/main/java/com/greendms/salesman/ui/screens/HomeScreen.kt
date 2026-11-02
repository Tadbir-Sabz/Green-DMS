package com.greendms.salesman.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(onNavigate: (String) -> Unit = {}) {
    Scaffold(
        topBar = { TopAppBar(title = { Text("GreenDMS - فروشنده (آفلاین آماده)") }) }
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text("داشبورد امروز", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Card(modifier = Modifier.weight(1f)) { Column(modifier = Modifier.padding(12.dp)) { Text("سفارشات در صف"); Text("۰", style = MaterialTheme.typography.headlineMedium) } }
                Card(modifier = Modifier.weight(1f)) { Column(modifier = Modifier.padding(12.dp)) { Text("بازدیدها"); Text("۰", style = MaterialTheme.typography.headlineMedium) } }
            }
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("عملیات سریع", style = MaterialTheme.typography.titleMedium)
                    Button(onClick = { onNavigate("tour") }, modifier = Modifier.fillMaxWidth()) { Text("تور امروز و مشتریان") }
                    Button(onClick = { onNavigate("order") }, modifier = Modifier.fillMaxWidth()) { Text("ثبت سفارش آفلاین") }
                    Button(onClick = { onNavigate("scan") }, modifier = Modifier.fillMaxWidth()) { Text("اسکن بارکد") }
                    Button(onClick = { onNavigate("print") }, modifier = Modifier.fillMaxWidth()) { Text("چاپ حرارتی") }
                }
            }
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("وضعیت همگام‌سازی", style = MaterialTheme.typography.titleMedium)
                    Text("آماده - سفارش‌های در انتظار ارسال با WorkManager", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
