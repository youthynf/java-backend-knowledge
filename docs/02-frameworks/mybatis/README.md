# MyBatis

## 核心概念

### MyBatis 架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Application                           │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                      SqlSession                              │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│   │  Executor   │  │ Transaction │  │  Statement  │        │
│   │  (执行器)    │  │  (事务管理)  │  │  Handler    │        │
│   └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                      MappedStatement                         │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│   │    SQL      │  │  Parameter  │  │   Result    │        │
│   │  语句配置    │  │   Map       │  │    Map      │        │
│   └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                       Database                               │
└─────────────────────────────────────────────────────────────┘
```

**核心组件**：

| 组件 | 作用 |
|------|------|
| SqlSessionFactory | 创建 SqlSession 的工厂，单例 |
| SqlSession | 执行 SQL 的会话，非线程安全 |
| Executor | 执行器，负责 SQL 执行和缓存 |
| StatementHandler | 封装 JDBC Statement 操作 |
| ParameterHandler | 参数处理 |
| ResultSetHandler | 结果集映射 |
| TypeHandler | Java 类型与 JDBC 类型转换 |
| MappedStatement | SQL 语句的封装对象 |

### 执行流程

```
1. SqlSessionFactoryBuilder 解析配置文件
         ↓
2. 构建 Configuration 对象，创建 SqlSessionFactory
         ↓
3. SqlSessionFactory.openSession() 创建 SqlSession
         ↓
4. SqlSession.getMapper() 获取 Mapper 代理对象
         ↓
5. 调用 Mapper 方法 → MappedStatement
         ↓
6. Executor 执行查询（先查缓存）
         ↓
7. StatementHandler → ParameterHandler → 执行 SQL
         ↓
8. ResultSetHandler → TypeHandler → 结果映射
         ↓
9. 返回结果
```

---

## Mapper 代理原理

### JDK 动态代理

```java
// MapperProxy 实现 InvocationHandler
public class MapperProxy<T> implements InvocationHandler {
    private final SqlSession sqlSession;
    private final Class<T> mapperInterface;
    
    @Override
    public Object invoke(Object proxy, Method method, Object[] args) {
        // Object 方法直接调用
        if (Object.class.equals(method.getDeclaringClass())) {
            return method.invoke(this, args);
        }
        
        // 执行 SQL
        String statementId = mapperInterface.getName() + "." + method.getName();
        MappedStatement ms = configuration.getMappedStatement(statementId);
        
        return sqlSession.selectList(statementId, args);
    }
}

// 代理对象创建
UserMapper mapper = sqlSession.getMapper(UserMapper.class);
// 实际返回的是代理对象：Proxy.newProxyInstance(..., new MapperProxy<>(...))
```

**为什么 Mapper 接口不需要实现类？**

```
┌──────────────────┐      代理关系      ┌──────────────────┐
│  UserMapper      │◀─────────────────▶│   MapperProxy    │
│  (接口)          │                    │   (InvocationHandler) │
└──────────────────┘                    └────────┬─────────┘
                                                 │
                                                 ▼
                                        ┌──────────────────┐
                                        │   SqlSession     │
                                        │   执行 SQL       │
                                        └──────────────────┘
```

关键：
1. 接口全限定名 + 方法名 = statementId
2. `com.example.UserMapper.selectById` → 找到对应 SQL
3. 通过代理拦截方法调用，转为 SQL 执行

---

## 缓存机制

### 一级缓存（Session 级别）

```
┌───────────────────────────────────────────────────────┐
│                     SqlSession                        │
│  ┌─────────────────────────────────────────────┐     │
│  │              Local Cache (Map)               │     │
│  │                                              │     │
│  │   Key: statementId + params + offset + limit│     │
│  │   Value: 查询结果对象                         │     │
│  └─────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────┘
```

**特点**：
- 默认开启，无法关闭
- SqlSession 级别，会话关闭即失效
- 同一个 SqlSession 中相同查询直接返回缓存

**失效场景**：
```java
// 1. 调用 sqlSession.clearCache()
sqlSession.clearCache();

