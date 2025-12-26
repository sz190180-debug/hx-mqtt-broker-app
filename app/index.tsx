import MyMqttClient, {IOptions} from "@/utils/mqtt";
import {StorageUtil} from "@/utils/storageUtil";
import {t} from "@/utils/i18n";
import {LanguageSwitcher} from "@/components/LanguageSwitcher";
import Ionicons from "@expo/vector-icons/Ionicons";
import {router} from "expo-router";
import React, {useCallback, useEffect, useState} from "react";
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
    Modal, // 1. 引入 Modal
} from "react-native";

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [uri, setUri] = useState("");
    const [port, setPort] = useState("");
    const [loading, setLoading] = useState(false);
    const [clientId, setClientId] = useState("");
    const [showModel, setShowModel] = useState(false);
    const [connectionTimeout, setConnectionTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
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

        return () => {
            if (connectionTimeout) {
                clearTimeout(connectionTimeout);
            }
        };
    }, [connectionTimeout]);

    // ... (保留原有的 listenPacket 逻辑)
    const listenPacket = useCallback(
        async (packet: any) => {
            const returnCode = packet.returnCode;
            console.log("收到MQTT包:", packet, "返回码:", returnCode);
            setLoading(false);

            if (connectionTimeout) {
                clearTimeout(connectionTimeout);
                setConnectionTimeout(null);
            }

            client?.removeListener("packetreceive", listenPacket);

            switch (returnCode) {
                case 0:
                    ToastAndroid.show(t("login.loginSuccess"), ToastAndroid.SHORT);
                    setTimeout(() => {
                        router.replace("/(tabs)/temp");
                    }, 500);
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
        await StorageUtil.setItem("clientOptions", {...options, ...newOptions});
    };

    // ... (保留原有的 handleLogin 逻辑)
    const handleLogin = () => {
        if (loading) return;
        if (!username) {
            ToastAndroid.show(t("login.pleaseEnterUsername"), ToastAndroid.SHORT);
            return;
        }
        if (!password) {
            ToastAndroid.show(t("login.pleaseEnterPassword"), ToastAndroid.SHORT);
            return;
        }
        if (!client) return;
        if (!client.options.uri) {
            ToastAndroid.show(t("login.pleaseEnterAddress"), ToastAndroid.SHORT);
            return;
        }

        if (connectionTimeout) clearTimeout(connectionTimeout);

        client.options.clientId = clientId;
        client.options.username = username;
        client.options.password = password;
        setLoading(true);

        setClientOptions({username, password, clientId});

        const timeout = setTimeout(() => {
            setLoading(false);
            ToastAndroid.show(t("login.connectionTimeout"), ToastAndroid.LONG);
            client?.end();
            MyMqttClient.getInstance(true);
        }, 5000);

        setConnectionTimeout(timeout);

        const handleError = (error: Error) => {
            setLoading(false);
            clearTimeout(timeout);
            ToastAndroid.show(`${t("login.connectionFailed")}: ${error.message}`, ToastAndroid.LONG);
            client?.removeListener("error", handleError);
            client?.removeListener("offline", handleOffline);
            client?.removeListener("close", handleClose);
        };

        const handleOffline = () => {
            setLoading(false);
            clearTimeout(timeout);
            ToastAndroid.show("连接已断开", ToastAndroid.SHORT);
            client?.removeListener("error", handleError);
            client?.removeListener("offline", handleOffline);
            client?.removeListener("close", handleClose);
        };

        const handleClose = () => {
            setLoading(false);
            clearTimeout(timeout);
            client?.removeListener("error", handleError);
            client?.removeListener("offline", handleOffline);
            client?.removeListener("close", handleClose);
        };

        client.listenerMessage("error", handleError);
        client.listenerMessage("offline", handleOffline);
        client.listenerMessage("close", handleClose);
        client.listenerMessage("packetreceive", listenPacket);

        client.connect(username, password).then(() => {
            clearTimeout(timeout);
            setLoading(false);
            ToastAndroid.show(t("login.loginSuccess"), ToastAndroid.SHORT);
            setTimeout(() => {
                router.replace("/(tabs)/temp");
            }, 1000);
        }).catch((error) => {
            setLoading(false);
            clearTimeout(timeout);
            ToastAndroid.show(`${t("login.connectionFailed")}: ${error.message || t("login.unknownConnectionError")}`, ToastAndroid.LONG);
        });
    };

    const changeMqttAddr = () => {
        if (!client) return;
        if (!uri || !port) {
            setShowModel(false);
            return;
        }
        const wsAddress = `ws://${uri}:${port}`;
        client.options.uri = wsAddress;
        setShowModel(false);
        setClientOptions({uri: wsAddress});
    };

    const handleClick = () => {
        setShowModel(true);
    };

    const handleLanguageChange = () => {
        setRefreshKey(prev => prev + 1);
    };

    return (
        <View style={{flex: 1}} key={refreshKey}>
            {/* 语言切换器 */}
            <View style={styles.languageSwitcher}>
                <LanguageSwitcher onLanguageChange={handleLanguageChange}/>
            </View>

            {/* 设置按钮 */}
            <Pressable
                onPress={handleClick}
                style={styles.settingsButton}>
                <Ionicons name="settings" size={24} color="#000"/>
            </Pressable>

            {/* 2. 修改：使用 Modal 组件包裹设置弹窗，使其位于最顶层 */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={showModel}
                onRequestClose={() => setShowModel(false)} // 处理 Android 返回键
            >
                <Pressable
                    style={styles.modalOverlay}
                    onPress={() => setShowModel(false)} // 点击背景关闭
                >
                    {/* 点击内容区域不关闭，阻止事件冒泡 */}
                    <Pressable style={styles.modalContent} onPress={() => {
                    }}>
                        <Text style={styles.modalTitle}>{t("login.settings.title") || "MQTT 设置"}</Text>

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
                            keyboardType="numeric"
                        />
                        <View style={styles.modalButtonContainer}>
                            <TouchableOpacity
                                style={[styles.button, styles.cancelButton]}
                                onPress={() => setShowModel(false)}
                            >
                                <Text style={styles.buttonText}>{t("common.cancel") || "取消"}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.button, styles.confirmButton]}
                                onPress={changeMqttAddr}
                            >
                                <Text style={styles.buttonText}>{t("login.settings.confirm")}</Text>
                            </TouchableOpacity>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            <KeyboardAvoidingView style={styles.container}>
                <View style={styles.logoContainer}>
                    <Image source={require("@/assets/images/login-icon.png")} style={styles.logo}/>
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
                                <ActivityIndicator size="small" color="#fff"/>
                                <Text style={[styles.buttonText, {marginLeft: 8}]}>{t("login.connecting")}</Text>
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

// 3. 样式更新
const styles = StyleSheet.create({
    languageSwitcher: {
        position: "absolute",
        top: 50,
        left: 20,
        zIndex: 2,
    },
    settingsButton: {
        width: 60,
        height: 60,
        position: "absolute",
        right: 20,
        top: 40,
        zIndex: 2,
        justifyContent: "center",
        alignItems: "center",
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
        shadowOffset: {width: 0, height: 4},
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
        fontSize: 16,
        fontWeight: "bold",
        letterSpacing: 1,
    },
    // --- Modal 相关样式 ---
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.6)", // 半透明背景
        justifyContent: "center",
        alignItems: "center",
    },
    modalContent: {
        width: "85%",
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 24,
        shadowColor: "#000",
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: "bold",
        marginBottom: 20,
        textAlign: "center",
        color: "#333",
    },
    modalButtonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 10,
        gap: 10,
    },
    confirmButton: {
        flex: 1,
        backgroundColor: "#3b82f6",
    },
    cancelButton: {
        flex: 1,
        backgroundColor: "#9ca3af",
    }
});