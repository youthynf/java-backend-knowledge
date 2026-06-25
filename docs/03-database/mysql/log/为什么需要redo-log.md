# 为什么需要redo log?

## 核心概念

为什么需要redo log?
Buffer Pool 是提高了读写效率没错，但是问题来了，Buffer Pool 是基于内存的，而内存总是不可靠，万一断电重启，还没来得及落盘的脏页数据就会丢失。为了防止断电导致数据丢失的问题，当有一条记录需要更新的时候，InnoDB 引擎就会先更新内存（同时标记为脏页），然后将本次对这个页的修改以 redo log 的形式记录下来，这个时候更新就算完成了。后续，InnoDB 引擎会在适当的时候，由后台线程将缓存在 Buffer Pool 的脏页刷新到磁盘里，这就是 WAL （Write-Ahead Logging）技术。WAL 技术指的是， MySQL 的写操作并不是立刻写到磁盘上，而是先写日志，然后在合适的时间再写到磁盘上。

执行过程：
Server层执行器调用InnoDB存储引擎API执行SQL；
InnoDB存储引擎将数据页加载到Buffer Pool中；
更新Buffer Pool中的数据页，并标记为脏；
写入redo log文件，记录某个数据页做了什么修改；
通过后台线程定期将脏页刷新到磁盘。

什么是redo log？
redo log 是物理日志，记录了某个数据页做了什么修改，比如对 为什么需要redo log 表空间中的 YYY 数据页 ZZZ 偏移量的地方做了AAA 更新，每当执行一个事务就会产生这样的一条或者多条物理日志。在事务提交时，只要先将 redo log 持久化到磁盘即可，可以不需要等到将缓存在 Buffer Pool 里的脏页数据持久化到磁盘。当系统崩溃时，虽然脏页数据没有持久化，但是 redo log 已经持久化，接着 MySQL 重启后，可以根据 redo log 的内容，将所有数据恢复到最新的状态。

被修改 Undo 页面，需要记录对应 redo log 吗？
需要的。开启事务后，InnoDB 层更新记录前，首先要记录相应的 undo log，如果是更新操作，需要把被更新的列的旧值记下来，也就是要生成一条 undo log，undo log 会写入 Buffer Pool 中的 Undo 页面。不过，在内存修改该 Undo 页面后，也是需要记录对应的 redo log，因为undo log也要实现持久性的保护。

redo log 和 undo log 区别在哪？
这两种日志是属于 InnoDB 存储引擎的日志，它们的区别在于：
redo log 记录了此次事务「修改后」的数据状态，记录的是更新之后的值，主要用于事务崩溃恢复，保证事务的持久性。
undo log 记录了此次事务「修改前」的数据状态，记录的是更新之前的值，主要用于事务回滚，保证事务的原子性。

事务提交之前发生了崩溃（这里的崩溃不是宕机崩溃，而是事务执行错误，mysql 还是正常运行的。如果是宕机崩溃的话，其实就不需要通过 undo log 回滚了，因为事务没有提交，事务的数据并不会持久化，还是在内存中，宕机崩溃了数据就丢失了，反正事务都没有提交成功，所以数据本身就无意义的，丢失了就丢失了），重启后会通过 undo log 回滚事务。事务提交之后发生了崩溃（这里的崩溃是宕机崩溃），重启后会通过 redo log 恢复事务
所以有了 redo log，再通过 WAL 技术，InnoDB 就可以保证即使数据库发生异常重启，之前已提交的记录都不会丢失，这个能力称为 crash-safe（崩溃恢复）。可以看出来， redo log 保证了事务四大特性中的持久性。

redo log 要写到磁盘，数据也要写磁盘，为什么要多此一举？
写入 redo log 的方式使用了追加操作， 所以磁盘操作是顺序写，而写入数据需要先找到写入位置，然后才写到磁盘，所以磁盘操作是随机写。磁盘的「顺序写 」比「随机写」 高效的多，因此 redo log 写入磁盘的开销更小。
可以说这是 WAL 技术的另外一个优点：MySQL 的写操作从磁盘的「随机写」变成了「顺序写」，提升语句的执行性能。这是因为 MySQL 的写操作并不是立刻更新到磁盘上，而是先记录在日志上，然后在合适的时间再更新到磁盘上 。至此， 针对为什么需要 redo log 这个问题我们有两个答案：
实现事务的持久性，让 MySQL 有 crash-safe 的能力，能够保证 MySQL 在任何时间段突然崩溃，重启后之前已提交的记录都不会丢失；
将写操作从「随机写」变成了「顺序写」，提升 MySQL 写入磁盘的性能。

产生的 redo log 是直接写入磁盘的吗？
不是的。实际上， 执行一个事务的过程中，产生的 redo log 也不是直接写入磁盘的，因为这样会产生大量的 I/O 操作，而且磁盘的运行速度远慢于内存。所以，redo log 也有自己的缓存—— redo log buffer，每当产生一条 redo log 时，会先写入到 redo log buffer，后续在持久化到磁盘

