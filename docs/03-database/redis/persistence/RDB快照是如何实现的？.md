# RDB 快照是如何实现的

## 核心概念

RDB（Redis Database）是 Redis 默认的持久化方式，它把某一时刻内存里的全部数据以二进制形式写入磁盘，生成一个紧凑的 dump.rdb 文件。重启时 Redis 直接把 RDB 文件读回内存即可恢复数据，不需要重放命令，所以恢复速度比 AOF 快。

RDB 的核心矛盾是：拍快照是个"重活"，要遍历整个数据集写盘，但又不能阻塞主线程对外提供服务。Redis 的解法是 `fork` 一个子进程，让子进程去拍快照，主进程继续处理命令；父子进程通过操作系统的写时复制（Copy-On-Write，COW）共享同一份物理内存，只有被修改的页才会真正复制。

## 标准回答

RDB 快照通过 `bgsave` 触发：主进程 `fork` 出子进程，子进程遍历内存把数据写成二进制 RDB 文件，主进程继续对外服务。期间主进程的写操作通过写时复制保留独立性，被修改的页才会被复制。生成 RDB 期间写入的新数据不会进入这一版快照，要等下一次 `bgsave`。

要点：

1. 两条命令：`save` 在主线程执行会阻塞，`bgsave` 走子进程不阻塞，生产环境只用 `bgsave`。
2. 触发方式：配置 `save m n`（m 秒内 n 次修改）、`SHUTDOWN`、主从全量同步、`BGREWRITEAOF` 间接触发。
3. 写时复制：父子共享物理内存页，主进程修改某页时内核才复制该页，极端情况内存翻倍。
4. 恢复快、文件小，但两次快照之间的写入会丢，故障时丢失窗口大。
5. RDB 文件格式经过版本演进，Redis 7.0 后 listpack 等新编码也会被序列化进去。

## 实现原理

### save 与 bgsave 的区别

| 命令 | 执行线程 | 是否阻塞 | 用途 |
|------|----------|----------|------|
| `SAVE` | 主线程 | 阻塞全部命令 | 调试或停机维护 |
| `BGSAVE` | 子进程 | 仅 fork 瞬间短暂阻塞 | 生产环境 |
| 自动触发 | 子进程 | 同 `BGSAVE` | 通过 `save` 配置项 |

`save` 配置项默认值（redis.conf）：

```conf
save 900 1     # 900 秒内至少 1 次修改
save 300 10    # 300 秒内至少 10 次修改
save 60 10000  # 60 秒内至少 10000 次修改
```

任意一条满足即触发 `bgsave`；写成 `save ""` 可禁用 RDB 自动快照。

### fork + 写时复制流程

```text
主进程调用 fork()
  -> 操作系统复制主进程的"页表"（不复制物理内存）
  -> 父子进程虚拟地址不同，但指向同一份物理页（只读）
  -> 子进程遍历内存，按 RDB 格式写文件
  -> 主进程继续处理客户端命令
       -> 读操作：直接读共享页，无影响
       -> 写操作：触发 COW，内核分配新物理页，主进程在新页上修改
                  子进程仍持有旧页，所以快照保存的是 fork 瞬间的数据
  -> 子进程写完，rename 成 dump.rdb 临时文件替换旧文件
  -> 子进程退出，向父进程发 SIGCHLD
```

### fork 阻塞与内存放大

`fork` 本身只复制页表，但页表也可以很大：每个 4KB 内存页对应 8 字节页表项，64GB 实例的页表约 128MB，`fork` 时要拷贝这 128MB，可能造成百毫秒级停顿。Redis 提供 `INFO memory` 中的 `latest_fork_usec` 指标观察这次 fork 耗时。

写时复制的极端情况：如果快照期间所有页都被修改，物理内存占用会逼近 2 倍。对写多场景要预留足够内存，否则可能 OOM。

### RDB 文件结构

RDB 文件由五部分组成：

