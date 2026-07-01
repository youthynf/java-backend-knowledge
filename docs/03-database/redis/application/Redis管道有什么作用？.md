# Redis 管道有什么作用

## 核心概念

Redis Pipeline（管道）是客户端机制，允许**一次性发送多条命令，不等每条命令的响应就继续发下一条**，从而把多次网络往返（RTT）合并成一次。它优化的是网络开销，不改变 Redis 单线程执行命令的事实，也不保证命令的原子性。

一句话结论：**Pipeline 的作用是减少网络 RTT，把多次"请求 - 响应"合并为一次。它不保证原子性，命令之间可能被其他客户端命令穿插。需要原子性用 Lua 脚本或 MULTI/EXEC 事务。**

## 标准回答

| 维度 | Pipeline | MULTI/EXEC | Lua 脚本 | MGET/MSET |
|------|----------|------------|----------|-----------|
| 优化目标 | 网络 RTT | 原子性 | 原子性 + 条件分支 | 单条命令批处理 |
| 原子性 | 不保证 | 弱（不回滚） | 强 | 强 |
| 服务端执行 | 顺序但可被插入 | 顺序不插入 | 整体原子 | 单条原子 |
| 命令种类 | 任意 | 任意 | 任意 | 仅 GET/SET 系列 |
| 适用 | 批量读写减少 RTT | 批量执行需顺序 | 复杂业务逻辑 | 简单批量 KV |

## 详细机制

### 1. 为什么需要 Pipeline

普通 Redis 命令模式：

```text
客户端 → 发送 cmd1 → 等待响应1 → 发送 cmd2 → 等待响应2 → ...
RTT × N + 执行时间 × N
```

如果客户端到 Redis 网络往返 1ms，发 1000 条命令就要 1 秒（光网络开销），实际命令执行只需几毫秒。

Pipeline 模式：

```text
客户端 → 批量发送 cmd1...cmdN → 一次性接收所有响应
RTT × 1 + 执行时间 × N
```

1000 条命令只需 1 次网络往返，节省 999 次 RTT。在跨机房场景（RTT 5~20ms）下提升尤其明显。

### 2. Pipeline 不保证原子性

Pipeline 中的命令是顺序发送的，但 Redis 服务端可能在这些命令之间处理其他客户端的命令。

```text
客户端 A：Pipeline [SET k1 v1, SET k2 v2]
客户端 B：GET k1   ← 可能在 SET k1 之后、SET k2 之前执行
```

所以 Pipeline 适合"批量、不关心中间状态"的场景，不适合需要原子性的复合操作。

### 3. Pipeline vs MULTI/EXEC 的区别

| 维度 | Pipeline | MULTI/EXEC |
|------|----------|------------|
| 客户端发送 | 批量发送 | MULTI 后逐条入队，EXEC 触发 |
| 服务端执行 | 可被其他客户端命令穿插 | 事务内不被打断 |
| 原子性 | 不保证 | 弱（不回滚） |
| 网络优化 | 是 | 否 |
| 适用 | 批量减少 RTT | 批量且需顺序 |

两者可组合：在事务内用 Pipeline 发送减少 RTT，同时获得事务的顺序性。

### 4. 批量大小的权衡

Pipeline 不是越大越好：

| 批量大小 | 优点 | 缺点 |
|----------|------|------|
| 100~1000 | 平衡好 | 推荐 |
| 1 万+ | RTT 极少 | 客户端缓冲区大，服务端输出缓冲区压力大 |
| 10 万+ | 极端 | 内存飙升，延迟峰值高 |

Redis 服务端有 `client-output-buffer-limit` 限制，超出会强制断开连接。

```conf
# 普通客户端输出缓冲区限制
client-output-buffer-limit normal 0 0 0
# 从节点复制缓冲区
client-output-buffer-limit replica 256mb 64mb 60
# Pub/Sub 缓冲区
client-output-buffer-limit pubsub 32mb 8mb 60
```

