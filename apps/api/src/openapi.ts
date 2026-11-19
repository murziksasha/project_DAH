import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { APP_VERSION } from './common/version';

/** Single OpenAPI definition for Swagger UI (main.ts) and the committed export (L2/L9). */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Мій дім API')
    .setDescription('API для управління ОСББ та управляючих компаній (УК)')
    .setVersion(APP_VERSION)
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}
