package com.protv.firetv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.protv.firetv.R

private val Midnight = Color(0xFF080C1B)
private val RoyalBlue = Color(0xFF2343A9)
private val ElectricBlue = Color(0xFF328BFF)
private val Silver = Color(0xFFBEC8DD)

@Composable
fun ProTvScreen() {
    var selectionConfirmed by remember { mutableStateOf(false) }

    MaterialTheme {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Midnight)
                .padding(horizontal = 80.dp, vertical = 64.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = stringResource(R.string.app_name),
                color = Color.White,
                fontSize = 56.sp,
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = stringResource(R.string.tagline),
                color = Silver,
                fontSize = 26.sp,
            )
            Spacer(modifier = Modifier.height(48.dp))
            Button(
                onClick = { selectionConfirmed = true },
                colors = ButtonDefaults.colors(
                    containerColor = RoyalBlue,
                    focusedContainerColor = ElectricBlue,
                    contentColor = Color.White,
                    focusedContentColor = Color.White,
                ),
            ) {
                Text(text = stringResource(R.string.foundation_button))
            }
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = stringResource(
                    if (selectionConfirmed) R.string.foundation_confirmed else R.string.foundation_status
                ),
                color = Silver,
                fontSize = 16.sp,
            )
        }
    }
}
