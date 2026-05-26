# MyBatis事务管理机制

MyBatis事务管理机制
一、概述
对数据库的事务而言，应该具有以下几点：创建（create）、提交（commit）、回滚（rollback）、关闭（close）。对应地，MyBatis将事务抽象成了Transaction接口：

public interface Transaction {
  Connection getConnection() throws SQLException;
  void commit() throws SQLException;
  void rollback() throws SQLException;
  void close() throws SQLException;
  Integer getTimeout() throws SQLException;
}
MyBatis的事务管理分为两种形式：
·  使用JDBC的事务管理机制：即利用java.sql.Connection对象完成对事务的提交（commit()）、回滚（rollback()）、关闭（close()）等，实现类为JdbcTransaction。
·  使用MANAGED的事务管理机制：这种机制MyBatis自身不会去实现事务管理，而是让程序的容器如（JBOSS，Weblogic）来实现对事务的管理，实现类为MangedTransaction。

二、核心接口
1. TransactionFactory

public interface TransactionFactory {
  default void setProperties(Properties props) { // 从 3.5.2 开始，该方法为默认方法
    // 空实现
  }
  Transaction newTransaction(Connection conn);
  Transaction newTransaction(DataSource dataSource, TransactionIsolationLevel level, boolean autoCommit);
}
2. Transaction

public interface Transaction {
  Connection getConnection() throws SQLException;
  void commit() throws SQLException;
  void rollback() throws SQLException;
  void close() throws SQLException;
  Integer getTimeout() throws SQLException;
}
使用这两个接口，你可以完全自定义 MyBatis 对事务的处理。
三、事务的配置
我们在使用MyBatis时，一般会在MyBatisXML配置文件中定义类似如下的信息：

<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE configuration
    PUBLIC "-//mybatis.org//DTD Config 3.0//EN"
    "http://mybatis.org/dtd/mybatis-3-config.dtd">

<configuration>
    <!-- 引入外部文件定义的属性，供此配置文件使用 -->
    <properties resource="jdbc.properties"></properties>

    <environments default="development">
        <environment id="development">
            <transactionManager type="JDBC"/>
            <dataSource type="POOLED">
                <property name="driver" value="${jdbc.driver}"/>
                <property name="url" value="${jdbc.url}"/>
                <property name="username" value="${jdbc.username}"/>
                <property name="password" value="${jdbc.password}"/>
            </dataSource>
        </environment>
    </environments>

    <mappers>
        <mapper resource="com/foo/bean/job/EmployeesMapper.xml"/>
    </mappers>
</configuration>
<environment>节点定义了连接某个数据库的信息，其子节点<transactionManager> 的type 会决定我们用什么类型的事务管理机制。
四、事务工厂TransactionFactory的创建
如果我们将<transactionManager>的type 配置为"JDBC",那么，在MyBatis初始化解析 <environment>节点时，会根据type="JDBC"创建一个JdbcTransactionFactory工厂，其源码如下：

/** 
 * 解析<transactionManager>节点，创建对应的TransactionFactory 
 * @param context 
 * @return 
 * @throws Exception 
 */  
private TransactionFactory transactionManagerElement(XNode context) throws Exception {  
    if (context != null) {  
        String type = context.getStringAttribute("type");  
        Properties props = context.getChildrenAsProperties();  
        /* 
         * 在Configuration初始化的时候，会通过以下语句，给JDBC和MANAGED对应的工厂类 
         * typeAliasRegistry.registerAlias("JDBC", JdbcTransactionFactory.class); 
         * typeAliasRegistry.registerAlias("MANAGED", ManagedTransactionFactory.class); 
         * 下述的resolveClass(type).newInstance()会创建对应的工厂实例 
         */  
        TransactionFactory factory = (TransactionFactory) resolveClass(type).newInstance();  
        factory.setProperties(props);  
        return factory;  
    }  
    throw new BuilderException("Environment declaration requires a TransactionFactory.");  
}
如上述代码所示，如果type="MANAGED"，则MyBatis会创建一个MangedTransactionFactory.class实例。
MyBatis对<transactionManager>节点的解析会生成TransactionFactory实例，而对<dataSource>解析会生成datasouce实例，然后两者作为输入创建一个Environment对象，代码如下所示：

