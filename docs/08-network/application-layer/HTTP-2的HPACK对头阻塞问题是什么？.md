# HTTP/2 的 HPACK 队头阻塞问题是什么

## 核心概念

HTTP/2 用 HPACK 算法压缩头部，引入"动态表"让重复头部只发索引号。但动态表有时序性——后一个请求依赖前一个请求建立的动态表。如果前一个请求的包丢失，动态表未及时更新，后续用动态表索引的请求无法解码，被阻塞等重传。这就是 HTTP/2 的 HPACK 队头阻塞，发生在 HTTP/2 应用层（不同于 TCP 层队头阻塞）。HTTP/3 用 QPACK 解决。

## 标准回答

HPACK 队头阻塞的产生：

1. HTTP/2 多请求复用单连接，动态表共享
2. 请求 1 的头部加入动态表（如 `:path: /users/1` 索引 62）
3. 请求 2 用动态表索引 62 编码（只发数字 62）
4. 如果请求 1 的包丢失，动态表未更新到对端
5. 请求 2 的索引 62 对端无法解码，必须等请求 1 重传

QPACK 的解决：

- 用两个特殊单向 Stream 异步同步动态表
- 编码方收到确认后才用动态表索引
- 大部分情况用静态表，动态表更新不阻塞请求解码

## 详细机制

### HPACK 动态表的工作

```
请求 1: :path: /users/1, user-agent: Mozilla/5.0...
  - /users/1 不在静态表 → 加入动态表索引 62
  - user-agent 太长 → 加入动态表索引 63
  - 实际发送：索引 62, 索引 63（短）

请求 2: :path: /users/2, user-agent: Mozilla/5.0...
  - /users/2 不在静态表 → 加入动态表索引 64
  - user-agent 已在动态表索引 63 → 直接发 63
  - 实际发送：索引 64, 索引 63
```

后续请求只发索引号，省流量。

### HPACK 队头阻塞的产生

```
HTTP/2 单 TCP 连接，多 Stream 复用：
Stream1: HEADERS（含动态表更新：索引 62 = /users/1）
Stream2: HEADERS（用动态表索引 62 编码）

Stream1 包丢失 → 对端没收到动态表更新
Stream2 包到达 → 对端收到索引 62，但动态表没这个索引
→ Stream2 无法解码，必须等 Stream1 重传
```

队头阻塞发生在 HTTP/2 应用层，与 TCP 层队头阻塞不同：

- TCP 层 HOL：TCP 字节流有序，丢包阻塞所有 Stream
- HPACK HOL：动态表时序依赖，丢包阻塞用动态表的 Stream

### QPACK 的解决

QPACK 是 HTTP/3 版本的 HPACK，用两个特殊单向 Stream 异步同步动态表：

**QPACK Encoder Stream**（编码方 → 解码方）：

```
发送动态表更新：
  "插入 :path=/users/1 到动态表索引 62"
  "插入 user-agent=Mozilla... 到动态表索引 63"
```

这个 Stream 是独立的，可以独立于 HTTP 请求 Stream 传输。

**QPACK Decoder Stream**（解码方 → 编码方）：

```
确认动态表更新：
  "已收到索引 62 插入"
  "已收到索引 63 插入"
```

编码方收到确认后，才用动态表索引编码后续请求。

### QPACK 如何避免阻塞

```
Stream1: HEADERS（用静态表，无动态表依赖）→ 可独立解码
QPACK Encoder Stream: 插入 /users/1 到索引 62
QPACK Decoder Stream: 确认索引 62 已更新

Stream2: HEADERS（用动态表索引 62）→ 必须等确认
  - 如果 QPACK Encoder Stream 的包丢失 → Stream2 无法解码
  - 但 Stream1 不受影响（不依赖动态表）
```

QPACK 把动态表同步放在独立 Stream，丢失只影响用动态表的请求，不用动态表的请求（大部分）不受影响。

### 编码策略

QPACK 编码方可选择：

- **立即用动态表索引**：可能阻塞（如果对端没确认）
- **先用字面值（不压缩）**：不阻塞但流量大
- **混合**：静态表用索引，动态表新条目用字面值

实际中大部分头部用静态表已足够，动态表更新异步进行，阻塞概率低。

### 静态表对比

| 项 | HPACK 静态表 | QPACK 静态表 |
|----|-------------|-------------|
| 条目数 | 61 | 99 |
| 内容 | 高频头部 | 更多高频头部 |
| 用法 | 索引号直接编码 | 同 |

