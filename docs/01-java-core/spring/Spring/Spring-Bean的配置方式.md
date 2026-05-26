# Spring Bean的配置方式

Spring Bean的配置方式
一、概述
Spring提供了多种配置Bean的方式，主要分类三类：基于XML的配置（传统方式）、基于注解的配置（现代主流方式）、基于Java的配置（显式编程式）。
二、注入方式详解
基于XML的Bean配置实现
通过XML文件定义Bean及其依赖关系，适用于老项目或需要高度解耦的场景。
1.1 典型XML配置

<bean id="userService" class="com.example.UserServiceImpl">
    <property name="userDao" ref="userDao"/>
</bean>

<bean id="userDao" class="com.example.UserDaoImpl"/>
1.2 底层解析流程
•  XML文件读取：通过XmlBeanDefinitionReader读取配置文件，使用DOM/SAX解析XML文档；
•  BeanDefinition创建：

// 伪代码表示解析过程
BeanDefinitionBuilder builder = BeanDefinitionBuilder.rootBeanDefinition(UserServiceImpl.class);
builder.addPropertyReference("userDao", "userDao");
•  注册到容器：将BeanDefinition存入DefaultListableBeanFactory，维护beanDefinitionNames列表和beanDefinitionMap映射。
1.3 依赖注入实现
•  setter注入：底层通过JavaBeans规范调用setter方法

<property name="service" ref="userService"/>
•  构造器注入：通过反射调用匹配参数的构造器

<constructor-arg ref="userDao"/>

基于注解的Bean注入实现
通过注解自动扫描和装配Bean，减少显式配置。
2.1 核心注解
•  @Component/@Service/@Repository/@Controller：标识Bean
•  @Autowired：自动依赖注入
•  @Configuration+@Bean：Java配置类
2.2 底层实现流程
•  组件扫描(ComponentScan)：由ClassPathBeanDefinitionScanner实现，扫描指定包下的类，识别带有@Component等注解的类。

@ComponentScan("com.example")
public class AppConfig {}
•  Bean定义注册：解析为BeanDefinition对象，并注册到DefaultListableBeanFactory的beanDefinitionMap中；
•  依赖注入阶段：AutowiredAnnotationBeanPostProcessor处理@Autowired，通过反射机制(Field/Method Injection)完成注入。
2.3 注入方式实现

// Field注入
@Autowired
private UserService userService;

// 底层通过反射实现
field.set(beanInstance, dependency);

// 构造器注入
@Autowired
public MyController(UserService userService) {
    this.userService = userService;
}
// 优先选择构造器注入(Spring 4.3+可省略@Autowired)

基于Java的配置（显式编程式）
通过@Configuration和@Bean在Java类中显式定义Bean，适合需要精细控制的场景。
3.1 典型场景
•  第三方库组件的集成，如数据库连接池；
•  需要复诊初始化逻辑的Bean；

@Configuration
public class AppConfig {
    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplateBuilder()
            .setConnectTimeout(Duration.ofSeconds(5))
            .build();
    }

    @Bean
    public UserService userService(UserRepository userRepository) {
        return new UserService(userRepository);
    }
}
3.2 特点
•  优点：灵活、可编程控制、适合非Spring托管的类；
•  缺点：需要手动编写配置代码。
混合配置方式
实际项目中个常混合使用多种方式：
•  XML+注解：老项目迁移时常见；
•  Java配置+注解扫描：现代SpringBoot项目的标配。

@Configuration
@ImportResource("classpath:legacy-config.xml") // 导入 XML 配置
@ComponentScan("com.example")
public class HybridConfig {
    @Bean
    public MyBean myBean() {
        return new MyBean();
    }
}

三、基于注解与XML配置对比
不同点
•  实现机制：注解方式依赖运行时反射和后处理器（如@Autowired通过AutowiredAnnotationBeanPostProcessor解析）；XML方式通过静态配置文件（如applicationContext.xml）在容器启动时解析。
•  处理阶段：注解方式主要在 Bean 后处理阶段（如@PostConstruct、@PreDestroy通过InitDestroyAnnotationBeanPostProcessor处理），但部分注解（如@Component、@Service）在组件扫描阶段（容器初始化早期）就被识别；XML 方式在容器初始化阶段（如ClassPathXmlApplicationContext加载配置文件时）完成解析；
•  灵活性：注解方式修改需重新编译，XML方式可动态修改配置，无需重新编译；
•  可读性：注解方式代码内聚（如@RestController直接标注在类上），但可能分散在多个类中；注解方式配置集中在 XML 文件，但与代码分离，需跨文件查看；
•  性能影响：注解方式运行时反射确实有开销，但现代 JVM（如 HotSpot）会对反射进行优化（如反射调用缓存），实际影响较小。XML 方式启动时解析 XML 文件的开销较大，尤其在大型项目中。但容器启动后无额外性能损耗。

相同点
•  BeanDefinition对象：无论使用注解（如@Component）还是 XML 配置（如<bean id="userService" class="...">），最终都会被解析为BeanDefinition对象。这些BeanDefinition对象存储在同一个BeanDefinitionRegistry（如DefaultListableBeanFactory）中，确保两种配置方式的 Bean 可以互相依赖。
•  后处理器：两者都有各自的后处理器来处理注解或XML配置的依赖对象的注入。注解方式通过AutowiredAnnotationBeanPostProcessor处理@Autowired、@Resource等注解；通过CommonAnnotationBeanPostProcessor处理@PostConstruct、@PreDestroy等。XML 方式通过BeanPostProcessor的实现类（如InstantiationAwareBeanPostProcessor）处理 XML 中定义的依赖注入（如<property name="userDao" ref="userDao"/>）。两种方式的后处理器都注册到同一个BeanFactory中，遵循相同的生命周期回调机制。
•  依赖查找：依赖注入时，Spring 容器统一通过BeanFactory的方法（如getBean()）查找依赖对象。无论是注解的@Autowired还是 XML 的<property>，最终都由BeanFactory负责实例化和装配 Bean，保证依赖查找逻辑的一致性。