redo log buffer 默认大小 16 MB，可以通过 innodb_log_Buffer_size 参数动态的调整大小，增大它的大小可以让 MySQL 处理「大事务」是不必写入磁盘，进而提升写 IO 性能。
redo log 什么时候刷盘？
MySQL 正常关闭时；
当 redo log buffer 中记录的写入量大于 redo log buffer 内存空间的一半时，会触发落盘；
InnoDB 的后台线程每隔 1 秒，将 redo log buffer 持久化到磁盘。
每次事务提交时都将缓存在 redo log buffer 里的 redo log 直接持久化到磁盘（这个策略可由 innodb_flush_log_at_trx_commit 参数控制，下面会说）。
innodb_flush_log_at_trx_commit 参数控制的是什么？
单独执行一个更新语句的时候，InnoDB 引擎会自己启动一个事务，在执行更新语句的过程中，生成的 redo log 先写入到 redo log buffer 中，然后等事务提交的时候，再将缓存在 redo log buffer 中的 redo log 按组的方式「顺序写」到磁盘。
此外，redo log刷盘时机策略通过参数 innodb_flush_log_at_trx_commit 参数控制，可取的值有：0、1、2，默认值为 1，这三个值分别代表的策略如下：
当设置该参数为 0 时，表示每次事务提交时 ，还是将 redo log 留在 redo log buffer 中 ，该模式下在事务提交时不会主动触发写入磁盘的操作。
当设置该参数为 1 时，表示每次事务提交时，都将缓存在 redo log buffer 里的 redo log 直接持久化到磁盘，这样可以保证 MySQL 异常重启之后数据不会丢失。
当设置该参数为 2 时，表示每次事务提交时，都只是缓存在 redo log buffer 里的 redo log 写到 redo log 文件，注意写入到「 redo log 文件」并不意味着写入到了磁盘，因为操作系统的文件系统中有个 Page Cache，Page Cache 是专门用来缓存文件数据的，所以写入「 redo log文件」意味着写入到了操作系统的文件缓存。

innodb_flush_log_at_trx_commit 为 0 和 2 的时候，什么时候才将 redo log 写入磁盘？
InnoDB 的后台线程每隔 1 秒：
针对参数 0 ：会把缓存在 redo log buffer 中的 redo log ，通过调用 write() 写到操作系统的 Page Cache，然后调用 fsync() 持久化到磁盘。所以参数为 0 的策略，MySQL 进程的崩溃会导致上一秒钟所有事务数据的丢失;
针对参数 2 ：调用 fsync，将缓存在操作系统中 Page Cache 里的 redo log 持久化到磁盘。所以参数为 2 的策略，较取值为 0 情况下更安全，因为 MySQL 进程的崩溃并不会丢失数据，只有在操作系统崩溃或者系统断电的情况下，上一秒钟所有事务数据才可能丢失。

redo log 文件写满了怎么办？
默认情况下， InnoDB 存储引擎有 1 个重做日志文件组( redo log Group），「重做日志文件组」由有 2 个 redo log 文件组成，这两个 redo 日志的文件名叫 ：ib_logfile0 和 ib_logfile1 。在重做日志组中，每个 redo log File 的大小是固定且一致的，假设每个 redo log File 设置的上限是 1 GB，那么总共就可以记录 2GB 的操作。重做日志文件组是以循环写的方式工作的，从头开始写，写到末尾就又回到开头，相当于一个环形。所以 InnoDB 存储引擎会先写 ib_logfile0 文件，当 ib_logfile0 文件被写满的时候，会切换至 ib_logfile1 文件，当 ib_logfile1 文件也被写满时，会切换回 ib_logfile0 文件。

redo log 是为了防止 Buffer Pool 中的脏页丢失而设计的，那么如果随着系统运行，Buffer Pool 的脏页刷新到了磁盘中，那么 redo log 对应的记录也就没用了，这时候我们擦除这些旧记录，以腾出空间记录新的更新操作。redo log 是循环写的方式，相当于一个环形，InnoDB 用 write pos 表示 redo log 当前记录写到的位置，用 checkpoint 表示当前要擦除的位置。
write pos 和 checkpoint 的移动都是顺时针方向；
write pos ～ checkpoint 之间的部分（图中的红色部分），用来记录新的更新操作；
check point ～ write pos 之间的部分（图中蓝色部分）：待落盘的脏数据页记录；

如果 write pos 追上了 checkpoint，就意味着 redo log 文件满了，这时 MySQL 不能再执行新的更新操作，也就是说 MySQL 会被阻塞（因此所以针对并发量大的系统，适当设置 redo log 的文件大小非常重要），此时会停下来将 Buffer Pool 中的脏页刷新到磁盘中，然后标记 redo log 哪些记录可以被擦除，接着对旧的 redo log 记录进行擦除，等擦除完旧记录腾出了空间，checkpoint 就会往后移动（图中顺时针），然后 MySQL 恢复正常运行，继续执行新的更新操作。所以，一次 checkpoint 的过程就是脏页刷新到磁盘中变成干净页，然后标记 redo log 哪些记录可以被覆盖的过程。

如何保证持久性
Write-Ahead Logging(WAL)：在事务提交之前，将事务所做的修改操作记录到redo log中，然后再将数据写入磁盘，这样即时在数据写入磁盘钱发生了宕机，系统可以通过redo log中的记录来恢复数据。
Redo log的顺序写入：redo log采用追加写入的方式，将redo log日志追加到文件末尾，而不是随机写入，这样可以减少磁盘的随机I/O操作，提高写入性能；
Checkpoint机制：MySQL会定期将内存中的数据刷新到磁盘，同时将最新的LSN（Log Sequenct Number）记录到磁盘，这个LSN可以确保redo log中的操作是按顺序执行的。在恢复数据时，系统根据LSN来确定从哪个位置开始应用redo log。

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
