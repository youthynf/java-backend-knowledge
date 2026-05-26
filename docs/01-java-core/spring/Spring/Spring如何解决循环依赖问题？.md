# Spring如何解决循环依赖问题？

Spring如何解决循环依赖问题？
一、什么是循环依赖？
Spring的循环依赖是指两个或多个Bean相互依赖，形成环形依赖问题。例如，BeanA依赖BeanB，同时BeanB又依赖BeanA，最终导致两个对象都无法完成初始化的问题。
二、Spring中三种产生循环依赖的情况：
通过构造方法进行依赖注入时产生的循环依赖问题；
通过setter方法进行依赖注入，且是原型（多例）模式下产生的循环依赖问题；
通过setter方法进行依赖注入，且是单例模式下产生的循环依赖问题；
三、Spring解决单例的循环依赖问题
Spring只是解决了单例模式下属性依赖的循环依赖问题，为了解决单例的循环依赖问题，使用了三级缓存：
•  第一层缓存（singletonObjects）：单例对象缓存池，已经实例化并且属性赋值，这里的对象是成熟对象。
这是一个ConcurrentHashMap，用于存放完全初始化好的单例 Bean。键是Bean的名称，值是对应的Bean实例。当一个Bean完成了属性注入和初始化方法（如init - method）的调用后，就会被放入这个缓存中。
•  第二层缓存（earlySingletonObjects）：单例对象缓存池，已经实例化，但尚未属性赋值，这里的对象是半成品对象。
也是一个ConcurrentHashMap。这个缓存存放的是早期创建的单例Bean，这些Bean还没有完成属性注入和初始化。在 Bean 的创建过程中，当通过构造函数创建了一个Bean实例后，就会将这个实例放入二级缓存，目的是为了在出现循环依赖时，能够将这个还未完全初始化的Bean暴露给其他依赖它的Bean。
•  第三层缓存（singletonFactories）：单例工厂的缓存。
同样是ConcurrentHashMap。它存放的是一个ObjectFactory对象，这个对象用于创建Bean。在创建Bean时，如果发现存在循环依赖的可能，就会将一个ObjectFactory放入三级缓存。ObjectFactory是一个函数式接口，它的getObject方法可以返回一个对象。当需要获取早期的Bean实例来解决循环依赖时，会调用ObjectFactory的getObject方法来创建或获取Bean。
代码示例：获取单例

protected Object getSingleton(String beanName, boolean allowEarlyReference) {
  // Spring首先从singletonObjects（一级缓存）中尝试获取
  Object singletonObject = this.singletonObjects.get(beanName);
  // 若是获取不到而且对象在建立中，则尝试从earlySingletonObjects(二级缓存)中获取
  if (singletonObject == null && isSingletonCurrentlyInCreation(beanName)) {
    synchronized (this.singletonObjects) {
        singletonObject = this.earlySingletonObjects.get(beanName);
        if (singletonObject == null && allowEarlyReference) {
          ObjectFactory<?> singletonFactory = this.singletonFactories.get(beanName);
          if (singletonFactory != null) {
            //若是仍是获取不到而且容许从singletonFactories经过getObject获取，则经过singletonFactory.getObject()(三级缓存)获取
              singletonObject = singletonFactory.getObject();
              //若是获取到了则将singletonObject放入到earlySingletonObjects,也就是将三级缓存提高到二级缓存中
              this.earlySingletonObjects.put(beanName, singletonObject);
              this.singletonFactories.remove(beanName);
          }
        }
    }
  }
  return (singletonObject != NULL_OBJECT ? singletonObject : null);
}

