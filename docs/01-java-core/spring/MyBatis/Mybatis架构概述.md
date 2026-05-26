# Mybatis架构概述

Mybatis架构概述
一、概述
MyBatis是一款优秀的持久层框架，它消除了几乎所有的JDBC代码和参数的手动设置，同时通过XML或注解将SQL与Java代码解耦。
二、MyBatis整体架构分层
MyBatis框架整体设计可以分为接口层、数据处理层、框架支撑层、引导层。
接口层
接口层主要定义了与数据库交互的方式，分别是通过传统的MyBatis提供的API和通过使用Mapper接口的方式。
1.1 传统API方式
通过创建SqlSession对象，并使用封装的SqlSession接口进行数据库访问操作。这是传统的传递StaementId和参数给SqlSession对象，使用SqlSession对象完成和数据库的交互方式。

// 1. 获取SqlSession
SqlSession sqlSession = sqlSessionFactory.openSession();

try {
    // 2. 直接执行SQL
    User user = sqlSession.selectOne("com.example.mapper.UserMapper.selectById", 1);
    
    // 或使用动态生成的DAO
    UserMapper mapper = sqlSession.getMapper(UserMapper.class);
    User user = mapper.selectById(1);
} finally {
    sqlSession.close();
}
xml配置文件：

<mapper namespace="com.example.mapper.UserMapper">
    <!-- 这是实际被调用的定义 -->
    <select id="selectById" resultType="User">
        SELECT * FROM users WHERE id = #{id}
    </select>
</mapper>
特点：
·  需要手动管理SqlSession的生命周期；
·  通过字符串指定映射语句，但存在拼写错误的风险；
·  更灵活，但更繁琐；

1.2 Mapper接口方式（推荐）
MyBatis将XML配置文件中的每一个<mapper>节点抽象为一个Mapper接口，而这个接口中声明的方法跟<mapper>节点中的<select|update|delete|insert>节点项对应，节点的id属性值对应为Mapper接口的方法名，parameterType值表示Mapper对应方法的入参类型，而resuleMap只则对应了Mapper接口表示的返回值类型或者返回结果集的元素类型。

public interface UserMapper {
    @Select("SELECT * FROM users WHERE id = #{id}")
    User selectById(int id);
}

// 注入后直接使用
@Autowired
private UserMapper userMapper;

public User getUser(int id) {
    return userMapper.selectById(id);
}
底层原理：
·  根据MyBatis的配置规范配置好，通过XML配置映射关系或直接使用注解绑定SQL；
·  通过SqlSession.getMapper(XXXMapper.class)方法，MyBatis会根据相应的接口声明的方法信息，通过动态代理机制生成一个Mapper实例；
·  我们使用Mapper接口的某一个方法时，MyBatis会根据这个方法的方法名和参数类型，确定StatementId；
·  底层还是通过SqlSession.select("statementId",parameterObject);或者SqlSession.update("statementId",parameterObject); 等等来实现对数据库的操作。
特点：
·  接口与XML/注解映射自动关联；
·  MyBatis动态生成实现类；
·  无需手动管理SqlSession，由Spring集成；
·  编译时检查安全；

数据处理层
数据处理层可以说是MyBatis的核心，主要完成两个功能，分别是通过传入参数构建动态SQL语句、SQL语句的执行以及封装查询结果集成。
2.1 参数映射和动态SQL语句生成
MyBatis通过传入的参数值，使用OGNL (Object-Graph Navigation Language) 来处理动态SQL中的参数��达式，构造完整的SQL语句。OGNL表达式示例：

<select id="findUsers" resultType="User">
    SELECT * FROM users 
    WHERE city = #{address.city}
    AND street LIKE '%${address.street}%'
</select>
OGNL表达式语言的功能特性在这里不展开了，后续可以使用单独章节进行补充。
2.2 SQL语句的执行以及封装查询结果集成List
动态SQL语句生成之后，MyBatis将执行SQL语句，并完成结果集的处理工作。工作处理流程：
·  SQL执行：执行动态生成的SQL语句；
·  结果集获取：从数据库获取ResultSet；
·  对象映射：将ResultSet转换为Java对象；
·  集合封装：最终返回List<E>；

MyBatis的结果集处理能力是其核心特性之一，特别是对复杂对象关系的处理，如对一对多和多对一关系的两种处理方式：
·  嵌套查询（Nesetd Select）：通过多次SQL查询完成关联关系的加载

<resultMap id="blogResultMap" type="Blog">
    <id property="id" column="id"/>
    <result property="title" column="title"/>
    <collection property="posts" ofType="Post" 
                select="selectPostsForBlog" column="id"/>
</resultMap>

<select id="selectBlog" resultMap="blogResultMap">
    SELECT * FROM blog WHERE id = #{id}
</select>

<select id="selectPostsForBlog" resultType="Post">
    SELECT * FROM post WHERE blog_id = #{blogId}
</select>
特点：执行完主查询后，对每条记录执行子查询，可能产生N+1查询问题，对延迟加载友好。
·  嵌套结果（Nested Results）：通过单次SQL查询和结果集映射完成关联关系的加载

<resultMap id="blogResult" type="Blog">
    <id property="id" column="blog_id"/>
    <result property="title" column="blog_title"/>
    <collection property="posts" ofType="Post" resultMap="postResult"/>
</resultMap>

<resultMap id="postResult" type="Post">
    <id property="id" column="post_id"/>
    <result property="subject" column="post_subject"/>
</resultMap>

<select id="selectBlogWithPosts" resultMap="blogResult">
    SELECT
        b.id as blog_id,
        b.title as blog_title,
        p.id as post_id,
        p.subject as post_subject
    FROM blog b
    LEFT JOIN post p ON b.id = p.blog_id
    WHERE b.id = #{id}
