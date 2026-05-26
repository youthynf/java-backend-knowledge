# MyBatis的SqlSession执行流程

MyBatis的SqlSession执行流程
一、概述
正如其名，Sqlsession对应着一次数据库会话。由于数据库会话不是永久的，因此Sqlsession的生命周期也不应该是永久的，相反，在你每次访问数据库时都需要创建它（当然并不是说在Sqlsession里只能执行一次sql，你可以执行多次，当一旦关闭了Sqlsession就需要重新创建它）。
二、SqlSession的获取流程
流程概要
SqlSessionFactoryBuilder去读取mybatis的配置文件，然后build一个DefaultSqlSessionFactory；
当我们获取到SqlSessionFactory之后，就可以通过SqlSessionFactory去获取SqlSession对象。

SqlSessionFactory sessionFactory = null;  
String resource = "mybatis-conf.xml";  
try {
    //SqlSessionFactoryBuilder读取配置文件
   sessionFactory = new SqlSessionFactoryBuilder().build(Resources.getResourceAsReader(resource));
} catch (IOException e) {  
   e.printStackTrace();  
}    
//通过SqlSessionFactory获取SqlSession
SqlSession sqlSession = sessionFactory.openSession();

关键方法openSessionFromDataSource
实际创建SqlSession的地方是openSessionFromDataSource，其实现逻辑如下：

private SqlSession openSessionFromDataSource(
                ExecutorType execType, TransactionIsolationLevel level, boolean autoCommit) {  
 
    Connection connection = null;  
 
    try {  
 
        final Environment environment = configuration.getEnvironment();  
 
        final DataSource dataSource = getDataSourceFromEnvironment(environment);  
        
        // MyBatis对事务的处理相对简单，TransactionIsolationLevel中定义了几种隔离级别，
        // 并不支持内嵌事务这样较复杂的场景，同时由于其是持久层的缘故，
        // 所以真正在应用开发中会委托Spring来处理事务实现真正的与开发者隔离。
        // 分析事务的实现是个入口，借此可以了解不少JDBC规范方面的事情。
        TransactionFactory transactionFactory = getTransactionFactoryFromEnvironment(environment);  
 
        connection = dataSource.getConnection();  
 
        if (level != null) {  
            connection.setTransactionIsolation(level.getLevel());
        }  
 
        connection = wrapConnection(connection);  
 
        Transaction tx = transactionFactory.newTransaction(connection,autoCommit);  
 
        Executorexecutor = configuration.newExecutor(tx, execType);  
 
        return newDefaultSqlSession(configuration, executor, autoCommit);  
 
    } catch (Exceptione) {  
        closeConnection(connection);  
        throwExceptionFactory.wrapException("Error opening session.  Cause: " + e, e);  
    } finally {
        ErrorContext.instance().reset();
    }
}
创建SqlSession的一些主要步骤：
从配置中获取Environment；
从Environment中取得DataSource；
从Environment中取得TransactionFactory；
从DataSource里获取数据库连接对象Connection；
在取得的数据库连接上创建事务对象Transaction；
创建Executor对象（该对象非常重要，事实上sqlsession的所有操作都是通过它完成的）；
创建sqlsession对象。

三、SqlSession执行流程
查询操作流程（以selectOne为例）

Blog blog = sqlSession.selectOne("org.example.mapper.BlogMapper.selectById", 1);

1.1 查找MappedStatement：从Configuration中获取预解析的SQL信息

// DefaultSqlSession.java
MappedStatement ms = configuration.getMappedStatement(statement);

1.2 委托Executor执行

executor.query(ms, wrapCollection(parameter), RowBounds.DEFAULT, Executor.NO_RESULT_HANDLER);

1.3 Executor执行流程
创建Executor：

