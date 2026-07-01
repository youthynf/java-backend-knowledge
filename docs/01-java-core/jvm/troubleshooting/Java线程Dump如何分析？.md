# Java 线程 Dump 如何分析

## 核心概念

线程 Dump（Thread Dump）是 JVM 在某一时刻所有线程的快照，包含线程名、状态、调用栈、锁信息。它是排查 CPU 高、死锁、线程阻塞、响应慢等问题的核心工具。

分析线程 Dump 的关键：先看线程状态分布（RUNNABLE / BLOCKED / WAITING / TIMED_WAITING），再关注异常线程的调用栈，多次采样确认问题持续性。`jstack` 是最常用工具，Arthas 的 `thread` 命令更友好。

```text
线程 Dump 用途：
1. CPU 高 → 找 RUNNABLE 线程的栈顶方法
2. 死锁 → jstack 自动检测
3. 响应慢 → 找 BLOCKED / WAITING 线程
4. 线程泄漏 → 看线程总数和命名
```

## 标准回答

线程 Dump 是 JVM 所有线程的快照，用 `jstack <pid>` 或 `kill -3 <pid>` 抓取。分析时关注线程状态分布、异常线程调用栈、锁信息。多次采样（间隔 10~20s，至少 3 次）确认问题持续性。死锁 `jstack` 自动检测。Arthas 的 `thread -n 5`、`thread -b` 更方便。

要点：

1. **抓取**：`jstack <pid>` 或 `kill -3 <pid>`（输出到 stderr/日志）。
2. **多次采样**：3~5 次，间隔 10~20s。
3. **线程状态**：NEW、RUNNABLE、BLOCKED、WAITING、TIMED_WAITING、TERMINATED。
4. **死锁检测**：`jstack` 自动输出 `Found one Java-level deadlock`。
5. **Arthas**：`thread -n 5`（最忙线程）、`thread -b`（死锁）。

## 线程 Dump 抓取

### jstack（JDK 自带）

```bash
# 基本用法
jstack <pid>

# 输出到文件
jstack <pid> > /tmp/stack.log

# 额外锁信息（推荐）
jstack -l <pid> > /tmp/stack.log

# 强制 dump（进程无响应时）
jstack -F <pid>
```

### kill -3（操作系统命令）

```bash
ps -ef | grep java        # 找到 Java 进程 PID
kill -3 <pid>             # 发送 SIGQUIT 信号
# 线程 Dump 输出到 JVM 标准输出/日志文件
```

### 多次采样

```bash
for i in {1..5}; do
  jstack <pid> > /tmp/stack-$i.log
  sleep 10
done
```

## 线程 Dump 结构

### 头部信息

```text
2024-01-01T10:00:00.000+0800
Full thread dump Java HotSpot(TM) 64-Bit Server VM (17.0.1+0 mixed mode):
```

### 线程信息块

```text
"http-nio-8080-exec-1" #15 daemon prio=5 os_prio=0 tid=0x00007f8a9c0b8800 nid=0x3a2f runnable [0x00007f8a8c0d8000]
   java.lang.Thread.State: RUNNABLE
        at java.net.SocketInputStream.socketRead0(Native Method)
        at java.net.SocketInputStream.socketRead(SocketInputStream.java:116)
        ...
```

字段含义：

| 字段 | 含义 |
|------|------|
| `"http-nio-8080-exec-1"` | 线程名（Tomcat 工作线程） |
| `#15` | JVM 内部线程编号 |
| `daemon` | 是否守护线程 |
| `prio=5` | JVM 优先级 |
| `os_prio=0` | OS 优先级 |
| `tid=0x...` | JVM 内部线程 ID |
| `nid=0x3a2f` | Native 线程 ID（十六进制，对应 `top -Hp` 的 TID） |
| `runnable` | 当前状态简述 |
| `[0x...]` | 栈起始地址 |
| `Thread.State` | Java 线程状态枚举 |

### 调用栈

栈顶在上，栈底在下。解读时从栈顶看起，找到业务代码所在行。

## 线程状态详解

`Thread.State` 枚举定义了 6 种状态：

### NEW

线程对象已创建但未调用 `start()`。堆中有 `Thread` 对象，OS 层面还没创建线程。

### RUNNABLE

可运行状态，包括"正在运行"和"就绪等待调度"。注意 Java 的 RUNNABLE 包含"等待 IO"（如 socketRead0），所以 RUNNABLE 不一定消耗 CPU。

### BLOCKED

等待 monitor 锁（synchronized）。线程要进入 synchronized 方法/块但锁被其他线程持有。

```text
"http-nio-exec-1" ... waiting to lock <0x000000076b6b6b80>
   java.lang.Thread.State: BLOCKED (on object monitor)
```

### WAITING

无限期等待，等待其他线程显式唤醒：

- `Object.wait()`（无超时）
- `Thread.join()`（无超时）
- `LockSupport.park()`

```text
"main" ... waiting on <0x000000076b6b6b80>
   java.lang.Thread.State: WAITING (on object monitor)
```

### TIMED_WAITING

有限期等待，超时后自动唤醒：

- `Thread.sleep(ms)`
- `Object.wait(ms)`
- `Thread.join(ms)`
- `LockSupport.parkNanos(ns)`

### TERMINATED

线程执行完成，run 方法退出。

## 状态与问题对应

| 状态 | 可能问题 | 处理 |
|------|---------|------|
| RUNNABLE + 业务循环 | 死循环、复杂计算 | 看栈顶方法 |
| RUNNABLE + Pattern | 正则回溯 | 优化正则 |
| BLOCKED | 锁竞争 | 拆小锁，缩短临界区 |
| WAITING | 线程池空、连接池空 | 看持有者，调整池 |
| TIMED_WAITING | sleep、超时等待 | 正常状态 |
| 大量 BLOCKED 同一锁 | 锁粒度过大 | 评估并发设计 |

