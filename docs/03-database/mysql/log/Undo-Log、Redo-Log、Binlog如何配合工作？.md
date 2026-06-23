# Undo Log、Redo Log、Binlog如何配合工作？

## 核心概念

Undo Log、Redo Log、Binlog如何配合工作？
有没有想过这样一个问题：你在APP上完成一笔支付，点击确认后手机突然黑屏，再次打开却发现支付成功了；或者数据库突然宕机，重启后数据却一条没少。
这背后不是运气，而是MySQL里3个「隐形保镖」在默默守护——Undo Log、Redo Log、Binlog。它们分工明确又协同作战，不仅保证了数据安全（ACID特性），还支撑着亿级用户依赖的主从复制。今天就用最通俗的话，把这三者的配合逻辑讲明白！
先认人：3个日志的核心角色（看完就忘不掉）
Undo Log是InnoDB存储引擎特有的日志，用于保证事务「原子性」（要么全成要么全败）和「隔离性」（读写不冲突，也就是MVCC多版本并发控制），其记录的是数据被修改前的原始值（比如把「age=4」改成「age=3」，就记录「age=4」），属于逻辑日志。通俗理解，Undo Log就像你编辑文档前先备份，改砸了能一键恢复，在事务失败或手动rollback时，可以利用它把数据还原回去。
EkKTbQUvYoQXMzxIFFBcdayynjc.webp

Redo Log同样也是InnoDB存储引擎特有的日志，核心作用是用于保证事务「持久性」（一旦提交，数据就不会丢），记录内容是数据页的物理修改（比如「在第100页第5个位置写入『Li』」）。通俗理解，可以把它看作是记账本，好比你在店里消费，老板先把账记在小本子上，哪怕后续账本丢了，只要小本子在就能补全。MySQL里，数据先改内存，再异步刷盘，Redo Log就负责记录这些内存修改，就算断电重启，也能靠它恢复没刷盘的数据（这就是WAL写前日志技术）。
BNrRbmRAeoqb34x5gwncJa9enLh.webp

Binlog是MySQL数据库本身提供的日志，是MySQL Server层的组件，供所有存储引擎使用，其核心作用是实现主从复制（集群同步）和数据备份恢复（PITR时间点恢复），记录的是数据库执行的所有写入性SQL（增删改）或行变化，属于逻辑日志。通俗理解，可以把它看作是档案室，记录了所有重要操作。主库把Binlog发给从库，从库照着执行就能保持数据一致；万一数据库全丢了，也能通过Binlog恢复到任意时间点的状态。
B7vIbLt4GoAkr9xsdA2cpoqbnVe.webp

看实战：一条Update语句，3个日志怎么配合
光说不练假把式，我们以「UPDATE user SET name = 'Li' WHERE id = 1;」（原name是'Wang'）为例，全程拆解它们的协同流程：
第一阶段：执行修改，先留后路
加载数据：InnoDB引擎先把id=1对应的数据页，从磁盘加载到内存（Buffer Pool）——毕竟修改要先操作内存。
写Undo Log：修改前先记「后悔药」，生成一条Undo Log，内容是「id=1的name原值是Wang」。这里有个关键配合：Undo Log本身也是数据，为了防止它丢失，写Undo Log的操作会同时生成Redo Log，相当于给「后悔药」也上了保险。
更新内存：在Buffer Pool里把name改成'Li'。此时内存里的数据和磁盘不一致（这就是「脏页」），但还没真正刷到磁盘。
H09lbpc8Ao0QXwx2yflcnFbZncd.webp

第二阶段：两阶段提交，保证一致（核心重点！）
这里要解决一个关键问题：Redo Log在引擎层，Binlog在Server层，怎么确保两者记录的操作完全一致？比如不能出现「Redo Log记了修改，Binlog没记」，否则主从会不一致。
答案就是「两阶段提交（2PC）」，相当于引擎层和Server层的「握手协议」：
Redo Log Prepare（准备阶段）：引擎把本次事务的Redo Log写入磁盘，状态标记为「PREPARE」。此时引擎层已经准备好提交，但还没最终确认。
Binlog Write（写入阶段）：MySQL Server层把这条Update语句的Binlog写入磁盘。一旦Binlog落盘，就意味着这个操作在逻辑上已经永久生效——后续会同步给从库。
Redo Log Commit（提交阶段）：Server层通知引擎「Binlog写完了」，引擎就把Redo Log的状态改成「COMMIT」。到这一步，整个事务才算正式结束。
HTmqbPpWeoZCMpxzKnDcGax3nyf.webp

懂原理：崩溃了怎么恢复？这2种场景必记
为什么一定要搞两阶段提交？看两个崩溃场景就懂了——MySQL重启后，会根据Redo Log和Binlog的状态判断怎么恢复数据：
场景A：Redo Log Prepare后，Binlog写入前崩溃
Redo Log是PREPARE状态，Binlog里没有这条事务记录。此时的恢复逻辑：MySQL会检查Binlog，发现没有对应的事务XID（事务唯一标识），就知道「Server层还没确认完成」。为了保证主从一致（从库没收到Binlog），会用Undo Log回滚事务。
场景B：Binlog写入后，Redo Log Commit前崩溃
Redo Log是PREPARE状态，Binlog已完整写入。此时恢复逻辑：MySQL检查到Binlog有对应的XID，就知道「Server层已经确认完成」。哪怕Redo Log没改Commit状态，也会直接提交事务——因为Binlog已经发往从库了，主库必须认账，否则主从数据会不一致。
一张表分清：3个日志核心差异

核心结论：3个日志的配合精髓
最后用4句话总结，帮你快速抓住重点：
Undo Log给事务「后悔权」，支撑回滚和并发控制，是数据的「安全垫」；
Redo Log靠WAL技术，让内存修改不怕断电，是数据的「持久保障」；
Binlog连接主从和备份，是数据的「传播桥梁」；
两阶段提交是三者配合的核心，强制绑定Redo Log和Binlog，确保主从一致，这也是MySQL Crash-safe的关键。
其实这三个日志的设计，本质上是MySQL在「性能」和「数据安全」之间的平衡——既要靠内存操作提升速度，又要靠日志保证数据不丢、一致。理解了它们的配合逻辑，你对MySQL的ACID特性和主从复制就会有更底层的认知～

## 面试官想考什么

- redo log、undo log、binlog 的职责边界。
- 事务提交、崩溃恢复、主从复制之间如何配合。
- 两阶段提交解决什么一致性问题。

## 标准回答

MySQL 日志要区分职责：undo log 用于回滚和 MVCC，redo log 用于崩溃恢复，binlog 用于复制和按时间点恢复。事务提交时 redo log 与 binlog 通过两阶段提交降低不一致风险。

## 深挖追问

1. redo 和 binlog 区别？redo 用于崩溃恢复，binlog 用于复制和归档恢复。
2. 为什么需要两阶段提交？降低 redo 与 binlog 不一致。
3. undo 只用于回滚吗？还用于 MVCC 构造历史版本。

## 实战场景 / SQL 示例

```sql
SHOW VARIABLES LIKE "sync_binlog";
SHOW VARIABLES LIKE "innodb_flush_log_at_trx_commit";
-- 参数影响持久性、性能和故障丢失窗口。
```

## 易错点 / 总结

- 不要混淆 Server 层 binlog 和 InnoDB redo/undo。
- 刷盘参数会影响性能和故障丢失窗口。
- 只知道日志名不够，要能串起提交与恢复流程。