```text
+----------+------------+----------+--------+--------+
| REDIS 魔数| 版本号     | 数据区   | CRC64  | EOF    |
| "REDIS"  | "0011"等   | 多个区段 | 校验码 | 0xFF   |
+----------+------------+----------+--------+--------+
```

数据区按数据库编号组织，每个 key-value 用 type、key、value 编码后写入。Redis 7.0 引入 listpack 替换 ziplist 后，对应的序列化逻辑也跟着变化，老版本 RDB 不能直接被新版本读出来需要走兼容路径。

### 触发 RDB 的全部场景

| 场景 | 触发命令/条件 | 说明 |
|------|---------------|------|
| 手动备份 | `BGSAVE` | 后台异步生成 |
| 优雅停机 | `SHUTDOWN` | 关闭前同步落盘 |
| 主从全量同步 | 主节点自动 `BGSAVE` | RDB 发送给从节点 |
| AOF 重写 | 间接触发 | 4.0+ 混合持久化依赖 |
| 配置触发 | `save m n` | 任意一条满足即触发 |
| `FLUSHALL` | 清空后如果触发 `save` | 会生成空 RDB，慎用 |

### RDB 版本演进

| Redis 版本 | RDB 版本号 | 关键变化 |
|------------|-----------|----------|
| 2.0 | RDB 6 | 基础结构，支持 String/List/Set/Hash/ZSet |
| 2.6 | RDB 7 | 引入 LMPOP/BLMPOP 等新命令序列化 |
| 2.8 | RDB 7 | 同 2.6，复制机制改进（PSYNC） |
| 3.0 | RDB 7 | 同 2.6，引入 Cluster |
| 3.2 | RDB 7 | 增加 quicklist 编码 |
| 4.0 | RDB 8 | 引入模块自定义数据类型（RDB_TYPE_MODULE_2）；混合持久化依赖 RDB 头 |
| 5.0 | RDB 9 | 增加 Stream 类型（RDB_TYPE_STREAM_LISTPACKS） |
| 6.0 | RDB 9 | 同 5.0；多线程 IO 不影响 RDB |
| 6.2 | RDB 10 | 增加 listpack 编码 Hash/ZSet/Set |
| 7.0 | RDB 11 | listpack 全面替换 ziplist；multi-part AOF 的 base 文件用此版本 |
| 7.2 | RDB 11 | 同 7.0；Function 持久化 |

RDB 文件头部前 9 字节是 `REDIS` 魔数 + 4 位版本号（如 `REDIS0011`）。低版本 Redis 不能加载高版本 RDB，升级回滚时要注意。

### 主从全量同步时序

```text
从节点 S                              主节点 M
  |                                     |
  | --- PSYNC ? -1 -------------------> |   首次同步
  |                                     |
  | <--- +FULLRESYNC <runid> <offset> - |   要求全量复制
  |                                     |
  |                                     |   BGSAVE 生成 RDB
  |                                     |   期间新写入存入 replication buffer
  |                                     |
  | <--- 发送 RDB 文件 ---------------- |
  |                                     |
  |   清空本地数据，加载 RDB            |
  |                                     |
  | <--- 发送 replication buffer 命令 - |   补发 BGSAVE 期间的写入
  |                                     |
  |   执行命令，追赶进度                 |
  |                                     |
  | === 进入命令传播阶段（长连接）====> |
```

## 代码示例

### redis.conf 关键配置

```conf
# 启用 RDB 自动快照
save 900 1
save 300 10
save 60 10000

# 快照出错时停止写入，避免没人发现持久化失败
stop-writes-on-bgsave-error yes

# 压缩 RDB 文件，CPU 换磁盘空间
rdbcompression yes

# 文件名与目录
dbfilename dump.rdb
dir /var/lib/redis
```

### 手动备份与检查

```bash
# 后台触发快照
redis-cli BGSAVE

# 查看最近一次 BGSAVE 状态
redis-cli INFO persistence | grep -E "rdb_bgsave_in_progress|rdb_last_save_time|rdb_last_bgsave_status"

# 检查 RDB 文件完整性
redis-check-rdb /var/lib/redis/dump.rdb
```

