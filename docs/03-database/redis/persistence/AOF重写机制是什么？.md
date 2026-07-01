# AOF 重写机制是什么

## 核心概念

AOF 文件记录每条写命令，时间一长就会膨胀——同一个 key 被反复修改 100 次，AOF 里就有 100 条命令，但当前内存里只剩最后 1 个状态。重启时回放这 100 条命令既慢又浪费磁盘。

AOF 重写机制就是解决这个问题的：扫描当前内存里的所有 key-value，用最少的命令把它们重新表达出来，写到一个新 AOF 文件，完成后原子替换旧文件。比如一个 counter 累积了 1000 次 `INCR`，重写后只需要一条 `SET counter 1000`。

重写是耗时操作，必须放到子进程里做，不能阻塞主线程。Redis 用 `bgrewriteaof` 子进程完成，配合 AOF 重写缓冲区解决重写期间主进程新写入的同步问题。

## 标准回答

AOF 重写通过 `fork` 子进程扫描内存，把当前每个 key-value 用最少命令写到新 AOF 文件。期间主进程继续服务，新写入命令同时写到旧 AOF 缓冲区和 AOF 重写缓冲区；子进程写完后信号通知主进程，主进程把重写缓冲区增量追加到新文件，原子 rename 替换旧文件。整个过程中除了 fork 和最后的信号处理会短暂阻塞主进程，其他时间都不阻塞。

要点：

1. 触发方式：手动 `BGREWRITEAOF`、自动按 `auto-aof-rewrite-percentage` 和 `auto-aof-rewrite-min-size` 阈值、`FLUSHALL`/`SHUTDOWN` 间接。
2. 重写不分析旧 AOF，而是直接读当前内存数据，所以能大幅压缩历史命令。
3. fork 子进程而非子线程：用 COW 共享内存，避免锁竞争，崩溃不影响主进程。
4. 重写缓冲区解决"重写期间主进程新写入"的一致性问题。
5. 大 Key 重写会拉长子进程耗时，写时复制内存放大明显。

## 实现原理

### 为什么要用子进程而不是子线程

子线程和主线程共享内存，修改共享数据要加锁，会拖慢主线程命令执行；子进程通过 `fork` 拿到主进程的页表副本，物理内存通过 COW 共享，子进程只读，主进程修改时内核自动复制被改的页，无需加锁。另外子进程崩溃不影响主进程，子线程崩溃可能拖垮整个 Redis。

### 重写全流程

```text
主进程判断触发条件满足
  -> 拒绝重写：当前已有 RDB/AOF 子进程在跑（避免磁盘 IO 雪崩）
  -> 主进程 fork() 出 bgrewriteaof 子进程
       fork 期间主进程短暂阻塞（页表复制）
  -> 子进程：
       1. 遍历所有 DB 的所有 key
       2. 对每个 key，根据类型生成等价的写入命令
          - String: SET key value
          - List:   RPUSH key v1 v2 ...（拆批避免命令过长）
          - Hash:  HSET key f1 v1 f2 v2 ...
          - Set:   SADD key m1 m2 ...
          - ZSet:   ZADD key s1 m1 s2 m2 ...
          - 过期时间单独 EXPIREAT/PEXPIREAT
       3. 写到新 AOF 文件（Redis 7.0+ 写到 appendonlydir 下的 base 文件）
       4. 完成后向主进程发 SIGCHLD 信号
  -> 主进程同时：
       1. 继续处理客户端命令
       2. 把写命令追加到 aof_buf（旧 AOF 流）
       3. 把写命令追加到 aof_rewrite_buf（重写缓冲区）
  -> 主进程收到信号，执行信号处理函数（短暂阻塞）：
       1. 把 aof_rewrite_buf 内容追加到新 AOF 文件
       2. 原子 rename 新文件覆盖旧文件
       3. 更新 server.aof_fd 指向新文件
  -> 重写完成，主进程继续服务
```

### 重写缓冲区的必要性

子进程 fork 出来后看到的是 fork 瞬间的内存快照。如果重写期间主进程修改了某个 key，子进程因为 COW 看到的还是旧值，写出来的新 AOF 就漏了这次修改。所以主进程在这期间除了写旧 AOF 缓冲区，还要把命令同步写到 `aof_rewrite_buf`，等子进程写完后由主进程追加进新文件。这样新 AOF 文件 = fork 瞬间的全量状态 + 重写期间的增量命令，状态和当前内存一致。

### 大 Key 对重写的影响

