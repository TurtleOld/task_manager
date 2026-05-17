package com.taskmanager.mobile.ui.screens.today

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.taskmanager.mobile.data.model.KanbanTask
import com.taskmanager.mobile.data.repository.TodayCardsResult
import com.taskmanager.mobile.ui.components.EmptyStateView
import com.taskmanager.mobile.ui.components.ErrorView
import com.taskmanager.mobile.ui.components.formatReadableDateTime
import com.taskmanager.mobile.ui.components.ListSkeletonLoader
import com.taskmanager.mobile.ui.components.priorityColor
import com.taskmanager.mobile.ui.components.priorityLabel
import com.taskmanager.mobile.ui.viewmodel.TodayUiState

@Composable
fun TodayScreen(
    state: TodayUiState,
    timeZone: String,
    onRetry: () -> Unit,
    onTaskClick: (Int) -> Unit
) {
    when (state) {
        TodayUiState.Loading -> {
            ListSkeletonLoader(modifier = Modifier.fillMaxSize())
        }

        is TodayUiState.Error -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                ErrorView(message = state.message, onRetry = onRetry)
            }
        }

        is TodayUiState.Content -> {
            TodayContent(data = state.data, timeZone = timeZone, onRetry = onRetry, onTaskClick = onTaskClick)
        }
    }
}

@Composable
private fun TodayContent(
    data: TodayCardsResult,
    timeZone: String,
    onRetry: () -> Unit,
    onTaskClick: (Int) -> Unit
) {
    val isEmpty = data.overdue.isEmpty() && data.today.isEmpty() && data.important.isEmpty()
    if (isEmpty) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            EmptyStateView(
                title = "На сегодня задач нет",
                message = "Когда появятся просроченные, сегодняшние или важные задачи, они будут показаны здесь.",
                actionLabel = "Обновить",
                onAction = onRetry,
                icon = Icons.Outlined.EventBusy
            )
        }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text("Сегодня", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        }
        todaySection("Просроченные", data.overdue, timeZone, onTaskClick)
        todaySection("Сегодня", data.today, timeZone, onTaskClick)
        todaySection("Важные", data.important, timeZone, onTaskClick)
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.todaySection(
    title: String,
    tasks: List<KanbanTask>,
    timeZone: String,
    onTaskClick: (Int) -> Unit
) {
    if (tasks.isEmpty()) return
    item {
        Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
    }
    items(tasks, key = { it.id }) { task ->
        Card(
            modifier = Modifier.fillMaxWidth().clickable { onTaskClick(task.id) },
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)
        ) {
            Column(modifier = Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(task.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(
                    listOfNotNull(task.boardName, task.columnName).joinToString(" • "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(priorityLabel(task.priority), color = priorityColor(task.priority), style = MaterialTheme.typography.labelMedium)
                    if (!task.dueDate.isNullOrBlank()) {
                        Text(formatReadableDateTime(task.dueDate, timeZone), style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
    }
}
