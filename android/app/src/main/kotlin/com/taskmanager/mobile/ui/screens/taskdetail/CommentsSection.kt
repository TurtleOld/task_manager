package com.taskmanager.mobile.ui.screens.taskdetail

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.taskmanager.mobile.data.api.dto.CommentDto
import com.taskmanager.mobile.ui.components.DetailSection
import com.taskmanager.mobile.ui.components.formatReadableDateTime

@Composable
fun CommentsSection(
    comments: List<CommentDto>,
    newComment: String,
    isPosting: Boolean,
    postError: String?,
    timeZone: String,
    onCommentChange: (String) -> Unit,
    onPostComment: () -> Unit
) {
    DetailSection(title = "Комментарии", badge = comments.size.takeIf { it > 0 }?.toString()) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            comments.forEach { comment ->
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                            RoundedCornerShape(12.dp)
                        )
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = comment.authorName.ifBlank { comment.authorUsername },
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = formatReadableDateTime(comment.editedAt ?: comment.createdAt, timeZone),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Text(
                        text = comment.text,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }

            if (comments.isEmpty()) {
                Text(
                    text = "Пока нет комментариев. Добавьте первый комментарий к задаче.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            OutlinedTextField(
                value = newComment,
                onValueChange = onCommentChange,
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                placeholder = { Text("Напишите комментарий...") }
            )

            if (!postError.isNullOrBlank()) {
                Text(
                    text = postError,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error
                )
            }

            Button(
                onClick = onPostComment,
                enabled = newComment.isNotBlank() && !isPosting,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (isPosting) {
                    CircularProgressIndicator(
                        modifier = Modifier.padding(end = 8.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                    Text("Отправка...")
                } else {
                    Text("Добавить комментарий")
                }
            }
        }
    }
}
