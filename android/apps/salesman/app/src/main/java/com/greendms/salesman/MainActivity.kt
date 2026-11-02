package com.greendms.salesman

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.greendms.salesman.ui.screens.HomeScreen
import com.greendms.salesman.ui.theme.GreenDmsTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            GreenDmsTheme {
                HomeScreen()
            }
        }
    }
}
