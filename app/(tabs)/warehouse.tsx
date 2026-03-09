import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    Modal,
    FlatList,
    RefreshControl,
    Dimensions, // 引入 Dimensions 用于辅助定位
    Platform,
    TextInput
} from 'react-native';
import {Card, Paragraph} from 'tamagui';
import Ionicons from '@expo/vector-icons/Ionicons';
import MyMqttClient from '@/utils/mqtt';
import {t, getCurrentLanguage} from '@/utils/i18n';

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
    weight?: number;
    mapVertex?: {
        id: number;
        code: string;
        codeAlias?: string;
        x: number;
        y: number;
        theta?: number;
    };
}

enum PositionStatus {
    AVAILABLE = 1,
    OCCUPIED = 2,
    DISABLED = 3,
}

const statusColors: Record<PositionStatus, string> = {
    [PositionStatus.AVAILABLE]: '#28a745',
    [PositionStatus.OCCUPIED]: '#ffc107',
    [PositionStatus.DISABLED]: '#6c757d',
};

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
    const [showEditDescModal, setShowEditDescModal] = useState(false);

    // === 新增：编辑模态框状态 ===
    const [showEditModal, setShowEditModal] = useState(false);

    // 批量操作状态
    const [selectedPositions, setSelectedPositions] = useState<Set<number>>(new Set());
    const [batchMode, setBatchMode] = useState(false);
    const [batchStatus, setBatchStatus] = useState<PositionStatus>(PositionStatus.AVAILABLE);

    const [selectedPosition, setSelectedPosition] = useState<Vertex | null>(null);
    // 编辑相关状态
    const [editWeight, setEditWeight] = useState<string>('');
    const [editStatus, setEditStatus] = useState<PositionStatus>(PositionStatus.AVAILABLE);

    // 编辑备注状态
    const [editingDescription, setEditingDescription] = useState('');

    // 统计数据
    const [usageStats, setUsageStats] = useState({
        total: 0, available: 0, occupied: 0, disabled: 0, usagePercent: 0,
    });

    // MQTT 客户端
    const client = MyMqttClient.getInstance(false);
    const pendingRequestsRef = useRef<Map<number, string>>(new Map());
    const batchUpdateRequestRef = useRef<number | null>(null);
    const batchUpdateInfoRef = useRef<{ positionIds: number[]; status: PositionStatus; } | null>(null);
    const warehouseUpdateRequestRef = useRef<number | null>(null);
    const warehouseUpdateInfoRef = useRef<{ warehouseId: number; description: string; } | null>(null);

    const listenerMessage = useCallback((topic: string, message: any) => {
        const res = JSON.parse(message.toString());
        if (topic === client.apiTheme.rep["warehouseAll"]()) {
            setLoading(false);
            setRefreshing(false);
            if (res.d.code === 10000) setWarehouses(res.d.value || []);
            else Alert.alert(t('common.error'), `${t('warehouse.operations.getWarehouseDataFailed')}: ${res.d.msg}`);
        } else if (topic === client.apiTheme.rep["warehouseColumnList"]()) {
            if (res.d.code === 10000) {
                const columnsData = res.d.value || [];
                if (columnsData.length === 0) {
                    setColumns([]);
                    setUsageStats({total: 0, available: 0, occupied: 0, disabled: 0, usagePercent: 0});
                    setLoading(false);
                    setRefreshing(false);
                    return;
                }
                setColumns(columnsData.map((column: Column) => ({...column, vertexes: []})));
                pendingRequestsRef.current.clear();
                columnsData.forEach((column: Column, index: number) => {
                    const reqId = Date.now() + index * 1000 + Math.floor(Math.random() * 100);
                    pendingRequestsRef.current.set(reqId, `vertexes_${column.columnId}`);
                    setTimeout(() => {
                        client.send("warehouseVertexesList", {payload: {d: {reqId, columnId: column.columnId}}});
                    }, index * 100);
                });
            } else {
                setLoading(false);
                setRefreshing(false);
                Alert.alert(t('common.error'), `${t('warehouse.operations.getColumnDataFailed')}: ${res.d.msg}`);
            }
        } else if (topic === client.apiTheme.rep["warehouseVertexesList"]()) {
            if (res.d.code === 10000) {
                const reqId = res.d.reqId;
                const requestType = pendingRequestsRef.current.get(reqId);
                if (requestType?.startsWith('vertexes_')) {
                    const columnId = parseInt(requestType.split('_')[1]);
                    setColumns(prevColumns => prevColumns.map((column: Column) =>
                        column.columnId === columnId ? {...column, vertexes: res.d.value || []} : column
                    ));
                    pendingRequestsRef.current.delete(reqId);
                    if (pendingRequestsRef.current.size === 0) {
                        setLoading(false);
                        setRefreshing(false);
                        setColumns(prevColumns => {
                            let total = 0, available = 0, occupied = 0, disabled = 0;
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
                            setUsageStats({total, available, occupied, disabled, usagePercent});
                            return prevColumns;
                        });
                    }
                }
            }
        } else if (topic === client.apiTheme.rep["warehousePositionBatchUpdate"]()) {
            const reqId = res.d.reqId;
            if (batchUpdateRequestRef.current && reqId === batchUpdateRequestRef.current && batchUpdateInfoRef.current) {
                const batchInfo = batchUpdateInfoRef.current;
                batchUpdateRequestRef.current = null;
                batchUpdateInfoRef.current = null;
                if (res.d.code === 10000) {
                    Alert.alert(t('common.success'), t('warehouse.operations.batchUpdateSuccess'));
                    updateLocalPositionStatus(batchInfo.positionIds, batchInfo.status);
                    setTimeout(() => {
                        setShowBatchStatusModal(false);
                        setSelectedPositions(new Set());
                        setBatchMode(false);
                    }, 100);
                } else {
                    Alert.alert(t('common.error'), `${t('warehouse.operations.batchUpdateFailed')}: ${res.d.msg}`);
                }
            }
        } else if (topic === client.apiTheme.rep["warehouseVertexesUpdate"]?.() || topic.includes("warehouseVertexesUpdate")) {
            // 处理单个更新回调
            if (res.d.code === 10000) {
                Alert.alert(t('common.success'), '更新成功');
                setShowEditModal(false); // 关闭编辑框
                if (selectedPosition) {
                    // 刷新该列数据
                    const reqId = Date.now();
                    pendingRequestsRef.current.set(reqId, `vertexes_${selectedPosition.columnId}`);
                    client.send("warehouseVertexesList", {payload: {d: {reqId, columnId: selectedPosition.columnId}}});
                }
            } else {
                Alert.alert(t('common.error'), res.d.msg || '更新失败');
            }
        } else if (topic === client.apiTheme.rep["warehouseUpdate"]()) {
            const reqId = res.d.reqId;
            console.log('收到仓库更新响应:', res, 'reqId:', reqId);

            if (warehouseUpdateRequestRef.current && reqId === warehouseUpdateRequestRef.current && warehouseUpdateInfoRef.current) {
                const updateInfo = warehouseUpdateInfoRef.current;

                warehouseUpdateRequestRef.current = null;
                warehouseUpdateInfoRef.current = null;

                if (res.d.code === 10000) {
                    Alert.alert(t('common.success'), t('warehouse.operations.updateDescSuccess'));

                    setSelectedWarehouse(prev => prev ? {...prev, description: updateInfo.description} : prev);
                    setWarehouses(prev => prev.map(w =>
                        w.warehouseId === updateInfo.warehouseId
                            ? {...w, description: updateInfo.description}
                            : w
                    ));

                    setShowEditDescModal(false);
                } else {
                    Alert.alert(t('common.error'), `${t('warehouse.operations.updateDescFailed')}: ${res.d.msg}`);
                }
            }
        }
    }, [client, selectedPosition]);

    const loadWarehouses = useCallback(() => {
        if (!client.client?.connected) {
            Alert.alert(t('common.error'), t('tasks.mqttNotConnected'));
            return;
        }
        setLoading(true);
        client.send("warehouseAll", {payload: {d: {}}});
    }, [client]);

    const loadWarehouseColumns = (warehouseId: number) => {
        if (!client.client?.connected) {
            Alert.alert(t('common.error'), t('tasks.mqttNotConnected'));
            return;
        }
        setLoading(true);
        client.send("warehouseColumnList", {payload: {d: {warehouseId}}});
    };

    const updateLocalPositionStatus = (positionIds: number[], newStatus: PositionStatus) => {
        setColumns(prevColumns => {
            const updatedColumns = prevColumns.map((column: Column) => ({
                ...column,
                vertexes: column.vertexes?.map((vertex: Vertex) => {
                    if (positionIds.includes(vertex.positionId)) return {...vertex, status: newStatus};
                    return vertex;
                }) || []
            }));
            let total = 0, available = 0, occupied = 0, disabled = 0;
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
            setTimeout(() => {
                setUsageStats({total, available, occupied, disabled, usagePercent});
            }, 0);
            return updatedColumns;
        });
    };

    const togglePositionSelection = (positionId: number) => {
        const newSelected = new Set(selectedPositions);
        if (newSelected.has(positionId)) newSelected.delete(positionId); else newSelected.add(positionId);
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
        const statusText = getStatusText(batchStatus);
        const confirmMessage = `确定要将选中的 ${selectedPositions.size} 个点位状态修改为"${statusText}"吗？\n\n此操作不可撤销，请谨慎操作。`;
        const confirmMessageEn = `Are you sure you want to modify ${selectedPositions.size} selected positions to "${statusText}"?\n\nThis operation cannot be undone, please proceed with caution.`;

        Alert.alert(t('warehouse.operations.confirmBatchModify'), getCurrentLanguage().startsWith('zh') ? confirmMessage : confirmMessageEn, [
            {text: t('common.cancel'), style: 'cancel'},
            {
                text: t('warehouse.confirmModify'), style: 'destructive', onPress: () => {
                    const reqId = Date.now() + Math.floor(Math.random() * 1000);
                    const positionIds = Array.from(selectedPositions);
                    batchUpdateRequestRef.current = reqId;
                    batchUpdateInfoRef.current = {positionIds, status: batchStatus};
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
        ]);
    };

    const saveWarehouseDescription = () => {
        if (!selectedWarehouse) return;
        if (!client.client?.connected) {
            Alert.alert(t('common.error'), t('tasks.mqttNotConnected'));
            return;
        }

        const reqId = Date.now() + Math.floor(Math.random() * 1000);

        warehouseUpdateRequestRef.current = reqId;
        warehouseUpdateInfoRef.current = {
            warehouseId: selectedWarehouse.warehouseId,
            description: editingDescription
        };

        console.log('发送仓库更新请求:', {
            reqId,
            warehouseId: selectedWarehouse.warehouseId,
            description: editingDescription
        });

        client.send("warehouseUpdate", {
            payload: {
                d: {
                    reqId,
                    warehouseId: selectedWarehouse.warehouseId,
                    description: editingDescription
                }
            }
        });
    };

    const selectWarehouse = (warehouse: Warehouse) => {
        setSelectedWarehouse(warehouse);
        setSelectedPositions(new Set());
        setBatchMode(false);
        loadWarehouseColumns(warehouse.warehouseId);
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        setColumns([]);
        setUsageStats({total: 0, available: 0, occupied: 0, disabled: 0, usagePercent: 0});
        pendingRequestsRef.current.clear();
        loadWarehouses();
        if (selectedWarehouse) loadWarehouseColumns(selectedWarehouse.warehouseId);
    }, [loadWarehouses, selectedWarehouse]);

    // 显示详情页（只读）
    const showPositionDetails = (vertex: Vertex) => {
        if (batchMode) togglePositionSelection(vertex.positionId);
        else {
            setSelectedPosition(vertex);
            setShowPositionDetailModal(true);
        }
    };

    // 打开编辑模态框
    const openEditModal = () => {
        if (!selectedPosition) return;
        setEditWeight(selectedPosition.weight ? String(selectedPosition.weight) : '0');
        setEditStatus(selectedPosition.status as PositionStatus);
        setShowPositionDetailModal(false); // 关闭详情
        setShowEditModal(true); // 打开编辑
    };

    // 处理编辑时的状态切换
    const handleEditStatusChange = (status: PositionStatus) => {
        setEditStatus(status);
        // 如果状态变为可用或禁用，重置重量为0 (前端视觉反馈，后端也会强制处理)
        if (status === PositionStatus.AVAILABLE || status === PositionStatus.DISABLED) {
            setEditWeight('0');
        }
    };

    // 保存更新（发送包含状态和重量的请求）
    const saveVertexUpdate = () => {
        if (!selectedPosition) return;
        if (!client.client?.connected) {
            Alert.alert(t('common.error'), t('tasks.mqttNotConnected'));
            return;
        }

        const weightVal = parseFloat(editWeight);
        if (isNaN(weightVal) || weightVal < 0) {
            Alert.alert(t('common.error'), '请输入有效的重量数值');
            return;
        }

        const reqId = Date.now();
        const payload = {
            reqId,
            positionId: selectedPosition.positionId,
            columnId: selectedPosition.columnId,
            hxMapVertexesId: selectedPosition.hxMapVertexesId,
            positionOrder: selectedPosition.positionOrder,
            status: editStatus, // 使用编辑后的状态
            weight: weightVal   // 使用编辑后的重量
        };

        client.send("warehouseVertexesUpdate", {payload: {d: payload}});
        console.log("发送更新请求:", payload);
    };

    useEffect(() => {
        if (!client.client?.connected) return;
        client.subscribe("warehouseAll");
        client.subscribe("warehouseColumnList");
        client.subscribe("warehouseVertexesList");
        client.subscribe("warehousePositionBatchUpdate");
        client.subscribe("warehouseUpdate");
        client.subscribe("warehouseVertexesUpdate");

        client.listenerMessage("message", listenerMessage);
        loadWarehouses();
        return () => {
            client.removeListener("message", listenerMessage);
            pendingRequestsRef.current.clear();
            batchUpdateRequestRef.current = null;
            batchUpdateInfoRef.current = null;
            warehouseUpdateRequestRef.current = null;
            warehouseUpdateInfoRef.current = null;
        };
    }, [client.client?.connected]);

    return (
        <View style={styles.container}>
            {/* Header and Controls ... (unchanged) */}
            <View style={styles.header}>
                <View style={styles.headerWarehouseSelector}>
                    <TouchableOpacity
                        style={styles.headerSelectButton}
                        onPress={() => setShowWarehouseSelector(true)}
                    >
                        <Text style={styles.headerSelectButtonText}>
                            {selectedWarehouse?.warehouseName || t('warehouse.selectWarehouse')}
                        </Text>
                        <Ionicons name="chevron-down" size={16} color="#666"/>
                    </TouchableOpacity>
                </View>

                <View style={styles.headerButtons}>
                    {!batchMode ? (
                        <TouchableOpacity style={[styles.headerButton, styles.primaryButton]}
                                          onPress={() => setBatchMode(true)}>
                            <Ionicons name="checkmark-circle" size={16} color="#fff"/>
                            <Text style={styles.buttonText}>{t('warehouse.batchOperations')}</Text>
                        </TouchableOpacity>
                    ) : (
                        <>
                            <TouchableOpacity style={[styles.headerButton, styles.successButton]}
                                              onPress={() => setShowBatchStatusModal(true)}
                                              disabled={selectedPositions.size === 0}>
                                <Ionicons name="create" size={16} color="#fff"/>
                                <Text
                                    style={styles.buttonText}>{t('warehouse.modifyStatus')}({selectedPositions.size})</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.headerButton, styles.warningButton]} onPress={() => {
                                setBatchMode(false);
                                setSelectedPositions(new Set());
                            }}>
                                <Ionicons name="close" size={16} color="#fff"/>
                                <Text style={styles.buttonText}>{t('common.cancel')}</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>

            <Modal
                transparent={true}
                visible={showWarehouseSelector}
                animationType="fade"
                onRequestClose={() => setShowWarehouseSelector(false)}
            >
                {/* ... Warehouse Selector (unchanged) ... */}
                <TouchableOpacity
                    style={styles.modalDropdownOverlay}
                    activeOpacity={1}
                    onPress={() => setShowWarehouseSelector(false)}
                >
                    <View style={styles.modalDropdownContent}>
                        <FlatList
                            data={warehouses}
                            keyExtractor={(item) => item.warehouseId.toString()}
                            style={{maxHeight: 250}}
                            bounces={false}
                            showsVerticalScrollIndicator={true}
                            contentContainerStyle={{flexGrow: 0}}
                            ListEmptyComponent={() => (
                                <View style={{padding: 12, alignItems: 'center'}}>
                                    <Text style={{color: '#999', fontSize: 14}}>暂无仓库数据</Text>
                                </View>
                            )}
                            renderItem={({item: warehouse}) => (
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
                </TouchableOpacity>
            </Modal>

            <ScrollView
                style={styles.scrollView}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh}/>}
            >
                {/* ... Batch Tip & Info Card (unchanged) ... */}
                {batchMode && (
                    <Card style={styles.batchTipCard}>
                        <View style={styles.batchTipContainer}>
                            <Text style={styles.batchTipText}>
                                {getCurrentLanguage().startsWith('zh') ? `批量操作模式：点击点位进行选择，已选择 ${selectedPositions.size} 个点位` : `Batch mode: Click positions to select, ${selectedPositions.size} positions selected`}
                            </Text>
                            <View style={styles.batchActions}>
                                <TouchableOpacity style={styles.batchActionButton} onPress={selectAllPositions}>
                                    <Text style={styles.batchActionText}>{t('warehouse.selectAll')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.batchActionButton} onPress={clearSelection}>
                                    <Text style={styles.batchActionText}>{t('warehouse.clearSelection')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Card>
                )}

                {selectedWarehouse && (
                    <Card style={styles.infoCard}>
                        <Card.Header>
                            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                                <View style={{flex: 1}}>
                                    <Text style={styles.warehouseTitle}>{selectedWarehouse.warehouseName}</Text>
                                    <Paragraph
                                        style={styles.warehouseDesc}>{selectedWarehouse.description || t('warehouse.noDescription')}</Paragraph>
                                </View>
                                <TouchableOpacity
                                    onPress={() => {
                                        setEditingDescription(selectedWarehouse.description || '');
                                        setShowEditDescModal(true);
                                    }}
                                    style={{padding: 4}}
                                >
                                    <Ionicons name="create-outline" size={20} color="#007bff" />
                                </TouchableOpacity>
                            </View>
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
                                    <Text
                                        style={[styles.statNumber, {color: statusColors[PositionStatus.AVAILABLE]}]}>{usageStats.available}</Text>
                                    <Text style={styles.statLabel}>{t('warehouse.availablePositions')}</Text>
                                </View>
                                <View style={styles.statItem}>
                                    <Text
                                        style={[styles.statNumber, {color: statusColors[PositionStatus.OCCUPIED]}]}>{usageStats.occupied}</Text>
                                    <Text style={styles.statLabel}>{t('warehouse.occupiedPositions')}</Text>
                                </View>
                                <View style={styles.statItem}>
                                    <Text
                                        style={[styles.statNumber, {color: statusColors[PositionStatus.DISABLED]}]}>{usageStats.disabled}</Text>
                                    <Text style={styles.statLabel}>{t('warehouse.disabledPositions')}</Text>
                                </View>
                            </View>
                        </View>
                    </Card>
                )}

                {/* Visualization Grid (unchanged) */}
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
                                                column.vertexes.sort((a, b) => a.positionOrder - b.positionOrder).map((vertex) => (
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

                                                        {(vertex.status === PositionStatus.OCCUPIED && vertex.weight && vertex.weight > 0) && (
                                                            <Text style={[styles.positionText, styles.weightText]}>
                                                                {`(${vertex.weight} Kg)`}
                                                            </Text>
                                                        )}

                                                        {batchMode && selectedPositions.has(vertex.positionId) && (
                                                            <View style={styles.selectedIndicator}>
                                                                <Ionicons name="checkmark" size={12} color="#007bff"/>
                                                            </View>
                                                        )}
                                                    </TouchableOpacity>
                                                ))
                                            ) : (
                                                <View style={styles.emptyPosition}>
                                                    <Text
                                                        style={styles.emptyText}>{loading ? '加载中...' : '无点位'}</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                ))}
                            </View>
                        </ScrollView>
                        {columns.length === 0 && !loading && (
                            <View style={styles.emptyState}><Ionicons name="cube-outline" size={48} color="#ccc"/><Text
                                style={styles.emptyStateText}>{t('warehouse.noWarehouse')}</Text></View>
                        )}
                        {loading && (<View style={styles.emptyState}><Text
                            style={styles.emptyStateText}>{t('common.loading')}</Text></View>)}
                    </Card>
                )}
            </ScrollView>

            {/* === 1. 点位详情模态框 (只读) === */}
            <Modal visible={showPositionDetailModal} animationType="slide" transparent={true}
                   onRequestClose={() => setShowPositionDetailModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>点位详情</Text>
                            <TouchableOpacity onPress={() => setShowPositionDetailModal(false)}><Ionicons name="close"
                                                                                                          size={24}
                                                                                                          color="#333"/></TouchableOpacity>
                        </View>
                        {selectedPosition && (
                            /* 修改：将 View 改为 ScrollView，防止内容被底部遮挡 */
                            <ScrollView style={styles.modalBody}>
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
                                        <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                            <View
                                                style={[styles.statusBadge, {backgroundColor: statusColors[selectedPosition.status as PositionStatus]}]}>
                                                <Text
                                                    style={styles.statusText}>{getStatusText(selectedPosition.status as PositionStatus)}</Text>
                                            </View>
                                        </View>
                                    </View>

                                    {/* === 详情页显示重量 (只读) === */}
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>重量:</Text>
                                        <Text style={styles.detailValue}>{selectedPosition.weight || 0} kg</Text>
                                    </View>

                                </View>
                                {selectedPosition.mapVertex && (
                                    <View style={styles.detailSection}>
                                        <Text style={styles.sectionTitle}>{t('warehouse.mapPositionInfo')}</Text>
                                        <View style={styles.detailRow}><Text
                                            style={styles.detailLabel}>{t('warehouse.positionCode')}:</Text><Text
                                            style={styles.detailValue}>{selectedPosition.mapVertex.code}</Text></View>
                                        <View style={styles.detailRow}><Text
                                            style={styles.detailLabel}>{t('warehouse.positionAlias')}:</Text><Text
                                            style={styles.detailValue}>{selectedPosition.mapVertex.codeAlias || t('warehouse.noAlias')}</Text></View>
                                        <View style={styles.detailRow}><Text
                                            style={styles.detailLabel}>{t('warehouse.coordinates')}:</Text><Text
                                            style={styles.detailValue}>({selectedPosition.mapVertex.x}, {selectedPosition.mapVertex.y})</Text></View>
                                        {selectedPosition.mapVertex.theta !== undefined &&
                                            <View style={styles.detailRow}><Text
                                                style={styles.detailLabel}>{t('warehouse.angle')}:</Text><Text
                                                style={styles.detailValue}>{selectedPosition.mapVertex.theta}°</Text></View>}
                                    </View>
                                )}
                            </ScrollView>
                        )}
                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={[styles.modalButton, styles.cancelButton]}
                                              onPress={() => setShowPositionDetailModal(false)}>
                                <Text style={styles.cancelButtonText}>{t('common.close')}</Text>
                            </TouchableOpacity>
                            {/* === 点击编辑跳转到编辑框 === */}
                            <TouchableOpacity style={[styles.modalButton, styles.warningButton]}
                                              onPress={openEditModal}>
                                <Ionicons name="create-outline" size={16} color="#fff" style={{marginRight: 4}}/>
                                <Text style={styles.confirmButtonText}>{t('warehouse.editPosition') || '编辑'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* === 2. 点位编辑模态框 === */}
            <Modal visible={showEditModal} animationType="slide" transparent={true}
                   onRequestClose={() => setShowEditModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>编辑点位</Text>
                            <TouchableOpacity onPress={() => setShowEditModal(false)}>
                                <Ionicons name="close" size={24} color="#333"/>
                            </TouchableOpacity>
                        </View>
                        {selectedPosition && (
                            <View style={styles.modalBody}>
                                <View style={styles.detailSection}>
                                    <Text style={styles.formLabel}>状态：</Text>
                                    <View style={styles.statusOptions}>
                                        {Object.values(PositionStatus).filter(v => typeof v === 'number').map((status: number) => (
                                            <TouchableOpacity
                                                key={status}
                                                style={[styles.statusOption, {
                                                    backgroundColor: statusColors[status as PositionStatus],
                                                    borderWidth: editStatus === status ? 3 : 1,
                                                    borderColor: editStatus === status ? '#333' : '#ddd',
                                                    opacity: editStatus === status ? 1 : 0.7
                                                }]}
                                                onPress={() => handleEditStatusChange(status as PositionStatus)}
                                            >
                                                <Text
                                                    style={styles.statusOptionText}>{getStatusText(status as PositionStatus)}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>

                                <View style={[styles.detailSection, {marginTop: 20}]}>
                                    <Text style={styles.formLabel}>重量 (kg)：</Text>
                                    <TextInput
                                        style={[styles.input, {width: '100%', textAlign: 'left', fontSize: 16}]}
                                        value={editWeight}
                                        onChangeText={setEditWeight}
                                        keyboardType="numeric"
                                        placeholder="输入重量"
                                    />
                                    {editStatus !== PositionStatus.OCCUPIED && (
                                        <Text style={{fontSize: 12, color: '#999', marginTop: 4}}>
                                            提示：可用或禁用状态下，重量将被重置为 0
                                        </Text>
                                    )}
                                </View>
                            </View>
                        )}
                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={[styles.modalButton, styles.cancelButton]}
                                              onPress={() => setShowEditModal(false)}>
                                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalButton, styles.confirmButton]}
                                              onPress={saveVertexUpdate}>
                                <Text style={styles.confirmButtonText}>保存修改</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* === 批量操作模态框 (unchanged) === */}
            <Modal visible={showBatchStatusModal} animationType="slide" transparent={true}
                   onRequestClose={() => setShowBatchStatusModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{t('warehouse.batchModifyStatus')}</Text>
                            <TouchableOpacity onPress={() => setShowBatchStatusModal(false)}><Ionicons name="close"
                                                                                                       size={24}
                                                                                                       color="#333"/></TouchableOpacity>
                        </View>
                        <View style={styles.modalBody}>
                            <Text
                                style={styles.formLabel}>{getCurrentLanguage().startsWith('zh') ? `将选中的 ${selectedPositions.size} 个点位状态修改为：` : `Modify ${selectedPositions.size} selected positions to:`}</Text>
                            <View style={styles.statusOptions}>
                                {Object.values(PositionStatus).filter(v => typeof v === 'number').map((status: number) => (
                                    <TouchableOpacity
                                        key={status}
                                        style={[styles.statusOption, {
                                            backgroundColor: statusColors[status as PositionStatus],
                                            borderWidth: batchStatus === status ? 3 : 1,
                                            borderColor: batchStatus === status ? '#333' : '#ddd'
                                        }]}
                                        onPress={() => setBatchStatus(status as PositionStatus)}
                                    >
                                        <Text
                                            style={styles.statusOptionText}>{getStatusText(status as PositionStatus)}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={[styles.modalButton, styles.cancelButton]}
                                              onPress={() => setShowBatchStatusModal(false)}><Text
                                style={styles.cancelButtonText}>{t('common.cancel')}</Text></TouchableOpacity>
                            <TouchableOpacity style={[styles.modalButton, styles.confirmButton]}
                                              onPress={batchUpdateStatus}><Text
                                style={styles.confirmButtonText}>{t('warehouse.confirmModify')}</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* 编辑备注模态框 */}
            <Modal visible={showEditDescModal} animationType="slide" transparent={true}
                   onRequestClose={() => setShowEditDescModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{t('warehouse.editDescription')}</Text>
                            <TouchableOpacity onPress={() => setShowEditDescModal(false)}>
                                <Ionicons name="close" size={24} color="#333"/>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.modalBody}>
                            <Text style={styles.formLabel}>{t('warehouse.warehouseName')}:</Text>
                            <Text style={styles.warehouseNameText}>{selectedWarehouse?.warehouseName}</Text>
                            <Text style={[styles.formLabel, {marginTop: 16}]}>{t('warehouse.description')}:</Text>
                            <TextInput
                                style={styles.textInput}
                                value={editingDescription}
                                onChangeText={setEditingDescription}
                                placeholder={t('warehouse.enterDescription')}
                                multiline
                                numberOfLines={4}
                                textAlignVertical="top"
                            />
                        </View>
                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={[styles.modalButton, styles.cancelButton]}
                                              onPress={() => setShowEditDescModal(false)}>
                                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalButton, styles.confirmButton]}
                                              onPress={saveWarehouseDescription}>
                                <Text style={styles.confirmButtonText}>{t('common.save')}</Text>
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
        zIndex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
        zIndex: 2,
    },
    headerWarehouseSelector: {
        flex: 1,
        marginRight: 16,
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
    modalDropdownOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0)',
    },
    modalDropdownContent: {
        position: 'absolute',
        top: 60,
        left: 16,
        width: 250,
        backgroundColor: '#fff',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#dee2e6',
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.15,
        shadowRadius: 5,
        elevation: 5,
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
    successButton: {backgroundColor: '#28a745'},
    primaryButton: {backgroundColor: '#007bff'},
    buttonText: {color: '#fff', fontSize: 12, fontWeight: '500'},
    infoCard: {
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 8,
        padding: 16,
        backgroundColor: '#fff',
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    warehouseTitle: {fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 4},
    warehouseDesc: {fontSize: 14, color: '#666', marginBottom: 12},
    statsContainer: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
    usageStats: {alignItems: 'center'},
    usagePercent: {fontSize: 24, fontWeight: 'bold', color: '#007bff'},
    usageLabel: {fontSize: 12, color: '#666', marginTop: 4},
    detailedStats: {flexDirection: 'row', gap: 16},
    statItem: {alignItems: 'center'},
    statNumber: {fontSize: 16, fontWeight: 'bold', color: '#333'},
    statLabel: {fontSize: 10, color: '#666', marginTop: 2},
    visualizationCard: {
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 16,
        backgroundColor: '#fff',
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    cardTitle: {fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 12},
    warehouseGrid: {flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 16, gap: 0},
    warehouseColumn: {minWidth: 120, alignItems: 'center'},
    columnHeader: {fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, textAlign: 'center'},
    positionsContainer: {gap: 8},
    positionButton: {
        width: 80, // 如果文字特别长，可能需要适当增加宽度，比如 90 或 100
        height: 40,
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 1},
        shadowOpacity: 0.2,
        shadowRadius: 2,
        minHeight: 50,          // 确保有足够高度显示两行
        paddingVertical: 4,     // 上下留点间距
    },
    positionText: {
        color: '#fff',
        fontSize: 14, // 调小字号以便在一行放下更多内容
        fontWeight: 'bold',
        textAlign: 'center',
    },
    weightText: {
        fontSize: 10,           // 重量字号稍微小一点
        fontWeight: 'normal',   // 重量不需要加粗
        marginTop: 2,           // 给两行之间加点空隙
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
        borderStyle: 'dashed'
    },
    emptyText: {color: '#6c757d', fontSize: 10},
    emptyState: {alignItems: 'center', paddingVertical: 40},
    emptyStateText: {fontSize: 14, color: '#999', marginTop: 8},
    modalOverlay: {flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center'},
    modalContent: {backgroundColor: '#fff', borderRadius: 12, width: '90%', maxWidth: 400, maxHeight: '90%'},
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0'
    },
    modalTitle: {fontSize: 18, fontWeight: 'bold', color: '#333'},
    modalBody: {padding: 20, maxHeight: 420},
    modalFooter: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0'
    },
    modalButton: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 6,
        minWidth: 80,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center'
    },
    cancelButton: {backgroundColor: '#6c757d'},
    confirmButton: {backgroundColor: '#007bff'},
    cancelButtonText: {color: '#fff', fontSize: 14, fontWeight: '500'},
    confirmButtonText: {color: '#fff', fontSize: 14, fontWeight: '500'},
    formLabel: {fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8},
    detailSection: {marginBottom: 20},
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
        paddingBottom: 8
    },
    detailRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8},
    detailLabel: {fontSize: 14, color: '#666', flex: 1},
    detailValue: {fontSize: 14, color: '#333', fontWeight: '500', flex: 2, textAlign: 'right'},
    statusBadge: {paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4},
    statusText: {color: '#fff', fontSize: 12, fontWeight: '500'},
    batchTipCard: {
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 8,
        backgroundColor: '#e3f2fd',
        borderColor: '#2196f3',
        borderWidth: 1
    },
    batchTipContainer: {padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
    batchTipText: {fontSize: 14, color: '#1976d2', flex: 1},
    batchActions: {flexDirection: 'row', gap: 8},
    batchActionButton: {paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#2196f3', borderRadius: 4},
    batchActionText: {color: '#fff', fontSize: 12, fontWeight: '500'},
    selectedIndicator: {
        position: 'absolute',
        top: -2,
        right: -2,
        backgroundColor: '#fff',
        borderRadius: 8,
        width: 16,
        height: 16,
        justifyContent: 'center',
        alignItems: 'center'
    },
    warningButton: {backgroundColor: '#ff9800'},
    statusOptions: {flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8},
    statusOption: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        minWidth: 80,
        alignItems: 'center',
        marginBottom: 8
    },
    statusOptionText: {color: '#fff', fontSize: 14, fontWeight: '500'},
    textInput: {
        borderWidth: 1,
        borderColor: '#dee2e6',
        borderRadius: 6,
        padding: 12,
        fontSize: 14,
        color: '#333',
        minHeight: 100,
        backgroundColor: '#fff'
    },
    warehouseNameText: {
        fontSize: 16,
        color: '#333',
        fontWeight: '500',
        marginBottom: 8
    },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 10,
        width: 100,
        textAlign: 'right',
        fontSize: 14,
        color: '#333',
        backgroundColor: '#fff'
    }
});