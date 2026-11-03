package com.greendms.salesman.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.greendms.salesman.ui.screens.auth.LoginScreen
import com.greendms.salesman.ui.screens.HomeScreen
import com.greendms.salesman.ui.screens.tour.TourScreen
import com.greendms.salesman.ui.screens.order.OrderScreen
import com.greendms.salesman.ui.screens.scan.ScanScreen
import com.greendms.salesman.ui.screens.print.PrintScreen
import com.greendms.salesman.data.secure.SecurePrefs
import androidx.compose.ui.platform.LocalContext

@Composable
fun NavGraph() {
    val navController = rememberNavController()
    val context = LocalContext.current
    val prefs = SecurePrefs(context)
    val start = if (prefs.getToken().isNullOrEmpty()) "login" else "home"

    NavHost(navController = navController, startDestination = start) {
        composable("login") { LoginScreen(onLoginSuccess = { navController.navigate("home") { popUpTo("login") { inclusive = true } } }) }
        composable("home") { HomeScreen(onNavigate = { navController.navigate(it) }) }
        composable("tour") { TourScreen(onCustomerClick = { navController.navigate("order") }) }
        composable("order") { OrderScreen() }
        composable("scan") { ScanScreen() }
        composable("print") { PrintScreen() }
    }
}
