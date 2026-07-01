# Text 数据类型可以无限大吗

## 核心概念

`TEXT` 不是无限大。它是 MySQL 中一组有明确字节上限的可变长度大文本类型：`TINYTEXT` 最大 255 字节、`TEXT` 最大 65535 字节、`MEDIUMTEXT` 最大 16MB、`LONGTEXT` 最大 4GB。注意单位是字节，不是字符。`utf8mb4` 下一个汉字最多 4 字节，所以 `TEXT` 实际最多约 1.6 万个汉字。

`TEXT` 和 `VARCHAR` 都是变长字符串，区别在于：`VARCHAR` 数据存在行内（受 65535 字节行大小限制），`TEXT` 存在溢出页，行内只保留指针。这意味着 `TEXT` 不能完全在行内索引，建索引必须指定前缀长度，且不能作为主键。

`TEXT` 还受 `max_allowed_packet` 限制。客户端发送的 SQL 包不能超过该参数（默认 4MB，最大 1GB），所以单次插入 `LONGTEXT` 不可能真的写满 4GB。

## 标准回答

> `TEXT` 不能无限大，分四档：`TINYTEXT` 255B、`TEXT` 64KB、`MEDIUMTEXT` 16MB、`LONGTEXT` 4GB，单位是字节。它存在溢出页，行内只保留指针，建索引必须指定前缀长度，且受 `max_allowed_packet` 限制。短文本用 `VARCHAR`，正文/备注才用 `TEXT`。

核心要点：

1. **四档上限**：255B / 64KB / 16MB / 4GB，单位是字节。
2. **存储方式**：数据存溢出页，行内只留指针（20 字节）。
3. **索引限制**：必须指定前缀长度，不能做主键。
4. **包大小限制**：受 `max_allowed_packet` 约束，默认 4MB。
5. **替代选择**：短文本用 `VARCHAR`，超大文本考虑外部存储（OSS + URL）。

## 详细机制

### 四档 TEXT 对比

| 类型 | 最大字节 | 最大字符（utf8mb4） | 长度前缀 | 典型用途 |
|------|----------|---------------------|----------|----------|
| `TINYTEXT` | 255B | ~63 字符 | 1 字节 | 短描述 |
| `TEXT` | 65,535B | ~1.6 万字符 | 2 字节 | 文章摘要、评论 |
| `MEDIUMTEXT` | 16,777,215B | ~419 万字符 | 3 字节 | 文章正文、富文本 |
| `LONGTEXT` | 4,294,967,295B | ~10 亿字符 | 4 字节 | 超长文本、JSON 数据 |

### 与 VARCHAR 的差异

| 维度 | VARCHAR(N) | TEXT 系列 |
|------|------------|-----------|
| 行内存储 | 是 | 否（溢出页 + 指针） |
| 默认值 | 可以指定 | MySQL 5.7- 不能指定默认值，8.0+ 可用表达式默认值 |
| 主键 | 可以 | 不能 |
| 索引 | 完整索引 | 仅前缀索引 |
| 长度限制 | 行内 65535B | 各档上限 |
| 内存排序 | 按 N 分配 | 按实际长度 |

### 行溢出机制

InnoDB 一行所有列（不含 TEXT/BLOB）总长度不能超过 65535 字节。`TEXT` 字段的数据存到溢出页（off-page），行内只保留 20 字节指针指向溢出页地址。当一行记录过长时，InnoDB 会把 `VARCHAR` 也部分溢出（Dynamic 行格式下完全溢出，Compact 行格式下保留前 768 字节）。

### 索引限制

```sql
-- 错误：TEXT 不能直接建普通索引
CREATE INDEX idx_content ON article(content);
-- ERROR 1170 (42000): BLOB/TEXT column 'content' used in key specification without a key length

-- 正确：必须指定前缀长度
CREATE INDEX idx_content_prefix ON article(content(100));
```

前缀索引只索引前 N 个字符，无法做完整等值匹配和覆盖索引，排序也只能按前缀排序。

## 代码示例

文章主表 + 内容副表的典型拆分：

