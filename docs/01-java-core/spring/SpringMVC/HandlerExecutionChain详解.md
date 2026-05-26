# HandlerExecutionChain详解

HandlerExecutionChain详解
一、概述
在SpringMVC 中，HandlerExecutionChain是一个非常重要的类，负责封装请求的处理器（Handler）和拦截器链（Interceptor）。它是HandlerMapping的核心返回对象，DispatcherServlet使用它来处理请求。

二、核心作用
·  包含请求的处理器（Handler）和拦截器链（Interceptor[]）。
·  在请求的处理流程中，先执行拦截器的preHandle()方法，再执行处理器（如 Controller 方法），最后执行拦截器的postHandle()和afterCompletion()方法。

三、自定义拦截器
拦截器实现：

public class LoggingInterceptor implements HandlerInterceptor {
   @Override
   public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
       System.out.println("PreHandle: Request received.");
       return true;
   }

   @Override
   public void postHandle(HttpServletRequest request, HttpServletResponse response, Object handler, ModelAndView modelAndView) throws Exception {
       System.out.println("PostHandle: Request handled.");
   }

   @Override
   public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) throws Exception {
       System.out.println("AfterCompletion: Request completed.");
   }
}

2. 配置拦截器链：

@Configuration
public class WebConfig implements WebMvcConfigurer {

   @Override
   public void addInterceptors(InterceptorRegistry registry) {
       // 注册拦截器 1（日志记录）
       registry.addInterceptor(new LoggingInterceptor())
               .addPathPatterns("/**") // 拦截所有路径
               .excludePathPatterns("/public/**"); // 排除特定路径

       // 注册拦截器 2（身份认证）
       registry.addInterceptor(new AuthenticationInterceptor())
               .addPathPatterns("/secure/**"); // 仅拦截以 /secure 开头的路径
   }
}
 
处理器类：

@Controller
public class MyController {
   @RequestMapping("/test")
   public String testHandler() {
       System.out.println("Handler: Processing request.");
       return "testView";
   }
}
助记：支持指定url对应的handler和过滤器。
