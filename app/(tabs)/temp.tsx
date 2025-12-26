import MyMqttClient from "@/utils/mqtt";
import {t} from "@/utils/i18n";
import Ionicons from "@expo/vector-icons/Ionicons";
import {router, useFocusEffect} from "expo-router";
import React, {useCallback, useEffect, useRef, useState} from "react";
import {
    Alert,
    FlatList,
    ListRenderItemInfo,
    StyleSheet,
    ToastAndroid,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import SelectDropdown from "react-native-select-dropdown";
import {Text, YStack} from "tamagui";

// --- 类型定义 ---
type ITemplateList = {
    hxUserId: string;
    taskChainTemplateId: string;
    name: string;
    groupName: string;
    status: ITaskStatus;
    alias: string;
    lastTaskChainId: number;
    warehouseId?: number; // 仓库ID
};

enum ITaskStatus {
    pending = 0,
    executing = 1,
    end = 2,
    cancel = 3,
    abnormal = 4,
    jump = 5,
    suspend = 6,
}

// --- 常量定义 ---
const STATUS_CONFIG: Record<number, { bg: string; color: string; text: string }> = {
    [ITaskStatus.pending]: {bg: "#fef08a", color: "#854d0e", text: t("tasks.taskPending")},
    [ITaskStatus.executing]: {bg: "#22c55e", color: "#ffffff", text: t("tasks.taskExecuting")},
};

const DEFAULT_STYLE = {bg: "#ffffff", color: "#333333"};

export default function TaskTemplates() {
    const {width: windowWidth} = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const MIN_ITEM_WIDTH = 120;
    const CONTAINER_PADDING = 10;
    const numColumns = Math.max(1, Math.floor((windowWidth - CONTAINER_PADDING) / MIN_ITEM_WIDTH));
    const itemSize = (windowWidth - CONTAINER_PADDING - (numColumns + 1) * 10) / numColumns;

    // --- State ---
    const [templates, setTemplates] = useState<ITemplateList[]>([]);
    const [taskGroup, setTaskGroup] = useState<any[]>([]);
    const [groupName, setGroupName] = useState("");
    const [hasMore, setHasMore] = useState(true);
    const [isLoading, setLoading] = useState(false);
    const [sendLoading, setSendLoading] = useState(false);

    // [新增] 存储满仓的仓库ID集合
    const [fullWarehouseIds, setFullWarehouseIds] = useState<Set<number>>(new Set());

    const pageInfoRef = useRef({pageNum: 1, pageSize: 20});
    const templatesRef = useRef<ITemplateList[]>([]);
    const taskProgressRef = useRef<number[]>([]);
    const timer = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        templatesRef.current = templates;
    }, [templates]);

    const client = MyMqttClient.getInstance(false);

    // --- MQTT 消息处理 ---
    const listenMessage = useCallback((topic: string, message: any) => {
        // [新增] 监听满仓信息主题
        // 确保 mqtt.ts 中已经添加了 queryFullWarehouse: (payload?: any) => `/iot/${this.options?.clientId}/rep/task/full/warehouse`
        if (topic === client.apiTheme.rep["queryFullWarehouse"]()) {
            try {
                const res = JSON.parse(message.toString());
                console.log("Full warehouse response:", res);

                // [修改点] 根据新的 JSON 结构解析: {"d":{"reqId":..., "value":[5]}}
                if (res.d && res.d.code === 10000) {
                    const ids = res.d.value || [];
                    if (Array.isArray(ids)) {
                        console.log("更新满仓列表:", ids);
                        setFullWarehouseIds(new Set(ids));
                    }
                }
            } catch (e) {
                console.error("解析满仓数据失败", e);
            }
            return;
        }

        if (topic === client.apiTheme.rep["taskTemp"]()) {
            const res = JSON.parse(message.toString());
            setLoading(false);

            const newRecords = res.d.records || [];
            const currentList = pageInfoRef.current.pageNum === 1 ? [] : templatesRef.current;
            const result = [...currentList, ...newRecords];

            setTemplates(result);

            const newProgressIds = result
                .filter((item) => !!item.lastTaskChainId)
                .map((item) => item.lastTaskChainId);

            const combinedProgress = [...new Set([...taskProgressRef.current, ...newProgressIds])];
            taskProgressRef.current = combinedProgress;

            if (combinedProgress.length > 0) queryTaskStatus(combinedProgress);

            if (result.length >= res.d.total) {
                setHasMore(false);
            } else {
                pageInfoRef.current.pageNum += 1;
            }
        }

        if (topic === client.apiTheme.rep["queryGroup"]()) {
            const res = JSON.parse(message.toString());
            const group = res.d.value || [];
            setTaskGroup([
                {groupName: t("tasks.allGroups")},
                ...group.filter((item: any) => item.groupName && item.groupName !== "null"),
            ]);
        }

        if (topic === client.apiTheme.rep["taskSend"]()) {
            const res = JSON.parse(message.toString());
            setSendLoading(false);
            if (res.d.code === 10000) {
                setTemplates((prev) =>
                    prev.map((item) => {
                        if (item.taskChainTemplateId === res.d.taskTemplateId) {
                            return {...item, lastTaskChainId: res.d.taskId};
                        }
                        return item;
                    })
                );
                const newProgress = [...new Set([...taskProgressRef.current, res.d.taskId])];
                taskProgressRef.current = newProgress;
                queryTaskStatus(newProgress);
                ToastAndroid.show(t("tasks.sendSuccess"), ToastAndroid.SHORT);
            } else {
                ToastAndroid.show(`${t("tasks.sendFailed")}:${res.d.msg}`, ToastAndroid.SHORT);
            }
        }

        if (topic === client.apiTheme.rep["taskStatus"]()) {
            const res = JSON.parse(message.toString());
            const tasks: any[] = res.d.value || [];
            if (tasks.length === 0) return;

            const activeIds = tasks
                .filter((item) => [ITaskStatus.pending, ITaskStatus.executing].includes(item.status))
                .map((item) => item.taskChainId);

            taskProgressRef.current = activeIds;

            setTemplates((prev) =>
                prev.map((item) => {
                    const findTask = tasks.find((task) => task.taskChainId === item.lastTaskChainId);
                    if (findTask && findTask.status !== item.status) {
                        return {...item, status: findTask.status};
                    }
                    return item;
                })
            );
        }
    }, []);

    const queryTaskStatus = (ids: number[]) => {
        if (!ids || ids.length === 0) return;
        client.send("taskStatus", {
            payload: {d: {reqId: 0, taskChainId: ids}},
        });
    };

    const queryList = () => {
        if (sendLoading) {
            ToastAndroid.show(t("tasks.waitForTaskComplete"), ToastAndroid.SHORT);
            return;
        }
        if (!hasMore && pageInfoRef.current.pageNum !== 1) return;

        setLoading(true);
        client.send("taskTemp", {
            payload: {
                d: {
                    groupName: groupName === t("tasks.allGroups") ? "" : groupName,
                    pageNum: pageInfoRef.current.pageNum,
                    pageSize: pageInfoRef.current.pageSize,
                },
            },
        });
    };

    useEffect(() => {
        if (!client.client?.connected) {
            router.replace("/");
            return;
        }
        // [修改] 订阅列表增加 queryFullWarehouse
        const topics = ["taskTemp", "taskSend", "queryGroup", "taskStatus", "queryFullWarehouse"];
        topics.forEach((t) => client.subscribe(t as any));

        client.listenerMessage("message", listenMessage);

        client.send("queryGroup", {payload: {d: {}}});

        // [新增] 主动发送请求查询满仓状态
        client.send("queryFullWarehouse", {payload: {d: {}}});

        queryList();

        return () => {
        };
    }, []);

    useEffect(() => {
        if (groupName) {
            pageInfoRef.current.pageNum = 1;
            setHasMore(true);
            setTemplates([]);
            setTimeout(queryList, 0);
        }
    }, [groupName]);

    useFocusEffect(
        useCallback(() => {
            const runPolling = () => {
                if (taskProgressRef.current.length > 0) {
                    queryTaskStatus(taskProgressRef.current);
                }
                // 可选：轮询满仓状态
                // client.send("queryFullWarehouse", { payload: { d: {} } });
            };
            runPolling();
            timer.current = setInterval(runPolling, 5000);
            return () => {
                if (timer.current) clearInterval(timer.current);
            };
        }, [])
    );

    const sendTemplate = (item: ITemplateList) => {
        if ([ITaskStatus.pending, ITaskStatus.executing].includes(item.status)) {
            const config = STATUS_CONFIG[item.status];
            ToastAndroid.show(config?.text || t("tasks.taskExecuting"), ToastAndroid.SHORT);
            return;
        }

        // [新增] 发送前双重校验
        if (item.warehouseId && fullWarehouseIds.has(item.warehouseId)) {
            ToastAndroid.show(t("tasks.fullWarehouseIds"), ToastAndroid.SHORT);
            return;
        }

        Alert.alert("", t("tasks.confirmSendTask"), [
            {text: t("common.cancel"), style: "cancel"},
            {
                text: t("common.confirm"),
                onPress: () => {
                    if (!item.alias) {
                        Alert.alert(t("tasks.noAlias"));
                        return;
                    }
                    setSendLoading(true);
                    client.send("taskSend", {
                        payload: {d: {[item.alias]: 0}},
                    });
                },
            },
        ]);
    };

    // --- 渲染 ---
    const renderItem = useCallback(
        ({item}: ListRenderItemInfo<ITemplateList>) => {
            const config = STATUS_CONFIG[item.status] || DEFAULT_STYLE;

            // [新增] 满仓判断逻辑
            // 1. item.warehouseId 存在
            // 2. fullWarehouseIds 集合中包含该 ID
            const isWarehouseFull = !!(item.warehouseId && fullWarehouseIds.has(item.warehouseId));

            // 禁用条件：状态本身是满 OR 实时查询是满
            const isDisable = isWarehouseFull;

            return (
                <TouchableOpacity
                    disabled={isDisable}
                    style={[
                        styles.gridItem,
                        {
                            width: itemSize,
                            aspectRatio: 1,
                            backgroundColor: config.bg,
                            marginLeft: 10,
                            marginTop: 10,
                            // 满仓时样式处理，稍微变灰或者保持原样
                            opacity: isDisable ? 0.7 : 1,
                        },
                    ]}
                    onPress={() => sendTemplate(item)}
                >
                    {/* [新增] 右上角状态点 */}
                    <View
                        style={{
                            position: "absolute",
                            top: 6,
                            right: 6,
                            // [修改] 样式调整为完美的圆形点点
                            width: isWarehouseFull ? 24 : 16,   // 红点大，绿点稍小
                            height: isWarehouseFull ? 24 : 16,
                            borderRadius: 9999, // 设为极大值，确保绝对是圆形
                            // 红色：满仓；绿色：正常
                            backgroundColor: isWarehouseFull ? "#ff4d4f" : "#52c41a",
                            borderWidth: 2, // 增加白边宽度
                            borderColor: "#ffffff",
                            zIndex: 10,
                            elevation: 5, // 增加立体感阴影
                            shadowColor: "#000",
                            shadowOffset: {width: 0, height: 2},
                            shadowOpacity: 0.3,
                            shadowRadius: 3,
                        }}
                    />

                    <View style={styles.textContainer}>
                        <Text style={[styles.itemText, {color: config.color}]}>
                            {item.alias || "-"}
                        </Text>
                    </View>

                    <Text style={[styles.itemTextSub, {color: config.color}]}>
                        {item.groupName}
                    </Text>
                </TouchableOpacity>
            );
        },
        [itemSize, fullWarehouseIds] // [注意] 依赖项必须包含 fullWarehouseIds
    );

    return (
        <View style={{flex: 1, backgroundColor: "#4f8cff"}}>
            <View style={styles.container}>
                <YStack gap="$2" marginVertical={"$2"} marginHorizontal={"$4"}>
                    <SelectDropdown
                        data={taskGroup}
                        onSelect={(selectedItem) => {
                            setGroupName(selectedItem.groupName);
                        }}
                        renderButton={(selectedItem) => (
                            <View style={styles.dropdownButtonStyle}>
                                <Text style={styles.dropdownButtonTxtStyle}>
                                    {(selectedItem && selectedItem.groupName) || t("tasks.selectGroup")}
                                </Text>
                                <Ionicons name="options" size={24} color="#151E26"/>
                            </View>
                        )}
                        renderItem={(item, index, isSelected) => (
                            <View style={[styles.dropdownItemStyle, isSelected && {backgroundColor: "#D2D9DF"}]}>
                                <Text style={styles.dropdownItemTxtStyle}>{item.groupName}</Text>
                            </View>
                        )}
                        showsVerticalScrollIndicator={false}
                        dropdownStyle={styles.dropdownMenuStyle}
                    />
                </YStack>

                <View style={styles.gridContainer}>
                    <FlatList
                        key={`grid-${numColumns}`}
                        data={templates}
                        numColumns={numColumns}
                        keyExtractor={(item) => item.taskChainTemplateId}
                        renderItem={renderItem}
                        contentContainerStyle={[styles.listContent, {paddingBottom: insets.bottom + 20}]}
                        showsVerticalScrollIndicator={false}
                        onEndReachedThreshold={0.5}
                        onEndReached={() => {
                            if (!hasMore || isLoading) return;
                            queryList();
                        }}
                        ListFooterComponent={
                            <View style={styles.footer}>
                                <Text style={{color: "#999"}}>
                                    {isLoading ? t("common.loading") : !hasMore ? t("common.noMore") : ""}
                                </Text>
                            </View>
                        }
                    />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    gridContainer: {
        flex: 1,
        backgroundColor: "#f5f5f5",
    },
    listContent: {
        paddingRight: 10,
        paddingTop: 10,
    },
    gridItem: {
        padding: 12,
        borderRadius: 12,
        justifyContent: "flex-start",
        gap: 8,
        shadowColor: "#000",
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        position: 'relative', // 确保绝对定位基于此
    },
    textContainer: {
        flex: 1,
        width: "100%",
        marginTop: 15, // 给上面的点点留位置
    },
    itemText: {
        fontSize: 16,
        fontWeight: "bold",
        lineHeight: 22,
        flexWrap: "wrap",
    },
    itemTextSub: {
        fontSize: 12,
        opacity: 0.8,
        alignSelf: "flex-end",
        width: "100%",
        textAlign: "right",
    },
    footer: {
        alignItems: "center",
        paddingVertical: 16,
    },
    dropdownButtonStyle: {
        height: 50,
        backgroundColor: "#E9ECEF",
        borderRadius: 12,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
    },
    dropdownButtonTxtStyle: {
        flex: 1,
        fontSize: 16,
        fontWeight: "500",
        color: "#151E26",
    },
    dropdownMenuStyle: {
        backgroundColor: "#E9ECEF",
        borderRadius: 8,
        marginTop: -20,
    },
    dropdownItemStyle: {
        width: "100%",
        paddingHorizontal: 12,
        paddingVertical: 12,
    },
    dropdownItemTxtStyle: {
        fontSize: 16,
        color: "#151E26",
    },
});