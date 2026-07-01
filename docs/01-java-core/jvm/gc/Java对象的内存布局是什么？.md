# Java 对象的内存布局是什么

## 核心概念

Java 对象在内存中由三部分组成：对象头（Header）、实例数据（Instance Data）、对齐填充（Padding）。理解对象内存布局能帮助排查"为什么 1MB 数据占了 10MB 堆内存"、估算对象大小、理解锁实现、做缓存行对齐优化。

对象头是 JVM 内部使用的数据，包含 Mark Word（哈希、GC 年龄、锁信息）和 Klass Pointer（指向类元数据）。实例数据是字段值。对齐填充保证对象大小是 8 字节整数倍。

```text
┌──────────────────────────────────────────────────────────┐
│                       对象内存布局                       │
├──────────────────────────────────────────────────────────┤
│  对象头 Header                                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Mark Word（8 字节，64 位 JVM）                   │  │
│  │   - hashcode、age、biased、lock 等               │  │
│  ├──────────────────────────────────────────────────┤  │
│  │ Klass Pointer（4 字节压缩 / 8 字节不压缩）       │  │
│  ├──────────────────────────────────────────────────┤  │
│  │ 数组长度（仅数组对象，4 字节）                   │  │
│  └──────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│  实例数据 Instance Data                                  │
│  - 父类字段在前，子类字段在后                            │
│  - 基本类型按 long/double > int/float > short/char > ... │
│  - 默认开启字段重排序（CompactFields）                   │
├──────────────────────────────────────────────────────────┤
│  对齐填充 Padding（保证 8 字节对齐）                     │
└──────────────────────────────────────────────────────────┘
```

## 标准回答

Java 对象由对象头、实例数据、对齐填充三部分组成。对象头包含 Mark Word（哈希、GC 年龄、锁信息）和 Klass Pointer（指向类元数据），数组对象额外有 4 字节长度字段。实例数据按"父类在前、基本类型按宽度降序"排列。对齐填充保证对象大小是 8 字节整数倍。开启指针压缩（默认）时 Klass Pointer 是 4 字节，关闭是 8 字节。

要点：

1. **对象头**：Mark Word + Klass Pointer（+ 数组长度）。
2. **Mark Word**：64 位 JVM 下 8 字节，存 hashcode、age、biased、lock 等。
3. **Klass Pointer**：压缩时 4 字节，不压缩 8 字节。
4. **实例数据**：父类字段在前，基本类型按宽度排序。
5. **对齐填充**：8 字节对齐。
6. **指针压缩**：`-XX:+UseCompressedOops`（默认开启），堆 ≤ 32GB 有效。

## 对象头 Header

### Mark Word

64 位 JVM 下 8 字节，存对象运行时数据：

| 锁状态 | Mark Word 内容 |
|--------|---------------|
| 无锁 | hashcode（25）+ age（4）+ biased（1）+ lock（2）+ ... |
| 偏向锁 | threadId（54）+ epoch（2）+ age（4）+ biased（1）+ lock（2） |
| 轻量级锁 | 指向栈中锁记录的指针（62）+ lock（2） |
| 重量级锁 | 指向 monitor 的指针（62）+ lock（2） |
| GC 标记 | 空 + lock（2） |

Mark Word 在不同状态下复用同一空间，是 JVM 锁优化的基础。

### Klass Pointer

指向方法区/元空间中的类元数据。

- 开启指针压缩（`-XX:+UseCompressedOops`，默认）：4 字节。
- 关闭：8 字节。

### 数组长度（仅数组对象）

4 字节，记录数组长度。非数组对象无此字段。

## 实例数据 Instance Data

存储字段值，排列规则：

1. **父类字段在前**：保证父类字段可以在子类实例中通过偏移量访问。
2. **基本类型按宽度降序**：long/double（8）→ int/float（4）→ short/char（2）→ byte/boolean（1）。
3. **引用类型**：压缩指针 4 字节，不压缩 8 字节。
4. **字段重排序**：默认开启 `-XX:+CompactFields`，子类字段可插入父类字段空隙。

```java
class Example {
    byte b;      // 1 字节
    int i;       // 4 字节
    long l;      // 8 字节
    Object ref;  // 4 字节（压缩指针）
}
// 内存布局（开启 CompactFields）：
// [Mark Word 8][Klass 4][l 8][i 4][b 1][ref 4][padding 3]
// 总大小：32 字节
```

## 对齐填充 Padding

HotSpot 要求对象起始地址对齐 8 字节，对象大小必须是 8 字节整数倍。不足时填充。

```text
Object 空对象：
[Mark Word 8][Klass 4] = 12 字节
对齐填充 4 字节
总大小：16 字节
```

## 完整示例：Integer 对象大小

64 位 JVM，开启压缩指针：

```text
Integer 对象：
[Mark Word 8][Klass 4][int value 4] = 16 字节
（已对齐，无需 padding）
```

int 基本类型 4 字节，Integer 对象 16 字节，**4 倍开销**。这就是为什么大量使用包装类型会显著增加内存占用。

## 指针压缩

`-XX:+UseCompressedOops`（默认开启）：

- 普通对象指针：8 字节 → 4 字节。
- 类指针：8 字节 → 4 字节。
- 数组长度：固定 4 字节。
- Mark Word：固定 8 字节。

