# Java注解机制是什么？

Java注解机制是什么？
一、概述
注解是JDK1.5版本开始引入的重要特性，用于对代码进行说明，可以对包、类、接口、字段、方法参数、局部变量等进行注解。
二、注解的作用
它主要的作用有以下四方面：
生成文档：通过代码里标识的元数据生成javadoc文档。
编译检查：通过代码里标识的元数据让编译器在编译期间进行检查验证。
编译时动态处理：编译时通过代码里标识的元数据动态处理，例如动态生成代码。
运行时动态处理：运行时通过代码里标识的元数据动态处理，例如使用反射注入实例。

三、注解的常见分类
Java自带的标准注解：包括@Override、@Deprecated和@SuppressWarnings，分别用于标明重写某个方法、标明某个类或方法过时、标明要忽略的警告，用这些注解标明后编译器就会进行检查。
元注解：元注解是用于定义注解的注解，包括@Retention、@Target、@Inherited、@Documented，@Retention用于标明注解被保留的阶段，@Target用于标明注解使用的范围，@Inherited用于标明注解可继承，@Documented用于标明是否生成javadoc文档。
自定义注解：可以根据自己的需求定义注解，并可用元注解对自定义注解进行注解。

四、自定义注解和AOP实现示例
最为常见的就是使用Spring AOP切面实现统一的操作日志管理。如@Pointcut("@annotation(com.xxx.aspectj.lang.annotation.Log)")其中Log为自定义注解。

@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.METHOD})
public @interface MyAnnotation {
    String value() default "default";  // 属性
    int priority() default 0;
    String[] tags() default {};
}

五、注解处理
编译时处理（APT）

@SupportedAnnotationTypes("com.example.MyAnnotation")
@SupportedSourceVersion(SourceVersion.RELEASE_11)
public class MyAnnotationProcessor extends AbstractProcessor {
    @Override
    public boolean process(Set<? extends TypeElement> annotations, 
                         RoundEnvironment roundEnv) {
        for (TypeElement annotation : annotations) {
            Set<? extends Element> elements = roundEnv.getElementsAnnotatedWith(annotation);
            // 处理被注解的元素
        }
        return true;
    }
}
运行时处理（反射）

Class<?> clazz = MyClass.class;

// 类注解
if (clazz.isAnnotationPresent(MyAnnotation.class)) {
    MyAnnotation anno = clazz.getAnnotation(MyAnnotation.class);
    System.out.println("Value: " + anno.value());
}

// 方法注解
for (Method method : clazz.getDeclaredMethods()) {
    if (method.isAnnotationPresent(MyAnnotation.class)) {
        MyAnnotation methodAnno = method.getAnnotation(MyAnnotation.class);
        // 处理注解
    }
}
