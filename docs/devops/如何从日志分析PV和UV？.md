# 如何从日志分析 PV 和 UV？

## 核心概念

PV（Page View）表示页面或接口访问次数，同一个用户多次访问会重复计数。UV（Unique Visitor）表示独立访客数，通常按用户 ID、设备 ID、Cookie 或 IP 去重。日志分析 PV/UV 的关键是明确统计口径：统计时间窗口、目标路径、访客标识、过滤规则和日志格式。

常见 Nginx access log 格式：

```text
$remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent" "$http_cookie"
```

## 面试官想考什么

- 是否能区分 PV、UV、IP、VV 等指标；
- 是否知道 UV 依赖去重标识，IP 不能完全等同用户；
- 是否能用 Linux 命令快速统计日志；
- 是否考虑状态码、静态资源、爬虫、内网探活等过滤；
- 是否知道大规模日志应使用 ELK、ClickHouse、Hive/Spark 等系统。

## 标准回答

> PV 是访问次数，直接统计符合条件的日志行数；UV 是独立访客数，需要根据用户标识去重。小规模日志可以用 `grep/awk/sort/uniq/wc` 临时分析，例如按时间和 URL 过滤后统计行数得到 PV，提取 userId、cookie 或 IP 去重得到 UV。生产统计要先统一日志格式和口径，过滤静态资源、健康检查、爬虫和异常状态码，大数据量通常进入 Kafka + Flink/ClickHouse/ELK 做实时或离线分析。

## 深挖追问

### IP 能作为 UV 吗？

只能作为粗略近似。多个用户可能共享同一个出口 IP，同一用户也可能因为移动网络、代理、VPN 导致 IP 变化。更准确的 UV 应使用登录用户 ID、设备 ID、匿名 Cookie 等稳定标识。

### 统计 PV 时要过滤哪些请求？

通常要过滤静态资源（js/css/png）、健康检查（`/actuator/health`）、爬虫、压测流量、内部回调，以及 4xx/5xx 是否计入也要提前定义。不同业务口径可能不同。

### 日志量很大时为什么不能一直 shell 分析？

`sort` 去重大量数据会消耗大量 CPU、内存和磁盘临时空间；多机日志还涉及收集和时间对齐。大规模场景应把日志采集到集中系统，用 ES、ClickHouse、Hive、Spark、Flink 等处理。

## 实战场景/代码示例

假设 access.log 每行第 1 列是 IP，第 4 列是时间，第 7 列是 URL：

### 统计某天首页 PV

```bash
grep '23/Jun/2026' access.log \
  | awk '$7 == "/index" && $9 ~ /^2/ {print}' \
  | wc -l
```

### 按 IP 粗略统计 UV

```bash
grep '23/Jun/2026' access.log \
  | awk '$7 == "/index" && $9 ~ /^2/ {print $1}' \
  | sort -u \
  | wc -l
```

### 统计访问量最高的 URL

```bash
awk '$9 ~ /^2/ {print $7}' access.log \
  | sed 's/?[^ ]*//' \
  | sort | uniq -c | sort -nr | head -20
```

### 从 JSON 日志按 userId 统计 UV

```bash
jq -r 'select(.path=="/index" and (.status|tostring|startswith("2"))) | .userId' app.json.log \
  | grep -v '^null$' \
  | sort -u \
  | wc -l
```

## 易错点/总结

- UV 必须说明去重标识，不能默认等同 IP；
- PV 统计要明确是否包含刷新、失败请求、静态资源和爬虫；
- 多机日志要注意时区、时间同步、重复采集和日志丢失；
- URL 带查询参数时通常要归一化，否则同一路径会被拆散；
- shell 适合临时分析，大规模和长期指标应进入日志平台；
- 面试回答要先讲口径，再讲命令或架构。

## 参考资料

- Nginx access log 文档
- Elastic Stack / ClickHouse 日志分析实践