**限制**：堆 ≤ 32GB。超过 32GB 时自动关闭，指针变 8 字节，对象变大反而降低内存利用率。

```bash
-XX:+UseCompressedOops   # 默认开启，堆 ≤ 32GB
-XX:-UseCompressedOops   # 关闭
```

## 查看对象布局的工具

### JOL（Java Object Layout）

```xml
<dependency>
    <groupId>org.openjdk.jol</groupId>
    <artifactId>jol-core</artifactId>
    <version>0.16</version>
</dependency>
```

```java
import org.openjdk.jol.info.ClassLayout;
import org.openjdk.jol.info.GraphLayout;

public class LayoutDemo {
    public static void main(String[] args) {
        Object obj = new Object();
        System.out.println(ClassLayout.parseInstance(obj).toPrintable());

        Integer i = 1;
        System.out.println(ClassLayout.parseInstance(i).toPrintable());

        int[] arr = new int[10];
        System.out.println(ClassLayout.parseInstance(arr).toPrintable());
    }
}
```

输出示例：

```text
java.lang.Object object internals:
OFF  SZ   TYPE DESCRIPTION               VALUE
  0   8        (object header: mark)     0x0000000000000001
  8   4        (object header: class)    0xf80001e5
 12   4        (object alignment gap)
Instance size: 16 bytes
```

### 其他工具

- **jcmd VM.native_memory**：进程级内存。
- **jmap -histo**：堆中对象统计。
- **Eclipse MAT**：堆 dump 分析。

## 代码示例

```java
public class ObjectLayoutDemo {
    static class User {
        long id;        // 8 字节
        int age;        // 4 字节
        boolean active; // 1 字节
        String name;    // 4 字节（引用，压缩）
    }

    public static void main(String[] args) {
        User u = new User();
        System.out.println(ClassLayout.parseInstance(u).toPrintable());

        // 输出：
        // OFF  SZ   TYPE DESCRIPTION  VALUE
        //  0   8        (object header: mark)
        //  8   4        (object header: class)
        // 12   8   long User.id
        // 20   4    int User.age
        // 24   1 boolean User.active
        // 25   3        (alignment gap)
        // 28   4   ref  User.name
        // 32   0        (object alignment gap)
        // Instance size: 32 bytes
    }
}
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 优化缓存 | 用基本类型替代包装类型 | Integer 比 int 多 12 字节 |
| 缓存行对齐 | `@Contended` 注解避免 false sharing | 需要 `-XX:-RestrictContended` |
| 估算内存 | 算对象头 + 字段 + 对齐 | 用 JOL 工具更准确 |
| 排查"小数据大内存" | 看 HashMap Node 等容器开销 | 详见 [1.2MB 数据如何撑起 10GB 内存](1-2MB数据如何撑起10GB内存？.md) |

## 深挖追问

### 为什么 Object 空对象是 16 字节？

64 位 JVM 开启压缩指针：Mark Word 8 字节 + Klass Pointer 4 字节 = 12 字节，对齐到 8 字节倍数 = 16 字节。关闭压缩指针：8 + 8 = 16 字节，无需填充。

### 指针压缩为什么有 32GB 限制？

压缩指针 4 字节，最大寻址 4GB。但 JVM 用 8 字节对齐，每个对象地址除以 8 后寻址，4GB × 8 = 32GB。超过 32GB 时 4 字节指针不够用，必须关闭压缩。

### 为什么字段要按宽度降序排列？

为了减少 padding。如果先排 byte 再排 long，byte 后要填充 7 字节才能对齐 long。先排 long，后排 byte，padding 集中在末尾，整体更紧凑。JVM 默认开启 `-XX:+CompactFields` 进一步优化。

### 数组对象比普通对象多几个字节？

多 4 字节的数组长度字段。例如 `int[0]` 在 64 位 JVM 压缩指针下：8（Mark）+ 4（Klass）+ 4（长度）= 16 字节。`int[10]`：16 + 40 = 56 字节。

## 易错点

- 以为空对象不占内存，Object 空对象至少 16 字节。
- 把指针压缩和对象头混淆，指针压缩只影响 Klass Pointer 和引用字段，不影响 Mark Word。
- 以为字段按源码顺序排列，实际 JVM 会重排序优化。
- 忘记数组对象额外有 4 字节长度字段。
- 把"对象头"和"对象引用"混淆，对象头在对象内部，引用指向对象起始地址。

## 总结

Java 对象由对象头、实例数据、对齐填充组成。对象头含 Mark Word（锁、GC、哈希）和 Klass Pointer（类元数据指针），实例数据按宽度排序，对齐填充保证 8 字节对齐。指针压缩（默认开启，堆 ≤ 32GB）让 Klass Pointer 和引用字段从 8 字节变 4 字节。理解对象布局能帮助估算内存、优化缓存、排查"小数据大内存"问题。JOL 是查看对象布局的标准工具。

## 参考资料

- [OpenJDK JOL](https://openjdk.org/projects/code-tools/jol/)
- [HotSpot Object Layout](https://wiki.openjdk.org/display/HotSpot/CompressedOops)
- 《深入理解 Java 虚拟机》周志明 第 2 章

---

[← 返回 GC 目录](/01-java-core/jvm/gc/)
