# 既然有 HTTP 为什么还要有 RPC

## 核心概念

HTTP 和 RPC 都是应用层协议，目的都是跨进程通信。HTTP 是通用协议，强调标准化和生态；RPC 是面向"像调用本地方法一样调用远程服务"的设计，强调性能和治理。两者不是替代关系：对外 API 用 HTTP（开放生态），内部微服务调用用 RPC（高效、强类型、治理完善）。HTTP/2 出现后两者性能差距缩小，但 RPC 的服务发现、IDL 契约、流量治理等优势仍使其在内部场景占主导。

## 标准回答

HTTP vs RPC 核心差异：

| 维度 | HTTP | RPC（如 gRPC、Dubbo） |
|------|------|----------------------|
| 设计目标 | 通用文档传输 | 远程方法调用 |
| 协议 | 文本（HTTP/1.1）/ 二进制（HTTP/2） | 二进制（gRPC 基于 HTTP/2） |
| 序列化 | JSON（文本） | Protobuf、Hessian（二进制） |
| 服务发现 | DNS + 域名 | 注册中心（Etcd、Nacos、Consul） |
| 接口契约 | OpenAPI（可选） | IDL（Protobuf、Thrift）强契约 |
| 治理 | 较弱（需框架补充） | 内置（熔断、限流、负载均衡） |
| 性能 | HTTP/1.1 一般，HTTP/2 好 | 好（二进制 + 连接池 + 多路复用） |
| 跨语言 | 好（JSON 通用） | 好（Protobuf 多语言） |
| 浏览器支持 | 原生支持 | gRPC-Web 转换 |
| 适用场景 | 对外 API、Web | 内部微服务调用 |

## 详细机制

### 为什么不直接用 HTTP

**问题 1：性能**

HTTP/1.1 + JSON 性能瓶颈：

- 文本协议，解析慢
- JSON 序列化体积大
- 头部重复发送
- 没有多路复用（HTTP/1.1）

RPC（如 gRPC）：

- HTTP/2 二进制分帧
- Protobuf 二进制序列化，体积小、解析快
- HPACK 头部压缩
- 单连接多路复用

```
同样一个用户对象:
JSON: {"id":42,"name":"Alice","email":"a@x.com"}   # 40 字节
Protobuf: 08 2A 12 05 41 6C 69 63 65 1A 07 61 40 78 2E 63 6F 6D   # 17 字节
```

**问题 2：服务治理**

微服务调用需要：

- 服务发现：知道服务在哪个 IP:Port
- 负载均衡：多实例分流
- 熔断降级：故障时快速失败
- 链路追踪：跨服务调用追踪
- 重试、超时、限流

HTTP 没有内置这些，需用 Spring Cloud、Istio 等补充。RPC 框架（Dubbo、gRPC）通常内置。

**问题 3：接口契约**

HTTP API 文档（OpenAPI）和代码不一定同步，容易出错。

RPC 用 IDL（Interface Definition Language）：

```protobuf
// user.proto
service UserService {
    rpc GetUser(GetUserRequest) returns (GetUserResponse);
}

message GetUserRequest {
    int64 id = 1;
}

message GetUserResponse {
    int64 id = 1;
    string name = 2;
    string email = 3;
}
```

IDL 生成多语言客户端代码，强类型，契约和代码强一致。

### RPC 的核心特性

#### 1. 像调用本地方法

```java
// RPC 调用
User user = userService.getUser(42);   // 像本地调用

// 底层实际：
// 1. 序列化参数
// 2. 通过网络发给服务端
// 3. 服务端反序列化、调用方法
// 4. 序列化返回值
// 5. 客户端反序列化得到结果
```

开发者无需关心网络细节。

#### 2. 服务发现

```
RPC 客户端 → 注册中心（Etcd/Nacos）：问 UserService 在哪
注册中心 → RPC 客户端：在 10.0.0.1:8080, 10.0.0.2:8080
RPC 客户端 → 10.0.0.1:8080：调用 GetUser
```

