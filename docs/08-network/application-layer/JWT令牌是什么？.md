# JWT 令牌是什么

## 核心概念

JWT（JSON Web Token，RFC 7519）是一种紧凑的、自包含的令牌格式，用于在双方之间安全传递信息。JWT 由 Header、Payload、Signature 三部分组成，用 `.` 分隔，整体 Base64URL 编码。JWT 的核心特性是"自包含"——载荷中携带用户身份等信息，服务端用签名验证完整性，无需查 Session 存储。这让 JWT 适合分布式、无状态的现代应用，但带来撤销难、载荷暴露等新问题。

## 标准回答

JWT 的核心要点：

1. **结构**：Header.Payload.Signature，Base64URL 编码
2. **签名**：用密钥对 Header+Payload 签名，防篡改
3. **自包含**：载荷中携带用户身份，服务端无需查 Session
4. **无状态**：服务端不存会话，水平扩展友好
5. **不可撤销**：一旦签发，到期前无法主动失效（除非黑名单）

## 详细机制

### JWT 结构

```
xxxxx.yyyyy.zzzzz
```

**Header**（头部）：

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

Base64URL 编码后是第一部分 `xxxxx`。

**Payload**（载荷）：

```json
{
  "sub": "1234567890",
  "name": "John Doe",
  "iat": 1516239022,
  "exp": 1516242622
}
```

包含声明（Claims），分三类：

- **标准声明**（RFC 7519）：iss（签发者）、sub（主题）、aud（受众）、exp（过期）、nbf（生效时间）、iat（签发时间）、jti（唯一 ID）
- **私有声明**：业务自定义字段（userId、role 等）
- **公共声明**：IANA 注册的声明（email、name 等）

Base64URL 编码后是第二部分 `yyyyy`。

**Signature**（签名）：

```
HMACSHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  secret
)
```

用 Header 中指定的算法（HS256、RS256、ES256 等）对 Header+Payload 签名。第三部分 `zzzzz`。

### 完整 JWT 示例

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

解码后：

```
Header: {"alg":"HS256","typ":"JWT"}
Payload: {"sub":"1234567890","name":"John Doe","iat":1516239022}
Signature: SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

### 工作流程

```
1. 客户端登录
   POST /api/login { username, password }

2. 服务端验证后签发 JWT
   JWT = Header.Payload.Signature
   响应: { token: "eyJhbGc..." }

3. 客户端存储 JWT（localStorage 或 Cookie）

4. 后续请求带 JWT
   GET /api/orders
   Authorization: Bearer eyJhbGc...

5. 服务端验证
   - 用密钥重新计算签名，与 JWT 中签名对比
   - 检查 exp 是否过期
   - 检查 iss/aud 等声明
   验证通过 → 从 Payload 取 userId，处理请求
```

### 签名算法

| 算法 | 类型 | 用法 |
|------|------|------|
| HS256 | 对称（HMAC + SHA-256） | 签发和验证用同一密钥 |
| RS256 | 非对称（RSA + SHA-256） | 私钥签发，公钥验证 |
| ES256 | 非对称（ECDSA + SHA-256） | 私钥签发，公钥验证 |

- **HS256**：简单，但密钥泄露风险高（任何持有密钥的人都能签发）
- **RS256/ES256**：公私钥分离，公钥可公开，私钥只在签发方。微服务场景常用（验证方只需公钥）

### JWT vs Session

| 维度 | Session | JWT |
|------|---------|-----|
| 状态存储 | 服务端（内存/Redis） | 客户端（载荷中） |
| 服务端查 Session | 是 | 否 |
| 撤销 | 简单（删 Session 即可） | 难（需黑名单） |
| 分布式扩展 | 需共享 Session 存储 | 天然支持 |
| 载荷大小 | SessionId 几十字节 | JWT 数百字节到几 KB |
| 安全性 | SessionId 不可读 | 载荷可读（仅签名防篡改） |
| 跨域 | 受 Cookie 同源限制 | Authorization 头跨域友好 |

### JWT 的优势

1. **无状态**：服务端不存会话，水平扩展无需共享存储
2. **跨域友好**：通过 Authorization 头传递，不受 Cookie 同源策略限制
3. **自包含**：载荷中携带用户信息，减少数据库查询
4. **标准化**：RFC 7519，跨语言支持
5. **防篡改**：签名保证完整性

### JWT 的劣势

1. **不可撤销**：签发后到期前一直有效。要主动撤销需黑名单（变回有状态）
2. **载荷暴露**：Base64URL 编码不是加密，任何人可读。**不要放敏感信息**
3. **载荷大**：每次请求带完整 JWT，比 SessionId 大
4. **续期复杂**：要发新 JWT，旧 JWT 仍有效
5. **密钥管理**：HS256 密钥泄露全完；RS256 私钥要安全保管

### 撤销 JWT 的方案

**方案 1：黑名单**

```java
// Redis 维护黑名单
redis.set("jwt:blacklist:" + jti, "1", expirationInSec);

