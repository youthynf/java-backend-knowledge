# MyBatis初始化详解

MyBatis初始化详解
一、概述
MyBatis的初始化过程是其整个生命周期中最关键的阶段，这个过程将静态的XML配置和Java代码转化为可执行的数据库操作组件。
二、初始化的方式
MyBatis提供了多种初始化方式，适应不同的应用场景和开发需求。按大类区分可以分为基于XML配置文件的初始化（传统方式）和基于纯Java API的初始化方式。
基于XML配置的初始化流程
基于XML配置的初始化是最经典的初始化方式，支持所有MyBatis的配置选项，配置集中管理，方便维护。

// 1. 加载配置文件
String resource = "mybatis-config.xml";
InputStream inputStream = Resources.getResourceAsStream(resource);

// 2. 构建SqlSessionFactory
SqlSessionFactory sqlSessionFactory = 
    new SqlSessionFactoryBuilder().build(inputStream);

// 3. 创建SqlSession
SqlSession session = sqlSessionFactory.openSession();
多环境配置初始化：

<!-- mybatis-config.xml -->
<environments default="development">
    <environment id="development">
        <!-- 开发环境配置 -->
    </environment>
    <environment id="production">
        <!-- 生产环境配置 -->
    </environment>
</environments>
指定环境初始化：

// 指定环境初始化
SqlSessionFactory factory = new SqlSessionFactoryBuilder()
    .build(inputStream, "production");

纯Java API初始化方式
该方式适用于需要动态配置的场景，以及希望与其他框架集成时使用。无需使用XML配置。

// 创建数据源
DataSource dataSource = new PooledDataSource(
    "com.mysql.jdbc.Driver", "jdbc:mysql://localhost:3306/test", "user", "pwd");

// 配置事务
TransactionFactory transactionFactory = new JdbcTransactionFactory();

// 构建环境
Environment environment = new Environment("dev", transactionFactory, dataSource);

// 创建配置
Configuration configuration = new Configuration(environment);
configuration.addMapper(UserMapper.class);

// 构建工厂
SqlSessionFactory sqlSessionFactory = 
    new SqlSessionFactoryBuilder().build(configuration);

混合配置方式

// 先加载XML配置
SqlSessionFactory factory = new SqlSessionFactoryBuilder()
    .build(Resources.getResourceAsStream("mybatis-config.xml"));

// 获取Configuration对象动态修改
Configuration configuration = factory.getConfiguration();
configuration.addMapper(AnotherMapper.class);
configuration.setCacheEnabled(false);

三、MyBatis初始化的基本过程
MyBatis初始化SqlSessionFactoryBuilder根据传入的数据流生成Configuration对象，然后根据Configuration对象创建默认的SqlSessionFactory对象。其过程要经过以下几个简单步骤：
·  调用SqlSessionFactoryBuilder对象的build(inputStream)方法；
·  SqlSessionFactoryBuilder会根据输入流inputStream等信息创建XMLConfigBuilder对象;
·  SqlSessionFactoryBuilder调用XMLConfigBuilder对象的parse()方法；
·  XMLConfigBuilder对象返回Configuration对象；
·  SqlSessionFactoryBuilder根据Configuration对象创建一个DefaultSessionFactory对象；
·  SqlSessionFactoryBuilder返回 DefaultSessionFactory对象给Client，供Client使用。

SqlSessionFactoryBuilder处理逻辑

public SqlSessionFactory build(InputStream inputStream)  {  
    return build(inputStream, null, null);  
}  

public SqlSessionFactory build(InputStream inputStream, String environment, Properties properties)  {  
    try  {  
        //2. 创建XMLConfigBuilder对象用来解析XML配置文件，生成Configuration对象  
        XMLConfigBuilder parser = new XMLConfigBuilder(inputStream, environment, properties);  
        //3. 将XML配置文件内的信息解析成Java对象Configuration对象  
        Configuration config = parser.parse();  
        //4. 根据Configuration对象创建出SqlSessionFactory对象  
        return build(config);  
    } catch (Exception e) {  
        throw ExceptionFactory.wrapException("Error building SqlSession.", e);  
    } finally {  
        ErrorContext.instance().reset();  
        try {  
            inputStream.close();  
        } catch (IOException e) {  
            // Intentionally ignore. Prefer previous error.  
        }  
    }
}

// 从此处可以看出，MyBatis内部通过Configuration对象来创建SqlSessionFactory
// 用户也可以自己通过API构造好Configuration对象，调用此方法创SqlSessionFactory  
public SqlSessionFactory build(Configuration config) {  
    return new DefaultSqlSessionFactory(config);  
}
通过上述代码分析，初始化过程涉及到以下几个对象：
·  SqlSessionFactoryBuilder：SqlSessionFactory的构造器，用于创建SqlSessionFactory，采用了Builder设计模式；
·  Configuration：该对象是mybatis-config.xml文件中所有mybatis配置信息；
·  SqlSessionFactory：SqlSession工厂类，以工厂形式创建SqlSession对象，采用了Factory工厂设计模式；
·  XmlConfigParser：负责将mybatis-config.xml配置文件解析成Configuration对象，供SqlSessonFactoryBuilder使用，创建SqlSessionFactory；

Configuration对象的处理过程
由上可知MyBatis所有配置信息最终被包含在Configuration对象中，并被用于构建SqlSessionFactory，最终创建SqlSession对象。当SqlSessionFactoryBuilder执行build()方法，调用了XMLConfigBuilder的parse()方法，然后返回了Configuration对象。那么parse()方法是如何处理XML文件，生成Configuration对象的呢？
·  通过new XMLConfigBuilder(inputStream, environment, properties)创建XMLCOnfigBuilder对象；
·  XMLCOnfigBuilder将MyBatis的XML配置定义文件dtd加载成XMLMapperEntityResourlver对象；
·  XMLCOnfigBuilder将mybatis-config.xml以及mapper配置文件转成对应的Document对象；
·  XMLCOnfigBuilder将Document对象与XMLMapperEntityResourlver对象组成XPathParser对象;
·  XMLCOnfigBuilder通过new Configuration()创建Configuration；
·  通过调用XMLConfigBuilder调用parse()方法，底层通过XPathParse解析XML配置，得到XNode对象；
·  遍历XNode的节点，将这些值解析出来设置到Configuration对象中；
·  返回Configuration对象。

以上为MyBatis初始化的全部内容。