// 2. 执行 insert/update/delete
userMapper.update(user);  // 清空一级缓存

// 3. SqlSession 关闭
sqlSession.close();
```

### 二级缓存（Mapper 级别）

```
┌───────────────────────────────────────────────────────────┐
│                    Mapper Namespace                       │
│  ┌─────────────────────────────────────────────────┐     │
│  │              Cache (跨 Session 共享)             │     │
│  │                                                  │     │
│  │   - PerpetualCache: 永久缓存（HashMap）          │     │
│  │   - LruCache: LRU 淘汰                          │     │
│  │   - FifoCache: FIFO 淘汰                        │     │
│  │   - SoftCache/WeakCache: 引用策略               │     │
│  └─────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────┘
        ↑                    ↑                    ↑
   SqlSession1         SqlSession2          SqlSession3
```

**配置方式**：
```xml
<!-- mybatis-config.xml 开启二级缓存 -->
<settings>
    <setting name="cacheEnabled" value="true"/>
</settings>

<!-- Mapper.xml 声明使用缓存 -->
<cache eviction="LRU" flushInterval="60000" size="1024" readOnly="true"/>

<!-- 方法级别控制 -->
<select id="selectById" resultType="User" useCache="true">
    SELECT * FROM user WHERE id = #{id}
</select>
```

**注意事项**：
```java
// 实体类必须实现 Serializable
public class User implements Serializable {
    private Long id;
    private String name;
    // ...
}

// 缓存隔离级别问题
// 多表关联查询时，关联表更新不会清空缓存，可能导致脏读
// 解决：配置关联关系或禁用二级缓存
```

### 缓存执行顺序

```
查询请求 → 二级缓存 → 一级缓存 → 数据库

执行流程：
1. 查询先查二级缓存
2. 未命中，查一级缓存
3. 未命中，查询数据库
4. 结果放入一级缓存
5. SqlSession 提交/关闭时，一级缓存 → 二级缓存
```

---

## 动态 SQL

### 标签详解

```xml
<!-- if：条件判断 -->
<select id="selectByCondition" resultType="User">
    SELECT * FROM user
    <where>
        <if test="name != null">
            AND name = #{name}
        </if>
        <if test="age != null">
            AND age = #{age}
        </if>
    </where>
</select>

<!-- choose/when/otherwise：多分支选择 -->
<select id="selectByType" resultType="User">
    SELECT * FROM user
    <where>
        <choose>
            <when test="type == 'vip'">
                AND vip_level > 0
            </when>
            <when test="type == 'new'">
                AND create_time > #{sevenDaysAgo}
            </when>
            <otherwise>
                AND status = 1
            </otherwise>
        </choose>
    </where>
</select>

<!-- foreach：循环遍历 -->
<select id="selectByIds" resultType="User">
    SELECT * FROM user
    WHERE id IN
    <foreach collection="ids" item="id" open="(" separator="," close=")">
        #{id}
    </foreach>
</select>

