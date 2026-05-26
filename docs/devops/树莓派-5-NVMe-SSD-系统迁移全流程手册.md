# 树莓派 5 NVMe SSD 系统迁移全流程手册

树莓派 5 NVMe SSD 系统迁移全流程手册
第一阶段：准备工作（环境与硬件）
硬件连接：
将 NVMe SSD 安装到 PCIe 扩展版（HAT）。
使用排线连接树莓派 5 的 PCIe 接口与扩展板。
注意： 确保排线金手指方向正确，卡扣锁紧。
更新系统软件库与固件（SD卡运行状态）： 在进行硬件级操作前，确保固件（EEPROM）是最新的，以获得更好的 NVMe 兼容性。

sudo apt update && sudo apt full-upgrade -y
sudo rpi-eeprom-update -a
# 如果更新了固件，建议重启一次：sudo reboot

第二阶段：磁盘重组（解决 NVMe 识别问题）
由于脚本工具可能不兼容 NVMe 命名规则（如 nvme0n1p1），手动分区是最稳妥的办法。
清理旧分区：

cd ~
sudo umount -l /dev/nvme0n1* # 强制卸载可能存在的挂载
sudo parted /dev/nvme0n1 --script mklabel msdos
建立引导双分区： 树莓派 5 必须通过 FAT32 分区引导。

# 分配 512MB 引导分区
sudo parted /dev/nvme0n1 --script mkpart primary fat32 4MiB 516MiB
# 分配剩余空间给根系统
sudo parted /dev/nvme0n1 --script mkpart primary ext4 516MiB 100%
格式化分区：

sudo mkfs.vfat -F 32 -n bootfs /dev/nvme0n1p1
sudo mkfs.ext4 -L rootfs /dev/nvme0n1p2

第三阶段：系统镜像迁移（核心步骤）
挂载新分区：

sudo mkdir -p /mnt/target
sudo mount /dev/nvme0n1p2 /mnt/target
sudo mkdir -p /mnt/target/boot/firmware
sudo mount /dev/nvme0n1p1 /mnt/target/boot/firmware
无损同步数据： 使用 rsync 保持所有文件权限和属性。

# 同步根目录（排除虚拟目录）
sudo rsync -axHAWXS --numeric-ids --info=progress2 / /mnt/target
# 同4步引导固件文件
sudo rsync -rtxv /boot/firmware/ /mnt/target/boot/firmware/

第四阶段：配置修正（实现独立引导）
获取 SSD 分区唯一身份 ID (PARTUUID)
执行命令查看 SSD 所有分区的 UUID：

sudo blkid /dev/nvme0n1p*
输出示例（你以自己的为准）：

/dev/nvme0n1p1: UUID="XXXX" TYPE="vfat" PARTUUID="536bad24-01"
/dev/nvme0n1p2: UUID="YYYY" TYPE="ext4" PARTUUID="536bad24-02"
必须记录两个值：
p1 分区（boot 分区）：PARTUUID="536bad24-01"
p2 分区（系统根分区）：PARTUUID="536bad24-02"

更新系统挂载表 fstab
编辑 SSD 内的 fstab 文件，替换为你刚才记录的 PARTUUID：

sudo nano /mnt/target/etc/fstab
文件原始内容（类似）：

PARTUUID=旧ID-01  /boot/firmware  vfat  defaults  0  2
PARTUUID=旧ID-02  /               ext4  defaults  0  1
修改为（替换成你的 UUID）：

PARTUUID=536bad24-01  /boot/firmware  vfat  defaults  0  2
PARTUUID=536bad24-02  /               ext4  defaults  0  1
保存退出：
Ctrl+O → 回车 → Ctrl+X

更新内核启动参数 cmdline.txt
这是最关键的一步，告诉内核从 SSD 加载系统：

sudo nano /mnt/target/boot/firmware/cmdline.txt
文件内容修改：
只修改 root=PARTUUID= 后面的值，其他参数不要动！
原始：

root=PARTUUID=旧ID-02 ...
修改后：

root=PARTUUID=536bad24-02 ...
完整正确示例（仅供参考）：

console=serial0,115200 console=tty1 root=PARTUUID=536bad24-02 rootfstype=ext4 fsck.repair=yes rootwait quiet splash plymouth.ignore-serial-consoles
保存退出：Ctrl+O → 回车 → Ctrl+X

设置树莓派优先从 NVMe/SSD 引导
执行配置工具，修改启动顺序：

sudo raspi-config
操作路径：
选择 6 Advanced Options（高级选项）
选择 A4 Boot Order（启动顺序）
选择 NVMe/USB Boot（优先 NVMe/USB 启动）
按Tab切换到Finish保存退出

收尾操作（必须做）
退出 chroot 环境（如果之前进入了）

exit
卸载挂载分区

sudo umount /mnt/target/boot/firmware
sudo umount /mnt/target
重启树莓派

sudo reboot

验证是否成功
重启后执行命令，查看当前系统盘：

lsblk
如果根目录 / 和 /boot/firmware 都挂载在 /dev/nvme0n1p1/p2，说明SSD 独立引导配置完成。

第五阶段：切换与性能榨取
拔掉 SD 卡： 执行 sudo poweroff，灯灭后物理移除 SD 卡，重新上电。
开启 PCIe 3.0 极速模式（树莓派 5 专属）： 成功从 SSD 启动后，编辑配置文件：

sudo nano /boot/firmware/config.txt
在末尾添加：

dtparam=pciex1_gen=3
重启后，SSD 读写速度将跃升至 800-900 MB/s。

常见故障总结
Busy 报错： 运行 cd ~ 确保终端不在挂载点内。
无法启动： 检查 cmdline.txt 是否只有一行，且 PARTUUID 是否准确。
找不到磁盘： 检查 PCIe 排线是否插反（金属触点需面向底座）。
修改启动顺序（Boot Order）：如果你确实想修改启动顺序（例如优先从 USB 启动），可以通过以下几种方式：
方法 A：使用 Raspberry Pi Imager（最简单）
打开 Raspberry Pi Imager。
点击“选择操作系统（CHOOSE OS）”。
选择 Misc Utility Images -> Bootloader -> SD Card Boot（或者 NVMe/USB 启动，根据你需求选）。
烧录到一张空的 SD 卡上，插进树莓派开机，等屏幕变绿后，启动顺序就改好了。
方法 B：在系统内修改（如果现在能进系统的话） 在终端输入 sudo raspi-config，进入 Advanced Options -> Boot Order 进行选择。

常用命令
连接命令：
ssh youth@192.168.3.45

重装系统后，Windows重置连接密钥：
ssh-keygen -R 192.168.3.45

更新固件（必须）：
sudo apt update && sudo apt full-upgrade -y
sudo apt install rpi-update -y
sudo rpi-update

重启：
sudo reboot

关机：
sudo poweroff
sudo shutdown -h now
