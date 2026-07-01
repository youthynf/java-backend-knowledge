# JVM 指针压缩是什么

## 核心概念

指针压缩（Compressed Oops）是 64 位 JVM 的优化技术：把 64 位对象指针压缩为 32 位，节省内存。堆 ≤ 32GB 时默认开启，能减少 50% 左右的指针内存开销，相当于变相增大可用堆。

指针压缩解决的问题是：64 位 JVM 指针从 4 字节变 8 字节，对象头、引用字段、数组都变大，内存浪费严重。压缩指针让 64 位 JVM 在堆 ≤ 32GB 时与 32 位 JVM 内存占用相当。

```text
64 位 JVM（不压缩）：
  对象头：Mark Word 8 + Klass Pointer 8 = 16 字节
  引用字段：8 字节
  Object 空对象：16 字节

64 位 JVM（压缩指针，堆 ≤ 32GB）：
  对象头：Mark Word 8 + Klass Pointer 4 = 12 字节
  引用字段：4 字节
  Object 空对象：16 字节（12 + 4 对齐）
```

## 标准回答

指针压缩是 64 位 JVM 把 64 位对象指针压缩为 32 位的技术，默认开启（堆 ≤ 32GB）。它通过 8 字节对齐 + 偏移量编码，让 32 位指针寻址 32GB（4GB × 8）。压缩指针让对象头、引用字段、数组都减小，节省 30%~50% 内存。超过 32GB 自动关闭。

要点：

1. **基本原理**：64 位指针高 16 位通常为 0，用 32 位存储 + 8 字节对齐偏移。
2. **寻址范围**：32 位指针 × 8 字节对齐 = 32GB。
3. **影响范围**：Klass Pointer、引用字段、数组长度字段不变（已 4 字节）。
4. **默认开启**：`-XX:+UseCompressedOops`（堆 ≤ 32GB）。
5. **超过 32GB 自动关闭**：指针变 8 字节，对象反而变大。

## 基本原理

64 位 JVM 中，对象指针 64 位，但高 16 位通常为 0（操作系统虚拟地址空间一般 < 48 位）。直接存 64 位浪费空间。

### 压缩方式

JVM 用 8 字节对齐 + 偏移量编码：

- 对象起始地址都是 8 的倍数（8 字节对齐）。
- 压缩指针存"地址 ÷ 8"的偏移量（32 位）。
- 寻址时：实际地址 = 压缩指针 × 8。

```text
64 位地址：0x00000000 00001008
                ↓ ÷ 8
32 位压缩指针：0x00000201
                ↓ × 8
64 位地址：0x00000000 00001008
```

### 寻址范围

- 32 位指针：2^32 = 4GB。
- 8 字节对齐：4GB × 8 = 32GB。

所以压缩指针最大支持 32GB 堆。

## 影响范围

压缩指针影响：

| 字段 | 不压缩 | 压缩 |
|------|--------|------|
| Mark Word | 8 字节 | 8 字节（不变） |
| Klass Pointer | 8 字节 | 4 字节 |
| 引用字段（对象引用） | 8 字节 | 4 字节 |
| 数组长度字段 | 4 字节 | 4 字节（不变） |

不变的部分：

- **Mark Word**：固定 8 字节，存哈希、锁、GC 年龄等。
- **数组长度**：固定 4 字节，足够表示大数组。

## 内存节省

以 `ArrayList<Object>` 内部数组为例：

- 不压缩：每个引用 8 字节。
- 压缩：每个引用 4 字节。

10 万元素的 ArrayList：

- 不压缩：800KB 引用 + 数组头 = ~800KB。
- 压缩：400KB 引用 + 数组头 = ~400KB。
- 节省 50%。

对象头节省：

- 不压缩：Mark Word 8 + Klass Pointer 8 = 16 字节。
- 压缩：Mark Word 8 + Klass Pointer 4 = 12 字节，对齐到 16 字节。
- 单对象看似没省，但批量对象（数组、集合）能省。

## 启用与限制

### 启用参数

```bash
-XX:+UseCompressedOops   # 默认开启（堆 ≤ 32GB）
-XX:-UseCompressedOops   # 关闭
```

### 限制

- 堆 ≤ 32GB：超过自动关闭。
- JDK 6u23+ 默认开启。
- 32 位 JVM 无需压缩（指针本就 32 位）。

### 超过 32GB 会怎样？

- 自动关闭压缩指针。
- 所有指针变 8 字节。
- 对象变大，反而降低内存利用率。
- 实测：32GB~48GB 的堆性能可能不如 32GB（因为关闭压缩后内存浪费）。

如果业务确实需要 > 32GB 堆，建议直接上 64GB+ 并接受不压缩，或用 ZGC。

