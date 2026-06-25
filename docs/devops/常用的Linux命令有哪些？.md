# 常用的 Linux 命令有哪些？

## 核心概念

Linux 命令不是为了背列表，而是为了快速完成线上排查：看文件、查进程、查端口、看日志、查资源、改权限、管理服务。面试中通常会通过“服务启动失败/接口访问慢/磁盘满/端口占用”这类场景考察命令组合能力。

## 面试官想考什么

- 是否掌握文件、进程、网络、日志、磁盘、权限、服务管理命令；
- 是否能把命令串起来定位问题；
- 是否知道危险命令的风险；
- 是否了解 `grep/awk/sed/xargs` 等文本处理工具；
- 是否能在 Java 服务场景下排查 CPU、内存、端口和日志。

## 标准回答

> 常用 Linux 命令可以按场景分类：文件目录用 `ls/cd/cp/mv/rm/find/du/df`；文本查看用 `cat/less/head/tail/grep/awk/sed`；进程资源用 `ps/top/free/jstack/jmap`；网络端口用 `ss/netstat/curl/ping`；权限用户用 `chmod/chown/su/sudo`；服务管理用 `systemctl/journalctl`。线上排查时会先看服务状态和日志，再查端口、资源和配置。

## 深挖追问

### 如何查看某个端口被谁占用？

```bash
ss -lntp | grep 8080
# 或
sudo lsof -i :8080
```

`ss` 是较新的网络连接查看工具，很多环境中比 `netstat` 更推荐。

### 如何查找大文件？

```bash
df -h
sudo du -xh / --max-depth=1 | sort -h
find /var/log -type f -size +100M -print
```

先用 `df -h` 判断哪个分区满，再用 `du` 定位目录，最后用 `find` 找大文件。

### 如何实时看日志并过滤关键字？

```bash
tail -f app.log | grep --line-buffered "ERROR"
```

如果是 systemd 服务：

```bash
journalctl -u user-service -f
```

### 如何排查 Java 进程 CPU 飙高？

```bash
top -Hp <pid>          # 找到高 CPU 线程 id
printf '%x\n' <tid>    # 转成 16 进制
jstack <pid> | grep -A 30 <hexTid>
```

## 实战场景/代码示例

### 服务访问不了的排查顺序

```bash
systemctl status user-service
journalctl -u user-service -n 100 --no-pager
ss -lntp | grep 8080
curl -v http://127.0.0.1:8080/actuator/health
ps -ef | grep java
```

### 常用命令速查

```bash
# 文件
ls -lah
cp -r source target
mv old new
rm -i file
find /opt/app -name "*.log"

# 文本
less app.log
tail -n 200 app.log
grep -n "Exception" app.log
awk '{print $1}' access.log | sort | uniq -c | sort -nr | head

# 资源
free -h
df -h
du -sh *
top
ps -ef | grep java

# 网络
ip addr
ping example.com
curl -I https://example.com
ss -lntp

# 权限
chmod 755 start.sh
chown -R app:app /opt/app
```

## 易错点/总结

- `rm -rf` 风险极高，生产执行前确认路径变量不为空；
- `chmod 777` 不是万能解法，会扩大安全风险；
- `tail -f` 只看新增日志，历史日志用 `less/grep`；
- `df` 看文件系统空间，`du` 看目录占用，二者口径不同；
- 端口不通要区分服务未监听、防火墙、网关、DNS、应用异常；
- 使用管道时注意命令是否会缓冲输出，例如 grep 可加 `--line-buffered`。

## 参考资料

- Linux man pages：`man ps`、`man ss`、`man systemctl`
- GNU Coreutils Documentation
