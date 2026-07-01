# 常用的 Linux 命令有哪些

## 核心概念

Linux 命令的价值不在于背列表，而在于把“排查思路”落地。线上出问题时不会有人告诉你“该用哪条命令”，你需要从现象出发：服务访问不了 → 查进程 → 查端口 → 查日志 → 查资源 → 查配置。掌握命令的分类和组合方式，比死记硬背单条命令重要得多。

对 Java 后端来说，最高频的命令分七类：文件目录、文本处理、进程线程、端口网络、磁盘内存、权限用户、服务管理。下面按场景讲清楚每类命令的典型用法和组合套路。

## 标准回答

> 常用 Linux 命令按场景分类：文件目录用 `ls/cd/cp/mv/rm/find/du/df`；文本查看用 `cat/less/head/tail/grep/awk/sed`；进程资源用 `ps/top/free/jstack/jmap`；网络端口用 `ss/netstat/curl/ping`；权限用户用 `chmod/chown/su/sudo`；服务管理用 `systemctl/journalctl`。线上排查按"先看服务状态和日志 → 再查端口和进程 → 再查机器资源 → 最后看配置和代码变更"的顺序。例如接口访问不了，我会先 `systemctl status` 看服务、`journalctl` 看日志、`ss -lntp` 看端口、`curl localhost` 测连通性、`top` 看资源。

## 详细机制

### 命令分类速查

| 类别 | 高频命令 | 用途 |
|------|----------|------|
| 文件目录 | `ls/cd/cp/mv/rm/find/du/df/stat/tree` | 浏览、复制、查找、统计 |
| 文本处理 | `cat/less/head/tail/grep/awk/sed/cut/sort/uniq/wc/jq` | 查看、过滤、替换、聚合 |
| 进程线程 | `ps/top/htop/pidof/pgrep/kill/pstree` | 查看、终止进程 |
| 网络端口 | `ss/netstat/curl/ping/telnet/nc/tcpdump/dig/nslookup` | 端口、连通性、抓包、DNS |
| 磁盘内存 | `df/du/free/iostat/vmstat/lsof` | 空间、占用、IO、内存 |
| 权限用户 | `chmod/chown/sudo/su/useradd/passwd/id/whoami` | 权限、用户切换 |
| 服务管理 | `systemctl/journalctl/service` | 服务启停、日志 |
| 压缩归档 | `tar/gzip/zip/unzip/zcat` | 打包、解压 |
| 系统信息 | `uname/hostname/uptime/date/lscpu/lsof` | 内核、主机、负载 |

### grep / awk / sed 三剑客的区别

- `grep`：按关键字或正则**过滤行**，输出匹配的整行。
- `awk`：按列**处理和聚合**，适合结构化文本（日志、CSV）。
- `sed`：流式**替换、删除、插入**文本，不破坏原文件（除非 `-i`）。

```bash
grep -n "ERROR" app.log                     # 找 ERROR 关键字所在行号
awk '{print $1}' access.log | sort | uniq -c | sort -nr | head   # 统计 IP 访问次数 Top
sed -n '100,150p' app.log                   # 打印 100-150 行
sed 's/old/new/g' file.txt                  # 全局替换 old 为 new（不写文件）
sed -i 's/old/new/g' file.txt               # 直接改文件（危险，先备份）
```

### df 和 du 的差异

`df` 从文件系统角度看空间使用（看 inode 表和超级块），`du` 从目录树统计文件大小。如果文件被删除但仍被进程持有句柄，`du` 看不到（因为目录项已删除），但 `df` 仍显示空间被占用（因为 inode 没释放）：

```bash
lsof | grep deleted                         # 查找被进程持有的已删文件
# 解决：重启占用该文件的进程，或重启系统
```

### kill 信号的区别

