# CHAR 和 VARCHAR 区别是什么

## 核心概念

`CHAR(N)` 和 `VARCHAR(N)` 是 MySQL 中两种常用字符串类型。`CHAR` 是定长字符串，定义时指定长度 N，无论实际存多少字符都按 N 占用空间，不足末尾补空格；`VARCHAR` 是变长字符串，按实际字符数占用空间，外加 1~2 字节记录长度。

两者最直观的差异是"占多少空间"和"如何处理长度变化"。`CHAR` 适合长度几乎固定的字段（如国家码、状态码、MD5 哈希），写入快、无碎片；`VARCHAR` 适合长度变化大的字段（如昵称、标题、备注），节省空间但更新可能引起页分裂。

类型定义中的 N 是字符数，不是字节数。`utf8mb4` 下一个汉字最多 4 字节，所以 `VARCHAR(100)` 实际可能占 400+ 字节。这一点是面试常被追问的"陷阱"。

## 标准回答

> `CHAR` 定长、`VARCHAR` 变长。`CHAR(N)` 实际存 N 个字符，不足补空格，最多 255 字符；`VARCHAR(N)` 按实际长度存，外加长度前缀，最多 65535 字节（受行大小限制）。短且固定长度的字段用 `CHAR`，长度变化大的用 `VARCHAR`。

主要差异点：

1. **存储方式**：`CHAR` 定长补空格，`VARCHAR` 变长 + 长度前缀。
2. **空间占用**：`CHAR` 固定，`VARCHAR` 按需。
3. **长度上限**：`CHAR` 最多 255 字符，`VARCHAR` 最多 65535 字节。
4. **更新行为**：`CHAR` 长度不变，无碎片；`VARCHAR` 变长可能引起行迁移/页分裂。
5. **N 的含义**：字符数，实际字节数依赖字符集。

## 详细机制

### 存储结构

`CHAR(N)`：固定占 N×字符集最大字节。例如 `CHAR(10)` 在 `utf8mb4` 下占 40 字节，无论实际存什么。

`VARCHAR(N)`：实际字符字节 + 1~2 字节长度前缀。长度 ≤255 时用 1 字节，>255 时用 2 字节。`VARCHAR(100)` 存 "abc" 在 `utf8mb4` 下占 3+1=4 字节。

### 末尾空格处理

| 操作 | CHAR | VARCHAR |
|------|------|---------|
| 写入 "abc " | 末尾空格被去除后补到 N 字符 | 末尾空格保留 |
| 读取 | 末尾补的空格被去除 | 原样返回 |

注意 `VARCHAR` 写入时末尾空格不会被截掉，但读取时也不会补；`CHAR` 写入时末尾空格会被去掉，再补到 N 长度。这一差异在比较时也会体现：`CHAR` 比较会忽略末尾空格，`VARCHAR` 在 MySQL 5.0+ 默认 `PAD CHAR TO FULL LENGTH` 关闭时也忽略末尾空格。

### 超长处理

在严格 SQL 模式下（`sql_mode='STRICT_TRANS_TABLES'`），超长写入直接报错；非严格模式下会截断并给 warning。生产环境必须开严格模式，避免数据被静默截断。

### N 的字符 vs 字节含义

非二进制字符集（`utf8`、`utf8mb4`）下，N 是字符数；二进制字符集（`binary`、`varbinary`）下，N 是字节数。`VARCHAR(N)` 实际最大字节数受行大小限制：一行所有列字节数之和（不含 TEXT/BLOB）≤ 65535。

## 代码示例

```sql
CREATE TABLE `char_demo` (
  `id` BIGINT PRIMARY KEY,
  `country_code` CHAR(2) NOT NULL COMMENT '国家码，ISO 3166',
  `md5_hash` CHAR(32) NOT NULL COMMENT 'MD5，固定32位',
  `nickname` VARCHAR(64) NOT NULL COMMENT '昵称，长度变化大',
  `bio` VARCHAR(255) DEFAULT NULL COMMENT '个人简介'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `char_demo` (id, country_code, md5_hash, nickname, bio)
VALUES (1, 'CN', 'd41d8cd98f00b204e9800998ecf8427e', 'alice', 'hello');
-- country_code 占 2*4=8 字节（utf8mb4 最大4字节/字符）
-- md5_hash 占 32*4=128 字节
-- nickname 占 5+1=6 字节
```

