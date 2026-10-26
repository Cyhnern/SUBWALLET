import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

describe('Auth & Categories (e2e)', () => {
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
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  it('POST /auth/register -> 201 ve token çifti döner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: testEmail, password: 'SuperGizli123!', fullName: 'E2E Test Kullanıcı' })
      .expect(201);

    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  it('GET /auth/verify-email -> geçerli token ile e-posta doğrulanır', async () => {
    const userInDb = await prisma.user.findUnique({ where: { email: testEmail } });
    const token = userInDb?.verificationToken;
    expect(token).toBeDefined();

    const res = await request(app.getHttpServer())
      .get(`/api/v1/auth/verify-email?token=${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('message');
  });

  it('POST /auth/oauth/google -> sahte/süresi dolmuş idToken ile 401 döner', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/oauth/google')
      .send({ idToken: 'sahte-google-id-token-12345' })
      .expect(401);
  });

  it('POST /auth/oauth/apple -> sahte/süresi dolmuş identityToken ile 401 döner', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/oauth/apple')
      .send({ identityToken: 'sahte-apple-identity-token-12345' })
      .expect(401);
  });

  it('aynı e-posta ile ikinci kayıt 409 döner', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: testEmail, password: 'SuperGizli123!', fullName: 'Tekrar' })
      .expect(409);
  });

  it('POST /auth/login -> doğru bilgilerle 200 ve token döner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'SuperGizli123!' })
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
      .send({ email: testEmail, password: 'SuperGizli123!' });

    await request(app.getHttpServer())
      .get('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);
  });

  it('GET /categories -> 200 ve en az 10 sistem kategorisi döner', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'SuperGizli123!' });

    const catRes = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);

    expect(Array.isArray(catRes.body)).toBe(true);
    expect(catRes.body.length).toBeGreaterThanOrEqual(10);
  });

  it('POST /auth/refresh -> geçerli refreshToken ile yeni token çifti döner', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'SuperGizli123!' });

    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: loginRes.body.refreshToken })
      .expect(200);

    expect(refreshRes.body).toHaveProperty('accessToken');

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: loginRes.body.refreshToken })
      .expect(401);
  });

  it('VERİ İZOLASYONU S-1: A kullanıcısı abonelik ekler, B kullanıcısı ?search= ile aradığında göremez (boş dizi döner)', async () => {
    const emailA = `e2e-a-${Date.now()}@ornek.com`;
    const emailB = `e2e-b-${Date.now()}@ornek.com`;

    const resA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: emailA, password: 'SuperGizli123!', fullName: 'User A' });
    const tokenA = resA.body.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        customName: 'Gizli Netflix A',
        price: 100,
        currency: 'TRY',
        billingCycle: 'monthly',
        startDate: '2026-10-01',
      })
      .expect(201);

    const resB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: emailB, password: 'SuperGizli123!', fullName: 'User B' });
    const tokenB = resB.body.accessToken;

    const searchResB = await request(app.getHttpServer())
      .get('/api/v1/subscriptions?search=Gizli')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(searchResB.body.items).toEqual([]);

    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
  });
});