```bash
kill -15 <pid>   # SIGTERM，优雅终止，进程可以处理（Spring Boot 收到后做优雅停机）
kill -2  <pid>   # SIGINT，Ctrl+C 等效
kill -1  <pid>   # SIGHUP，通常让进程重载配置
kill -9  <pid>   # SIGKILL，内核直接杀，进程无法捕获，可能丢数据
```

生产环境优先用 `-15`，给进程清理资源的机会。`-9` 是最后手段，可能导致数据库连接泄漏、临时文件残留。

### ss 比 netstat 好在哪

`ss`（socket statistics）直接读内核 socket 表，速度快；`netstat` 老版本会遍历 `/proc` 下所有进程，慢且已废弃。两者参数基本兼容：

```bash
ss -lntp           # -l 监听 socket，-n 不解析端口名，-t TCP，-p 进程
ss -anp | grep 8080
netstat -anp | grep 8080   # 老系统可能只有 netstat
```

## 代码示例

### 服务访问不了的排查顺序

```bash
# 1. 看服务状态
systemctl status user-service
journalctl -u user-service -n 200 --no-pager

# 2. 看端口监听
ss -lntp | grep 8080
# 0.0.0.0:8080 表示监听所有网卡，外部可访问
# 127.0.0.1:8080 表示只监听本地，外部访问不到

# 3. 本机测连通性
curl -v http://127.0.0.1:8080/actuator/health

# 4. 看进程
ps -ef | grep java
ps -ef | grep java | grep -v grep          # 排除 grep 自身

# 5. 看资源
top
free -h
df -h
```

### 端口和进程

```bash
ps -ef | grep java                          # 看 Java 进程
ss -lntp | grep 8080                        # 看 8080 端口
sudo lsof -i :8080                          # 看占用 8080 的进程
pidof java                                  # 直接取 java 进程 PID
pgrep -f "user-service.jar"                 # 按完整命令行匹配

kill -15 <pid>                              # 优雅终止
kill -9 <pid>                               # 强制终止（慎用）
pkill -f "user-service.jar"                 # 按命令行匹配杀进程
```

### 磁盘和大文件

```bash
df -h                                       # 看文件系统空间
df -i                                       # 看 inode 使用率（小文件多导致 inode 满）
sudo du -xh / --max-depth=1 | sort -h       # 找根目录下最大的一级目录
du -sh /opt/* | sort -h                     # 找 /opt 下最大目录
find /var/log -type f -size +200M -print    # 找 200MB 以上日志文件
find /opt -name "*.log" -mtime +30 -delete  # 删除 30 天前的日志
```

### 文本处理组合

```bash
# 实时看日志并过滤关键字
tail -f app.log | grep --line-buffered "ERROR"   # --line-buffered 避免 grep 缓冲

# 统计日志中 ERROR 出现次数
grep -c "ERROR" app.log

# 按时间段提取日志
awk '/2026-06-29 10:00:00/,/2026-06-29 11:00:00/' app.log

# 提取 JSON 日志中某字段
jq -r '.userId' app.json.log | sort -u | wc -l

# 找出访问量 Top 10 的 IP
awk '{print $1}' access.log | sort | uniq -c | sort -nr | head -10

# 把多个空格转成逗号（生成 CSV）
awk '{$1=$1; print}' OFS=',' file.txt
```

### Java CPU 飙高定位

```bash
# 1. 找 Java 进程 PID
ps -ef | grep java | grep -v grep
jps                                         # JDK 自带，列 Java 进程

# 2. 找 CPU 最高的线程
top -Hp <pid>                               # -H 显示线程，-p 指定进程
# 记下高 CPU 线程的 TID（十进制）

# 3. 转换为 16 进制（jstack 中 nid 是 16 进制）
printf '%x\n' <tid>

# 4. 在 jstack 输出中找该线程的堆栈
jstack <pid> > jstack.log
grep -A 40 <hexTid> jstack.log
# 或直接
jstack <pid> | grep -A 40 <hexTid>
```