public Executor newExecutor(Transaction transaction, ExecutorType executorType) {  

    executorType = executorType == null ? defaultExecutorType : executorType;  

    executorType = executorType == null ?ExecutorType.SIMPLE : executorType;  

    Executor executor;  

    if(ExecutorType.BATCH == executorType) {
        executor = new BatchExecutor(this,transaction);
    } else if(ExecutorType.REUSE == executorType) {
        executor = new ReuseExecutor(this,transaction);  
    } else {  
        executor = newSimpleExecutor(this, transaction);
    }

    if (cacheEnabled) {
        executor = new CachingExecutor(executor);  
    }
    executor = (Executor) interceptorChain.pluginAll(executor);  
    return executor;  
}
获取Statement

// 如果是SimpleExecutor:每次创建新Statement
Statement stmt = prepareStatement(handler, ms.getStatementLog());

// 如果是ReuseExecutor:从缓存获取Statement
stmt = getStatement(sql); 

// ReuseExecutor.java
private final Map<String, Statement> statementMap = new HashMap<>();

public Statement prepareStatement(StatementHandler handler, Log statementLog) {
    Statement stmt;
    String sql = boundSql.getSql();
    if (hasStatementFor(sql)) {
        stmt = getStatement(sql); // 从缓存获取
        applyTransactionTimeout(stmt);
    } else {
        stmt = handler.prepare(connection, transaction.getTimeout()); // 新建
        putStatement(sql, stmt); // 放入缓存
    }
    return stmt;
}

1.4 创建StatementHandler

StatementHandler handler = configuration.newStatementHandler(executor, ms, parameter, rowBounds, resultHandler, boundSql);
实际创建的是RoutingStatementHandler，取决于StatementType路由；
包含ParameterHandler和ResultSetHandler实例

1.5 参数绑定：通过递归方式处理复杂参数，并使用TypeHandler进行类型转换

// DefaultParameterHandler
parameterHandler.setParameters(ps);

1.6 执行Sql

// PreparedStatementHandler
resultSet = stmt.executeQuery();

1.7 结果映射

// DefaultResultSetHandler
List<Object> results = new ArrayList<>();
while (rsw != null && resultMapCount > results.size()) {
    ResultMap resultMap = resultMaps.get(resultMapCount - 1);
    handleRowValues(rsw, resultMap, results, null);
}
处理嵌套映射、集合映射等复杂场景
使用MateObject进行属性发射操作

更新流程操作（insert/update/delete）
与查询类似，但存在以下区别：
调用executor.update()方法
不需要结果集处理
涉及事务控制：

// 自动提交判断
if (!transaction.isManaged() && autoCommit) {
    commit();
}

四、基于Mapper接口的SqlSession执行流程
Mapper接口使用示例：

BlogMapper mapper = session.getMapper(BlogMapper.class);
Blog blog = mapper.selectBlog(1); // 这里实际调用的是MapperProxy.invoke()

MapperProxy代理获取
在MyBatis中，通过MapperProxy动态代理咱们的dao， 也就是说， 当咱们执行自己写的dao里面的方法的时候，其实是对应的mapperProxy在代理。通过SqlSession从Configuration中获取，并在首次获取Mapper接口时触发创建：

// DefaultSqlSession.java
public <T> T getMapper(Class<T> type) {
    return configuration.getMapper(type, this);
}

// Configuration.java
public <T> T getMapper(Class<T> type, SqlSession sqlSession) {
    return mapperRegistry.getMapper(type, sqlSession);
}

// MapperRegistry.java
public <T> T getMapper(Class<T> type, SqlSession sqlSession) {
    final MapperProxyFactory<T> mapperProxyFactory = knownMappers.get(type);
    return mapperProxyFactory.newInstance(sqlSession);
}
关键点：
每个Mapper接口对应一个MapperProxyFactory
MapperProxyFactory在MyBatis启动时通过MapperRegistry.addmapper()注册

XMLConfigBuilder.parse()
→ mapperElement()
→ MapperRegistry.addMapper()
→ 创建MapperProxyFactory并缓存
最终由MapperProxyFactory创建

