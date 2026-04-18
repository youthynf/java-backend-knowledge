# 序列化与 transient 关键字

## 核心概念

### 什么是序列化？

序列化是将对象转换为字节流的过程，反序列化是将字节流恢复为对象的过程。

**主要用途：**
- 对象持久化：保存到文件或数据库
- 网络传输：远程调用、消息队列
- 缓存：Redis、Memcached 等存储对象
- 深拷贝：通过序列化实现

### Java 序列化基础

```java
// 实现 Serializable 接口（标记接口，无方法）
public class User implements Serializable {
    private static final long serialVersionUID = 1L;
    
    private String name;
    private int age;
    
    // 序列化
    public void save(String filename) throws IOException {
        try (ObjectOutputStream oos = new ObjectOutputStream(
                new FileOutputStream(filename))) {
            oos.writeObject(this);
        }
    }
    
    // 反序列化
    public static User load(String filename) throws IOException, ClassNotFoundException {
        try (ObjectInputStream ois = new ObjectInputStream(
                new FileInputStream(filename))) {
            return (User) ois.readObject();
        }
    }
}
```

### transient 关键字

`transient` 用于标记不需要序列化的字段：

```java
public class User implements Serializable {
    private String username;
    private transient String password; // 不会被序列化
    private transient Connection conn;   // 数据库连接不可序列化
    
    // 反序列化后 password 和 conn 都会是 null
}
```

**使用场景：**
- 敏感信息：密码、密钥等
- 不可序列化的对象：Connection、Thread、File
- 可以重新计算的数据：缓存、临时状态

---

## 面试高频问题

### 1. 什么是 serialVersionUID？为什么要定义它？

**回答要点：**
```java
private static final long serialVersionUID = 1L;
```

- serialVersionUID 是类的版本标识
- 反序列化时会比较 serialVersionUID，不一致则抛出 `InvalidClassException`
- 如果不定义，JVM 会自动生成（基于类结构），类修改后会变化
- **建议显式定义**，便于控制版本兼容性

### 2. transient 和 static 的区别？

**回答要点：**
```java
public class Example implements Serializable {
    private transient int temp;    // 不序列化，每个对象独立
    private static int count;      // 不序列化，类级别共享
    
    // static 属于类，不参与对象序列化
    // transient 属于对象，但跳过序列化
}
```

| 特性 | transient | static |
|------|-----------|--------|
| 归属 | 对象成员 | 类成员 |
| 序列化 | 跳过 | 不参与（根本不是对象的一部分） |
| 反序列化后 | 默认值（null/0/false） | 保持当前值 |

### 3. 如何自定义序列化过程？

**回答要点：**
```java
public class User implements Serializable {
    private String username;
    private transient String password;
    
    // 序列化时调用
    private void writeObject(ObjectOutputStream oos) throws IOException {
        oos.defaultWriteObject(); // 默认序列化
        oos.writeObject(encrypt(password)); // 手动处理 transient 字段
    }
    
    // 反序列化时调用
    private void readObject(ObjectInputStream ois) throws IOException, ClassNotFoundException {
        ois.defaultReadObject(); // 默认反序列化
        this.password = decrypt((String) ois.readObject()); // 恢复 transient 字段
    }
    
    private String encrypt(String s) { /* 加密 */ return s; }
    private String decrypt(String s) { /* 解密 */ return s; }
}
```

### 4. ArrayList 如何处理 transient 的 elementData？

**回答要点：**
```java
public class ArrayList<E> extends AbstractList<E>
        implements List<E>, RandomAccess, Cloneable, java.io.Serializable {
    
    private transient Object[] elementData; // transient！
    
    // 但是自定义了序列化方法，只序列化实际元素
    private void writeObject(java.io.ObjectOutputStream s)
        throws java.io.IOException{
        // 只序列化 size 和实际元素，不序列化整个数组
        s.writeInt(size);
        for (int i=0; i<size; i++) {
            s.writeObject(elementData[i]);
        }
    }
}
```

ArrayList 的 elementData 用 transient 是因为：
- 数组可能有很多空位（容量 > 实际元素数量）
- 序列化整个数组浪费空间
- 自定义序列化只保存实际元素

---

## 代码示例

### 完整的序列化示例

