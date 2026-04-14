package com.siddarthkay.syncup

import org.junit.Assert.assertEquals
import org.junit.Test

class NotificationDedupTest {

    @Test
    fun `fresh error on empty state notifies with new count`() {
        assertEquals(
            NotificationDedup.Decision.Notify(3),
            NotificationDedup.decide(lastCount = 0, currentCount = 3),
        )
    }

    @Test
    fun `single error notifies`() {
        assertEquals(
            NotificationDedup.Decision.Notify(1),
            NotificationDedup.decide(lastCount = 0, currentCount = 1),
        )
    }

    @Test
    fun `rising count notifies with new higher value`() {
        assertEquals(
            NotificationDedup.Decision.Notify(5),
            NotificationDedup.decide(lastCount = 3, currentCount = 5),
        )
    }

    @Test
    fun `same count skips so user is not spammed`() {
        assertEquals(
            NotificationDedup.Decision.Skip,
            NotificationDedup.decide(lastCount = 3, currentCount = 3),
        )
    }

    @Test
    fun `falling but still-broken count skips`() {
        assertEquals(
            NotificationDedup.Decision.Skip,
            NotificationDedup.decide(lastCount = 5, currentCount = 2),
        )
    }

    @Test
    fun `previously-broken folder going healthy resets dedup`() {
        assertEquals(
            NotificationDedup.Decision.Reset,
            NotificationDedup.decide(lastCount = 5, currentCount = 0),
        )
    }

    @Test
    fun `never-broken folder staying healthy is a noop`() {
        assertEquals(
            NotificationDedup.Decision.Skip,
            NotificationDedup.decide(lastCount = 0, currentCount = 0),
        )
    }

    @Test
    fun `negative current count treated as healthy`() {
        // REST API is untrusted.
        assertEquals(
            NotificationDedup.Decision.Reset,
            NotificationDedup.decide(lastCount = 3, currentCount = -1),
        )
    }

    @Test
    fun `negative current count with no prior state skips`() {
        assertEquals(
            NotificationDedup.Decision.Skip,
            NotificationDedup.decide(lastCount = 0, currentCount = -2),
        )
    }

    @Test
    fun `after reset, a subsequent failure at the same count notifies again`() {
        // heal then re-break with the same count; must notify, not skip.
        assertEquals(
            NotificationDedup.Decision.Reset,
            NotificationDedup.decide(lastCount = 3, currentCount = 0),
        )
        assertEquals(
            NotificationDedup.Decision.Notify(3),
            NotificationDedup.decide(lastCount = 0, currentCount = 3),
        )
    }
}
