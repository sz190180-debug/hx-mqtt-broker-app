import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { t, getCurrentLanguage } from '@/utils/i18n';
import { LanguageSwitcher } from './LanguageSwitcher';

export function I18nDemo() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleLanguageChange = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <ScrollView style={styles.container} key={refreshKey}>
      <View style={styles.header}>
        <Text style={styles.title}>国际化演示 / I18n Demo</Text>
        <Text style={styles.subtitle}>当前语言 / Current Language: {getCurrentLanguage()}</Text>
        <LanguageSwitcher onLanguageChange={handleLanguageChange} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>通用文案 / Common Text</Text>
        <Text style={styles.item}>加载中: {t('common.loading')}</Text>
        <Text style={styles.item}>没有更多: {t('common.noMore')}</Text>
        <Text style={styles.item}>错误: {t('common.error')}</Text>
        <Text style={styles.item}>成功: {t('common.success')}</Text>
        <Text style={styles.item}>确认: {t('common.confirm')}</Text>
        <Text style={styles.item}>取消: {t('common.cancel')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>登录页面 / Login Page</Text>
        <Text style={styles.item}>标题: {t('login.title')}</Text>
        <Text style={styles.item}>用户名: {t('login.username')}</Text>
        <Text style={styles.item}>密码: {t('login.password')}</Text>
        <Text style={styles.item}>登录按钮: {t('login.loginButton')}</Text>
        <Text style={styles.item}>连接中: {t('login.connecting')}</Text>
        <Text style={styles.item}>登录成功: {t('login.loginSuccess')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>标签页 / Tabs</Text>
        <Text style={styles.item}>任务: {t('tabs.tasks')}</Text>
        <Text style={styles.item}>车辆: {t('tabs.vehicles')}</Text>
        <Text style={styles.item}>仓库: {t('tabs.warehouse')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>任务页面 / Tasks Page</Text>
        <Text style={styles.item}>全部分组: {t('tasks.allGroups')}</Text>
        <Text style={styles.item}>选择分组: {t('tasks.selectGroup')}</Text>
        <Text style={styles.item}>发送成功: {t('tasks.sendSuccess')}</Text>
        <Text style={styles.item}>发送失败: {t('tasks.sendFailed')}</Text>
        <Text style={styles.item}>任务执行中: {t('tasks.taskExecuting')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>车辆页面 / Vehicles Page</Text>
        <Text style={styles.item}>我的车辆: {t('vehicles.title')}</Text>
        <Text style={styles.item}>暂无车辆: {t('vehicles.noVehicles')}</Text>
        <Text style={styles.item}>电量: {t('vehicles.batteryLevel')}</Text>
        <Text style={styles.item}>空闲: {t('vehicles.status.idle')}</Text>
        <Text style={styles.item}>工作中: {t('vehicles.status.working')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>仓库页面 / Warehouse Page</Text>
        <Text style={styles.item}>仓库管理: {t('warehouse.title')}</Text>
        <Text style={styles.item}>选择仓库: {t('warehouse.selectWarehouse')}</Text>
        <Text style={styles.item}>库位使用率: {t('warehouse.usageRate')}</Text>
        <Text style={styles.item}>总点位: {t('warehouse.totalPositions')}</Text>
        <Text style={styles.item}>可用: {t('warehouse.status.available')}</Text>
        <Text style={styles.item}>占用: {t('warehouse.status.occupied')}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  header: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  section: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 5,
  },
  item: {
    fontSize: 14,
    marginBottom: 8,
    color: '#555',
    paddingLeft: 10,
  },
});
