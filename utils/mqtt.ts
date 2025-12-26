import mqtt, {IClientOptions, MqttClient, MqttClientEventCallbacks} from "mqtt";
import {StorageUtil} from "./storageUtil";

export type IOptions = Partial<IClientOptions & { uri: string }>;

class MyMqttClient {
    private static instance: MyMqttClient;

    options: IOptions = {
        // clientId: "mqttx_31ea385c",
        // uri: "ws://111.0.91.143:1884",
        // username: "test",
        // password: "test123",
        path: "/mqtt",
    };
    client: MqttClient | null = null;
    cacheFn: any[] = [];

    apiTheme = {
        // 发送
        req: {
            taskTemp: (payload?: any) => `/iot/${this.options?.clientId}/req/task/userTaskChainTemplate`,
            queryCar: (payload?: any) => `/iot/${this.options?.clientId}/req/amr/userAmr`,
            taskSend: (payload?: any) => `/iot/${this.options?.clientId}/req/taskChainTemplate/submit`,
            queryGroup: (payload?: any) => `/iot/${this.options?.clientId}/req/task/userTaskChainGroup`,
            taskStatus: (payload?: any) => `/iot/${this.options?.clientId}/req/task/getTaskChainByIds`,
            // 仓库管理相关接口
            warehouseAll: (payload?: any) => `/iot/${this.options?.clientId}/req/warehouse/all`,
            warehouseColumnList: (payload?: any) => `/iot/${this.options?.clientId}/req/warehouse/column/list`,
            warehouseVertexesList: (payload?: any) => `/iot/${this.options?.clientId}/req/warehouse/vertexes/list`,
            warehousePositionBatchUpdate: (payload?: any) => `/iot/${this.options?.clientId}/req/warehouse/position/batchUpdate`,

            // [新增] 查询满仓仓库列表请求
            queryFullWarehouse: (payload?: any) => `/iot/req/task/full/warehouse`,
        },
        // 订阅
        rep: {
            taskTemp: (payload?: any) => `/iot/${this.options?.clientId}/rep/task/userTaskChainTemplate`,
            queryCar: (payload?: any) => `/iot/${this.options?.clientId}/rep/amr/userAmr`,
            taskSend: (payload?: any) => `/iot/${this.options?.clientId}/rep/taskChainTemplate/submit`,
            queryGroup: (payload?: any) => `/iot/${this.options?.clientId}/rep/task/userTaskChainGroup`,
            taskStatus: (payload?: any) => `/iot/${this.options?.clientId}/rep/task/getTaskChainByIds`,
            // 仓库管理相关接口
            warehouseAll: (payload?: any) => `/iot/${this.options?.clientId}/rep/warehouse/all`,
            warehouseColumnList: (payload?: any) => `/iot/${this.options?.clientId}/rep/warehouse/column/list`,
            warehouseVertexesList: (payload?: any) => `/iot/${this.options?.clientId}/rep/warehouse/vertexes/list`,
            warehousePositionBatchUpdate: (payload?: any) => `/iot/${this.options?.clientId}/rep/warehouse/position/batchUpdate`,

            // [新增] 接收满仓仓库列表响应
            queryFullWarehouse: (payload?: any) => `/iot/rep/task/full/warehouse`,
        },
    };

    constructor() {
        this.getLocalOptions();
    }

    public static getInstance(generatorNewInstance?: boolean): MyMqttClient {
        if (!MyMqttClient.instance || generatorNewInstance) {
            MyMqttClient.instance = new MyMqttClient();
        }
        return MyMqttClient.instance;
    }

    public async getLocalOptions() {
        const localOptions = await StorageUtil.getItem<IOptions>("clientOptions");

        if (localOptions) {
            this.options = {
                ...this.options,
                ...localOptions,
            };
        }
    }

    connect(username?: string, password?: Buffer | string) {
        return new Promise(async (resolve, reject) => {
            try {
                if (this.client?.connected) {
                    resolve(true);
                    return;
                }

                const {uri, ...other} = this.options || {};
                if (!this.options || !uri || !username || !password) {
                    const error = new Error("请输入正确的参数");
                    reject(error);
                    return;
                }

                // 先清理之前的连接
                if (this.client) {
                    await this.end();
                }

                console.log("正在连接到:", uri);
                this.client = mqtt.connect(uri, {
                    ...other,
                    username,
                    password,
                    connectTimeout: 10000, // 10秒连接超时
                    reconnectPeriod: 5000, // 禁用自动重连，由应用层控制
                });

                // 监听连接成功事件
                const handleConnect = () => {
                    console.log("MQTT连接成功");
                    this.client?.off('connect', handleConnect);
                    this.client?.off('error', handleError);
                    resolve(true);
                };

                // 监听连接错误事件
                const handleError = (error: Error) => {
                    console.log("MQTT连接错误:", error);
                    this.client?.off('connect', handleConnect);
                    this.client?.off('error', handleError);
                    reject(error);
                };

                this.client.on('connect', handleConnect);
                this.client.on('error', handleError);

            } catch (error) {
                console.log("连接过程中发生错误:", error);
                reject(error);
            }
        });
    }

    listenerMessage(event: keyof MqttClientEventCallbacks, fn: (topic: any, message: Buffer) => void = () => {
    }) {
        if (this.cacheFn.some((f) => f === fn)) {
            this.client?.off(event, fn);
        } else {
            this.cacheFn.push(fn);
            this.client?.on(event, fn);
        }
    }

    removeListener(event: keyof MqttClientEventCallbacks, fn: (topic: any, message: Buffer) => void) {
        this.client?.off(event, fn);
        // 从缓存中移除函数引用
        const index = this.cacheFn.findIndex((f) => f === fn);
        if (index > -1) {
            this.cacheFn.splice(index, 1);
        }
    }

    send = (topic: keyof typeof this.apiTheme.req, options: any) => {
        // 确保 payload.d 存在
        if (!options.payload) {
            options.payload = {};
        }
        if (!options.payload.d) {
            options.payload.d = {};
        }

        // 如果没有提供 reqId 或 reqId 为 0，则自动生成一个
        if (!options.payload.d.reqId || options.payload.d.reqId === 0) {
            const uuid = new Date().getTime() + Math.floor(Math.random() * 3000);
            options.payload.d.reqId = uuid;
        }

        const str = JSON.stringify(options.payload);
        console.log(`发送消息到 ${topic}, reqId: ${options.payload.d.reqId}:`, str);
        this.client?.publish(this.apiTheme.req[topic](options.uriParams), str, {qos: 1});
    };

    subscribe = (topic: keyof typeof this.apiTheme.rep, payload?: any) => {
        console.log(this.apiTheme.rep[topic](payload), "this.apiTheme.rep[topic](payload)");
        this.client?.subscribe(this.apiTheme.rep[topic](payload), {qos: 1});
    };

    unsubscribe = (topic: keyof typeof this.apiTheme.rep, payload?: any) => {
        this.client?.unsubscribe(this.apiTheme.rep[topic](payload));
    };

    end() {
        return new Promise((resolve) => {
            this.client?.end(true, () => {
                resolve(true);
            });
        });
    }
}

export default MyMqttClient;