### 定时备份脚本

```bash
#!/bin/bash
# 每小时做一次 BGSAVE 并归档，保留最近 24 份
redis-cli BGSAVE
sleep 60
cp /var/lib/redis/dump.rdb /backup/dump-$(date +%Y%m%d%H).rdb
find /backup -name "dump-*.rdb" -mtime +1 -delete
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 灾备备份 | 每小时 `BGSAVE` + 异地归档 | 备份文件要校验 CRC，定期做恢复演练 |
| 主从全量同步 | 主节点 `BGSAVE` 生成 RDB 传给从节点 | 大实例同步期间 fork 阻塞和带宽要评估 |
| 重启快速恢复 | 仅启用 RDB | 接受分钟级数据丢失窗口 |
| 离线分析 | 把 RDB 解析成文本做统计 | 用 `redis-rdb-tools` 等工具，避免直接读生产实例 |
| 升级迁移 | 主从同步切流量后停机 `BGSAVE` 留底 | 升级失败可用 RDB 回滚 |

## 深挖追问

### 1. bgsave 期间主进程能修改数据吗？

能。写时复制保证主进程的修改只影响自己的页，子进程持有的还是 fork 瞬间的数据。代价是被修改的页要复制，写入压力越大内存放大越明显。

### 2. fork 为什么会阻塞？怎么缓解？

`fork` 要复制页表，页表大小正比于内存。缓解手段：单实例内存控制在 10GB 以内；使用 `vm.overcommit_memory=1` 避免 fork 失败；用 `latency monitor` 监控 `fork` 事件；必要时升级到 Redis 7.0+，新版本对大实例 fork 有优化。

### 3. RDB 和 AOF 同时开启会怎样？

Redis 启动时优先加载 AOF 文件，因为它通常更新；AOF 关闭时才加载 RDB。两者可以并存：RDB 做定期备份，AOF 做增量保障，但磁盘 IO 和 CPU 开销会叠加。

### 4. RDB 文件损坏怎么办？

`redis-check-rdb` 工具可以检测。轻微损坏可手工截掉末尾错误段；严重损坏只能用历史备份。生产上要做异机备份和校验。

### 5. 为什么主从全量同步要用 RDB 而不是直接传 KV？

RDB 是紧凑二进制格式，比逐条命令传输省网络、省 CPU；从节点加载 RDB 也是顺序读 + 反序列化，比回放命令快得多。

## 易错点

- 把 `save` 配置删掉不代表禁用 RDB，要写 `save ""`；同理 `CONFIG SET save ""` 才能动态禁用。
- `bgsave` 期间发生 OOM 会导致子进程被杀，`rdb_last_bgsave_status` 变成 `err`，要监控告警。
- 写时复制内存放大可让实例瞬间内存翻倍，部署时不要按"已用内存"满打满算。
- RDB 文件版本不向后兼容，老版本 Redis 读不了新版本 RDB，升级回滚要注意。
- `FLUSHALL` 后如果触发了 `save`，会生成空 RDB 把之前的备份覆盖，备份策略要独立于实例。

## 总结

RDB 是 Redis 默认的快照持久化方式，核心是 `fork` 子进程 + 写时复制，让主线程在拍快照期间继续对外服务。它文件小、恢复快，适合做定期备份和主从全量同步；缺点是两次快照之间的写入会丢失，故障时数据丢失窗口较大。生产实践常把它和 AOF 组合使用，或直接开启 Redis 4.0+ 的混合持久化，兼顾恢复速度和数据完整性。

## 参考资料

- [Redis Persistence 官方文档](https://redis.io/docs/management/persistence/)
- [Redis RDB 文件格式规范](https://github.com/sripathikrishnan/redis-rdb-tools/blob/master/docs/RDB_File_Format.md)
- 《Redis 设计与实现》黄健宏
