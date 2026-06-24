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

<!-- interview-renovation:2026-06-24 -->

## 面试复习强化

### 核心概念

从面试角度看，**常用的 Linux 命令有哪些？** 可以放在“DevOps”这一类知识中理解。复习时不要只背定义，要能说清：它解决什么问题、依赖哪些前提、正常流程是什么、异常情况下系统会怎样退化或恢复。

### 面试官想考什么

- 是否理解概念背后的设计目标，而不是只记住名词；
- 是否能把机制和真实工程场景联系起来；
- 是否能分析边界条件、失败场景、性能与安全取舍；
- 是否能给出可落地的排查、实现或优化步骤。

### 标准回答

> 兼顾概念、命令、部署流程、可观测性和故障恢复。 追问看是否真操作过：环境差异、权限、网络、存储、日志、进程管理、镜像/容器生命周期。 对于“常用的 Linux 命令有哪些？”，回答时建议先给一句话定义，再按“工作流程/关键机制 → 典型场景 → 风险与优化”展开，最后补充一两个线上实践点。

### 深挖追问

- 如果该机制失效，会出现什么现象？如何定位是配置、代码、资源还是外部依赖导致？
- 它和相邻概念有什么区别？例如语义、适用场景、性能成本、可靠性保证分别是什么？
- 在高并发、网络抖动、服务重启、数据不一致或权限受限时，需要补充哪些保护措施？
- 有哪些指标可以证明方案有效？例如延迟、吞吐、错误率、资源使用率、重试次数或业务成功率。

### 示例 / 实战场景

- 设计方案时：先明确业务目标和约束，再选择对应机制，不要为了使用某个技术而引入复杂度。
- 排查问题时：先确认现象和影响面，再查看日志、监控、配置、版本变更和上下游依赖，最后小步验证修复。
- 复盘沉淀时：补充自动化测试、容量评估、告警阈值、降级预案和文档，避免同类问题再次发生。

### 本题高频补充

- Linux 题不要只背命令，要说明进程、文件、权限、网络、磁盘、日志和包管理的排查路径。

### 易错点 / 总结

- 只背结论、不讲原因，是面试扣分点；要主动解释“为什么这样设计”。
- 只讲正常路径、不讲异常路径，会显得缺少生产经验；至少补充超时、重试、降级、回滚或兜底。
- 不要把理论保证无限放大，工程实现通常还受网络、资源、配置、版本和业务语义约束。
- 总结一句：生产操作要考虑幂等、最小权限、备份、回滚和审计。

