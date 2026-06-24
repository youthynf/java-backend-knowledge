# 线上 Java 服务 CPU 飙到 90% 以上如何排查？

线上 Java 服务 CPU 飙高时，最重要的不是先猜原因，而是先保留现场、定位消耗 CPU 的进程和线程，再把线程栈落到具体代码路径。CPU 高可能来自死循环、正则回溯、锁竞争、频繁 GC、线程池失控、数据量突增或重试风暴，单纯翻业务日志往往会错过现场。

## 核心概念

CPU 飙高排查的基本链路是：

1. **找进程**：确认是哪一个进程占用 CPU。
2. **找线程**：确认进程内是哪几个线程在消耗 CPU。
3. **找调用栈**：把 Linux 线程 ID 对应到 Java 线程栈。
4. **找代码路径**：结合栈顶方法、线程状态和业务逻辑判断根因。
5. **验证修复**：改代码或配置后，通过监控、压测和日志确认 CPU 恢复。

一句话总结：先定位“谁在跑”，再定位“哪段代码在跑”。

## 面试官想考什么

这类题重点考察：

- 是否掌握 Linux + JVM 的排查链路；
- 是否知道 `top -Hp`、`jstack`、`jcmd`、Arthas 的使用；
- 是否理解 Java 线程状态与 CPU 高之间的关系；
- 是否能区分业务死循环、锁竞争、GC、IO、重试风暴等不同根因；
- 是否有生产环境意识，比如先留现场、多次采样、避免误操作。

## 标准排查流程

### 1. 使用 top 找到高 CPU 进程

```bash
top -c
```

关注：

- 哪个进程 CPU 占用最高；
- 是否是目标 Java 服务；
- CPU 是单核打满还是多核都高；
- 进程是否伴随内存上涨、Load 升高。

如果机器上有多个 Java 进程，可以结合：

```bash
ps -ef | grep java
```

通过启动命令、端口、应用名判断具体服务。

### 2. 使用 top -Hp 找到高 CPU 线程

```bash
top -Hp <pid>
```

`-H` 表示显示线程视图，`-p` 指定进程 ID。找到 CPU 占用最高的线程，记录它的十进制 TID。

### 3. 将线程 ID 转为十六进制

Java 线程栈中的 `nid` 是十六进制，需要转换：

```bash
printf "%x\n" <tid>
```

例如十进制线程 ID 是 `14895`，转换后是 `3a2f`，在线程栈里搜索 `nid=0x3a2f`。

### 4. jstack 定位线程调用栈

```bash
jstack <pid> > /tmp/stack.log
grep -A 40 "nid=0x3a2f" /tmp/stack.log
```

重点看：

- 线程名；
- 线程状态；
- 栈顶方法；
- 是否长时间多次采样都停在同一位置；
- 是否大量线程卡在同一锁、同一方法或同一下游调用。

### 5. 多次采样避免误判

CPU 问题不要只看一次栈。建议间隔几秒连续采样 3 到 5 次：

```bash
for i in {1..5}; do
  jstack <pid> > /tmp/stack-$i.log
  sleep 3
done
```

如果同一个线程多次出现在同一个业务方法，说明该路径确实是热点。

## 如何解读线程栈

### RUNNABLE + 业务循环

如果高 CPU 线程是 `RUNNABLE`，栈顶长期停在业务代码中的循环、递归、集合遍历，常见原因是：

- 死循环；
- 数据量突增；
- 算法复杂度过高，例如 O(n²)；
- 大批量任务没有分页或限流。

### RUNNABLE + 正则相关栈

如果栈顶出现：

```text
java.util.regex.Pattern
java.util.regex.Matcher
```

要警惕正则回溯灾难。常见诱因是复杂正则、贪婪匹配和异常长输入。

优化方向：

- 简化正则；
- 避免灾难性回溯；
- 限制输入长度；
- 对高频规则预编译 `Pattern`。

### BLOCKED

如果大量线程处于 `BLOCKED`，通常说明在等待 monitor 锁：

- synchronized 锁粒度过大；
- 单个热点资源竞争严重；
- 临界区包含慢操作；
- 锁内调用外部服务或数据库。

优化方向：拆小锁粒度、缩短临界区、使用并发容器或无锁方案。

### WAITING / TIMED_WAITING

这类线程本身通常不消耗大量 CPU，但如果大量业务线程都在等待，可能说明：

- 线程池耗尽；
- 连接池耗尽；
- 下游依赖变慢；
- 队列堆积；
- 重试机制导致请求放大。

需要结合线程池监控、连接池监控和下游耗时判断。

### GC 线程活跃

如果 CPU 高伴随频繁 GC，可以通过：

```bash
jstat -gcutil <pid> 1000 10
```

观察 YGC、FGC、GCT 是否持续增长。如果 Full GC 频繁，要进一步排查：

- 内存泄漏；
- 大对象分配；
- 缓存无边界；
- 堆大小不合理；
- 对象晋升过快。

## Arthas 排查方式

