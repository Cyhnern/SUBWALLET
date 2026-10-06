import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SYSTEM_CATEGORIES = [
  { name: 'Video Yayın (Streaming)', icon: 'ti-device-tv', colorHex: '#D85A30' },
  { name: 'Müzik', icon: 'ti-music', colorHex: '#7F77DD' },
  { name: 'Yazılım & Araçlar', icon: 'ti-code', colorHex: '#378ADD' },
  { name: 'Bulut Depolama', icon: 'ti-cloud', colorHex: '#1D9E75' },
  { name: 'Oyun', icon: 'ti-device-gamepad-2', colorHex: '#D4537E' },
  { name: 'Fitness & Sağlık', icon: 'ti-heartbeat', colorHex: '#639922' },
  { name: 'Haberler & Dergiler', icon: 'ti-news', colorHex: '#888780' },
  { name: 'Eğitim', icon: 'ti-school', colorHex: '#BA7517' },
  { name: 'Yemek & Market', icon: 'ti-shopping-cart', colorHex: '#EF9F27' },
  { name: 'Diğer', icon: 'ti-dots', colorHex: '#5F5E5A' },
];

async function main() {
  for (const category of SYSTEM_CATEGORIES) {
    // isSystem kategorilerde userId NULL'dır; benzersizlik `name` üzerinden
    // manuel kontrol edilir çünkü compound unique index (userId, name) NULL
    // userId için Postgres'te tekrar edebilir.
    const existing = await prisma.category.findFirst({
      where: { name: category.name, isSystem: true },
    });
    if (existing) {
      console.log(`Zaten mevcut, atlanıyor: ${category.name}`);
      continue;
    }
    await prisma.category.create({
      data: { ...category, isSystem: true, userId: null },
    });
    console.log(`Oluşturuldu: ${category.name}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