QPACK 静态表更大，减少对动态表的依赖，进一步降低阻塞概率。

### 抓包示例

```bash
# HTTP/2 HPACK 阻塞场景（模拟丢包）
$ tc qdisc add dev eth0 root netem loss 5%
$ curl --http2 https://example.com/a https://example.com/b

# 抓包看 Stream 间影响
$ tshark -i any -Y "http2" -O http2
Frame 1: HEADERS (stream=1, dynamic table update: insert /a)
Frame 2: HEADERS (stream=3, encoded with dynamic index 62)  ← 依赖动态表
# 如果 Frame 1 丢失，Frame 2 无法解码
```

## 代码示例

QPACK 主要在协议栈内部，应用层无需关心。但可以观察：

```bash
# 用 nghttp3 测试 HTTP/3
$ nghttp3 -v https://example.com/
[QUIC] Connected, TLS 1.3, ALPN h3
[QPACK] Static table hits: 5
[QPACK] Dynamic table inserts: 2
[QPACK] Dynamic table acknowledgements: 2
# 大部分头部用静态表，动态表用得少
```

服务端启用 HTTP/3（Caddy）：

```caddyfile
example.com {
    protocols h1 h2 h3
    reverse_proxy backend:8080
}
```

## 实战场景

| 场景 | 影响 | 处理 |
|------|------|------|
| 高丢包率链路 | HPACK 阻塞明显 | 升级 HTTP/3 |
| 移动端弱网 | 动态表更新易丢 | HTTP/3 + QPACK |
| 大量重复头部 | 动态表收益大 | HTTP/2 或 HTTP/3 |
| 内网低延迟 | HPACK 阻塞影响小 | HTTP/2 够用 |
| CDN 静态资源 | 头部高度重复 | 启用 HTTP/2 或 HTTP/3 |

## 深挖追问

**Q1：HPACK 队头阻塞和 TCP 队头阻塞一样吗？**
不一样。TCP HOL 是字节流有序导致的，HTTP/2 多 Stream 都受影响；HPACK HOL 是动态表时序依赖，只影响用动态表的请求。

**Q2：QPACK 完全消除队头阻塞吗？**
不完全。用动态表索引的请求仍可能阻塞（如果 QPACK Encoder Stream 丢包）。但大部分请求用静态表，不受影响。

**Q3：QPACK 和 HPACK 的静态表差多少？**
HPACK 61 项，QPACK 99 项。QPACK 把更多高频头部纳入静态表，减少对动态表的依赖。

**Q4：动态表会无限增长吗？**
不会。两端协商动态表大小（SETTINGS_QPACK_MAX_TABLE_CAPACITY），超限 LRU 淘汰。

**Q5：HTTP/2 怎么减少 HPACK 阻塞？**
尽量用静态表，少用动态表。但 HTTP/2 的 HPACK 设计本身有时序依赖，根本解决要靠 HTTP/3 的 QPACK。

## 易错点

- **"HPACK 队头阻塞 = TCP 队头阻塞"** — 不是，前者是动态表时序依赖，后者是字节流有序。
- **"HTTP/2 完全消除队头阻塞"** — 不，HPACK 和 TCP 都有 HOL。
- **"QPACK 完全消除队头阻塞"** — 不完全，用动态表的请求仍可能阻塞。
- **"动态表越大越好"** — 不，过大占内存且 LRU 淘汰可能浪费。
- **"HTTP/3 不需要头部压缩"** — 需要，QPACK 是 HTTP/3 的 HPACK 升级版。

## 总结

HTTP/2 HPACK 队头阻塞源于动态表的时序依赖：前一个请求的包丢失会导致后续用动态表索引的请求无法解码。HTTP/3 用 QPACK 解决：动态表同步放在独立 Stream，编码方收到确认后才用索引，大部分请求用静态表不依赖动态表。但 QPACK 不完全消除阻塞，用动态表的请求仍可能受影响。生产中高丢包链路升级 HTTP/3 收益明显，低延迟内网 HTTP/2 够用。

## 参考资料

- [RFC 7541 — HPACK Header Compression](https://datatracker.ietf.org/doc/html/rfc7541)
- [RFC 9204 — QPACK Header Compression for HTTP/3](https://datatracker.ietf.org/doc/html/rfc9204)
- [QPACK Design](https://quicwg.org/base-drafts/draft-ietf-quic-qpack.html)