## 实战场景

| 场景 | 选型 | 原因 |
|------|------|------|
| 国家码、币种码 | `CHAR(2)`/`CHAR(3)` | 长度固定，无碎片 |
| MD5、SHA 哈希 | `CHAR(32)`/`CHAR(40)` | 固定长度，索引紧凑 |
| 用户昵称、标题 | `VARCHAR(64)` | 长度变化大，省空间 |
| 邮箱、URL | `VARCHAR(255)` | 长度可控但有变化 |
| 短状态码（如 "Y"/"N"） | `CHAR(1)` | 1 字节，无长度前缀开销 |
| 文章正文 | `TEXT` 系列 | `VARCHAR` 上限不够 |

## 深挖追问

### CHAR 一定比 VARCHAR 快吗？

不一定。`CHAR` 的优势在长度固定、无变长前缀开销、更新无碎片。但如果 `CHAR(N)` 设得很大但实际只用几个字符（如 `CHAR(100)` 存 "abc"），反而浪费空间和缓冲池。判断标准是"长度是否真的固定"。

### VARCHAR(N) 的 N 设很大有副作用吗？

有。`VARCHAR(N)` 在内存中排序/分组时按 N 的最大长度分配内存（虽然磁盘上按实际长度存），所以 `VARCHAR(1000)` 用于 `ORDER BY` 时会占用 1000×字符集最大字节内存。MySQL 8.0 引入了 `Sort_buffer` 优化但仍有上限。

### VARCHAR 主键和 CHAR 主键哪个好？

主键建议用整型（`BIGINT`）。如果非要用字符串，长度固定的（如 `CHAR(32)` UUID）比 `VARCHAR` 索引更紧凑，但 UUID 本身会让索引随机写入、B+Tree 分裂频繁。生产环境应避免 UUID 当主键。

### 二进制字符集下 CHAR/VARCHAR 有什么不同？

`BINARY(N)`/`VARBINARY(N)` 按字节存储，N 是字节数。比较时按字节比较，不会受字符集校对规则影响。适合存加密后的字节串、UUID 字节形式等。

### CHAR(255) 还能用吗？为什么上限是 255？

`CHAR` 上限是 255 字符，是历史遗留（MySQL 4.1 之前用 1 字节记长度）。`VARCHAR` 上限是 65535 字节（行内），是行格式限制。需要超过 255 字符的定长字段没有意义，应该用 `VARCHAR`。

## 易错点

- 把 N 当成字节数。`utf8mb4` 下 `VARCHAR(100)` 最多存 100 个字符，但占字节数最高 400+。
- 给所有字符串字段无脑用 `VARCHAR(255)`，导致排序/聚合内存浪费。
- 期望 `CHAR` 末尾空格被保留。`CHAR` 写入会去尾空格再补齐。
- 长度变化的字段用 `CHAR`，导致空间浪费。
- 期望严格模式截断时只给 warning。生产环境务必开 `STRICT_TRANS_TABLES`。
- 频繁更新的字段用 `VARCHAR` 又建在主表，导致行迁移和页分裂。

## 总结

`CHAR` 定长、`VARCHAR` 变长，差异在存储方式、空间占用和更新行为。短且固定长度的码值字段选 `CHAR`，长度变化大的文本选 `VARCHAR`。N 的含义是字符数，实际占字节数依赖字符集。工程上多数业务字段用 `VARCHAR`，固定码值字段用 `CHAR`，大文本用 `TEXT` 系列。

## 参考资料

- [MySQL 8.0 The CHAR and VARCHAR Types](https://dev.mysql.com/doc/refman/8.0/en/char.html)
- [MySQL 8.0 String Type Overview](https://dev.mysql.com/doc/refman/8.0/en/string-type-overview.html)

---
