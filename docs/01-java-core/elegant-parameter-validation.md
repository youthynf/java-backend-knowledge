# Java 后端参数校验如何设计得优雅？

参数校验不是简单地少写几个 `if-else`。在真实项目里，它关系到接口契约、错误提示、异常治理、可维护性和安全边界。面试中被问到“如何优雅做参数校验”，核心不是背注解，而是说明你如何把校验规则从业务流程中拆出来，并让它可复用、可组合、可观测。

## 核心概念

Java 后端常见参数校验可以分三层：

1. **入口参数校验**：Controller / RPC 接口入参，例如必填、长度、格式、枚举值。
2. **业务规则校验**：依赖数据库、状态机或上下文的规则，例如用户是否存在、订单是否可取消。
3. **领域不变量校验**：对象自身必须长期满足的约束，例如金额不能为负、库存不能小于 0。

优雅的参数校验通常遵循两个原则：

- **简单格式规则前置**：用 Bean Validation 注解声明，避免业务代码堆满重复判断。
- **复杂业务规则内聚**：放在领域服务、应用服务或专门 Validator 中，不要硬塞进注解。

## 面试官想考什么

面试官通常关注这些点：

- 你是否知道 JSR 380 / Bean Validation 的基本用法；
- 你是否能区分“格式校验”和“业务校验”；
- 你是否知道 Spring MVC 中 `@Valid`、`@Validated`、`BindingResult`、全局异常处理的关系；
- 你是否能处理分组校验、嵌套对象校验、自定义注解；
- 你是否知道过度注解化会带来的可读性和维护问题。

## 标准回答

在 Spring Boot 项目中，我一般这样设计参数校验：

1. **DTO 上声明基础约束**
   - `@NotNull`、`@NotBlank`、`@Size`、`@Pattern`、`@Min`、`@Max` 等处理基础格式。
   - 对集合或嵌套对象使用 `@Valid` 触发级联校验。

2. **Controller 入口启用校验**
   - 请求体使用 `@Valid` 或 `@Validated`。
   - 如果需要分组校验，使用 `@Validated(Create.class)`、`@Validated(Update.class)`。

3. **统一异常返回**
   - 用 `@RestControllerAdvice` 捕获 `MethodArgumentNotValidException`、`ConstraintViolationException`。
   - 统一转换成业务错误码、字段名、错误提示，避免前端解析困难。

4. **复杂业务规则单独封装**
   - 例如“用户是否有权限操作订单”“优惠券是否可用”，放到业务服务或 Validator。
   - 这类规则可能依赖数据库、缓存、远程服务，不适合只靠注解完成。

5. **领域对象守住不变量**
   - 对金额、库存、状态流转等核心规则，在领域方法内部再次保护，避免绕过接口层时出现脏数据。

## 代码示例

### 1. DTO 基础校验

```java
public class CreateUserRequest {

    @NotBlank(message = "用户名不能为空")
    @Size(max = 32, message = "用户名不能超过32个字符")
    private String username;

    @NotBlank(message = "手机号不能为空")
    @Pattern(regexp = "^1[3-9]\\d{9}$", message = "手机号格式不正确")
    private String mobile;

    @NotNull(message = "年龄不能为空")
    @Min(value = 18, message = "年龄不能小于18岁")
    private Integer age;

    @Valid
    @NotNull(message = "地址不能为空")
    private AddressDTO address;
}
```

### 2. Controller 启用校验

```java
@PostMapping("/users")
public UserVO createUser(@RequestBody @Valid CreateUserRequest request) {
    return userService.create(request);
}
```

### 3. 统一异常处理

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ApiResult<Void> handleValidException(MethodArgumentNotValidException ex) {
        List<String> messages = ex.getBindingResult()
                .getFieldErrors()
                .stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .toList();
        return ApiResult.fail("PARAM_INVALID", String.join("; ", messages));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ApiResult<Void> handleConstraintViolation(ConstraintViolationException ex) {
        String message = ex.getConstraintViolations()
                .stream()
                .map(ConstraintViolation::getMessage)
                .collect(Collectors.joining("; "));
        return ApiResult.fail("PARAM_INVALID", message);
    }
}
```

### 4. 分组校验

```java
public interface CreateGroup {}
public interface UpdateGroup {}

public class UserRequest {
    @Null(groups = CreateGroup.class, message = "新增时不能传id")
    @NotNull(groups = UpdateGroup.class, message = "更新时id不能为空")
    private Long id;

    @NotBlank(groups = {CreateGroup.class, UpdateGroup.class})
    private String username;
}

@PostMapping("/users")
public void create(@RequestBody @Validated(CreateGroup.class) UserRequest request) {}

@PutMapping("/users")
public void update(@RequestBody @Validated(UpdateGroup.class) UserRequest request) {}
```

## 深挖追问

### `@Valid` 和 `@Validated` 有什么区别？

- `@Valid` 是 Bean Validation 标准注解，支持级联校验。
- `@Validated` 是 Spring 提供的增强注解，支持分组校验。
- 在 Spring MVC 参数上，两者都可以触发校验；需要分组时用 `@Validated`。

### 为什么不能把所有校验都写成注解？

因为注解适合处理稳定、局部、无副作用的规则。业务规则经常依赖数据库状态、用户权限、时间窗口、外部服务，强行写进注解会导致：

- Validator 里注入太多服务，职责变重；
- 规则分散，排查困难；
- 校验和业务流程边界模糊；
- 单元测试成本上升。

### 参数校验应该放 Controller 还是 Service？

- Controller 负责入口格式校验，阻止明显非法请求进入业务层。
- Service 负责业务规则校验，保证业务流程正确。
- 领域对象负责核心不变量，防止被其他入口绕过。

## 实战场景

### 场景：创建订单接口

入口 DTO 可以校验：

- 商品 ID 非空；
- 数量大于 0；
- 地址 ID 非空；
- 优惠券 ID 格式正确。

业务服务需要校验：

- 商品是否上架；
- 库存是否足够；
- 优惠券是否属于当前用户；
- 优惠券是否满足门槛；
- 用户是否被风控限制下单。

领域对象需要保证：

- 订单金额不能为负；
- 订单状态只能按合法路径流转；
- 支付成功后不能再次修改关键金额。

## 易错点

- 只在前端校验，后端不兜底。
- Controller 里堆满 `if-else`，导致业务流程被参数判断淹没。
- 把依赖数据库的复杂业务规则硬写进注解。
- 分组校验滥用，DTO 变得难以理解。
- 异常返回格式不统一，前端无法稳定展示字段错误。
- 忘记对嵌套对象加 `@Valid`，导致内部字段没有被校验。

## 总结

优雅参数校验的关键不是“消灭所有 `if-else`”，而是让不同类型的规则放在合适的位置：基础格式规则声明化，业务规则服务化，领域不变量对象化，再配合统一异常处理和清晰错误码，才能在项目里长期维护。

## 参考资料

- [Bean Validation 规范](https://beanvalidation.org/)
- [Spring Framework Validation 文档](https://docs.spring.io/spring-framework/reference/core/validation/beanvalidation.html)
