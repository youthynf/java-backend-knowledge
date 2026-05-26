# Spring Bean的注入方式

Spring Bean的注入方式
Spring 框架提供了多种依赖注入方式，主要包括以下几种：
构造器注入（Constructor Injection）
通过构造方法接收依赖对象，确保对象创建时依赖已完全初始化。
•  优点：依赖关系明确，对象创建后即可使用，避免了 NullPointerException。
•  适用场景：强制依赖、不可变对象。

public class UserService {
   private final UserRepository userRepository;
   
   // 构造器注入（Spring 4.3+ 可省略@Autowired）
   @Autowired
   public UserService(UserRepository userRepository) {
       this.userRepository = userRepository;
   }
}
在Spring4.x版本中推荐的注入方式就是这种。因为这个构造器注入的方式能够保证注入的组件不可变，并且确保需要的依赖不为空。此外，构造器注入的依赖总是能够在返回客户端（组件）代码的时候保证完全初始化的状态。

2. Setter 注入（Setter Injection）
通过 setter 方法注入依赖对象，允许对象创建后动态修改依赖。
•  优点：可选依赖更灵活，支持 XML 配置。
•  缺点：可能导致对象状态不一致，如调用方法前依赖未注入；调用时可能才发现循环依赖问题，如果是构造器则启动时提示。

public class UserService {
   private UserRepository userRepository;

   // Setter注入
   @Autowired
   public void setUserRepository(UserRepository userRepository) {
       this.userRepository = userRepository;
   }
}

3. 字段注入（Field Injection）
通过 @Autowired 直接标记在字段上，无需构造器或 setter 方法。
•  优点：代码简洁，适合测试场景。
•  缺点：依赖关系不明确，难以实现不可变对象，单元测试时需反射注入。

public class UserService {
   // 字段注入
   @Autowired
   private UserRepository userRepository;
}

4. 接口注入（Interface Injection）
通过实现特定接口暴露注入点，由容器通过接口方法注入依赖。
•  特点：侵入性强，需实现 Spring 特定接口，已逐渐被淘汰。
方法注入（Method Injection）
通过任意方法注入依赖，不限于 setter 方法。
•  适用场景：初始化逻辑复杂的依赖。

public class UserService {
   private UserRepository userRepository;

   // 任意方法注入
   @Autowired
   public void initUserRepository(UserRepository userRepository) {
       this.userRepository = userRepository;
   }
}

6. 注解驱动注入（Annotation-based Injection）
使用@Resource（JSR-250）、@Inject（JSR-330）等注解替代@Autowired。
区别：
•  @Resource：按名称注入，支持name和type属性。
•  @Inject：功能与@Autowired类似，但需引入 javax.inject 包。

public class UserService {
   @Resource(name = "userRepositoryImpl")
   private UserRepository userRepository;
}

7. XML 配置注入
通过 Spring 配置文件（如 applicationContext.xml）声明依赖关系。

<bean id="userService" class="com.example.UserService">
   <!-- 构造器注入 -->
   <constructor-arg ref="userRepository" />
   <!-- 或Setter注入 -->
   <property name="userRepository" ref="userRepository" />
</bean>

最佳实践
•  优先使用构造器注入：强制依赖关系，确保对象不变性。
•  避免字段注入：不利于测试和依赖管理。
•  使用注解驱动：简化配置，减少 XML 样板代码。
•  结合 @Qualifier：解决多 Bean 匹配问题。
