package com.greendms.salesman.ui.screens.order

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.greendms.salesman.data.local.entity.OutboxOrderEntity
import com.greendms.salesman.data.repository.OfflineRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import javax.inject.Inject

@HiltViewModel
class OrderViewModel @Inject constructor(
    private val offlineRepo: OfflineRepository
) : androidx.lifecycle.ViewModel() {
    fun saveOrderOffline(customerId: String, items: List<Pair<String, Double>>, note: String?) {
        val lines = JSONArray()
        items.forEach { (pid, qty) -> 
            val o = JSONObject()
            o.put("productId", pid)
            o.put("qty", qty)
            lines.put(o)
        }
        val order = OutboxOrderEntity(
            clientUuid = UUID.randomUUID().toString(),
            customerId = customerId,
            linesJson = lines.toString(),
            note = note
        )
        viewModelScope.launch {
            offlineRepo.enqueueOrder(order)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderScreen(customerId: String = "", viewModel: OrderViewModel = hiltViewModel()) {
    var note by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    Scaffold(topBar = { TopAppBar(title = { Text("ثبت سفارش آفلاین") }) }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("مشتری: $customerId")
            OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text("یادداشت") }, modifier = Modifier.fillMaxWidth())
            Button(onClick = {
                viewModel.saveOrderOffline(customerId, listOf("demo" to 1.0), note)
            }) { Text("ذخیره در صف آفلاین (Outbox)") }
        }
    }
}