// 验证时检查黑名单
if (redis.exists("jwt:blacklist:" + jti)) {
    throw new InvalidTokenException("Token revoked");
}
```

**方案 2：短有效期 + Refresh Token**

```
Access Token: 短（15 分钟）
Refresh Token: 长（7 天），存服务端可撤销

客户端用 Access Token 调接口
过期后用 Refresh Token 换新 Access Token
登出时删 Refresh Token
```

**方案 3：版本号**

```
JWT 载荷: { userId:42, tokenVersion:1 }
用户表: { id:42, tokenVersion:1 }

验证时检查 JWT 中 tokenVersion 与数据库是否一致
改密码时 tokenVersion+1，所有旧 JWT 失效
```

### 安全注意事项

1. **不要在载荷放敏感信息**：Base64URL 可解码，密码、身份证号等不能放
2. **HTTPS 传输**：JWT 在 Authorization 头，HTTP 明文可被截获
3. **短有效期**：Access Token 建议 15-30 分钟
4. **强密钥**：HS256 密钥至少 256 位随机数
5. **验证所有声明**：exp、iss、aud 等都要校验，不要只验签名
6. **算法白名单**：防止 alg=none 攻击（攻击者把 alg 改成 none 绕过签名）

### 抓包与调试

```bash
# 解码 JWT（不验签）
$ echo "eyJhbGc..." | cut -d. -f2 | base64 -d 2>/dev/null
{"sub":"1234567890","name":"John Doe","iat":1516239022}

# 用 jwt.io 在线调试
# https://jwt.io/

# curl 测试
$ curl -H "Authorization: Bearer eyJhbGc..." https://api.example.com/orders
```

## 代码示例

Java 生成和验证 JWT（jjwt 库）：

```java
import io.jsonwebtoken.*;
import java.util.*;

public class JwtUtil {
    private static final String SECRET = "my-very-secure-secret-key-at-least-256-bits";
    private static final long EXPIRATION = 900_000L;   // 15 分钟

    // 生成 JWT
    public static String generate(Long userId, String username) {
        return Jwts.builder()
            .setSubject(userId.toString())
            .claim("username", username)        // 自定义声明
            .setIssuedAt(new Date())
            .setExpiration(new Date(System.currentTimeMillis() + EXPIRATION))
            .signWith(SignatureAlgorithm.HS256, SECRET)
            .compact();
    }

    // 验证 JWT
    public static Claims verify(String token) {
        try {
            return Jwts.parser()
                .setSigningKey(SECRET)
                .parseClaimsJws(token)     // 验证签名和过期
                .getBody();
        } catch (ExpiredJwtException e) {
            throw new RuntimeException("Token expired");
        } catch (JwtException e) {
            throw new RuntimeException("Invalid token");
        }
    }
}
```

Spring Boot JWT 拦截器：

```java
import org.springframework.web.servlet.HandlerInterceptor;
import javax.servlet.http.*;

public class JwtInterceptor implements HandlerInterceptor {
    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse resp, Object h) throws Exception {
        String auth = req.getHeader("Authorization");
        if (auth == null || !auth.startsWith("Bearer ")) {
            resp.setStatus(401);
            return false;
        }
        try {
            Claims claims = JwtUtil.verify(auth.substring(7));
            req.setAttribute("userId", Long.parseLong(claims.getSubject()));
            return true;
        } catch (Exception e) {
            resp.setStatus(401);
            return false;
        }
    }
}

