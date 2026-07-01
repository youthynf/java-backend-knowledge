# ElasticSearch

ElasticSearch 是基于 Lucene 的开源分布式搜索和分析引擎，2010 年由 Shay Banon 开发。结合 Kibana、Logstash、Beats 组成 Elastic Stack（ELK），广泛用于全文检索、日志分析、指标监控、信息安全等近实时分析场景。核心能力来自倒排索引，适合海量数据的搜索和聚合，不适合做强一致事务主库。

## 目录

- [ElasticSearch 是什么](ElasticSearch是什么？.md) — 倒排索引、分片副本、写入流程、查询 DSL、集群管理

## 核心要点

- **近实时（NRT）**：数据写入后默认 1 秒（refresh）可被搜索，不是实时。
- **倒排索引**：词项（Term）到文档列表（Postings List）的映射，是全文检索的基础。
- **分片与副本**：主分片（Primary Shard）负责数据，副本分片（Replica Shard）负责高可用；主副不在同一节点。
- **写入流程**：路由 → 写主分片（buffer + translog）→ 副本 → refresh 生成 segment（可搜索）→ flush 持久化。
- **查询流程**：Query Phase（各分片查 doc id + 评分）→ Fetch Phase（拉取文档内容）。
- **相关评分**：5.x 起默认 BM25（替代 TF-IDF），对长文档更友好。
- **不适用**：强一致事务、频繁更新、深分页。
