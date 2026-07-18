import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // <--- This makes it available to UsersModule without importing it again
@Module({
    providers: [PrismaService],
    exports: [PrismaService],
})
export class PrismaModule { }