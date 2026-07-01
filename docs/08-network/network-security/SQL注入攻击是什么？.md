# SQL 注入攻击是什么？

## 核心概念

SQL 注入是攻击者把恶意 SQL 片段塞进用户输入，让应用程序拼接后送到数据库执行，从而绕过认证、窃取数据、篡改数据甚至拿到 shell 的攻击。本质是“数据被当成代码执行”——数据库无法区分用户输入的字符串和开发者写的 SQL 关键字，只要拼接进同一字符串就一起执行。

SQL 注入之所以严重，是因为它直接打到数据库这个“核心资产”。一个有注入漏洞的登录接口，攻击者可以用 `' OR '1'='1` 绕过密码；一个搜索接口，攻击者可以用 `UNION SELECT` 拖出整库；如果数据库权限配置不当，还能用 `xp_cmdshell`、`LOAD_FILE()`、`INTO OUTFILE` 执行系统命令、读写文件。

防御的核心是**预编译语句（Prepared Statement）参数化查询**：先把 SQL 结构发给数据库预编译，再把用户输入作为参数绑定，参数永远被当数据而非代码。这从根本上消除注入，不是“过滤特殊字符”这种打补丁方式。

## 标准回答

一句话结论：**SQL 注入是用户输入被拼进 SQL 当代码执行，根因是字符串拼接；防御唯一可靠方式是预编译参数化查询，输入过滤/转义只是辅助；按注入位置分联合查询型、报错型、布尔盲注、时间盲注**。

要点展开：

- **根因**：`"SELECT * FROM user WHERE name='" + name + "'"` 这种拼接，输入 `' OR '1'='1` 闭合引号后注入新条件。
- **四大类型**：联合查询（UNION SELECT 拖库）、报错注入（构造错误让数据库回显数据）、布尔盲注（页面有/无结果两种状态判断真假）、时间盲注（用 `SLEEP()` 根据响应时间判断）。
- **预编译原理**：先发 SQL 模板 `WHERE name=?`，数据库编译好执行计划，再传参数 `' OR '1'='1`，参数被当字符串字面量，不会被解析为 SQL。
- **不能预编译的场景**：表名、列名、ORDER BY 字段不能用占位符，必须白名单校验。
- **纵深防御**：参数化为主 + 最小权限数据库账号 + WAF 兜底 + 错误信息不外泄。

## 实现原理

### 经典注入示例

漏洞代码（Java + JDBC）：

```java
String sql = "SELECT * FROM user WHERE name='" + name + "' AND password='" + password + "'";
Statement stmt = conn.createStatement();
ResultSet rs = stmt.executeQuery(sql);
```

正常输入：`name=admin, password=123456`，SQL：

```sql
SELECT * FROM user WHERE name='admin' AND password='123456'
```

攻击输入：`name=admin' --, password=任意`，SQL：

```sql
SELECT * FROM user WHERE name='admin' --' AND password='xxx'
```

`--` 后面被注释，密码校验直接被绕过，攻击者以 admin 身份登录。

### 四种注入类型

**1. 联合查询注入（UNION-based）**

漏洞代码：

```java
String sql = "SELECT id, title, content FROM article WHERE id=" + id;
```

攻击 Payload：

```
id=1 UNION SELECT username, password, email FROM users
```

返回结果拼到正常文章列表里，攻击者直接看到用户表所有账号密码。

**2. 报错注入（Error-based）**

利用数据库报错时把数据带出。MySQL 经典 Payload：

```
id=1 AND extractvalue(1, concat(0x7e, (SELECT user()), 0x7e))
```

数据库报错 `XPATH syntax error: '~root@localhost~'`，攻击者从错误信息里读到当前用户名。前提是应用把 SQL 错误原样返回前端。

**3. 布尔盲注（Boolean-based Blind）**

页面不直接回显数据，但根据条件返回不同内容。攻击者构造：

```
id=1 AND SUBSTRING((SELECT password FROM users WHERE id=1), 1, 1)='a'
```

页面正常显示说明第一位是 'a'，否则不是。逐字符爆破出整段密码。慢但稳定。

**4. 时间盲注（Time-based Blind）**

页面没有任何差异，用响应时间判断。MySQL：

```
id=1 AND IF(SUBSTRING((SELECT password FROM users WHERE id=1), 1, 1)='a', SLEEP(3), 0)
```

