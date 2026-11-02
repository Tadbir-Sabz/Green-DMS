package com.greendms.salesman.ui.screens.tour

import android.Manifest
import android.content.pm.PackageManager
import android.location.Location
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.launch
import kotlin.math.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TourScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val fused = LocationServices.getFusedLocationProviderClient(context)
    var hasPerm by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { hasPerm = it }
    var lat by remember { mutableStateOf<Double?>(null) }
    var lng by remember { mutableStateOf<Double?>(null) }
    var inRange by remember { mutableStateOf(false) }
    var checkedIn by remember { mutableStateOf(false) }
    val targetLat = 35.6892
    val targetLng = 51.3890
    val radiusM = 100.0

    fun distance(aLat: Double,aLng: Double,bLat: Double,bLng: Double): Double {
        val R = 6371000.0
        val dLat = Math.toRadians(bLat-aLat)
        val dLng = Math.toRadians(bLng-aLng)
        val sa = sin(dLat/2)*sin(dLat/2)+cos(Math.toRadians(aLat))*cos(Math.toRadians(bLat))*sin(dLng/2)*sin(dLng/2)
        val c = 2*atan2(sqrt(sa), sqrt(1-sa))
        return R*c
    }

    LaunchedEffect(Unit) {
        if (!hasPerm) launcher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
    }

    Scaffold(topBar = { TopAppBar(title = { Text("تور فروش") }) }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("موقعیت فعلی", style = MaterialTheme.typography.titleMedium)
            Text("Lat: ${lat ?: "-"}, Lng: ${lng ?: "-"}")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = {
                    scope.launch {
                        try {
                            if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                                val cts = CancellationTokenSource()
                                fused.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token).addOnSuccessListener { loc: Location? ->
                                    loc?.let { 
                                        lat = it.latitude; lng = it.longitude
                                        if (lat!=null && lng!=null) inRange = distance(lat!!,lng!!,targetLat,targetLng) <= radiusM
                                    }
                                }
                            }
                        } catch (_: Exception) {}
                    }
                }) { Text("دریافت موقعیت") }
                Button(enabled = inRange && !checkedIn, onClick = { checkedIn = true }) { Text("Check-In") }
                Button(enabled = checkedIn, onClick = { checkedIn = false }) { Text("Check-Out") }
            }
            Text(if (inRange) "در محدوده مشتری" else "خارج از محدوده", color = if (inRange) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
            if (checkedIn) Text("وضعیت: حضور فعال")
        }
    }
}
