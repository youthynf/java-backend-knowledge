# Spring Bean的生命周期

Spring Bean的生命周期
一、概述
Spring只帮我们管理单例模式Bean的完整生命周期，对于prototype的bean，Spring在创建好交给使用者之后则不会再管理后续的生命周期。在Spring中，Bean的生命周期是一个很复杂的执行过程，我们可以利用Spring提供的方法定制Bean的创建过程。Spring Bean的生命周期可以分为容器级阶段和Bean级阶段，涵盖从容器启动到Bean实例化、初始化、使用和销毁的全过程。
二、详细阶段描述
阶段一：容器级阶段（Bean实例化之前）
Bean定义加载：加载定义Bean
读取配置（XML/注解/Java配置）并解析为BeanDefinition，由Spring内部完成。
BeanDefinitionRegistryPostProcessor干预：注册Bean定义
支持动态注册/修改BeanDefinition（比BeanFactoryPostProcessor更早执行），如Mybatis的MapperScannerConfigurer扫描接口生成Bean定义、SpringBoot的条件装配动态注册Bean等。

@Component
public class MyRegistryPostProcessor implements BeanDefinitionRegistryPostProcessor {
    @Override
    public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) {
        // 动态注册新Bean定义
        registry.registerBeanDefinition("dynamicBean", new RootBeanDefinition(DynamicBean.class));
    }
}

BeanFactoryPostProcessor干预：修改已存在的Bean定义
用于修改已存在的BeanDefinition，如修改属性值、作用域等。

@Component
public class MyBeanFactoryPostProcessor implements BeanFactoryPostProcessor {
    @Override
    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) {
        BeanDefinition bd = beanFactory.getBeanDefinition("myBean");
        bd.setScope(ConfigurableBeanFactory.SCOPE_PROTOTYPE); // 修改为原型作用域
    }
}

阶段二：Bean实例化阶段
InstantiationAwareBeanPostProcessor前置处理：实例化Bean之前
用于在Bean实例化前拦截，可返回代理对象替代真实实例，如Spring AOP的代理创建AbstractAutoProxyCreator、跳过某些Bean的默认实例化逻辑等。

@Component
public class MyInstantiationProcessor implements InstantiationAwareBeanPostProcessor {
    @Override
    public Object postProcessBeforeInstantiation(Class<?> beanClass, String beanName) {
        if (beanName.equals("myService")) {
            return Proxy.newProxyInstance(...); // 返回代理对象
        }
        return null; // 返回null则继续正常实例化
    }
}

实例化Bean：实例化Bean
通过构造函数或工厂方法创建实例，此时依赖尚未注入，属性为null。
阶段三：依赖注入阶段
InstantiationAwareBeanPostProcessor属性处理：实例化之后
Bean实例化之后，属性注入之前调用postProcessAfterInstantiation()，方法返回true则继续后续属性注入流程，否则跳过当前Bean的所有属性注入。

@Override
public boolean postProcessAfterInstantiation(Object bean, String beanName) {
    if (bean instanceof SpecialBean) {
        // 手动设置属性，跳过Spring的自动注入
        ((SpecialBean) bean).setSpecialProperty("manual-value");
        return false; // 阻止后续所有属性注入
    }
    return true; // 允许正常注入
}
当postProcessAfterInstantiation()返回true后，在属性注入之前会调用postProcessorProperties()方法，用于处理注解驱动的注入，如@Autowaired、@Value，也可以修改或完全替换要注入的属性值。

@Override
public PropertyValues postProcessProperties(PropertyValues pvs, Object bean, String beanName) {
    if (bean instanceof ConfigurableBean) {
        // 修改属性值
        MutablePropertyValues mpvs = (MutablePropertyValues) pvs;
        mpvs.add("timeout", 5000); // 覆盖原有配置
    }
    return pvs;
}

应用属性注入：依赖注入
只有当前面所有的处理器都允许注入时才会执行，注入@Autowired、@Resource、XML中定义的属性。

public class ExampleBean {
    @Value("${default.value}")
    private String value;
    
    @Autowired
    private DependencyService service;
}

// 处理器执行顺序：
1. InstantiationAwareBeanPostProcessorA.postProcessAfterInstantiation()
   → 返回true，继续注入流程
   
2. InstantiationAwareBeanPostProcessorA.postProcessProperties()
   → 解析@Value注解，准备属性值
   
3. Spring应用属性注入
   → 通过反射设置value字段
   → 注入DependencyService实例

Aware接口调用（按顺序）：调用Aware接口
用于让Bean感知容器组件。
·  BeanNameAware → 设置 Bean 名称
·  BeanClassLoaderAware → 设置类加载器
·  BeanFactoryAware → 设置 BeanFactory
·  EnvironmentAware、ResourceLoaderAware、ApplicationEventPublisherAware
·  ApplicationContextAware（最后调用）

@Component
public class MyBean implements ApplicationContextAware {
    @Override
    public void setApplicationContext(ApplicationContext ctx) {
        // 获取ApplicationContext
    }
}

BeanPostProcessor 前置处理：初始化前
用于在初始化前对Bean进行增强。典型应用是通过@PostConstruct注解处理、Spring AOP的代理包装等。

@Override
public Object postProcessBeforeInitialization(Object bean, String beanName) {
    if (bean instanceof MyBean) {
        // 对Bean进行修改
    }
    return bean;
}

初始化方法调用（按顺序）：初始化
·  @PostConstruct 注解方法
·  InitializingBean.afterPropertiesSet()
·  自定义 init-method（XML 或 @Bean(initMethod = "init")）

@Component
public class MyBean {
   @PostConstruct
   public void init() {
       // 初始化逻辑
   }
}

11. BeanPostProcessor 后置处理：初始化后
在初始化后对 Bean 进行最终处理，如AOP代理的最终生成（如 AbstractAutoProxyCreator）

@Override
public Object postProcessAfterInitialization(Object bean, String beanName) {
   if (bean instanceof MyBean) {
       return Enhancer.create(...); // 生成代理
   }
   return bean;
}

阶段四：使用阶段：使用
Bean 完全初始化，可被其他组件依赖或通过 ApplicationContext.getBean() 获取
阶段五：销毁阶段
12. 销毁方法调用（按顺序）：销毁
·  @PreDestroy 注解方法
·  DisposableBean.destroy()
·  自定义 destroy-method（XML 或 @Bean(destroyMethod = "cleanup")）

@Component
public class MyBean {
   @PreDestroy
   public void cleanup() {
       // 释放资源
   }
}
