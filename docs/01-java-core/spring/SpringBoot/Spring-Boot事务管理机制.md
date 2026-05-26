# Spring Boot事务管理机制

Spring Boot事务管理机制
一、概述
Spring Boot开启事务的方式与Spring本质上相同，都是基于Spring的事务管理机制，但Spring Boot通过自动配置（Auto-Configuration）进一步简化了事务的配置。
二、Spring Boot与Spring事务管理区别
Spring 中开启事务的方式
·  需要手动配置事务管理器（如DataSourceTransactionManager）并启用注解驱动的事务管理：

@Configuration
@EnableTransactionManagement // 启用事务注解支持
public class AppConfig {

    @Bean
    public PlatformTransactionManager transactionManager(DataSource dataSource) {
        return new DataSourceTransactionManager(dataSource); // JDBC 事务管理器
    }
}
·  使用时在方法或类上添加@Transactional 注解：

@Service
public class UserService {
    @Transactional // 声明式事务
    public void updateUser(User user) {
        // 数据库操作
    }
}

Spring Boot中开启事务的方式
2.1 Spring Boot自动配置了事务管理器，只需满足以下条件：
·  引入JDBC/JPA相关Starter（如 spring-boot-starter-data-jpa 或 spring-boot-starter-jdbc）。
·  在方法或类上直接使用@Transactional注解。

2.2 自动配置的核心逻辑
2.2.1 Spring Boot会根据依赖自动选择事务管理器：
·  如果使用JPA，配置JpaTransactionManager。
·  如果使用JDBC，配置DataSourceTransactionManager。
·  如果使用JTA（分布式事务），配置JtaTransactionManager。
2.2.2 默认已启用 @EnableTransactionManagement，无需手动配置。


@Service
public class OrderService {
    
    @Autowired
    private OrderRepository orderRepository;
    
    @Transactional // 直接使用，无需额外配置
    public void createOrder(Order order) {
        orderRepository.save(order);
    }
}

三、Spring Boot事务的进阶配置
修改事务管理器属性
可在application.properties中调整事务行为：

# 设置事务超时时间（秒）
spring.transaction.default-timeout=30
# 开启事务日志（调试用）
logging.level.org.springframework.transaction=DEBUG

配置多数据源事务管理器
需手动配置多个事务管理器，并通过@Transaction(value="txManager1")指定：

@Configuration
public class TransactionConfig {
    
    @Bean
    @Primary
    public PlatformTransactionManager txManager1(DataSource dataSource1) {
        return new DataSourceTransactionManager(dataSource1);
    }
    
    @Bean
    public PlatformTransactionManager txManager2(DataSource dataSource2) {
        return new DataSourceTransactionManager(dataSourceSource2);
    }
}

编程式事务
仍支持TransactionTemplate：

@Service
public class PaymentService {
    
    @Autowired
    private TransactionTemplate transactionTemplate;
    
    public void processPayment() {
        transactionTemplate.execute(status -> {
            // 事务代码
            return null;
        });
    }
}

四、总结
Spring Boot事务本质与Spring一致，均基于@Transactional和PlatformTransactionManager。
Spring Boot的优势在于自动配置，减少了模板代码。
复杂场景（如多数据源）仍需手动配置，但比传统Spring更简洁。
