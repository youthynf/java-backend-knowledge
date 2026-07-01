# 为什么会有 Redis 混合持久化

## 核心概念

RDB 和 AOF 各有优劣：RDB 文件小、恢复快，但两次快照之间数据会丢；AOF 丢失窗口小，但文件大、重启回放慢。两者一直没法兼得——只开 RDB 不安全，只开 AOF 重启慢。

Redis 4.0 推出混合持久化，思路是在 AOF 重写时把当前内存状态以 RDB 二进制格式写到 AOF 文件开头，之后主进程的新增命令继续以 AOF 格式追加到文件末尾。重启时先加载 RDB 部分（快），再回放 AOF 增量（少），既快又安全。

从 Redis 4.0 到 7.0，这个机制一直在演进：4.0 引入 `aof-use-rdb-preamble` 开关；5.0 默认开启；7.0 把 AOF 拆成 multi-part，base 文件天然就是 RDB 格式，混合持久化成为常态。

## 标准回答

混合持久化是 Redis 4.0+ 提供的 RDB+AOF 组合方案：AOF 重写时把全量内存数据以 RDB 格式写入文件开头（base），后续增量命令以 AOF 格式追加（incr）。重启先加载 RDB 部分快速恢复主体，再回放少量 AOF 增量，既保证恢复速度又控制丢失窗口。

要点：

1. 触发时机：AOF 重写时，由 `aof-use-rdb-preamble yes` 控制（5.0+ 默认开启）。
2. 文件结构：RDB 头 + AOF 尾，前半二进制紧凑、后半文本可读。
3. Redis 7.0+ 拆成 `appendonlydir/` 目录，base.rdb + incr.aof + manifest.aof。
4. 兼容性：旧版本 Redis 无法识别 RDB 头，会跳过 RDB 部分直接回放 AOF（5.0 之前）。
5. 性能收益：典型场景重启时间从分钟级降到秒级，AOF 文件体积下降 50% 以上。

## 实现原理

### 4.0 引入：单文件 RDB 头

4.0 的混合持久化文件结构：

```text
+-------------------+-------------------------+
| RDB 二进制头       | AOF 文本命令增量         |
| (aof-use-rdb-preamble)| (重写期间及之后的新命令)|
+-------------------+-------------------------+
```

重写流程：

```text
1. 主进程 fork 子进程
2. 子进程把当前内存以 RDB 格式写到新 AOF 文件开头
3. 子进程完成后向主进程发信号
4. 主进程把 aof_rewrite_buf 中的增量命令以 AOF 格式追加到 RDB 之后
5. rename 新文件替换旧文件
```

启动加载：

```text
1. 读取 AOF 文件头部前 9 字节，判断是否为 RDB 魔数 "REDIS"
2. 是 -> 走 RDB 加载流程读 base 部分
3. 否 -> 退化为纯 AOF 回放
4. RDB 部分加载完，继续以 AOF 协议回放剩余命令
```

### 5.0 默认开启

`aof-use-rdb-preamble` 默认 `yes`，新建 AOF 文件几乎都是混合格式。如果想强制纯 AOF，要显式设 `no`。

### 7.0 演进：multi-part AOF

7.0 把单文件拆成目录：

```text
appendonlydir/
  ├── manifest.aof                    # 清单，记录文件序列
  ├── appendonly.aof.1.base.rdb       # 重写时刻的全量 RDB 快照
  ├── appendonly.aof.1.incr.aof       # 重写后的增量命令
  └── appendonly.aof.2.incr.aof       # 下次重写后的新增量
```

每次重写会生成新的 base + incr 文件对，旧的文件由 manifest 标记为历史，后续清理。这种结构的好处：

- 重写不再需要把全部增量塞进一个文件，原子性更好。
- base 文件天然就是 RDB，不需要 preamble 判断。
- 历史文件可独立校验、独立备份。

### 与纯 RDB / 纯 AOF 的对比

| 维度 | 纯 RDB | 纯 AOF | 混合持久化 |
|------|--------|--------|------------|
| 文件体积 | 最小 | 最大 | 中等（接近 RDB） |
| 恢复速度 | 最快 | 最慢 | 快（先 RDB 后少量 AOF） |
| 数据丢失窗口 | 大（依赖 save 周期） | 小（依赖 fsync） | 小（同 AOF） |
| 文件可读性 | 二进制不可读 | 文本可读 | 头部不可读，尾部可读 |
| 重写压力 | 中（fork + 写盘） | 大（fork + 写盘 + 历史） | 中（同 RDB 重写） |
| 兼容性 | 所有版本 | 所有版本 | 4.0+，旧版本读不了 |

### 触发与控制

| 配置项 | 作用 | 默认 |
|--------|------|------|
| `aof-use-rdb-preamble yes` | 重写时 base 用 RDB 格式 | 5.0+ 默认 yes |
| `appendonly yes` | 开启 AOF | no |
| `appendfsync everysec` | AOF 增量 fsync 策略 | everysec |
| `auto-aof-rewrite-percentage 100` | 触发重写的增长率 | 100 |
| `auto-aof-rewrite-min-size 64mb` | 触发重写的最小大小 | 64MB |