响应慢 3 秒说明条件为真。适用于布尔盲注都看不出差异的场景。

### 预编译为什么能防注入

JDBC 预编译流程：

```java
String sql = "SELECT * FROM user WHERE name=? AND password=?";
PreparedStatement ps = conn.prepareStatement(sql);  // 1. 先发模板给数据库编译
ps.setString(1, name);                              // 2. 绑定参数
ps.setString(2, password);
ResultSet rs = ps.executeQuery();                   // 3. 执行
```

数据库在第 1 步就把 SQL 结构解析为语法树，参数位置是占位符。第 2 步传的 `' OR '1'='1` 永远作为字符串字面量填入占位符，不会被解析为 SQL 关键字。即使输入里有引号、`UNION`、`--`，都只是字符串内容。

### 不能预编译的场景

表名、列名、`ORDER BY`/`GROUP BY` 字段不能用占位符（这些是 SQL 结构而非数据）。这些场景必须白名单：

```java
// 错误：表名拼接，可注入
String sql = "SELECT * FROM " + tableName + " WHERE id=?";

// 正确：表名白名单
Set<String> ALLOWED = Set.of("user", "order", "product");
if (!ALLOWED.contains(tableName)) {
    throw new IllegalArgumentException("非法表名");
}
String sql = "SELECT * FROM " + tableName + " WHERE id=?";
```

排序字段同理：

```java
// 错误：ORDER BY 拼接
String sql = "SELECT * FROM user ORDER BY " + sortField;

// 正确：白名单
Set<String> SORTABLE = Set.of("id", "name", "created_at");
if (!SORTABLE.contains(sortField)) {
    sortField = "id";
}
```

## 代码示例

### JDBC 预编译（防注入）

```java
public User login(String name, String password) throws SQLException {
    String sql = "SELECT id, name, email FROM user WHERE name=? AND password=?";
    try (PreparedStatement ps = conn.prepareStatement(sql)) {
        ps.setString(1, name);
        ps.setString(2, passwordHash(password));
        try (ResultSet rs = ps.executeQuery()) {
            if (rs.next()) {
                return new User(rs.getLong("id"), rs.getString("name"), rs.getString("email"));
            }
            return null;
        }
    }
}
```

### MyBatis 用 `#{}` 防注入，`${}` 会注入

```xml
<!-- 安全：#{} 是预编译占位符 -->
<select id="findById" resultType="User">
  SELECT * FROM user WHERE id = #{id}
</select>

<!-- 危险：${} 是字符串拼接，会注入 -->
<select id="findById" resultType="User">
  SELECT * FROM user WHERE id = ${id}
</select>

<!-- ORDER BY 必须用 ${}，但要做白名单校验 -->
<select id="findAll" resultType="User">
  SELECT * FROM user
  ORDER BY ${sortField} ${sortOrder}
</select>
```

Java 侧校验：

```java
private static final Set<String> SORT_FIELDS = Set.of("id", "name", "created_at");
private static final Set<String> SORT_ORDERS = Set.of("ASC", "DESC");

public List<User> findAll(String sortField, String sortOrder) {
    if (!SORT_FIELDS.contains(sortField)) sortField = "id";
    if (!SORT_ORDERS.contains(sortOrder.toUpperCase())) sortOrder = "ASC";
    return mapper.findAll(sortField, sortOrder);
}
```

### JPA / Hibernate 自动参数化

```java
// 安全：JPQL 自动参数化
@Query("SELECT u FROM User u WHERE u.name = :name AND u.password = :pwd")
User login(@Param("name") String name, @Param("pwd") String pwd);

// 危险：原生 SQL 字符串拼接
@Query(value = "SELECT * FROM user WHERE name = '" + name + "'", nativeQuery = true)
// 这种写法编译期就报错，但若用 String 拼接同样危险
```

### 最小权限数据库账号

```sql
-- 应用账号只给必要权限，不给 DROP/FILE/EXECUTE
CREATE USER 'app_user'@'10.0.0.%' IDENTIFIED BY 'strong_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON shopdb.* TO 'app_user'@'10.0.0.%';
-- 不要给 GRANT OPTION、FILE、PROCESS、SUPER
-- DDL（建表/改表）用单独的运维账号
```

## 实战场景