### Java 内存问题定位

```bash
# 看堆内存概览
jmap -heap <pid>

# 看对象统计（Top 20 占用对象）
jmap -histo <pid> | head -30

# dump 堆内存（生产慎用，会 STW）
jmap -dump:format=b,file=/tmp/heap.hprof <pid>

# 看 GC 情况
jstat -gcutil <pid> 1000 5                  # 每秒一次，共 5 次
```

### systemd 服务管理

```bash
systemctl status user-service               # 看状态
systemctl start user-service                # 启动
systemctl stop user-service                 # 停止
systemctl restart user-service              # 重启
systemctl enable user-service               # 开机自启
systemctl disable user-service              # 取消自启
journalctl -u user-service -f               # 实时看日志
journalctl -u user-service --since "1 hour ago"
journalctl -u user-service -n 200 --no-pager
```

### 压缩与解压

```bash
tar -czvf app.tar.gz /opt/app               # 打包+gzip 压缩
tar -xzvf app.tar.gz                        # 解压
tar -tzvf app.tar.gz | head                 # 不解压查看内容
zcat app.log.gz                             # 不解压查看 gzip 文件
zip -r app.zip /opt/app                     # zip 压缩
unzip app.zip -d /opt/                      # 解压到指定目录
```

## 实战场景

| 场景 | 命令组合 | 注意点 |
|------|----------|--------|
| 接口超时 | `top -Hp` + `jstack` + `jstat -gcutil` | 先排除 GC 问题，再看线程阻塞 |
| 磁盘满告警 | `df -h` → `du -sh` → `find -size` → `lsof \| grep deleted` | 删大文件前确认进程持有句柄 |
| 端口不通 | `ss -lntp` → `curl -v` → `iptables -L` → `tcpdump` | 区分服务未监听、防火墙、应用异常 |
| 日志太大 | `tail -f` + `grep --line-buffered` + logrotate | 不要 `cat` 大文件，用 `less` |
| Java OOM | `jmap -histo` + dump + MAT 分析 | dump 文件大，提前设 `-XX:+HeapDumpOnOutOfMemoryError` |
| 服务异常重启 | `journalctl -u service` + `last` 看重启时间 | 配 `Restart=always` 自愈 |
| CPU 100% | `top` → `top -Hp` → `printf '%x'` → `jstack` | 注意是 Java 进程还是其他进程占 CPU |
| 网络抓包 | `tcpdump -i eth0 -nn port 8080 -w cap.pcap` | Wireshark 打开 pcap 文件分析 |

## 深挖追问

### 如何查看某个端口被谁占用？

```bash
ss -lntp | grep 8080                        # 推荐，快
sudo lsof -i :8080                          # 也可，但要 root
sudo netstat -tunlp | grep 8080             # 老系统
sudo fuser 8080/tcp                         # 输出 PID
```

### 如何查找大文件？

```bash
df -h                                       # 先看哪个分区满
sudo du -xh / --max-depth=1 | sort -h       # 再找根目录下最大的一级目录
du -sh /var/* | sort -h                     # 在该目录下继续找
find /var -type f -size +500M -exec ls -lh {} \;   # 最后定位大文件
```

排查路径：分区 → 目录 → 文件。直接 `find / -size +500M` 在大文件系统上会很慢。

### 如何实时看日志并过滤关键字？

```bash
tail -f app.log | grep --line-buffered "ERROR"
# --line-buffered 让 grep 行缓冲，否则输出会延迟

# 多关键字
tail -f app.log | grep -E "ERROR|WARN"

# 高亮关键字
tail -f app.log | grep --color=always "ERROR"

# systemd 服务日志
journalctl -u user-service -f
journalctl -u user-service -f -p err         # 只看 error 级别
```

### 如何排查 Java 进程 CPU 飙高？

四步定位法：

