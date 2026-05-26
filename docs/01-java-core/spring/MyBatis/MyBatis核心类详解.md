# MyBatis核心类详解

MyBatis核心类详解
一、概述
MyBatis 的核心架构由多个关键组件协同工作，理解这些核心类及其相互关系对于深入掌握 MyBatis 至关重要。下面我将详细解析主要核心类及其协作关系：
二、核心类概览
配置相关类
SqlSessionFactoryBuilder：构建 SqlSessionFactory 的入口
Configuration：MyBatis 的全局配置容器
SqlSessionFactory：创建 SqlSession 的工厂

SQL 执行相关类
SqlSession：核心会话接口，执行 CRUD 操作
Executor：SQL 执行器，实际执行数据库操作
StatementHandler：处理 JDBC Statement
ParameterHandler：处理 SQL 参数
ResultSetHandler：处理结果集映射

映射相关类
MappedStatement：封装 SQL 语句信息
SqlSource：SQL 源，提供可执行的 SQL
BoundSql：绑定的 SQL 对象
TypeHandler：类型处理器（Java ⇄ JDBC）

代理相关类
MapperProxy：Mapper 接口的代理实现
MapperRegistry：Mapper 注册中心

二、核心类详细解析
SqlSessionFactoryBuilder
职责：根据配置信息构建 SqlSessionFactory
生命周期：方法级别（构建后即可丢弃）
关键方法：

SqlSessionFactory build(InputStream inputStream)

Configuration
核心作用：MyBatis 的"大脑"，包含所有配置信息，包括环境信息（数据源、事务管理器）、类型处理器注册表、插件拦截器链、Mapper 注册信息、MappedStatement 集合（key=namespace.id）
数据结构：

protected final Map<String, MappedStatement> mappedStatements;
protected final TypeHandlerRegistry typeHandlerRegistry;
protected final MapperRegistry mapperRegistry;

SqlSessionFactory
职责：创建 SqlSession 实例，默认实现：DefaultSqlSessionFactory
核心方法：

SqlSession openSession()
SqlSession openSession(boolean autoCommit)

SqlSession
职责：用户操作数据库的主要入口，默认实现：DefaultSqlSession
关键方法：

<T> T selectOne(String statement, Object parameter)
int insert(String statement, Object parameter)
void commit()
void rollback()
<T> T getMapper(Class<T> type)

Executor
职责：实际执行 SQL 操作的核心
实现类型：SimpleExecutor默认执行器（每次创建新 Statement）、ReuseExecutor重用预处理语句、BatchExecutor批处理执行器、CachingExecutor二级缓存装饰器。
执行流程：

public <E> List<E> query(MappedStatement ms, Object parameter, RowBounds rowBounds, ResultHandler resultHandler) {
   // 1. 获取BoundSql
   BoundSql boundSql = ms.getBoundSql(parameter);
   // 2. 创建缓存Key
   CacheKey key = createCacheKey(ms, parameter, rowBounds, boundSql);
   // 3. 执行查询
   return query(ms, parameter, rowBounds, resultHandler, key, boundSql);
 }

MappedStatement
职责：封装 SQL 语句的所有配置信息
关键属性：

private String id;                 // 如 "com.example.UserMapper.selectById"
 private SqlSource sqlSource;       // SQL源
 private SqlCommandType sqlCommandType; // SELECT|INSERT|UPDATE|DELETE
 private Class<?> resultType;       // 结果类型
 private List<ResultMap> resultMaps;// 结果映射

StatementHandler
职责：处理 JDBC Statement 操作
实现类：SimpleStatementHandler处理普通Statement、PreparedStatementHandler处理PreparedStatement（最常用）、CallableStatementHandler处理存储过程；
工作流程：准备 Statement→ 参数处理（ParameterHandler）→ 执行 SQL→ 结果集处理（ResultSetHandler）

TypeHandler
职责：Java类型 ⇄ JDBC类型转换
常见实现：StringTypeHandler、IntegerTypeHandler、DateTypeHandler、BooleanTypeHandler
自定义示例：

public class CustomDateHandler extends BaseTypeHandler<Date> {
   @Override
   public void setNonNullParameter(PreparedStatement ps, int i, Date parameter, JdbcType jdbcType) {
     ps.setString(i, new SimpleDateFormat("yyyy-MM-dd").format(parameter));
   }
   // 其他方法实现...
 }

MapperProxy
职责：Mapper接口的动态代理实现
实现机制：JDK动态代理
核心逻辑：

public Object invoke(Object proxy, Method method, Object[] args) {
   // 1. 解析Mapper接口方法
   // 2. 转换为MapperMethod
   // 3. 执行SqlSession对应方法
   return mapperMethod.execute(sqlSession, args);
 }

三、SQL 执行完整流程
入口：通过 SqlSessionFactory 创建 SqlSession
获取Mapper：sqlSession.getMapper(UserMapper.class) 返回 MapperProxy 代理
方法调用：调用 Mapper 方法触发 MapperProxy.invoke()
方法转换：MapperMethod 将接口方法转换为 SQL 操作
执行委派：SqlSession 委派给 Executor
语句处理：
Executor获取对应的MappedStatement`
创建 StatementHandler
调用 StatementHandler.prepare() 准备 Statement
参数处理：ParameterHandler 使用 TypeHandler 设置参数
执行SQL：StatementHandler.execute()
结果映射：ResultSetHandler 处理结果集并映射为 Java 对象
返回结果：结果通过调用链返回给调用方
四、关键设计模式应用
工厂模式：SqlSessionFactory 创建 SqlSession
代理模式：MapperProxy 代理 Mapper 接口
责任链模式：插件拦截器实现
模板方法模式：BaseExecutor 中的执行流程定义
装饰器模式：CachingExecutor 包装普通执行器
五、典型场景分析：查询操作

User user = sqlSession.selectOne("com.example.UserMapper.selectById", 1);
SqlSession 从 Configuration 获取 MappedStatement
创建 Executor（考虑二级缓存）
Executor 创建 StatementHandler（PreparedStatementHandler）
StatementHandler 使用 ParameterHandler 设置参数
通过 TypeHandler 将 Java int 转为 JDBC INTEGER
执行查询，返回 ResultSet
ResultSetHandler 将结果集映射为 User 对象
根据 resultType 或 resultMap 进行映射
使用 TypeHandler 进行字段类型转换
理解这些核心类及其协作关系，可以帮助开发者更好地掌握 MyBatis 的内部机制，高效排查问题，并进行深度定制开发。
