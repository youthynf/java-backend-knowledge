# 树莓派 Raspberry Pi OS（原生 Debian）常用指令大全

树莓派 Raspberry Pi OS（原生 Debian）常用指令大全
按高频场景分类，直接复制可用，覆盖日常运维、系统、网络、文件、硬件等
一、系统基础
查看系统版本

cat /etc/os-release
查看内核

uname -a
重启

sudo reboot
关机

sudo shutdown -h now
# 或sudo poweroff
打开树莓派配置工具（最常用）

sudo raspi-config
更新系统软件源 & 升级包

sudo apt update && sudo apt upgrade -y
清理无用包

sudo apt autoremove -ysudo apt clean
二、文件与目录操作
进入目录

cd 目录路径
cd .. # 上级cd ~ # 家目录
列出文件

lsls -l # 详细ls -a # 显示隐藏
创建文件夹

mkdir 文件夹名
创建 / 修改文件

touch 文件名
nano 文件名 # 编辑
复制

cp 源 目标
cp -r 文件夹 目标 # 递归
移动 / 重命名

mv 源 目标
删除

rm 文件
rm -rf 文件夹 # 强制递归删除（慎用）
查看文件内容

cat 文件名
less 文件名 # 分页tail -f 日志文件 # 实时查看
三、用户与权限
切换 root

sudo -i
修改文件权限

chmod 755 文件
修改归属

sudo chown 用户名:组 文件
添加新用户

sudo adduser 用户名
给用户加 sudo 权限

sudo usermod -aG sudo 用户名
四、网络与远程
查看 IP

ifconfig# 或ip a
测试网络

ping www.baidu.com
开启 / 关闭 SSH

sudo systemctl enable sshsudo systemctl start ssh
查看 WiFi

iwconfig
查看端口占用

sudo netstat -tulpn
五、进程与资源
看 CPU / 内存

tophtop # 更友好（需 sudo apt install htop）
查看进程

ps -aux
杀进程

kill PID
kill -9 PID # 强制
查看磁盘空间

df -h
看目录大小

du -sh 目录
六、软件安装与卸载
安装

sudo apt install 软件名 -y
卸载

sudo apt remove 软件名
搜索软件

apt search 关键词
七、服务管理（systemd）
查看服务状态

systemctl status 服务名
启动 / 停止 / 重启

sudo systemctl start 服务名
sudo systemctl stop 服务名
sudo systemctl restart 服务名
开机自启 / 关闭

sudo systemctl enable 服务名
sudo systemctl disable 服务名
八、树莓派硬件专用
查看 CPU 温度

vcgencmd measure_temp
查看 CPU 频率

vcgencmd measure_clock arm
查看电压

vcgencmd measure_volts
扩容根分区（raspi-config 里也能做）

sudo raspi-config
# 选择 Advanced Options → Expand Filesystem
九、备份与镜像
备份 SD 卡（Linux/macOS 下，树莓派本机也可）

sudo dd if=/dev/mmcblk0 of=backup.img bs=4M status=progress
压缩备份

sudo dd if=/dev/mmcblk0 | gzip > backup.img.gz
十、Git / 传输（常用）
Git 拉取代码

git clone 仓库地址
传输文件（本机→树莓派）

scp 本地文件 pi@树莓派IP:/目标路径
十一、查看磁盘、分区、挂载信息
查看所有磁盘 / U 盘 / SSD 设备

lsblk
查看磁盘详细信息（型号、大小、接口）

sudo fdisk -l
查看当前挂载点与使用情况

df -h
只看物理磁盘（排除内存盘、虚拟盘）

df -h | grep -E '/dev/mmcblk|/dev/sd|/dev/nvme'

十二、磁盘健康检测（SSD / 机械硬盘必备）
先安装工具

sudo apt install smartmontools -y
查看磁盘是否支持 SMART

sudo smartctl -i /dev/sda
查看磁盘整体健康状态

sudo smartctl -H /dev/sda
查看完整 SMART 信息（温度、通电时间、坏块、寿命等）

sudo smartctl -a /dev/sda

树莓派常见盘：
SD 卡：/dev/mmcblk0
USB 硬盘 / SSD：/dev/sda、/dev/sdb

十三、挂载 / 卸载磁盘
临时挂载

sudo mount /dev/sda1 /mnt/usb
卸载

sudo umount /mnt/usb
查看磁盘 UUID（用于设置开机自动挂载）

blkid

十四、文件系统检查与修复
检查并修复文件系统

sudo fsck /dev/sda1

注意：不能在挂载状态检查根分区，要在树莓派配置里进修复模式，或卸载后检查。

十五、磁盘 / SSD 速度测试
测试磁盘写入速度

sudo dd if=/dev/zero of=/tmp/test bs=1G count=1 oflag=direct
测试读取速度

sudo dd if=/tmp/test of=/dev/null bs=1G count=1 iflag=direct

十六、查看磁盘温度
USB 硬盘 / SSD 温度

sudo smartctl -A /dev/sda | grep Temperature
SD 卡 / EMMC 温度

vcgencmd measure_temp

十七、磁盘空间深度排查
查看根目录最大文件 / 文件夹

sudo du -sh /* | sort -rh | head -10
查看当前目录大小

du -sh