### 5. Cluster 模式下的 Pipeline

Cluster 模式下不同 key 可能在不同节点。客户端需按节点分组分别 Pipeline。Jedis/Lettuce/Redisson 都已内置这种路由。

```java
// JedisCluster 自动按槽位分组
jedisCluster.pipelined((Pipeline p) -> {
    p.set("k1", "v1");   // 槽 1，节点 A
    p.set("k2", "v2");   // 槽 2，节点 B
});
// 客户端内部拆成两个 Pipeline 分别发往 A 和 B
```

### 6. Pipeline 和事务的组合

可以在 MULTI/EXEC 事务里用 Pipeline 批量发送命令，既减少 RTT 又获得事务顺序性：

```java
Pipeline pipe = jedis.pipelined();
Response<String> multi = pipe.multi();
pipe.set("k1", "v1");
pipe.set("k2", "v2");
Response<List<Object>> exec = pipe.exec();
pipe.sync();
List<Object> results = exec.get();
```

## 代码示例

### Jedis Pipeline

```java
Jedis jedis = new Jedis("127.0.0.1", 6379);
Pipeline pipe = jedis.pipelined();
for (int i = 0; i < 1000; i++) {
    pipe.set("key:" + i, "value:" + i);
}
List<Object> results = pipe.syncAndReturnAll();   // 一次性获取所有响应

// 批量读取
Pipeline pipe2 = jedis.pipelined();
List<Response<String>> responses = new ArrayList<>();
for (int i = 0; i < 1000; i++) {
    responses.add(pipe2.get("key:" + i));
}
pipe2.sync();
for (Response<String> r : responses) {
    System.out.println(r.get());
}
```

### Spring Data Redis Pipeline

```java
@Autowired private RedisTemplate<String, String> redis;

public void batchInsert(List<User> users) {
    redis.executePipelined((RedisCallback<Object>) connection -> {
        for (User u : users) {
            byte[] key = ("user:" + u.getId()).getBytes(StandardCharsets.UTF_8);
            byte[] val = JSON.toJSONBytes(u);
            connection.stringCommands().setEx(
                key, 3600, val
            );
        }
        return null;
    });
}

public List<User> batchGet(List<Long> ids) {
    List<Object> results = redis.executePipelined((RedisCallback<Object>) connection -> {
        for (Long id : ids) {
            byte[] key = ("user:" + id).getBytes(StandardCharsets.UTF_8);
            connection.stringCommands().get(key);
        }
        return null;
    });
    return results.stream()
        .filter(Objects::nonNull)
        .map(o -> (User) o)
        .collect(Collectors.toList());
}
```

### Pipeline + 事务组合

```java
Transaction tx = jedis.multi();
for (int i = 0; i < 100; i++) {
    tx.set("k" + i, "v" + i);
}
List<Object> results = tx.exec();
```

### Lua 脚本 vs Pipeline 取舍

```java
// Pipeline：批量但不原子
Pipeline p = jedis.pipelined();
p.decr("stock:1");
p.decr("stock:2");
p.sync();   // 两条命令之间可能被穿插

// Lua：原子但单脚本
jedis.eval(
    "redis.call('DECR', KEYS[1]); redis.call('DECR', KEYS[2])",
    2, "stock:1", "stock:2"
);
```

### Lettuce 异步 Pipeline

```java
StatefulRedisConnection<String, String> conn = lettuce.connect();
RedisAsyncCommands<String, String> async = conn.async();

async.setAutoFlushCommands(false);  // 关闭自动刷新
for (int i = 0; i < 1000; i++) {
    async.set("key:" + i, "value:" + i);
}
async.flushCommands();  // 一次性发送
```

## 实战场景

