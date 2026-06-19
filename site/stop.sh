#!/bin/bash
# 停止 Java 知识库静态网站

if [ -f /tmp/java-knowledge-site.pid ]; then
    PID=$(cat /tmp/java-knowledge-site.pid)
    if kill -0 $PID 2>/dev/null; then
        kill $PID
        echo "✅ 已停止网站 (PID: $PID)"
    else
        echo "⚠️ 进程不存在 (PID: $PID)"
    fi
    rm -f /tmp/java-knowledge-site.pid
else
    echo "⚠️ 未找到 PID 文件，尝试通过端口查找..."
    PID=$(lsof -t -i:3888 2>/dev/null)
    if [ -n "$PID" ]; then
        kill $PID
        echo "✅ 已停止网站 (PID: $PID)"
    else
        echo "⚠️ 端口 3888 无进程运行"
    fi
fi
