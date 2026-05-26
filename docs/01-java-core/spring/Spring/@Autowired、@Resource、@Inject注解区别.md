# @Autowired、@Resource、@Inject注解区别

@Autowired、@Resource、@Inject注解区别
@Autowired和@Resource，以及@Inject都是Java中用于依赖注入的注解，但它们存在一些重要区别：
源码
•  @Autowired注解源码
在Spring2.5引入了@Autowired注解：

@Target({ElementType.CONSTRUCTOR, ElementType.METHOD, ElementType.PARAMETER, ElementType.FIELD, ElementType.ANNOTATION_TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface Autowired {
  boolean required() default true;
}

•  @Resource注解源码

@Target({TYPE, FIELD, METHOD})
@Retention(RUNTIME)
public @interface Resource {
    String name() default "";
    // 其他省略
}

•  @Inject注解源码

@Target({ METHOD, CONSTRUCTOR, FIELD })
@Retention(RUNTIME)
@Documented
public @interface Inject {}

2 来源不同
•  @Autowired是Spring框架提供的注解，通过AutowiredAnnotationBeanPostProcessor类实现的依赖注入；
•  @Resource是Java标准注解（JSR-250），属于javax.annotation包下；
•  @Inject是JSR330 (Dependency Injection for Java)中的规范，需要导入javax.inject.Inject jar包 ，才能实现注入。

注入方式
•  @Autowired默认按类型（byType）进行依赖注入；
•  @Resource默认按名称（byName）进行依赖注入；
•  @Inject根据类型进行依赖注入，需要按名称装配则配合使用@Named（类似@Qualifier）；

注入依赖校验
•  @Autowired支持required设置，默认=true，如果匹配不到bean，Spring会抛出NoSuchBeanDefinitionException，如果设置false，则保留字段为null而不报错；
•  @Resource默认按照名称查找，找不到bean则回退到类型查找，如果类型也找不到则抛出NoSuchBeanDefinitionException；支持通过name属性进行指定，此时如果找不到bean则直接抛出NoSuchBeanDefinitionException，不会回退到类型查找。

属性指定
•  @Autowired支持通过@Qualifier注解进行指定bean的名称进行注入；
•  @Resource支持通过name属性进行bean名称指定注入，此时找不到bean不会回退到类型查找；

作用位置
•  @Autowired可以作用在CONSTRUCT、METHOD、PARAMETER、FIELD、ANNOTATION_TYPE；
•  @Resource只可以作用在TYPE、METHOD、FIELD；
•  @Inject只作用在CONSTRUCT、METHOD、FIELD；

适用场景
•  @Autowired更符合Spring的设计理念，适用于完全基于Spring的项目；
•  @Resource比较适合需要跨框架或希望代码不依赖特定框架的项目；
•  当有多个不同类型的bean时，@Resource通过名称注入更直观，而@Autowired需要配合@Qualifier使用。
•  @Inject需要导入javax.inject.Inject包。