<insert id="batchInsert">
    INSERT INTO user (name, age) VALUES
    <foreach collection="users" item="user" separator=",">
        (#{user.name}, #{user.age})
    </foreach>
</insert>

<!-- set：动态更新 -->
<update id="updateSelective">
    UPDATE user
    <set>
        <if test="name != null">name = #{name},</if>
        <if test="age != null">age = #{age},</if>
        <if test="email != null">email = #{email},</if>
    </set>
    WHERE id = #{id}
</update>

<!-- sql/include：片段复用 -->
<sql id="baseColumns">
    id, name, age, email, create_time, update_time
</sql>

<select id="selectById" resultType="User">
    SELECT <include refid="baseColumns"/> FROM user WHERE id = #{id}
</select>
```

### OGNL 表达式

```xml
<!-- 常用表达式 -->
<if test="name != null">                          <!-- 非空判断 -->
<if test="names != null and names.size() > 0">    <!-- 集合判断 -->
<if test="user.age >= 18">                        <!-- 属性访问 -->
<if test="name != null and name != ''">           <!-- 字符串非空 -->
<if test="@org.apache.commons.lang3.StringUtils@isNotEmpty(name)"> <!-- 调用静态方法 -->

<!-- 字符串方法 -->
<if test="name.contains('admin')">                <!-- 包含 -->
<if test="name.startsWith('test')">               <!-- 前缀 -->
<if test="name.length() > 5">                     <!-- 长度 -->

<!-- 三元运算 -->
#{type == 'vip' ? vipDiscount : normalDiscount}
```

---

## 插件机制

### 四大可拦截对象

```
┌─────────────────────────────────────────────────────────┐
│                    Executor                             │
│   - update/query/commit/rollback/...                   │
│   拦截点：执行 SQL 之前/之后                             │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  StatementHandler                       │
│   - prepare/parameterize/batch/update/query            │
│   拦截点：SQL 编译、参数设置                             │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  ParameterHandler                       │
│   - getParameterObject/setParameters                   │
│   拦截点：参数处理                                      │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  ResultSetHandler                       │
│   - handleResultSets/handleOutputParameters            │
│   拦截点：结果集映射                                    │
└─────────────────────────────────────────────────────────┘
```

### 实现插件

```java
@Intercepts({
    @Signature(
        type = StatementHandler.class,
        method = "prepare",
        args = {Connection.class, Integer.class}
    )
})
public class SqlLogPlugin implements Interceptor {
    
    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        StatementHandler handler = (StatementHandler) invocation.getTarget();
        BoundSql boundSql = handler.getBoundSql();
        String sql = boundSql.getSql();
        
        long start = System.currentTimeMillis();
        Object result = invocation.proceed();  // 执行原方法
        long end = System.currentTimeMillis();
        
        System.out.println("SQL: " + sql + " | 耗时: " + (end - start) + "ms");
        return result;
    }
    
    @Override
    public Object plugin(Object target) {
        return Plugin.wrap(target, this);  // 创建代理对象
    }
}
```

### 分页插件原理

```java
@Intercepts({
    @Signature(
        type = StatementHandler.class,
        method = "prepare",
        args = {Connection.class, Integer.class}
    )
})
public class PagePlugin implements Interceptor {
    
    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        StatementHandler handler = (StatementHandler) invocation.getTarget();
        BoundSql boundSql = handler.getBoundSql();
        Object parameterObject = boundSql.getParameterObject();
        
        // 判断是否需要分页
        if (parameterObject instanceof PageRequest) {
            PageRequest page = (PageRequest) parameterObject;
            String originalSql = boundSql.getSql();
            
            // 改写 SQL（MySQL 为例）
            String pageSql = originalSql + " LIMIT " 
                + page.getOffset() + ", " + page.getSize();
            
            // 反射修改 SQL
            Field field = boundSql.getClass().getDeclaredField("sql");
            field.setAccessible(true);
            field.set(boundSql, pageSql);
        }
        
        return invocation.proceed();
    }
}
```

---

## 面试高频问题

### 1. MyBatis 和 Hibernate 的区别？

| 对比项 | MyBatis | Hibernate |
|--------|---------|-----------|
| SQL 控制 | 手写 SQL，灵活控制 | 自动生成，对开发透明 |
| 学习成本 | 低，熟悉 SQL 即可 | 高，需要掌握 HQL、缓存等 |
| 性能优化 | SQL 可精细优化 | 需要深入了解机制 |
| 移植性 | SQL 方言差异，移植差 | 方言自动适配，移植性好 |
| 缓存 | 一级、二级缓存 | 一级、二级、查询缓存更丰富 |
| 适用场景 | 复杂 SQL、性能要求高 | 标准 CRUD、快速开发 |

### 2. #{} 和 ${} 的区别？

```java
// #{ }：预编译，安全
SELECT * FROM user WHERE name = #{name}
// 实际执行：SELECT * FROM user WHERE name = ?  // PreparedStatement
// 参数会经过类型转换和安全处理

