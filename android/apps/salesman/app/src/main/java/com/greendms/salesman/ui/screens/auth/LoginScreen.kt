package com.greendms.salesman.ui.screens.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.greendms.salesman.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import org.openapitools.client.apis.AuthApi
import org.openapitools.client.models.AuthLoginPostRequest
import javax.inject.Inject

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authApi: AuthApi,
    private val authRepo: AuthRepository
) : androidx.lifecycle.ViewModel() {
    var loading by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)

    fun login(username: String, password: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            loading = true
            error = null
            try {
                val res = authApi.authLoginPost(AuthLoginPostRequest(username, password))
                val token = (res as? Map<*,*>)?.get("access_token") as? String ?: (res as? Map<*,*>)?.get("token") as? String
                if (token != null) {
                    authRepo.saveToken(token)
                    onSuccess()
                } else {
                    error = "عدم دریافت توکن"
                }
            } catch (e: Exception) {
                error = e.message
            } finally {
                loading = false
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(onLoginSuccess: () -> Unit, viewModel: LoginViewModel = hiltViewModel()) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Scaffold(topBar = { TopAppBar(title = { Text("ورود") }) }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            OutlinedTextField(value = username, onValueChange = { username = it }, label = { Text("نام کاربری") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = password, onValueChange = { password = it }, label = { Text("رمز عبور") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(16.dp))
            if (viewModel.error != null) Text(viewModel.error!!, color = MaterialTheme.colorScheme.error)
            Button(onClick = { viewModel.login(username, password, onLoginSuccess) }, enabled = !viewModel.loading, modifier = Modifier.fillMaxWidth()) {
                Text(if (viewModel.loading) "در حال ورود..." else "ورود")
            }
        }
    }
}
