package com.greendms.salesman.ui.screens.print

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.OutputStream
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PrintScreen(orderJson: String? = null) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val bluetoothAdapter = BluetoothAdapter.getDefaultAdapter()
    var devices by remember { mutableStateOf(listOf<BluetoothDevice>()) }
    var connected by remember { mutableStateOf(false) }
    var socket by remember { mutableStateOf<BluetoothSocket?>(null) }
    var output by remember { mutableStateOf<OutputStream?>(null) }

    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {}

    LaunchedEffect(Unit) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            val needed = arrayOf(Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN)
            val missing = needed.filter { ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED }
            if (missing.isNotEmpty()) permissionLauncher.launch(missing.toTypedArray())
        }
        try {
            @Suppress("MissingPermission")
            devices = bluetoothAdapter?.bondedDevices?.toList() ?: emptyList()
        } catch (_: Exception) {}
    }

    fun connect(device: BluetoothDevice) {
        scope.launch(Dispatchers.IO) {
            try {
                @Suppress("MissingPermission")
                val s = device.createRfcommSocketToServiceRecord(UUID.fromString("00001101-0000-1000-8000-00805F9B34FB"))
                bluetoothAdapter?.cancelDiscovery()
                s.connect()
                socket = s
                output = s.outputStream
                withContext(Dispatchers.Main) { connected = true }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { connected = false }
            }
        }
    }

    fun print() {
        scope.launch(Dispatchers.IO) {
            try {
                val os = output ?: return@launch
                // ESC/POS init + simple 80mm receipt
                os.write(byteArrayOf(0x1B, 0x40)) // init
                os.write("فاکتور فروش\n".toByteArray(Charsets.UTF_8))
                os.write("------------------------\n".toByteArray(Charsets.UTF_8))
                os.write((orderJson ?: "بدون اطلاعات سفارش\n").toByteArray(Charsets.UTF_8))
                os.write("\n\n".toByteArray())
                os.write(byteArrayOf(0x1D, 0x56, 0x42, 0x00)) // cut
                os.flush()
            } catch (_: Exception) {}
        }
    }

    Scaffold(topBar = { TopAppBar(title = { Text("چاپ حرارتی") }) }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            Text(if (connected) "متصل" else "انتخاب پرینتر بلوتوث", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            LazyColumn(modifier = Modifier.weight(1f)) {
                items(devices) { d ->
                    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), onClick = { if (!connected) connect(d) }) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(d.name ?: "بدون نام")
                            Text(d.address, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
            Button(onClick = { print() }, enabled = connected, modifier = Modifier.fillMaxWidth()) { Text("چاپ فاکتور") }
        }
    }
}
