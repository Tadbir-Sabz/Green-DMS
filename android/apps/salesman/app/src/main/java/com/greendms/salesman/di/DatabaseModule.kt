package com.greendms.salesman.di

import android.content.Context
import androidx.room.Room
import com.greendms.salesman.data.local.AppDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {
    @Provides
    @Singleton
    fun provideDb(@ApplicationContext context: Context): AppDatabase {
        return Room.databaseBuilder(context, AppDatabase::class.java, "greendms_salesman.db")
            .fallbackToDestructiveMigration()
            .build()
    }

    @Provides fun provideProductDao(db: AppDatabase) = db.productDao()
    @Provides fun provideTourDao(db: AppDatabase) = db.tourDao()
    @Provides fun provideCustomerDao(db: AppDatabase) = db.customerDao()
    @Provides fun provideProductPackDao(db: AppDatabase) = db.productPackDao()
    @Provides fun provideOutboxDao(db: AppDatabase) = db.outboxDao()
}
