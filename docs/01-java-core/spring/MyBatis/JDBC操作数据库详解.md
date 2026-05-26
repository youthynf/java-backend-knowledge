# JDBC操作数据库详解

JDBC操作数据库详解
一、概述
JDBC（Java Database Connectivity）是Java访问数据库的标准API，提供了一套与数据库无关的操作接口。
二、JDBC操作数据库详解
基础操作流程
1.1 标准七步操作法

// 1. 加载驱动 (JDBC 4.0+ 可省略)
Class.forName("com.mysql.cj.jdbc.Driver");

// 2. 建立连接
String url = "jdbc:mysql://localhost:3306/test?useSSL=false&serverTimezone=UTC";
String username = "root";
String password = "123456";
Connection conn = DriverManager.getConnection(url, username, password);

// 3. 创建Statement
Statement stmt = conn.createStatement();

// 4. 执行SQL
String sql = "SELECT * FROM users";
ResultSet rs = stmt.executeQuery(sql);

// 5. 处理结果集
while(rs.next()) {
    int id = rs.getInt("id");
    String name = rs.getString("name");
    System.out.println(id + ": " + name);
}

// 6. 关闭资源
rs.close();
stmt.close();

// 7. 关闭连接
conn.close();

1.2 新版try-with-resources写法

String url = "jdbc:mysql://localhost:3306/test";
String sql = "INSERT INTO users(name,age) VALUES(?,?)";

try (Connection conn = DriverManager.getConnection(url, "root", "123456");
     PreparedStatement pstmt = conn.prepareStatement(sql)) {
    
    pstmt.setString(1, "张三");
    pstmt.setInt(2, 25);
    int affectedRows = pstmt.executeUpdate();
    System.out.println("插入行数: " + affectedRows);
    
} catch (SQLException e) {
    e.printStackTrace();
}

核心接口详解
2.1 Connection数据库连接
关键方法：
ccreateStatement(): 创建基本Statement
·  prepareStatement(sql): 创建预编译Statement
·  prepareCall(sql): 调用存储过程
·  setAutoCommit(false): 开启事务
·  commit()/rollback(): 提交/回滚事务

2.2 Statement/PrepareStatement
·  Statement：适合静态SQL，存在SQL注入风险。

Statement stmt = conn.createStatement();
stmt.executeUpdate("UPDATE users SET status=1 WHERE id=2");
·  PreparedStatement：预编译防止SQL注入，可缓存执行计划性能更高。

PreparedStatement pstmt = conn.prepareStatement(
    "INSERT INTO products(name,price) VALUES(?,?)");
pstmt.setString(1, "笔记本电脑");
pstmt.setBigDecimal(2, new BigDecimal("5999.00"));
pstmt.executeUpdate();

2.3 ResultSet结果集
·  遍历方式：

while(rs.next()) {
    String name = rs.getString("col_name");
    // 或使用列索引 rs.getString(1)
}
·  结果集类型：

TYPE_FORWARD_ONLY: 默认，只能向前遍历
TYPE_SCROLL_INSENSITIVE: 可滚动，不感知数据库变化
TYPE_SCROLL_SENSITIVE: 可滚动且感知变化

事务管理
3.1 基本事务控制

try {
    conn.setAutoCommit(false); // 开启事务
    
    // 执行多个SQL操作
    stmt1.executeUpdate(...);
    stmt2.executeUpdate(...);
    
    conn.commit(); // 提交事务
} catch (SQLException e) {
    conn.rollback(); // 回滚事务
} finally {
    conn.setAutoCommit(true);
}

3.2 保存点Savepoint

Savepoint sp = conn.setSavepoint("point1");
try {
    // 部分操作
    conn.rollback(sp); // 回滚到保存点
    conn.releaseSavepoint(sp);
} catch(...)

批处理操作

try (PreparedStatement pstmt = conn.prepareStatement(
        "INSERT INTO logs(content) VALUES(?)")) {
    
    for (int i = 0; i < 1000; i++) {
        pstmt.setString(1, "Log entry " + i);
        pstmt.addBatch(); // 添加到批处理
        
        if (i % 100 == 0) {
            pstmt.executeBatch(); // 每100条执行一次
        }
    }
    pstmt.executeBatch(); // 执行剩余条目
}

连接池最佳实践
5.1 连接池作用
·  减少连接创建/销毁开销
·  控制并发连接数
·  统一管理连接生命周期

5.2 常用连接池对比
·  HikariCP：高性能，Spring Boot默认，引入依赖com.zaxxer.HikariCP；
·  Druid：阿里出品，带监控功能，引入依赖com.alibaba.druid；
·  Tomcat JDBC：Tomcat内置池，引入依赖org.apache.tomcat.jdbc.pool；

5.3 HikariCP配置示例

HikariConfig config = new HikariConfig();
config.setJdbcUrl("jdbc:mysql://localhost/test");
config.setUsername("root");
config.setPassword("123456");
config.addDataSourceProperty("cachePrepStmts", "true");
config.addDataSourceProperty("prepStmtCacheSize", "250");
config.addDataSourceProperty("prepStmtCacheSqlLimit", "2048");

HikariDataSource ds = new HikariDataSource(config);

三、总结
JDBC作为Java数据库访问的基石，虽然现在大多数项目使用MyBatis/JPA等框架，但理解JDBC原理对于排查数据库问题、优化ORM框架性能和处理特殊数据库操作还是很有必要的。
