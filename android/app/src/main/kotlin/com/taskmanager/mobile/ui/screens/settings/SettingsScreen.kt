package com.taskmanager.mobile.ui.screens.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.PowerSettingsNew
import androidx.compose.material.icons.outlined.SettingsBrightness
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.taskmanager.mobile.data.api.dto.NotificationPreferenceDto
import com.taskmanager.mobile.security.isPinEnabled
import com.taskmanager.mobile.security.triggerBiometricPrompt
import com.taskmanager.mobile.ui.navigation.LocalActivity
import com.taskmanager.mobile.ui.screens.pin.PinSetupDialog
import com.taskmanager.mobile.ui.theme.ThemeMode
import com.taskmanager.mobile.ui.viewmodel.SecuritySettings
import com.taskmanager.mobile.ui.viewmodel.SessionUiState

@Composable
fun SettingsScreen(
    session: SessionUiState,
    securitySettings: SecuritySettings,
    notificationPreferences: List<NotificationPreferenceDto>,
    onBack: () -> Unit,
    onEnablePin: (pin: String) -> Unit,
    onDisablePin: () -> Unit,
    onSetBiometric: (Boolean) -> Unit,
    onThemeModeChange: (ThemeMode) -> Unit,
    onNotificationPreferenceChange: (id: Int, enabled: Boolean) -> Unit,
    onLoadNotificationPreferences: () -> Unit,
    onLogout: () -> Unit,
    onTerminateSessions: () -> Unit,
) {
    val context = LocalContext.current
    val activity = LocalActivity.current
    var showPinSetup by remember { mutableStateOf(false) }
    var showLogoutConfirm by remember { mutableStateOf(false) }
    var showTerminateConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        onLoadNotificationPreferences()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 40.dp)
        ) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.surface)
                        .statusBarsPadding()
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape)
                                .clickable(onClick = onBack),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Назад", modifier = Modifier.size(20.dp))
                        }
                        Text("Настройки", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                    }
                    HorizontalDivider(
                        modifier = Modifier.align(Alignment.BottomCenter),
                        color = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f),
                        thickness = 0.5.dp
                    )
                }
            }

            item {
                SectionTitle("ОФОРМЛЕНИЕ")
                CardContainer {
                    ThemeModeRow("Системная", "Как в настройках устройства", Icons.Outlined.SettingsBrightness, session.themeMode == ThemeMode.System) { onThemeModeChange(ThemeMode.System) }
                    DividerInset()
                    ThemeModeRow("Светлая", "Всегда светлая тема", Icons.Outlined.LightMode, session.themeMode == ThemeMode.Light) { onThemeModeChange(ThemeMode.Light) }
                    DividerInset()
                    ThemeModeRow("Тёмная", "Всегда тёмная тема", Icons.Outlined.DarkMode, session.themeMode == ThemeMode.Dark) { onThemeModeChange(ThemeMode.Dark) }
                }
            }

            item {
                SectionTitle("УВЕДОМЛЕНИЯ")
                CardContainer {
                    if (notificationPreferences.isEmpty()) {
                        Row(modifier = Modifier.fillMaxWidth().padding(20.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(modifier = Modifier.size(40.dp).background(MaterialTheme.colorScheme.secondaryContainer, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                                Icon(Icons.Outlined.Notifications, contentDescription = null)
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Настройки уведомлений загружаются", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                                Text("Push-переключатели появятся после синхронизации профиля", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    } else {
                        notificationPreferences.forEachIndexed { index, preference ->
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(16.dp)
                            ) {
                                Box(modifier = Modifier.size(40.dp).background(MaterialTheme.colorScheme.secondaryContainer, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                                    Icon(Icons.Outlined.Notifications, contentDescription = null, modifier = Modifier.size(22.dp), tint = MaterialTheme.colorScheme.secondary)
                                }
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(preference.eventType, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                                    Text("Push-уведомления", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Switch(
                                    checked = preference.enabled,
                                    onCheckedChange = { onNotificationPreferenceChange(preference.id, it) },
                                    colors = SwitchDefaults.colors(checkedThumbColor = MaterialTheme.colorScheme.onSecondary, checkedTrackColor = MaterialTheme.colorScheme.secondary)
                                )
                            }
                            if (index < notificationPreferences.lastIndex) DividerInset()
                        }
                    }
                }
            }

            item {
                SectionTitle("БЕЗОПАСНОСТЬ")
                CardContainer {
                    Row(modifier = Modifier.fillMaxWidth().clickable { if (securitySettings.pinEnabled) onDisablePin() else showPinSetup = true }.padding(horizontal = 20.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        IconBox(Icons.Outlined.Lock, true)
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Вход по PIN-коду", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                            Text(if (securitySettings.pinEnabled) "Включён" else "Выключен", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Switch(checked = securitySettings.pinEnabled, onCheckedChange = { if (securitySettings.pinEnabled) onDisablePin() else showPinSetup = true })
                    }
                    if (securitySettings.pinEnabled) {
                        DividerInset()
                        Row(modifier = Modifier.fillMaxWidth().clickable(enabled = securitySettings.biometricAvailable) {
                            if (!securitySettings.biometricEnabled) {
                                triggerBiometricPrompt(activity, onSuccess = { onSetBiometric(true) }, onError = {})
                            } else onSetBiometric(false)
                        }.padding(horizontal = 20.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                            IconBox(Icons.Outlined.Fingerprint, false)
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Биометрия", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                                Text(when {
                                    !securitySettings.biometricAvailable -> "Недоступна на этом устройстве"
                                    securitySettings.biometricEnabled -> "Включена"
                                    else -> "Выключена"
                                }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Switch(
                                checked = securitySettings.biometricEnabled,
                                onCheckedChange = { enabled ->
                                    if (enabled) triggerBiometricPrompt(activity, onSuccess = { onSetBiometric(true) }, onError = {}) else onSetBiometric(false)
                                },
                                enabled = securitySettings.biometricAvailable
                            )
                        }
                        DividerInset()
                        Row(modifier = Modifier.fillMaxWidth().clickable { showPinSetup = true }.padding(horizontal = 20.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                            IconBox(Icons.Outlined.Edit, false)
                            Text("Сменить PIN", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                            Text("→", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 16.sp)
                        }
                    }
                    DividerInset()
                    Row(modifier = Modifier.fillMaxWidth().clickable { showTerminateConfirm = true }.padding(horizontal = 20.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        IconBox(Icons.Outlined.PowerSettingsNew, false, isError = true)
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Завершить все сеансы", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.error)
                            Text("Выйти на всех устройствах", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }

            item {
                SectionTitle("АККАУНТ")
                CardContainer {
                    InfoRow("Пользователь", session.username.ifBlank { "Неизвестно" }, Icons.Outlined.Edit)
                    DividerInset()
                    InfoRow("Email", session.email.ifBlank { "Не указан" }, Icons.Outlined.Notifications)
                    DividerInset()
                    InfoRow("Сервер", session.domain.ifBlank { "Не указан" }, Icons.Outlined.Language)
                    DividerInset()
                    Row(modifier = Modifier.fillMaxWidth().clickable { showLogoutConfirm = true }.padding(horizontal = 20.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        IconBox(Icons.AutoMirrored.Outlined.Logout, false, isError = true)
                        Text("Выйти из аккаунта", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.error, modifier = Modifier.weight(1f))
                    }
                }
            }
        }

        if (showPinSetup) {
            PinSetupDialog(onConfirmed = { pin -> onEnablePin(pin); showPinSetup = false }, onDismiss = { showPinSetup = false })
        }

        if (showTerminateConfirm) {
            AlertDialog(
                onDismissRequest = { showTerminateConfirm = false },
                title = { Text("Завершить все сеансы?") },
                text = { Text("Это действие завершит активные сеансы на всех устройствах.") },
                confirmButton = { TextButton(onClick = { showTerminateConfirm = false; onTerminateSessions() }) { Text("Подтвердить") } },
                dismissButton = { TextButton(onClick = { showTerminateConfirm = false }) { Text("Отмена") } }
            )
        }

        if (showLogoutConfirm) {
            AlertDialog(
                onDismissRequest = { showLogoutConfirm = false },
                title = { Text("Выйти из аккаунта?") },
                text = { Text(if (isPinEnabled(context)) "Сессия будет завершена на этом устройстве." else "Сессия будет завершена, для входа потребуется снова ввести логин и пароль.") },
                confirmButton = { TextButton(onClick = { showLogoutConfirm = false; onLogout() }) { Text("Выйти") } },
                dismissButton = { TextButton(onClick = { showLogoutConfirm = false }) { Text("Отмена") } }
            )
        }
    }
}

@Composable
private fun SectionTitle(title: String) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 8.dp, start = 4.dp))
    }
}

@Composable
private fun CardContainer(content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(0.dp),
        border = CardDefaults.outlinedCardBorder()
    ) { Column { content() } }
}

@Composable
private fun DividerInset() {
    HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
}

@Composable
private fun IconBox(icon: ImageVector, primary: Boolean, isError: Boolean = false) {
    Box(
        modifier = Modifier.size(40.dp).background(
            when {
                isError -> MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f)
                primary -> MaterialTheme.colorScheme.primaryContainer
                else -> MaterialTheme.colorScheme.secondaryContainer
            },
            RoundedCornerShape(12.dp)
        ),
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(22.dp), tint = when {
            isError -> MaterialTheme.colorScheme.error
            primary -> MaterialTheme.colorScheme.primary
            else -> MaterialTheme.colorScheme.secondary
        })
    }
}

@Composable
private fun InfoRow(title: String, value: String, icon: ImageVector) {
    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Box(modifier = Modifier.size(40.dp).background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(22.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            Text(value, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun ThemeModeRow(title: String, subtitle: String, icon: ImageVector, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Box(
            modifier = Modifier.size(40.dp).background(
                if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                RoundedCornerShape(12.dp)
            ),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(22.dp), tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (selected) {
            Icon(Icons.Outlined.Check, contentDescription = "Выбрано", modifier = Modifier.size(22.dp), tint = MaterialTheme.colorScheme.primary)
        }
    }
}
