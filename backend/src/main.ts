import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // Enable raw body for Stripe webhook
  });
  app.enableCors({
    origin: true,
  });

  app.useStaticAssets(join(process.cwd(), 'public'), { prefix: '/' });

  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'pay', method: RequestMethod.GET },
      { path: 'pay/success', method: RequestMethod.GET },
      { path: 'pay', method: RequestMethod.POST },
      { path: 'icons/*path', method: RequestMethod.GET },
      { path: 'stripe/webhook', method: RequestMethod.POST },
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
