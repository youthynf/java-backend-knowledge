# Redis 管道有什么作用？

## 核心概念

Redis Pipeline（管道）允许客户端一次性发送多条命令，不必每条命令都等待服务端响应，从而减少网络往返时间 RTT。它不改变 Redis 单线程执行命令的事实，也不保证多条命令的原子性。

管道适合批量写入、批量查询、批量删除等场景，尤其在客户端和 Redis 之间网络延迟明显时收益更大。它优化的是网络交互，不是单条命令复杂度。

## 面试官想考什么

- 是否知道 Pipeline 解决的是 RTT 问题；
- 是否能区分 Pipeline、事务 `MULTI/EXEC`、Lua 脚本；
- 是否理解批量过大可能造成缓冲区和阻塞问题；
- 是否能结合 Java 客户端说明使用方式。

## 标准回答

> Redis 管道的作用是把多条命令批量发送，减少多次请求响应带来的网络开销。它不会让命令并行执行，也不保证原子性。如果需要原子性可以用 Lua 或事务。实际使用时要控制批量大小，例如每批几百到几千条，避免客户端或服务端输出缓冲区过大，导致内存上涨和延迟抖动。

## 深挖追问

### Pipeline 和 Lua 有什么区别？

Pipeline 是客户端批量发送命令，命令之间仍可能被其他客户端命令穿插执行，不保证原子性；Lua 脚本在 Redis 中整体执行，具备原子性，但脚本执行时间太长会阻塞 Redis。

### Pipeline 是否一定提升性能？

不一定。如果瓶颈在 Redis CPU、慢命令、大 Key 或网络带宽，Pipeline 可能收益有限，甚至因批量过大导致延迟峰值变高。

## 实战场景 / 代码示例

Spring Data Redis 批量写缓存：

```java
redisTemplate.executePipelined((RedisCallback<Object>) connection -> {
    for (UserDTO user : users) {
        byte[] key = ("user:" + user.getId()).getBytes(StandardCharsets.UTF_8);
        byte[] val = serialize(user);
        connection.stringCommands().setEx(key, 3600, val);
    }
    return null;
});
```

批量删除也建议按批次执行，不要一次塞入几十万条命令。

## 易错点 / 总结

- Pipeline 减少 RTT，不保证原子性；
- 批量越大不一定越好，要控制内存和响应时间；
- 慢命令放进 Pipeline 仍然是慢命令；
- 集群模式下要注意 key 分布和客户端实现；
- 需要原子读改写时优先考虑 Lua。
