# 树莓派 5 NVMe SSD 系统迁移全流程手册

## 核心概念

树莓派 5 支持通过 PCIe 扩展板连接 NVMe SSD。把系统从 SD 卡迁移到 NVMe 的目标是提升启动速度、IO 性能和长期可靠性。迁移本质上是：确认硬件和固件支持 → 备份数据 → 把系统写入或克隆到 NVMe → 调整启动顺序 → 验证分区、挂载、服务和性能。

## 面试官想考什么

- 是否具备 Linux 系统迁移和磁盘管理基础；
- 是否知道迁移前必须备份，不能直接对生产盘冒险操作；
- 是否理解分区、文件系统、UUID、`fstab`、bootloader 启动顺序；
- 是否能排查无法启动、挂载错误、NVMe 不识别、供电不足；
- 是否能结合树莓派 5 的 PCIe/NVMe 特性说明注意事项。

## 标准回答

> 树莓派 5 迁移到 NVMe SSD 通常先升级系统和 EEPROM 固件，确认 NVMe 能被 `lsblk`/`lspci` 识别；然后备份 SD 卡数据，用 Raspberry Pi Imager 直接写入 NVMe，或用 `rsync/dd` 克隆系统；之后通过 `raspi-config` 或 `rpi-eeprom-config` 设置启动顺序，检查 `/etc/fstab` 是否使用正确 UUID。首次启动后验证根分区是否在 NVMe、服务是否正常、磁盘空间是否扩展，并观察供电和温度。

## 深挖追问

### `dd`、`rsync`、重新刷写镜像有什么区别？

- `dd` 是块级克隆，简单但会复制空闲空间和潜在错误，目标盘容量要足够；
- `rsync` 是文件级同步，灵活但要正确处理权限、特殊文件和引导分区；
- 重新刷写镜像最干净，适合可重新部署的系统，之后再恢复配置和数据。

### 为什么推荐 fstab 使用 UUID？

设备名如 `/dev/nvme0n1p2`、`/dev/mmcblk0p2` 可能因启动顺序或硬件变化改变。UUID 与文件系统绑定，更稳定，适合写入 `/etc/fstab`。

```bash
blkid
cat /etc/fstab
```

### NVMe 无法启动怎么排查？

检查 EEPROM 版本和启动顺序、NVMe 是否被识别、镜像是否正确写入、boot 分区是否存在、供电是否稳定、PCIe 排线/扩展板是否正常。必要时插回 SD 卡启动，再挂载 NVMe 修复配置。

## 实战场景/代码示例

### 迁移前检查

```bash
sudo apt update && sudo apt full-upgrade -y
sudo rpi-eeprom-update
lsblk -f
lspci
vcgencmd get_throttled
```

### 使用 rsync 迁移根文件系统（示意）

> 执行前务必确认目标盘设备名，避免覆盖数据。

```bash
sudo mkfs.ext4 /dev/nvme0n1p2
sudo mkdir -p /mnt/nvme-root
sudo mount /dev/nvme0n1p2 /mnt/nvme-root
sudo rsync -aAXHv --exclude=/dev/* --exclude=/proc/* --exclude=/sys/* \
  --exclude=/tmp/* --exclude=/run/* --exclude=/mnt/* --exclude=/media/* \
  / /mnt/nvme-root/
```

### 查看并调整启动顺序

```bash
sudo raspi-config
# Advanced Options -> Boot Order
```

或查看 EEPROM 配置：

```bash
sudo rpi-eeprom-config
```

### 迁移后验证

```bash
findmnt /
lsblk -f
df -h
systemctl --failed
journalctl -b -p warning --no-pager
```

## 易错点/总结

- 迁移前先备份，确认目标盘设备名，`dd/mkfs` 用错盘会直接毁数据；
- NVMe 扩展板、排线、供电和散热都会影响稳定性；
- `/etc/fstab` 写错 UUID 可能导致启动卡住；
- 从 SD 卡和 NVMe 同时存在相同 UUID 启动，可能引发挂载混乱；
- 迁移后要确认根目录实际挂载在 NVMe，而不是仍从 SD 卡启动；
- 生产服务迁移要安排停机窗口，并提前准备回滚方案。

## 参考资料

- Raspberry Pi 5 Documentation
- Raspberry Pi EEPROM bootloader documentation
- Debian `fstab`、`rsync`、`lsblk` 手册

<!-- interview-renovation:2026-06-24 -->

## 面试复习强化

### 核心概念

从面试角度看，**树莓派 5 NVMe SSD 系统迁移全流程手册** 可以放在“DevOps”这一类知识中理解。复习时不要只背定义，要能说清：它解决什么问题、依赖哪些前提、正常流程是什么、异常情况下系统会怎样退化或恢复。

### 面试官想考什么

- 是否理解概念背后的设计目标，而不是只记住名词；
- 是否能把机制和真实工程场景联系起来；
- 是否能分析边界条件、失败场景、性能与安全取舍；
- 是否能给出可落地的排查、实现或优化步骤。

### 标准回答

> 兼顾概念、命令、部署流程、可观测性和故障恢复。 追问看是否真操作过：环境差异、权限、网络、存储、日志、进程管理、镜像/容器生命周期。 对于“树莓派 5 NVMe SSD 系统迁移全流程手册”，回答时建议先给一句话定义，再按“工作流程/关键机制 → 典型场景 → 风险与优化”展开，最后补充一两个线上实践点。

### 深挖追问

- 如果该机制失效，会出现什么现象？如何定位是配置、代码、资源还是外部依赖导致？
- 它和相邻概念有什么区别？例如语义、适用场景、性能成本、可靠性保证分别是什么？
- 在高并发、网络抖动、服务重启、数据不一致或权限受限时，需要补充哪些保护措施？
- 有哪些指标可以证明方案有效？例如延迟、吞吐、错误率、资源使用率、重试次数或业务成功率。

### 示例 / 实战场景

- 设计方案时：先明确业务目标和约束，再选择对应机制，不要为了使用某个技术而引入复杂度。
- 排查问题时：先确认现象和影响面，再查看日志、监控、配置、版本变更和上下游依赖，最后小步验证修复。
- 复盘沉淀时：补充自动化测试、容量评估、告警阈值、降级预案和文档，避免同类问题再次发生。

### 易错点 / 总结

- 只背结论、不讲原因，是面试扣分点；要主动解释“为什么这样设计”。
- 只讲正常路径、不讲异常路径，会显得缺少生产经验；至少补充超时、重试、降级、回滚或兜底。
- 不要把理论保证无限放大，工程实现通常还受网络、资源、配置、版本和业务语义约束。
- 总结一句：生产操作要考虑幂等、最小权限、备份、回滚和审计。

