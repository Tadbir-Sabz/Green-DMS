package com.greendms.salesman

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.greendms.salesman.navigation.NavGraph
import com.greendms.salesman.ui.theme.GreenDmsTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            GreenDmsTheme {
                // NavGraph درگاه ورود و ناوبری بین صفحه‌ها را فراهم می‌کند؛
                // HomeScreen به‌تنهایی جریان ورود را دور می‌زد.
                NavGraph()
            }
        }
    }
}
