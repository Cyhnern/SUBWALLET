import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * Bu test paketi ÇALIŞAN bir Postgres + Redis'e ihtiyaç duyar (docker compose up -d).
 * Amaç, mock'lanmış birim testlerin aksine gerçek HTTP katmanı + gerçek veritabanı
 * üzerinden auth akışının uçtan uca doğru çalıştığını doğrulamaktır.
 *
 * CI'da ayrı bir test veritabanı (`DATABASE_URL` .env.test'ten) kullanılması önerilir;
 * bu iskelet basitlik için varsayılan DATABASE_URL'i kullanır.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmail = `e2e-${Date.now()}@ornek.com`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    // Testin bıraktığı veriyi temizle ki paket tekrar tekrar çalıştırılabilsin.
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  it('POST /auth/register -> 201 ve token çifti döner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: testEmail, password: 'gizli123', fullName: 'E2E Test Kullanıcı' })
      .expect(201);

    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  it('aynı e-posta ile ikinci kayıt 409 döner', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: testEmail, password: 'gizli123', fullName: 'Tekrar' })
      .expect(409);
  });

  it('POST /auth/login -> doğru bilgilerle 200 ve token döner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'gizli123' })
      .expect(200);

    expect(res.body).toHaveProperty('accessToken');
  });

  it('POST /auth/login -> yanlış parolayla 401 döner', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'yanlis-parola' })
      .expect(401);
  });

  it('accessToken olmadan korumalı bir uç noktaya erişim 401 döner', async () => {
    await request(app.getHttpServer()).get('/api/v1/subscriptions').expect(401);
  });

  it('geçerli accessToken ile korumalı uç noktaya erişilebilir', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'gizli123' });

    await request(app.getHttpServer())
      .get('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);
  });

  it('POST /auth/refresh -> geçerli refreshToken ile yeni token çifti döner', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'gizli123' });

    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: loginRes.body.refreshToken })
      .expect(200);

    expect(refreshRes.body).toHaveProperty('accessToken');

    // Rotasyon doğrulaması: eski refreshToken artık geçersiz olmalı.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: loginRes.body.refreshToken })
      .expect(401);
  });
});
