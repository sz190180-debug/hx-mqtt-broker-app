# 仓库批量更新重复问题修复验证

## 问题描述
用户反馈在进行批量更新点位状态时，会出现多次显示"批量更新状态成功"的提示。

## 根本原因分析

### 1. MQTT客户端缺少removeListener方法
- `warehouse.tsx`中调用了`client.removeListener()`，但MQTT客户端类中没有实现该方法
- 导致监听器无法正确移除，造成重复监听

### 2. 消息监听器重复注册
- useEffect清理函数中监听器没有被正确移除
- 每次组件重新渲染时都会注册新的监听器
- 导致同一个MQTT消息被多个监听器处理

### 3. 缺少请求ID验证机制
- 批量更新响应没有验证请求ID
- 可能处理到其他请求的响应或重复响应

## 修复方案

### 1. 添加removeListener方法到MQTT客户端
```typescript
removeListener(event: keyof MqttClientEventCallbacks, fn: (topic: any, message: Buffer) => void) {
  this.client?.off(event, fn);
  // 从缓存中移除函数引用
  const index = this.cacheFn.findIndex((f) => f === fn);
  if (index > -1) {
    this.cacheFn.splice(index, 1);
  }
}
```

### 2. 添加批量更新请求ID管理
```typescript
// 批量更新请求ID管理 - 防止重复处理
const batchUpdateRequestRef = useRef<number | null>(null);
```

### 3. 修复批量更新响应处理
- 添加请求ID验证机制
- 只处理当前发起的请求响应
- 忽略重复或无效的响应

### 4. 优化useEffect依赖
- 移除对listenerMessage的依赖，避免不必要的重新注册
- 只依赖client.client?.connected状态

## 测试验证步骤

1. **启动应用并连接MQTT**
2. **进入仓库管理页面**
3. **选择一个仓库**
4. **进入批量操作模式**
5. **选择多个点位**
6. **执行批量状态更新**
7. **验证只显示一次成功提示**

## 预期结果
- 批量更新操作只显示一次"批量更新状态成功"提示
- 控制台日志显示正确的请求ID匹配
- 不再出现重复处理的日志信息

## 修复文件列表
- `utils/mqtt.ts` - 添加removeListener方法
- `app/(tabs)/warehouse.tsx` - 修复监听器管理和请求ID验证

## 状态刷新问题修复

### 问题描述
批量更新后界面状态没有刷新，点位状态显示不正确。

### 根本原因
1. 批量更新成功后重新加载整个数据集效率低
2. 状态更新时机可能有问题
3. 缺少专门的本地状态更新机制

### 解决方案

#### 1. 创建专门的本地状态更新函数
```typescript
const updateLocalPositionStatus = (positionIds: number[], newStatus: PositionStatus) => {
  // 直接更新本地状态，避免重新加载
  // 重新计算统计数据
  // 使用setTimeout确保状态更新时机正确
}
```

#### 2. 优化批量更新后的处理流程
- 使用本地状态更新替代重新加载数据
- 立即更新UI显示
- 确保统计数据同步更新

#### 3. 添加调试日志
- 记录状态更新过程
- 便于排查问题

### 测试步骤
1. 进入仓库管理页面
2. 选择仓库并进入批量操作模式
3. 选择多个点位
4. 修改状态（如从"可用"改为"占用"）
5. 确认状态立即更新
6. 检查统计数据是否正确更新

### 预期结果
- 批量更新后点位状态立即刷新
- 统计数据正确更新
- 不需要手动刷新页面
