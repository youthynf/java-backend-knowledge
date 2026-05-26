# MySQL的日志文件有哪些？

MySQL的日志文件有哪些？
redo log 重做日志：InnoDB存储引擎层生成的日志，实现事务的持久性，主要用于崩溃恢复；
undo log 回滚日志：InnoDB存储引擎层生成的日志，实现事务的原子性，主要用于事务回滚和MVCC；
bin log 二进制日志：Server层生成的日志，主要用于数据备份和主从复制；
relay log 中继日志：用于主从复制场景下，slave通过io线程拷贝master的bin log后本地生成的日志；
slow log 慢查询日志：用于记录执行时间过长的sql，需要设置阈值后手动开启；
