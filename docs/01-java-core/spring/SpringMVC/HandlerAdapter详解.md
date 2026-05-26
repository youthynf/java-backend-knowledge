# HandlerAdapter详解

HandlerAdapter详解
一、概述
在Spring MVC中，HandlerAdapter的职责是根据处理器（Controller）的类型选择合适的方法来调用处理器。这是SpringMVC处理请求的一个核心部分，因为不同类型的处理器（例如注解控制器、实现特定接口的控制器）需要不同的方式进行调用。

二、HandlerAdapter的核心接口

public interface HandlerAdapter {
    // 判断是否支持该处理器
    boolean supports(Object handler);
    
    // 执行处理器方法
    ModelAndView handle(HttpServletRequest request, 
                      HttpServletResponse response, 
                      Object handler) throws Exception;
    
    // 获取最后修改时间（用于缓存）
    long getLastModified(HttpServletRequest request, Object handler);
}

三、HandlerAdapter的核心概念
处理器的多样性
SpringMVC支持多种类型的处理器，如注解控制器、HttpRequestHandler、实现了Controller接口的类等。但这些处理器的定义方式和调用方式不同。例如：
·  注解控制器需要解析方法上的注解并处理返回值。
·  实现了Controller接口的类只需要调用其handleRequest方法。
·  实现了HttpRequestHandler的类直接处理HttpServletRequest和HttpServletResponse。

适配器的作用
为了屏蔽这种多样性，Spring引入了HandlerAdapter，通过适配器设计模式，将这些不同类型的处理器统一起来。HandlerAdapter会根据处理器的类型，调用其对应的处理方法。

四、工作流程
HandlerAdapter的工作流程如下：
HandlerMapping确定处理器
首先，由HandlerMapping确定该请求对应的处理器（Controller）。
HandlerAdapter匹配适配器
Spring会依次检查所有注册的HandlerAdapter，通过调用其supports() 方法，找到能够处理当前处理器的适配器。
HandlerAdapter调用处理器
找到合适的适配器后，适配器会调用处理器的具体方法，完成请求的处理。
返回处理结果
HandlerAdapter负责将处理器的返回值包装成一个ModelAndView对象，供后续流程使用。

五、Spring提供的常见HandlerAdapter实现
RequestMappingHandlerAdapter
·  用于支持基于注解的控制器（@Controller和 @RestController）。
·  解析方法上的注解（如 @RequestMapping），处理参数绑定和返回值。
·  过程：HandlerMapping会找到MyController，RequestMappingHandlerAdapter调用sayHello() 方法，并将其返回值处理成HTTP响应。

SimpleControllerHandlerAdapter
·  用于支持实现了org.springframework.web.servlet.mvc.Controller接口的控制器。
·  调用handleRequest() 方法，直接返回一个ModelAndView。
·  过程：HandlerMapping会找到 MyController，SimpleControllerHandlerAdapter调用handleRequest() 方法。

HttpRequestHandlerAdapter
·  用于支持实现了HttpRequestHandler接口的处理器。
·  调用handleRequest() 方法，直接操作请求和响应。
·  过程：HandlerMapping会找到MyHttpRequestHandler，HttpRequestHandlerAdapter调用handleRequest() 方法。
助记：SpringMVC提供多种类型的处理器，如注解控制器、HttpRequestHandler、实现了Controller接口的类等，这些处理器的定义和调用方式都不一致，因此需要HandlerAdapter来进行适配，每中处理器各自对应一个处理器适配器。
