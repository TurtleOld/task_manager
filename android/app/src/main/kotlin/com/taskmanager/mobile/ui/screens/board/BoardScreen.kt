package com.taskmanager.mobile.ui.screens.board

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material.icons.outlined.FilterList
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.taskmanager.mobile.data.model.BoardUser
import com.taskmanager.mobile.data.model.KanbanBoard
import com.taskmanager.mobile.data.model.KanbanColumn
import com.taskmanager.mobile.data.model.KanbanTask
import com.taskmanager.mobile.ui.components.BoardSkeletonLoader
import com.taskmanager.mobile.ui.components.EmptyStateView
import com.taskmanager.mobile.ui.components.ErrorView
import com.taskmanager.mobile.ui.components.ModernTextField
import com.taskmanager.mobile.ui.components.formatShortDate
import com.taskmanager.mobile.ui.components.formatTaskCount
import com.taskmanager.mobile.ui.components.priorityColor
import com.taskmanager.mobile.ui.components.priorityLabel
import com.taskmanager.mobile.ui.viewmodel.BoardUiState

@OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterialApi::class)
@Composable
fun BoardRoute(
    boardState: BoardUiState,
    boardUsers: List<BoardUser>,
    timeZone: String,
    onRetry: () -> Unit,
    onRefresh: () -> Unit,
    onLogout: () -> Unit,
    onSelectBoard: (Int) -> Unit,
    onAddTask: (title: String, columnId: Int) -> Unit,
    onMoveTask: (taskId: Int, toColumnId: Int) -> Unit,
    onDeleteTask: (taskId: Int) -> Unit,
    onTaskClick: (Int) -> Unit,
    onOpenSettings: () -> Unit = {},
    selectedAssigneeFilter: Int? = null,
    onAssigneeFilterChange: (Int?) -> Unit = {}
) {
    val isRefreshing = (boardState as? BoardUiState.Content)?.isRefreshing == true
    val pullRefreshState = rememberPullRefreshState(
        refreshing = isRefreshing,
        onRefresh = onRefresh
    )

    when (boardState) {
        BoardUiState.Loading -> {
            BoardSkeletonLoader(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
            )
        }

        is BoardUiState.Error -> {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background),
                contentAlignment = Alignment.Center
            ) {
                ErrorView(message = boardState.message, onRetry = onRetry)
            }
        }

        is BoardUiState.Content -> {
            val selectedBoard = boardState.boards.firstOrNull { it.id == boardState.selectedBoardId }
                ?: boardState.boards.firstOrNull()
            val filteredBoard = selectedBoard?.copy(
                columns = selectedBoard.columns.map { column ->
                    column.copy(
                        tasks = column.tasks.filter { task ->
                            selectedAssigneeFilter == null || task.assignee == selectedAssigneeFilter
                        }
                    )
                }
            )
            var addTaskSheetVisible by remember { mutableStateOf(false) }
            var moveTask by remember { mutableStateOf<KanbanTask?>(null) }
            var deleteTask by remember { mutableStateOf<KanbanTask?>(null) }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
            ) {
                Column(modifier = Modifier.fillMaxSize()) {
                    KanbanHeader(
                        boards = boardState.boards,
                        selectedBoardId = boardState.selectedBoardId,
                        boardUsers = boardUsers,
                        selectedAssigneeFilter = selectedAssigneeFilter,
                        onSelectBoard = onSelectBoard,
                        onOpenSettings = onOpenSettings,
                        onAssigneeFilterChange = onAssigneeFilterChange
                    )

                    if (filteredBoard == null) {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            EmptyStateView(
                                title = "Нет доступных досок",
                                message = "Проверьте подключение или обновите данные, чтобы загрузить список досок.",
                                actionLabel = "Обновить",
                                onAction = onRefresh,
                                icon = Icons.Outlined.Inbox
                            )
                        }
                    } else {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .weight(1f)
                                .pullRefresh(pullRefreshState)
                        ) {
                            LazyRow(
                                modifier = Modifier.fillMaxSize(),
                                contentPadding = PaddingValues(
                                    start = 16.dp,
                                    end = 16.dp,
                                    top = 8.dp,
                                    bottom = 88.dp
                                ),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                items(filteredBoard.columns, key = { it.id }) { column ->
                                    ColumnView(
                                        column = column,
                                        timeZone = timeZone,
                                        boardUsers = boardUsers,
                                        onMoveClick = { moveTask = it },
                                        onDeleteClick = { deleteTask = it },
                                        onTaskClick = onTaskClick,
                                        onAddTask = onAddTask
                                    )
                                }
                            }

                            PullRefreshIndicator(
                                refreshing = isRefreshing,
                                state = pullRefreshState,
                                modifier = Modifier.align(Alignment.TopCenter),
                                backgroundColor = MaterialTheme.colorScheme.surface,
                                contentColor = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }

                if (selectedBoard != null) {
                    FloatingActionButton(
                        onClick = { addTaskSheetVisible = true },
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .navigationBarsPadding()
                            .padding(20.dp),
                        containerColor = MaterialTheme.colorScheme.primary,
                        elevation = FloatingActionButtonDefaults.elevation(defaultElevation = 6.dp),
                        shape = RoundedCornerShape(18.dp)
                    ) {
                        Text(
                            text = "+",
                            fontSize = 28.sp,
                            color = MaterialTheme.colorScheme.onPrimary,
                            fontWeight = FontWeight.Light
                        )
                    }
                }
            }

            if (addTaskSheetVisible && selectedBoard != null) {
                AddTaskSheet(
                    columns = selectedBoard.columns,
                    onDismiss = { addTaskSheetVisible = false },
                    onSubmit = { title, columnId ->
                        onAddTask(title, columnId)
                        addTaskSheetVisible = false
                    }
                )
            }

            if (moveTask != null && selectedBoard != null) {
                MoveTaskSheet(
                    task = moveTask!!,
                    columns = selectedBoard.columns,
                    onDismiss = { moveTask = null },
                    onMove = { toColumnId ->
                        onMoveTask(moveTask!!.id, toColumnId)
                        moveTask = null
                    }
                )
            }

            if (deleteTask != null) {
                AlertDialog(
                    onDismissRequest = { deleteTask = null },
                    title = { Text("Архивировать задачу?") },
                    text = {
                        Text("Задача «${deleteTask!!.title}» будет убрана с доски и перенесена в архив.")
                    },
                    confirmButton = {
                        Button(
                            onClick = {
                                onDeleteTask(deleteTask!!.id)
                                deleteTask = null
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.primary,
                                contentColor = MaterialTheme.colorScheme.onPrimary
                            )
                        ) {
                            Text("Архивировать")
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { deleteTask = null }) {
                            Text("Отмена")
                        }
                    }
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KanbanHeader(
    boards: List<KanbanBoard>,
    selectedBoardId: Int?,
    boardUsers: List<BoardUser>,
    selectedAssigneeFilter: Int?,
    onSelectBoard: (Int) -> Unit,
    onOpenSettings: () -> Unit = {},
    onAssigneeFilterChange: (Int?) -> Unit = {}
) {
    var showFilterSheet by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .statusBarsPadding()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Task Manager",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = formatTaskCount(boards.sumOf { board -> board.columns.sumOf { it.tasks.size } }),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .background(
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = CircleShape
                    )
                    .clickable { showFilterSheet = true },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Outlined.FilterList,
                    contentDescription = "Фильтр",
                    modifier = Modifier.size(20.dp),
                    tint = if (selectedAssigneeFilter != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .background(
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = CircleShape
                    )
                    .clickable(onClick = onOpenSettings),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Outlined.Settings,
                    contentDescription = "Настройки",
                    modifier = Modifier.size(20.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        if (boards.size > 1) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 20.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(boards) { board ->
                    BoardTab(
                        title = board.title,
                        isSelected = board.id == selectedBoardId,
                        taskCount = board.columns.sumOf { it.tasks.size },
                        onClick = { onSelectBoard(board.id) }
                    )
                }
            }
        }

        HorizontalDivider(
            color = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f),
            thickness = 0.5.dp
        )
    }

    if (showFilterSheet) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { showFilterSheet = false },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("Фильтр по исполнителю", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                TextButton(onClick = {
                    onAssigneeFilterChange(null)
                    showFilterSheet = false
                }) {
                    Text("Все задачи")
                }
                boardUsers.forEach { user ->
                    TextButton(onClick = {
                        onAssigneeFilterChange(user.id)
                        showFilterSheet = false
                    }) {
                        Text(if (selectedAssigneeFilter == user.id) "${user.name} ✓" else user.name)
                    }
                }
            }
        }
    }
}

