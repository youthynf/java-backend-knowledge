# Spring常用注解

Spring常用注解
Spring 框架提供了丰富的注解来简化开发，以下是 Spring 常用注解分类整理，涵盖 IoC、AOP、MVC、事务、测试等核心模块：
一、IoC（控制反转）与依赖注入
•  @Component：通用注解，标记类为 Spring Bean（需被扫描）。
•  @Controller：标记为 MVC 控制器（@Component 特化）。
•  @Service：标记业务层 Bean（@Component 特化）。
•  @Repository：标记数据访问层 Bean（@Component 特化，含异常转换）。
•  @Autowired：自动装配依赖（按类型，可配合 @Qualifier 指定名称）。
•  @Resource：JSR-250 标准注解，按名称装配（默认 byName，失败回退 byType）。
•  @Value：注入属性值（如 @Value("${app.name}")）。
•  @Configuration：标记类为配置类（替代 XML）。
•  @Bean：在配置类中定义 Bean（显式控制实例化逻辑）。
•  @Scope：定义 Bean 作用域（如 @Scope("prototype")）。
•  @Lazy：延迟初始化 Bean。
二、Spring MVC 注解
•  @RequestMapping：映射 HTTP 请求到方法（支持路径、方法、头等）。
•  @GetMapping：@RequestMapping(method = RequestMethod.GET) 简写。
•  @PostMapping：同上，用于 POST 请求。
•  @PathVariable：获取 URL 路径变量（如 /users/{id}）。
•  @RequestParam：获取请求参数（如 ?name=Alice）。
•  @RequestBody：解析请求体为对象（如 JSON → Java 对象）。
•  @ResponseBody：将方法返回值直接作为响应体（如返回 JSON）。
•  @RestController：@Controller + @ResponseBody 组合注解。
•  @ModelAttribute：绑定请求参数到模型对象（或预加载模型数据）。
•  @ExceptionHandler：处理控制器内的异常。
•  @CrossOrigin：允许跨域请求。
三、AOP（面向切面编程）
•  @Aspect：定义切面类。
•  @Before：在目标方法执行前执行。
•  @After：在目标方法执行后执行（无论是否异常）。
•  @AfterReturning：在目标方法成功返回后执行。
•  @AfterThrowing：在目标方法抛出异常后执行。
•  @Around：环绕通知（可控制目标方法执行）。
•  @Pointcut：定义切点表达式（复用切点）。
• @Advice：通用的通知类型，可以替代@Before、@After等；
四、事务管理
•  @Transactional：声明事务（可配置隔离级别、传播行为、超时等）。
•  @EnableTransactionManagement：启用注解驱动的事务管理（需在配置类上标注）。
五、测试相关
•  @SpringBootTest：标记 Spring Boot 集成测试类。
•  @Test：JUnit 测试方法。
•  @MockBean：注入 Mock 对象（替代真实 Bean）。
•  @DataJpaTest：仅测试 JPA 组件（自动配置内存数据库）。
•  @WebMvcTest：仅测试 MVC 控制器（不加载完整应用上下文）。
六、条件化配置
•  @Conditional：根据条件决定是否创建 Bean（需实现 Condition 接口）。
•  @Profile：根据环境激活配置（如 @Profile("dev")）。
•  @ConditionalOnProperty：根据配置文件属性决定是否生效（Spring Boot）。
七、Spring Boot 特有注解
•  @SpringBootApplication：主启动类注解（组合了 @Configuration + @EnableAutoConfiguration + @ComponentScan）。
•  @EnableAutoConfiguration：启用 Spring Boot 自动配置。
•  @ConfigurationProperties：绑定配置文件到 Java 对象（如 application.yml）。
八、其他实用注解
•  @Scheduled：定时任务（如 @Scheduled(fixedRate = 5000)）。
•  @Async：异步执行方法。
•  @Cacheable：缓存方法返回值。
•  @Valid：触发 JSR-303 参数校验（配合 @NotNull 等注解）。
九、总结
核心场景：
•  IoC 依赖注入：@Component, @Autowired, @Bean
•  MVC 开发：@RestController, @GetMapping, @RequestBody
•  事务管理：@Transactional
•  AOP：@Aspect, @Before
•  Spring Boot 简化：@SpringBootApplication, @ConfigurationProperties
