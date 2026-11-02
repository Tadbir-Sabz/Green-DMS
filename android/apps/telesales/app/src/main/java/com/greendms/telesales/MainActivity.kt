package com.greendms.telesales

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TelesalesHome() {
    Scaffold(topBar = { TopAppBar(title = { Text("GreenDMS - فروش تلفنی") }) }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("مرکز تماس", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("عملیات", style = MaterialTheme.typography.titleMedium)
                    Button(onClick = {}, modifier = Modifier.fillMaxWidth()) { Text("جستجوی مشتری") }
                    Button(onClick = {}, modifier = Modifier.fillMaxWidth()) { Text("ثبت سفارش تلفنی") }
                    Button(onClick = {}, modifier = Modifier.fillMaxWidth()) { Text("پیگیری سفارشات") }
                    Button(onClick = {}, modifier = Modifier.fillMaxWidth()) { Text("کاتالوگ محصولات") }
                }
            }
        }
    }
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme { TelesalesHome() }
        }
    }
}
