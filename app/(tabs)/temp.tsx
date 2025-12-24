import MyMqttClient from "@/utils/mqtt";
import { t } from "@/utils/i18n";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Dimensions, FlatList, StyleSheet, ToastAndroid, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SelectDropdown from "react-native-select-dropdown";
import { Text, XStack, YStack } from "tamagui";

type ITemplateList = {
  hxUserId: string;
  taskChainTemplateId: string;
  name: string;
  groupName: string;
  status: ITaskStatus;
  alias: string;
  lastTaskChainId: number;
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

const getStatusColor = () => [
  {
    bg: "yellow",
    color: "#333",
    text: t("tasks.taskPending"),
  },
  {
    bg: "green",
    color: "#fff",
    text: t("tasks.taskExecuting"),
  },
];

const { width } = Dimensions.get("window");
const GRID_SIZE = 3;
const ITEM_SIZE = width / GRID_SIZE - 20;

export default function TaskTemplates() {
  const [templates, setTemplates] = useState<ITemplateList[]>([]);
  const insets = useSafeAreaInsets();
  const [taskGroup, setTaskGroup] = useState<any[]>([]);
  const [groupName, setGroupName] = useState("");
  const [taskProgress, setTaskProgress] = useState<ITaskStatus[]>([]);
  const [hasMore, setHasmore] = useState(true);
  const [isLoading, setLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const timer = useRef<any>(null);
  const [pageInfo, setPageInfo] = useState({
    pageNum: 1,
    pageSize: 20,
  });
  const client = MyMqttClient.getInstance(false);

  const listenMessage = useCallback(
    (topic: string, message: any) => {
      console.log("topic: ", topic);
      if (topic === client.apiTheme.rep["taskTemp"]()) {
        const res = JSON.parse(message.toString());
        setLoading(false);
        if (pageInfo.pageNum === 1) {
          setPageInfo({
            ...pageInfo,
            pageNum: pageInfo.pageNum + 1,
          });
        }
        setTemplates((prev) => {
          const result = [...prev, ...res.d.records];

          setTaskProgress(() => {
            const newTaskProgress = result.filter((item) => !!item.lastTaskChainId).map((item) => item.lastTaskChainId);
            queryTaskStatus(newTaskProgress);
            return result.filter((item) => !!item.lastTaskChainId).map((item) => item.lastTaskChainId);
          });
          console.log(result.length, res.d.total, "result.length >= res.d.total");
          if (result.length >= res.d.total) {
            setHasmore(false);
          }
          return result;
        });
      }
      if (topic === client.apiTheme.rep["queryGroup"]()) {
        console.log(JSON.parse(message.toString()), "JSON.parse(message.toString())");
        const res = JSON.parse(message.toString());
        const group = res.d.value || [];

        setTaskGroup([
          { groupName: t("tasks.allGroups") },
          ...group.filter((item: { groupName: string }) => item.groupName !== "null" || item.groupName !== null),
        ]);
      }

      if (topic === client.apiTheme.rep["taskSend"]()) {
        const res = JSON.parse(message.toString());
        setSendLoading(false);
        console.log(res, `${topic}res`);
        if (res.d.code === 10000) {
          const newTemp = templates.map((item) => {
            if (item.taskChainTemplateId === res.d.taskTemplateId) {
              item.lastTaskChainId = res.d.taskId;
            }
            return item;
          });
          setTemplates(newTemp);
          setTaskProgress((prev) => {
            const progress = [...new Set([...prev, res.d.taskId])];
            queryTaskStatus(progress);
            return progress;
          });
          ToastAndroid.show(t("tasks.sendSuccess"), ToastAndroid.SHORT);
        } else {
          ToastAndroid.show(`${t("tasks.sendFailed")}:${res.d.msg}`, ToastAndroid.SHORT);
        }
      }

      if (topic === client.apiTheme.rep["taskStatus"]()) {
        const res = JSON.parse(message.toString());
        const tasks: any[] = res.d.value || [];
        console.log(tasks, "tasks");

        setTemplates((prev) => {
          const filterTaskId = tasks.filter((item) => [0, 1].includes(item.status)).map((item) => item.taskChainId);
          setTaskProgress(filterTaskId);
          return prev.map((item) => {
            const findTask = tasks.find((task) => task.taskChainId === item.lastTaskChainId);
            if (findTask) {
              item.status = findTask.status;
            }
            return item;
          });
        });
      }
    },
    [pageInfo.pageNum]
  );

  useFocusEffect(
    useCallback(() => {
      client.send("queryGroup", {
        payload: { d: { reqId: 0 } },
      });
    }, [client])
  );

  const queryTaskStatus = (filterTaskId: any[]) => {
    client.send("taskStatus", {
      payload: { d: { reqId: 0, taskChainId: filterTaskId ? filterTaskId : taskProgress } },
    });
  };

  useEffect(() => {
    if (!client.client?.connected) {
      console.log("未连接 index");
      router.replace("/");
      return;
    }
    client.subscribe("taskTemp");
    client.subscribe("taskSend");
    client.subscribe("queryGroup");
    client.subscribe("taskStatus");
    client.send("queryGroup", {
      payload: { d: { } },
    });
  }, []);

  useEffect(() => {
    timer.current = setInterval(() => {
      console.log(taskProgress, "taskProgress");
      client.send("taskStatus", {
        payload: { d: {  taskChainId: taskProgress } },
      });
    }, 5000);
    return () => {
      clearInterval(timer.current);
    };
  }, [taskProgress, client]);

  useEffect(() => {
    client.listenerMessage("message", listenMessage);
    return () => {
      client.listenerMessage("message", listenMessage);
    };
  }, [listenMessage, client]);

  useEffect(() => {
    queryList();
  }, [pageInfo.pageNum, groupName]);

  const queryList = () => {
    console.log("hasMore", hasMore);
    if (sendLoading) {
      ToastAndroid.show(t("tasks.waitForTaskComplete"), ToastAndroid.SHORT);
      return;
    }
    if (!hasMore) {
      return;
    }
    console.log("hasMore 进来了", hasMore);
    setLoading(true);
    client.send("taskTemp", {
      payload: { d: { groupName: groupName === t("tasks.allGroups") ? "" : groupName, ...pageInfo } },
    });
  };

  const sendTemplate = (item: ITemplateList) => {
    const statusColor = getStatusColor();
    const status = statusColor[item.status];
    if (status) {
      ToastAndroid.show(status.text, ToastAndroid.SHORT);
      return;
    }

    Alert.alert("", t("tasks.confirmSendTask"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.confirm"),
        onPress: () => {
          if (!item.alias) {
            alert(t("tasks.noAlias"));
            return;
          }
          setSendLoading(true);
          client.send("taskSend", {
            payload: { d: { [`${item.alias}`]: 0 } },
          });
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: ITemplateList }) => {
    const statusColor = getStatusColor();
    const status = statusColor[item.status];
    return (
      <TouchableOpacity
        style={[
          styles.gridItem,
          {
            backgroundColor: status?.bg || "#fff",
          },
        ]}
        onPress={() => sendTemplate(item)}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
          <Text style={[styles.itemText, { color: status?.color || "#333" }]}>{item.alias || "-"}</Text>
        </View>
        <Text style={[styles.itemTextSub, { color: status?.color || "#333" }]}>{item.groupName}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#4f8cff" }}>
      <View style={styles.container}>
        <YStack overflow="hidden" gap="$2" marginVertical={"$2"} paddingBottom={"$2"} marginHorizontal={"$4"}>
          <XStack alignItems="center" space="$2">
            <SelectDropdown
              data={taskGroup}
              onSelect={(selectedItem, index) => {
                setGroupName(selectedItem.groupName);
                setPageInfo({
                  ...pageInfo,
                  pageNum: 1,
                });
                setHasmore(true);
                setTemplates([]);
              }}
              renderButton={(selectedItem, isOpened) => {
                return (
                  <View style={styles.dropdownButtonStyle}>
                    <Text style={styles.dropdownButtonTxtStyle}>
                      {(selectedItem && selectedItem.groupName) || t("tasks.selectGroup")}
                    </Text>
                    <Ionicons name="options" size={24} color="black" />
                  </View>
                );
              }}
              renderItem={(item, index, isSelected) => {
                return (
                  <View style={{ ...styles.dropdownItemStyle, ...(isSelected && { backgroundColor: "#D2D9DF" }) }}>
                    <Text style={styles.dropdownItemTxtStyle}>{item.groupName}</Text>
                  </View>
                );
              }}
              showsVerticalScrollIndicator={false}
              dropdownStyle={styles.dropdownMenuStyle}
            />
          </XStack>
        </YStack>
        <View style={styles.gridContainer}>
          <FlatList
            style={{ paddingTop: 16 }}
            data={templates}
            numColumns={GRID_SIZE}
            keyExtractor={(item) => item.taskChainTemplateId}
            renderItem={renderItem}
            ListFooterComponent={() => {
              return (
                <View style={{ alignItems: "center", backgroundColor: "transparent", paddingVertical: 4 }}>
                  <Text>{isLoading ? t("common.loading") : !hasMore ? t("common.noMore") : ""}</Text>
                </View>
              );
            }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom }]}
            // 无限下拉刷新相关属性
            onEndReachedThreshold={0.2}
            onEndReached={() => {
              console.log(hasMore, isLoading, pageInfo.pageNum, "分页参数");
              //  || pageInfo.pageNum === 1
              if (!hasMore || isLoading) {
                return;
              }

              console.log("分页 1");

              setPageInfo((prev) => ({
                ...prev,
                pageNum: prev.pageNum + 1,
              }));
            }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dropdownButtonStyle: {
    flex: 1,
    height: 50,
    backgroundColor: "#E9ECEF",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  dropdownButtonTxtStyle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "500",
    color: "#151E26",
  },
  dropdownButtonArrowStyle: {
    fontSize: 28,
  },
  dropdownButtonIconStyle: {
    fontSize: 28,
    marginRight: 8,
  },
  dropdownMenuStyle: {
    backgroundColor: "#E9ECEF",
    borderRadius: 8,
  },
  dropdownItemStyle: {
    width: "100%",
    flexDirection: "row",
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 8,
  },
  dropdownItemTxtStyle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "500",
    color: "#151E26",
  },
  dropdownItemIconStyle: {
    fontSize: 28,
    marginRight: 8,
  },
  gridContainer: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    paddingTop: 0,
  },
  listContent: {
    paddingHorizontal: 10,
  },
  container: {
    flex: 1,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    marginLeft: 10,
    marginTop: 10,
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    // justifyContent: "center",
    // alignItems: "center",
    justifyContent: "space-evenly",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  itemText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
  },
  itemTextSub: {
    fontSize: 12,
    color: "#333",
    marginRight: 10,
  },
  // gradientHeader: {
  //   height: HEADER_HEIGHT + 20,
  //   justifyContent: "flex-end",
  //   alignItems: "center",
  //   paddingBottom: 36,
  //   paddingHorizontal: 8,
  // },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    letterSpacing: 1,
    textShadowColor: "rgba(0,0,0,0.15)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  cardShadow: {
    borderRadius: 14,
    marginBottom: 16,
    shadowColor: "#4f8cff",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 18,
    backgroundColor: "#444",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#fff",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 4,
  },
  desc: {
    fontSize: 14,
    color: "#fff",
    marginTop: 2,
  },
  actionBtn: {
    marginLeft: 16,
    backgroundColor: "#ffd33d",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
    shadowColor: "#4f8cff",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  actionText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
    letterSpacing: 1,
  },
});