</select>
特点：通过单词SQL查询获取所有数据，需要处理结果集列名冲突，性能通常更好，避免了N+1问题，但不支持延迟加载。
针对复杂的查询，如多对一和一对多：
·  多对一：

<!-- 嵌套查询方式 -->
<resultMap id="postResult" type="Post">
    <association property="author" column="author_id" 
                javaType="Author" select="selectAuthor"/>
</resultMap>

<!-- 嵌套结果方式 -->
<resultMap id="postResult" type="Post">
    <association property="author" javaType="Author">
        <id property="id" column="author_id"/>
        <result property="name" column="author_name"/>
    </association>
</resultMap>
·  一对多：

<!-- 嵌套查询方式 -->
<resultMap id="blogResult" type="Blog">
    <collection property="posts" ofType="Post" 
               column="id" select="selectPostsForBlog"/>
</resultMap>

<!-- 嵌套结果方式 -->
<resultMap id="blogResult" type="Blog">
    <collection property="posts" ofType="Post">
        <id property="id" column="post_id"/>
        <result property="title" column="post_title"/>
    </collection>
</resultMap>

框架支撑层
框架支撑层主要涵盖了四个主要核心机制，包括事务管理机制、连接池管理机制、缓存机制、SQL语句的配置机制。
3.1 事务管理机制
事务管理机制对于ORM框架不可缺少的一部分，保证了数据一致性。
3.2 连接池管理机制
通过连接池设计，解决每次请求都重新创建一个数据库连接导致的资源开销大的问题，提升吞吐量；
3.3 缓存机制
为了提高数据利用率和减小服务器和数据库的压力，MyBatis 会对于一些查询提供会话级别的数据缓存，会将对某一次查询，放置到SqlSession 中，在允许的时间间隔内，对于完全相同的查询，MyBatis 会直接将缓存结果返回给用户，而不用再到数据库中查找。
3.4 SQL语句配置
传统的MyBatis 配置SQL 语句方式就是使用XML文件进行配置的，但是这种方式不能很好地支持面向接口编程的理念，为了支持面向接口的编程，MyBatis 引入了Mapper接口的概念，面向接口的引入，对使用注解来配置SQL 语句成为可能，用户只需要在接口上添加必要的注解即可，不用再去配置XML文件了，但是，目前的MyBatis 只是对注解配置SQL 语句提供了有限的支持，某些高级功能还是要依赖XML配置文件配置SQL 语句。
引导层
引导层指的是配置和启动MyBatis配置信息的方式。MyBatis 提供两种方式来引导MyBatis ：基于XML配置文件的方式和基于Java API 的方式。
三、MyBatis主要构件及其关联
核心构件
·  SqlSession：作为MyBatis工作的主要顶层API，表示和数据库交互的会话，完成必要数据库增删改查功能；
·  Executor：MyBatis执行器，是MyBatis 调度的核心，负责SQL语句的生成和查询缓存的维护；
·  StatementHandler：封装了JDBC Statement操作，负责对JDBC statement 的操作，如设置参数、将Statement结果集转换成List集合。
·  ParameterHandler：负责对用户传递的参数转换成JDBC Statement 所需要的参数；
·  ResultSetHandler：负责将JDBC返回的ResultSet结果集对象转换成List类型的集合；
·  TypeHandler：负责java数据类型和jdbc数据类型之间的映射和转换；
·  MappedStatement：MappedStatement维护了一条<select|update|delete|insert>节点的封装；
·  SqlSource：负责根据用户传递的parameterObject，动态地生成SQL语句，将信息封装到BoundSql对象中，并返回；
·  BoundSql：表示动态生成的SQL语句以及相应的参数信息；
·  Configuration：MyBatis所有的配置信息都维持在Configuration对象之中。

工作流程
2.1 初始化阶段
Configuration加载并解析所有配置信息：
·  解析mybatis-config.xml全局配置
·  加载所有mapper.xml文件
·  构建MappedStatement集合（每个<select>、<insert>、<update>或<delete>节点一个）
·  初始化TypeHandler注册表

2.2 SQL执行阶段
(1) SqlSession执行查询请求，交给Executor处理

// 用户调用入口
List<User> users = sqlSession.selectList("com.example.selectUsers", param);
(2) Executor调度处理
执行流程：
·  通过statementId从Configuration获取对应的MappedStatement
·  检查二级缓存（通过CachingExecutor装饰器）
·  通过MappedStatement获取SqlSource，返回BoundSql
·  创建处理器StatementHandler（根据语句类型）
(3) SqlSource生成BoundSql

public interface SqlSource {
   BoundSql getBoundSql(Object parameterObject);
}
工作过程：
·  解析动态标签（if/foreach等）
·  处理OGNL表达式
·  生成最终可执行SQL
·  返回包含SQL和参数的BoundSql对象
(4) StatementHandler准备语句
工作过程：
·  通过JDBC创建PreparedStatement
·  使用ParameterHandler设置参数：

parameterHandler.setParameters(ps);
·  ParameterHandler使用TypeHandler完成Java到JDBC类型转换
(5) StatementHandler执行
·  StatementHandler通过JDBC执行SQL，并得到返回结果ResultSet
·  StatementHandler将ResultSet交给ResultHandler处理；
(6) ResultHandler结果处理
工作流程：
·  读取ResultSet元数据
·  根据ResultMap创建目标对象
·  使用TypeHandler完成JDBC到Java类型转换
·  处理嵌套映射（association/collection）
·  返回组装好的结果对象给StatementHandler
·  StatementHandler将结果返回Executor，最后返回给SqlSession

2.3 缓存维护阶段
·  Executor维护一级缓存（SqlSession级别）
·  CachingExecutor维护二级缓存（Mapper级别）