注册中心实时同步服务实例列表，支持动态扩缩容。

#### 3. 序列化协议

| 协议 | 体积 | 速度 | 跨语言 | 用途 |
|------|------|------|--------|------|
| JSON | 大 | 慢 | 极好 | HTTP API |
| Protobuf | 小 | 快 | 好 | gRPC |
| Hessian | 中 | 中 | Java 为主 | Dubbo |
| Thrift | 小 | 快 | 好 | Thrift |
| MessagePack | 小 | 快 | 好 | 通用 |

Protobuf 是 RPC 主流：二进制、紧凑、多语言支持、强类型。

#### 4. 连接管理

RPC 通常用连接池 + 长连接：

```
RPC 客户端连接池:
  连接 1 → 服务实例 1
  连接 2 → 服务实例 2
  连接 3 → 服务实例 3

调用时从池中借连接，用完归还，避免重复握手
```

gRPC 基于 HTTP/2，单连接多路复用，连接数少。

#### 5. 治理能力

| 能力 | 实现 |
|------|------|
| 负载均衡 | 客户端 LB（如 gRPC）、服务端 LB（如 Dubbo） |
| 熔断 | Hystrix、Sentinel、Resilience4j |
| 限流 | 令牌桶、滑动窗口 |
| 重试 | 指数退避 |
| 超时 | 调用级超时 |
| 链路追踪 | OpenTelemetry、SkyWalking |

### HTTP/2 缩小差距

HTTP/2 引入后，HTTP 性能大幅提升：

- 二进制分帧
- 多路复用
- HPACK 头部压缩
- 服务端推送

gRPC 本身就基于 HTTP/2，性能不再逊色于自研 RPC 协议。

但 RPC 在服务治理、IDL 契约、生态集成（注册中心、监控）上仍有优势。

### 何时用 HTTP，何时用 RPC

| 场景 | 推荐 | 原因 |
|------|------|------|
| 对外 API（第三方调用） | HTTP/REST | 开放、通用、浏览器支持 |
| 移动端 API | HTTP/REST | 浏览器/移动端友好 |
| 内部微服务调用 | RPC | 高性能、强契约、治理完善 |
| 跨语言服务调用 | gRPC | Protobuf 多语言 |
| 浏览器实时通信 | WebSocket | 双向 |
| 文件上传下载 | HTTP | multipart 友好 |
| 数据库连接 | 专有协议 | 不用 HTTP/RPC |

### 抓包对比

```bash
# HTTP/1.1 + JSON
$ tcpdump -i any -A 'tcp port 80'
POST /api/users HTTP/1.1
Content-Type: application/json
Content-Length: 40

{"id":42,"name":"Alice","email":"a@x.com"}

# gRPC over HTTP/2
$ tcpdump -i any -A 'tcp port 50051'
# 二进制帧，不易直接阅读
# 需用 tshark 解析 gRPC
$ tshark -i any -Y "grpc" -O grpc
```

## 代码示例

gRPC 服务端定义：

```protobuf
// user.proto
syntax = "proto3";

package user;

service UserService {
    rpc GetUser(GetUserRequest) returns (GetUserResponse);
    rpc ListUsers(ListUsersRequest) returns (stream GetUserResponse);
}

message GetUserRequest {
    int64 id = 1;
}

message GetUserResponse {
    int64 id = 1;
    string name = 2;
    string email = 3;
}

message ListUsersRequest {
    int32 page = 1;
    int32 size = 2;
}
```

gRPC Java 服务端：

