import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { assertProductionJwtSecret } from './common/config/jwt.config';
import { RequestLoggingMiddleware } from './common/middleware/request-logging.middleware';
import { AppModule } from './app.module';

async function bootstrap() {
  assertProductionJwtSecret();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(new RequestLoggingMiddleware().use.bind(new RequestLoggingMiddleware()));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  const defaultOrigins = [
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8080',
  ];
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()) ?? defaultOrigins,
    credentials: true,
  });

  const swaggerEnabled = process.env.SWAGGER_ENABLED !== 'false';
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Мій дім API')
      .setDescription('API для управління ОСББ та управляючих компаній (УК)')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = process.env.API_PORT ?? 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ level: 'info', msg: 'api_started', port: Number(port) }));
}

bootstrap();