## 死锁检测

`jstack` 自动检测死锁，在输出末尾报告：

```text
Found one Java-level deadlock:
=============================
"Thread-1":
  waiting to lock monitor 0x00007f8a9c00b800 (object 0x000000076b6b6b80, a java.lang.Object),
  which is held by "Thread-0"
"Thread-0":
  waiting to lock monitor 0x00007f8a9c00c800 (object 0x000000076b6b6b90, a java.lang.Object),
  which is held by "Thread-1"

Java stack information for the threads listed above:
===================================================
"Thread-1":
  at com.example.DeadlockDemo.method2(DeadlockDemo.java:20)
  - waiting to lock <0x000000076b6b6b80>
  - locked <0x000000076b6b6b90>
  ...
"Thread-0":
  at com.example.DeadlockDemo.method1(DeadlockDemo.java:10)
  - waiting to lock <0x000000076b6b6b90>
  - locked <0x000000076b6b6b80>
  ...

Found 1 deadlock.
```

Arthas 看死锁：

```bash
thread -b   # 找阻塞其他线程的线程（包括死锁）
```

## Arthas 线程分析

```bash
# 查看所有线程
thread

# 查看最忙的 5 个线程（按 CPU 排序）
thread -n 5

# 查看死锁
thread -b

# 查看指定状态的线程
thread --state BLOCKED
thread --state WAITING

# 查看指定线程
thread <thread-id>
```

## 代码示例

复现死锁：

```java
public class DeadlockDemo {
    private static final Object lock1 = new Object();
    private static final Object lock2 = new Object();

    public static void main(String[] args) {
        new Thread(() -> {
            synchronized (lock1) {
                try { Thread.sleep(100); } catch (InterruptedException e) {}
                synchronized (lock2) {
                    System.out.println("Thread1");
                }
            }
        }, "Thread-0").start();

        new Thread(() -> {
            synchronized (lock2) {
                try { Thread.sleep(100); } catch (InterruptedException e) {}
                synchronized (lock1) {
                    System.out.println("Thread2");
                }
            }
        }, "Thread-1").start();
    }
}
```

`jstack` 输出会显示 `Found 1 deadlock`，并指出两个线程互相等待对方持有的锁。

## 实战场景

| 场景 | 关注点 | 工具 |
|------|--------|------|
| CPU 高 | RUNNABLE 线程栈顶 | jstack + top -Hp |
| 接口卡顿 | BLOCKED / WAITING 线程 | jstack -l |
| 死锁 | jstack 自动检测 | jstack、Arthas thread -b |
| 线程泄漏 | 线程总数和命名 | jstack |
| GC 频繁 | GC 线程活跃 | jstack + jstat |

## 深挖追问

### nid 和 tid 有什么区别？

- `tid`：JVM 内部线程 ID（Java 层面），64 位十六进制。
- `nid`：Native 线程 ID（OS 层面），对应 `top -Hp` 看到的 TID，十六进制。

排查 CPU 高时，`top -Hp` 得到十进制 TID，用 `printf "%x\n"` 转十六进制，对应 `jstack` 输出的 `nid`。

### 为什么 jstack 要多次采样？

单次 jstack 只反映某一刻的状态，可能错过瞬时问题或误判。多次采样（3~5 次，间隔 10~20s）能确认问题持续性：

- 如果同一线程多次停在同一个方法，说明是稳定热点。
- 如果线程栈每次不同，说明是正常并发。

### BLOCKED 和 WAITING 的区别？

BLOCKED：等待 synchronized monitor 锁，是被动等待。
WAITING：主动调用 `wait()` / `join()` / `park()`，等待被唤醒。

BLOCKED 通常是锁竞争问题，WAITING 可能是线程池空闲、连接池等待等正常情况。

### jstack -F 有什么风险？

`jstack -F` 强制 dump，用于进程无响应时。它通过 `Serviceability Agent`（SA） attaches 到目标进程，可能导致进程暂停更长时间。生产环境慎用，优先用普通 `jstack`，无响应时再考虑 `-F`。

## 易错点

- 把 RUNNABLE 当作"占用 CPU"，Java 的 RUNNABLE 包含"等待 IO"，不一定消耗 CPU。
- 忽略 nid 和 tid 的区别，无法对应 top 看到的线程。
- 只看一次 jstack 就下结论，应该多次采样。
- 把 BLOCKED 和 WAITING 混淆，前者是锁竞争，后者是主动等待。
- 用 `kill -9` 而不是 `kill -3` 抓 dump，前者直接杀进程，后者发 SIGQUIT 触发 dump。

## 总结

线程 Dump 是排查 CPU 高、死锁、线程阻塞的核心工具。`jstack <pid>` 或 `kill -3 <pid>` 抓取，多次采样确认问题持续性。线程状态分 NEW、RUNNABLE、BLOCKED、WAITING、TIMED_WAITING、TERMINATED，每种状态对应不同问题。死锁 `jstack` 自动检测。Arthas 的 `thread -n 5`、`thread -b` 更方便。`nid` 对应 `top -Hp` 的 TID（转十六进制）。

## 参考资料

- [jstack Documentation](https://docs.oracle.com/en/java/javase/17/docs/specs/man/jstack.html)
- [Arthas thread 命令](https://arthas.aliyun.com/doc/thread.html)
- [Thread State in JVM](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Thread.State.html)

---

[← 返回故障排查目录](/01-java-core/jvm/troubleshooting/)