// 注册拦截器
@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new JwtInterceptor())
            .addPathPatterns("/api/**")
            .excludePathPatterns("/api/login", "/api/register");
    }
}
```

Refresh Token 机制：

```java
@PostMapping("/api/login")
public TokenResponse login(@RequestBody LoginRequest req) {
    User user = authService.login(req);
    String access = JwtUtil.generate(user.getId(), user.getName());   // 15 分钟
    String refresh = UUID.randomUUID().toString();                    // Refresh Token
    redis.setex("refresh:" + refresh, 7 * 86400, user.getId().toString());
    return new TokenResponse(access, refresh);
}

@PostMapping("/api/refresh")
public TokenResponse refresh(@RequestBody RefreshRequest req) {
    String userId = redis.get("refresh:" + req.getRefreshToken());
    if (userId == null) {
        throw new UnauthorizedException("Invalid refresh token");
    }
    String newAccess = JwtUtil.generate(Long.parseLong(userId), ...);
    return new TokenResponse(newAccess, req.getRefreshToken());
}

@PostMapping("/api/logout")
public void logout(@RequestBody RefreshRequest req) {
    redis.del("refresh:" + req.getRefreshToken());   // 撤销 Refresh Token
}
```

## 实战场景

| 场景 | 方案 | 注意点 |
|------|------|--------|
| 前后端分离 | JWT in Authorization | 配 HTTPS，不放敏感信息 |
| 微服务 | RS256 JWT | 公钥分发给各服务验证 |
| 单点登录（SSO） | JWT 跨域传递 | 短期 Access + Refresh |
| 移动端 | JWT | 安全存储，防泄露 |
| IoT 设备 | JWT | 设备身份认证 |
| 内部服务 | mTLS 更合适 | JWT 适合外部用户 |

## 深挖追问

**Q1：JWT 加密吗？**
默认不加密，只签名。载荷 Base64URL 编码可读，签名保证不被篡改。要加密用 JWE（JSON Web Encryption）。

**Q2：JWT 和 OAuth 2.0 什么关系？**
OAuth 2.0 是授权框架，定义流程；JWT 是令牌格式，可作为 Access Token 的实现。OAuth 2.0 不强制用 JWT，但实际中常组合使用。

**Q3：JWT 一定比 Session 好吗？**
不一定。Session 撤销容易、载荷不暴露、载荷小。需要主动撤销、敏感数据的场景 Session 更合适。分布式无状态场景 JWT 更好。

**Q4：alg=none 攻击是什么？**
攻击者把 Header 中 alg 改成 none，签名部分留空，服务端如果没强制算法就会跳过签名验证。防护：算法白名单，拒绝 none。

**Q5：JWT 过期后怎么办？**
Access Token 过期用 Refresh Token 换新的。Refresh Token 过期需重新登录。不要在 Access Token 中放 Refresh Token。

## 易错点

- **"JWT 是加密"** — 不，默认只签名，载荷可读。
- **"JWT 比 Session 安全"** — 不绝对，载荷暴露是风险。
- **"JWT 可以撤销"** — 默认不能，需黑名单或 Refresh Token。
- **"载荷可以放密码"** — 不可以，Base64URL 可解码。
- **"JWT 一定跨域友好"** — 是，但要配合 CORS。

## 总结

JWT 是自包含的令牌格式，由 Header、Payload、Signature 组成，用密钥签名防篡改。优势是无状态、跨域友好、自包含；劣势是不可撤销、载荷暴露、续期复杂。生产推荐：短 Access Token + 长 Refresh Token + HTTPS + 强密钥。载荷不放敏感信息，验证所有声明，算法白名单防 alg=none 攻击。Session 和 JWT 各有适用场景，按需选择。

## 参考资料

- [RFC 7519 — JSON Web Token (JWT)](https://datatracker.ietf.org/doc/html/rfc7519)
- [RFC 7515 — JSON Web Signature (JWS)](https://datatracker.ietf.org/doc/html/rfc7515)
- [JWT.io 调试工具](https://jwt.io/)
- [OWASP — JWT Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
