import MyMqttClient, { IOptions } from "@/utils/mqtt";
import { StorageUtil } from "@/utils/storageUtil";
import { t } from "@/utils/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [uri, setUri] = useState("");
  const [port, setPort] = useState("");
  const [loading, setLoading] = useState(false);
  const [clientId, setClientId] = useState("");
  // const [client, setClient] = useState<MyMqttClient | null>(null);
  const [showModel, setShowModel] = useState(false);
  const [connectionTimeout, setConnectionTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [refreshKey, setRefreshKey] = useState(0); // 用于强制刷新组件
  const client = MyMqttClient.getInstance();

  useEffect(() => {
    StorageUtil.getItem("clientOptions").then((res: any) => {
      if (!res) {
        return;
      }
      setUsername(res?.username || "");
      setPassword(res?.password || "");
      setClientId(res?.clientId || "");
    });

    // 组件卸载时清理
    return () => {
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
      }
    };
  }, [connectionTimeout]);

  const listenPacket = useCallback(
    async (packet: any) => {
      const returnCode = packet.returnCode;
      console.log("收到MQTT包:", packet, "返回码:", returnCode);
      setLoading(false);

      // 清理超时定时器
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        setConnectionTimeout(null);
      }

      // 移除监听器避免重复处理
      client?.removeListener("packetreceive", listenPacket);
      console.log("客户端状态:", client?.client?.connected, "返回码:", returnCode);

      // 检查返回码
      switch (returnCode) {
        case 0:
          console.log("登录成功，准备跳转");
          ToastAndroid.show(t("login.loginSuccess"), ToastAndroid.SHORT);
          // 直接跳转，不依赖client状态检查
          setTimeout(() => {
            router.replace("/(tabs)/temp");
          }, 500); // 延迟500ms确保Toast显示
          break;
        case 4:
          ToastAndroid.show(t("login.usernamePasswordError"), ToastAndroid.LONG);
          client?.end();
          MyMqttClient.getInstance(true);
          break;
        case 5:
          ToastAndroid.show(t("login.unauthorized"), ToastAndroid.LONG);
          client?.end();
          MyMqttClient.getInstance(true);
          break;
        default:
          ToastAndroid.show(`${t("login.unknownError")} ${returnCode}`, ToastAndroid.LONG);
          client?.end();
          MyMqttClient.getInstance(true);
      }
    },
    [client, connectionTimeout, router]
  );

  const setClientOptions = async (newOptions: IOptions) => {
    const options = await StorageUtil.getItem<IOptions>("clientOptions");
    await StorageUtil.setItem("clientOptions", { ...options, ...newOptions });
  };

  const handleLogin = () => {
    if (loading) {
      return;
    }
    if (!username) {
      ToastAndroid.show(t("login.pleaseEnterUsername"), ToastAndroid.SHORT);
      return;
    }
    if (!password) {
      ToastAndroid.show(t("login.pleaseEnterPassword"), ToastAndroid.SHORT);
      return;
    }
    if (!client) {
      return;
    }
    if (!client.options.uri) {
      ToastAndroid.show(t("login.pleaseEnterAddress"), ToastAndroid.SHORT);
      return;
    }

    // 清理之前的超时定时器
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
    }

    client.options.clientId = clientId;
    client.options.username = username;
    client.options.password = password;
    setLoading(true);

    setClientOptions({
      username,
      password,
      clientId,
    });

    // 设置连接超时（10秒）
    const timeout = setTimeout(() => {
      setLoading(false);
      ToastAndroid.show(t("login.connectionTimeout"), ToastAndroid.LONG);
      client?.end();
      // 重新创建客户端实例
      MyMqttClient.getInstance(true);
    }, 5000);

    setConnectionTimeout(timeout);

    // 添加错误监听
    const handleError = (error: Error) => {
      console.log("MQTT连接错误:", error);
      setLoading(false);
      clearTimeout(timeout);
      ToastAndroid.show(`${t("login.connectionFailed")}: ${error.message}`, ToastAndroid.LONG);
      client?.removeListener("error", handleError);
      client?.removeListener("offline", handleOffline);
      client?.removeListener("close", handleClose);
    };

    const handleOffline = () => {
      console.log("MQTT连接离线");
      setLoading(false);
      clearTimeout(timeout);
      ToastAndroid.show("连接已断开", ToastAndroid.SHORT);
      client?.removeListener("error", handleError);
      client?.removeListener("offline", handleOffline);
      client?.removeListener("close", handleClose);
    };

    const handleClose = () => {
      console.log("MQTT连接关闭");
      setLoading(false);
      clearTimeout(timeout);
      client?.removeListener("error", handleError);
      client?.removeListener("offline", handleOffline);
      client?.removeListener("close", handleClose);
    };

    // 先设置事件监听器
    client.listenerMessage("error", handleError);
    client.listenerMessage("offline", handleOffline);
    client.listenerMessage("close", handleClose);
    client.listenerMessage("packetreceive", listenPacket);

    client.connect(username, password).then(() => {
      console.log("MQTT连接成功，准备跳转");
      clearTimeout(timeout);
      setLoading(false);
      ToastAndroid.show(t("login.loginSuccess"), ToastAndroid.SHORT);

      // 直接跳转到主页
      setTimeout(() => {
        console.log("执行页面跳转");
        router.replace("/(tabs)/temp");
      }, 1000);

    }).catch((error) => {
      console.log("连接失败:", error);
      setLoading(false);
      clearTimeout(timeout);
      ToastAndroid.show(`${t("login.connectionFailed")}: ${error.message || t("login.unknownConnectionError")}`, ToastAndroid.LONG);
    });
  };

  const changeMqttAddr = () => {
    if (!client) {
      return;
    }
    if (!uri || !port) {
      setShowModel(false);
      return;
    }
    const wsAddress = `ws://${uri}:${port}`;
    client.options.uri = wsAddress;
    setShowModel(false);
    setClientOptions({
      uri: wsAddress,
    });
  };

  const handleClick = () => {
    setShowModel(true);
  };

  const handleLanguageChange = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <View style={{ flex: 1 }} key={refreshKey}>
      {/* 语言切换器 */}
      <View style={styles.languageSwitcher}>
        <LanguageSwitcher onLanguageChange={handleLanguageChange} />
      </View>

      <Pressable
        onPress={handleClick}
        style={{
          width: 100,
          height: 100,
          position: "absolute",
          right: 0,
          top: 40,
          zIndex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}>
        <Ionicons name="settings" size={24} color="#000" />
      </Pressable>
      {showModel && (
        <Pressable
          onPress={() => setShowModel(false)}
          style={{
            position: "absolute",
            flex: 1,
            left: 0,
            top: 0,
            backgroundColor: "rgba(0,0,0,.6)",
            width: "100%",
            height: "100%",
            zIndex: 999,
          }}>
          <View
            style={[
              styles.inputContainer,
              {
                width: 300,
                padding: 20,
                position: "absolute",
                top: "40%",
                left: 40,
                backgroundColor: "#fff",
                zIndex: 1000,
              },
            ]}>
            <TextInput
              style={styles.input}
              placeholder={t("login.settings.addressModify")}
              placeholderTextColor="#aaa"
              onChangeText={setUri}
              value={uri}
            />
            <TextInput
              style={styles.input}
              onChangeText={setPort}
              placeholderTextColor="#aaa"
              value={port}
              placeholder={t("login.settings.portModify")}
            />
            <TouchableOpacity style={styles.button} onPress={changeMqttAddr}>
              <Text style={styles.buttonText}>{t("login.settings.confirm")}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      )}
      <KeyboardAvoidingView style={styles.container}>
        <View style={styles.logoContainer}>
          <Image source={require("@/assets/images/login-icon.png")} style={styles.logo} />
          <Text style={styles.title}>{t("login.title")}</Text>
        </View>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder={t("login.username")}
            placeholderTextColor="#aaa"
            value={username}
            onChangeText={setUsername}
          />
          <TextInput
            style={styles.input}
            placeholder={t("login.clientId")}
            placeholderTextColor="#aaa"
            value={clientId}
            onChangeText={setClientId}
          />
          <TextInput
            style={styles.input}
            placeholder={t("login.password")}
            placeholderTextColor="#aaa"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={[styles.buttonText, { marginLeft: 8 }]}>{t("login.connecting")}</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>{t("login.loginButton")}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  languageSwitcher: {
    position: "absolute",
    top: 50,
    left: 20,
    zIndex: 2,
  },
  container: {
    flex: 1,
    backgroundColor: "#f6f8fc",
    alignItems: "center",
    paddingTop: 170,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 16,
    borderRadius: 20,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#2d3a4b",
    letterSpacing: 1,
  },
  inputContainer: {
    width: "80%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  input: {
    height: 48,
    borderColor: "#e0e6ed",
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 18,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: "#f6f8fc",
    color: "#222",
  },
  button: {
    backgroundColor: "#3b82f6",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: "#a0a0a0",
    opacity: 0.7,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 1,
  },
});