private void environmentsElement(XNode context) throws Exception {  
    if (context != null) {  
        if (environment == null) {  
            environment = context.getStringAttribute("default");  
        }  
        for (XNode child : context.getChildren()) {  
            String id = child.getStringAttribute("id");  
            //是和默认的环境相同时，解析之  
            if (isSpecifiedEnvironment(id)) {  
                //1.解析<transactionManager>节点，决定创建什么类型的TransactionFactory  
                TransactionFactory txFactory = transactionManagerElement(child.evalNode("transactionManager"));  
                //2. 创建dataSource  
                DataSourceFactory dsFactory = dataSourceElement(child.evalNode("dataSource"));  
                DataSource dataSource = dsFactory.getDataSource();  
                //3. 使用了Environment内置的构造器Builder，传递id 事务工厂TransactionFactory和数据源DataSource  
                Environment.Builder environmentBuilder = new Environment.Builder(id)  
                .transactionFactory(txFactory)  
                .dataSource(dataSource);  
                configuration.setEnvironment(environmentBuilder.build());  
            }  
        }  
    }  
}
Environment表示着一个数据库的连接，生成后的Environment对象会被设置到Configuration实例中，以供后续的使用。
事务工厂Transaction定义了创建Transaction的两个方法：一个是通过指定的Connection对象创建Transaction，另外是通过数据源DataSource来创建Transaction。与JDBC 和MANAGED两种Transaction相对应，TransactionFactory有两个对应的实现的子类，分别是JdbcTransactionFactory和MangedTranslationFactory。
五、事务Transaction的创建
通过事务工厂TransactionFactory很容易获取到Transaction对象实例。我们以JdbcTransaction为例，看一下JdbcTransactionFactory是怎样生成JdbcTransaction的，代码如下：

public class JdbcTransactionFactory implements TransactionFactory {  
 
    public void setProperties(Properties props) {  
    }  
 
    /** 
     * 根据给定的数据库连接Connection创建Transaction 
     * @param conn Existing database connection 
     * @return 
     */  
    public Transaction newTransaction(Connection conn) {  
        return new JdbcTransaction(conn);  
    }  
 
    /** 
     * 根据DataSource、隔离级别和是否自动提交创建Transacion 
     * 
     * @param ds 
     * @param level Desired isolation level 
     * @param autoCommit Desired autocommit 
     * @return 
     */  
    public Transaction newTransaction(DataSource ds, TransactionIsolationLevel level, boolean autoCommit) {  
        return new JdbcTransaction(ds, level, autoCommit);  
    }  
}
如上所示，JdbcTransactionFactory会创建JDBC类型的Transaction，即JdbcTransaction。类似地，ManagedTransactionFactory也会创建ManagedTransaction。下面我们会分别深入JdbcTranaction 和ManagedTransaction，看它们到底是怎样实现事务管理的。
1. JdbcTransaction
JdbcTransaction直接使用JDBC的提交和回滚事务管理机制。它依赖与从dataSource中取得的连接connection 来管理transaction 的作用域，connection对象的获取被延迟到调用getConnection()方法。如果autocommit设置为on，开启状态的话，它会忽略commit和rollback。直观地讲，就是JdbcTransaction是使用的java.sql.Connection 上的commit和rollback功能，JdbcTransaction只是相当于对java.sql.Connection事务处理进行了一次包装（wrapper），Transaction的事务管理都是通过java.sql.Connection实现的。
2. MangedTransaction
ManagedTransaction让容器来管理事务Transaction的整个生命周期，意思就是说，使用ManagedTransaction的commit和rollback功能不会对事务有任何的影响，它什么都不会做，它将事务管理的权利移交给了容器来实现。
