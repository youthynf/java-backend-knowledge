# Text 数据类型可以无限大吗？

## 核心概念

MySQL `TEXT` 不是无限大，它是一组有明确上限的可变长度大文本类型：`TINYTEXT` 最多 255 字节，`TEXT` 最多 65,535 字节，`MEDIUMTEXT` 最多 16MB，`LONGTEXT` 最多 4GB。注意单位是字节不是字符，`utf8mb4` 下一个字符可能占 1～4 字节。

`TEXT` 大字段会影响行读取、网络传输、临时表、排序和索引。InnoDB 可能把较大的内容放到页外，主记录中保存部分数据或指针，因此不能把它当成普通短字段随意查询。

## 面试官想考什么

- 是否知道 `TEXT` 系列容量上限；
- 是否能区分字节、字符和字符集影响；
- 是否理解 `TEXT` 与 `VARCHAR` 的取舍；
- 是否知道大字段对性能、索引和表设计的影响。

## 标准回答

> `TEXT` 不能无限大，普通 `TEXT` 最大约 64KB，`MEDIUMTEXT` 约 16MB，`LONGTEXT` 约 4GB，实际还受 `max_allowed_packet`、行格式和业务限制影响。短文本、需要完整索引或长度可控的字段优先用 `VARCHAR`；文章正文、备注、富文本这类长内容才考虑 `TEXT`。大文本不要频繁参与排序、分组和模糊查询，必要时拆到扩展表。

## 深挖追问

### TEXT 和 VARCHAR 怎么选？

`VARCHAR` 适合标题、昵称、编码等长度可控且经常作为查询条件的字段；`TEXT` 适合正文、备注等展示型大字段。`TEXT` 建索引通常需要指定前缀长度，且前缀索引无法覆盖所有等值和排序需求。

### 为什么大字段建议拆表？

列表页通常只需要标题、状态、时间等轻量字段，如果把 `LONGTEXT` 放主表，高频查询会降低缓存命中率并增加 IO。拆成主表和内容表后，列表查主表，详情再查正文。

## 实战场景 / SQL 示例

```sql
CREATE TABLE article (
  id BIGINT PRIMARY KEY,
  title VARCHAR(128) NOT NULL,
  author_id BIGINT NOT NULL,
  status TINYINT NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_author_status_time(author_id, status, created_at)
);

CREATE TABLE article_content (
  article_id BIGINT PRIMARY KEY,
  content MEDIUMTEXT NOT NULL
);
```

## 易错点 / 总结

- `TEXT` 上限按字节计算；
- 大字段不适合无约束 `LIKE '%Text 数据类型可以无限大吗%'`，搜索需求应考虑全文索引或 ES；
- 大字段写入还受 `max_allowed_packet` 等配置限制；
- 能明确上限且需要索引时，优先考虑 `VARCHAR`；
- 不要在列表接口默认返回大文本字段。