```sql
-- 主表：列表页字段，全部 VARCHAR/小类型
CREATE TABLE `article` (
  `id` BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  `title` VARCHAR(128) NOT NULL,
  `summary` VARCHAR(512) NOT NULL DEFAULT '',
  `author_id` BIGINT UNSIGNED NOT NULL,
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0草稿 1发布 2下架',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_author_status_time` (`author_id`, `status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 副表：大正文独立存储
CREATE TABLE `article_content` (
  `article_id` BIGINT UNSIGNED PRIMARY KEY,
  `content` MEDIUMTEXT NOT NULL,
  CONSTRAINT `fk_content_article` FOREIGN KEY (`article_id`)
    REFERENCES `article`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

前缀索引示例：

```sql
CREATE INDEX idx_summary_prefix ON `article`(`summary`(50));

-- 查询时只能用前缀匹配，无法做精确等值
SELECT id, title FROM article WHERE summary LIKE 'Java%';
```

## 实战场景

| 场景 | 选型 | 原因 |
|------|------|------|
| 文章正文、富文本 | `MEDIUMTEXT` | 16MB 足够大多数文章，拆副表 |
| 用户评论 | `TEXT` | 64KB 足够，列表页只取摘要 |
| API 响应日志 | `LONGTEXT` | 大请求体可能超 16MB |
| 商品描述、规格 | `VARCHAR(2000)` | 长度可控，能完整索引 |
| 配置 JSON | `JSON` 类型 | 比 `TEXT` 多合法性校验 |
| 头像、附件 | OSS + URL 字段 | 不建议把二进制塞数据库 |

## 深挖追问

### 为什么大字段建议拆表？

InnoDB 缓冲池以页为单位（默认 16KB）。如果主表带 `MEDIUMTEXT`，一页能放下的行数减少，列表查询时缓冲池命中率下降，IO 上升。拆成主表 + 副表后，列表查主表（轻量），详情再查副表，热数据集中、缓存友好。

### TEXT 能做全文索引吗？

可以。MySQL 5.6+ 的 InnoDB 支持 `FULLTEXT` 索引，可以对 `TEXT`/`VARCHAR` 建全文索引：

```sql
ALTER TABLE article ADD FULLTEXT KEY ft_content(content);
SELECT id FROM article WHERE MATCH(content) AGAINST('Java 基础' IN NATURAL LANGUAGE MODE);
```

但中文分词需要 `ngram` 解析器（MySQL 5.7+），且全文索引对中文支持不如 ElasticSearch。生产搜索建议同步到 ES。

### LONGTEXT 真的能存 4GB 吗？

理论上可以，但受三层限制：`max_allowed_packet`（默认 4MB，最大 1GB）、客户端缓冲、网络传输。要存超 16MB 数据，通常用流式预处理语句分块写入，或直接走对象存储。

### TEXT 字段查询慢怎么办？

- 不要 `SELECT *`，列表页只取必要字段。
- 大字段拆副表。
- 排序、分组不要带 `TEXT` 列。
- 模糊查询改用 ES 或全文索引。
- 必要时把热字段冗余到主表作为 `VARCHAR`，建索引。

### BLOB 和 TEXT 区别？

`BLOB` 是二进制大对象，按字节比较，没有字符集和校对规则；`TEXT` 是字符文本，按字符集比较。`BLOB` 适合存图片、加密数据、序列化字节；`TEXT` 适合存可读文本。

## 易错点

- 把 `TEXT` 当成"无上限"使用，超过 `max_allowed_packet` 报错。
- 列表查询 `SELECT *` 返回大字段，浪费带宽和内存。
- 在 `TEXT` 上建普通索引报错，没意识到必须指定前缀长度。
- 把头像、PDF 等二进制存成 `BLOB`，导致表膨胀、备份变慢。
- 频繁 `LIKE '%xxx%'` 模糊查询大文本字段，触发全表扫描。
- 大字段不拆副表，列表页查询时缓冲池命中率暴跌。

## 总结

`TEXT` 不是无限大，四档上限分别是 255B、64KB、16MB、4GB（字节）。它存在溢出页，行内只留指针，建索引必须指定前缀长度，不能做主键。短文本用 `VARCHAR`，长正文用 `MEDIUMTEXT` 并拆副表，二进制大对象用 `BLOB` 或对象存储。大字段的核心管理思路是"少读、少查、少带回客户端"。

## 参考资料

- [MySQL 8.0 The BLOB and TEXT Types](https://dev.mysql.com/doc/refman/8.0/en/blob.html)
- [MySQL 8.0 Data Type Storage Requirements](https://dev.mysql.com/doc/refman/8.0/en/storage-requirements.html)
- [MySQL 8.0 InnoDB Row Format](https://dev.mysql.com/doc/refman/8.0/en/innodb-row-format.html)

---
