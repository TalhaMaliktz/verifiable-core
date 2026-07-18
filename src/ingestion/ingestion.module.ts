import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { IngestionProcessor } from './ingestion.processor';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    // Register the specific queue for this module
    BullModule.registerQueue({
      name: 'ingestion', // <--- MUST match @InjectQueue('ingestion') in Controller
      defaultJobOptions: {
        attempts: 3,           // <--- RETRY POLICY: Try 3 times total
        backoff: {
          type: 'exponential', // <--- STRATEGY: Wait 1s, then 2s, then 4s...
          delay: 1000,
        },
        removeOnComplete: true, // Auto-delete successful jobs to save Redis space
        removeOnFail: false,    // Keep failed jobs so we can inspect them
      },
    }),
  ],
  controllers: [IngestionController],
  providers: [IngestionService, IngestionProcessor],
})
export class IngestionModule { }
