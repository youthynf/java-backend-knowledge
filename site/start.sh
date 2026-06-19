#!/bin/bash
# 启动 Java 知识库静态网站
# 使用方法: ./start.sh [后台运行: -d]

cd "$(dirname "$0")"

if [ "$1" = "-d" ]; then
    # 后台运行
    nohup node server.js > /tmp/java-knowledge-site.log 2>&1 &
    echo $! > /tmp/java-knowledge-site.pid
    echo "✅ 网站已在后台启动 (PID: $(cat /tmp/java-knowledge-site.pid))"
    echo "🌐 访问地址: http://localhost:3888"
    echo "📋 日志文件: /tmp/java-knowledge-site.log"
    echo "🛑 停止命令: kill $(cat /tmp/java-knowledge-site.pid)"
else
    # 前台运行
    node server.js
fi
