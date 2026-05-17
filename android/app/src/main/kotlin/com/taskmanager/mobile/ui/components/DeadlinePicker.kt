package com.taskmanager.mobile.ui.components

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeadlinePicker(
    initialValue: String?,
    timeZone: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    val zoneId = resolveZoneId(timeZone)
    val initialInstant = initialValue?.let { parseDeadlineInstant(it, timeZone) }
    var selectedDateMillis by remember(initialValue, timeZone) {
        mutableLongStateOf(
            initialInstant?.atZone(zoneId)?.toLocalDate()?.atStartOfDay(zoneId)?.toInstant()?.toEpochMilli()
                ?: System.currentTimeMillis()
        )
    }
    var showTimePicker by remember { mutableStateOf(false) }
    val datePickerState = rememberDatePickerState(initialSelectedDateMillis = selectedDateMillis)
    val initialDateTime = initialInstant?.atZone(zoneId)?.toLocalDateTime() ?: LocalDateTime.now(zoneId)
    val timePickerState = rememberTimePickerState(
        initialHour = initialDateTime.hour,
        initialMinute = initialDateTime.minute,
        is24Hour = true
    )

    if (!showTimePicker) {
        DatePickerDialog(
            onDismissRequest = onDismiss,
            confirmButton = {
                TextButton(
                    onClick = {
                        selectedDateMillis = datePickerState.selectedDateMillis ?: selectedDateMillis
                        showTimePicker = true
                    }
                ) {
                    Text("Далее")
                }
            },
            dismissButton = {
                TextButton(onClick = onDismiss) {
                    Text("Отмена")
                }
            }
        ) {
            DatePicker(state = datePickerState)
        }
    } else {
        AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("Выберите время") },
            text = { TimePicker(state = timePickerState) },
            confirmButton = {
                TextButton(
                    onClick = {
                        val baseDate = Instant.ofEpochMilli(selectedDateMillis)
                            .atZone(zoneId)
                            .toLocalDate()
                        val result = LocalDateTime.of(
                            baseDate.year,
                            baseDate.month,
                            baseDate.dayOfMonth,
                            timePickerState.hour,
                            timePickerState.minute,
                            0
                        )
                        onConfirm(result.atZone(zoneId).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime().format(deadlineStorageFormatter))
                    }
                ) {
                    Text("Готово")
                }
            },
            dismissButton = {
                TextButton(onClick = { showTimePicker = false }) {
                    Text("Назад")
                }
            }
        )
    }
}
