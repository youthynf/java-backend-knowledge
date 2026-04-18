# 深拷贝与浅拷贝

## 核心概念

### 什么是拷贝？

在 Java 中，对象赋值只是复制引用，两个变量指向同一个对象：

```java
Person p1 = new Person("张三");
Person p2 = p1; // 只是复制引用，p1 和 p2 指向同一个对象
p2.setName("李四");
System.out.println(p1.getName()); // 李四（p1 也被修改了）
```

如果需要一个独立的副本，就需要"拷贝"。

### 浅拷贝（Shallow Copy）

复制对象本身，但对象内部的引用类型成员变量仍然共享：

```java
public class Person implements Cloneable {
    private String name;
    private Address address; // 引用类型
    
    @Override
    protected Object clone() throws CloneNotSupportedException {
        return super.clone(); // 浅拷贝
    }
}

// 浅拷贝示例
Person p1 = new Person("张三", new Address("北京"));
Person p2 = (Person) p1.clone();

p2.setName("李四"); // 不影响 p1.name
p2.getAddress().setCity("上海"); // ⚠️ 会影响 p1.address.city！
```

**特点：**
- 基本类型：完全复制，互不影响
- 引用类型：只复制引用，修改会影响原对象
- String：虽然是引用类型，但不可变，效果等同于深拷贝

### 深拷贝（Deep Copy）

递归复制所有层级的对象，生成完全独立的副本：

```java
// 方式一：重写 clone() 方法
@Override
protected Object clone() throws CloneNotSupportedException {
    Person cloned = (Person) super.clone();
    cloned.address = (Address) address.clone(); // 递归克隆
    return cloned;
}

// 方式二：序列化（推荐）
public class Person implements Serializable {
    @SuppressWarnings("unchecked")
    public Person deepCopy() {
        try {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            ObjectOutputStream oos = new ObjectOutputStream(bos);
            oos.writeObject(this);
            
            ByteArrayInputStream bis = new ByteArrayInputStream(bos.toByteArray());
            ObjectInputStream ois = new ObjectInputStream(bis);
            return (Person) ois.readObject();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}

// 方式三：JSON 序列化（简单但性能较低）
Person p2 = JSON.parseObject(JSON.toJSONString(p1), Person.class);
```

---

## 面试高频问题

### 1. 深拷贝和浅拷贝的区别？

**回答要点：**
- **浅拷贝**：复制对象本身，引用类型成员变量仍共享
- **深拷贝**：递归复制所有层级，生成完全独立的副本
- 浅拷贝修改引用成员会影响原对象，深拷贝不会
- 实现方式：浅拷贝用 `clone()`，深拷贝用序列化或手动克隆

### 2. 如何实现深拷贝？

**回答要点：**
```java
// 1. 重写 clone()，递归克隆（繁琐）
@Override
protected Object clone() throws CloneNotSupportedException {
    Person cloned = (Person) super.clone();
    cloned.address = address.clone();
    cloned.friends = friends.stream()
        .map(Friend::clone)
        .collect(Collectors.toList());
    return cloned;
}

// 2. 序列化（推荐，自动处理所有层级）
public T deepCopy() {
    // 序列化到字节数组，再反序列化
}

// 3. 使用工具类（如 JSON、BeanUtils）
Person copy = JSON.parseObject(JSON.toJSONString(original), Person.class);
```

### 3. 为什么 Cloneable 接口是空的？

**回答要点：**
- `Cloneable` 是标记接口，没有方法
- 它的作用是告诉 `Object.clone()` 方法可以进行字段复制
- 如果不实现 `Cloneable`，调用 `clone()` 会抛出 `CloneNotSupportedException`
- 这是 Java 设计的一个缺陷，更好的做法是提供复制构造器或静态工厂方法

### 4. 浅拷贝会影响 String 吗？

**回答要点：**
- String 是不可变对象，虽然浅拷贝复制的是引用
- 但 String 无法被修改，所以修改时实际上是创建新对象
- 效果上等同于深拷贝，不用担心

---

## 代码示例

### 完整的深拷贝实现

```java
public class Person implements Serializable {
    private String name;
    private int age;
    private Address address;
    private List<String> hobbies;
    
    // 构造器、getter、setter 省略
    
    /**
     * 方式一：序列化实现深拷贝
     */
    @SuppressWarnings("unchecked")
    public Person deepCopyBySerialization() {
        try {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            ObjectOutputStream oos = new ObjectOutputStream(bos);
            oos.writeObject(this);
            
            ByteArrayInputStream bis = new ByteArrayInputStream(bos.toByteArray());
            ObjectInputStream ois = new ObjectInputStream(bis);
            return (Person) ois.readObject();
        } catch (IOException | ClassNotFoundException e) {
            throw new RuntimeException("深拷贝失败", e);
        }
    }
    
    /**
     * 方式二：复制构造器（推荐）
     */
    public Person(Person other) {
        this.name = other.name; // String 不可变，直接复制
        this.age = other.age;   // 基本类型，直接复制
        this.address = new Address(other.address); // 深拷贝
        this.hobbies = new ArrayList<>(other.hobbies); // 深拷贝
    }
}

public class Address implements Serializable {
    private String city;
    private String street;
    
    public Address(Address other) {
        this.city = other.city;
        this.street = other.street;
    }
}
```

### 使用工具类实现深拷贝

```java
// 使用 Jackson JSON
public class DeepCopyUtils {
    private static final ObjectMapper mapper = new ObjectMapper();
    
    public static <T> T deepCopy(T object, Class<T> clazz) {
        try {
            String json = mapper.writeValueAsString(object);
            return mapper.readValue(json, clazz);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("深拷贝失败", e);
        }
    }
    
    // 支持 List、Map 等集合类型
    public static <T> T deepCopy(T object, TypeReference<T> typeRef) {
        try {
            String json = mapper.writeValueAsString(object);
            return mapper.readValue(json, typeRef);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("深拷贝失败", e);
        }
    }
}
```

---

## 实战场景

### 场景 1：保存历史版本

```java
public class DocumentService {
    private List<Document> history = new ArrayList<>();
    
    public void saveVersion(Document doc) {
        // 需要深拷贝，否则后续修改会影响历史版本
        history.add(doc.deepCopy());
    }
    
    public Document restoreVersion(int index) {
        // 返回副本，避免修改历史记录
        return history.get(index).deepCopy();
    }
}
```

### 场景 2：多线程共享数据

```java
public class DataProcessor {
    private Config config; // 共享配置
    
    public void process() {
        // 每个线程使用配置的副本，避免并发问题
        Config localConfig = config.deepCopy();
        // 使用 localConfig 进行处理...
    }
}
```

### 场景 3：防御性拷贝

```java
public class Order {
    private List<Item> items;
    
    // 返回副本，防止外部修改
    public List<Item> getItems() {
        return new ArrayList<>(items); // 浅拷贝，如果 Item 不可变则足够
    }
    
    // 接收副本，防止外部修改
    public void setItems(List<Item> items) {
        this.items = new ArrayList<>(items);
    }
}
```

---

## 延伸思考

- 为什么 Java 不默认提供深拷贝？
- 如何实现 Immutable 对象？它们需要深拷贝吗？
- 性能对比：序列化 vs 复制构造器 vs JSON
- 框架中的深拷贝：BeanUtils.copyProperties 是浅拷贝还是深拷贝？

## 参考资料

- [Java Object clone() 方法](https://docs.oracle.com/javase/8/docs/api/java/lang/Object.html#clone--)
- [复制构造器 vs clone()](https://www.artima.com/articles/josh-bloch-on-design#part2)