解决循环依赖流程（以 A → B → A 为例）：
1. 创建 A：
•  实例化 A（调用构造方法），此时 A 还未初始化（属性未注入）。
•  将 A 的工厂（ObjectFactory）放入 三级缓存（singletonFactories）。
2. A 依赖 B：
•  A 在属性注入时发现需要 B，于是去容器中查找 B。
3. 创建 B：
•  实例化 B（调用构造方法），B 还未初始化。
•  将 B 的工厂放入 三级缓存。
4. B 依赖 A：
•  B 在属性注入时发现需要 A，于是去容器中查找 A。
•  从 三级缓存 获取 A 的工厂，生成 A 的早期引用（未完成初始化的 A），并放入 二级缓存（earlySingletonObjects）。
•  B 成功注入 A 的早期引用，完成初始化，放入 一级缓存（singletonObjects）。
5. A 完成初始化：
•  容器将 B（已初始化）注入 A，A 完成初始化，放入 一级缓存。

四、Spring为什么不能解决非单例属性之外的循环依赖？
Spring为什么不能解决构造器的循环依赖？
构造器注入形成的循环依赖：也就是BeanB需要再BeanA的构造函数中完成初始化，BeanA也需要在BeanB的构造函数中完成初始化，这种情况的结果就是两个Bean都不能完成初始化，循环依赖难以解决。Spring解决循环依赖主要依赖三级缓存，但是在调用构造方法之前还没有将其放入三级缓存之中，因此后续的依赖调用构造方法的时候不能从三级缓存中获取依赖的BeanB，因此无法解决。
Spring为什么不能解决prototype作用域循环依赖？
Spring默认不会自动解决原型（prototype）Bean的循环依赖问题。这是因为原型Bean的设计理念与单例（singleton）Bean不同。单例Bean在整个应用程序生命周期内只有一个实例，所以Spring 可以通过三级缓存等复杂机制来协调其创建过程以解决循环依赖。而原型Bean每次被请求时都会创建一个新的实例，不会进行缓存。例如，假设存在两个原型 Bean A 和 B，A 依赖 B，B 依赖 A。当容器获取 A 的一个实例时，它会创建一个新的 A 实例，在注入 B 时又会创建一个新的 B 实例，这个新的 B 实例又会触发创建一个新的 A 实例，如此反复，很容易陷入无限循环的创建过程。
Spring为什么不能解决多例的循环依赖？
多实例Bean是每次调用一次getBean都会执行一次构造方法并且给属性赋值，根本没有三级缓存，因此不能解决循环依赖。
五、手动解决原型 Bean 循环依赖的可能方式：
•  使用作用域代理（Scope Proxy）：
可以通过为原型 Bean 创建作用域代理来缓解循环依赖问题。例如，在使用 Java 配置时，可以通过@Scope注解并指定proxyMode来创建代理。这里为原型 Bean A 和 B 都创建了基于类的代理（ScopedProxyMode.TARGET_CLASS）。当 A 注入 B 时，实际上注入的是 B 的代理对象，当 B 注入 A 时，也是注入的 A 的代理对象。这样，在实际使用这些 Bean 时，代理对象可以延迟真正的 Bean 实例的获取，直到真正需要使用时才去创建具体的原型 Bean 实例，从而在一定程度上避免了无限循环创建的问题。
•  重新设计依赖关系：
如果可能的话，最好的解决方法是重新审视和设计 Bean 之间的依赖关系，尽量避免原型 Bean 之间的循环依赖。例如，可以将循环依赖的部分提取到一个单例 Bean 中，或者通过接口和抽象类来解耦循环依赖的原型 Bean，使它们的依赖关系更加合理。
六、其它循环依赖解决
•  生成代理对象产生的循环依赖
这类循环依赖问题解决方法很多，主要有：使用@Lazy注解，延迟加载、使用@DependsOn注解，指定加载先后关系、修改文件名称，改变循环依赖类的加载顺序。
•  使用@DependsOn产生的循环依赖
这类循环依赖问题要找到@DependsOn注解循环依赖的地方，迫使它不循环依赖就可以解决问题。
•  多例循环依赖这类循环依赖问题
可以通过把bean改成单例的解决。
•  构造器循环依赖
这类循环依赖问题可以通过使用@Lazy注解解决。
