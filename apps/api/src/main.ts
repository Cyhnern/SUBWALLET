import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // --- Güvenlik başlıkları ---
  app.use(helmet());

  // --- CORS: yalnızca bilinen origin'ler ---
  app.enableCors({
    origin: (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
    credentials: true,
  });

  // --- Global doğrulama: DTO'da tanımlı olmayan alanları reddet ---
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api/v1');

  // --- OpenAPI/Swagger dokümantasyonu ---
  const config = new DocumentBuilder()
    .setTitle('Subwallet API')
    .setDescription('Abonelik ve cüzdan yönetimi süper uygulaması API dokümantasyonu')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Subwallet API ${port} portunda çalışıyor`);
}

bootstrap();