## 指针压缩与对象布局

```java
class User {
    long id;        // 8 字节
    int age;        // 4 字节
    Object ref;     // 8 字节（不压缩）/ 4 字节（压缩）
}

// 不压缩（堆 > 32GB）：
// [Mark Word 8][Klass 8][id 8][age 4][ref 8] = 36 字节
// 对齐到 40 字节

// 压缩（堆 ≤ 32GB）：
// [Mark Word 8][Klass 4][id 8][age 4][ref 4] = 28 字节
// 对齐到 32 字节
// 节省 8 字节（20%）
```

## 验证指针压缩

用 JOL 工具查看：

```java
import org.openjdk.jol.info.ClassLayout;

public class CompressedOopsDemo {
    public static void main(String[] args) {
        Object obj = new Object();
        System.out.println(ClassLayout.parseInstance(obj).toPrintable());

        // 压缩开启时：
        // OFF  SZ   TYPE DESCRIPTION               VALUE
        //   0   8        (object header: mark)     0x0000000000000001
        //   8   4        (object header: class)    0xf80001e5
        //  12   4        (object alignment gap)
        // Instance size: 16 bytes

        // 压缩关闭时（-XX:-UseCompressedOops）：
        // OFF  SZ   TYPE DESCRIPTION               VALUE
        //   0   8        (object header: mark)     0x0000000000000001
        //   8   8        (object header: class)    0x00000000000f8000
        // Instance size: 16 bytes
    }
}
```

注意 Klass Pointer 字段大小：4 字节（压缩）或 8 字节（不压缩）。

## 实战场景

| 场景 | 关注点 | 参数 |
|------|--------|------|
| 微服务小堆 | 默认开启即可 | -Xmx4g |
| 中型堆 | 32GB 临界点 | 注意不要超过 32GB |
| 大堆（> 32GB） | 关闭压缩 | 评估是否真需要这么大 |
| 容器化 | 容器内存限制 | -Xmx 设到容器内存 70% |

## 深挖追问

### 为什么是 32GB 而不是 4GB？

32 位指针最大寻址 4GB。但 JVM 用 8 字节对齐，每个对象地址都是 8 的倍数，可以用"地址 ÷ 8"作为偏移量存储。4GB × 8 = 32GB，所以压缩指针最大支持 32GB。

### 关闭压缩指针会怎样？

所有指针变 8 字节：

- Klass Pointer：4 → 8 字节。
- 引用字段：4 → 8 字节。
- 对象头变大，引用密集的对象（如 ArrayList、HashMap）内存占用增加 30%~50%。

实测：32GB~40GB 的堆性能可能不如 31GB（因为关闭压缩后内存浪费抵消了堆增大的收益）。

### 指针压缩和染色指针是什么关系？

无关。指针压缩是缩小指针大小（64→32 位），染色指针是在指针高位存 GC 标记信息。两者可以共存：压缩指针时低位寻址，染色指针时高位存标记。但 ZGC 实际不用压缩指针（需要 64 位空间存染色信息）。

### 怎么验证指针压缩是否开启？

```bash
# 查看所有 JVM 参数最终值
java -XX:+PrintFlagsFinal -version | grep CompressedOops

# 输出：
# bool UseCompressedOops = true {product lp64_product}
```

或用 JOL 查看对象布局，看 Klass Pointer 是否 4 字节。

## 易错点

- 把指针压缩和染色指针混淆，前者是缩小指针，后者是 GC 标记编码。
- 以为压缩指针影响 Mark Word，Mark Word 固定 8 字节，不受影响。
- 以为堆越大越好，32GB~40GB 可能不如 31GB（压缩关闭后浪费）。
- 忘记 8 字节对齐是压缩的前提。
- 把 `-XX:+UseCompressedClassPointers` 和 `-XX:+UseCompressedOops` 混淆，前者压缩 Klass Pointer，后者压缩所有 Oops（普通对象指针）。

## 总结

指针压缩是 64 位 JVM 把 64 位对象指针压缩为 32 位的技术，默认开启（堆 ≤ 32GB）。通过 8 字节对齐 + 偏移量编码，32 位指针寻址 32GB。压缩后 Klass Pointer 和引用字段从 8 字节变 4 字节，节省 30%~50% 内存。超过 32GB 自动关闭，对象反而变大。生产环境堆 ≤ 32GB 优先保持压缩开启。

## 参考资料

- [HotSpot Compressed Oops](https://wiki.openjdk.org/display/HotSpot/CompressedOops)
- 《深入理解 Java 虚拟机》周志明 第 2 章
- [OpenJDK JOL](https://openjdk.org/projects/code-tools/jol/)

---

[← 返回 GC 目录](/01-java-core/jvm/gc/)
