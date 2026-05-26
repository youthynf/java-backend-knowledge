# SpringBoot常用注解

SpringBoot常用注解
核心注解：
@SpringBootApplication：通常标注在一个主启动类上，是一个注解组合。
·  @SpringBootConfiguration：标注当前类为SpringBoot的配置类；
·  @EnableAutoConfiguration：启动SpringBoot自动配置机制；
·  @CompontScan：自动扫描当前包及其子包下，所有标注了@Service，@Repository，@Controller，@Component注解的类，并自动注册到Spring容器中；
@RestController：标注为符合RESTful原则的控制器，返回值直接作为HTTP响应报文，等价于@ResponseBody+@Controller的组合；
@RquestMapping，@GetMappiing，@PostMapping：用于映射HTTP请求到控制器方法；
@Service，@Repository，@Controller，@Component：分别用于标注业务层、数据访问层和其他通用组件，使其被Spring管理；
@Autowired：实现自动注入依赖；
@Value：用于自动注入配置中的属性值；
@ConfigurationProperties：将配置文件中的一组属性绑定到一个Java Bean上；
@Profile：表明该类在一个特定的profile环境中才生效；
@Configuration：表明当前类是一个配置类，定义Bean；
@Bean：用于在配置类中修饰方法，该方法返回的对象由Spring IOC容器进行管理。
助记：一启动干活，就想偷懒去Rest，然后沉迷HTTP网络游戏，还买了控制器手柄，发现一个组件可以交友，因此注入了很多的心血，获取对方的属性，然后绑定在一个草人身上，没想到真的生效了，说明配置有效，最后发展了对象