// ${ }：字符串替换，不安全
SELECT * FROM user WHERE name = '${name}'
// 实际执行：SELECT * FROM user WHERE name = '张三'  // 直接拼接
// 有 SQL 注入风险！

// ${ } 适用场景（#{ } 不支持的场景）
ORDER BY ${column}      // 动态排序字段
SELECT * FROM ${table}  // 动态表名
```

### 3. MyBatis 如何防止 SQL 注入？

```
1. 默认使用 #{ } 预编译参数
   - SQL 和参数分离发送
   - 参数不会作为 SQL 解析

2. 避免 ${ } 直接拼接

3. 必须用 ${ } 时：
   - 白名单校验
   - 限制输入范围
   - 敏感表禁止动态访问
```

### 4. MyBatis 批量操作优化？

```java
// 方式一：foreach（单次 SQL，大数据量可能超长）
<insert id="batchInsert">
    INSERT INTO user (name, age) VALUES
    <foreach collection="users" item="user" separator=",">
        (#{user.name}, #{user.age})
    </foreach>
</insert>

// 方式二：BATCH 执行器（推荐）
SqlSession session = sqlSessionFactory.openSession(ExecutorType.BATCH);
UserMapper mapper = session.getMapper(UserMapper.class);
for (User user : users) {
    mapper.insert(user);  // 累积，不立即执行
}
session.flushStatements();  // 批量提交
session.commit();

// 方式三：拼接多个 INSERT 语句
INSERT INTO user (name, age) VALUES 
('a', 1), ('b', 2), ('c', 3), ...
```

### 5. 延迟加载原理？

```xml
<!-- 配置延迟加载 -->
<settings>
    <setting name="lazyLoadingEnabled" value="true"/>
    <setting name="aggressiveLazyLoading" value="false"/>
</settings>

<!-- 关联查询 -->
<resultMap id="userWithOrders" type="User">
    <id property="id" column="id"/>
    <result property="name" column="name"/>
    <association property="orders" column="id" 
                 select="selectOrdersByUserId" fetchType="lazy"/>
</resultMap>
```

**原理**：
```
查询 User → 返回代理对象（未查询 Order）
                ↓
访问 user.getOrders() → 触发代理 → 执行 Order 查询
                ↓
返回结果（延迟加载完成）
```

底层使用 CGLIB 或 Javassist 生成代理对象，属性访问时触发查询。

### 6. MyBatis 如何映射枚举？

```java
// 方式一：自定义 TypeHandler
@MappedTypes(UserStatus.class)
public class EnumTypeHandler extends BaseTypeHandler<UserStatus> {
    
    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, 
                                     UserStatus parameter, JdbcType jdbcType) 
        throws SQLException {
        ps.setInt(i, parameter.getCode());  // 存储枚举 code
    }
    
    @Override
    public UserStatus getNullableResult(ResultSet rs, String columnName) 
        throws SQLException {
        int code = rs.getInt(columnName);
        return UserStatus.getByCode(code);
    }
}

// 方式二：使用 MyBatis 内置 EnumOrdinalTypeHandler / EnumTypeHandler
<resultMap id="userMap" type="User">
    <result property="status" column="status" 
            typeHandler="org.apache.ibatis.type.EnumOrdinalTypeHandler"/>
</resultMap>
```

---

## 实战场景

### 1. 多租户数据隔离

```java
@Intercepts({
    @Signature(type = StatementHandler.class, method = "prepare", 
               args = {Connection.class, Integer.class})
})
public class TenantPlugin implements Interceptor {
    
    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        StatementHandler handler = (StatementHandler) invocation.getTarget();
        BoundSql boundSql = handler.getBoundSql();
        String sql = boundSql.getSql();
        