## 代码示例

### 开启混合持久化

```conf
# redis.conf
appendonly yes
aof-use-rdb-preamble yes
appendfsync everysec
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
```

启动后第一次 AOF 重写会产出混合格式文件。

### 在线启用

```bash
# 当前是纯 RDB，希望切到混合持久化
redis-cli CONFIG SET appendonly yes
redis-cli CONFIG SET aof-use-rdb-preamble yes

# 触发一次重写，让它立刻变成混合格式
redis-cli BGREWRITEAOF

# 持久化配置
redis-cli CONFIG REWRITE
```

### 识别混合持久化文件

```bash
# 查看 AOF 文件头部前 9 字节
head -c 9 /var/lib/redis/appendonly.aof | xxd

# 输出 "REDIS" 开头即为 RDB 头
# Redis 7.0+ 直接看 appendonlydir 目录
ls /var/lib/redis/appendonlydir/
```

### 启动日志验证

```text
# 7.0+ 启动时会打印：
* Loading RDB produced by version 7.0.x
* RDB age xxx seconds
* RDB memory usage when created xxx MB
* Loading AOF with base size xxx
* Reading incremental AOF...
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 默认生产配置 | `appendonly yes` + `aof-use-rdb-preamble yes` | 5.0+ 默认即此配置 |
| 大实例重启优化 | 从纯 AOF 切到混合 | 切换前手动 BGREWRITEAOF 一次 |
| 旧版本升级 7.0 | 自然迁移，旧 AOF 会被识别并加载 | 升级后下次重写自动转 multi-part |
| 跨版本回滚 | 4.0+ 写的混合 AOF 不能被 3.x 读取 | 升级前要做回滚预案 |
| 备份归档 | 直接复制 appendonlydir 或 dump.rdb | 备份要包含 manifest，否则 incr 顺序错乱 |

## 深挖追问

### 1. 混合持久化等于"RDB + AOF 同时开"吗？

不等于。同时开 RDB + AOF 会产出 dump.rdb 和 appendonly.aof 两个独立文件，启动时只加载 AOF，RDB 仅作备份。混合持久化是单个 AOF 文件（或 7.0+ 的目录）里同时包含 RDB 头和 AOF 尾，启动时两者都加载。

### 2. 混合持久化下还会丢数据吗？

会，丢失窗口仍由 `appendfsync` 决定。`everysec` 最多丢 1 秒增量；`always` 几乎不丢但性能差。RDB base 是重写时刻的快照，重写到宕机之间的命令靠 AOF 增量恢复。

### 3. 4.0 之前的 AOF 怎么升级到混合持久化？

升级 Redis 到 4.0+，开启 `aof-use-rdb-preamble yes`，下次 AOF 重写时自动转成混合格式。旧 AOF 文件不需要预处理，重写过程会重新扫描内存生成 RDB 头。

### 4. 7.0 multi-part AOF 怎么备份？

备份整个 `appendonlydir/` 目录，包含 manifest 和所有 base/incr 文件。不能只备份 base.rdb，否则增量丢失。恢复时把目录放回原位启动 Redis 即可。

### 5. 混合持久化的 RDB 头用的是哪个 RDB 版本？

跟随当前 Redis 版本的 RDB 格式。7.0 写出来的混合文件 base 部分是 RDB 11，6.0 是 RDB 9。降级时旧版本可能读不了新 RDB 格式的 base 文件。

## 易错点

- 4.0 默认 `aof-use-rdb-preamble no`，要显式开启；5.0+ 才默认 yes。
- 3.x 版本读不了 4.0+ 的混合 AOF 文件，跨版本回滚要先做格式转换或保留旧版本备份。
- 7.0+ 备份不能只复制 base.rdb，要复制整个 appendonlydir。
- 开启混合持久化不等于禁用 RDB，dump.rdb 仍然会按 save 配置生成，可以同时存在。
- `aof-use-rdb-preamble` 只在重写时生效，已经存在的纯 AOF 文件不会自动转换。

## 总结

混合持久化是 Redis 4.0+ 对 RDB 和 AOF 的整合方案：AOF 重写时用 RDB 格式记录全量状态作为文件头，后续命令以 AOF 格式追加。5.0 默认开启，7.0 演进为 multi-part AOF，base.rdb + incr.aof + manifest 让结构更清晰。它解决了纯 AOF 恢复慢、纯 RDB 丢失窗口大的矛盾，是当前 Redis 生产环境的主流持久化方案。理解它的关键是要清楚 RDB 头负责"快"、AOF 尾负责"全"，两者分工合作。

## 参考资料

- [Redis Persistence 官方文档](https://redis.io/docs/management/persistence/)
- [Redis 4.0 混合持久化发布说明](https://github.com/redis/redis/blob/4.0/00-RELEASENOTES)
- [Redis 7.0 multi-part AOF](https://github.com/redis/redis/issues/8915)