/**
  * 别人虐我千百遍，我待别人如初恋
  * @param mapperProxy
  * @return
  */
 @SuppressWarnings("unchecked")
 protected T newInstance(MapperProxy<T> mapperProxy) {
   //动态代理我们写的dao接口
   return (T) Proxy.newProxyInstance(mapperInterface.getClassLoader(), new Class[] { mapperInterface }, mapperProxy);
 }
 
 public T newInstance(SqlSession sqlSession) {
   final MapperProxy<T> mapperProxy = new MapperProxy<T>(sqlSession, mapperInterface, methodCache);
   return newInstance(mapperProxy);
 }

MapperProxy执行
我们知道对被代理对象的方法的访问都会落实到代理者的invoke上来，MapperProxy的invoke如下：

/**
   * MapperProxy在执行时会触发此方法
   */
  @Override
  public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
    if (Object.class.equals(method.getDeclaringClass())) {
      try {
        return method.invoke(this, args);
      } catch (Throwable t) {
        throw ExceptionUtil.unwrapThrowable(t);
      }
    }
    final MapperMethod mapperMethod = cachedMapperMethod(method);
    //二话不说，主要交给MapperMethod自己去管
    return mapperMethod.execute(sqlSession, args);
  }

MapperMethod就像是一个分发者，他根据参数和返回值类型选择不同的sqlsession方法来执行。这样mapper对象与sqlsession就真正的关联起来了。

/**
   * 看着代码不少，不过其实就是先判断CRUD类型，然后根据类型去选择到底执行sqlSession中的哪个方法，绕了一圈，又转回sqlSession了
   * @param sqlSession
   * @param args
   * @return
   */
  public Object execute(SqlSession sqlSession, Object[] args) {
    Object result;
    if (SqlCommandType.INSERT == command.getType()) {
      Object param = method.convertArgsToSqlCommandParam(args);
      result = rowCountResult(sqlSession.insert(command.getName(), param));
    } else if (SqlCommandType.UPDATE == command.getType()) {
      Object param = method.convertArgsToSqlCommandParam(args);
      result = rowCountResult(sqlSession.update(command.getName(), param));
    } else if (SqlCommandType.DELETE == command.getType()) {
      Object param = method.convertArgsToSqlCommandParam(args);
      result = rowCountResult(sqlSession.delete(command.getName(), param));
    } else if (SqlCommandType.SELECT == command.getType()) {
      if (method.returnsVoid() && method.hasResultHandler()) {
        executeWithResultHandler(sqlSession, args);
        result = null;
      } else if (method.returnsMany()) {
        result = executeForMany(sqlSession, args);
      } else if (method.returnsMap()) {
        result = executeForMap(sqlSession, args);
      } else {
        Object param = method.convertArgsToSqlCommandParam(args);
        result = sqlSession.selectOne(command.getName(), param);
      }
    } else {
      throw new BindingException("Unknown execution method for: " + command.getName());
    }
    if (result == null && method.getReturnType().isPrimitive() && !method.returnsVoid()) {
      throw new BindingException("Mapper method '" + command.getName() 
          + " attempted to return null from a method with a primitive return type (" + method.getReturnType() + ").");
    }
    return result;
  }

最终的请求又回到SqlSession了，这里的处理逻辑就与上面的SqlSession执行过程一致，不再重复叙述了。

public <E> List<E> selectList(String statement, Object parameter, RowBounds rowBounds) {
    try {
      MappedStatement ms = configuration.getMappedStatement(statement);
      //CRUD实际上是交给Excetor去处理， excutor其实也只是穿了个马甲而已，小样，别以为穿个马甲我就不认识你嘞！
      return executor.query(ms, wrapCollection(parameter), rowBounds, Executor.NO_RESULT_HANDLER);
    } catch (Exception e) {
      throw ExceptionFactory.wrapException("Error querying database.  Cause: " + e, e);
    } finally {
      ErrorContext.instance().reset();
    }
  }

以上是SqlSession执行过程的源码分析全部内容。