        String tenantId = TenantContext.getTenantId();
        if (tenantId != null) {
            // 改写 SQL，添加租户条件
            String newSql = sql.replace("WHERE ", "WHERE tenant_id = '" + tenantId + "' AND ");
            if (!sql.contains("WHERE")) {
                newSql = sql + " WHERE tenant_id = '" + tenantId + "'";
            }
            Field field = boundSql.getClass().getDeclaredField("sql");
            field.setAccessible(true);
            field.set(boundSql, newSql);
        }
        return invocation.proceed();
    }
}
```

### 2. 乐观锁实现

```java
@Intercepts({
    @Signature(type = StatementHandler.class, method = "update", 
               args = {Statement.class})
})
public class OptimisticLockPlugin implements Interceptor {
    
    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        StatementHandler handler = (StatementHandler) invocation.getTarget();
        Object parameter = handler.getParameterHandler().getParameterObject();
        
        if (parameter instanceof Versioned) {
            Versioned entity = (Versioned) parameter;
            // 获取当前版本
            int currentVersion = entity.getVersion();
            // SQL 中添加版本条件
            // UPDATE table SET ..., version = version + 1 WHERE id = ? AND version = ?
            entity.setVersion(currentVersion + 1);
        }
        return invocation.proceed();
    }
}
```

### 3. 敏感字段加密

```java
@MappedTypes(String.class)
public class EncryptTypeHandler extends BaseTypeHandler<String> {
    
    private static final String KEY = "your-secret-key";
    
    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, 
                                     String parameter, JdbcType jdbcType) 
        throws SQLException {
        ps.setString(i, AES.encrypt(parameter, KEY));
    }
    
    @Override
    public String getNullableResult(ResultSet rs, String columnName) 
        throws SQLException {
        String encrypted = rs.getString(columnName);
        return encrypted != null ? AES.decrypt(encrypted, KEY) : null;
    }
}

// 使用
<result property="phone" column="phone" typeHandler="EncryptTypeHandler"/>
```

---

## 延伸思考

### MyBatis-Plus 对比原生 MyBatis

| 特性 | MyBatis | MyBatis-Plus |
|------|---------|--------------|
| CRUD | 手写 SQL | 自动生成单表 CRUD |
| 分页 | 插件实现 | 内置分页插件 |
| 条件构造 | XML/注解 | Lambda 表达式链式调用 |
| 代码生成 | 无 | 内置代码生成器 |
| 多租户 | 手动实现 | 内置插件 |
| 逻辑删除 | 手动实现 | 注解配置 |

### MyBatis 与 Spring 整合原理

```java
// SqlSessionFactoryBean 创建 SqlSessionFactory
@Bean
public SqlSessionFactoryBean sqlSessionFactory(DataSource dataSource) {
    SqlSessionFactoryBean factory = new SqlSessionFactoryBean();
    factory.setDataSource(dataSource);
    factory.setMapperLocations(new PathMatchingResourcePatternResolver()
        .getResources("classpath:mapper/*.xml"));
    return factory;
}

// MapperScannerConfigurer 扫描 Mapper 接口
@Bean
public MapperScannerConfigurer mapperScannerConfigurer() {
    MapperScannerConfigurer configurer = new MapperScannerConfigurer();
    configurer.setBasePackage("com.example.mapper");
    return configurer;
}

// 核心原理
// 1. MapperScannerConfigurer 实现 BeanDefinitionRegistryPostProcessor
// 2. 扫描 Mapper 接口，注册为 BeanDefinition
// 3. BeanClass 设置为 MapperFactoryBean
// 4. MapperFactoryBean.getObject() 返回代理对象
```

---

## 参考资料

- [MyBatis 官方文档](https://mybatis.org/mybatis-3/zh/index.html)
- [MyBatis 源码解析](https://github.com/mybatis/mybatis-3)
- [MyBatis-Plus 官方文档](https://baomidou.com/)

---

*最后更新: 2026-04-08*