import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  FlatList,
  RefreshControl,
} from 'react-native';
import { Card, Button, Paragraph } from 'tamagui';
import Ionicons from '@expo/vector-icons/Ionicons';
import MyMqttClient from '@/utils/mqtt';
import { t, getCurrentLanguage } from '@/utils/i18n';

// 接口定义
interface Warehouse {
  warehouseId: number;
  warehouseName: string;
  description?: string;
}

interface Column {
  columnId: number;
  columnName: string;
  columnOrder: number;
  warehouseId: number;
  vertexes?: Vertex[];
}

interface Vertex {
  positionId: number;
  positionOrder: number;
  status: number;
  columnId: number;
  hxMapVertexesId?: number;
  mapVertex?: {
    id: number;
    code: string;
    codeAlias?: string;
    x: number;
    y: number;
    theta?: number;
  };
}

interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

// 点位状态枚举
enum PositionStatus {
  AVAILABLE = 1,  // 可用
  OCCUPIED = 2,   // 占用
  DISABLED = 3,   // 禁用
}

// 状态颜色映射
const statusColors: Record<PositionStatus, string> = {
  [PositionStatus.AVAILABLE]: '#28a745',  // 绿色
  [PositionStatus.OCCUPIED]: '#ffc107',   // 黄色
  [PositionStatus.DISABLED]: '#6c757d',   // 灰色
};

// 状态文本映射函数
const getStatusText = (status: PositionStatus): string => {
  const statusMap: Record<PositionStatus, string> = {
    [PositionStatus.AVAILABLE]: t('warehouse.status.available'),
    [PositionStatus.OCCUPIED]: t('warehouse.status.occupied'),
    [PositionStatus.DISABLED]: t('warehouse.status.disabled'),
  };
  return statusMap[status] || t('warehouse.status.available');
};

