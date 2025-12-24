import MyMqttClient from "@/utils/mqtt";
import { t } from "@/utils/i18n";
import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { Card, Paragraph } from "tamagui";
interface ICardList {
  amrId: number;
  status: number;
  state: number;
  alias: string;
  batteryPercentile: number;
  materials: number;
}

// 车辆连接状态映射
const getCarStatusText = (status: number): string => {
  const statusMap: { [key: number]: string } = {
    0: t("vehicles.connectionStatus.offline"),
    1: t("vehicles.connectionStatus.online"),
  };
  return statusMap[status] || t("vehicles.workState.unknown");
};

// 车辆工作状态映射
const getCarStateText = (state: number): string => {
  const stateMap: { [key: number]: string } = {
    1: t("vehicles.workState.idle"),
    2: t("vehicles.workState.working"),
    3: t("vehicles.workState.charging"),
    4: t("vehicles.workState.trafficWaiting"),
    5: t("vehicles.workState.hosting"),
    6: t("vehicles.workState.externalInterrupt"),
    7: t("vehicles.workState.unknown"),
    8: t("vehicles.workState.abnormalPause"),
    1000: t("vehicles.workState.waitingScheduleConfirm"),
  };
  return stateMap[state] || t("vehicles.workState.unknown");
};

export default function User() {
  const [cardList, setCardList] = useState<ICardList[]>([]);
  const [hasMore, setHasmore] = useState(true);
  const [isLoading, setLoading] = useState(false);
  const timer = useRef<any>(null);
  const [pageInfo, setPageInfo] = useState({
    pageNum: 1,
    pageSize: 1000,
  });
  const client = MyMqttClient.getInstance(false);

  // useFocusEffect(

  const listenerMessage = (topic: string, message: any) => {
    console.log("topic: ", topic);
    if (topic === client.apiTheme.rep["queryCar"]()) {
      const res = JSON.parse(message.toString());
      setLoading(false);
      setCardList((prev) => {
        const result = res.d.records;
        if (result.length >= res.d.total) {
          setHasmore(false);
        }
        return result;
      });
      // setCardList(res.d.records);
    }
  };

  useEffect(() => {
    if (!client.client?.connected) {
      console.log("未连接 user");
      return;
    }
    client.subscribe("queryCar");
    client.listenerMessage("message", listenerMessage);
    queryList();
    // setPageInfo((prev) => ({
    //   ...prev,
    //   pageNum: prev.pageNum + 1,
    // }));
    timedSend();
    return () => {
      client.listenerMessage("message", listenerMessage);
      clearInterval(timer.current);
    };
  }, []);

  const timedSend = useCallback(() => {
    timer.current = setInterval(() => {
      queryList(true);
    }, 5000);
  }, []);

  useEffect(() => {
    if (pageInfo.pageNum !== 1) {
      queryList();
    }
  }, [pageInfo.pageNum]);

  const queryList = (jump: boolean = false) => {
    if (!hasMore && !jump) {
      return;
    }
    if (!jump) {
      setLoading(true);
    }
    client.send("queryCar", { payload: { d: { reqId: 0, ...pageInfo } } });
  };

  const renderItem = ({ item }: { item: ICardList }) => {
    console.log(item, "item");

    return (
      <Card elevate size="$4" bordered key={item.amrId} style={{ marginBottom: 10 }}>
        <Card.Header padded>
          <Text style={{ color: "#fff", fontSize: 24 }}>{item.alias}</Text>
          <Paragraph theme="alt2" style={{ color: "#fff" }}>
            {getCarStatusText(item.status)}({getCarStateText(item.state) || "-"})
          </Paragraph>
        </Card.Header>
        <Card.Footer padded style={{ flex: 1, alignItems: "center", justifyContent: "space-between" }}>
          <Paragraph theme="alt2" style={{ color: "#fff" }}>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="battery-full" size={24} color="white" />
              <Text style={{ color: "#fff", marginTop: 6 }}>{item.batteryPercentile || 0}%</Text>
            </View>
          </Paragraph>
          {/* <View style={{ flexDirection: "row" }}> */}

          <Paragraph theme="alt2" style={{ color: "#fff" }}>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="bus" size={24} color="white" />
              <Text style={{ color: "#fff", marginTop: 6 }}>
                {item.materials ? t("vehicles.cargoStatus.loaded") : t("vehicles.cargoStatus.empty")}
              </Text>
            </View>
          </Paragraph>
          {/* </View> */}
        </Card.Footer>
        <Card.Background>
          <View style={{ width: "100%", height: "100%", backgroundColor: "#25292e", borderRadius: 8 }}></View>
        </Card.Background>
      </Card>
    );
  };

  return (
    <View style={styles.gridContainer}>
      <FlatList
        style={{ padding: 16 }}
        data={cardList}
        keyExtractor={(item) => `${item.amrId}`}
        renderItem={renderItem}
        ListFooterComponent={() => {
          return (
            <View style={{ alignItems: "center", backgroundColor: "transparent", paddingVertical: 4 }}>
              <Text>{isLoading ? t("common.loading") : !hasMore ? t("common.noMore") : ""}</Text>
            </View>
          );
        }}
        showsVerticalScrollIndicator={false}
        // contentContainerStyle={{ paddingBottom: insets.bottom }}
        // 无限下拉刷新相关属性
        onEndReachedThreshold={0.2}
        onEndReached={() => {
          if (!hasMore || isLoading || pageInfo.pageNum === 1) {
            return;
          }
          // if (!hasMore || isLoading || !x) {
          //   return;
          // }
          console.log("onEndReached");

          setPageInfo((prev) => ({
            ...prev,
            pageNum: prev.pageNum + 1,
          }));

          // queryList();
        }}
      />
    </View>
  );

  // return (
  //   <ScrollView style={{ flex: 1 }} backgroundColor="$background" borderRadius="$4">
  //     <XStack $maxMd={{ flexDirection: "column" }} style={{ paddingTop: 20 }} paddingHorizontal="$4" space>
  //       {cardList.map((item) => {
  //         console.log(item, "item");

  //         return (
  // <Card elevate size="$4" bordered key={item.amrId}>
  //   <Card.Header padded>
  //     <Text style={{ color: "#fff", fontSize: 24 }}>{item.alias}</Text>
  //     <Paragraph theme="alt2" style={{ color: "#fff" }}>
  //       {item.status ? "在线" : "离线"}
  //     </Paragraph>
  //   </Card.Header>
  //   <Card.Footer padded style={{ flex: 1, alignItems: "center", justifyContent: "space-between" }}>
  //     <Paragraph theme="alt2" style={{ color: "#fff" }}>
  //       <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
  //         <Ionicons name="battery-full" size={24} color="white" />
  //         <Text style={{ color: "#fff", marginTop: 6 }}>{item.batteryPercentile}%</Text>
  //       </View>
  //     </Paragraph>
  //     <Paragraph theme="alt2" style={{ color: "#fff" }}>
  //       <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
  //         <Ionicons name="bus" size={24} color="white" />
  //         <Text style={{ color: "#fff", marginTop: 6 }}>{item.materials ? "载货中" : "未载货"}</Text>
  //       </View>
  //     </Paragraph>
  //   </Card.Footer>
  //   <Card.Background>
  //     <View style={{ width: "100%", height: "100%", backgroundColor: "#25292e", borderRadius: 8 }}></View>
  //   </Card.Background>
  // </Card>
  //         );
  //       })}
  //     </XStack>
  //   </ScrollView>
  // );
}

const styles = StyleSheet.create({
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
  itemText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
  },
  itemTextSub: {
    fontSize: 12,
    color: "#333",
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