```bash
# 1. 找 Java 进程 PID
jps                                          # 或 ps -ef | grep java

# 2. 找 CPU 最高的线程
top -Hp <pid>                                # 记下 TID

# 3. 转换为 16 进制
printf '%x\n' <tid>                          # 假设得到 nid

# 4. 在 jstack 中找该线程
jstack <pid> | grep -A 40 <nid>
```

如果看到线程状态是 `RUNNABLE` 且堆栈在业务代码，说明业务代码 CPU 密集；如果在 GC 相关方法，说明是 GC 问题，要用 `jstat -gcutil` 看 GC 频率。

### df 和 du 结果不一致怎么办？

文件被删除但进程仍持有句柄，inode 不释放，df 仍显示空间被占用但 du 看不到：

```bash
lsof | grep deleted                          # 找到持有已删文件的进程
# 重启该进程或 kill -HUP 让它重新打开日志文件
```

预防：用 `logrotate` 的 `copytruncate` 模式，或在应用层用日志框架的 RollingFileAppender。

### 如何安全清理日志？

```bash
: > app.log                                 # 清空文件内容，进程无需重开句柄
# 不要用 rm app.log && touch app.log，会让进程丢失句柄继续写到已删文件
```

更推荐配置 `/etc/logrotate.d/app`：

```text
/opt/app/logs/*.log {
  daily
  rotate 14
  compress
  missingok
  notifempty
  copytruncate
}
```

### 如何让命令在后台稳定运行？

```bash
# nohup：忽略 SIGHUP，输出重定向
nohup java -jar app.jar > app.log 2>&1 &

# disown：从 shell 作业表移除
java -jar app.jar &
disown %1

# setsid：在新会话中运行，彻底脱离终端
setsid java -jar app.jar > app.log 2>&1 < /dev/null &

# 生产环境用 systemd 或 supervisord，不要靠 nohup
```

## 易错点

- `kill -9` 滥用：跳过优雅关闭，可能导致数据库连接泄漏、临时文件残留。优先 `kill -15`。
- `rm -rf $dir/*` 变量为空：变成 `rm -rf /*`，灾难。生产脚本要 `set -u` 严格模式，或 `[ -n "$dir" ] && rm -rf "$dir"/*`。
- `chmod -R 777`：扩大攻击面，正确做法是 `chmod 755` 文件、`chown` 改属主。
- `cat` 大文件：几 GB 的日志直接 `cat` 会刷屏卡死，用 `less` 或 `tail -n`。
- `tail -f` 当万能工具：实时看新日志可以，但检索历史日志要用 `grep` 或 `less`。
- 端口监听 `127.0.0.1`：外部访问不到，要监听 `0.0.0.0`。
- `grep` 不加 `--line-buffered`：管道缓冲导致实时日志延迟。
- `sed -i` 不备份：直接改文件出错无法回滚，加 `-i.bak` 自动备份。
- `du` 不加 `-x`：跨文件系统统计（如 `/proc`、`/sys`），结果混乱。
- 命令输出当唯一依据：要结合业务日志、监控指标和部署变更一起判断。

## 总结

Linux 命令的核心是“按场景组合”：服务异常用 `systemctl + journalctl`，端口不通用 `ss + curl + tcpdump`，磁盘满用 `df + du + find + lsof`，CPU 飙高用 `top -Hp + jstack`。掌握这几条主线，能覆盖 Java 后端 80% 的线上排查场景。危险操作（`rm -rf`、`kill -9`、`chmod 777`、`sed -i`）要养成肌肉记忆的防护习惯：变量判空、优先优雅终止、最小权限、先备份。

## 参考资料

- [Linux man pages](https://man7.org/linux/man-pages/)
- [GNU Coreutils](https://www.gnu.org/software/coreutils/manual/coreutils.html)
- [The Linux Documentation Project](https://tldp.org/)
- [Advanced Bash-Scripting Guide](https://tldp.org/LDP/abs/html/)

---