@Composable
fun BoardTab(
    title: String,
    isSelected: Boolean,
    taskCount: Int,
    onClick: () -> Unit
) {
    val bgColor = if (isSelected) MaterialTheme.colorScheme.primaryContainer
    else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
    val textColor = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer
    else MaterialTheme.colorScheme.onSurfaceVariant

    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(bgColor)
            .clickable(onClick = onClick)
            .semantics { contentDescription = title }
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
            color = textColor
        )
        if (taskCount > 0) {
            Box(
                modifier = Modifier
                    .background(
                        color = if (isSelected) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.outline.copy(alpha = 0.4f),
                        shape = CircleShape
                    )
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    text = taskCount.toString(),
                    style = MaterialTheme.typography.labelSmall,
                    color = if (isSelected) MaterialTheme.colorScheme.onPrimary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
fun ColumnView(
    column: KanbanColumn,
    timeZone: String,
    boardUsers: List<BoardUser>,
    onMoveClick: (KanbanTask) -> Unit,
    onDeleteClick: (KanbanTask) -> Unit,
    onTaskClick: (Int) -> Unit,
    onAddTask: (title: String, columnId: Int) -> Unit
) {
    val cs = MaterialTheme.colorScheme
    val columnColors = listOf(
        cs.primary,
        cs.secondary,
        cs.tertiary,
        cs.error,
        cs.primaryContainer,
        cs.secondaryContainer,
        cs.tertiaryContainer
    )
    val accentColor = columnColors[column.id % columnColors.size]
    val screenWidth = LocalConfiguration.current.screenWidthDp.dp
    val bottomPadding = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val columnWidth = (screenWidth * 0.82f).coerceIn(280.dp, 420.dp)

    Column(
        modifier = Modifier
            .width(columnWidth)
            .fillMaxHeight()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
                .background(MaterialTheme.colorScheme.surfaceContainer)
                .padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 12.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .background(accentColor, CircleShape)
                )
                Text(
                    text = if (column.icon.isBlank()) column.title else "${column.icon} ${column.title}",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Box(
                    modifier = Modifier
                        .background(
                            color = accentColor.copy(alpha = 0.15f),
                            shape = RoundedCornerShape(8.dp)
                        )
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = column.tasks.size.toString(),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = accentColor
                    )
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            InlineAddTask(
                accentColor = accentColor,
                columnTitle = column.title,
                onSubmit = { title -> onAddTask(title, column.id) }
            )
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(2.dp)
                .background(accentColor.copy(alpha = 0.7f))
        )

        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .background(MaterialTheme.colorScheme.surfaceContainer.copy(alpha = 0.6f))
                .padding(horizontal = 10.dp),
            contentPadding = PaddingValues(top = 10.dp, bottom = 10.dp + bottomPadding),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(column.tasks, key = { it.id }) { task ->
                TaskCard(
                    task = task,
                    timeZone = timeZone,
                    accentColor = accentColor,
                    boardUsers = boardUsers,
                    onMoveClick = { onMoveClick(task) },
                    onDeleteClick = { onDeleteClick(task) },
                    onClick = {
                        if (task.id > 0) {
                            onTaskClick(task.id)
                        }
                    }
                )
            }

            if (column.tasks.isEmpty()) {
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        EmptyStateView(
                            title = "Пустая колонка",
                            message = "Добавьте задачу или измените фильтр, чтобы увидеть карточки в этой колонке.",
                            modifier = Modifier.padding(0.dp)
                        )
                    }
                }
            }
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(bottomStart = 16.dp, bottomEnd = 16.dp))
                .background(MaterialTheme.colorScheme.surfaceContainer.copy(alpha = 0.6f))
        )
    }
}

