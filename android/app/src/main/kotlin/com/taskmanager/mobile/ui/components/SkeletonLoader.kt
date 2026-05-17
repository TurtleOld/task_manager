package com.taskmanager.mobile.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp

@Composable
fun BoardSkeletonLoader(
    modifier: Modifier = Modifier,
    columnCount: Int = 3
) {
    val transition = rememberInfiniteTransition(label = "board_skeleton")
    val alpha by transition.animateFloat(
        initialValue = 0.35f,
        targetValue = 0.75f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 900),
            repeatMode = RepeatMode.Reverse
        ),
        label = "board_skeleton_alpha"
    )
    val placeholderColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = alpha)

    Column(
        modifier = modifier.fillMaxSize()
    ) {
        BoardHeaderSkeleton(placeholderColor = placeholderColor)
        LazyRow(
            modifier = Modifier
                .fillMaxSize()
                .padding(top = 8.dp),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 88.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items((0 until columnCount).toList()) {
                BoardColumnSkeleton(placeholderColor = placeholderColor)
            }
        }
    }
}

@Composable
private fun BoardHeaderSkeleton(placeholderColor: Color) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 20.dp, vertical = 16.dp)
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SkeletonBox(
                    modifier = Modifier
                        .fillMaxWidth(0.42f)
                        .height(26.dp),
                    color = placeholderColor,
                    shape = RoundedCornerShape(12.dp)
                )
                SkeletonBox(
                    modifier = Modifier
                        .fillMaxWidth(0.24f)
                        .height(14.dp),
                    color = placeholderColor,
                    shape = RoundedCornerShape(8.dp)
                )
            }
            SkeletonBox(
                modifier = Modifier
                    .width(36.dp)
                    .height(36.dp),
                color = placeholderColor,
                shape = CircleShape
            )
            SkeletonBox(
                modifier = Modifier
                    .width(36.dp)
                    .height(36.dp),
                color = placeholderColor,
                shape = CircleShape
            )
        }
        Spacer(modifier = Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            repeat(3) {
                SkeletonBox(
                    modifier = Modifier
                        .width(108.dp)
                        .height(34.dp),
                    color = placeholderColor,
                    shape = RoundedCornerShape(10.dp)
                )
            }
        }
    }
}

@Composable
private fun BoardColumnSkeleton(placeholderColor: Color) {
    Column(
        modifier = Modifier
            .width(300.dp)
            .fillMaxHeight()
    ) {
        SkeletonBox(
            modifier = Modifier
                .fillMaxWidth()
                .height(58.dp),
            color = placeholderColor,
            shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
        )
        Spacer(
            modifier = Modifier
                .fillMaxWidth()
                .height(2.dp)
                .background(placeholderColor.copy(alpha = 0.7f))
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceContainer.copy(alpha = 0.6f))
                .padding(horizontal = 10.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            repeat(4) {
                SkeletonBox(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(116.dp),
                    color = placeholderColor,
                    shape = RoundedCornerShape(12.dp)
                )
            }
        }
        SkeletonBox(
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp),
            color = placeholderColor,
            shape = RoundedCornerShape(bottomStart = 16.dp, bottomEnd = 16.dp)
        )
    }
}

@Composable
private fun SkeletonBox(
    modifier: Modifier,
    color: Color,
    shape: Shape
) {
    Box(
        modifier = modifier
            .clip(shape)
            .background(color)
    )
}
