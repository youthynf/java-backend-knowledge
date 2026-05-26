# SpringMVC常用注解

SpringMVC常用注解
一、控制器相关注解
·  @Controller
标记一个类作为Spring MVC的控制器；
组件扫描时会自动检测带有此注解的类；
·  @RestController
相当于@Controller + @ResponseBody的组合注解；
用于RESTFUL风格的控制器，返回值直接作为响应体；
·  @RequestMapping
用于将指定的Web请求映射到具体的处理方法上；
支持指定请求路径、请求HTTP方法等；
衍生注解：@GetMapping、@PostMapping、@PutMapping、@DeleteMapping、@PatchMapping；

二、请求处理相关注解
·  @RequestParam
用于获取URL查询参数或表单数据；
适合GET请求或application/x-www-form-urlencoded格式的POST请求；
默认参数必传，可通过required=false设置为可选，支持设置默认值defaultValue；

// URL: /user?id=123
@GetMapping("/user")
public String getUser(@RequestParam("id") String userId) {
    // ...
}

·  @RequestBody
用于获取HTTP请求体中的内容；
通常用于JSON或XML数据格式请求；
Spring会自动将请求体反序列化为Java对象；
一个方法只能有一个@RequestBody参数；

@PostMapping("/user")
public String createUser(@RequestBody User user) {
    // ...
}

·  @PathVariable：获取URL路径中的变量；

@GETMapping("/user/{id}")
public String getUser(@PathVariable Long id) {
    // ...
}

·  @RequestHeader：获取请求头信息

@RequestHeader("User-Agent") String userAgent

·  @CookieValue：获取Cookie值

@CookieValue("JSESSIONID") String sessionId

三、响应处理相关注解
·  @ResponseBody
设定方法返回值应直接作为HTTP响应体；
通常用于返回JSON/XML格式数据；
·  @ResponseStatus：指定响应的HTTP状态码

@ResponseStatus(HttpStatus.CREATED)

·  @RestControllerAdvice
组合了@ControllerAdvice和@ResponseBody注解；
用于全局异常处理和响应封装；
四、模型和视图相关注解
·  @ModelAttribute
将请求参数绑定到模型对象上；
可用于方法参数或方法级别；
·  @SessionAttributes
用于指定哪些模型属性应该存储在会话中；
用于跨多个请求的模型数据；
五、数据验证注解
·  @Valid/@Validated
触发对方法参数的校验
通常与JSR-303/JSR-380验证注解配合使用；
六、其他重要注解
·  @CrossOrigin：
启用跨域请求支持，可配置在控制器类或方法上；
·  @InitBinder：
初始化WebDataBinder，用于自定义请求参数绑定；
·  @ExceptionHandler：
处理控制器内的特定异常，通常用于自定义错误响应；
·  @ContrallerAdvice：
提供全局异常处理、数据绑定等，影响所有@Controller或@RestController；
七、示例代码

@RestController
@RequestMapping("/api/users")
@CrossOrigin
public class UserController {

    @GetMapping("/{id}")
    public User getUser(@PathVariable Long id, 
                       @RequestParam(required = false) String detail) {
        // ...
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public User createUser(@Valid @RequestBody User user) {
        // ...
    }

    @ExceptionHandler(UserNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ErrorResponse handleUserNotFound(UserNotFoundException ex) {
        // ...
    }
}
