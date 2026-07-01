# Java 对象的生命周期是怎么样的

## 核心概念

Java 对象的生命周期指从创建到回收的完整过程，包括创建、使用、消亡三个阶段，对应到 JVM 层面是：类加载检查 → 分配内存 → 初始化零值 → 设置对象头 → 执行构造函数 → 使用 → 等待 GC → 最终回收。

理解对象生命周期是排查内存泄漏、优化 GC、写出无锁友好代码的基础。它解决的问题是：知道每一步在做什么、什么时机可能出问题、什么阶段可以优化。

```text
┌───────────────────────────────────────────────────────────────────┐
│                       对象的生命周期                              │
├───────────────────────────────────────────────────────────────────┤
│ 创建阶段：类加载检查 → 分配内存 → 零值初始化 → 设置对象头 → <init> │
│ 使用阶段：被引用、参与业务逻辑                                    │
│ 消亡阶段：可达性分析判定为垃圾 → finalize()（不推荐）→ GC 回收    │
└───────────────────────────────────────────────────────────────────┘
```

## 标准回答

Java 对象生命周期分创建、使用、消亡三阶段。创建阶段在 JVM 内部走 5 步：类加载检查、分配内存、零值初始化、设置对象头、执行构造函数。使用阶段由业务逻辑决定。消亡阶段通过可达性分析判定为不可达后，由 GC 回收。

要点：

1. **类加载检查**：`new` 指令先检查类是否已加载、解析、初始化，没有则触发类加载。
2. **分配内存**：对象大小在类加载完成后已确定，从堆中划分对应大小内存。
3. **零值初始化**：分配到的内存空间清零，保证实例字段不赋初始值也能用。
4. **设置对象头**：填充 Mark Word 和 Klass Pointer，记录哈希、GC 年龄、锁信息等。
5. **执行 `<init>`**：调用构造函数，按程序员意愿初始化。
6. **使用**：被引用、参与业务。
7. **消亡**：可达性分析判定为垃圾后，由 GC 回收。

## 创建阶段

### 1. 类加载检查

`new` 指令的参数是常量池中的类符号引用。JVM 检查该符号引用对应的类是否已加载、解析、初始化。没有则先触发类加载。这是为什么"第一次 new 时较慢、后续快"——首次需要类加载。

### 2. 分配内存

对象所需内存在类加载完成后即可确定（字段布局已确定）。分配方式有两种：

- **指针碰撞**：内存规整，移动指针即可。Serial、ParNew 收集器适用。
- **空闲列表**：内存碎片化，需要维护空闲块列表，从中找合适大小。CMS 适用。

并发分配通过 CAS 失败重试或 TLAB 实现。TLAB 让每个线程在 Eden 内有私有缓冲，避免加锁。

### 3. 零值初始化

分配的内存空间被初始化为零值，保证实例字段在 Java 代码中不显式赋值也能直接使用。这一步不包括对象头。

### 4. 设置对象头

填充对象头，包括：

- **Mark Word**：哈希码、GC 分代年龄、锁状态、偏向线程 ID 等。
- **Klass Pointer**：指向方法区的类元数据。
- **数组长度**（仅数组对象）：4 字节。

### 5. 执行 `<init>`

调用构造函数 `<init>()`，按程序员意愿初始化字段、执行实例初始化块、调用父类构造函数。`<init>` 由编译器收集实例字段赋值和构造块按顺序合成。

## 使用阶段

对象被引用、参与业务逻辑。从 JVM 角度看，对象处于"可达"状态：从 GC Roots 出发能找到引用链。

## 消亡阶段

### 可达性分析

从 GC Roots 出发遍历引用链，不可达的对象被判定为垃圾。GC Roots 包括：

- 虚拟机栈中引用的对象（局部变量）。
- 方法区中类静态属性引用的对象。
- 方法区中常量引用的对象。
- 本地方法栈中 JNI 引用的对象。
- JVM 内部引用（Class 对象、类加载器、常驻异常）。
- synchronized 持有的对象。

### finalize()（不推荐）

对象不可达后，如果重写了 `finalize()` 且未被调用过，JVM 会把它放入 F-Queue，由 Finalizer 线程执行。`finalize()` 中可以"自救"——重新与 GC Roots 建立引用链。但只允许自救一次，且不保证执行时机、不保证执行顺序。

```java
public class FinalizeEscape {
    private static FinalizeEscape SAVE_HOOK;

    @Override
    protected void finalize() throws Throwable {
        SAVE_HOOK = this; // 自救
    }
}
```

JDK 9+ 已将 `finalize()` 标记为 `Deprecated`，推荐用 `try-with-resources` 或 `Cleaner` 替代。

