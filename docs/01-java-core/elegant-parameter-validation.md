# 摆脱if-else——优雅参数校验

> 来源：[阿里云开发者 - 摆脱if-else——优雅参数校验](https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247537762&idx=1&sn=4c962d59f1229b45e87a6d22773a6de3&scene=21#wechat_redirect)

## 核心概念

- **if-else校验的问题**：大量if-else导致代码可读性差、维护困难、违反开闭原则，校验逻辑与业务逻辑耦合
- **JSR 380（Bean Validation 2.0）**：Java标准参数校验规范，Hibernate Validator是主流实现
- **声明式校验**：通过注解在字段上声明校验规则，将校验逻辑从业务代码中分离
- **自定义校验注解**：通过`@interface`定义 + `ConstraintValidator`实现，可复用的校验逻辑
- **分组校验（Groups）**：同一实体在不同场景下使用不同校验规则，如Create和Update分组
- **校验链与责任链模式**：将多个校验组织为链式调用，每个校验器只关注自己的规则

## 面试官想考什么

- 是否理解 Bean Validation/JSR 380 的定位：声明式、标准化、可复用，而不是在业务代码里堆 if-else。
- 是否能说清 `@Valid`、`@Validated`、分组校验、级联校验、自定义注解和统一异常处理。
- 是否知道校验应该分层：Controller 做格式和必填校验，Service/领域层做业务规则校验，避免所有逻辑塞进 DTO 注解。

## 标准回答

参数校验可以用 Bean Validation 把常见规则声明在 DTO 字段上，Controller 入参用 `@Valid` 或 `@Validated` 触发校验，再通过全局异常处理统一返回错误信息。简单格式规则用内置注解，创建/更新差异用分组校验，嵌套对象用级联校验，跨字段或业务相关规则可以使用自定义约束注解或放在 Service/领域层。这样能减少重复 if-else，让校验规则更集中、更可测试，也更符合开闭原则。

## 深挖追问

1. **Bean Validation常用注解有哪些？**
   - `@NotNull`、`@NotEmpty`、`@NotBlank`：非空校验（区别：Null vs 空集合 vs 空字符串）
   - `@Size`、`@Length`：长度校验
   - `@Min`、`@Max`、`@DecimalMin`、`@DecimalMax`：数值范围
   - `@Pattern`：正则匹配
   - `@Email`：邮箱格式
   - `@Valid`、`@Validated`：级联校验

2. **@Valid和@Validated的区别？**
   - `@Valid`是JSR 380标准注解，支持嵌套校验（级联）
   - `@Validated`是Spring扩展注解，支持分组校验（groups属性）
   - 实际使用中常配合使用：外层用`@Validated`指定分组，内层嵌套对象用`@Valid`

3. **如何实现自定义校验注解？**
   - 定义`@interface`，标注`@Constraint(validatedBy = XXXValidator.class)`
   - 实现`ConstraintValidator<A, T>`接口，`A`是注解类型，`T`是被校验字段类型
   - 在`initialize()`中读取注解属性，在`isValid()`中实现校验逻辑

## 实战场景

- **REST API参数校验**：Controller层入参校验，避免非法数据进入业务层
- **DTO/VO字段校验**：不同接口对同一实体的校验规则不同（如创建时ID为空，更新时ID必填）
- **复杂业务规则校验**：跨字段联合校验（如结束时间必须晚于开始时间）

## 代码示例

```java
// 1. 基本注解校验
public class UserCreateRequest {
    @NotBlank(message = "用户名不能为空")
    @Size(min = 2, max = 20, message = "用户名长度2-20")
    private String username;
    
    @NotBlank(message = "密码不能为空")
    @Pattern(regexp = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$", 
             message = "密码需包含大小写字母和数字，至少8位")
    private String password;
    
    @Email(message = "邮箱格式不正确")
    private String email;
    
    @Min(value = 0, message = "年龄不能为负数")
    @Max(value = 150, message = "年龄不合法")
    private Integer age;
}
```

```java
// 2. 分组校验
public interface Create {}
public interface Update {}

public class UserRequest {
    @Null(groups = Create.class, message = "创建时ID必须为空")
    @NotNull(groups = Update.class, message = "更新时ID不能为空")
    private Long id;
    
    @NotBlank(groups = {Create.class, Update.class})
    private String name;
}

// Controller中使用
@PostMapping
public Result create(@Validated(Create.class) @RequestBody UserRequest req) { ... }

@PutMapping
public Result update(@Validated(Update.class) @RequestBody UserRequest req) { ... }
```

```java
// 3. 自定义校验注解
@Target({FIELD, PARAMETER})
@Retention(RUNTIME)
@Constraint(validatedBy = PhoneValidator.class)
public @interface Phone {
    String message() default "手机号格式不正确";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}

public class PhoneValidator implements ConstraintValidator<Phone, String> {
    private static final Pattern PHONE_PATTERN = 
        Pattern.compile("^1[3-9]\\d{9}$");
    
    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null) return true; // null交给@NotNull处理
        return PHONE_PATTERN.matcher(value).matches();
    }
}
```

```java
// 4. 全局异常处理，统一返回校验错误
@RestControllerAdvice
public class ValidationExceptionHandler {
    
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public Result handleValidation(MethodArgumentNotValidException ex) {
        BindingResult result = ex.getBindingResult();
        String message = result.getFieldErrors().stream()
            .map(e -> e.getField() + ": " + e.getDefaultMessage())
            .collect(Collectors.joining("; "));
        return Result.fail(400, message);
    }
    
    @ExceptionHandler(ConstraintViolationException.class)
    public Result handleConstraint(ConstraintViolationException ex) {
        String message = ex.getConstraintViolations().stream()
            .map(ConstraintViolation::getMessage)
            .collect(Collectors.joining("; "));
        return Result.fail(400, message);
    }
}
```

## 易错点/总结

- `@NotNull` 只限制不能为 null，`@NotEmpty` 还要求字符串/集合长度大于 0，`@NotBlank` 还会排除纯空白字符串。
- 嵌套对象如果不加 `@Valid`，内部字段约束不会自动生效。
- `@Validated` 支持 Spring 分组校验；`@Valid` 是标准注解，更适合基础和级联场景。
- 自定义 `ConstraintValidator` 中通常让 `null` 返回 true，把是否必填交给 `@NotNull/@NotBlank`，避免职责混乱。
- 不要把强业务规则全部写成 DTO 注解；涉及数据库状态、权限、库存等规则更适合在 Service 或领域模型中校验。

## 延伸思考

- **校验的分层策略**：Controller层做格式校验，Service层做业务规则校验，避免校验逻辑过于集中
- **与Spring Validation的整合**：`MethodValidationPostProcessor`启用方法级别校验，可以在Service方法参数上使用校验注解
- **校验与领域模型**：DDD中领域模型自身应包含校验逻辑，而不仅仅是DTO层校验
- **性能考量**：Bean Validation使用反射，高频调用场景下可能有性能影响

## 参考资料

- [原文 - 摆脱if-else——优雅参数校验](https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247537762&idx=1&sn=4c962d59f1229b45e87a6d22773a6de3&scene=21#wechat_redirect)
- [JSR 380 - Bean Validation 2.0](https://beanvalidation.org/2.0/)
- [Hibernate Validator 文档](https://hibernate.org/validator/)