export default function WarehousePage() {
  // 状态管理
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 模态框状态
  const [showPositionDetailModal, setShowPositionDetailModal] = useState(false);
  const [showWarehouseSelector, setShowWarehouseSelector] = useState(false);
  const [showBatchStatusModal, setShowBatchStatusModal] = useState(false);

  // 批量操作状态
  const [selectedPositions, setSelectedPositions] = useState<Set<number>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [batchStatus, setBatchStatus] = useState<PositionStatus>(PositionStatus.AVAILABLE);

  const [selectedPosition, setSelectedPosition] = useState<Vertex | null>(null);

  // 统计数据
  const [usageStats, setUsageStats] = useState({
    total: 0,
    available: 0,
    occupied: 0,
    disabled: 0,
    usagePercent: 0,
  });

  // MQTT 客户端
  const client = MyMqttClient.getInstance(false);

  // 请求ID管理
  const pendingRequestsRef = useRef<Map<number, string>>(new Map()); // 使用 useRef 避免状态更新问题

  // 批量更新请求ID管理 - 防止重复处理
  const batchUpdateRequestRef = useRef<number | null>(null);

  // 批量更新请求信息管理 - 保存请求时的状态信息
  const batchUpdateInfoRef = useRef<{
    positionIds: number[];
    status: PositionStatus;
  } | null>(null);

  // MQTT消息监听器 - 修复请求ID匹配问题
  const listenerMessage = useCallback((topic: string, message: any) => {
    console.log("warehouse topic: ", topic);
    const res = JSON.parse(message.toString());

    // 获取仓库列表响应
    if (topic === client.apiTheme.rep["warehouseAll"]()) {
      console.log("仓库列表响应:", res);
      setLoading(false);
      setRefreshing(false); // 确保刷新状态被重置
      if (res.d.code === 10000) {
        setWarehouses(res.d.value || []);
      } else {
        Alert.alert(t('common.error'), `${t('warehouse.operations.getWarehouseDataFailed')}: ${res.d.msg}`);
      }
    }

    // 获取库位列响应
    else if (topic === client.apiTheme.rep["warehouseColumnList"]()) {
      console.log("库位列响应:", res);
      if (res.d.code === 10000) {
        const columnsData = res.d.value || [];
        console.log("库位列数据:", columnsData);
        
        if (columnsData.length === 0) {
          setColumns([]);
          setUsageStats({
            total: 0,
            available: 0,
            occupied: 0,
            disabled: 0,
            usagePercent: 0,
          });
          setLoading(false);
          setRefreshing(false); // 确保刷新状态被重置
          return;
        }

        setColumns(columnsData.map((column: Column) => ({ ...column, vertexes: [] })));
        pendingRequestsRef.current.clear();

        // 为每个库位列发送点位查询请求
        columnsData.forEach((column: Column, index: number) => {
          const reqId = Date.now() + index * 1000 + Math.floor(Math.random() * 100);
          console.log(`为库位列 ${column.columnId} 发送请求，ID: ${reqId}`);
          
          pendingRequestsRef.current.set(reqId, `vertexes_${column.columnId}`);

          setTimeout(() => {
            client.send("warehouseVertexesList", {
              payload: { d: { reqId, columnId: column.columnId } }
            });
          }, index * 100);
        });

        console.log("设置待处理请求:", Array.from(pendingRequestsRef.current.entries()));
      } else {
        setLoading(false);
        setRefreshing(false); // 确保刷新状态被重置
        Alert.alert(t('common.error'), `${t('warehouse.operations.getColumnDataFailed')}: ${res.d.msg}`);
      }
    }

    // 获取点位列表响应
    else if (topic === client.apiTheme.rep["warehouseVertexesList"]()) {
      console.log("点位列表响应:", res);
      if (res.d.code === 10000) {
        const reqId = res.d.reqId;
        console.log("收到响应，请求ID:", reqId);
        
        const requestType = pendingRequestsRef.current.get(reqId);
        console.log("请求类型:", requestType, "请求ID:", reqId);
        
        if (requestType?.startsWith('vertexes_')) {
          const columnId = parseInt(requestType.split('_')[1]);
          console.log("更新库位列ID:", columnId, "点位数据:", res.d.value);
          
          setColumns(prevColumns => {
            const updatedColumns = prevColumns.map((column: Column) =>
              column.columnId === columnId
                ? { ...column, vertexes: res.d.value || [] }
                : column
            );
            return updatedColumns;
          });

          pendingRequestsRef.current.delete(reqId);
          console.log("移除请求ID:", reqId, "剩余待处理请求:", pendingRequestsRef.current.size);

          if (pendingRequestsRef.current.size === 0) {
            setLoading(false);
            setRefreshing(false); // 确保刷新状态被重置
            setColumns(prevColumns => {
              let total = 0;
              let available = 0;
              let occupied = 0;
              let disabled = 0;

              prevColumns.forEach((column: Column) => {
                if (column.vertexes) {
                  total += column.vertexes.length;
                  column.vertexes.forEach((vertex: Vertex) => {
                    switch (vertex.status) {
                      case PositionStatus.AVAILABLE:
                        available++;
                        break;
                      case PositionStatus.OCCUPIED:
                        occupied++;
                        break;
                      case PositionStatus.DISABLED:
                        disabled++;
                        break;
                      default:
                        available++;
                    }
                  });
                }
              });

              const usagePercent = total > 0 ? Math.round((occupied / total) * 100) : 0;
              
              setUsageStats({
                total,
                available,
                occupied,
                disabled,
                usagePercent,
              });
              
              return prevColumns;
            });
          }
        }
      } else {
        console.log("点位列表请求失败:", res.d.msg);
        Alert.alert(t('common.error'), `${t('warehouse.operations.getPositionDataFailed')}: ${res.d.msg}`);
      }
    }

    // 批量更新点位状态响应
    else if (topic === client.apiTheme.rep["warehousePositionBatchUpdate"]()) {
      const reqId = res.d.reqId;
      console.log("批量更新响应，请求ID:", reqId, "当前记录的请求ID:", batchUpdateRequestRef.current);

      // 检查是否是当前发起的请求，防止重复处理
      if (batchUpdateRequestRef.current && reqId === batchUpdateRequestRef.current && batchUpdateInfoRef.current) {
        const batchInfo = batchUpdateInfoRef.current;
        batchUpdateRequestRef.current = null; // 清除请求ID
        batchUpdateInfoRef.current = null; // 清除请求信息

        if (res.d.code === 10000) {
          Alert.alert(t('common.success'), t('warehouse.operations.batchUpdateSuccess'));

          // 使用保存的请求信息更新本地状态
          console.log("使用保存的批量更新信息:", batchInfo);
          updateLocalPositionStatus(batchInfo.positionIds, batchInfo.status);

          // 异步更新UI状态，避免在MQTT回调中直接更新
          setTimeout(() => {
            setShowBatchStatusModal(false);
            setSelectedPositions(new Set());
            setBatchMode(false);
          }, 100);

          console.log("批量更新成功，已更新本地状态");
        } else {
          Alert.alert(t('common.error'), `${t('warehouse.operations.batchUpdateFailed')}: ${res.d.msg}`);
        }
      } else {
        console.log("忽略重复或无效的批量更新响应");
      }
    }
  }, [client]); // 只依赖client实例

  // 加载仓库数据
  const loadWarehouses = useCallback(() => {
    console.log("loadWarehouses 被调用");
    if (!client.client?.connected) {
      Alert.alert(t('common.error'), t('tasks.mqttNotConnected'));
      return;
    }

    setLoading(true);
    client.send("warehouseAll", { payload: { d: {  } } });
  }, [client]);

  // 加载仓库的库位列数据
  const loadWarehouseColumns = (warehouseId: number) => {
    if (!client.client?.connected) {
      Alert.alert(t('common.error'), t('tasks.mqttNotConnected'));
      return;
    }

    setLoading(true);
    client.send("warehouseColumnList", {
      payload: { d: {  warehouseId } }
    });
  };

  // 更新本地点位状态并重新计算统计数据
  const updateLocalPositionStatus = (positionIds: number[], newStatus: PositionStatus) => {
    console.log("开始更新本地状态，点位IDs:", positionIds, "新状态:", newStatus);

    setColumns(prevColumns => {
      const updatedColumns = prevColumns.map((column: Column) => ({
        ...column,
        vertexes: column.vertexes?.map((vertex: Vertex) => {
          if (positionIds.includes(vertex.positionId)) {
            console.log(`更新点位 ${vertex.positionId} 状态从 ${vertex.status} 到 ${newStatus}`);
            return { ...vertex, status: newStatus };
          }
          return vertex;
        }) || []
      }));

      // 重新计算统计数据
      let total = 0;
      let available = 0;
      let occupied = 0;
      let disabled = 0;

      updatedColumns.forEach((column: Column) => {
        if (column.vertexes) {
          total += column.vertexes.length;
          column.vertexes.forEach((vertex: Vertex) => {
            switch (vertex.status) {
              case PositionStatus.AVAILABLE:
                available++;
                break;
              case PositionStatus.OCCUPIED:
                occupied++;
                break;
              case PositionStatus.DISABLED:
                disabled++;
                break;
              default:
                available++;
            }
          });
        }
      });

      const usagePercent = total > 0 ? Math.round((occupied / total) * 100) : 0;

      console.log("重新计算统计数据:", { total, available, occupied, disabled, usagePercent });

      // 使用setTimeout确保状态更新在下一个事件循环中执行
      setTimeout(() => {
        setUsageStats({
          total,
          available,
          occupied,
          disabled,
          usagePercent,
        });
        console.log("统计数据已更新");
      }, 0);

      return updatedColumns;
    });
  };

// 批量操作相关函数
  const togglePositionSelection = (positionId: number) => {
    const newSelected = new Set(selectedPositions);
    if (newSelected.has(positionId)) {
      newSelected.delete(positionId);
    } else {
      newSelected.add(positionId);
    }
    setSelectedPositions(newSelected);
  };

  const selectAllPositions = () => {
    const allPositionIds = new Set<number>();
    columns.forEach((column: Column) => {
      column.vertexes?.forEach((vertex: Vertex) => {
        allPositionIds.add(vertex.positionId);
      });
    });
    setSelectedPositions(allPositionIds);
  };

  const clearSelection = () => {
    setSelectedPositions(new Set());
  };

  const batchUpdateStatus = () => {
    if (selectedPositions.size === 0) {
      Alert.alert(t('common.confirm'), t('warehouse.operations.pleaseSelectPositions'));
      return;
    }

    if (!client.client?.connected) {
      Alert.alert(t('common.error'), t('tasks.mqttNotConnected'));
      return;
    }

    // 二次确认
    const statusText = getStatusText(batchStatus);
    const confirmMessage = `确定要将选中的 ${selectedPositions.size} 个点位状态修改为"${statusText}"吗？\n\n此操作不可撤销，请谨慎操作。`;
    const confirmMessageEn = `Are you sure you want to modify ${selectedPositions.size} selected positions to "${statusText}"?\n\nThis operation cannot be undone, please proceed with caution.`;

    Alert.alert(
      t('warehouse.operations.confirmBatchModify'),
      getCurrentLanguage().startsWith('zh') ? confirmMessage : confirmMessageEn,
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('warehouse.confirmModify'),
          style: 'destructive',
          onPress: () => {
            // 执行批量更新
            const reqId = Date.now() + Math.floor(Math.random() * 1000);
            const positionIds = Array.from(selectedPositions);

            // 保存请求信息，用于响应时更新本地状态
            batchUpdateRequestRef.current = reqId;
            batchUpdateInfoRef.current = {
              positionIds,
              status: batchStatus
            };

            console.log("发起批量更新请求，请求ID:", reqId, "点位IDs:", positionIds, "状态:", batchStatus);

            client.send("warehousePositionBatchUpdate", {
              payload: {
                d: {
                  reqId,
                  positionIds,
                  status: batchStatus
                }
              }
            });
          }
        }
      ]
    );
  };

  // 选择仓库
  const selectWarehouse = (warehouse: Warehouse) => {
    setSelectedWarehouse(warehouse);
    setSelectedPositions(new Set());
    setBatchMode(false);
    loadWarehouseColumns(warehouse.warehouseId);
  };

  // 刷新数据
  const onRefresh = useCallback(() => {
    console.log("onRefresh 被调用");
    setRefreshing(true);

    // 重置状态
    setColumns([]);
    setUsageStats({
      total: 0,
      available: 0,
      occupied: 0,
      disabled: 0,
      usagePercent: 0,
    });

    // 清理待处理的请求
    pendingRequestsRef.current.clear();

    // 加载数据 - refreshing状态会在数据加载完成后自动重置
    loadWarehouses();
    if (selectedWarehouse) {
      loadWarehouseColumns(selectedWarehouse.warehouseId);
    }
  }, [loadWarehouses, selectedWarehouse]);

  // 显示点位详情
  const showPositionDetails = (vertex: Vertex) => {
    if (batchMode) {
      togglePositionSelection(vertex.positionId);
    } else {
      setSelectedPosition(vertex);
      setShowPositionDetailModal(true);
    }
  };

  // 初始化和MQTT连接管理
  useEffect(() => {
    if (!client.client?.connected) {
      console.log("MQTT未连接 - warehouse");
      return;
    }

    console.log("初始化仓库页面，开始订阅和加载数据");

    // 订阅仓库相关的主题
    client.subscribe("warehouseAll");
    client.subscribe("warehouseColumnList");
    client.subscribe("warehouseVertexesList");
    client.subscribe("warehousePositionBatchUpdate");

    // 监听消息
    client.listenerMessage("message", listenerMessage);

    // 初始加载数据
    loadWarehouses();

    return () => {
      console.log("清理仓库页面监听器");
      client.removeListener("message", listenerMessage);
      pendingRequestsRef.current.clear();
      batchUpdateRequestRef.current = null; // 清理批量更新请求ID
      batchUpdateInfoRef.current = null; // 清理批量更新请求信息
    };
  }, [client.client?.connected]); // 移除对listenerMessage的依赖

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* 头部控制区域 */}
        <View style={styles.header}>
          {/* 仓库选择器 */}
          <View style={styles.headerWarehouseSelector}>
            <TouchableOpacity
              style={styles.headerSelectButton}
              onPress={() => setShowWarehouseSelector(!showWarehouseSelector)}
            >
              <Text style={styles.headerSelectButtonText}>
                {selectedWarehouse?.warehouseName || t('warehouse.selectWarehouse')}
              </Text>
              <Ionicons
                name={showWarehouseSelector ? "chevron-up" : "chevron-down"}
                size={16}
                color="#666"
              />
            </TouchableOpacity>

              {showWarehouseSelector && (
                  <View style={styles.headerDropdownContainer}>
                      <FlatList
                          data={warehouses}
                          keyExtractor={(item) => item.warehouseId.toString()}
                          showsVerticalScrollIndicator={true}
                          renderItem={({ item: warehouse }) => (
                              <TouchableOpacity
                                  style={[
                                      styles.headerDropdownItem,
                                      selectedWarehouse?.warehouseId === warehouse.warehouseId && styles.headerSelectedItem
                                  ]}
                                  onPress={() => {
                                      selectWarehouse(warehouse);
                                      setShowWarehouseSelector(false);
                                  }}
                              >
                                  <Text style={[
                                      styles.headerDropdownItemText,
                                      selectedWarehouse?.warehouseId === warehouse.warehouseId && styles.headerSelectedItemText
                                  ]}>
                                      {warehouse.warehouseName}
                                  </Text>
                              </TouchableOpacity>
                          )}
                      />
                  </View>
              )}
          </View>

          <View style={styles.headerButtons}>
            {!batchMode ? (
              <TouchableOpacity
                style={[styles.headerButton, styles.primaryButton]}
                onPress={() => setBatchMode(true)}
              >
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={styles.buttonText}>{t('warehouse.batchOperations')}</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.headerButton, styles.successButton]}
                  onPress={() => setShowBatchStatusModal(true)}
                  disabled={selectedPositions.size === 0}
                >
                  <Ionicons name="create" size={16} color="#fff" />
                  <Text style={styles.buttonText}>{t('warehouse.modifyStatus')}({selectedPositions.size})</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.headerButton, styles.warningButton]}
                  onPress={() => {
                    setBatchMode(false);
                    setSelectedPositions(new Set());
                  }}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                  <Text style={styles.buttonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* 批量操作提示 */}
        {batchMode && (
          <Card style={styles.batchTipCard}>
            <View style={styles.batchTipContainer}>
              <Text style={styles.batchTipText}>
                {getCurrentLanguage().startsWith('zh')
                  ? `批量操作模式：点击点位进行选择，已选择 ${selectedPositions.size} 个点位`
                  : `Batch mode: Click positions to select, ${selectedPositions.size} positions selected`
                }
              </Text>
              <View style={styles.batchActions}>
                <TouchableOpacity
                  style={styles.batchActionButton}
                  onPress={selectAllPositions}
                >
                  <Text style={styles.batchActionText}>{t('warehouse.selectAll')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.batchActionButton}
                  onPress={clearSelection}
                >
                  <Text style={styles.batchActionText}>{t('warehouse.clearSelection')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Card>
        )}

        {/* 仓库信息和统计 */}
        {selectedWarehouse && (
          <Card style={styles.infoCard}>
            <Card.Header>
              <Text style={styles.warehouseTitle}>{selectedWarehouse.warehouseName}</Text>
              <Paragraph style={styles.warehouseDesc}>
                {selectedWarehouse.description || t('warehouse.noDescription')}
              </Paragraph>
            </Card.Header>
            <View style={styles.statsContainer}>
              <View style={styles.usageStats}>
                <Text style={styles.usagePercent}>{usageStats.usagePercent}%</Text>
                <Text style={styles.usageLabel}>{t('warehouse.usageRate')}</Text>
              </View>
              <View style={styles.detailedStats}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{usageStats.total}</Text>
                  <Text style={styles.statLabel}>{t('warehouse.totalPositions')}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: statusColors[PositionStatus.AVAILABLE] }]}>
                    {usageStats.available}
                  </Text>
                  <Text style={styles.statLabel}>{t('warehouse.availablePositions')}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: statusColors[PositionStatus.OCCUPIED] }]}>
                    {usageStats.occupied}
                  </Text>
                  <Text style={styles.statLabel}>{t('warehouse.occupiedPositions')}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: statusColors[PositionStatus.DISABLED] }]}>
                    {usageStats.disabled}
                  </Text>
                  <Text style={styles.statLabel}>{t('warehouse.disabledPositions')}</Text>
                </View>
              </View>
            </View>
          </Card>
        )}
        {/* 可视化展示区域 */}
        {selectedWarehouse && (
          <Card style={styles.visualizationCard}>
            <Card.Header>
              <Text style={styles.cardTitle}>{t('warehouse.visualization')}</Text>
            </Card.Header>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.warehouseGrid}>
                {columns.map((column: Column) => (
                  <View key={column.columnId} style={styles.warehouseColumn}>
                    <Text style={styles.columnHeader}>{column.columnName}</Text>
                    <View style={styles.positionsContainer}>
                      {column.vertexes && column.vertexes.length > 0 ? (
                        column.vertexes
                          .sort((a: Vertex, b: Vertex) => a.positionOrder - b.positionOrder)
                          .map((vertex: Vertex) => (
                            <TouchableOpacity
                              key={vertex.positionId}
                              style={[
                                styles.positionButton,
                                { 
                                  backgroundColor: statusColors[vertex.status as PositionStatus] || statusColors[PositionStatus.AVAILABLE],
                                  borderWidth: batchMode && selectedPositions.has(vertex.positionId) ? 3 : 0,
                                  borderColor: '#007bff'
                                }
                              ]}
                              onPress={() => showPositionDetails(vertex)}
                            >
                              <Text style={styles.positionText}>
                                {vertex.mapVertex?.codeAlias || vertex.mapVertex?.code || `P${vertex.positionOrder}`}
                              </Text>
                              {batchMode && selectedPositions.has(vertex.positionId) && (
                                <View style={styles.selectedIndicator}>
                                  <Ionicons name="checkmark" size={12} color="#007bff" />
                                </View>
                              )}
                            </TouchableOpacity>
                          ))
                      ) : (
                        <View style={styles.emptyPosition}>
                          <Text style={styles.emptyText}>
                            {loading ? '加载中...' : '无点位'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
            {columns.length === 0 && !loading && (
              <View style={styles.emptyState}>
                <Ionicons name="cube-outline" size={48} color="#ccc" />
                <Text style={styles.emptyStateText}>{t('warehouse.noWarehouse')}</Text>
              </View>
            )}
            {loading && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>{t('common.loading')}</Text>
              </View>
            )}
          </Card>
        )}

        {/* 管理视图 - 删除这整个部分 */}

        {/* 添加仓库模态框 - 删除这整个部分 */}
      </ScrollView>

      {/* 点位详情模态框 */}
      <Modal
        visible={showPositionDetailModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPositionDetailModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>点位详情</Text>
              <TouchableOpacity onPress={() => setShowPositionDetailModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            {selectedPosition && (
              <View style={styles.modalBody}>
                <View style={styles.detailSection}>
                  <Text style={styles.sectionTitle}>{t('warehouse.positionDetail')}</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('warehouse.positionId')}:</Text>
                    <Text style={styles.detailValue}>{String(selectedPosition.positionId)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('warehouse.positionOrder')}:</Text>
                    <Text style={styles.detailValue}>{String(selectedPosition.positionOrder)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('warehouse.currentStatus')}:</Text>
                    <View style={[
                      styles.statusBadge,
                      { backgroundColor: statusColors[selectedPosition.status as PositionStatus] || statusColors[PositionStatus.AVAILABLE] }
                    ]}>
                      <Text style={styles.statusText}>
                        {getStatusText(selectedPosition.status as PositionStatus)}
                      </Text>
                    </View>
                  </View>
                </View>

                {selectedPosition.mapVertex && (
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>{t('warehouse.mapPositionInfo')}</Text>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{t('warehouse.positionCode')}:</Text>
                      <Text style={styles.detailValue}>{selectedPosition.mapVertex.code}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{t('warehouse.positionAlias')}:</Text>
                      <Text style={styles.detailValue}>
                        {selectedPosition.mapVertex.codeAlias || t('warehouse.noAlias')}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{t('warehouse.coordinates')}:</Text>
                      <Text style={styles.detailValue}>
                        ({selectedPosition.mapVertex.x}, {selectedPosition.mapVertex.y})
                      </Text>
                    </View>
                    {selectedPosition.mapVertex.theta !== undefined && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>{t('warehouse.angle')}:</Text>
                        <Text style={styles.detailValue}>{selectedPosition.mapVertex.theta}°</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowPositionDetailModal(false)}
              >
                <Text style={styles.cancelButtonText}>{t('common.close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 批量修改状态模态框 */}
      <Modal
        visible={showBatchStatusModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowBatchStatusModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('warehouse.batchModifyStatus')}</Text>
              <TouchableOpacity onPress={() => setShowBatchStatusModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.formLabel}>
                {getCurrentLanguage().startsWith('zh')
                  ? `将选中的 ${selectedPositions.size} 个点位状态修改为：`
                  : `Modify ${selectedPositions.size} selected positions to:`
                }
              </Text>
              
              <View style={styles.statusOptions}>
                {Object.values(PositionStatus).filter(v => typeof v === 'number').map((status: number) => (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.statusOption,
                      {
                        backgroundColor: statusColors[status as PositionStatus],
                        borderWidth: batchStatus === status ? 3 : 1,
                        borderColor: batchStatus === status ? '#333' : '#ddd'
                      }
                    ]}
                    onPress={() => setBatchStatus(status as PositionStatus)}
                  >
                    <Text style={styles.statusOptionText}>{getStatusText(status as PositionStatus)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowBatchStatusModal(false)}
              >
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={batchUpdateStatus}
              >
                <Text style={styles.confirmButtonText}>{t('warehouse.confirmModify')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerWarehouseSelector: {
    flex: 1,
    marginRight: 16,
    position: 'relative',
  },
  headerSelectButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#dee2e6',
    minHeight: 36,
  },
  headerSelectButtonText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    fontWeight: '500',
  },
  headerDropdownContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#dee2e6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    maxHeight: 200,
    zIndex: 1000,
  },
  headerDropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerSelectedItem: {
    backgroundColor: '#e3f2fd',
  },
  headerDropdownItemText: {
    fontSize: 14,
    color: '#333',
  },
  headerSelectedItemText: {
    color: '#1976d2',
    fontWeight: '600',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 4,
  },
  successButton: {
    backgroundColor: '#28a745',
  },
  primaryButton: {
    backgroundColor: '#007bff',
  },
  buttonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  selectorCard: {
    margin: 16,
    marginBottom: 8,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  selectorLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  selectorContainer: {
    minHeight: 40,
  },
  infoCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  warehouseTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  warehouseDesc: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  usageStats: {
    alignItems: 'center',
  },
  usagePercent: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007bff',
  },
  usageLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  detailedStats: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  visualizationCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  warehouseGrid: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 0,
  },
  warehouseColumn: {
    minWidth: 120,
    alignItems: 'center',
  },
  columnHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  positionsContainer: {
    gap: 8,
  },
  positionButton: {
    width: 80,
    height: 40,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  positionText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
  },
  emptyPosition: {
    width: 80,
    height: 40,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderStyle: 'dashed',
  },
  emptyText: {
    color: '#6c757d',
    fontSize: 10,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  managementCard: {
    margin: 16,
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  columnItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  columnInfo: {
    flex: 1,
  },
  columnName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  columnDetails: {
    fontSize: 12,
    color: '#666',
  },
  columnActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    padding: 8,
  },
  // 模态框样式
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalBody: {
    padding: 20,
    maxHeight: 400,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  confirmButton: {
    backgroundColor: '#007bff',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  // 表单样式
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  // 详情样式
  detailSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  selectButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  selectButtonText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  dropdownContainer: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dee2e6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    maxHeight: 200,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  selectedItem: {
    backgroundColor: '#e3f2fd',
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#333',
  },
  selectedItemText: {
    color: '#1976d2',
    fontWeight: '600',
  },
  batchTipCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: '#e3f2fd',
    borderColor: '#2196f3',
    borderWidth: 1,
  },
  batchTipContainer: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  batchTipText: {
    fontSize: 14,
    color: '#1976d2',
    flex: 1,
  },
  batchActions: {
    flexDirection: 'row',
    gap: 8,
  },
  batchActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#2196f3',
    borderRadius: 4,
  },
  batchActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  selectedIndicator: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#fff',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  warningButton: {
    backgroundColor: '#ff9800',
  },
  statusOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 16,
  },
  statusOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  statusOptionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
