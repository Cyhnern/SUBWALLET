import { Platform, Share } from 'react-native';

export function downloadOrShareCsv(csvContent: string, fileName = 'SubWallet_Bütçe_Raporu.csv') {
  if (Platform.OS === 'web') {
    try {
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.log('Web download error:', e);
    }
  } else {
    try {
      Share.share({
        title: 'SubWallet Harcama & Bütçe Raporu',
        message: csvContent,
      });
    } catch (e) {
      console.log('Share error:', e);
    }
  }
}