```java
public class Session implements Serializable {
    private static final long serialVersionUID = 1L;
    
    private String sessionId;
    private User user;
    private Date createTime;
    private transient Map<String, Object> attributes; // 临时数据不序列化
    private transient CacheManager cacheManager;      // 不可序列化
    
    // 自定义序列化
    private void writeObject(ObjectOutputStream oos) throws IOException {
        oos.defaultWriteObject();
        // 如果需要，可以序列化 attributes 的部分内容
    }
    
    // 自定义反序列化
    private void readObject(ObjectInputStream ois) throws IOException, ClassNotFoundException {
        ois.defaultReadObject();
        // 恢复 transient 字段
        this.attributes = new HashMap<>();
        this.cacheManager = CacheManager.getInstance();
    }
    
    // 反序列化替换（用于单例模式）
    private Object readResolve() {
        return SessionManager.getSession(sessionId); // 返回已存在的会话
    }
}
```

### Externalizable 接口（完全自定义）

```java
public class Product implements Externalizable {
    private int id;
    private String name;
    private double price;
    
    // 必须有无参构造器
    public Product() {}
    
    @Override
    public void writeExternal(ObjectOutput out) throws IOException {
        out.writeInt(id);
        out.writeUTF(name);
        out.writeDouble(price);
    }
    
    @Override
    public void readExternal(ObjectInput in) throws IOException, ClassNotFoundException {
        this.id = in.readInt();
        this.name = in.readUTF();
        this.price = in.readDouble();
    }
}
```

### 序列化工具类

```java
public class SerializationUtils {
    
    /**
     * 序列化对象到字节数组
     */
    public static byte[] serialize(Object obj) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (ObjectOutputStream oos = new ObjectOutputStream(bos)) {
            oos.writeObject(obj);
        }
        return bos.toByteArray();
    }
    
    /**
     * 从字节数组反序列化
     */
    @SuppressWarnings("unchecked")
    public static <T> T deserialize(byte[] bytes) throws IOException, ClassNotFoundException {
        ByteArrayInputStream bis = new ByteArrayInputStream(bytes);
        try (ObjectInputStream ois = new ObjectInputStream(bis)) {
            return (T) ois.readObject();
        }
    }
    
    /**
     * 深拷贝
     */
    public static <T extends Serializable> T deepCopy(T obj) {
        try {
            return deserialize(serialize(obj));
        } catch (Exception e) {
            throw new RuntimeException("深拷贝失败", e);
        }
    }
}
```

---

## 实战场景

### 场景 1：敏感信息保护

```java
public class Account implements Serializable {
    private String accountNo;
    private transient String password;  // 不序列化密码
    private transient String secretKey; // 不序列化密钥
    
    // 反序列化后需要重新设置密码
    public void setPasswordAfterDeserialize(String password) {
        this.password = password;
    }
}
```

### 场景 2：不可序列化的成员

```java
public class DatabaseService implements Serializable {
    private String url;
    private transient Connection connection; // Connection 不可序列化
    
    private void readObject(ObjectInputStream ois) throws IOException, ClassNotFoundException {
        ois.defaultReadObject();
        // 反序列化后重新建立连接
        reconnect();
    }
    
    private void reconnect() {
        try {
            this.connection = DriverManager.getConnection(url);
        } catch (SQLException e) {
            throw new RuntimeException("数据库连接失败", e);
        }
    }
}
```

### 场景 3：缓存优化

```java
public class CachedData implements Serializable {
    private String key;
    private String source;
    private transient byte[] cachedData; // 缓存数据不序列化，使用时重新计算
    
    public byte[] getData() {
        if (cachedData == null) {
            cachedData = computeFromSource(source);
        }
        return cachedData;
    }
    
    private byte[] computeFromSource(String source) {
        // 计算逻辑...
        return source.getBytes();
    }
}
```

---

## 延伸思考

- Java 序列化的性能问题？有哪些替代方案？
- 什么是序列化安全漏洞？如何防范？
- 为什么说 Java 序列化是"危险的"？（Joshua Bloch 的观点）
- 对比：Java 序列化 vs JSON vs Protobuf vs Kryo

## 参考资料

- [Java Serialization](https://docs.oracle.com/javase/8/docs/api/java/io/Serializable.html)
- [Effective Java - 序列化章节](https://www.oreilly.com/library/view/effective-java/9780134686097/)
- [为什么 Java 序列化是危险的](https://www.infoworld.com/article/2074849/java-serialization-is-dangerous.html)
