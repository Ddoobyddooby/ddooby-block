import type { CapacitorConfig } from '@capacitor/cli';

// 앱 ID·이름은 설치 후 바꾸지 않는다 (PLAN 7.3)
const config: CapacitorConfig = {
  appId: 'com.ddooby.block',
  appName: 'Ddooby Block',
  webDir: 'dist',
  plugins: {
    // 시스템 바 뒤는 index.html의 검은 배경이다: 바 글자·아이콘은 밝게 (기기가 라이트 모드여도)
    SystemBars: { style: 'DARK' },
  },
};

export default config;
