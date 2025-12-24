import AsyncStorage from "@react-native-async-storage/async-storage";

export class StorageUtil {
  static async setItem(key: string, value: any): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error("存储数据失败:", error);
      throw error;
    }
  }

  static async getItem<T>(key: string): Promise<T | null> {
    try {
      const value = await AsyncStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error("获取数据失败:", error);
      throw error;
    }
  }

  static async removeItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error("移除数据失败:", error);
      throw error;
    }
  }

  static async clear(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      console.error("清空数据失败:", error);
      throw error;
    }
  }

  static async getAllKeys(): Promise<string[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      return keys as string[];
    } catch (error) {
      console.error("获取所有keys失败:", error);
      throw error;
    }
  }
}
