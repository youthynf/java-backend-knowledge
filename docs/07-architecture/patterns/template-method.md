# 模板方法模式

> 定义算法骨架，将某些步骤延迟到子类实现

## 核心概念

### 什么是模板方法模式？

模板方法模式是一种行为型设计模式，它定义了一个操作中的算法骨架，将某些步骤延迟到子类中。模板方法使得子类可以在不改变算法结构的情况下，重新定义算法的某些步骤。

### 使用场景

- 多个类有相同的方法结构，但具体实现不同
- 重要、复杂的方法，需要统一算法骨架
- 控制子类扩展点（钩子方法）

---

## UML 结构

```
┌────────────────────┐
│   AbstractClass    │
├────────────────────┤
│ + templateMethod() │  ← 模板方法（final）
│ # step1()          │  ← 具体方法
│ # step2()          │  ← 抽象方法（子类实现）
│ # step3()          │  ← 钩子方法（可选覆盖）
└────────────────────┘
         △
         │ extends
         │
┌────────┴───────────┐
│   ConcreteClass    │
├────────────────────┤
│ # step2()          │  ← 实现抽象方法
│ # step3()          │  ← 覆盖钩子方法
└────────────────────┘
```

---

## 代码示例

### 基础实现

```java
// 抽象模板类
public abstract class DataProcessor {
    
    // 模板方法（final 防止子类覆盖）
    public final void process() {
        readData();      // 步骤1：读取数据
        validateData();  // 步骤2：校验数据
        processData();   // 步骤3：处理数据（抽象方法，子类实现）
        saveData();      // 步骤4：保存数据
        logResult();     // 钩子方法（可选覆盖）
    }
    
    // 具体方法（所有子类共用）
    private void readData() {
        System.out.println("读取数据");
    }
    
    // 具体方法
    private void validateData() {
        System.out.println("校验数据");
    }
    
    // 抽象方法（子类必须实现）
    protected abstract void processData();
    
    // 具体方法
    private void saveData() {
        System.out.println("保存数据");
    }
    
    // 钩子方法（子类可选覆盖）
    protected void logResult() {
        System.out.println("默认日志记录");
    }
}

// 具体实现：订单处理器
public class OrderProcessor extends DataProcessor {
    @Override
    protected void processData() {
        System.out.println("处理订单数据");
    }
    
    @Override
    protected void logResult() {
        System.out.println("订单处理完成，记录详细日志");
    }
}

// 具体实现：用户处理器
public class UserProcessor extends DataProcessor {
    @Override
    protected void processData() {
        System.out.println("处理用户数据");
    }
    // logResult() 使用默认实现
}

// 使用
DataProcessor orderProcessor = new OrderProcessor();
orderProcessor.process();
// 输出：
// 读取数据
// 校验数据
// 处理订单数据
// 保存数据
// 订单处理完成，记录详细日志
```

---

## 实战场景

### 1. Spring JdbcTemplate

```java
// JdbcTemplate 的模板方法
public class JdbcTemplate {
    
    // 模板方法
    public <T> T query(String sql, RowMapper<T> rowMapper, Object... args) {
        Connection conn = null;
        PreparedStatement ps = null;
        ResultSet rs = null;
        try {
            conn = getConnection();              // 获取连接
            ps = conn.prepareStatement(sql);     // 准备语句
            setParameters(ps, args);             // 设置参数
            rs = ps.executeQuery();              // 执行查询
            return rowMapper.mapRow(rs);         // 映射结果（用户实现）
        } catch (SQLException e) {
            throw new DataAccessException(e);
        } finally {
            close(rs, ps, conn);                 // 关闭资源
        }
    }
}

// 用户只需实现 RowMapper 接口
public class UserRowMapper implements RowMapper<User> {
    @Override
    public User mapRow(ResultSet rs, int rowNum) throws SQLException {
        User user = new User();
        user.setId(rs.getLong("id"));
        user.setName(rs.getString("name"));
        return user;
    }
}

// 使用
List<User> users = jdbcTemplate.query("SELECT * FROM user", new UserRowMapper());
```

---

### 2. Servlet 生命周期

```java
// HttpServlet 的模板方法
public abstract class HttpServlet extends GenericServlet {
    
    // 模板方法
    protected void service(HttpServletRequest req, HttpServletResponse resp) {
        String method = req.getMethod();
        
        if ("GET".equals(method)) {
            doGet(req, resp);
        } else if ("POST".equals(method)) {
            doPost(req, resp);
        } else if ("PUT".equals(method)) {
            doPut(req, resp);
        } else if ("DELETE".equals(method)) {
            doDelete(req, resp);
        }
        // ...
    }
    
    // 子类覆盖这些方法
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) {
        // 默认实现
    }
    
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) {
        // 默认实现
    }
}

// 用户自定义 Servlet
public class UserServlet extends HttpServlet {
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) {
        // 处理 GET 请求
    }
    
    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) {
        // 处理 POST 请求
    }
}
```

---

### 3. 业务流程模板

```java
// 导出模板
public abstract class ExportTemplate {
    
    public final void export() {
        List<Object> data = queryData();      // 查询数据
        String content = formatData(data);    // 格式化数据（抽象方法）
        byte[] bytes = convertToBytes(content); // 转换字节
        download(bytes);                      // 下载
    }
    
    protected abstract List<Object> queryData();
    protected abstract String formatData(List<Object> data);
    
    private byte[] convertToBytes(String content) {
        return content.getBytes(StandardCharsets.UTF_8);
    }
    
    private void download(byte[] bytes) {
        // 下载逻辑
    }
}

// CSV 导出
public class CsvExporter extends ExportTemplate {
    @Override
    protected List<Object> queryData() {
        return userDao.findAll();
    }
    
    @Override
    protected String formatData(List<Object> data) {
        return data.stream()
            .map(Object::toString)
            .collect(Collectors.joining(","));
    }
}

// Excel 导出
public class ExcelExporter extends ExportTemplate {
    @Override
    protected List<Object> queryData() {
        return userDao.findAll();
    }
    
    @Override
    protected String formatData(List<Object> data) {
        // Excel 格式化逻辑
        return "...";
    }
}
```

---

## 方法类型

### 1. 模板方法

定义算法骨架，声明为 `final` 防止子类覆盖。

```java
public final void process() {
    step1();
    step2();
    step3();
}
```

### 2. 抽象方法

子类必须实现。

```java
protected abstract void step2();
```

### 3. 具体方法

所有子类共用的实现。

```java
private void step1() {
    System.out.println("通用步骤");
}
```

### 4. 钩子方法

子类可选覆盖，提供默认实现。

```java
protected void beforeProcess() {}  // 空实现钩子

protected void afterProcess() {    // 默认实现钩子
    System.out.println("默认后置处理");
}
```

**钩子方法的使用：**

```java
public final void process() {
    beforeProcess();   // 钩子
    doProcess();       // 抽象方法
    afterProcess();    // 钩子
}

// 子类可选覆盖
public class MyProcessor extends DataProcessor {
    @Override
    protected