- 子进程遍历大 Key 耗时长，期间占用 CPU。
- 大 Key 被修改会触发大量页复制，主进程内存放大。
- 重写缓冲区累积的命令多，信号处理期间追加耗时长，主进程阻塞明显。
- 重写出的命令本身可能超长（如 100 万元素的 List），需要拆批（默认 `proto-max-bulk-len` 512MB）。

### 触发条件细节

| 触发源 | 条件 | 说明 |
|--------|------|------|
| 自动 | `aof_current_size >= auto-aof-rewrite-min-size` 且 `(aof_current_size - aof_base_size) / aof_base_size >= auto-aof-rewrite-percentage` | 两个条件同时满足 |
| 手动 | `BGREWRITEAOF` | 当前已有子进程时返回错误 |
| 配置变更 | `CONFIG SET auto-aof-rewrite-percentage 50` | 立即生效，下次评估时按新值 |

### 阻塞点

| 阶段 | 是否阻塞 | 原因 |
|------|----------|------|
| fork | 短暂阻塞 | 复制页表，正比于内存大小 |
| 子进程重写 | 不阻塞 | 子进程独立运行 |
| 主进程写 aof_rewrite_buf | 不阻塞 | 内存追加 |
| 信号处理 | 短暂阻塞 | 追加 rewrite_buf 到新文件 + rename |
| rename | 极短 | 同文件系统原子操作 |

### AOF 重写版本演进

| Redis 版本 | 重写机制变化 | 关键改进 |
|------------|-------------|----------|
| 2.0 | 引入 AOF 重写 | fork 子进程扫描内存 |
| 2.4 | 自动触发 | `auto-aof-rewrite-percentage`、`auto-aof-rewrite-min-size` |
| 2.6 | `no-appendfsync-on-rewrite` | 重写期间避免 fsync 竞争磁盘 |
| 4.0 | 混合持久化 | 重写时 base 用 RDB 格式（`aof-use-rdb-preamble`） |
| 5.0 | 默认开启混合持久化 | base 文件天然是 RDB |
| 6.0 | 同 5.0 | 无大变化 |
| 7.0 | multi-part AOF | 重写产出 base + incr 文件对，manifest 管理；不再需要大缓冲区原子 rename |
| 7.2 | 同 7.0 | Function 重写 |

7.0 之前重写完成后是 `rename(新文件, 旧文件名)` 原子替换；7.0+ 改为生成新的 base + incr 文件，更新 manifest 清单，原子性更好，备份更灵活。

### AOF 重写时序

```text
主进程                                bgrewriteaof 子进程
  |                                     |
  | --- fork() ----------------------> |
  | (短暂阻塞，复制页表)                |
  |                                     |
  | 继续处理客户端命令                  | 遍历内存，按类型生成命令
  | 写命令同时写:                       | 写到新 AOF 文件
  |   - aof_buf（旧 AOF 流）            |   7.0+: 写到 appendonlydir/base
  |   - aof_rewrite_buf（重写缓冲区）   |
  |                                     |
  |                                     | 写完，向主进程发 SIGCHLD
  |                                     |
  | <--- SIGCHLD --------------------- |
  |                                     |
  | 信号处理（短暂阻塞）：              |
  |   1. 把 aof_rewrite_buf 追加到新文件 |
  |   2. rename 新文件覆盖旧文件        |
  |      7.0+: 更新 manifest 清单       |
  |   3. 更新 aof_fd 指向新文件         |
  |                                     |
  | 重写完成，继续服务                  |
```

## 代码示例

### 触发与监控

```bash
# 手动触发
redis-cli BGREWRITEAOF

# 查看状态
redis-cli INFO persistence | grep -E "aof_rewrite_in_progress|aof_rewrite_scheduled|aof_last_bgrewrite_status|aof_last_rewrite_time_sec|aof_current_size|aof_base_size"

# 查看是否在排队等 RDB 子进程
# aof_rewrite_scheduled=1 表示等当前 RDB 完成后会自动启动 AOF 重写
```

### 配置示例

```conf
# 文件大小翻倍且至少 64MB 时触发
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# 重写期间不 fsync，减少磁盘 IO 竞争（默认 no，建议保持）
no-appendfsync-on-rewrite no

# Redis 4.0+ 开启混合持久化，重写时 base 用 RDB 格式
aof-use-rdb-preamble yes
```

### 主动控制重写时机

