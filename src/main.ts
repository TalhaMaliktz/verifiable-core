import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common'; // <--- Import this

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  // Enforce validation rules on all endpoints
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // Strips out properties that aren't in the DTO
    forbidNonWhitelisted: true, // Throws error if extra data is sent
  }),
  );

  await app.listen(3000);
}
bootstrap();