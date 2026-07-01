# 如何从日志分析 PV 和 UV

## 核心概念

PV（Page View）是页面或接口的访问次数，同一用户多次访问会重复计数。UV（Unique Visitor）是独立访客数，按某种标识去重。这两个指标看起来简单，难点不在计算，而在“口径”：什么算一次访问、谁是“一个用户”、统计多长时间窗口、过滤哪些流量。

Nginx access log 默认格式（combined log format）：

```text
$remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"
```

例如：

```text
192.168.1.10 - - [29/Jun/2026:10:15:30 +0800] "GET /index HTTP/1.1" 200 612 "https://www.google.com" "Mozilla/5.0..."
```

按字段位置：`$1`=IP，`$4`=时间，`$5`=`]`，`$6`=`"GET`，`$7`=`/index`，`$9`=状态码，`$10`=响应字节数。awk 处理时这些位置有用，但更稳妥的做法是配 JSON 日志格式，避免空格、引号解析问题。

## 标准回答

> PV 是访问次数，统计符合条件的日志行数；UV 是独立访客数，需要根据用户标识去重。小规模日志可以用 `grep/awk/sort/uniq/wc` 临时分析：按时间和 URL 过滤后 `wc -l` 得到 PV，提取 userId、cookie 或 IP 后 `sort -u | wc -l` 得到 UV。生产统计要先统一日志格式和口径，过滤静态资源、健康检查、爬虫和异常状态码，大数据量进入 Kafka + Flink/ClickHouse/ELK 做实时或离线分析。回答这类问题的关键是先讲口径，再讲工具。

## 详细机制

### PV/UV/IP/VV 的区分

| 指标 | 定义 | 去重维度 |
|------|------|----------|
| PV | Page View，访问次数 | 不去重 |
| UV | Unique Visitor，独立访客 | 用户标识（登录 ID/设备 ID/Cookie） |
| IP | 独立 IP 数 | IP 地址 |
| VV | Visit View，会话数 | 会话（30 分钟无操作算新会话） |
| DAU | 日活 | 用户标识，按日去重 |

IP 不能完全等同 UV：多个用户可能共享同一个出口 IP（公司、学校、4G 基站），同一用户也可能因为切换网络导致 IP 变化。日志分析时 IP 只是“没有登录态时的兜底标识”，准确 UV 应该用登录用户 ID、设备指纹或匿名 Cookie。

### Nginx 日志格式配置

生产环境推荐配 JSON 格式日志，方便后续解析：

```nginx
log_format json_combined escape=json '{'
  '"time":"$time_iso8601",'
  '"remote_addr":"$remote_addr",'
  '"request_method":"$request_method",'
  '"uri":"$uri",'
  '"status":$status,'
  '"body_bytes_sent":$body_bytes_sent,'
  '"request_time":$request_time,'
  '"http_referer":"$http_referer",'
  '"http_user_agent":"$http_user_agent",'
  '"http_x_forwarded_for":"$http_x_forwarded_for",'
  '"cookie_user_id":"$cookie_user_id"'
'}';
access_log /var/log/nginx/access.log json_combined;
```

`$cookie_user_id` 是从请求 Cookie 中提取 `user_id` 字段，需要在应用层埋这个 Cookie。

### 统计口径要明确的几件事

1. **时间窗口**：按天、按小时、按 5 分钟？
2. **目标路径**：统计全站还是某个 URL？URL 带查询参数是否归一化（`/index?a=1` 和 `/index?b=2` 算不算同一个）？
3. **访客标识**：登录用户 ID、设备 ID、Cookie、IP？
4. **过滤规则**：
   - 静态资源（`.js`、`.css`、`.png`、`.ico`）通常不计入 PV；
   - 健康检查（`/actuator/health`、`/healthz`）必须过滤；
   - 爬虫 User-Agent（Googlebot、Baiduspider）按业务决定是否计入；
   - 内部探活、压测流量要打标过滤；
   - 4xx、5xx 是否计入 PV 要明确（一般 5xx 不算正常 PV）。
5. **时区**：服务器时间和业务时区是否一致？

## 代码示例

### 基于 Nginx 默认 combined 日志的分析

假设日志格式：

```text
192.168.1.10 - - [29/Jun/2026:10:15:30 +0800] "GET /index HTTP/1.1" 200 612 ...
```