| 场景 | 漏洞点 | 防御 |
|------|--------|------|
| 登录接口 | 字符串拼 SQL | 预编译 + 密码哈希校验 |
| 搜索功能 | WHERE 拼关键词 | 预编译 + LIKE 通配符转义 |
| 列表排序 | ORDER BY 拼字段 | 白名单校验 |
| 动态表名查询 | 表名拼接 | 白名单 + 不允许外部传表名 |
| 报表 SQL | 复杂条件拼接 | 用 QueryDSL/JPA Criteria API |
| 老系统迁移 | 历史代码全是拼接 | 加 SQL 注入扫描 + 逐步改预编译 |
| DBA 工具 | 内部但仍有风险 | 内部接口也要参数化 |

## 深挖追问

**Q1：预编译是不是 100% 防注入？**

不是。预编译只能防“值”注入，不能防“结构”注入。表名、列名、`ORDER BY` 字段不能用占位符，必须白名单。另外动态拼 SQL 字符串再传给预编译也没用：

```java
// 这种“假预编译”仍可注入
String sql = "SELECT * FROM user WHERE name='" + name + "'";
PreparedStatement ps = conn.prepareStatement(sql);  // 已经拼接，没救
```

**Q2：LIKE 模糊查询怎么防注入？**

预编译能防 SQL 注入，但 `%` `_` 通配符是另一回事。用户输入 `%` 会导致全表扫描，要转义：

```java
String pattern = keyword.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
ps.setString(1, "%" + pattern + "%");
```

**Q3：MyBatis 的 `${}` 什么时候能用？**

只在动态表名、列名、`ORDER BY` 字段必须用，且必须做白名单校验。任何用户可控的数据走 `${}` 都是注入。`#{}` 是默认选择。

**Q4：ORM 框架（JPA/Hibernate）是不是天然防注入？**

JPQL/HQL 用命名参数或位置参数时是预编译，安全。但用原生 SQL（`nativeQuery=true`）且字符串拼接时仍有注入风险。ORM 不是免死金牌。

**Q5：WAF 能不能挡住 SQL 注入？**

能挡住一部分特征明显的（如 `UNION SELECT`、`OR 1=1`），但绕过方式很多：大小写、注释、编码、分块。WAF 是兜底，不能替代预编译。盲注尤其难被 WAF 识别（请求看起来就是正常参数）。

**Q6：二次注入是什么？**

攻击数据先存入数据库（存的时候转义了），后续在另一处查询里被读出来拼到 SQL 里没转义，触发注入。例如注册时用户名 `admin'--` 存库，修改密码时 `WHERE name='admin'--'` 拼接导致改了 admin 的密码。防御：所有 SQL 都参数化，不要存“转义后的数据”，存原始数据。

## 易错点

- **用 `Statement` 而非 `PreparedStatement`**：拼接 SQL 的根源，禁用 `Statement`。
- **`replace("'", "''")` 转义**：黑名单思路，编码绕过、不同数据库语法不同，不可靠。
- **以为 ORM 天然防注入**：原生 SQL 拼接仍可注入。
- **`#{}` 和 `${}` 混用**：MyBatis `${}` 必须白名单，否则注入。
- **ORDER BY 用占位符**：占位符在 ORDER BY 位置不生效，必须白名单。
- **错误信息直接返回前端**：辅助报错注入，必须统一异常处理，不暴露 SQL。
- **应用账号给 DBA 权限**：一旦注入，攻击者拿到 DROP/FILE，危害指数级放大。
- **存转义后数据**：导致二次注入，应该存原始、用时转义。
- **以为输入校验就够**：白名单校验是补充，预编译才是根治。

## 总结

SQL 注入的根因是字符串拼接让数据被当代码执行，防御的唯一可靠方式是预编译参数化查询。四大注入类型（联合、报错、布尔盲注、时间盲注）对应不同的回显场景，盲注最隐蔽也最常见。表名、列名、ORDER BY 字段不能用占位符，必须白名单校验。生产实践要点：所有 SQL 走预编译 + MyBatis 用 `#{}` 不用 `${}` + 应用账号最小权限 + 错误信息不外泄。WAF 和输入校验是兜底，不能替代预编译。

## 参考资料

- [OWASP SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [PortSwigger: SQL Injection](https://portswigger.net/web-security/sql-injection)
- [MyBatis Mapper XML #{} vs ${}](https://mybatis.org/mybatis-3/sqlmap-xml.html)
- [MySQL Prepared Statements](https://dev.mysql.com/doc/refman/8.0/en/sql-prepared-statements.html)

---
