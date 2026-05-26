# Docker部署实操笔记

Docker部署实操笔记
使用Docker部署Redis详细步骤
前提条件
确保你的服务器 / 本地环境已安装 Docker 和 Docker Compose（可选，用于更便捷的部署）。
检查 Docker 是否安装：
bash
运行

docker --version
若未安装，以 Linux（Ubuntu/Debian）为例，快速安装 Docker：
bash
运行

# 更新软件源sudo apt update
# 安装依赖sudo apt install -y apt-transport-https ca-certificates curl software-properties-common
# 添加 Docker GPG 密钥curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
# 添加 Docker 软件源echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
# 安装 Dockersudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io
# 启动并设置开机自启sudo systemctl start dockersudo systemctl enable docker# 验证安装sudo docker run --rm hello-world

步骤 1：拉取 Redis 官方镜像
推荐拉取指定版本（如 7.2，避免最新版可能的兼容性问题），而非 latest：
bash
运行

# 查看可用的 Redis 镜像版本docker search redis --filter=is-official=true
# 拉取 7.2 版本镜像（替换为你想要的版本）docker pull redis:7.2
# 验证镜像是否拉取成功docker images | grep redis
步骤 2：方式 1 - 快速测试部署（无持久化，仅用于测试）
适合临时测试，容器删除后数据会丢失：
bash
运行

# 启动 Redis 容器docker run -d \--name redis-test \          # 容器名称-p 6379:6379 \               # 端口映射（主机端口:容器端口）
  redis:7.2                    # 使用的镜像
步骤 3：方式 2 - 生产级部署（带持久化 + 自定义配置）
这是推荐的正式环境部署方式，数据持久化到主机，且可自定义 Redis 配置：
3.1 创建本地目录（用于挂载配置和数据）
bash
运行

# 创建配置目录和数据目录mkdir -p /opt/redis/{conf,data}# 赋予目录权限（避免容器读写权限问题）chmod -R 777 /opt/redis
3.2 编写自定义 Redis 配置文件
在 /opt/redis/conf 目录下创建 redis.conf，添加核心配置（根据需求调整）：
bash
运行

# 编辑配置文件vim /opt/redis/conf/redis.conf
粘贴以下基础配置（关键配置已标注注释）：
conf

# 绑定所有IP（允许外部访问，生产环境建议指定具体IP）
bind 0.0.0.0
# 保护模式关闭（否则仅允许本地访问）
protected-mode no
# 端口（需和容器映射端口一致）
port 6379
# 设置密码（必填，生产环境务必设置复杂密码）
requirepass your_strong_password
# 持久化方式：RDB（定时快照）+ AOF（追加日志）
# RDB 配置
save 900 1       # 900秒内至少1个键被修改则快照
save 300 10      # 300秒内至少10个键被修改则快照
save 60 10000    # 60秒内至少10000个键被修改则快照
rdbcompression yes  # 压缩RDB文件
rdbchecksum yes     # 校验RDB文件
dbfilename dump.rdb # RDB文件名
dir /data           # 数据存储目录（对应容器内路径）
# AOF 配置
appendonly yes              # 开启AOF
appendfilename "appendonly.aof"
appendfsync everysec        # 每秒同步一次（平衡性能和数据安全）
auto-aof-rewrite-percentage 100  # AOF文件增长100%时重写
auto-aof-rewrite-min-size 64mb   # 重写最小文件大小
# 最大内存限制（根据服务器配置调整）
maxmemory 1gb
maxmemory-policy allkeys-lru  # 内存满时淘汰策略
3.3 启动生产级 Redis 容器
bash
运行

docker run -d \--name redis-prod \          # 容器名称--restart always \           # 开机自启/容器异常退出时重启-p 6379:6379 \               # 端口映射-v /opt/redis/conf/redis.conf:/etc/redis/redis.conf \  # 挂载配置文件-v /opt/redis/data:/data \   # 挂载数据目录（持久化）-e TZ=Asia/Shanghai \        # 设置时区
  redis:7.2 \                  # 使用的镜像
  redis-server /etc/redis/redis.conf  # 指定启动时加载的配置文件
步骤 4：验证 Redis 部署是否成功
bash
运行

# 1. 查看容器状态（正常应为 Up）docker ps | grep redis-prod

# 2. 进入 Redis 容器并连接客户端docker exec -it redis-prod redis-cli

# 3. 验证密码和连接（替换为你设置的密码）127.0.0.1:6379> AUTH your_strong_password
# 返回 OK 表示认证成功# 4. 测试数据写入127.0.0.1:6379> SET test_key "docker_redis_test"127.0.0.1:6379> GET test_key
# 返回 "docker_redis_test" 表示正常# 5. 退出客户端127.0.0.1:6379> exit
步骤 5：Redis 容器常用运维操作
bash
运行

# 重启容器docker restart redis-prod

# 停止容器docker stop redis-prod

# 查看容器日志（排查问题）docker logs -f redis-prod

# 删除容器（需先停止）docker stop redis-prod && docker rm redis-prod

# 升级 Redis 版本（先备份数据，再删除旧容器，拉取新镜像后重新启动）