统计 2026-06-29 当天首页 PV（`$7` 是 URL，`$9` 是状态码）：

```bash
grep '29/Jun/2026' access.log \
  | awk '$7 == "/index" && $9 ~ /^2/ {count++} END {print count}'
```

按 IP 粗略统计 UV：

```bash
grep '29/Jun/2026' access.log \
  | awk '$7 == "/index" && $9 ~ /^2/ {print $1}' \
  | sort -u \
  | wc -l
```

`sort -u` 去重 + 排序，`wc -l` 数行数。

### 统计访问量最高的 URL Top 20

```bash
awk '$9 ~ /^2/ {print $7}' access.log \
  | sed 's/?.*$//' \                  # 去掉查询参数，把 /index?a=1 归一化成 /index
  | sort | uniq -c | sort -nr | head -20
```

`uniq -c` 输出 "次数 URL"，`sort -nr` 按次数降序。

### 统计独立 IP Top 10（粗略 UV）

```bash
awk '$9 ~ /^2/ {print $1}' access.log \
  | sort | uniq -c | sort -nr | head -10
```

### 从 JSON 日志按 userId 统计 UV

```bash
jq -r 'select(.uri == "/index" and (.status | tostring | startswith("2"))) | .cookie_user_id // empty' access.json.log \
  | sort -u \
  | wc -l
```

`jq -r` 输出原始字符串，`// empty` 过滤 null。

### 实时监控错误率

```bash
tail -f access.log \
  | awk '{total++; if ($9 ~ /^5/) err++} END {print err/total}'
```

实时监控需要 awk 在 END 块输出，但 tail -f 不会触发 END。改用滚动窗口：

```bash
tail -f access.log \
  | stdbuf -oL awk '{total++; if ($9 ~ /^5/) err++; if (total % 100 == 0) printf "err rate: %.2f%%\n", err/total*100}'
```

`stdbuf -oL` 让 awk 输出无缓冲，每 100 行打印一次错误率。

### 大规模日志：ClickHouse 建表

```sql
CREATE TABLE nginx_access (
  time DateTime,
  remote_addr IPv4,
  uri String,
  status UInt16,
  body_bytes_sent UInt64,
  request_time Float32,
  user_id String
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(time)
ORDER BY (uri, time);

-- 统计某天 PV
SELECT count() FROM nginx_access WHERE time >= '2026-06-29' AND time < '2026-06-30' AND status BETWEEN 200 AND 299 AND uri = '/index';

-- 按 userId 统计 UV
SELECT count(DISTINCT user_id) FROM nginx_access WHERE time >= '2026-06-29' AND time < '2026-06-30' AND status BETWEEN 200 AND 299 AND uri = '/index';

-- 按 5 分钟窗口统计 PV/UV
SELECT
  toStartOfFiveMinute(time) AS bucket,
  count() AS pv,
  count(DISTINCT user_id) AS uv
FROM nginx_access
WHERE time >= '2026-06-29' AND time < '2026-06-30'
GROUP BY bucket
ORDER BY bucket;
```

ClickHouse 的 `count(DISTINCT)` 用 HyperLogLog 近似算法（`uniq()`），亿级数据秒级返回，比 MySQL 快几个数量级。

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 线上接口错误率突增 | `awk` 统计 5xx 占比 + `uniq -c` 找错误 URL | 同时看响应时间分布，区分是 5xx 还是慢响应 |
| 排查爬虫流量 | User-Agent 统计 + IP Top | 高频 IP 配合限流（nginx limit_req） |
| 接口 PV 突增排查 | 按时间窗口统计 PV + 按 IP/UA 归类 | 排除压测、内部回调、CDN 回源 |
| URL 归一化 | `sed` 去掉查询参数 | 带版本号参数的 URL（`?v=1.2.3`）归一化后便于聚合 |
| 多机日志合并 | `journalctl` 或 logrotate + Filebeat 采集 | 时间必须 NTP 同步，避免时序错乱 |
| 实时大盘 | Filebeat → Kafka → Flink → ClickHouse/Grafana | 实时计算 UV 用 HyperLogLog，误差 1% 内 |

## 深挖追问

### IP 能作为 UV 吗？

