package com.greendms.distributor.utils

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

fun toPersianDate(millis: Long = System.currentTimeMillis()): String {
    val df = SimpleDateFormat("yyyy/MM/dd", Locale("fa"))
    df.timeZone = TimeZone.getTimeZone("Asia/Tehran")
    return df.format(Date(millis))
}