生产环境如果允许使用 Arthas，可以更快定位：

```bash
thread -n 5
```

直接查看 CPU 占用最高的线程及调用栈，不需要手动转换 TID。

如果 CPU 高持续存在，可以采样生成火焰图：

```bash
profiler start --event cpu
# 等待一段时间
profiler stop --file /tmp/cpu.html
```

- `thread` 适合快速看某一刻的热点线程；
- `profiler` 适合观察一段时间内的方法级 CPU 热点。

## 常见根因与处理

### 1. 死循环或异常循环条件

特征：高 CPU 线程多次采样都停在同一个循环方法。

处理：修复循环退出条件，增加最大迭代次数、防御性判断和监控告警。

### 2. 算法复杂度过高

例如使用 `List.contains()` 在大数据量下做去重，复杂度从 O(n) 变成 O(n²)。

```java
// 不推荐
List<Long> result = new ArrayList<>();
for (Long id : ids) {
    if (!result.contains(id)) {
        result.add(id);
    }
}

// 推荐
Set<Long> result = new HashSet<>(ids);
```

### 3. 正则回溯

特征：线程栈大量停在 `Pattern`、`Matcher`。

处理：优化正则、限制输入长度、避免嵌套贪婪匹配。

### 4. 频繁 GC

特征：CPU 高、接口变慢、GC 次数和耗时明显增加。

处理：分析 GC 日志和 heap dump，定位内存泄漏、大对象或缓存问题。

### 5. 线程池配置失控

特征：多核 CPU 被大量业务线程打满，线程数远超预期。

处理：限制线程池大小、设置队列容量、拒绝策略和任务超时，避免任务无限堆积。

### 6. 重试风暴

特征：下游异常时 CPU、QPS、日志量同时升高。

处理：限制重试次数，增加退避策略、熔断、限流和幂等保护。

## 面试回答模板

可以这样回答：

> 我会先用 `top -c` 确认高 CPU 的进程，再用 `top -Hp <pid>` 找到进程内 CPU 最高的线程。拿到线程 ID 后用 `printf "%x\n"` 转成十六进制，再用 `jstack` 搜索 `nid` 定位线程栈。定位后根据线程状态和栈顶方法判断是死循环、正则回溯、锁竞争还是频繁 GC。生产环境我会多次采样，必要时用 Arthas 的 `thread -n 5` 或 profiler 火焰图进一步确认，最后结合代码、流量、线程池和 GC 指标给出修复方案。

## 深挖追问

### 为什么 CPU 高不建议第一步看业务日志？

因为 CPU 高很多时候不是异常导致的，例如死循环、复杂计算、正则回溯、GC 线程活跃。业务日志可能完全正常，甚至没有 ERROR。先看日志容易错过现场，正确做法是先找进程和线程。

### 如何判断是单线程打满还是多线程打满？

看 CPU 占用和线程分布：

- 单个线程接近 100%，通常是单线程热点、死循环或复杂计算；
- 多个线程都很高，可能是并发任务、线程池失控、批量计算或重试风暴；
- CPU 接近机器核数上限，说明整体计算资源被打满。

### jstack 会影响线上服务吗？

`jstack` 通常影响较小，但在极端情况下仍可能造成短暂停顿。生产环境要控制频率，优先多次短采样；大流量核心服务上可以结合 Arthas、JFR 或 async-profiler。

### 容器环境有什么不同？

容器里要注意 CPU limit 和宿主机视角差异。建议结合：

- 容器平台 CPU 指标；
- cgroup 限制；
- `pidstat`；
- 应用内部线程池和 JVM 指标。

## 易错点

- 一上来就重启，导致现场丢失。
- 只采样一次 jstack 就下结论。
- 忽略十进制 TID 和十六进制 nid 的转换。
- 只看业务线程，不看 GC 线程。
- 把 CPU 高都归因于“服务器不够”，没有定位代码热点。
- 只调大线程池，反而让 CPU 更高。

## 总结

Java 服务 CPU 飙高的排查核心是“进程 → 线程 → 栈 → 代码 → 验证”。面试回答要体现工具链和判断逻辑：`top -c` 找进程，`top -Hp` 找线程，`printf` 转 nid，`jstack` 或 Arthas 看调用栈，再结合线程状态、GC 指标和业务场景定位根因。

## 相关知识点

- [Java 问题排查工具有哪些？](/01-java-core/jvm/troubleshooting/Java问题排查工具有哪些？.md)
- [Java 线程 Dump 如何分析？](/01-java-core/jvm/troubleshooting/Java线程Dump如何分析？.md)
- [JVM 常用调参有哪些？](/01-java-core/jvm/troubleshooting/JVM常用调参有哪些？.md)

## 参考资料

- [Arthas thread 命令](https://arthas.aliyun.com/doc/thread.html)
- [Java Troubleshooting Guide](https://docs.oracle.com/javase/8/docs/technotes/guides/troubleshoot/)
- [async-profiler](https://github.com/async-profiler/async-profiler)
