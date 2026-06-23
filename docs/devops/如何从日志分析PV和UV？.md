# 如何从日志分析 PV 和 UV？

## 核心概念

- **PV（Page View）**：页面或接口被访问的次数，同一用户多次访问会重复计数；
- **UV（Unique Visitor）**：独立访客数，通常按用户 ID、设备 ID、IP 等维度去重统计。

日志分析 PV/UV 的关键是确定统计口径、时间窗口和去重字段。

## 面试官想考什么

- 是否理解 PV 和 UV 的区别；
- 是否能用 Linux 命令快速分析访问日志；
- 是否会考虑统计口径、过滤规则和日志格式；
- 是否知道大规模日志应使用专业日志平台或数仓。

## 标准回答

> 从日志分析 PV/UV，首先要明确时间范围和日志格式。PV 可以统计符合条件的访问日志行数；UV 需要按用户标识去重，如果没有用户 ID，可以退而使用 IP 或设备标识，但准确性会下降。小规模日志可以用 `grep`、`awk`、`sort`、`uniq` 分析，大规模场景更适合用 ELK、ClickHouse、Hive 等工具。

## 示例命令

假设 Nginx 日志中第 1 列是 IP，第 7 列是 URL：

```bash
# 统计某天某接口 PV
grep '23/Jun/2026' access.log | awk '$7 ~ /\/api\/orders/ {count++} END {print count}'

# 按 IP 粗略统计 UV
grep '23/Jun/2026' access.log | awk '$7 ~ /\/api\/orders/ {print $1}' | sort | uniq | wc -l

# 查看访问量最高的 URL
awk '{print $7}' access.log | sort | uniq -c | sort -nr | head
```

## 深挖追问

### 用 IP 统计 UV 准确吗？

不完全准确。多人可能共用同一个出口 IP，一个用户也可能切换网络导致多个 IP。更可靠的方式是登录用户 ID、设备 ID 或埋点生成的 visitorId。

## 易错点/总结

- 统计前要过滤静态资源、爬虫、健康检查等无效请求；
- 明确时区和时间窗口；
- UV 去重字段会直接影响结果准确性；
- 大文件不要盲目 `cat`，优先流式处理或使用日志平台。