@Composable
private fun InlineAddTask(
    accentColor: Color,
    columnTitle: String,
    onSubmit: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    var title by remember { mutableStateOf("") }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (!expanded) {
            TextButton(
                onClick = { expanded = true },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(
                    text = "+ Быстрая задача",
                    color = accentColor,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.85f))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = "Новая задача в колонке \"$columnTitle\"",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                ModernTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = "Название задачи",
                    placeholder = "Что нужно сделать?"
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    TextButton(
                        onClick = {
                            expanded = false
                            title = ""
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Отмена")
                    }
                    Button(
                        onClick = {
                            val trimmed = title.trim()
                            if (trimmed.isNotEmpty()) {
                                onSubmit(trimmed)
                                title = ""
                                expanded = false
                            }
                        },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("Создать")
                    }
                }
            }
        }
    }
}

@Composable
fun TaskCard(
    task: KanbanTask,
    timeZone: String,
    accentColor: Color,
    boardUsers: List<BoardUser>,
    onMoveClick: () -> Unit,
    onDeleteClick: () -> Unit,
    onClick: () -> Unit
) {
    var menuExpanded by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .semantics { contentDescription = task.title },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(3.dp)
                    .background(
                        brush = Brush.horizontalGradient(
                            colors = listOf(
                                priorityColor(task.priority),
                                priorityColor(task.priority).copy(alpha = 0.3f)
                            )
                        )
                    )
            )

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = task.title,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.weight(1f),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    Box {
                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { menuExpanded = true }
                                .semantics { contentDescription = "Действия с задачей" },
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "⋯",
                                fontSize = 16.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        androidx.compose.material3.DropdownMenu(
                            expanded = menuExpanded,
                            onDismissRequest = { menuExpanded = false }
                        ) {
                            androidx.compose.material3.DropdownMenuItem(
                                text = { Text("Переместить в...") },
                                onClick = {
                                    menuExpanded = false
                                    onMoveClick()
                                }
                            )
                            HorizontalDivider(
                                modifier = Modifier.padding(vertical = 4.dp),
                                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.4f),
                                thickness = 0.5.dp
                            )
                            androidx.compose.material3.DropdownMenuItem(
                                text = {
                                    Text(
                                        text = "Архивировать",
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                },
                                onClick = {
                                    menuExpanded = false
                                    onDeleteClick()
                                }
                            )
                        }
                    }
                }

                if (task.description.isNotBlank()) {
                    Text(
                        text = task.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                if (task.tags.isNotEmpty()) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        items(task.tags.take(3)) { tag ->
                            Box(
                                modifier = Modifier
                                    .background(
                                        color = accentColor.copy(alpha = 0.12f),
                                        shape = RoundedCornerShape(6.dp)
                                    )
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = tag,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = accentColor,
                                    maxLines = 1
                                )
                            }
                        }
                    }
                }

                val assigneeName = task.assignee?.let { id -> boardUsers.find { it.id == id }?.name }
                if (assigneeName != null) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(18.dp)
                                .background(
                                    color = MaterialTheme.colorScheme.primaryContainer,
                                    shape = CircleShape
                                ),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = assigneeName.first().uppercaseChar().toString(),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                                fontSize = 9.sp
                            )
                        }
                        Text(
                            text = assigneeName,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .background(
                                color = priorityColor(task.priority).copy(alpha = 0.12f),
                                shape = RoundedCornerShape(6.dp)
                            )
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(3.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .background(priorityColor(task.priority), CircleShape)
                        )
                        Text(
                            text = priorityLabel(task.priority),
                            style = MaterialTheme.typography.labelSmall,
                            color = priorityColor(task.priority),
                            fontWeight = FontWeight.Medium
                        )
                    }

                    if (!task.dueDate.isNullOrBlank()) {
                        Row(
                            modifier = Modifier
                                .background(
                                    color = MaterialTheme.colorScheme.surfaceVariant,
                                    shape = RoundedCornerShape(6.dp)
                                )
                                .padding(horizontal = 6.dp, vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(3.dp)
                        ) {
                            Text(
                                text = "📅",
                                fontSize = 9.sp
                            )
                            Text(
                                text = formatShortDate(task.dueDate, timeZone),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    Spacer(modifier = Modifier.weight(1f))

                    if (task.checklist.isNotEmpty()) {
                        val done = task.checklist.count { it.done }
                        Text(
                            text = "✓ $done/${task.checklist.size}",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (done == task.checklist.size) {
                                MaterialTheme.colorScheme.tertiary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            }
                        )
                    }

                    if (task.attachments.isNotEmpty()) {
                        Text(
                            text = "📎 ${task.attachments.size}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddTaskSheet(
    columns: List<KanbanColumn>,
    onDismiss: () -> Unit,
    onSubmit: (title: String, columnId: Int) -> Unit
) {
    var title by remember { mutableStateOf("") }
    var selectedColumnId by remember(columns) { mutableStateOf(columns.firstOrNull()?.id) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = "Новая задача",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Добавить задачу на доску",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            ModernTextField(
                value = title,
                onValueChange = { title = it },
                label = "Название задачи",
                placeholder = "Введите название..."
            )

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    text = "Колонка",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Medium
                )
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(columns, key = { it.id }) { column ->
                        val isSelected = selectedColumnId == column.id
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(
                                    if (isSelected) MaterialTheme.colorScheme.primaryContainer
                                    else MaterialTheme.colorScheme.surfaceVariant
                                )
                                .border(
                                    width = if (isSelected) 1.5.dp else 0.dp,
                                    color = if (isSelected) MaterialTheme.colorScheme.primary else Color.Transparent,
                                    shape = RoundedCornerShape(10.dp)
                                )
                                .clickable { selectedColumnId = column.id }
                                .semantics { contentDescription = "Колонка: ${column.title}" }
                                .padding(horizontal = 14.dp, vertical = 8.dp)
                        ) {
                            Text(
                                text = if (column.icon.isBlank()) column.title else "${column.icon} ${column.title}",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer
                                else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            Button(
                onClick = {
                    val columnId = selectedColumnId ?: return@Button
                    onSubmit(title.trim(), columnId)
                },
                enabled = title.isNotBlank() && selectedColumnId != null,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                )
            ) {
                Text(
                    text = "Создать задачу",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MoveTaskSheet(
    task: KanbanTask,
    columns: List<KanbanColumn>,
    onDismiss: () -> Unit,
    onMove: (toColumnId: Int) -> Unit
) {
    var selectedColumnId by remember { mutableStateOf<Int?>(null) }
    val availableColumns = remember(columns, task.columnId) {
        columns.filter { it.id != task.columnId }
    }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = "Переместить задачу",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = task.title,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }

            if (availableColumns.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            MaterialTheme.colorScheme.surfaceVariant,
                            RoundedCornerShape(12.dp)
                        )
                        .padding(16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Нет доступных колонок",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    availableColumns.forEach { column ->
                        val isSelected = selectedColumnId == column.id
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(
                                    if (isSelected) MaterialTheme.colorScheme.primaryContainer
                                    else MaterialTheme.colorScheme.surfaceVariant
                                )
                                .border(
                                    width = if (isSelected) 1.5.dp else 0.dp,
                                    color = if (isSelected) MaterialTheme.colorScheme.primary
                                    else Color.Transparent,
                                    shape = RoundedCornerShape(12.dp)
                                )
                                .clickable { selectedColumnId = column.id }
                                .semantics { contentDescription = "Переместить в: ${column.title}" }
                                .padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(32.dp)
                                    .background(
                                        color = if (isSelected) MaterialTheme.colorScheme.primary.copy(0.2f)
                                        else MaterialTheme.colorScheme.outline.copy(0.15f),
                                        shape = RoundedCornerShape(8.dp)
                                    ),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = if (column.icon.isBlank()) "▦" else column.icon,
                                    fontSize = 16.sp
                                )
                            }
                            Text(
                                text = column.title,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer
                                else MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.weight(1f)
                            )
                            Text(
                                text = formatTaskCount(column.tasks.size),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            if (isSelected) {
                                Text(text = "✓", color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                }
            }

            Button(
                onClick = { selectedColumnId?.let(onMove) },
                enabled = selectedColumnId != null,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                )
            ) {
                Text(
                    text = "Переместить",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}
