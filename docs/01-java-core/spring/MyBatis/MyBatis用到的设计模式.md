# MyBatis用到的设计模式

MyBatis用到的设计模式
一、创建型模式
工厂方法模式（Factory Method）
应用场景：SqlSessionFactory创建SqlSession

public interface SqlSessionFactory {
    SqlSession openSession();
    // 其他重载方法...
}
实现类：DefaultSqlSessionFactory
作用：将SqlSession的创建逻辑封装，便于扩展不同的SqlSession实现
建造者模式（Builder）
应用场景：XMLConfigBuilder构建Configuration对象

XMLConfigBuilder parser = new XMLConfigBuilder(inputStream);
Configuration config = parser.parse();
特点：通过多步构建过程创建复杂配置对象
二、结构型模式
装饰器模式（Decorator）
典型应用：CachingExecutor装饰普通Executor

public class CachingExecutor implements Executor {
    private final Executor delegate;
    // 通过装饰添加缓存功能
}
作用：在不修改原有执行器的基础上增加缓存能力
代理模式（Proxy）
动态代理应用：Mapper接口代理

UserMapper userMapper = sqlSession.getMapper(UserMapper.class);
实现机制：通过JDK动态代理或CGLIB生成Mapper接口的实现类
三、行为型模式
模板方法模式（Template Method）
应用场景：BaseExecutor中的查询流程

public abstract class BaseExecutor implements Executor {
    // 定义查询模板
    public <E> List<E> query(...) {
        // 公共处理逻辑
        list = doQuery(...); // 抽象方法
        // 后续处理
    }
    protected abstract <E> List<E> doQuery(...);
}

责任链模式（Chain of Responsibility）
应用场景：插件拦截器链

public class Plugin implements InvocationHandler {
    private final Object target;
    private final InterceptorChain interceptorChain;
}
执行流程：多个插件按配置顺序形成处理链
四、其他重要模式
组合模式（Composite）
应用场景：SQL节点树解析

<select id="selectUser">
    SELECT * FROM user 
    <where>
        <if test="name != null">AND name = #{name}</if>
        <if test="age != null">AND age = #{age}</if>
    </where>
</select>
实现类：MixedSqlNode、IfSqlNode等组成树形结构
策略模式（Strategy）
应用场景：缓存淘汰策略

public interface Cache {
    void putObject(Object key, Object value);
    // 不同实现类提供不同策略
}
实现类：LruCache、FifoCache等