```bash
# 低峰期手动触发，避免高峰期 fork 影响延迟
redis-cli BGREWRITEAOF

# 也可以通过脚本结合 INFO 判断
if [ "$(redis-cli INFO persistence | grep aof_rewrite_in_progress | cut -d: -f2 | tr -d '\r')" = "0" ]; then
  redis-cli BGREWRITEAOF
fi
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| AOF 文件膨胀 | 自动重写 + 定期低峰手动 `BGREWRITEAOF` | 大实例重写期间内存放大要预留 |
| 升级到 7.0 multi-part | 自然迁移，重写后会产出 base + incr 文件 | 老版本 AOF 仍可读，回滚兼容 |
| 配合混合持久化 | `aof-use-rdb-preamble yes` | base 是 RDB，恢复快，4.0+ 支持 |
| 应急压缩 | `BGREWRITEAOF` 立即触发 | 高峰期慎用，可能造成延迟尖刺 |
| 主从切换前 | 切换前手动重写，避免新主立即触发 | 切换瞬间业务流量打到新主，重写会加剧压力 |

## 深挖追问

### 1. 重写期间 Redis 宕机会丢数据吗？

主进程宕机：旧 AOF 文件还在，重写产生的新文件未完成会被丢弃，重启加载旧 AOF，最多丢最后未 fsync 的部分，和正常宕机一样。

子进程宕机：主进程收到子进程退出信号，重写失败，旧 AOF 不受影响，下次满足条件会重新触发。

### 2. 重写缓冲区会不会无限增长？

理论上会，重写时间越长缓冲区越大。Redis 没有对 `aof_rewrite_buf` 设硬上限，所以重写越慢主进程内存压力越大。这就是大 Key + 慢盘的恶性循环：重写慢 -> 缓冲区涨 -> 内存压力 -> 可能 OOM。

### 3. 重写为什么不能和 bgsave 同时进行？

两者都涉及大量磁盘 IO，并发会让磁盘抖动严重，主进程 fsync 也会受影响。Redis 用 `server.rdb_child_pid` 和 `server.aof_child_pid` 互斥控制：AOF 重写请求到来时如果 RDB 子进程在跑，会标记 `aof_rewrite_scheduled`，等 RDB 结束再启动。

### 4. 重写后的命令顺序怎么保证正确？

重写时按 DB 编号 -> key 顺序遍历，对每个 key 先写 SET/HSET 等数据命令，再写 EXPIREAT 过期时间。过期时间用绝对时间戳，避免重写完成时间和执行时间错位。Lua 脚本会以 EVALSHA + 检查 SHA 是否存在的方式重写。

### 5. fork 真有那么慢吗？

实测：24GB 实例 fork 大约 80-150ms，64GB 实例可能 200-400ms。这段时间主进程完全阻塞，客户端会感受到延迟尖刺。监控 `latest_fork_usec` 指标，超过 100ms 要警惕，超过 1s 通常说明实例过大需要拆分。

## 易错点

- `BGREWRITEAOF` 在已有 RDB 子进程时会返回 "Background append only file rewriting started" 但实际排队，要看 `aof_rewrite_scheduled` 才知道是否真启动。
- 重写期间产生的增量命令既写旧 AOF 又写重写缓冲区，是双写，不是只写缓冲区。
- `no-appendfsync-on-rewrite yes` 看似降低 IO 压力，但重写期间 fsync 暂停会扩大数据丢失窗口，生产上一般保持 `no`。
- 重写完成后是 rename 不是覆盖，要求 base 文件和原 AOF 文件在同一文件系统，否则改名会变成跨设备复制。
- 7.0 之前的 `aof-use-rdb-preamble yes` 只在重写时生效，对已存在的纯 AOF 文件不会改造。

## 总结

AOF 重写是 Redis 控制 AOF 文件体积的关键机制：fork 子进程扫描当前内存，用最少命令重新表达全量状态，期间主进程通过双写旧 AOF + 重写缓冲区保证一致性，子进程完成后主进程追加增量并原子替换文件。重写带来两个主要开销——fork 短暂阻塞和重写期间的内存放大——对大 Key 和大实例尤为敏感。生产实践要避开高峰期触发，监控 `aof_delayed_fsync`、`latest_fork_usec`，并配合混合持久化让 base 文件成为 RDB 以提升恢复速度。

## 参考资料

- [Redis Persistence 官方文档](https://redis.io/docs/management/persistence/)
- [Redis aof.c 源码注释](https://github.com/redis/redis/blob/unstable/src/aof.c)
- 《Redis 设计与实现》黄健宏
