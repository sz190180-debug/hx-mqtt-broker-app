import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 导入语言包
import zhCN from '../locales/zh-CN.json';
import enUS from '../locales/en-US.json';

// 创建i18n实例
const i18n = new I18n({
  'zh-CN': zhCN,
  'zh': zhCN, // 简化的中文标识符
  'en-US': enUS,
  'en': enUS, // 简化的英文标识符
});

// 设置默认语言
i18n.defaultLocale = 'zh-CN';
i18n.enableFallback = true;

// 当前语言状态
let currentLocale = 'zh-CN';

// 语言存储键
const LANGUAGE_KEY = '@app_language';

// 获取设备语言
const getDeviceLanguage = (): string => {
  const deviceLocale = Localization.getLocales()[0]?.languageTag || 'zh-CN';
  
  // 支持的语言列表
  const supportedLocales = ['zh-CN', 'zh', 'en-US', 'en'];
  
  // 检查设备语言是否在支持列表中
  if (supportedLocales.includes(deviceLocale)) {
    return deviceLocale;
  }
  
  // 检查语言代码（不包括地区）
  const languageCode = deviceLocale.split('-')[0];
  if (supportedLocales.includes(languageCode)) {
    return languageCode;
  }
  
  // 默认返回中文
  return 'zh-CN';
};

// 初始化语言设置
export const initializeI18n = async (): Promise<void> => {
  try {
    // 尝试从存储中获取用户设置的语言
    const savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
    
    if (savedLanguage) {
      currentLocale = savedLanguage;
      i18n.locale = savedLanguage;
    } else {
      // 如果没有保存的语言设置，使用设备语言
      const deviceLanguage = getDeviceLanguage();
      currentLocale = deviceLanguage;
      i18n.locale = deviceLanguage;
      // 保存设备语言作为默认设置
      await AsyncStorage.setItem(LANGUAGE_KEY, deviceLanguage);
    }
  } catch (error) {
    console.warn('Failed to initialize i18n:', error);
    // 如果出错，使用默认语言
    currentLocale = 'zh-CN';
    i18n.locale = 'zh-CN';
  }
};

// 切换语言
export const changeLanguage = async (locale: string): Promise<void> => {
  try {
    currentLocale = locale;
    i18n.locale = locale;
    await AsyncStorage.setItem(LANGUAGE_KEY, locale);
  } catch (error) {
    console.warn('Failed to change language:', error);
  }
};

// 获取当前语言
export const getCurrentLanguage = (): string => {
  return currentLocale;
};

// 获取支持的语言列表
export const getSupportedLanguages = () => [
  { code: 'zh-CN', name: '中文' },
  { code: 'en-US', name: 'English' },
];

// 翻译函数
export const t = (key: string, options?: any): string => {
  return i18n.t(key, options);
};

// 导出i18n实例
export default i18n;
