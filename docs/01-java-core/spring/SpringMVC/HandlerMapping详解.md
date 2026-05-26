# HandlerMapping详解

HandlerMapping详解
一、概述
HandlerMapping是SpringMVC中的一个核心接口，用于根据客户端请求（如 URL、HTTP方法等）查找合适的处理器（Controller）。主要作用：
·  确定某个请求应该由哪个处理器来处理。
·  提供处理器和拦截器（HandlerInterceptor）链。

二、核心方法

HandlerExecutionChain getHandler(HttpServletRequest request) throws Exception;

三、常见实现类
Spring提供的多种HandlerMapping实现，以下是几种常用的实现：
RequestMappingHandlerMapping：基于注解（@RequestMapping 等）的处理器查找。过程：
·  提取请求的URL、HTTP方法、请求头等信息。
·  遍历所有注册的控制器方法。
·  检查方法上的@RequestMapping注解是否匹配当前请求，包括是否匹配URL、请求方法（如GET、POST）、路径参数、请求参数等条件。
·  找到匹配的控制器方法并返回。

BeanNameUrlHandlerMapping：通过Bean名称匹配URL。过程：
·  获取请求的 URL（如 /hello）。
·  检查是否有与该 URL 同名的 Bean 定义。
·  如果找到，返回该 Bean。

SimpleUrlHandlerMapping：通过静态配置文件将 URL 与处理器映射。过程：
·  解析配置文件中的 URL 映射表。
·  获取请求的 URL。
·  在映射表中查找对应的处理器。
·  如果找到，返回处理器。

ControllerClassNameHandlerMapping：根据类名生成URL。过程：
·  获取请求的 URL（如 /helloWorld）。
·  将类名转换为路径格式（如 HelloWorldController → /helloWorld）。
·  检查是否有对应的控制器类。
·  如果找到，返回控制器类实例。

四、处理器查找的顺序
配置顺序：@Order 注解或 Ordered 接口用于指定顺序。
默认顺序：
·  注解驱动（RequestMappingHandlerMapping）优先。
·  静态配置（SimpleUrlHandlerMapping）其次。
·  动态生成（ControllerClassNameHandlerMapping）最后。
助记：处理器查找顺序：注解匹配->静态配置文件匹配->类名动态匹配。
