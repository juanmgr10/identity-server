import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Necesario para leer la cookie httpOnly del refresh token en POST /auth/refresh.
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // descarta propiedades no declaradas en el DTO
      forbidNonWhitelisted: true, // ...y rechaza la petición si llegaban
      transform: true, // convierte el body plano a instancias de la clase del DTO
    }),
  );
  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? 3000;
  await app.listen(port);
}
void bootstrap();
