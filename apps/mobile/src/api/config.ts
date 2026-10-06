// ÖNEMLİ: Telefonun, bilgisayarındaki API'ye "localhost" üzerinden ulaşamaz —
// çünkü localhost, telefonun kendisini işaret eder, bilgisayarını değil.
// Bunun yerine bilgisayarının yerel ağ IP'sini kullanman gerekiyor.
//
// Bilgisayarının IP'sini bulmak için (Windows CMD): ipconfig
// "IPv4 Address" satırındaki değeri kullan, örn. 192.168.1.42
//
// Telefonun ve bilgisayarın AYNI Wi-Fi ağında olması şart.
export const API_BASE_URL = 'http://192.168.1.42:3000/api/v1';