| 场景 | 推荐方案 | 批量大小 |
|------|----------|----------|
| 批量写入缓存 | Pipeline | 500~1000 |
| 批量删除 key | Pipeline | 500 |
| 大批量 HGET | Pipeline | 200 |
| 库存扣减（原子） | Lua | N/A |
| 批量初始化预热 | Pipeline | 1000 |
| 集群模式批量操作 | Pipeline（客户端自动分组） | 500 |
| 大 ZSet 遍历 | Pipeline + ZSCAN | 100~500 |
| 统计 key 数量 | SCAN + 计数 | 100~500 |

## 深挖追问

### Pipeline 一定提升性能吗？

不一定。瓶颈不在网络时（如 Redis CPU 已满、慢命令多），Pipeline 收益有限。批量过大反而导致内存峰值和延迟抖动。生产建议压测确定最佳批量。

### Pipeline 会阻塞 Redis 吗？

不会。Pipeline 是客户端缓冲，Redis 仍按到达顺序逐条执行。但如果一次发送大量命令，Redis 单线程处理时间变长，会让其他客户端等待。

### Pipeline 失败后怎么处理？

Pipeline 中某条命令出错（如类型错误），其他命令仍执行，错误在响应列表中体现。客户端需检查每条响应。如果网络中断，整个 Pipeline 失败，需重试。

### Cluster 模式 Pipeline 性能怎么样？

客户端按槽位分组发往不同节点，每个节点一个 Pipeline。整体性能仍优于普通模式，但比单机 Pipeline 略低（多节点协调开销）。

### Pipeline 和 MGET/MSET 的区别？

| 维度 | Pipeline | MGET/MSET |
|------|----------|-----------|
| 命令类型 | 客户端机制 | 服务端命令 |
| 命令种类 | 任意 | 特定（GET/SET 系列） |
| 原子性 | 不保证 | 单条命令原子 |
| 限制 | 无 | MGET 操作必须同类型 |

简单批量 GET 用 MGET 更高效（单条命令开销小于 Pipeline）；混合命令批量用 Pipeline。

### 为什么 Pipeline 不保证原子性还要用？

很多业务场景不要求原子，只要减少网络开销。如批量预热缓存、批量删除过期 key、批量查询用户信息。这些场景下 Pipeline 是最简单高效的方案。

### Pipeline 中的命令响应顺序如何？

响应顺序与发送顺序一致。客户端按顺序收集响应列表，第 i 个响应对应第 i 条命令。

### Pipeline 与 Pub/Sub 的区别？

Pipeline 是"批量命令"机制，请求 - 响应模式；Pub/Sub 是"发布订阅"机制，单向推送。Pipeline 用于批量操作，Pub/Sub 用于消息广播。

## 易错点

- 把 Pipeline 当原子操作用，结果数据不一致；
- 批量太大（10 万+），客户端 OOM 或服务端缓冲区超限断开；
- 慢命令放进 Pipeline，仍是慢命令，且批量后阻塞更久；
- Cluster 模式跨槽用 Pipeline 报错或被自动拆分；
- 不检查响应列表，错误被忽略；
- Pipeline 后忘记 `sync()`，命令没真正执行；
- Pipeline 中混入 WATCH/UNWATCH（这两个命令不能入队）。

## 总结

Pipeline 的核心作用是**减少网络 RTT**，把多次"请求 - 响应"合并为一次。它**不保证原子性**，命令之间可能被其他客户端命令穿插。生产推荐批量 500~1000，按业务压测调整。需要原子性时改用 **Lua 脚本**（强原子）或 **MULTI/EXEC 事务**（顺序执行不插入）。Cluster 模式下客户端自动按槽位分组 Pipeline。简单批量 GET 用 MGET 更高效。

## 参考资料

- [Redis 官方文档：Pipelining](https://redis.io/docs/manual/pipelining/)
- [Jedis Pipeline 文档](https://github.com/redis/jedis/wiki/Getting-started#pipelining)
- [Lettuce Pipelining](https://github.com/lettuce-io/lettuce-core/wiki/Pipelining)

---
