# Spring事务管理

Spring事务管理
一、概述
Spring事务管理是Spring框架的核心功能之一，它提供了声明式（@Transactional）和编程式（TransactionTemplate）两种事务管理方式，支持多种传播行为和隔离级别。本文将全面解析Spring事务的核心概念、使用方式、底层机制及常见问题。
二、Spring事务的核心概念
事务的四大特性（ACID）
•  原子性（Atomicity）：事务内的操作要么全部成功，要么全部失败回滚；
•  一致性（Consistency）：事务执行前后，数据状态保持一致（如金额总和不变）；
•  隔离性（Isolation）：多个事务并发执行时，互相不干扰；
•  持久性（Durability）：事务提交后，数据永久存储（即使系统崩溃）；
Spring 事务的两种管理方式
2.1 编程式事务：通过编写代码显式声明事务。

@Autowired
private PlatformTransactionManager transactionManager;

public void someMethod() {
    TransactionDefinition definition = new DefaultTransactionDefinition();
    TransactionStatus status = transactionManager.getTransaction(definition);
    
    try {
        // 业务逻辑代码
        transactionManager.commit(status);
    } catch (Exception e) {
        transactionManager.rollback(status);
        throw e;
    }
}

2.2 声明式事务（@Transactional）：通过注解配置，AOP 动态代理实现，推荐使用，代码侵入性低。
•  注解方式：

@Service
public class UserServiceImpl implements UserService {
    
    @Autowired
    private UserDao userDao;
    
    @Transactional
    public void createUser(User user) {
        userDao.save(user);
    }
    
    @Transactional(propagation = Propagation.REQUIRED, 
                   isolation = Isolation.READ_COMMITTED,
                   timeout = 30,
                   rollbackFor = Exception.class)
    public void updateUser(User user) {
        userDao.update(user);
    }
}
•  xml配置方式：

<!-- 配置事务管理器 -->
<bean id="transactionManager" class="org.springframework.jdbc.datasource.DataSourceTransactionManager">
    <property name="dataSource" ref="dataSource"/>
</bean>

<!-- 配置事务通知 -->
<tx:advice id="txAdvice" transaction-manager="transactionManager">
    <tx:attributes>
        <tx:method name="save*" propagation="REQUIRED"/>
        <tx:method name="update*" propagation="REQUIRED"/>
        <tx:method name="delete*" propagation="REQUIRED"/>
        <tx:method name="get*" read-only="true"/>
        <tx:method name="*" propagation="SUPPORTS" read-only="true"/>
    </tx:attributes>
</tx:advice>

<!-- 配置AOP -->
<aop:config>
    <aop:pointcut id="serviceOperation" expression="execution(* com.example.service.*.*(..))"/>
    <aop:advisor advice-ref="txAdvice" pointcut-ref="serviceOperation"/>
</aop:config>

生效条件：
•  方法必须是public（非private/protected）。
•  调用方必须通过Spring代理对象（直接new调用不生效）。
•  默认仅对RuntimeException和Error回滚。

4. 事务注解参数
•  propagation：事务传播行为，如@Transactional(propagation = Propagation.REQUIRES_NEW)；
•  isolation：事务隔离级别，如@Transactional(isolation = Isolation.READ_COMMITTED)；
•  timeout：事务超时时间（秒），如@Transactional(timeout = 5)；
•  rollbackFor：指定回滚的异常类型，如@Transactional(rollbackFor = SQLException.class)；
•  noRollbackFor：指定不回滚的异常类型，如@Transactional(noRollbackFor = NullPointerException.class)；
事务传播行为（Propagation）
Spring 定义了 7 种传播行为，控制事务如何嵌套或共存：
•  REQUIRED（默认）：如果当前有事务，则加入；否则新建一个，适用于大多数业务方法；
•  REQUIRES_NEW：新建事务，挂起当前事务（如果存在），独立于外层事务，各层回滚互不影响，适用于日志记录、独立事务操作；
•  SUPPORTS：当前有事务则加入，没有则以非事务运行，适用于查询方法；
•  NOT_SUPPORTED：以非事务方式执行，挂起当前事务（如果存在），适用于异步任务；
•  MANDATORY：必须在事务中调用，否则抛出异常，适用于强制要求事务的方法；
•  NEVER：必须在非事务环境下执行，否则抛出异常，适用于禁止事务的方法；
•  NESTED：嵌套事务（依赖SavePoint机制，需要底层数据库支持），不挂起当前事务，子事务回滚不影响外层事务，外层事务回滚子事务需要级联回滚，适用于复杂业务逻辑，部分回滚；
示例：

@Transactional(propagation = Propagation.REQUIRES_NEW)
public void logOperation() {
   // 独立事务，即使外层事务回滚，日志仍会记录
}

6. 事务隔离级别（Isolation）
Spring 支持标准 SQL 的 4 种隔离级别：
•  DEFAULT：使用底层数据库默认级别；
•  READ_UNCOMMITTED：读取未提交数据，存在脏读、不可重复读、幻读
•  READ_COMMITTED：读取已提交数据，存在不可重复读、幻读
•  REPEATABLE_READ：可重复读（MySQL 默认），存在幻读
•  SERIALIZABLE：串行化（最高隔离级别），存在性能低；
示例：

@Transactional(isolation = Isolation.READ_COMMITTED)
public void updateBalance() {
   // 避免脏读
}

三、Spring 事务的底层实现
1. 动态代理机制
•  JDK 动态代理：基于接口（默认）。
•  CGLIB 代理：基于类（需配置 proxyTargetClass=true）。
事务管理器（PlatformTransactionManager）
Spring通过DataSourceTransactionManager（JDBC）、JpaTransactionManager（JPA）、JtaTransactionManager（分布式事务）等实现事务管理。

事务执行流程
•  开启事务：调用 begin()。
•  执行业务逻辑。
•  提交/回滚：
•  成功 → commit()
•  异常 → rollback()
四、常见问题与解决方案
事务不生效的常见原因
•  方法非 public。
•  自调用（this.method()，未走代理）。
•  异常被捕获未抛出；
•  数据库引擎不支持事务（如 MyISAM）。
事务与锁的结合使用

@Transactional
public void deductStock(Long productId) {
   // 加悲观锁
   Product product = productDao.selectForUpdate(productId);
   if (product.getStock() > 0) {
       productDao.updateStock(productId, product.getStock() - 1);
   }
}

3. 多数据源事务管理
使用 @Transactional + @Transactional(transactionManager = "secondTxManager") 分别管理不同数据源的事务。
最佳实践
•  尽量使用声明式事务（@Transactional），减少代码侵入。
•  避免大事务：长事务会占用连接池，影响性能。
•  明确指定rollbackFor：防止异常被吞导致数据不一致。
•  合理选择传播行为：避免嵌套事务导致死锁。
•  结合@Async 时注意事务边界：异步方法默认不继承事务。
五、总结
Spring 事务通过@Transactional提供灵活的事务管理，支持多种传播行为和隔离级别。理解其底层机制（动态代理 + PlatformTransactionManager）能帮助排查问题。合理使用事务能保证数据一致性，但需注意性能影响。