只能作为粗略近似。多个用户可能共享同一个出口 IP（公司、学校、4G 基站 NAT），同一用户也可能因为切换网络、移动网络、代理导致 IP 变化。准确 UV 应该用登录用户 ID、设备指纹、匿名 Cookie 等稳定标识。日志里没有用户标识时，IP 是兜底方案，但要在数据上标注"基于 IP 的近似 UV"。

### 统计 PV 时要过滤哪些请求？

通常要过滤：

- 静态资源：`.js`、`.css`、`.png`、`.jpg`、`.ico`、`.woff`。
- 健康检查：`/actuator/health`、`/healthz`、`/ping`。
- 爬虫流量：Googlebot、Baiduspider、Bingbot（按业务决定是否计入）。
- 压测流量：通常带特殊 Header 或来源 IP 段。
- 内部回调：内部服务间调用是否计入业务 PV 要明确。
- 异常状态码：5xx 一般不算正常 PV，4xx 视情况。

不同业务口径可能不同，但必须在统计前明确口径，避免后续数据打架。

### 日志量很大时为什么不能一直 shell 分析？

`sort` 去重大量数据会消耗大量 CPU、内存和磁盘临时空间（`/tmp`）。多机日志还涉及收集、时间对齐、去重问题。一般经验：

- 单机 GB 级：`awk + sort + uniq` 还能跑，分钟级。
- 多机 TB 级：必须用分布式系统，如 Filebeat 采集 → Kafka 缓冲 → Flink 实时计算 → ClickHouse/ES 存储 → Grafana 展示。

### HyperLogLog 是什么？

HyperLogLog 是一种基数估计算法，用极小内存（12KB）估算集合中不同元素的数量，误差约 0.81%。Redis 的 `PFCOUNT`、ClickHouse 的 `uniq()`、Flink 的 `HyperLogLog` 都用它。亿级 UV 用精确 `count(distinct)` 要 GB 级内存，用 HLL 只需 12KB，是 UV 统计的标准方案。

### UV 怎么去重最准？

按准确度排序：

1. **登录用户 ID**：最准，但只能统计登录用户。
2. **设备指纹（Device Fingerprint）**：浏览器+硬件特征生成，匿名但稳定。
3. **匿名 Cookie**：服务端下发的唯一 Cookie，清缓存会失效。
4. **IP + User-Agent 组合**：比单纯 IP 准一些，但仍可能重复或漂移。
5. **IP**：兜底方案，最不准。

实际系统通常组合：登录用户用 user_id，未登录用户用 cookie，统计时 `count(distinct coalesce(user_id, cookie))`。

## 易错点

- UV 不说明去重标识：直接说"UV 是 10 万"，听众不知道是按 IP 还是按 user_id。
- PV 统计包含静态资源和健康检查：PV 被严重高估。
- URL 不归一化：`/index?a=1` 和 `/index?b=2` 被算成两个 PV。
- 时区不一致：服务器 UTC，业务北京时间，统计跨天时数据错乱。
- 多机日志直接合并：同一条请求被代理转发可能产生多条日志，需去重。
- 用 `cat access.log | grep ...`：大文件用 `grep` 直接搜比 `cat | grep` 快，少一次管道。
- 把实时计算用 `tail -f | awk`：单机临时用可以，生产用 Flink/Spark Streaming。
- `count(DISTINCT)` 在 MySQL 大表上跑：百万级以上数据会全表扫描，迁到 ClickHouse 或用 HLL。

## 总结

PV/UV 分析的关键不是命令写得多花哨，而是先讲清楚口径：统计什么 URL、什么时间窗口、用什么标识去重、过滤哪些流量。小规模日志用 `awk + sort + uniq` 临时分析足够，生产系统必须用 JSON 日志格式 + 集中采集 + OLAP 引擎（ClickHouse）+ 可视化（Grafana）的完整链路。UV 去重标识的选择直接决定数据准确性，IP 只是兜底方案，登录用户 ID 和设备指纹才是首选。

## 参考资料

- [Nginx log_format](https://nginx.org/en/docs/http/ngx_http_log_module.html)
- [ClickHouse Aggregate Functions](https://clickhouse.com/docs/en/sql-reference/aggregate-functions/)
- [HyperLogLog Paper](https://algo.inria.fr/flajolet/Publications/FlFuGaMe07.pdf)
- [Elastic Stack Log Analysis](https://www.elastic.co/guide/en/logstash/current/introduction.html)

---