```java
// 推荐：try-with-resources + AutoCloseable
public class Resource implements AutoCloseable {
    @Override public void close() { /* 释放 */ }
}

try (Resource r = new Resource()) {
    // 使用资源
} // 自动 close
```

## 类的生命周期 vs 对象生命周期

容易混淆，两者完全不同：

| 维度 | 类的生命周期 | 对象的生命周期 |
|------|-------------|---------------|
| 主体 | Class 对象 | 实例对象 |
| 阶段 | 加载 → 链接 → 初始化 → 使用 → 卸载 | 创建 → 使用 → 消亡 |
| 触发 | 首次主动使用 | `new` 指令 |
| 结束 | 类卸载（罕见） | GC 回收 |

类的生命周期包括：加载、验证、准备、解析、初始化、使用、卸载。详见 [JVM 类加载机制](/01-java-core/jvm/basics/JVM的类加载机制是怎么样的？.md)。

## 代码示例

观察对象创建过程（借助 JOL 看对象头）：

```java
// Maven: org.openjdk.jol:jol-core:0.16
public class ObjectLifecycle {
    static class User {
        private int id;          // 4 字节
        private String name;     // 4 字节引用（压缩指针）
    }

    public static void main(String[] args) {
        User u = new User();     // 类加载检查 → 分配 → 零值 → 对象头 → <init>
        u.id = 1;
        u.name = "a";

        // 打印对象布局
        System.out.println(ClassLayout.parseInstance(u).toPrintable());

        u = null;                // 取消引用，等待 GC
        System.gc();             // 建议 GC，不保证
    }
}
```

输出示例（64 位，开启压缩指针）：

```text
OFF  SZ   TYPE DESCRIPTION               VALUE
  0   8        (object header: mark)     0x0000000000000001
  8   4        (object header: class)    0xf80001e5
 12   4    int User.id                   1
 16   4   ref   User.name                "a"
 20   4        (object alignment gap)
Instance size: 24 bytes
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 资源管理 | `try-with-resources` 自动 close | 必须 implements AutoCloseable |
| 缓存设计 | WeakReference / SoftReference | 配合 ReferenceQueue 监听回收 |
| 自救机制 | 重写 finalize() | JDK 9+ 已废弃，不要用 |
| 大对象 | 提前估算大小，控制创建频率 | 大对象直接进老年代 |

## 深挖追问

### 对象创建过程中哪一步最慢？

类加载检查在首次创建时最慢，需要触发类加载（可能涉及磁盘 IO、解析、验证）。后续创建走 TLAB 或指针碰撞，速度很快（纳秒级）。

### 为什么 Java 不需要手动释放对象？

因为 JVM 内置 GC，通过可达性分析自动判定垃圾并回收。开发者只需保证"不使用的对象不再被引用"，GC 自动处理。这种"对象不可达即回收"的设计避免了手动内存管理的悬垂指针和重复释放问题。

### finalize() 为什么被废弃？

finalize() 存在多个问题：执行时机不确定、执行顺序不保证、可能不执行（JVM 退出时）、性能开销大、容易内存泄漏。JDK 9 起 `Deprecated`，JDK 18+ 标记 `forRemoval`。替代方案是 `try-with-resources` 和 `Cleaner`。

### 对象进入老年代的条件？

1. 年龄达到 `-XX:MaxTenuringThreshold`（默认 15）。
2. 大对象超过 `-XX:PretenureSizeThreshold`。
3. Survivor 空间不足，通过空间分配担保进入。
4. Survivor 区相同年龄对象总和超过 Survivor 一半，动态年龄判断。

## 易错点

- 把对象生命周期和类生命周期混淆，类加载只发生一次，对象创建可以多次。
- 以为 `System.gc()` 立即触发 GC，实际只是建议，JVM 可以忽略。
- 在 finalize() 中关闭资源，导致资源泄漏或延迟释放。
- 把"对象置 null"当作释放内存的最佳实践，让变量及时出作用域更可靠。
- 以为 `null = obj` 和 `obj = null` 一样，前者是赋值给 null 变量，无意义。

## 总结

Java 对象的生命周期是创建（5 步）→ 使用 → 消亡（GC 回收）。每一步都有对应的 JVM 机制和参数：类加载、TLAB、对象头、`<init>`、可达性分析、`finalize()` 替代方案。理解这些过程能帮助写出更高效的代码（避免大对象、避免 finalize、用 try-with-resources）和排查 OOM 问题。

## 参考资料

- [The Java Virtual Machine Specification - Object Creation](https://docs.oracle.com/javase/specs/jvms/se17/html/jvms-2.html#jvms-2.5.1)
- 《深入理解 Java 虚拟机》周志明 第 3 章
- [JEP 421: Deprecate Finalization for Removal](https://openjdk.org/jeps/421)

---

[← 返回 JVM 基础目录](/01-java-core/jvm/basics/)
