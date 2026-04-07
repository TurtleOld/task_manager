package com.taskmanager.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DeadlineFormattingTest {

    @Test
    fun normalizeDeadlineForSave_keepsUtcInstantForServerPayload() {
        assertEquals("2026-04-07T09:30:45", normalizeDeadlineForSave("2026-04-07T09:30:45.123Z"))
    }

    @Test
    fun normalizeDeadlineForSave_expandsDateOnlyToStartOfDay() {
        assertEquals("2026-04-07T00:00:00", normalizeDeadlineForSave("2026-04-07"))
    }

    @Test
    fun normalizeDeadlineForSave_convertsProfileTimezoneToUtcPayload() {
        assertEquals("2026-04-07T09:30:00", normalizeDeadlineForSave("2026-04-07T12:30:00", "Europe/Moscow"))
    }

    @Test
    fun normalizeDeadlineForSave_rejectsInvalidManualInput() {
        assertNull(normalizeDeadlineForSave("07/04/2026 09:30"))
    }

    @Test
    fun formatReadableDateTime_formatsNormalizedDeadline() {
        assertEquals("7 апр 2026, 09:30", formatReadableDateTime("2026-04-07T09:30:00"))
    }

    @Test
    fun formatReadableDateTime_convertsUtcToProfileTimezone() {
        assertEquals("7 апр 2026, 12:30", formatReadableDateTime("2026-04-07T09:30:00Z", "Europe/Moscow"))
    }

    @Test
    fun normalizeDeadlineForInput_convertsUtcToProfileTimezone() {
        assertEquals("2026-04-07T12:30:00", normalizeDeadlineForInput("2026-04-07T09:30:00Z", "Europe/Moscow"))
    }

    @Test
    fun formatShortDate_usesProfileTimezoneForDateRollover() {
        assertEquals("08.04.26", formatShortDate("2026-04-07T22:30:00Z", "Europe/Moscow"))
    }
}
