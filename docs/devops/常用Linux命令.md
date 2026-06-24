# 常用 Linux 命令

## 核心概念

Linux 命令的价值在于把“排查思路”落地。对于 Java 后端，最常用的是：文件目录、日志文本、进程线程、端口网络、磁盘内存、权限服务。掌握命令分类，比死记硬背更重要。

## 面试官想考什么

- 是否能用命令定位线上问题，而不是只会列命令；
- 是否熟悉日志分析、端口排查、磁盘清理、进程管理；
- 是否知道 `grep/awk/sort/uniq` 组合分析文本；
- 是否了解 Java 进程排查与 Linux 命令如何配合；
- 是否知道危险操作的边界。

## 标准回答

> 我会按场景使用 Linux 命令：文件操作用 `ls/cp/mv/find`，日志查看用 `less/tail/grep`，文本统计用 `awk/sort/uniq`，进程资源用 `ps/top/free/df/du`，端口网络用 `ss/curl/ping`，权限用 `chmod/chown`，服务管理用 `systemctl/journalctl`。例如接口访问不了，我会先查服务状态和日志，再看端口监听、进程是否存在、机器资源是否异常。

## 深挖追问

### `grep`、`awk`、`sed` 分别适合什么？

- `grep`：按关键字/正则过滤行；
- `awk`：按列处理、聚合统计；
- `sed`：流式替换、删除、插入文本。

```bash
grep -n "ERROR" app.log
awk '{print $1}' access.log | sort | uniq -c | sort -nr | head
sed -n '100,150p' app.log
```

### `df` 和 `du` 为什么结果可能不一致？

`df` 从文件系统角度看空间使用，`du` 从目录树统计文件大小。如果文件被删除但仍被进程占用，`du` 看不到，但 `df` 仍显示空间被占用。可用 `lsof | grep deleted` 排查。

### 如何安全清理日志？

不要直接删除正在写入的日志文件，否则进程可能仍持有文件句柄。更安全的做法是通过日志轮转，或使用重定向清空：

```bash
: > app.log
# 或配置 logrotate
```

## 实战场景/代码示例

### 查看服务是否正常

```bash
systemctl status user-service
journalctl -u user-service -n 200 --no-pager
curl -v http://127.0.0.1:8080/actuator/health
```

### 端口和进程

```bash
ps -ef | grep java
ss -lntp | grep 8080
kill -15 <pid>   # 优雅终止
kill -9 <pid>    # 强制终止，慎用
```

### 磁盘和大文件

```bash
df -h
du -sh /opt/* | sort -h
find /var/log -type f -size +200M -print
```

### Java CPU 飙高定位

```bash
top -Hp <pid>
printf '%x\n' <tid>
jstack <pid> | grep -A 40 <hexTid>
```

## 易错点/总结

- `kill -9` 会跳过优雅关闭，可能导致数据未刷盘；
- `rm -rf $dir/*` 前确认变量不为空；
- 生产不要为了省事 `chmod -R 777`；
- `tail -f` 不是日志分析万能工具，大文件检索优先 `grep/less`；
- 端口监听在 `127.0.0.1` 和 `0.0.0.0` 的外部访问效果不同；
- 命令输出要结合业务日志、监控和部署变更一起判断。

## 参考资料

- Linux man pages
- GNU Coreutils Documentation