```java
import io.grpc.*;

public class GrpcServer {
    public static void main(String[] args) throws Exception {
        Server server = ServerBuilder.forPort(50051)
            .addService(new UserServiceImpl())
            .build()
            .start();
        server.awaitTermination();
    }
}

class UserServiceImpl extends UserServiceGrpc.UserServiceImplBase {
    @Override
    public void getUser(GetUserRequest req, StreamObserver<GetUserResponse> resp) {
        User user = userDao.findById(req.getId());
        resp.onNext(GetUserResponse.newBuilder()
            .setId(user.getId())
            .setName(user.getName())
            .setEmail(user.getEmail())
            .build());
        resp.onCompleted();
    }
}
```

gRPC Java 客户端（像调用本地方法）：

```java
import io.grpc.*;
import generated.user.*;

ManagedChannel channel = ManagedChannelBuilder
    .forAddress("user-service", 50051)
    .usePlaintext()
    .build();

UserServiceGrpc.UserServiceBlockingStub stub =
    UserServiceGrpc.newBlockingStub(channel);

// 像调用本地方法
GetUserResponse user = stub.getUser(
    GetUserRequest.newBuilder().setId(42).build());
System.out.println(user.getName());

channel.shutdown();
```

Dubbo 服务端：

```java
import org.apache.dubbo.config.*;

@Service
public class UserServiceImpl implements UserService {
    @Override
    public User getUser(Long id) {
        return userDao.findById(id);
    }
}
```

Dubbo 客户端：

```java
@Reference
private UserService userService;

public void doSomething() {
    User user = userService.getUser(42);   // 像本地调用
}
```

## 实战场景

| 场景 | 选择 | 原因 |
|------|------|------|
| 电商对外 API | HTTP/REST | 第三方调用，开放 |
| 内部订单调用用户服务 | gRPC/Dubbo | 高性能、治理完善 |
| 移动端 App API | HTTP/REST | 浏览器/移动端友好 |
| 实时推送 | WebSocket | 双向 |
| 服务网格 | gRPC + Envoy | Istio 原生支持 |
| 跨语言 | gRPC | Protobuf 多语言 |

## 深挖追问

**Q1：gRPC 一定比 HTTP 快吗？**
不一定。HTTP/2 + Protobuf 也能达到类似性能。差距主要在序列化和治理，不是协议本身。

**Q2：RPC 一定要用 Protobuf 吗？**
不。Dubbo 默认用 Hessian，Thrift 用自己的 IDL。但 Protobuf 是事实标准。

**Q3：gRPC 浏览器能直接调用吗？**
不能直接调用（浏览器对 HTTP/2 Trailers 支持有限），需用 gRPC-Web 代理转换。

**Q4：REST 一定不能用 IDL 吗？**
能用 OpenAPI 描述，但 OpenAPI 是文档，不像 Protobuf 强类型生成代码。

**Q5：Service Mesh 会替代 RPC 框架吗？**
部分会。Istio + gRPC 把治理能力下沉到 Sidecar，应用层只需关注业务。但客户端 LB、超时、重试仍需应用层配合。

## 易错点

- **"RPC 一定比 HTTP 快"** — 不一定，看协议、序列化、连接管理。
- **"gRPC 不基于 HTTP"** — 错，gRPC 基于 HTTP/2。
- **"HTTP/2 取代 RPC"** — 不，RPC 在治理、契约上仍有优势。
- **"RPC 不能跨语言"** — gRPC 跨语言。
- **"对外 API 用 RPC"** — 不推荐，浏览器和第三方难调用。

## 总结

HTTP 和 RPC 都是应用层通信协议，不是替代关系。HTTP 通用、开放、浏览器友好，适合对外 API；RPC 高性能、强契约、治理完善，适合内部微服务调用。gRPC 基于 HTTP/2 + Protobuf 是当前主流 RPC。生产中按场景选：对外用 HTTP/REST，内部用 gRPC/Dubbo，实时通信用 WebSocket。

## 参考资料

- [gRPC 文档](https://grpc.io/docs/)
- [Protocol Buffers](https://developers.google.com/protocol-buffers)
- [Dubbo 文档](https://dubbo.apache.org/zh/docs/)
