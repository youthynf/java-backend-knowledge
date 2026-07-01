# 存储引擎

本目录覆盖 MySQL 存储引擎的选型与对比、InnoDB 与 MyISAM 的差异、InnoDB 的数据组织方式等核心知识点。

## 目录

- [InnoDB 与 MyISAM 区别是什么](InnoDB与MyISAM区别是什么？.md) — 事务/锁/外键/聚簇索引/崩溃恢复五个维度的核心差异
- [InnoDB 和 MyISAM 的数据文件组织方式有什么不同](InnoDB和MyISAM的数据文件组织方式有什么不同？.md) — .ibd vs .MYD/.MYI，以及 MySQL 8.0 移除 .frm 的影响
- [InnoDB 是如何存储数据的](InnoDB是如何存储数据的？.md) — 表空间/段/区/页/行五层结构与数据页内部布局
- [MySQL 为什么选择 InnoDB 作为默认存储引擎](MySQL为什么选择InnoDB作为默认存储引擎？.md) — 事务/行锁/MVCC/外键/崩溃恢复五项能力
- [MySQL 常用的存储引擎有哪些](MySQL常用的存储引擎有哪些？.md) — InnoDB/MyISAM/Memory/Archive/CSV/NDB 对比与选型

---
